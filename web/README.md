# Tithe frontend

A static, one-page interface for the deployed TitheHook and TitheToken. The default view reads the demo seat’s ETH and TDEMO credit, separates liquid credit from pending backing, resolves the current NFT owner, and shows recent hook activity. Visitors can connect a browser wallet, release tithe to the seat owner, or buy/sell through the vetted Uniswap v4 Universal Router.

The frontend does not deploy contracts, publish the site, add demo liquidity, or broadcast validation transactions. Existing Solidity, Foundry configuration, and ABI exports are preserved.

## Install, build, and preview

Use Node 22.12 or later (original validation on Node 22.23.2; revision validation on Node 24.21.0) and npm. From the repository root:

```sh
npm ci --prefix web
npm --prefix web run build
npm --prefix web run preview
```

Vite prints the local preview address. `npm --prefix web run dev` prepares the generated runtime configuration and runs the development server. For the committed export, serve **repository-root `dist/`** as ordinary static files. A server that serves `/some/path/index.html` and its neighboring files needs no rewrites or backend. Vite uses `base: './'`; navigation uses page anchors. JavaScript is required for reads and wallet interactions.

The build typechecks, bundles, copies the implementation-derived ABIs from the deployed source commit, checks their canonical Keccak-256 hashes, emits `dist/imd-deployment.json`, and verifies the complete export. Do not edit `dist/` manually. Rebuild and regenerate its manifest after every source or asset change.

## One runtime configuration

`dist/imd-deployment.json` is the **only runtime deployment configuration**. `src/config.ts` loads it relative to the page, then loads each referenced raw ABI array and verifies its hash before rendering transaction controls. It also centralizes the standard protocol ABI fragments and public client construction. Application contract addresses, network ID, RPC URLs, explorer, Universal Router, Quoter, StateView, PoolManager, PositionManager and Permit2 all come from the runtime manifest.

Build inputs are preserved in `deployment.handoff.json` and `network.handoff.json`; these are archival copies of the supplied handoff, not competing runtime maps. `scripts/export.mjs` reads the source commit named by the handoff using `git show <sourceCommit>:docs/abi/<Contract>.json`. Keep that commit available in the local Git object database. The exporter also checks the unchanged working ABI exports. Canonical ABI hashing recursively sorts object keys, preserves array order, serializes compact JSON, and hashes its UTF-8 bytes with Keccak-256.

This handoff has **no `poolKey`**. The application uses the permitted legacy hook-pool fallback: native ETH sorts before the runtime TitheToken address, the hook address comes from the runtime TitheHook entry, and fee `12500` / tick spacing `60` come from the validated handoff scalars in `src/legacy-pool.json`. The build rejects scalar drift. Live `poolConfig`, `getSlot0` and `getLiquidity` reads verify that derived pool; the worker confirmed its binding on both supplied RPCs. A future handoff containing `poolKey` is copied unchanged and takes precedence. The manifest never adds a fabricated poolKey or extra top-level deployment metadata.

The manifest copies `network` and `walletAddChain` unchanged. Its contract set exactly matches the handoff. Every other export file—including HTML, fonts, JS, CSS, notices, favicon and ABIs—is inventoried with a lowercase SHA-256 hash. It excludes itself.

No private configuration, keys, WalletConnect project ID, hardcoded RPC fallback, or undeployed TitheRouter is used. Browser wallets are discovered through EIP-6963 with an injected EIP-1193 fallback. WalletConnect is not enabled because no project ID was supplied. ENS reverse resolution is not configured; addresses are checksummed, copyable, and linked to the supplied explorer. The full payout address is visible during claim review. No USD source was supplied, so the interface shows token units and explicitly marks USD pricing unavailable.

## Reads and actions

- **Seat ledger:** enter any uint256 seat ID. The default comes from the initialized pool’s `poolConfig`, or the hook’s immutable default if the pool is not initialized. The approved launch fallback is seat #1, with 25 basis points (0.25%). Neither the pool’s seat nor its rate can be changed after initialization.
- **Live state:** snapshots use one block number for pool state, ownership, credit, totals and connected-wallet balances. Refresh every 15 seconds while visible, on wallet/account/network changes, and after confirmations. A read older than 45 seconds or a failed verification disables writes. Recent events have a separate bounded 1,200-block window and explicit refresh; this is not an archival index of every seat.
- **Verification:** check RPC chain ID, nonempty code for the application and vetted protocol contracts, and the hook’s PoolManager binding. ABI integrity is checked before any chain interaction. This does not establish bytecode equivalence or an independent audit.
- **Claim:** review the full available currency amount and current beneficiary. `claim(seatId, currency)` needs no approval and always pays `ownerOf` at execution time. Anyone may pay gas to trigger it. The hook redeems pending backing first. Failed claims preserve credit. A nonexistent seat, invalid owner, recipient rejecting ETH, or redemption failure can prevent payout; the interface cannot redirect funds.
- **Swap:** exact input only. Get a read-only `quoteExactInputSingle` simulation on the configured Quoter. Slippage is 0.01–5%, defaults to 0.5%, and produces a nonzero rounded-down minimum output. Quotes expire after 60 seconds; changing input, direction, slippage, account, or chain invalidates them. Review the input cap, minimum output, receiving wallet and five-minute deadline. `execute` is simulated before signing. Commands are `0x10`, with actions `0x060c0f` and the exact runtime pool key. The standard five-field tuple is used here; the six-field variant is supported when the network’s `extendedSwapParams` is true.
- **Approvals:** native ETH needs no approval and is supplied as transaction value. TDEMO input needs a token approval to the configured Permit2 and then a Permit2 approval to the configured Universal Router, each shown and confirmed separately, only when its fresh allowance is insufficient. Both are limited to the input amount; router permission expires in 30 minutes. ERC-20 swaps send zero ETH value. No unlimited approval is requested.
- **Transaction state:** each action reports simulation, wallet confirmation, submitted hash, confirmation, or a readable error. A synchronous lock prevents duplicate submissions and all writes stay locked through confirmation and fresh reads. Rejections and mined reverts restore controls. Unknown receipt status keeps the lock and offers “Check confirmation.” Same-tab receipt tracking follows replacement transactions; a differently replaced or cancelled action is not reported as success. After reloading a pending tab, inspect wallet history before submitting again.
- **Advanced controls:** redeem pending backing without paying anyone, transfer TDEMO from the connected wallet, or initialize a separate ETH/TDEMO pool using user-entered seat, rate, fee, tick spacing and sqrtPriceX96. Initialization requires an explicit permanence acknowledgment and does not add liquidity. The hook has no owner settings or admin setup panel. PoolManager callbacks and `unlockCallback` are protocol-only methods and intentionally have no direct controls; `transferFrom` is an allowance-consumer method used by routers, not a separate wallet task.

