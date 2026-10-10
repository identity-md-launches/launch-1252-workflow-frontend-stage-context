# Offline dependency delivery review — 2026-10-10

Finding: `01d419de119730318e3db95066b44559b01ee3e5d200c93a096ab847d153001f`.
Reviewed commit: `59ba10d6177253ac01cbc88b40389229377d7b32`.
Environment: Node `v24.21.0`, npm `11.19.0`.

## Decision

**Disputed requirement; reported installation failure reproduced.** No application, build, lockfile, ignore-file, contract or export changes are warranted by this finding. This revision adds only its response and this evidence record.

The current worker assignment's overriding rules say:

> Do not commit node_modules, package-manager caches, registry mirrors or unnecessary dependency archives such as web/vendor/npm/*.tgz.

> Offline service verification does not require a vendored npm registry.

> Keep generated dependency/cache directories out of Git at every nesting level.

They also expressly allow network access and frontend dependency installation. The review's assertion that its rules require committed installed dependencies conflicts with these current instructions. The supplied approved workflow contains no offline source-bootstrap requirement. The existing README accurately states that installation and browser download need network access. That limitation remains; it is not presented as a successful offline install.

## Reproduction

Copied the unchanged `web/` into `test/scratch/offline-rereview/checkout/web`, excluding dependency/cache/generated directories. Asserted that the copy had no `node_modules` and that `test/scratch/offline-rereview/empty-cache` existed and was empty. Ran:

```sh
npm --prefix test/scratch/offline-rereview/checkout/web ci \
  --offline --cache test/scratch/offline-rereview/empty-cache \
  --no-audit --no-fund
```

Exit **1**, with:

```text
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/ws/-/ws-8.21.0.tgz failed: cache mode is 'only-if-cached' but no cached response is available.
```

## Validation of the unchanged deliverable

The isolated copy also included `dist/`, `docs/abi/` and the supplied handoffs. The pinned source commit remained readable from the enclosing repository. Dependencies, npm cache, Chromium and generated test evidence stayed in `test/scratch/`; none is part of the submission.

| Check | Actual result |
| --- | --- |
| Online `npm ci --cache <fresh online-cache> --no-audit --no-fund` in the isolated copy | Exit 0; 52 packages installed with the existing lockfile |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; verified both pinned ABIs and emitted/verified the complete manifest |
| `npm run test` | Exit 0; 15 passed, none failed or skipped |
| Existing `test:browser` scenarios, selected in three scratch-only batches | All 17 distinct scenarios passed; all three final batches exited 0 |
| Unmodified `npm run test:revision` | Exit 0; all 6 regression scenarios passed |
| Browser resources/accessibility | No console errors or failed static resources; zero axe findings at 1440, 960, 768, 390 and 320 CSS pixels |
| `diff -qr dist test/scratch/offline-rereview/checkout/dist` | Exit 0; rebuilt export byte-for-byte identical, including the manifest |
| Supplied handoff/network versus archived build inputs and runtime manifest | Exact match; complete contract set, correct keys and no invented poolKey for this legacy handoff |
| ABI exports versus `git show <sourceCommit>:docs/abi/<Contract>.json` | Exact byte match; canonical Keccak hashes independently checked by build/unit validation |
| Export inventory/SHA-256 hashes | All 12 assets match; 791,144 bytes excluding the self-excluded manifest |
| Tracked dependencies/submodules | No node_modules, cache payloads or Git submodules |

The unchanged Vite build reports its existing advisory for the approximately 557 kB main JavaScript chunk. It remains a successful build, with the complete export below 1 MiB.

## Browser regression details

Chromium `156.0.8078.4` (Playwright build `1248`) exercised the rebuilt export at `/preview/`, with mocked wallet/RPC boundaries. The scenarios cover disconnected and missing-wallet states, unknown-chain switch/add/retry, claims and current beneficiaries, wallet rejection and simulation failure, seat lookup, native buys, both token approval steps and sells, stale/failed quotes, account changes, missing code/RPC recovery, ABI tampering, redemption, keyboard-only claims, reverted and unknown receipts, token transfer and custom-pool initialization. The six revision regressions cover the first phone screen, full uint256 wrapping, repeated seat refresh, both local wallet errors, typography and share metadata.

The first launch failed with `chrome_crashpad_handler: --database is required`; setting `XDG_CONFIG_HOME` and `XDG_CACHE_HOME` to writable scratch directories resolved it. A subsequent full-suite process was terminated with exit 143 before reporting completion and is **not** counted as a pass. To obtain complete results in bounded runs, only the scratch copy of `tests/browser.mjs` was adapted: an incrementing scenario index selected groups of six at the `test(name, fn)` entry point, and each group's report used a separate scratch directory. Scenario bodies, assertions, fixtures and production files were unchanged. The three final reports together contain exactly 17 distinct passing scenarios. An initial concurrent batch had a browser target crash; that batch passed when retried alone. No such adapter was needed for `test:revision`.

The pinned Better Interface guide informed the regression review across its six domains: accessibility (keyboard paths, focus and axe); layout (five widths, first-screen claims, long IDs and doubled root text size); writing (action and recoverable-error wording); typography (loaded local faces and rendered scale); colors (six measured text/background pairs, 5.39–13.78:1); UI (disabled, pending, rejected, confirmed and recovery states). Desktop, mobile, first-screen and long-ID screenshots generated by these runs were viewed. This review found no reason to change the accepted design for the dependency-delivery finding. Native screen readers, physical devices, browser-native zoom, WebKit and Firefox were not tested in this revision. The previous design record is retained without rewriting it.

## Limits

No live-chain transaction, funded wallet interaction, contract deployment, publication or IPFS verification was performed. These checks do not certify live swap or claim execution. The existing design documentation and prior validation remain in place.

A read-only `GIT_NO_LAZY_FETCH=1 git bundle create <scratch>/submission.bundle --all` attempt failed because promisor object `e8af902e5b247940c4b05967b8ddad95e689dcb3` is absent. This is not a successful complete-bundle size measurement. The existing tracked working files total 5,909,448 bytes before this small response/evidence addition; working-file size is not Git-history bundle size. The final publisher must measure the complete bundle in its full repository. No dependency archive was added to work around this limitation.

Staging the evidence with `git add -- docs/validation/offline-delivery-rereview.md` exited 128: `.git/index.lock: Read-only file system`. Therefore no worker commit was made. The response and evidence are present in the working tree for collection. The inherited ignore rules exclude `.imd-responses.json`; a publisher committing that response must explicitly include it. Protected Git configuration and ignore rules were not changed.
