import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  custom,
  keccak256,
  stringToHex,
  isAddress,
  parseAbi,
  zeroAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
} from 'viem';
import legacy from './legacy-pool.json';
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string; abi?: Abi }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}
export const hashAbi = (abi: Abi) => keccak256(stringToHex(canonical(abi))).slice(2);
export function relativePath(path: string) {
  return (
    /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').includes('..')
  );
}
export async function loadDeployment(): Promise<Deployment> {
  const res = await fetch(new URL('imd-deployment.json', document.baseURI), { cache: 'no-cache' });
  if (!res.ok) throw Error('Deployment configuration could not be loaded. Reload this page.');
  const d = (await res.json()) as Deployment;
  if (
    d.version !== 1 ||
    !Number.isSafeInteger(d.chainId) ||
    !d.network ||
    d.network.chainId !== d.chainId ||
    !d.network.rpcUrls.length
  )
    throw Error('Deployment network is missing or inconsistent. Transactions are disabled.');
  if (!d.contracts?.length || new Set(d.contracts.map((c) => c.name)).size !== d.contracts.length)
    throw Error('Invalid contract configuration.');
  for (const c of d.contracts) {
    if (!isAddress(c.address) || !relativePath(c.abiPath) || !/^[a-f0-9]{64}$/.test(c.abiHash))
      throw Error('Invalid deployment binding.');
    const abiRes = await fetch(new URL(c.abiPath, document.baseURI));
    if (!abiRes.ok) throw Error(`Could not load ${c.name} ABI. Reload this page.`);
    c.abi = await abiRes.json();
    if (!Array.isArray(c.abi) || hashAbi(c.abi) !== c.abiHash)
      throw Error(`${c.name} ABI integrity check failed. Transactions are disabled.`);
  }
  if (
    !d.contracts.some((c) => c.name === 'TitheHook') ||
    !d.contracts.some((c) => c.name === 'TitheToken')
  )
    throw Error('Tithe contracts are missing.');
  for (const address of Object.values(d.network.uniswapV4).filter((v) => typeof v === 'string'))
    if (!isAddress(address as string)) throw Error('Invalid protocol address.');
  return d;
}
export function contract(d: Deployment, name: string) {
  const c = d.contracts.find((x) => x.name === name);
  if (!c?.abi) throw Error(`${name} ABI not loaded.`);
  return { ...c, abi: c.abi };
}
export function demoPool(d: Deployment): PoolKey {
  if (d.poolKey) return d.poolKey;
  if (!legacy.nativePair)
    throw Error('This legacy handoff requires explicit pool metadata. Swaps are unavailable.');
  const token = contract(d, 'TitheToken').address;
  return {
    currency0: zeroAddress,
    currency1: token,
    fee: legacy.fee,
    tickSpacing: legacy.tickSpacing,
    hooks: contract(d, 'TitheHook').address,
  };
}
export function chainFor(d: Deployment) {
  return defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: d.network.explorer } },
    testnet: d.network.testnet,
  });
}
export function publicClient(d: Deployment, provider?: EIP1193Provider) {
  return createPublicClient({
    chain: chainFor(d),
    transport: fallback(
      [
        ...d.network.rpcUrls.map((url) => http(url, { timeout: 9000, retryCount: 0 })),
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
    pollingInterval: 4000,
  });
}
export type ReadClient = ReturnType<typeof publicClient>;
export const protocolAbi = {
  seat: parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']),
  state: parseAbi([
    'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
    'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
  ]),
  quoter: parseAbi([
    'struct PoolKey {address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks;}',
    'struct QuoteExactSingleParams {PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData;}',
    'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
  ]),
  router: parseAbi([
    'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
    'error ExecutionFailed(uint256 commandIndex, bytes message)',
    'error TransactionDeadlinePassed()',
    'error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)',
    'error V4TooMuchRequested(uint256 maxAmountInRequested, uint256 amountRequested)',
  ]),
  permit2: parseAbi([
    'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
    'function approve(address token, address spender, uint160 amount, uint48 expiration)',
    'error AllowanceExpired(uint256 deadline)',
    'error InsufficientAllowance(uint256 amount)',
  ]),
  poolEvents: parseAbi([
    'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)',
  ]),
};
