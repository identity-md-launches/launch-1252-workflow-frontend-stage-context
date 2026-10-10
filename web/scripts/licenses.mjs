import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './shared.mjs';
const lock = JSON.parse(readFileSync(resolve(root, 'web/package-lock.json'), 'utf8'));
let output =
  'Tithe frontend — third-party notices\n\nThe application bundles code and font files from the following production dependencies.\nDependency versions are pinned in web/package-lock.json.\n\n';
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || info.optional || !existsSync(resolve(root, 'web', path))) continue;
  const dir = resolve(root, 'web', path);
  const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
  const licenses = readdirSync(dir).filter((name) =>
    /^(LICENSE|LICENCE|COPYING|OFL)(\.|$)/i.test(name),
  );
  output += `\n${'='.repeat(72)}\n${pkg.name} ${pkg.version} — ${pkg.license ?? 'see license'}\n${'='.repeat(72)}\n`;
  if (!licenses.length) throw Error(`License not found for ${pkg.name}`);
  for (const license of licenses) output += readFileSync(resolve(dir, license), 'utf8') + '\n';
}
output = output.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n';
writeFileSync(resolve(root, 'web/public/THIRD-PARTY.txt'), output);
console.log(`Wrote ${Buffer.byteLength(output)} bytes of production dependency notices.`);
