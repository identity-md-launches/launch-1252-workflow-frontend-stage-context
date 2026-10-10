import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { decodeAbiParameters, parseAbiParameters, zeroAddress } from 'viem';
import { makeMock, attachMock, d, hook, token, owner, nextOwner } from './mock-chain.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = resolve(root, 'docs/validation');
await mkdir(evidence, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'test/scratch/browsers');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith('/preview/')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const rel = path.slice('/preview/'.length) || 'index.html';
    if (rel.includes('..')) throw Error('Invalid path');
    const file = resolve(root, 'dist', rel);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browserDir = (await readdir(resolve(root, 'test/scratch/browsers'))).find((p) =>
  /^chromium-/.test(p),
);
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  executablePath: resolve(root, 'test/scratch/browsers', browserDir, 'chrome-linux64/chrome'),
});
const report = {
  time: new Date().toISOString(),
  scope:
    'Production export at a gateway-style subpath; deterministic mocked public RPC and EIP-1193 wallet; no broadcast',
  checks: [],
  screenshots: [],
  consoleErrors: [],
  failedStaticResources: [],
};
async function test(name, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.url().includes('/preview/') && r.status() >= 400)
      report.failedStaticResources.push({ url: r.url(), status: r.status() });
  });
  try {
    await fn(page);
    report.checks.push({ name, result: 'PASS' });
    console.log('PASS', name);
  } catch (e) {
    report.checks.push({ name, result: 'FAIL', error: e.message });
    await page.screenshot({ path: resolve(evidence, 'failure.png'), fullPage: true });
    throw e;
  } finally {
    await context.close();
  }
}
async function start(page, options = {}, wallet = {}) {
  const mock = makeMock(options);
  await attachMock(page, mock, wallet);
  await page.goto(url);
  await expect(page.getByText(/Live state · block/)).toBeVisible({ timeout: 20000 });
  return mock;
}
async function connect(page) {
  await page.locator('header').getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  await expect(page.getByText(/Live state · block/)).toBeVisible();
}
try {
  await test('Desktop/mobile rendering, keyboard, fonts, contrast, reflow and accessibility', async (page) => {
    await start(page);
    await expect(
      page.getByRole('heading', { name: 'Pay the seat, not the wallet.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.evaluate(() => document.fonts.ready);
    assert(
      await page.evaluate(
        () =>
          document.fonts.check('16px "DM Sans Variable"') &&
          document.fonts.check('16px "Instrument Serif"'),
      ),
    );
    report.contrast = await page.evaluate(() => {
      function rgb(s) {
        return s
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      }
      function lum(c) {
        return c
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      }
      return [
        'h1',
        '.hero-description',
        '.swap-footnote',
        '.primary',
        '.balance-number',
        '.small-label',
      ].map((selector) => {
        const e = document.querySelector(selector);
        let node = e,
          bg;
        while (node) {
          bg = getComputedStyle(node).backgroundColor;
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break;
          node = node.parentElement;
        }
        const fg = getComputedStyle(e).color,
          a = lum(rgb(fg)),
          b = lum(rgb(bg));
        return {
          selector,
          foreground: fg,
          background: bg,
          ratio: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)),
        };
      });
    });
    assert(report.contrast.every((pair) => pair.ratio >= 4.5));
    for (const width of [1440, 960, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Overflow at ${width}px`,
      );
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      report.checks.push({
        name: `axe at ${width}px`,
        result: result.violations.length ? 'FAIL' : 'PASS',
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => n.target),
        })),
      });
      assert.equal(
        result.violations.length,
        0,
        JSON.stringify(
          result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        ),
      );
      if ([1440, 390, 320].includes(width)) {
        const name = `${width === 1440 ? 'desktop' : `mobile-${width}`}.png`;
        await page.screenshot({ path: resolve(evidence, name), fullPage: true });
        report.screenshots.push(name);
      }
    }
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Overflow at 200% text size',
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ''));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page
        .locator('button')
        .first()
        .evaluate((e) => getComputedStyle(e).transitionDuration),
      '0s',
    );
  });
  await test('Missing wallet gives recoverable feedback', async (page) => {
    await start(page, {}, { absent: true });
    await page.locator('header').getByRole('button', { name: 'Connect wallet' }).click();
    await expect(page.getByText(/No browser wallet found/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
  });
  await test('Unknown-chain switch adds exact vetted chain and retries', async (page) => {
    await start(page, {}, { wrongChain: true, unknownChain: true });
    await connect(page);
    await expect(page.getByText('Your wallet is on another network.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
    await page
      .getByRole('button', { name: `Switch to ${d.network.name}` })
      .first()
      .click();
    await expect(page.getByText('Your wallet is on another network.')).toBeHidden();
    const requests = await page.evaluate(() => window.__walletTest.requests);
    assert.deepEqual(requests.find((r) => r.method === 'wallet_addEthereumChain').params, [
      d.walletAddChain,
    ]);
    assert.equal(requests.filter((r) => r.method === 'wallet_switchEthereumChain').length, 2);
  });
  await test('Claim resolves current owner, sends no approval, locks pending, refreshes balances', async (page) => {
    const mock = await start(page, { receiptDelay: 1000 });
    await connect(page);
    await page.getByRole('button', { name: 'Claim ETH', exact: true }).click();
    await expect(page.getByText(/All available ETH will go to seat #1/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm claim in wallet' }).click();
    await expect(page.getByRole('button', { name: 'Confirm claim in wallet' })).toBeDisabled();
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toBeVisible({
      timeout: 12000,
    });
    assert.equal(mock.sent.length, 1);
    assert.equal(mock.sent[0].decoded.functionName, 'claim');
    assert.deepEqual(mock.sent[0].decoded.args, [1n, zeroAddress]);
    assert.equal(mock.sent[0].to.toLowerCase(), hook.address.toLowerCase());
    await expect(page.getByText('No ETH has accrued for this seat yet.')).toBeVisible();
    mock.state.owner = nextOwner;
    await page.getByRole('button', { name: 'Refresh balances' }).click();
    await expect(
      page.getByRole('link', { name: `Seat owner ${nextOwner} on explorer` }),
    ).toBeVisible();
  });
  await test('Claim wallet rejection and simulation revert release controls without broadcasting', async (page) => {
    const mock = await start(page);
    await connect(page);
    await page.evaluate(() => (window.__walletTest.reject = true));
    await page.getByRole('button', { name: 'Claim ETH', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm claim in wallet' }).click();
    await expect(page.getByText(/Request declined in your wallet/)).toBeVisible();
    assert.equal(mock.sent.length, 0);
    await page.evaluate(() => (window.__walletTest.reject = false));
    mock.state.failure = 'simulation';
    await page.getByRole('button', { name: 'Confirm claim in wallet' }).click();
    await expect(page.getByText(/This seat has no tithe/)).toBeVisible();
    assert.equal(mock.sent.length, 0);
    await expect(page.getByRole('button', { name: 'Confirm claim in wallet' })).toBeEnabled();
  });
  await test('Seat lookup, nonexistent seat, large ID validation and empty balances', async (page) => {
    await start(page);
    await connect(page);
    await page.getByLabel('Seat ID', { exact: true }).fill('999');
    await page.getByRole('button', { name: 'View seat', exact: true }).click();
    await expect(page.getByText(/The seat owner could not be resolved/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
    await page.getByLabel('Seat ID', { exact: true }).fill('1.5');
    await page.getByRole('button', { name: 'View seat', exact: true }).click();
    await expect(page.getByText(/Enter a whole seat number/)).toBeVisible();
  });
  await test('Native buy quotes via vetted quoter, encodes bounded router transaction and refreshes', async (page) => {
    const mock = await start(page);
    await connect(page);
    await page.getByLabel('You pay').fill('0.01');
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await expect(page.getByText('995 TDEMO', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review swap', exact: true }).click();
    await expect(page.getByText(/Spend up to 0.01 ETH for at least 995 TDEMO/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm swap in wallet' }).click();
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toBeVisible({
      timeout: 12000,
    });
    assert.equal(mock.sent.length, 1);
    const tx = mock.sent[0];
    assert.equal(tx.to.toLowerCase(), d.network.uniswapV4.universalRouter.toLowerCase());
    assert.equal(BigInt(tx.value), 10000000000000000n);
    assert.equal(tx.decoded.args[0], '0x10');
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters('bytes,bytes[]'),
      tx.decoded.args[1][0],
    );
    assert.equal(actions, '0x060c0f');
    assert.equal(
      decodeAbiParameters(parseAbiParameters('address,uint256'), params[2])[1],
      995n * 10n ** 18n,
    );
    assert(
      mock.calls.some(
        (c) =>
          c.method === 'eth_call' &&
          c.params[0].to.toLowerCase() === d.network.uniswapV4.quoter.toLowerCase(),
      ),
    );
  });
  await test('Token sell has exact token→Permit2 and Permit2→router approvals, no ETH value', async (page) => {
    const mock = await start(page);
    await connect(page);
    await page.getByRole('button', { name: 'Reverse swap direction' }).click();
    await page.getByLabel('You pay').fill('100');
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await page.getByRole('button', { name: '1. Approve TDEMO to Permit2' }).click();
    await expect(page.getByRole('button', { name: '2. Approve router spending' })).toBeEnabled({
      timeout: 12000,
    });
    assert.equal(
      mock.sent[0].decoded.args[0].toLowerCase(),
      d.network.uniswapV4.permit2.toLowerCase(),
    );
    assert.equal(mock.sent[0].decoded.args[1], 100n * 10n ** 18n);
    await page.getByRole('button', { name: '2. Approve router spending' }).click();
    await expect(page.getByRole('button', { name: 'Review swap', exact: true })).toBeEnabled({
      timeout: 12000,
    });
    assert.equal(mock.sent[1].to.toLowerCase(), d.network.uniswapV4.permit2.toLowerCase());
    assert.equal(
      mock.sent[1].decoded.args[1].toLowerCase(),
      d.network.uniswapV4.universalRouter.toLowerCase(),
    );
    await page.getByRole('button', { name: 'Review swap', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm swap in wallet' }).click();
    await expect(page.getByLabel('You pay')).toHaveValue('', { timeout: 12000 });
    assert.equal(mock.sent.length, 3);
    assert.equal(BigInt(mock.sent[2].value ?? 0), 0n);
  });
  await test('Quote validation, failed quote, stale quote, and account-change invalidation', async (page) => {
    const mock = await start(page);
    await connect(page);
    await page.getByLabel('You pay').fill('1e18');
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await expect(page.getByText(/Enter a positive amount/)).toBeVisible();
    await page.getByLabel('You pay').fill('0.01');
    mock.state.failure = 'quote';
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await expect(page.getByText(/The pool could not fill this swap/)).toBeVisible();
    mock.state.failure = '';
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review swap', exact: true })).toBeEnabled();
    await page.clock.install();
    await page.clock.fastForward(61000);
    await expect(page.getByRole('button', { name: 'Refresh expired quote' })).toBeVisible();
    await page.evaluate(() => window.__emitWallet('accountsChanged', []));
    await expect(
      page.locator('header').getByRole('button', { name: 'Connect wallet' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
  });
  await test('Missing code and RPC failure disable all writes and can recover', async (page) => {
    const mock = makeMock({ code: false });
    await attachMock(page, mock);
    await page.goto(url);
    await expect(page.getByText(/No deployed code at/)).toBeVisible();
    await connect(page).catch(() => {});
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
    mock.state.code = true;
    await page.getByRole('button', { name: 'Refresh balances' }).click();
    await expect(page.getByText(/Live state · block/)).toBeVisible();
    mock.state.failure = 'rpc';
    await page.getByRole('button', { name: 'Refresh balances' }).click();
    await expect(page.getByText('Unable to verify current contract state.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeDisabled();
  });
  await test('ABI tampering fails closed before wallet or RPC actions', async (page) => {
    const mock = makeMock();
    await attachMock(page, mock);
    await page.route('**/abi/TitheHook.json', (r) =>
      r.fulfill({ contentType: 'application/json', body: '[]' }),
    );
    await page.goto(url);
    await expect(page.getByText(/ABI integrity check failed/)).toBeVisible();
    assert.equal(mock.sent.length, 0);
    assert.equal(mock.calls.length, 0);
  });
  await test('Advanced redemption sends to hook and preserves beneficiary', async (page) => {
    const mock = await start(page);
    await connect(page);
    await page.getByText('Advanced contract actions', { exact: false }).click();
    await page.getByRole('button', { name: 'Redeem ETH backing', exact: true }).click();
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toBeVisible({
      timeout: 12000,
    });
    assert.equal(mock.sent[0].decoded.functionName, 'redeemTithe');
    assert.equal(mock.state.accrueEth, 12500000000000000n);
    assert.equal(mock.state.owner, owner);
  });
  await test('Keyboard-only connection and claim, visible focus, cancellation and recovery', async (page) => {
    const mock = await start(page);
    async function tabTo(locator) {
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        if (await locator.evaluate((e) => e === document.activeElement)) return;
      }
      throw Error('Could not reach the control by Tab');
    }
    const connectButton = page.locator('header').getByRole('button', { name: 'Connect wallet' });
    await tabTo(connectButton);
    await expect(connectButton).toBeFocused();
    await page.locator('header').screenshot({ path: resolve(evidence, 'keyboard-focus.png') });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Claim ETH', exact: true })).toBeEnabled();
    const claim = page.getByRole('button', { name: 'Claim ETH', exact: true });
    await tabTo(claim);
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('button', { name: 'Confirm claim in wallet' });
    await tabTo(confirm);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toBeVisible({
      timeout: 12000,
    });
    assert.equal(mock.sent.length, 1);
  });
  await test('Rejected wallet connection can be retried', async (page) => {
    await start(page);
    await page.evaluate(() => (window.__walletTest.rejectConnect = true));
    await page.locator('header').getByRole('button', { name: 'Connect wallet' }).click();
    await expect(page.getByText(/Request declined in your wallet/)).toBeVisible();
    await page.evaluate(() => (window.__walletTest.rejectConnect = false));
    await connect(page);
  });
  await test('A reverted receipt restores controls without claiming success', async (page) => {
    const mock = await start(page, { receiptStatus: '0x0' });
    await connect(page);
    await page.getByRole('button', { name: 'Claim ETH', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm claim in wallet' }).click();
    await expect(page.getByText(/The transaction reverted. No action was completed/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm claim in wallet' })).toBeEnabled();
    assert.equal(mock.state.accrueEth, 12500000000000000n);
  });
  await test('Unknown confirmation stays locked until the receipt can be checked', async (page) => {
    const mock = await start(page, { receiptDelay: 999999 });
    await connect(page);
    await page.clock.install();
    await page.getByRole('button', { name: 'Claim ETH', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm claim in wallet' }).click();
    await expect(page.getByText(/Transaction submitted/)).toBeVisible();
    await page.clock.fastForward(121000);
    await expect(page.getByRole('button', { name: 'Check confirmation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim TDEMO', exact: true })).toBeDisabled();
    assert.equal(mock.sent.length, 1);
    mock.state.receiptDelay = 0;
    await page.getByRole('button', { name: 'Check confirmation' }).click();
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim TDEMO', exact: true })).toBeEnabled();
  });
  await test('Token transfer and immutable custom-pool initialization are simulated and encoded', async (page) => {
    const mock = await start(page);
    await connect(page);
    await page.getByText('Advanced contract actions', { exact: false }).click();
    await page.getByLabel('Recipient address').fill(nextOwner);
    await page.getByLabel('Amount of TDEMO').fill('1.25');
    await page.getByRole('button', { name: 'Send TDEMO', exact: true }).click();
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toBeVisible();
    assert.equal(mock.sent[0].decoded.functionName, 'transfer');
    assert.deepEqual(mock.sent[0].decoded.args, [nextOwner, 1250000000000000000n]);
    mock.state.customPool = true;
    await page.getByLabel('New pool seat ID').fill('2');
    await page.getByLabel('Tithe in basis points').fill('25');
    await page.getByLabel('LP fee in millionths').fill('3000');
    await page.getByLabel('Tick spacing').fill('60');
    await page.getByLabel('Initial sqrtPriceX96').fill('79228162514264337593543950336');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Initialize new pool' }).click();
    await expect(page.getByText('Confirmed onchain.', { exact: true })).toHaveCount(2);
    assert.equal(mock.sent[1].decoded.functionName, 'initializePool');
    assert.equal(mock.sent[1].decoded.args[0].hooks.toLowerCase(), hook.address.toLowerCase());
    assert.equal(mock.sent[1].decoded.args[0].fee, 3000);
    assert.deepEqual(
      decodeAbiParameters(parseAbiParameters('uint256,uint24'), mock.sent[1].decoded.args[2]),
      [2n, 25],
    );
  });
  assert.equal(report.consoleErrors.length, 0);
  assert.equal(report.failedStaticResources.length, 0);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(evidence, 'browser-results.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
