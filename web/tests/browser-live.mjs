import { chromium, expect } from '@playwright/test';
import { readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPreview } from './server.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = (await readdir(resolve(root, 'test/scratch/browsers'))).find((p) =>
  /^chromium-/.test(p),
);
const preview = await startPreview();
const browser = await chromium.launch({
  executablePath: resolve(root, 'test/scratch/browsers', dir, 'chrome-linux64/chrome'),
  headless: true,
  args: ['--no-sandbox'],
});
const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Real public RPC, disconnected browser, read-only; no wallet, no signing, no broadcast',
  result: 'PENDING',
  console: [],
  requests: [],
  viewports: [],
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => report.console.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') report.console.push(m.text());
  });
  page.on('response', (r) =>
    report.requests.push({ url: r.url().replace(preview.url, '/preview/'), status: r.status() }),
  );
  await page.route('**/*', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      for (const call of Array.isArray(body) ? body : [body])
        if (/send|sign/i.test(call.method))
          throw Error('A read-only browser test attempted a write');
    }
    return route.continue();
  });
  await page.goto(preview.url);
  await expect(page.getByText(/Live state · block/)).toBeVisible({ timeout: 45000 });
  report.blockText = await page.locator('.data-status').textContent();
  report.balances = await page.locator('.balance-number').allTextContents();
  report.owner = await page.locator('.beneficiary a').getAttribute('aria-label');
  const activityError = page.getByText(/Recent events are unavailable from this RPC/);
  await expect(page.locator('.activity-list').or(activityError)).toBeVisible({ timeout: 20000 });
  report.events = (await page.locator('.activity-list').count())
    ? await page.locator('.activity-list').textContent()
    : undefined;
  report.activityUnavailable = (await activityError.isVisible())
    ? await activityError.textContent()
    : undefined;
  report.fonts = await page.evaluate(() =>
    Array.from(document.fonts).map((f) => ({
      family: f.family,
      weight: f.weight,
      status: f.status,
    })),
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    report.viewports.push({ width, overflow });
    if (overflow) throw Error(`Overflow at ${width}`);
    await page.screenshot({
      path: resolve(root, `docs/validation/live-${width}.png`),
      fullPage: true,
    });
  }
  report.result = report.activityUnavailable ? 'PASS_WITH_RPC_LIMITATION' : 'PASS';
} catch (e) {
  report.result = 'FAIL';
  report.error = e.message;
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(root, 'docs/validation/live-browser.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await preview.close();
  console.log(
    JSON.stringify(
      { ...report, requests: `${report.requests.length} responses recorded` },
      null,
      2,
    ),
  );
}
