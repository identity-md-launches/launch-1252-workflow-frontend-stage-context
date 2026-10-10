# Tithe frontend validation

**Frontend revision implemented and validated; local Git commit and exact final Git-bundle measurement are blocked by the read-only `.git` mount.** The prepared source, static export, response JSON and evidence remain in the working tree for submission. This is the worker’s own evidence, not an independent audit or the publisher’s verification. No deployment, publication, or funded transaction was performed.

## Deliverable and scope

React, TypeScript, Vite and viem source/configuration/lockfile are in `web/`; the prepared static export and runtime manifest are in repository-root `dist/`. All application ABI files are copied from deployed source commit `7219f0dcf5d2609b75de0912c32668a201e9f617` and verified against the supplied handoff. The supplied contracts, source, dependencies and root build configuration were not edited.

The only changed ignore file is the explicitly budgeted `web/.gitignore`. Root `DESIGN.md` was requested by an acceptance item but prohibited by the overriding path budget. Its complete contents are delivered at [docs/DESIGN.md](DESIGN.md). This is an explicit scope conflict, not a missing design review or an assertion that a root file exists.

This revision changes only the reported frontend defects and their validation/documentation. `.imd-responses.json` is the assignment's explicit root-file exception and answers all eight finding IDs. No contract or root build configuration changed, and no dependency/cache payload was added. The existing `web/.gitignore` did not need revision.

No missing deployment value was invented. The demo uses the existing seat #1 binding read from the hook. No owner/admin settings exist. The handoff has no poolKey: the legacy native-pair key uses the runtime token/hook addresses and handoff-checked scalar fee/spacing; live reads confirm this pool. No undeployed adjunct router is used.

## Checks and evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Production build + TypeScript check | Pass | [revision/build.txt](validation/revision/build.txt); Vite `base: './'`, output `../dist` |
| Focused domain tests | 15 passed | [revision/unit-tests.txt](validation/revision/unit-tests.txt) |
| Browser interaction scenarios | 17 passed | [revision/browser-run.txt](validation/revision/browser-run.txt), [browser-results.json](validation/browser-results.json) |
| Revision-specific production browser regressions | 6 passed | [after-chromium.json](validation/revision/after-chromium.json); first-screen layout, full uint256 reflow, repeated seat lookup, missing/rejected wallets, type scale and share asset |
| Automated accessibility | Zero findings in 5 baseline viewports | Chromium + axe, WCAG A/AA tags; same browser report |
| Static subpath/resources | Pass | Production files served at `/preview/`; no failed static resources or JS/console errors in final mocked suite |
| Live browser reads | Revised export passed balance/owner/activity reads and first-phone-screen placement | [live-browser.json](validation/live-browser.json), [revision/live-run.txt](validation/revision/live-run.txt) |
| Live RPC chain, code, contract reads and quote | Both configured RPCs responded successfully | [rpc-check.json](validation/rpc-check.json) |
| Runtime manifest and ABI binding | Pass | Build runs `scripts/verify.mjs`; exact handoff/network match, complete file inventory, no extra top-level keys |
| Scope and dependency payloads | Pass for prepared files | [scope-budget.json](validation/revision/scope-budget.json): allowed paths plus explicit response-file exception, no submodules or dependency/cache payloads |
| Final Git commit / bundle | Blocked by read-only `.git` | `git add` cannot create `.git/index.lock`; bundle creation cannot fetch a missing promisor object into `.git/objects/pack`. The complete working-tree ZIP snapshot fits 8 MiB, but this is not claimed as the final Git bundle. Publisher must run `npm --prefix web run check:budget` after committing in a writable full repository. |

The revised exported assets total approximately **0.75 MiB** (791,144 bytes excluding the self-excluded manifest), across **12 inventoried files**. This includes the two raw ABI arrays, index, JS/CSS, three local WOFF2 fonts, favicon, third-party notices and the 1200×630 share card. No dependency directory, registry mirror, package tarball, source map, browser binary or validation screenshot is in the export. Vite emits a nonfatal advisory for the approximately 557 kB main JS chunk (approximately 170 kB gzip); the full export remains well below the required size limits.

### Revision reproduction and repairs

The prior committed export was served at `/preview/` in Chromium 156 with deterministic public-RPC responses. [Before measurements](validation/revision/before-chromium.json) record observations, not passing acceptance assertions. The 15-second poll alone was disabled in the test harness to isolate the repeated-seat handler. The app contains no test-only branch. After the fixes, the same production-bundle scenarios assert the required behavior in [after measurements](validation/revision/after-chromium.json). The full original interaction suite was rerun as well.

