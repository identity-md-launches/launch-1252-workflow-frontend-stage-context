import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from 'viem';
import { decodeAbiParameters, parseAbiParameters, zeroAddress, type Address, type Abi } from 'viem';
import {
  amountFrom,
  seatFrom,
  slippageFrom,
  minimumOutput,
  swapPayload,
  poolTuple,
  poolId,
  errorText,
  MAX_SWAP,
} from '../src/domain';
import { hashAbi, demoPool, relativePath, type Deployment } from '../src/config';
import { switchNetwork, type Provider } from '../src/wallet';
const handoff = JSON.parse(
  readFileSync(new URL('../deployment.handoff.json', import.meta.url), 'utf8'),
);
const network = JSON.parse(
  readFileSync(new URL('../network.handoff.json', import.meta.url), 'utf8'),
);
const d = {
  ...handoff,
  ...network,
  contracts: handoff.contracts.map((c: any) => ({
    ...c,
    abi: JSON.parse(
      readFileSync(new URL(`../../docs/abi/${c.name}.json`, import.meta.url), 'utf8'),
    ),
  })),
} as Deployment;
const key = demoPool(d);
test('pinned implementation-derived ABI canonical hashes match handoff', () => {
  for (const c of d.contracts) assert.equal(hashAbi(c.abi as Abi), c.abiHash);
});
test('legacy key preserves native ordering, exact hook, fee and spacing', () => {
  assert.equal(key.currency0, zeroAddress);
  assert.equal(key.currency1, d.contracts[0].address);
  assert.equal(key.hooks, d.contracts[1].address);
  assert.equal(key.fee, handoff.manifest.pool.fee);
  assert.equal(key.tickSpacing, handoff.manifest.pool.tickSpacing);
  assert.match(poolId(key), /^0x[0-9a-f]{64}$/);
});
test('explicit handoff poolKey wins over legacy fallback without mutation', () => {
  const override = { ...key, currency0: key.currency1, currency1: key.currency0, fee: 3000 };
  assert.equal(demoPool({ ...d, poolKey: override }), override);
});
test('amount parsing rejects rounding, exponent, negative, zero and overflow', () => {
  assert.equal(amountFrom('1.000001', 6), 1000001n);
  assert.equal(amountFrom('0.000000000000000001', 18), 1n);
  for (const s of ['0', '-1', '1e18', '1.0000001', ' 1', 'NaN', String(MAX_SWAP + 1n)])
    assert.throws(() => amountFrom(s, 6));
});
test('seat supports zero and full uint256 without Number precision loss', () => {
  assert.equal(seatFrom('0'), 0n);
  assert.equal(seatFrom(String((1n << 256n) - 1n)), (1n << 256n) - 1n);
  for (const s of ['-1', '1.2', '', '01', String(1n << 256n)]) assert.throws(() => seatFrom(s));
});
test('slippage uses integer rounding down and stays bounded', () => {
  assert.equal(slippageFrom('0.5'), 50);
  assert.equal(minimumOutput(1001n, 50), 995n);
  for (const s of ['0', '5.01', '-1', '0.001', 'NaN']) assert.throws(() => slippageFrom(s));
});
for (const extended of [false, true])
  for (const input of [key.currency0, key.currency1])
    test(`router encoding roundtrip: ${extended ? 'extended' : 'standard'}, ${input === zeroAddress ? 'buy' : 'sell'}`, () => {
      const p = swapPayload(key, input, 1000n, 987n, extended);
      assert.equal(p.commands, '0x10');
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters('bytes,bytes[]'),
        p.inputs[0],
      );
      assert.equal(actions, '0x060c0f');
      const [trade] = decodeAbiParameters(
        parseAbiParameters(
          `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? 'uint256 minHopPriceX36,' : ''}bytes hookData)`,
        ),
        params[0],
      ) as any;
      assert.equal(trade.poolKey.hooks.toLowerCase(), key.hooks.toLowerCase());
      assert.equal(trade.zeroForOne, input === key.currency0);
      assert.equal(trade.amountIn, 1000n);
      assert.equal(trade.amountOutMinimum, 987n);
      assert.equal(trade.hookData, '0x');
      if (extended) assert.equal(trade.minHopPriceX36, 0n);
      const [currency, amount] = decodeAbiParameters(
        parseAbiParameters('address,uint256'),
        params[1],
      );
      assert.equal(currency.toLowerCase(), input.toLowerCase());
      assert.equal(amount, 1000n);
      const [out, min] = decodeAbiParameters(parseAbiParameters('address,uint256'), params[2]);
      assert.equal(
        out.toLowerCase(),
        (input === key.currency0 ? key.currency1 : key.currency0).toLowerCase(),
      );
      assert.equal(min, 987n);
    });
test('swap cannot remove minimum received guard or spend foreign currency', () => {
  assert.throws(() => swapPayload(key, key.currency0, 1n, 0n, false));
  assert.throws(() => swapPayload(key, d.network.uniswapV4.permit2, 1n, 1n, false));
});
test('untrusted ABI path cannot escape the export', () => {
  for (const p of ['../x', 'https://x', '/x', 'abi/../../x', 'x?'])
    assert.equal(relativePath(p), false);
  assert.equal(relativePath('abi/TitheHook.json'), true);
});
test('wallet unknown-chain recovery offers exact network block then switches again', async () => {
  const calls: any[] = [];
  let first = true;
  const p = {
    request: async (arg: any) => {
      calls.push(arg);
      if (arg.method === 'wallet_switchEthereumChain' && first) {
        first = false;
        throw { code: 4902 };
      }
      return null;
    },
  } as unknown as Provider;
  await switchNetwork(p, d);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'],
  );
  assert.deepEqual(calls[1].params, [network.walletAddChain]);
});
test('rejected switch never triggers add-chain', async () => {
  const calls: any[] = [];
  const p = {
    request: async (a: any) => {
      calls.push(a);
      throw { code: 4001 };
    },
  } as unknown as Provider;
  await assert.rejects(() => switchNetwork(p, d));
  assert.equal(calls.length, 1);
  assert.match(errorText({ code: 4001 }), /declined/);
});

test('quoter bubbles a hook error outside its own ABI without leaking selectors', () => {
  const hookAbi = d.contracts.find((c) => c.name === 'TitheHook')!.abi!;
  const reverted = new ContractFunctionRevertedError({
    abi: [],
    functionName: 'quoteExactInputSingle',
    data: encodeErrorResult({ abi: hookAbi, errorName: 'SwapNotFilled' }),
  });
  assert.match(
    errorText(new BaseError('Request failed', { cause: reverted }), hookAbi),
    /could not fill this swap/,
  );
});