Tithe is charged in the **input currency**, as required by this deployed implementation. Exact-input tithe is based on the entire specified input budget even on a partial fill. The 1.25% LP fee is separate. Pending manager claims are included in nominal entitlement; the interface does not present them as an immediately liquid hook balance. Swap execution can still revert if state changes after simulation. No funded mainnet claim, approval, swap, token transfer, or initialization was performed for validation.

## Reproduce validation

```sh
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run verify
# After committing the final source/export/evidence:
npm --prefix web run check:budget
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" ./web/node_modules/.bin/playwright install chromium
npm --prefix web run test:browser
npm --prefix web run test:revision
npm --prefix web run check:rpc
npm --prefix web run test:live
```

The browser scripts start and close their own foreground preview, serving the **production export under `/preview/`**. They use the scratch Chromium installation. The mocked suite intercepts public RPC and wallet operations; it cannot broadcast to mainnet. The live suite is disconnected, forbids signing/sending requests, and only reads the real configured public RPCs. Live RPC access can fail independently of the local app. Dependency installation and browser download need network access; the deterministic tests themselves require no funded wallet or external service.

The revision suite checks the initial 390×844 claim placement, full uint256 IDs at 390/320px, repeated seat refresh, local wallet errors from both connection controls, rendered typography, and the share-card asset. `--baseline` records observations without asserting the repaired behavior; the saved baseline was collected from the prior committed export. Optional WebKit validation uses `npm --prefix web run test:revision -- --webkit` after installing that browser and its host libraries. This worker's WebKit launch failed because host libraries are absent; Chromium validation completed.

Dependencies are deliberately installed through `npm ci`, not committed. The current assignment explicitly forbids `node_modules`, package caches, registry mirrors and unnecessary npm archives. An isolated `npm ci --offline` with a new empty cache reproduced `ENOTCACHED` for `ws`; that confirms installation needs a registry/cache, not a defect in the self-contained static export. See the revision record in the validation document.

## Share preview

The committed `public/share-card.png` is a 1200×630 rendering of `share-card.html`, using the existing fonts, wordmark and seat illustration. Regenerate it with `npm --prefix web run share-card` after installing scratch Chromium, then run the production build. The normal build uses the committed PNG and needs no browser. The static head supplies Open Graph/Twitter image metadata, dimensions and alt text. Because no public origin is assigned, image URLs are relative. Before publication, the publisher must replace both `og:image` and `twitter:image` in `web/index.html` with the absolute URL for `share-card.png` under the assigned hosting path and rebuild to regenerate all asset hashes. No domain is invented here.

See [frontend validation](../docs/FRONTEND-VALIDATION.md), [design documentation](../docs/DESIGN.md), and the machine-readable evidence and screenshots in [docs/validation](../docs/validation). `npm run licenses` regenerates the bundled production dependency notices after a dependency update. `web/.gitignore` is the only ignore file changed; its explicit assignment budget excludes dependencies and caches at every nesting depth. Do not commit generated dependencies, browser binaries, test scratch directories, or npm archives.

The design document is intentionally at `docs/DESIGN.md`: the task’s overriding write scope allows `docs/**`, `web/**`, and `dist/**`, but not root `DESIGN.md`. The requested root placement could not be followed without violating that scope.

## Reference interfaces

The implementation follows the supplied pinned Better Interface and Ethereum frontend UX references. Protocol signatures/encoding were cross-checked against [Uniswap’s swap routing guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing), [IV4Quoter](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol), [IV4Router](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Router.sol), and [IStateView](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IStateView.sol). Protocol addresses come exclusively from the supplied network block, not those references.

The publisher handles source publication, IPFS pinning, naming, and subsequent immutable/named-asset and chain checks. No publication URL, CID, or independent verification result is claimed by this worker.