| Finding / final source location | Reproduction | Fix and final check |
| --- | --- | --- |
| `2493bd…` — `web/src/styles.css:1321` | At 390×844, balance top 986.47px and Claim ETH 1071.30–1115.30px. | Compact mobile hero, 40px headline, 16px vertical padding, 12px description gap; hide hero link/principles strip. Balance top 669.67px and entire Claim ETH 750.66–794.66px, with wallet control retained. Also asserted with real public-RPC balances. |
| `da409d…` — `web/src/styles.css:508` | Maximum uint256 ID produced 865px document width at 390px and 320px. | Constrain badge width and wrap its strong text anywhere. Complete 78-digit ID preserved; document width now exactly 390px/320px. |
| `123e85…` — `web/src/App.tsx:116` | Second View seat erased balances and said `Live state · block undefined`; zero new reads. | Refresh the current seat without clearing its snapshot. Clear only when changing seats; verified snapshot required for live block label. Regression covers explicit seat changes and repeated selection with delayed replies. |
| `1f45e7…` — `web/src/wallet.ts:63`, `web/src/Swap.tsx:458` | Swap connection feedback rendered above the viewport. | Track initiating control, render a local stable status region, associate it with the button, retain header-local feedback. Both missing-wallet and rejected-request states pass visibility and origin-switch checks. |
| `2a73cc…` — `web/src/App.tsx:295`, `web/src/Swap.tsx:311` | Five competing eyebrow labels; uppercase/tracked illustration labels. | Removed the eyebrows and used task headings. Both widths report zero eyebrows and normal diagram-label case/tracking. |
| `1b2ab0…` — `web/src/styles.css:63`, `web/src/styles.css:654` | Rendered type probe found many size overrides and weights 400/450/500/550/600/650. | Reuse existing tokens, inherit monospace size, retain 16px inputs, use three weights. Revised 390px/1440px probes report seven sizes and weights 400/550/650. |
| `0235b3…` — `web/index.html:18` | No `og:image` and no share asset. | Add editable HTML source, PNG renderer, 1200×630 local PNG and static OG/Twitter metadata. Browser decoded dimensions and export inventory/hash checks pass. Actual absolute URL awaits assigned publication origin. |
| `611914…` — `web/README.md` | Isolated `npm ci --offline` with a new empty cache fails with `ENOTCACHED` for `ws-8.21.0.tgz`. | **Disputed requirement.** Current overriding rules expressly allow network install and forbid committed dependency/cache/registry payloads. Online `npm ci` succeeded with the existing lockfile; no prohibited payload was added. [Offline evidence](validation/revision/offline-install.txt). |

The revision reviewed all six Better Interface domains on the affected surfaces: **Accessibility** (status associations, keyboard flow, five axe widths), **Layout** (first screen and long-ID overflow), **Writing** (task headings and local recoverable errors), **Typography** (computed scale, wrapping and loaded fonts), **Colors** (the six existing rendered contrast pairs remeasured, 5.39–13.78:1), and **UI** (loading, error, wallet retry, disabled and confirmed controls). The existing palette, contract behavior, layout structure and transaction safeguards were retained. The worker viewed the first-screen, long-ID, wallet-error, share-card, full desktop/mobile and keyboard-focus screenshots. Native screen readers, physical devices, browser-native zoom and forced-colors rendering remain untested.

WebKit was downloaded into scratch and launch attempted, but its MiniBrowser exited 127 because `libevent-2.1.so.7` is missing; its dependency check also listed other absent host libraries. [Launch evidence](validation/revision/webkit-attempt.txt). No system directories or permissions were changed. Chromium completed rendered, interaction and live read-only validation. An initial test-harness rejection selector did not match the existing error wording; that selector was corrected before collecting the saved passing baseline and final reports.

The final `git add -- web dist docs .imd-responses.json` attempt exited 128 with `.git/index.lock: Read-only file system`. The normal budget command correctly refused an uncommitted tree ([output](validation/revision/budget-command.txt)). A read-only history bundle attempt then encountered missing promisor object `e8af902e5b247940c4b05967b8ddad95e689dcb3`; Git could not fetch it because its temporary pack path is also read-only ([output](validation/revision/bundle-attempt.txt)). No access-control workaround was used. A separate ZIP in `test/scratch/` measures only the prepared file payload; its exact size and scope inventory are in [scope-budget.json](validation/revision/scope-budget.json). `.imd-responses.json` is ignored by inherited root rules, so a publisher committing responses must explicitly include it; those protected ignore rules were not edited.

### Contract and wallet scenarios

The tests exercise the actual production bundle through Playwright and mock its normal RPC/EIP-1193 boundaries; there is no test-mode branch or wallet fixture in the production bundle.

