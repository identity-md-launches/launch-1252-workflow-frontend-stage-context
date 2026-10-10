import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root, read, abiHash, sha256, files, deploymentBase } from './shared.mjs';
const handoff = read('web/deployment.handoff.json');
const network = read('web/network.handoff.json');
// The source commit is immutable. Never regenerate ABIs from a different HEAD.
execFileSync('git', ['cat-file', '-e', `${handoff.sourceCommit}^{commit}`], { cwd: root });
const dev = process.argv.includes('--dev');
const out = resolve(root, dev ? 'web/generated' : 'dist');
mkdirSync(resolve(out, 'abi'), { recursive: true });
for (const c of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(c.name)) throw Error('Unsafe contract name');
  const raw = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${c.name}.json`], {
    cwd: root,
  });
  const abi = JSON.parse(raw);
  if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash)
    throw Error(`ABI hash mismatch: ${c.name}`);
  if (abiHash(read(`docs/abi/${c.name}.json`)) !== c.abiHash)
    throw Error(`Working ABI drift: ${c.name}`);
  writeFileSync(resolve(out, `abi/${c.name}.json`), raw);
}
for (const path of files(resolve(root, 'web/public'))) {
  mkdirSync(resolve(out, path, '..'), { recursive: true });
  cpSync(resolve(root, 'web/public', path), resolve(out, path));
}
const config = deploymentBase(handoff, network);
config.assets = files(out)
  .filter((p) => p !== 'imd-deployment.json')
  .map((path) => ({ path, sha256: sha256(readFileSync(resolve(out, path))) }));
writeFileSync(resolve(out, 'imd-deployment.json'), JSON.stringify(config, null, 2) + '\n');
// Only legacy scalar terms live in source. All addresses/ABIs/chains stay in the runtime manifest.
const legacy = {
  fee: handoff.manifest.pool.fee,
  tickSpacing: handoff.manifest.pool.tickSpacing,
  nativePair: /^0x0{40}$/.test(handoff.manifest.pool.pairedCurrency),
};
const legacyPath = resolve(root, 'web/src/legacy-pool.json');
if (
  existsSync(legacyPath) &&
  JSON.stringify(JSON.parse(readFileSync(legacyPath))) !== JSON.stringify(legacy)
)
  throw Error('Legacy pool terms differ from handoff');
if (!existsSync(legacyPath)) writeFileSync(legacyPath, JSON.stringify(legacy, null, 2) + '\n');
console.log(
  `Verified ${handoff.contracts.length} pinned ABIs; exported ${config.assets.length} assets to ${dev ? 'web/generated' : 'dist'}.`,
);
