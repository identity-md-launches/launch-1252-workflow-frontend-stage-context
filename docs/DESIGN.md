# Tithe design

## Overview

Tithe serves people inspecting an identity.md seat’s accrued fees, wallet holders triggering permissionless claims, and visitors trying the ETH/TDEMO demo pool. The implemented one-page interface uses a warm paper background, dark green actions, restrained borders, a serif display face, and a readable sans serif for operational information. The seat ledger precedes swaps and secondary contract tools in document order.

This is the design implemented in `web/src/`, not a proposal. Screenshots and measured checks are in `docs/validation/`. The document is under `docs/` because the assignment’s overriding path budget excludes root `DESIGN.md`.

## Colors

`web/src/styles.css` defines primitives followed by semantic roles. Components use semantic color properties. The site intentionally has a single light appearance (`color-scheme: light`), with no theme switch. A dark theme is not implemented.

| Semantic token | Value | Job |
| --- | --- | --- |
| `--color-page` | `#faf9f5` | Page canvas |
| `--color-surface` | `#fffefa` | Balance cards, swap card, inputs |
| `--color-inset` | `#f3f2eb` | Input/advanced surfaces, neutral badges |
| `--color-text` | `#242f26` | Main copy, headings, numbers |
| `--color-muted` | `#62695e` | Labels, explanations, read timestamps |
| `--color-border` | `#e6e5dc` | Decorative separators and card structure |
| `--color-control-border` | `#8c9185` | Distinguishable input/button boundaries |
| `--color-accent` / `--color-focus` | `#245b40` | Primary action and keyboard focus |
| `--color-accent-hover` | `#19442f` | Primary action hover |
| `--color-accent-soft` | `#eaf0e6` | Transaction review and gentle hover fill |
| `--color-notice-bg` / `--color-notice-text` | `#fff4df` / `#795418` | Network and unavailable-feature notices |
| `--color-error-bg` / `--color-error-text` | `#fff1ec` / `#9a342a` | Persistent failure feedback |

The muted text/page pair measured **5.39:1**, muted text/surface **5.62:1**, primary-button text/green **7.87:1**, and main text/page **13.20:1** in Chromium. `browser-results.json` records the computed RGB colors and selectors. These results cover those rendered solid-color pairs; they are not an assertion about every possible platform or state. Errors, readiness, and pending transactions always have text as well as color.

## Typography

The locally bundled fonts are **DM Sans Variable** (normal, weights 100–1000) for interface text and **Instrument Serif** (400 normal and real 400 italic) for the brand and h1/h2 headings. Fallbacks are system sans serif and Georgia/serif respectively. `@font-face` rules in `styles.css` use WOFF2 files from the pinned Fontsource packages and `font-display: swap`. The browser evidence confirms all three used faces loaded. No runtime font CDN is required.

`--font-body` and `--font-display` hold the stacks. The main type roles are 12px metadata (`--text-xs`), 13px small UI (`--text-sm`), 15px operational body and introductory prose (`--text-body`), 18px emphatic labels and small symbols (`--text-lg`), and 32px section headings, balances, swap amounts and wordmarks (`--text-section`). The hero uses `--text-display: clamp(3.5rem, 5.9vw, 5.5rem)`, overridden to `2.5rem` (40px) below 36rem. Mobile form inputs remain at least 16px to avoid unwanted input zoom. These six roles plus the 16px input/default size produce seven measured sizes at both 390px and 1440px. Weights are 400, 550 and 650; `strong`/`b` explicitly use 650. Monospace addresses inherit their surrounding size instead of shrinking. Section headings name tasks directly, without eyebrow labels; illustration labels use normal casing and tracking.

Headings have 1.1 line-height, mild negative tracking and balanced wrapping. Body copy uses 1.55–1.7 unitless line-height and bounded measure. Numeric balances, quote rows and changing values use tabular figures. Full-precision amounts appear in transaction review; truncated balance display has a full-value title. Addresses have visible short forms, accessible full names, copy buttons and explorer destinations. Long provenance values wrap with `overflow-wrap` rather than escaping a card. The seat badge has `min-width: 0; max-width: 100%`, and its strong text uses `overflow-wrap: anywhere` to preserve every uint256 digit.

## Layout

The page container is at most 1240px, centered, with 48px desktop gutters. The recurring spacing scale is 4, 8, 12, 16, 24, 32 and 48px, declared as `--space-*`; component rules use those same intervals where appropriate. Larger 40/55/64/66px separations distinguish major page groups. The ledger and swap panel share aligned top edges in a `1.45fr / 1fr` grid with a 28px gap. Elements use content-driven height, `minmax(0, 1fr)` tracks, wrapping rows and explicit `min-width: 0` where needed.

Implemented breakpoints:

- **68rem / 1088px:** gutters become 32px, the grid becomes `1.3fr / 1fr`, the seat-search row wraps, and the explanatory introduction moves above its three steps.
- **51rem / 816px:** header navigation wraps below the brand/wallet, the ledger and swap stack in document order, and the decorative seat illustration shrinks.
- **36rem / 576px:** gutters become 20px; the decorative illustration, hero link and principles strip disappear. The hero retains its 40px headline and italic emphasis with 16px vertical padding and 12px description spacing. Claims become full-width, form and contract grids become single columns, and long provenance rows become vertical. The header wallet control remains visible; the first ETH balance and full Claim ETH button fit within the initial 390×844 viewport.

