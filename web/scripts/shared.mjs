import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { keccak256, stringToHex } from 'viem';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
export const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
export const abiHash = (abi) => keccak256(stringToHex(canonical(abi))).slice(2);
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export function files(dir, prefix = '') {
  return readdirSync(dir)
    .sort()
    .flatMap((name) =>
      statSync(resolve(dir, name)).isDirectory()
        ? files(resolve(dir, name), `${prefix}${name}/`)
        : [`${prefix}${name}`],
    );
}
export function deploymentBase(handoff, network) {
  const { launchId, chainId, sourceCommit, attestationHash } = handoff;
  return {
    version: 1,
    launchId,
    chainId,
    sourceCommit,
    attestationHash,
    contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
      name,
      address,
      abiHash,
      abiPath: `abi/${name}.json`,
    })),
    ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
    ...(network
      ? {
          network: network.network,
          ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
        }
      : {}),
  };
}
