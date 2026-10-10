import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
import { startPreview } from './server.mjs';
import { makeMock, attachMock } from './mock-chain.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = process.argv.includes('--baseline');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const evidence = resolve(root, 'docs/validation/revision');
await mkdir(evidence, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'test/scratch/browsers');
const folder = (await readdir(process.env.PLAYWRIGHT_BROWSERS_PATH)).find((p) =>
  p.startsWith(`${engine}-`),
);
const browser = await (engine === 'webkit' ? webkit : chromium).launch({
  headless: true,
  executablePath: resolve(
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    folder,
    engine === 'webkit' ? 'pw_run.sh' : 'chrome-linux64/chrome',
  ),
});
const preview = await startPreview();
const report = {
  time: new Date().toISOString(),
  engine,
  baseline,
  scope:
    'Committed production export under /preview/; deterministic RPC/wallet fixtures; no broadcast',
  checks: [],
  consoleErrors: [],
  failedStaticResources: [],
};
const suffix = `${baseline ? 'before' : 'after'}-${engine}`;
async function scenario(name, fn, walletOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // Isolate explicit refreshes from the 15-second poll, without pausing requests or rendering.
  await page.addInitScript(() => {
    const interval = window.setInterval;
    window.setInterval = (fn, ms, ...args) => (ms === 15000 ? 0 : interval(fn, ms, ...args));
  });
  page.on('pageerror', (e) => report.consoleErrors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/preview/') && r.status() >= 400)
      report.failedStaticResources.push({ url: r.url(), status: r.status() });
  });
  const mock = makeMock();
  try {
    await attachMock(page, mock, walletOptions);
    await page.goto(preview.url);
    await expect(page.locator('.data-status')).toContainText('Live state', { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    const result = await fn(page, mock);
    report.checks.push({ name, result: baseline ? 'OBSERVED' : 'PASS', ...result });
    console.log(baseline ? 'OBSERVED' : 'PASS', name);
  } catch (e) {
    report.checks.push({ name, result: 'FAIL', error: e.message });
    console.error('FAIL', name, e.message);
  } finally {
    assert.equal(mock.sent.length, 0, 'Revision scenarios must never send a transaction');
    await context.close();
  }
}
const rect = (locator) =>
  locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });
try {
  await scenario(
    'First phone screen exposes balance, full Claim ETH, and header connection',
    async (page) => {
      await page.evaluate(() => scrollTo(0, 0));
      const measurements = {
        ledger: await rect(page.locator('#ledger-title')),
        balance: await rect(page.locator('.balance-number').first()),
        claim: await rect(page.getByRole('button', { name: 'Claim ETH', exact: true })),
        wallet: await rect(page.locator('header .connect-button')),
        headlineSize: await page.locator('h1').evaluate((e) => getComputedStyle(e).fontSize),
      };
      await page.screenshot({ path: resolve(evidence, `first-screen-${suffix}.png`) });
      if (!baseline) {
        assert(measurements.balance.top >= 0 && measurements.balance.bottom <= 844);
        assert(measurements.claim.top >= 0 && measurements.claim.bottom <= 844);
        assert(measurements.wallet.bottom <= 844);
        assert.equal(measurements.headlineSize, '40px');
      }
      return { measurements };
    },
  );
  await scenario(
    'Full uint256 seat ID wraps without clipping at 390px and 320px',
    async (page, mock) => {
      const maxSeat = ((1n << 256n) - 1n).toString();
      mock.state.missingOwner = true;
      await page.getByRole('textbox', { name: 'Seat ID', exact: true }).fill(maxSeat);
      await page.getByRole('button', { name: 'View seat', exact: true }).click();
      await expect(page.locator('.seat-badge strong')).toHaveText(`Seat #${maxSeat}`);
      const widths = [];
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const actual = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          value: document.querySelector('.seat-badge strong').textContent,
          wrap: getComputedStyle(document.querySelector('.seat-badge strong')).overflowWrap,
        }));
        widths.push(actual);
        if (!baseline) assert.equal(actual.scrollWidth, width);
      }
      await page.locator('.seat-badge').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(evidence, `long-seat-${suffix}.png`) });
      return { widths };
    },
  );
  await scenario(
    'Repeated selected-seat lookup preserves balances while explicitly refreshing',
    async (page, mock) => {
      await page.getByRole('textbox', { name: 'Seat ID', exact: true }).fill('1');
      await page.getByRole('button', { name: 'View seat', exact: true }).click();
      await expect(page.locator('.data-status')).toContainText('Live state');
      // Exercise an explicitly selected seat as well as the implicit demo seat.
      for (const value of ['2', '1']) {
        await page.getByRole('textbox', { name: 'Seat ID', exact: true }).fill(value);
        await page.getByRole('button', { name: 'View seat', exact: true }).click();
        await expect(page.locator('.seat-badge strong')).toHaveText(`Seat #${value}`);
        await expect(page.locator('.data-status')).toContainText('Live state');
      }
      const previous = await page.locator('.balance-number').allTextContents();
      let refreshRequests = 0;
      const handle = mock.handle;
      mock.handle = async (body) => {
        refreshRequests++;
        await new Promise((r) => setTimeout(r, 100));
        return handle(body);
      };
      await page.getByRole('button', { name: 'View seat', exact: true }).click();
      const during = await page.locator('.balance-number').allTextContents();
      const duringStatus = await page.locator('.data-status').textContent();
      if (!baseline) {
        assert.deepEqual(during, previous);
        assert(!duringStatus.includes('undefined'));
        await expect.poll(() => refreshRequests).toBeGreaterThan(0);
        await expect(page.locator('.data-status')).toContainText('Live state');
        await expect(page.getByRole('button', { name: 'View seat', exact: true })).toBeEnabled();
      }
      return { previous, during, duringStatus, refreshRequests };
    },
  );
  for (const absent of [true, false]) {
    await scenario(
      `Swap connection ${absent ? 'missing-wallet' : 'rejection'} feedback stays beside its button`,
      async (page) => {
        if (!absent)
          await page.evaluate(() => {
            window.__walletTest.rejectConnect = true;
          });
        const button = page.locator('#swap').getByRole('button', { name: 'Connect wallet' });
        await button.scrollIntoViewIfNeeded();
        await button.click();
        const error = page.getByText(
          absent ? /No browser wallet found/ : /Request declined in your wallet/,
        );
        await expect(error).toBeVisible();
        const measurements = {
          error: await rect(error),
          button: await rect(button),
          local: await page
            .locator('#swap')
            .getByText(absent ? /No browser wallet found/ : /Request declined in your wallet/)
            .count(),
          describedBy: await button.getAttribute('aria-describedby'),
        };
        await page.screenshot({
          path: resolve(evidence, `wallet-${absent ? 'absent' : 'rejected'}-${suffix}.png`),
        });
        if (!baseline) {
          assert.equal(measurements.local, 1);
          assert(measurements.error.top >= 0 && measurements.error.bottom <= 844);
          assert.equal(measurements.describedBy, 'swap-wallet-feedback');
          await page.locator('header').getByRole('button', { name: 'Connect wallet' }).click();
          await expect(page.locator('#header-wallet-feedback')).toContainText(
            absent ? 'No browser wallet found' : 'Request declined in your wallet',
          );
          await expect(page.locator('#swap-wallet-feedback')).toBeEmpty();
        }
        return { measurements };
      },
      { absent },
    );
  }
  await scenario(
    'Task headings, restrained rendered type scale, and static share metadata',
    async (page) => {
      const widths = [];
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        widths.push(
          await page.evaluate(() => {
            const leaves = [...document.querySelectorAll('body *')].filter(
              (e) =>
                e.getClientRects().length &&
                [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
            );
            return {
              width: innerWidth,
              sizes: [...new Set(leaves.map((e) => getComputedStyle(e).fontSize))],
              weights: [...new Set(leaves.map((e) => getComputedStyle(e).fontWeight))],
              kickers: document.querySelectorAll('.eyebrow').length,
              labels: [...document.querySelectorAll('.diagram-label')].map((e) => ({
                casing: getComputedStyle(e).textTransform,
                tracking: getComputedStyle(e).letterSpacing,
              })),
            };
          }),
        );
      }
      const share = await page
        .locator('meta[property="og:image"]')
        .getAttribute('content', { timeout: 500 })
        .catch(() => null);
      if (!baseline) {
        for (const result of widths) {
          assert.equal(result.kickers, 0);
          assert(result.sizes.length <= 8, JSON.stringify(result.sizes));
          assert(result.weights.length <= 3, JSON.stringify(result.weights));
          assert(result.labels.every((l) => l.casing === 'none' && l.tracking === 'normal'));
        }
        for (const id of ['#ledger-title', '#swap-title', '#how-title', '#contracts-title'])
          assert.match(
            await page.locator(id).textContent(),
            /Seat ledger|Swap ETH and TDEMO|How tithe works|Deployed contracts/,
          );
        assert.equal(share, './share-card.png');
        const dimensions = await page.evaluate(async () => {
          const img = new Image();
          img.src = './share-card.png';
          await img.decode();
          return [img.naturalWidth, img.naturalHeight];
        });
        assert.deepEqual(dimensions, [1200, 630]);
      }
      return { widths, share };
    },
  );
} finally {
  await browser.close();
  await preview.close();
  await writeFile(resolve(evidence, `${suffix}.json`), JSON.stringify(report, null, 2) + '\n');
}
assert(
  !report.checks.some((c) => c.result === 'FAIL'),
  'See revision evidence for failing scenarios',
);
assert.equal(report.consoleErrors.length, 0);
assert.equal(report.failedStaticResources.length, 0);