The page uses ordinary document scrolling and anchor navigation. There are no sticky overlays obstructing controls. The revised live export was inspected at 1440px and 390px; mocked state was inspected/tested at 1440, 960, 768, 390 and 320px. Reflow passed at all those widths, for the maximum uint256 ID at 390/320px, and at 768px with the root text size doubled. Native browser zoom and physical-device testing were not performed.

## Elevation & depth

Balance cards are mostly flat: one subtle structural border on a slightly brighter surface. The swap panel has a restrained two-layer shadow (`0 3px 4px #24322603`, `0 10px 24px #24322603`) and an 18px radius. Inset amount controls use a tonal fill. No modal, tooltip portal, or backdrop is implemented. Transaction review expands inline so the destination and action remain in context.

The only intentional stacking is the small swap-direction button overlapping the two amount panels (`z-index: 1`) and the keyboard skip link (`z-index: 10`).

## Shapes

`--radius-sm` is 6px for controls/notices, `--radius-md` is 12px for cards and disclosures, and `--radius-lg` is 18px for the swap panel. Token badges, the brand stamp, and activity markers are circular. Borders are normally 1px. The original chair/orbit drawing in `App.tsx` and the simple icon paths in `components.tsx` are code-native SVG, inherit semantic colors, and are decorative where surrounding copy conveys their meaning. `web/share-card.html` reuses the wordmark, chair, fonts and palette for a 1200×630 PNG in `web/public/share-card.png`, rendered by `web/scripts/share-card.mjs` and copied into the export. The static head includes dimensions and descriptive alt text; absolute image URLs await the publication origin.

## Components

| Component/pattern | Source | Use and states |
| --- | --- | --- |
| `Address` | `web/src/components.tsx` | Checksummed explorer link, short/full presentation, copy success/failure live region. `label` gives identity context. |
| `Icon`, `Coin` | `web/src/components.tsx` | One consistent stroke icon set and ETH/TDEMO markers; decorative SVG is hidden from assistive technology. |
| `Detail` | `web/src/components.tsx` | A semantic `dt`/`dd` row for quote and contract metadata. Long values wrap. |
| `TxFeedback` | `web/src/components.tsx` | Persistent per-action status, explorer link, and receipt recheck after unknown confirmation. |
| Ledger and claim review | `web/src/App.tsx` | Seat lookup, live beneficiary, separate liquid/pending amounts, read-only/disconnected/loading/empty/error states, explicit inline payout review. Reselecting the same seat refreshes while preserving its last snapshot; writes remain disabled during that read. |
| `Swap` | `web/src/Swap.tsx` | Direction, amount, balances, slippage, quote expiry, exact approval steps, minimum-output review and simulated execution. |
| `Advanced` | `web/src/Advanced.tsx` | Native disclosure for redemption, token transfer, and custom pool creation; no administrator settings. |
| Buttons | `web/src/styles.css` | `.primary` fills the active next step; neutral bordered peers, `.text-button` for lightweight refresh, `.icon-button` with accessible names. Native disabled states remain visibly distinguishable. |
| Fields and feedback | `web/src/styles.css` and form components | Real labels, native inputs, field descriptions, validation text, persistent transaction status; no placeholder-only critical fields. Wallet connection errors appear beside the initiating header/swap button, with a stable status region referenced by `aria-describedby`. |

Keyboard focus uses a 2px green outline with a 4px offset and a system `Highlight` outline in forced colors. The skip link moves focus to the main landmark. Hidden single-wallet selectors are not rendered. Primary controls are usually at least 44px high; copy controls are 28px and secondary refresh controls at least 24px. Hover treatments apply only to hover-capable devices. Color/background transitions last 120ms and are disabled under `prefers-reduced-motion`. There are no entry animations or chart motion.

## Do’s and don’ts

- Start additions inside `.site-wrap`, preserve one main landmark, and use the existing section-heading/detail/card patterns before adding a new container system.
- Use semantic color tokens for their defined roles. Reserve the strong filled action for the current next step; make parallel secondary actions neutral.
- Keep financial state truthful: show a dash while unknown, separate nominal pending backing from liquid credit, and preserve token units. Do not invent USD prices.
- Keep beneficiary and approval destination visible before signing. Do not replace failed simulation with a send shortcut, enable a write on stale/wrong-chain state, or remove the minimum-output bound.
- Keep labels and full provenance accessible. Do not shrink required text or clip wallet addresses to force a row to fit.
- Preserve the responsive stacking order: ledger, swap, explanation, contract details, advanced actions.

For another section, choose a descriptive h2, add a `.section-heading`, use `Detail` for key/value reads, give every control its own descriptive label, and connect transaction feedback through `TxFeedback`. Recheck the narrow layout, keyboard route, pending state, and rendered colors before calling it complete.
