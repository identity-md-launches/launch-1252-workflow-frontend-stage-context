import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, read } from './shared.mjs';
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const dirty = git(['status', '--porcelain', '--untracked-files=all']);
if (dirty.trim())
  throw Error('Commit the final scoped deliverable before measuring its Git bundle.');
const handoff = read('web/deployment.handoff.json');
const changed = git(['diff', '--name-only', handoff.sourceCommit, 'HEAD'])
  .trim()
  .split('\n')
  .filter(Boolean);
for (const path of changed) {
  if (!/^(web|dist|docs)\//.test(path)) throw Error(`Out-of-scope change: ${path}`);
  if (path.split('/').some((part) => part.startsWith('.')) && path !== 'web/.gitignore')
    throw Error(`Unbudgeted dotfile: ${path}`);
}
const staged = git(['ls-files', '-s']).trim().split('\n');
for (const line of staged) {
  if (line.startsWith('160000 ')) throw Error('Git submodule found.');
  const path = line.split('\t')[1];
  if (
    /(^|\/)(node_modules|\.cache|\.npm|\.vite|playwright-report|test-results)(\/|$)|\.(tgz|zip)$/.test(
      path,
    )
  )
    throw Error(`Dependency/cache archive tracked: ${path}`);
}
mkdirSync(resolve(root, 'test/scratch'), { recursive: true });
const bundle = resolve(root, 'test/scratch/submission.bundle');
execFileSync('git', ['bundle', 'create', bundle, '--all'], { cwd: root });
const bundleBytes = statSync(bundle).size;
if (bundleBytes > 8388608) throw Error(`Submission bundle exceeds 8 MiB: ${bundleBytes}`);
console.log(
  JSON.stringify(
    {
      result: 'PASS',
      commit: git(['rev-parse', 'HEAD']).trim(),
      changedFiles: changed.length,
      allowedPathsOnly: true,
      noSubmodulesOrDependencyCaches: true,
      bundleBytes,
      limitBytes: 8388608,
    },
    null,
    2,
  ),
);
