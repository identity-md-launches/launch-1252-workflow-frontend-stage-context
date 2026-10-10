import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, type Abi } from 'viem';
import { chainFor, demoPool, protocolAbi, type Deployment } from '../src/config';
import { readSnapshot } from '../src/chain';
const root = fileURLToPath(new URL('../../', import.meta.url));
const d = JSON.parse(readFileSync(resolve(root, 'dist/imd-deployment.json'), 'utf8')) as Deployment;
for (const c of d.contracts)
  c.abi = JSON.parse(readFileSync(resolve(root, 'dist', c.abiPath), 'utf8')) as Abi;
const report: any = {
  checkedAt: new Date().toISOString(),
  scope: 'Read-only public RPC checks; no signing or broadcasting',
  results: [],
};
for (const url of d.network.rpcUrls) {
  const client = createPublicClient({
    chain: chainFor(d),
    transport: http(url, { timeout: 12000, retryCount: 0 }),
  });
  try {
    const chainId = await client.getChainId();
    const contracts = await Promise.all(
      d.contracts.map(async (c) => {
        const code = await client.getBytecode({ address: c.address });
        return { name: c.name, address: c.address, codeBytes: code ? (code.length - 2) / 2 : 0 };
      }),
    );
    const result: any = { url, chainId, contracts };
    if (chainId === d.chainId && contracts.every((c) => c.codeBytes > 0)) {
      try {
        result.snapshot = await readSnapshot(client as any, d, undefined);
        const quote = await client.simulateContract({
          address: d.network.uniswapV4.quoter,
          abi: protocolAbi.quoter,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              poolKey: demoPool(d),
              zeroForOne: true,
              exactAmount: 1000000000000000n,
              hookData: '0x',
            },
          ],
        });
        result.readOnlyQuote = {
          inputWei: '1000000000000000',
          amountOut: quote.result[0],
          gasEstimate: quote.result[1],
        };
      } catch (e) {
        result.readError = (e as Error).message.slice(0, 500);
      }
    }
    report.results.push(result);
  } catch (e) {
    report.results.push({ url, error: (e as Error).message.slice(0, 500) });
  }
}
const serialized =
  JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
writeFileSync(resolve(root, 'docs/validation/rpc-check.json'), serialized);
console.log(serialized);
