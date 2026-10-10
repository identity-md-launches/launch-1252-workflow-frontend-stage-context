// Test-only deterministic chain and EIP-1193 wallet. Never imported by the app.
import { readFileSync } from 'node:fs';
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
} from 'viem';
import { protocolAbi } from '../src/config.ts';
const d = JSON.parse(
  readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'),
);
const contracts = d.contracts.map((c) => ({
  ...c,
  abi: JSON.parse(readFileSync(new URL(`../../dist/${c.abiPath}`, import.meta.url), 'utf8')),
}));
const hook = contracts.find((c) => c.name === 'TitheHook'),
  token = contracts.find((c) => c.name === 'TitheToken');
// Explicit wallet/beneficiary fixtures, unrelated to the deployment owner.
export const account = '0x1000000000000000000000000000000000000001';
export const owner = '0x2000000000000000000000000000000000000002';
export const nextOwner = '0x3000000000000000000000000000000000000003';
const seatAddress = '0x0000ec93127baa929e58e97dd0095a2bfb38ec1d';
const blockHash = '0x' + 'b'.repeat(64);
export { d, hook, token };
export function makeMock(options = {}) {
  const state = {
    code: true,
    chain: d.chainId,
    failure: '',
    owner,
    accrueEth: 12500000000000000n,
    pendingEth: 2500000000000000n,
    accrueToken: 4275n * 10n ** 18n,
    tokenAllowance: 0n,
    routerAllowance: 0n,
    expiration: 0,
    receiptDelay: 0,
    receiptStatus: '0x1',
    quoteDelay: 0,
    missingOwner: false,
    liquidity: 10000000000000000000n,
    ...options,
  };
  const calls = [],
    sent = [],
    txs = new Map();
  let counter = 0;
  const started = Date.now();
  const blockNumber = () =>
    '0x' + (0x1900000n + BigInt(Math.floor((Date.now() - started) / 500))).toString(16);
  const block = () => ({
    number: blockNumber(),
    hash: blockHash,
    parentHash: blockHash,
    nonce: '0x0000000000000000',
    sha3Uncles: blockHash,
    logsBloom: '0x' + '0'.repeat(512),
    transactionsRoot: blockHash,
    stateRoot: blockHash,
    receiptsRoot: blockHash,
    miner: owner,
    difficulty: '0x0',
    totalDifficulty: '0x0',
    extraData: '0x',
    size: '0x100',
    gasLimit: '0x1c9c380',
    gasUsed: '0x10000',
    timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
    transactions: [],
    uncles: [],
    baseFeePerGas: '0x3b9aca00',
    mixHash: blockHash,
  });
  function abiFor(address) {
    if (address?.toLowerCase() === hook.address.toLowerCase()) return hook.abi;
    if (address?.toLowerCase() === token.address.toLowerCase()) return token.abi;
    if (address?.toLowerCase() === seatAddress.toLowerCase()) return protocolAbi.seat;
    for (const [name, abi] of [
      ['stateView', protocolAbi.state],
      ['quoter', protocolAbi.quoter],
      ['universalRouter', protocolAbi.router],
      ['permit2', protocolAbi.permit2],
    ])
      if (address?.toLowerCase() === d.network.uniswapV4[name].toLowerCase()) return abi;
    throw Error('Unexpected target: ' + address);
  }
  function decode(tx) {
    const abi = abiFor(tx.to);
    return { ...decodeFunctionData({ abi, data: tx.data ?? tx.input }), abi };
  }
  function apply(tx) {
    const { functionName: f, args = [] } = decode(tx);
    if (f === 'claim') {
      if (args[1].toLowerCase() === zeroAddress) {
        state.accrueEth = 0n;
        state.pendingEth = 0n;
      } else state.accrueToken = 0n;
    }
    if (f === 'redeemTithe') state.pendingEth = 0n;
    if (f === 'approve' && tx.to.toLowerCase() === token.address.toLowerCase())
      state.tokenAllowance = args[1];
    if (f === 'approve' && tx.to.toLowerCase() === d.network.uniswapV4.permit2.toLowerCase()) {
      state.routerAllowance = args[2];
      state.expiration = args[3];
    }
    if (f === 'execute') {
      state.accrueEth += 25000000000000n;
      state.routerAllowance = 0n;
    }
  }
  async function handle(body) {
    const { method, params = [] } = body;
    calls.push({ method, params });
    if (state.failure === 'rpc') throw { code: -32000, message: 'Mock RPC unavailable' };
    switch (method) {
      case 'eth_chainId':
        return '0x' + state.chain.toString(16);
      case 'eth_blockNumber':
        return blockNumber();
      case 'eth_getBlockByNumber':
        return block();
      case 'eth_getBlockByHash':
        return block();
      case 'eth_getCode':
        return state.code ? '0x6001600055' : '0x';
      case 'eth_getBalance':
        return '0x' + (5n * 10n ** 18n).toString(16);
      case 'eth_getLogs':
        return [];
      case 'eth_gasPrice':
        return '0x3b9aca00';
      case 'eth_maxPriorityFeePerGas':
        return '0x3b9aca00';
      case 'eth_estimateGas':
        return '0x493e0';
      case 'eth_getTransactionCount':
        return '0x0';
      case 'eth_call': {
        const tx = params[0],
          { abi, functionName: f, args = [] } = decode(tx);
        let result;
        if (
          state.failure === 'simulation' &&
          ['claim', 'redeemTithe', 'execute', 'approve', 'initializePool', 'transfer'].includes(f)
        )
          throw {
            code: 3,
            message: 'execution reverted',
            data: encodeErrorResult({ abi: hook.abi, errorName: 'NothingToClaim' }),
          };
        switch (f) {
          case 'poolManager':
            result = d.network.uniswapV4.poolManager;
            break;
          case 'poolConfig':
            result = state.customPool ? [0n, 0, false] : [1n, 25, true];
            break;
          case 'IMD_SEAT':
            result = seatAddress;
            break;
          case 'defaultSeatId':
            result = 1n;
            break;
          case 'defaultTitheBps':
            result = 25;
            break;
          case 'symbol':
            result = 'TDEMO';
            break;
          case 'name':
            result = 'Tithe Demo';
            break;
          case 'decimals':
            result = 18;
            break;
          case 'getSlot0':
            result = [79228162514264337593543950336n, 0, 0, 12500];
            break;
          case 'getLiquidity':
            result = state.liquidity;
            break;
          case 'ownerOf':
            if (state.missingOwner || args[0] === 999n)
              throw { code: 3, message: 'execution reverted' };
            result = state.owner;
            break;
          case 'titheOf':
          case 'tithe':
          case 'pendingTithe':
          case 'totalTithe':
          case 'totalPending': {
            const currency = args.at(-1).toLowerCase();
            const noCredit = args.length > 1 && args[0] !== 1n;
            const native = currency === zeroAddress;
            result = noCredit
              ? 0n
              : native
                ? f === 'pendingTithe' || f === 'totalPending'
                  ? state.pendingEth
                  : f === 'tithe'
                    ? state.accrueEth - state.pendingEth
                    : state.accrueEth
                : f === 'pendingTithe' || f === 'totalPending'
                  ? 0n
                  : state.accrueToken;
            break;
          }
          case 'balanceOf':
            result = 10000n * 10n ** 18n;
            break;
          case 'allowance':
            result =
              args.length === 2
                ? state.tokenAllowance
                : [state.routerAllowance, state.expiration, 0];
            break;
          case 'quoteExactInputSingle':
            if (state.quoteDelay) await new Promise((r) => setTimeout(r, state.quoteDelay));
            if (state.failure === 'quote')
              throw {
                code: 3,
                message: 'execution reverted',
                data: encodeErrorResult({ abi: hook.abi, errorName: 'SwapNotFilled' }),
              };
            result = [args[0].zeroForOne ? 1000n * 10n ** 18n : 10000000000000000n, 200000n];
            break;
          case 'approve':
            result = tx.to.toLowerCase() === token.address.toLowerCase() ? true : undefined;
            break;
          case 'claim':
            result = args[1].toLowerCase() === zeroAddress ? state.accrueEth : state.accrueToken;
            break;
          case 'redeemTithe':
            result = state.pendingEth;
            break;
          case 'initializePool':
            result = 0;
            break;
          case 'transfer':
            result = true;
            break;
          case 'execute':
            result = undefined;
            break;
          default:
            throw Error('Unhandled contract read: ' + f);
        }
        return encodeFunctionResult({ abi, functionName: f, result });
      }
      case 'eth_sendTransaction': {
        const tx = params[0],
          hash = '0x' + (++counter).toString(16).padStart(64, '0');
        sent.push({ ...tx, decoded: decode(tx), hash });
        txs.set(hash, { tx, at: Date.now(), applied: false });
        return hash;
      }
      case 'eth_getTransactionByHash': {
        const found = txs.get(params[0]);
        if (!found) return null;
        return {
          hash: params[0],
          blockHash,
          blockNumber: blockNumber(),
          transactionIndex: '0x0',
          from: account,
          to: found.tx.to,
          gas: '0x493e0',
          gasPrice: '0x3b9aca00',
          value: found.tx.value ?? '0x0',
          input: found.tx.data,
          nonce: '0x0',
          v: '0x1b',
          r: '0x' + '1'.repeat(64),
          s: '0x' + '2'.repeat(64),
          type: '0x0',
        };
      }
      case 'eth_getTransactionReceipt': {
        const found = txs.get(params[0]);
        if (!found || Date.now() - found.at < state.receiptDelay) return null;
        if (!found.applied && state.receiptStatus === '0x1') {
          apply(found.tx);
          found.applied = true;
        }
        return {
          transactionHash: params[0],
          transactionIndex: '0x0',
          blockHash,
          blockNumber: blockNumber(),
          from: account,
          to: found.tx.to,
          cumulativeGasUsed: '0x493e0',
          gasUsed: '0x493e0',
          contractAddress: null,
          logs: [],
          logsBloom: '0x' + '0'.repeat(512),
          status: state.receiptStatus,
          effectiveGasPrice: '0x3b9aca00',
          type: '0x0',
        };
      }
      default:
        throw Error('Unhandled RPC method: ' + method);
    }
  }
  return { state, calls, sent, handle };
}
export async function attachMock(page, mock, walletOptions = {}) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (d.network.rpcUrls.some((base) => url.startsWith(base)) || url.endsWith('/test-rpc')) {
      const req = route.request().postDataJSON();
      const response = async (body) => {
        try {
          return { jsonrpc: '2.0', id: body.id, result: await mock.handle(body) };
        } catch (e) {
          return {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: e.code ?? -32603,
              message: e.message ?? String(e),
              ...(e.data ? { data: e.data } : {}),
            },
          };
        }
      };
      const body = Array.isArray(req) ? await Promise.all(req.map(response)) : await response(req);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    if (!url.startsWith('http://127.0.0.1:'))
      throw Error('Unexpected external browser request: ' + url);
    return route.continue();
  });
  if (walletOptions.absent) return;
  await page.addInitScript(
    ({ account, chainId, options }) => {
      const listeners = {};
      const state = {
        chain: options.wrongChain ? '0x89' : '0x' + chainId.toString(16),
        account,
        connected: false,
        reject: false,
        rejectConnect: false,
        unknown: !!options.unknownChain,
        requests: [],
      };
      window.__walletTest = state;
      window.__emitWallet = (event, value) => {
        if (event === 'accountsChanged') state.account = value[0];
        if (event === 'chainChanged') state.chain = value;
        (listeners[event] ?? []).forEach((fn) => fn(value));
      };
      window.ethereum = {
        on: (event, fn) => {
          (listeners[event] ??= []).push(fn);
        },
        removeListener: (event, fn) => {
          listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
        },
        request: async (request) => {
          state.requests.push(request);
          if (request.method === 'eth_requestAccounts') {
            if (state.rejectConnect) throw { code: 4001, message: 'User rejected' };
            state.connected = true;
            return [state.account];
          }
          if (request.method === 'eth_accounts') return state.connected ? [state.account] : [];
          if (request.method === 'eth_chainId') return state.chain;
          if (request.method === 'wallet_switchEthereumChain') {
            if (state.unknown) throw { code: 4902, message: 'Unknown chain' };
            state.chain = request.params[0].chainId;
            window.__emitWallet('chainChanged', state.chain);
            return null;
          }
          if (request.method === 'wallet_addEthereumChain') {
            state.unknown = false;
            return null;
          }
          if (request.method === 'eth_sendTransaction' && state.reject)
            throw { code: 4001, message: 'User rejected the request' };
          const response = await fetch('/test-rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...request, id: 1, jsonrpc: '2.0' }),
          });
          const data = await response.json();
          if (data.error) throw data.error;
          return data.result;
        },
      };
    },
    { account, chainId: d.chainId, options: walletOptions },
  );
}