- Disconnected claims stay disabled; absent wallets and rejected connections provide a retry path.
- A wrong chain gates writes. An unknown chain produces `wallet_switchEthereumChain`, the exact supplied `wallet_addEthereumChain` parameters, then a second switch. The UI has one switch-network control.
- Seat lookup accepts full uint256 precision, reports invalid IDs, and leaves claims unavailable when `ownerOf` cannot resolve. Balances distinguish liquid and pending credit.
- Claim review explains the beneficiary and gas payer. The signed mock payload contains only `claim(seatId, currency)`, targets the attested hook, and requests no approval. Pending state stays locked; confirmation refreshes balances. A changed seat owner is reflected on refresh.
- Wallet rejection and preflight revert send no transaction. A mined reverted receipt restores controls without displaying success. An unresolved receipt stays locked and can be resolved with “Check confirmation.” Virtual time tests the 120-second timeout without real waiting.
- ETH buy: read-only Quoter call, slippage minimum, review, simulated Universal Router execution, `0x10` / `0x060c0f` encoding, expected input value and no approval.
- TDEMO sell: exact ERC-20 allowance to network Permit2, exact Permit2 allowance to network Universal Router, separate confirmed steps, bounded expiry, final swap with zero ETH value.
- Quote errors, excess input precision, invalid amounts, expiration and account disconnection invalidate the action. Both the five-field and extended six-field swap tuple formats have independent ABI decoding assertions.
- Missing contract code, a failed RPC, or tampered ABI disables writes. Code/read failures can recover through refresh; ABI mismatch fails before RPC/wallet activity.
- Advanced redemption, TDEMO transfer, and immutable custom pool creation call the correct ABI functions and arguments after simulation. Initialization requires the permanence acknowledgment.
- Keyboard-only Tab/Enter navigation completes wallet connection and a claim. A saved focus screenshot records the visible indicator.

The unit regression for propagated hook errors checks a revert whose signature is absent from the Quoter ABI, ensuring it becomes a readable hook error rather than raw hex or an unrelated network message.

### Live chain observations

At the recorded read-only checks, both public endpoints returned chain ID **1**, TitheToken runtime code of **1,503 bytes**, and TitheHook runtime code of **7,005 bytes**. The derived pool was initialized for **seat #1**, **25 bps** tithe, **12,500** LP-fee units, and nonzero active liquidity. The current beneficiary and both ETH/TDEMO credits resolved successfully. A read-only Quoter simulation for 0.001 ETH returned nonzero TDEMO output on each endpoint; exact block numbers and output amounts are in `rpc-check.json`.

The real browser also loaded all fonts and contract state, displayed `TitheAccrued` and `PoolConfigured` events, and had no console errors in the initial successful run. A later repeat encountered HTTP 403/400 errors from the public RPCs for the recent-events request; balances still loaded and the page correctly displayed its activity retry notice. That interrupted run is preserved in `live-rpc-interruption.json`. The final browser script explicitly records the unavailable-activity outcome instead of assuming an activity list always exists. These are time-specific observations, not guarantees about later liquidity, NFT ownership, payout success or prices. No RPC check attempted a signature or broadcast.

## Better Interface review

Applied the supplied pinned guide while implementing the page, then consolidated its six domains. Design direction was inferred from the requested minimal one-page seat/claim product; no user-approved visual specification was invented.

| Domain | Coverage | Result and limits |
| --- | --- | --- |
| Accessibility | Checked: native controls/landmarks, labels, skip link, disabled states, keyboard connection/claim, live status, focus screenshot, axe, reduced-motion emulation | Fixed invisible single-wallet tab stop and skip-link target. Screen-reader sessions and native assistive technologies were not tested. |
| Layout | Checked: desktop/mobile screenshots, document order, disclosure cues, wrapping, 1440/960/768/390/320px reflow, root text at 200% on 768px | No horizontal overflow in final states. Native 200% browser zoom, RTL/localized variants, and physical devices were not tested. |
| Writing | Checked: claim destination, exact input units, approval destinations, pending backing, actual-receipt state, errors/recovery, empty states | Fixed generic network wording for a propagated contract revert. No invented USD estimate, owner setting, audit or publication claim. |
| Typography | Checked: loaded faces, real serif italic, hierarchy, numeric alignment, long balances/IDs, mobile input sizing | Raised small operational helper copy to at least 12px. Observed the real large TDEMO balance wrapping without clipping. |
| Colors | Checked: semantic tokens, six computed rendered solid pairs, baseline axe contrast | Recorded ratios 5.39–13.78:1 for those text pairs. One deliberate light theme; dark theme is not applicable. Not every hover/disabled/error pair was individually measured. |
| UI | Checked: surface hierarchy, native disclosures, empty/loading/error/pending/confirmed states, hover guards, reduced motion, keyboard indicator | Fixed duplicate switch controls. No modal, animated entrance, chart or video exists. Native high-contrast environments and slowed Animations-panel replay were not performed. |

### Findings, repairs and rechecks

