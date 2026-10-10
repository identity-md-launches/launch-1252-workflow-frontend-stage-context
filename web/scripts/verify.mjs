import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, read, files, sha256, abiHash, deploymentBase } from './shared.mjs';
const m = read('dist/imd-deployment.json');
const h = read('web/deployment.handoff.json'),
  n = read('web/network.handoff.json');
const { assets, ...base } = m;
assert.deepEqual(base, deploymentBase(h, n));
const actual = files(resolve(root, 'dist')).filter((p) => p !== 'imd-deployment.json');
assert.deepEqual(assets.map((a) => a.path).sort(), actual.sort());
assert(actual.includes('index.html'));
assert(actual.length <= 128);
let total = 0;
for (const a of assets) {
  assert(
    /^[A-Za-z0-9_./-]+$/.test(a.path) &&
      !a.path.startsWith('/') &&
      !a.path.split('/').includes('..'),
  );
  assert(/^[a-f0-9]{64}$/.test(a.sha256));
  const f = resolve(root, 'dist', a.path);
  assert.equal(sha256(readFileSync(f)), a.sha256);
  assert(statSync(f).size <= 8388608);
  total += statSync(f).size;
}
for (const c of m.contracts) assert.equal(abiHash(read(`dist/${c.abiPath}`)), c.abiHash);
assert(total < 24 * 1024 * 1024);
assert(readFileSync(resolve(root, 'dist/index.html'), 'utf8').includes('./assets/'));
console.log(
  JSON.stringify(
    {
      result: 'PASS',
      assets: actual.length,
      exportBytes: total,
      contracts: m.contracts.map((c) => ({ name: c.name, abiHash: c.abiHash })),
      configuration: 'Exact handoff / network match; no extra top-level keys',
    },
    null,
    2,
  ),
);
