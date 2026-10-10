import { zeroAddress, type Address } from 'viem';
import { contract, demoPool, protocolAbi, type Deployment, type ReadClient } from './config';
import { poolId } from './domain';
export type AssetBalance = {
  address: Address;
  symbol: string;
  decimals: number;
  accrued: bigint;
  liquid: bigint;
  pending: bigint;
  total: bigint;
  totalPending: bigint;
  wallet?: bigint;
};
export type Snapshot = {
  block: bigint;
  timestamp: number;
  seat: bigint;
  poolSeat: bigint;
  bps: number;
  initialized: boolean;
  liquidity: bigint;
  sqrtPrice: bigint;
  lpFee: number;
  seatContract: Address;
  owner?: Address;
  ownerError?: string;
  assets: AssetBalance[];
};
export async function verifyChain(client: ReadClient, d: Deployment) {
  const id = await client.getChainId();
  if (id !== d.chainId)
    throw Error('The RPC returned the wrong network. Transactions are disabled.');
  const addresses = [
    ...d.contracts.map((c) => c.address),
    ...(Object.values(d.network.uniswapV4).filter((a) => typeof a === 'string') as Address[]),
  ];
  await Promise.all(
    [...new Set(addresses)].map(async (address) => {
      const code = await client.getBytecode({ address });
      if (!code || code === '0x')
        throw Error(`No deployed code at ${address}. Transactions are disabled.`);
    }),
  );
  const hook = contract(d, 'TitheHook');
  const manager = (await client.readContract({
    address: hook.address,
    abi: hook.abi,
    functionName: 'poolManager',
  })) as Address;
  if (manager.toLowerCase() !== d.network.uniswapV4.poolManager.toLowerCase())
    throw Error(
      'The hook’s PoolManager differs from the vetted network. Transactions are disabled.',
    );
}
export async function readSnapshot(
  client: ReadClient,
  d: Deployment,
  seat: bigint | undefined,
  account?: Address,
): Promise<Snapshot> {
  const hook = contract(d, 'TitheHook'),
    token = contract(d, 'TitheToken'),
    key = demoPool(d);
  const block = await client.getBlock();
  const at = { blockNumber: block.number };
  const hr = (name: string, args: unknown[] = []) =>
    client.readContract({ address: hook.address, abi: hook.abi, functionName: name, args, ...at });
  const [config, seatContract, decimals, symbol, slot, liquidity] = await Promise.all([
    hr('poolConfig', [poolId(key)]) as Promise<[bigint, number, boolean]>,
    hr('IMD_SEAT') as Promise<Address>,
    client.readContract({
      address: token.address,
      abi: token.abi,
      functionName: 'decimals',
      ...at,
    }) as Promise<number>,
    client.readContract({
      address: token.address,
      abi: token.abi,
      functionName: 'symbol',
      ...at,
    }) as Promise<string>,
    client.readContract({
      address: d.network.uniswapV4.stateView,
      abi: protocolAbi.state,
      functionName: 'getSlot0',
      args: [poolId(key)],
      ...at,
    }),
    client.readContract({
      address: d.network.uniswapV4.stateView,
      abi: protocolAbi.state,
      functionName: 'getLiquidity',
      args: [poolId(key)],
      ...at,
    }),
  ]);
  const selected = seat ?? (config[2] ? config[0] : ((await hr('defaultSeatId')) as bigint));
  let owner: Address | undefined, ownerError: string | undefined;
  try {
    owner = await client.readContract({
      address: seatContract,
      abi: protocolAbi.seat,
      functionName: 'ownerOf',
      args: [selected],
      ...at,
    });
    if (owner === zeroAddress || owner.toLowerCase() === hook.address.toLowerCase()) {
      owner = undefined;
      ownerError = 'This seat has no valid payout recipient. Claiming is unavailable.';
    }
  } catch {
    ownerError =
      'The seat owner could not be resolved. The seat may not exist, or the read failed. Refresh to retry.';
  }
  const assets = await Promise.all(
    [
      {
        address: zeroAddress,
        symbol: d.network.nativeCurrency.symbol,
        decimals: d.network.nativeCurrency.decimals,
      },
      { address: token.address, symbol, decimals },
    ].map(async (a) => {
      const [accrued, liquid, pending, total, totalPending, wallet] = (await Promise.all([
        hr('titheOf', [selected, a.address]),
        hr('tithe', [selected, a.address]),
        hr('pendingTithe', [selected, a.address]),
        hr('totalTithe', [a.address]),
        hr('totalPending', [a.address]),
        !account
          ? Promise.resolve(undefined)
          : a.address === zeroAddress
            ? client.getBalance({ address: account, ...at })
            : client.readContract({
                address: a.address,
                abi: token.abi,
                functionName: 'balanceOf',
                args: [account],
                ...at,
              }),
      ])) as [bigint, bigint, bigint, bigint, bigint, bigint | undefined];
      return { ...a, accrued, liquid, pending, total, totalPending, wallet };
    }),
  );
  return {
    block: block.number,
    timestamp: Number(block.timestamp),
    seat: selected,
    poolSeat: config[0],
    bps: config[1],
    initialized: config[2],
    liquidity,
    sqrtPrice: slot[0],
    lpFee: slot[3],
    seatContract,
    owner,
    ownerError,
    assets,
  };
}
export type Activity = {
  event: string;
  seat: bigint;
  token?: Address;
  amount?: bigint;
  recipient?: Address;
  deferred?: boolean;
  hash: `0x${string}`;
  block: bigint;
  index: number;
};
export async function readActivity(client: ReadClient, d: Deployment) {
  const block = await client.getBlockNumber({ cacheTime: 0 });
  const hook = contract(d, 'TitheHook');
  const logs = await client.getContractEvents({
    address: hook.address,
    abi: hook.abi,
    fromBlock: block > 1200n ? block - 1200n : 0n,
    toBlock: block,
  });
  const events: Activity[] = [];
  for (const log of logs) {
    const l = log as unknown as {
      eventName: string;
      args: {
        seatId: bigint;
        token?: Address;
        credited?: bigint;
        amount?: bigint;
        received?: bigint;
        recipient?: Address;
        deferred?: boolean;
      };
      transactionHash: `0x${string}`;
      blockNumber: bigint;
      logIndex: number;
    };
    if (!['PoolConfigured', 'TitheAccrued', 'TitheClaimed', 'TitheRedeemed'].includes(l.eventName))
      continue;
    events.push({
      event: l.eventName,
      seat: l.args.seatId,
      token: l.args.token,
      amount: l.args.credited ?? l.args.amount ?? l.args.received,
      recipient: l.args.recipient,
      deferred: l.args.deferred,
      hash: l.transactionHash,
      block: l.blockNumber,
      index: l.logIndex,
    });
  }
  return { events: events.reverse().slice(0, 30), block };
}