| Severity / domain | Source location | Observed issue / impact | Repair and evidence |
| --- | --- | --- | --- |
| Medium / Accessibility | `web/src/App.tsx:170` | A selector was visually hidden when only one wallet existed, but remained in keyboard order. | Render it only for multiple wallets. Final Tab-only connection/claim path passes. |
| Medium / Accessibility | `web/src/App.tsx:193`, `web/src/styles.css:212` | Initial screenshot retained the focused skip link over the page after activation. | Make the main target programmatically focusable; the final screenshot no longer shows the skip link over the brand. |
| Medium / Writing and error recovery | `web/src/domain.ts:103` | A hook error propagated through the Quoter did not decode with the Quoter ABI, then matched an overbroad “HTTP” detector. Browser failure test showed a misleading network error. | Decode raw/nested reverts with the supplied implementation ABI and narrow network-error matching. Unit and browser regression tests pass. |
| Medium / UI | `web/src/Swap.tsx:256`, `web/src/App.tsx:245` | Wrong-chain state offered duplicate switch actions. | Keep the actionable switch in one visible banner and refer to it from the swap card; unknown-chain test passes. |
| Medium / Typography | `web/src/styles.css` (`.ledger-note`, `.swap-footnote`, `.detail-row`, responsive small-copy rules) | Initial rendered explanations were unnecessarily small (10–11px) for financial context. | Raise operational helper text to 12px; recheck all five widths, text enlargement, and real-chain screenshots. |
| Medium / Transaction state | `web/src/wallet.ts:164` | Receipt handling needed explicit proof that a timeout or failed secondary read would not reopen a duplicate-send window or leave a confirmed action incorrectly locked. | Track known final receipts, keep unknown receipts locked, expose recheck, refresh via the latest account callback. Delayed, reverted, unknown and recovered receipt scenarios pass. |

No unresolved frontend blocker was observed in the final checked states. The revision table above supersedes earlier coverage claims for maximum-length seat IDs and same-seat lookup; the earlier suite had not exercised those exact states. The path exception and limitations below remain explicit.

## Rendered evidence

- [Live desktop, 1440px](validation/live-1440.png) and [live mobile, 390px](validation/live-390.png): real public RPC state, disconnected; viewed by the worker.
- [Mock desktop, 1440px](validation/desktop.png), [mock mobile, 390px](validation/mobile-390.png), and [mock narrow, 320px](validation/mobile-320.png): deterministic balances with liquid/pending backing. These are fixture data, not reported mainnet balances.
- [Keyboard focus](validation/keyboard-focus.png): connected-task entry, visible focus on the connect button; viewed by the worker.
- [First phone screen](validation/revision/first-screen-after-chromium.png), [maximum seat ID at 320px](validation/revision/long-seat-after-chromium.png), and [swap-local missing-wallet error](validation/revision/wallet-absent-after-chromium.png): revised production export with deterministic fixtures.
- [Live first phone screen](validation/revision/live-first-screen.png): revised production export at 390×844, real read-only public-RPC balances.

The supplied browser MCP could not launch: it expected a missing Chrome binary at `/home/node/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome`. No out-of-scope browser installation or symlink was used. The worker installed Playwright Chromium 156 into `test/scratch/browsers`, launched it from bounded foreground scripts, and inspected saved screenshots with the image viewer. Both browser and preview processes close at the end of each script. The missing MCP renderer is reported as a tool limitation; actual rendered/interaction validation was completed with the local browser.

## Unperformed / subsequent work

- No real wallet extension, hardware wallet, mobile wallet browser, funded swap/claim/approval, token transfer or pool initialization was exercised. Transaction behavior is validated with mocks plus real read-only RPC/quote checks. Replacement-transaction handling is source-reviewed but not covered by a real replacement test.
- No independent contract audit, Solidity fuzz/invariant rerun, explorer source-verification certification, gas guarantee or proof of bytecode equivalence was produced by this frontend worker.
- There is no supplied price oracle/USD feed, WalletConnect project ID, ENS registry configuration, live site domain or gateway name. USD context and WalletConnect are unavailable; addresses use checksums/copy/explorer links. Title/description/favicon and a local share image with dimensions/alt text and relative OG/Twitter metadata are present; absolute image URLs await the publisher’s actual origin. No social-network crawler fetch was tested.
- The activity window is bounded, and public endpoints can rate-limit or lag. State can change after simulation; a successful preflight is not a promise that a subsequent transaction will succeed. A pending transaction’s UI lock is local to the current tab; check wallet history after reloading it.
- IPFS pinning, named-site publication, immutable and named asset checks, and the publisher’s RPC verification have not run here. Their success remains a later workflow gate.

Reproduction commands and the configuration/action model are in [web/README.md](../web/README.md). The design inventory is [docs/DESIGN.md](DESIGN.md).
