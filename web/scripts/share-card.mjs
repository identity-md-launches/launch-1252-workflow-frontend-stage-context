// Render the existing code-native wordmark/chair design into a crawler-friendly PNG.
// The generated PNG is committed; the normal build does not need a browser.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { root } from './shared.mjs';
const dir = resolve(root, 'test/scratch/browsers');
const folder = (await readdir(dir)).find((p) => p.startsWith('chromium-'));
const browser = await chromium.launch({
  executablePath: resolve(dir, folder, 'chrome-linux64/chrome'),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  let html = await readFile(resolve(root, 'web/share-card.html'), 'utf8');
  for (const path of html.match(/\.\/node_modules\/[^']+\.woff2/g)) {
    const bytes = await readFile(resolve(root, 'web', path));
    html = html.replace(path, `data:font/woff2;base64,${bytes.toString('base64')}`);
  }
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(root, 'web/public/share-card.png') });
  console.log('Rendered web/public/share-card.png (1200 × 630).');
} finally {
  await browser.close();
}
