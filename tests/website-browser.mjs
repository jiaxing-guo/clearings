import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('website/out');
const base = process.env.DOCS_BASE_PATH ?? '';
const artifacts = path.resolve('.ci-artifacts/website');
const contentTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  try {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (base && !name.startsWith(base + '/')) {
      response.writeHead(404).end();
      return;
    }
    name = name.slice(base.length);
    let file = path.resolve(root, '.' + name);
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, context, page;
try {
  browser = await chromium.launch({
    executablePath: process.env.CLEARINGS_TEST_BROWSER || undefined,
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      response.url().startsWith(origin) &&
      !response.url().endsWith('/favicon.ico')
    )
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${origin}${base}/`);
  assert.match(await page.locator('h1').innerText(), /reusable code/);
  assert(
    (await page.locator('h1').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) > 40,
    'Landing CSS must load',
  );
  await page.getByRole('tab', { name: 'Result', exact: true }).click();
  await page.getByText('No result yet.', { exact: true }).waitFor();
  for (const [input, expected] of [
    ['mixed', 'Failed · exit code 1'],
    ['clean', 'All checks passed'],
    ['missing', 'Missing · no receipt found'],
  ]) {
    await page.getByRole('tab', { name: 'Request', exact: true }).click();
    await page.getByLabel('Receipt set', { exact: true }).selectOption(input);
    await page.getByRole('button', { name: 'Run sample', exact: true }).click();
    await page.locator('.result-content').getByText(expected, { exact: true }).waitFor();
  }
  await page.getByRole('tab', { name: /^Give it a proper test/ }).click();
  await page.getByRole('tab', { name: /^Give it a proper test/ }).press('ArrowDown');
  await page
    .locator('.story-tabs [data-state="active"]')
    .filter({ hasText: 'Let it do that again.' })
    .waitFor();
  await page.getByRole('link', { name: 'Read the docs', exact: true }).click();
  await page.getByRole('heading', { name: 'Clearings guide', exact: true }).waitFor();
  assert.equal(await page.locator('h1').innerText(), 'Clearings guide');
  await page.getByRole('button', { name: /^Search/ }).click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('workbench');
  await page
    .getByRole('button', { name: 'Clearings Personal automation workbench', exact: true })
    .click();
  await page.waitForURL(`${origin}${base}/docs/workbench/`);
  await page.getByRole('heading', { name: 'Personal automation workbench', exact: true }).waitFor();
  assert.equal(await page.locator('h1').innerText(), 'Personal automation workbench');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/', '/docs/']) {
      await page.goto(`${origin}${base}${route}`);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${route} overflows at ${width}px`,
      );
    }
    await page.getByRole('button', { name: 'Open Sidebar', exact: true }).click();
    await page.getByRole('link', { name: 'Install Clearings', exact: true }).click();
    await page.waitForURL(`${origin}${base}/docs/installation/`);
    await page.getByRole('button', { name: 'Open Sidebar', exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Website browser checks passed: assets, sample states, keyboard tabs, docs/search and mobile navigation.',
  );
} catch (error) {
  await mkdir(artifacts, { recursive: true });
  if (page)
    await page
      .screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true })
      .catch(() => {});
  if (context)
    await context.tracing.stop({ path: path.join(artifacts, 'trace.zip') }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
