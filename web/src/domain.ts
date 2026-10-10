import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  formatUnits,
  parseUnits,
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Address,
  type Abi,
  type Hex,
} from 'viem';
import { protocolAbi, type PoolKey } from './config';
export const poolTuple =
  '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export function poolId(key: PoolKey) {
  return keccak256(encodeAbiParameters(parseAbiParameters(`${poolTuple} key`), [key]));
}
export const MAX_SWAP = (1n << 127n) - 1n;
export function amountFrom(text: string, decimals: number) {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text) || (text.split('.')[1]?.length ?? 0) > decimals)
    throw Error(`Enter a positive amount with no more than ${decimals} decimal places.`);
  const value = parseUnits(text, decimals);
  if (value <= 0n || value > MAX_SWAP)
    throw Error('Enter an amount greater than zero and within the pool’s supported range.');
  return value;
}
export function seatFrom(text: string) {
  if (!/^(0|[1-9]\d*)$/.test(text) || BigInt(text) >= 1n << 256n)
    throw Error('Enter a whole seat number from 0 to the uint256 maximum.');
  return BigInt(text);
}
export function slippageFrom(text: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw Error('Use a slippage tolerance between 0.01% and 5%, with up to two decimals.');
  const bps = Math.round(Number(text) * 100);
  if (bps < 1 || bps > 500) throw Error('Choose a slippage tolerance between 0.01% and 5%.');
  return bps;
}
export const minimumOutput = (out: bigint, bps: number) => (out * BigInt(10000 - bps)) / 10000n;
export function displayAmount(value: bigint | undefined, decimals = 18, maxFraction = 6): string {
  if (value === undefined) return '—';
  if (value === 0n) return '0';
  const [whole, frac = ''] = formatUnits(value, decimals).split('.');
  if (whole === '0' && Number(frac.slice(0, maxFraction)) === 0)
    return `< ${formatUnits(10n ** BigInt(Math.max(0, decimals - maxFraction)), decimals)}`;
  return `${BigInt(whole).toLocaleString('en-US')}${frac.slice(0, maxFraction).replace(/0+$/, '') ? '.' + frac.slice(0, maxFraction).replace(/0+$/, '') : ''}`;
}
export function swapPayload(
  key: PoolKey,
  input: Address,
  amount: bigint,
  min: bigint,
  extended: boolean,
) {
  if (min <= 0n || amount <= 0n || amount > MAX_SWAP || min >= 1n << 128n)
    throw Error('The swap bounds are invalid. Request a new quote.');
  const zeroForOne = input.toLowerCase() === key.currency0.toLowerCase();
  const output = zeroForOne ? key.currency1 : key.currency0;
  if (!zeroForOne && input.toLowerCase() !== key.currency1.toLowerCase())
    throw Error('Input currency is outside this pool.');
  const type = `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? 'uint256 minHopPriceX36,' : ''}bytes hookData) params`;
  const tuple = {
    poolKey: key,
    zeroForOne,
    amountIn: amount,
    amountOutMinimum: min,
    ...(extended ? { minHopPriceX36: 0n } : {}),
    hookData: '0x',
  };
  const params = [
    encodeAbiParameters(parseAbiParameters(type), [tuple]),
    encodeAbiParameters(parseAbiParameters('address currency,uint256 amount'), [input, amount]),
    encodeAbiParameters(parseAbiParameters('address currency,uint256 amount'), [output, min]),
  ];
  return {
    commands: '0x10' as Hex,
    inputs: [
      encodeAbiParameters(parseAbiParameters('bytes actions,bytes[] params'), ['0x060c0f', params]),
    ],
  };
}
const messages: Record<string, string> = {
  NothingToClaim: 'This seat has no tithe in that currency. Refresh its balances.',
  InvalidSeatOwner: 'The seat has no valid recipient. Its credit stays in the hook.',
  ERC721NonexistentToken: 'This seat does not exist. Check the seat number.',
  RedeemPendingFirst: 'Redeem pending backing in the advanced controls, then claim again.',
  AlreadyConfigured:
    'This pool already has an immutable seat binding. Choose a different pool key.',
  PoolNotConfigured: 'This pool is not initialized. Swaps are unavailable.',
  SwapNotFilled: 'The pool could not fill this swap. Try a smaller amount or wait for liquidity.',
  V4TooLittleReceived: 'The price moved beyond your minimum received. Request a new quote.',
  V4TooMuchRequested: 'The pool requested more input than permitted. Request a new quote.',
  InsufficientAllowance:
    'The spending allowance is too low. Refresh and complete the approval step.',
  AllowanceExpired: 'The router allowance expired. Approve the router again.',
  TransactionDeadlinePassed: 'This transaction expired. Request a new quote.',
  NativeTransferFailed:
    'The ETH transfer failed. The recipient may reject ETH; the credit is preserved.',
  InvalidTitheBps: 'The tithe must be between 1 and 9,999 basis points.',
};
export function errorText(err: unknown, abi: Abi = []): string {
  const e = err as {
    code?: number;
    message?: string;
    shortMessage?: string;
    cause?: { code?: number };
    data?: Hex;
  };
  if (
    e.code === 4001 ||
    e.cause?.code === 4001 ||
    /user rejected|user denied/i.test(e.message ?? '')
  )
    return 'Request declined in your wallet. You can try again.';
  if (/insufficient funds/i.test(e.message ?? ''))
    return 'Your wallet needs enough ETH for the transaction and gas.';
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (x) => x instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (reverted instanceof ContractFunctionRevertedError) {
      let decoded = reverted.data;
      try {
        if (!decoded && reverted.raw)
          decoded = decodeErrorResult({
            abi: [...abi, ...protocolAbi.router, ...protocolAbi.permit2],
            data: reverted.raw,
          });
        if (decoded?.errorName === 'ExecutionFailed' && decoded.args?.[1])
          decoded = decodeErrorResult({
            abi: [...abi, ...protocolAbi.router, ...protocolAbi.permit2],
            data: decoded.args[1] as Hex,
          });
      } catch {
        /* Unknown reverts still receive a readable, non-selector fallback. */
      }
      if (decoded?.errorName)
        return (
          messages[decoded.errorName] ??
          `The contract rejected this action (${decoded.errorName}). Refresh state and try again.`
        );
      return 'The contract rejected this action. Refresh the quote or balances and try again.';
    }
  }
  if (
    /failed to fetch|fetch failed|HTTP request failed|timed out|timeout|network request/i.test(
      e.message ?? '',
    )
  )
    return 'The network did not respond. Refresh to retry the configured RPCs.';
  return (
    e.shortMessage ??
    e.message?.split('\n')[0]?.slice(0, 240) ??
    'The action could not finish. Refresh the data and try again.'
  );
}
