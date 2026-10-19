import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-diff-example-'));
let browser;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: {
    ...process.env, npm_config_cache: path.join(temporary, 'empty-cache'),
    npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  }});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporary]))[0].filename;
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-package-lock', '--prefix', temporary, path.join(temporary, packed)]);
  const installed = path.join(temporary, 'node_modules/local-llm-prompt-diff');
  run(process.execPath, [path.join(installed, 'bin/prompt-diff.js'), 'compare',
    path.join(installed, 'examples/mrkl-before.json'), path.join(installed, 'examples/mrkl-after.json'),
    '--json', path.join(temporary, 'report.json'), '--html', path.join(temporary, 'report.html')]);
  for (const ext of ['json', 'html']) assert.deepEqual(fs.readFileSync(path.join(temporary, 'report.' + ext)), fs.readFileSync(path.join(root, 'examples/mrkl-report.' + ext)));
  const report = JSON.parse(fs.readFileSync(path.join(temporary, 'report.json')));
  assert.equal(report.changes.length, 5);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', viewport: { width: 320, height: 640 } });
  const requests = [], errors = [];
  await context.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : (requests.push(route.request().url()), route.abort()));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(temporary, 'report.html')).href);
  assert.deepEqual(await page.locator('article pre').evaluateAll(elements => elements.map(e => JSON.parse(e.textContent))), report.changes);
  for (const view of ['before', 'after']) {
    await page.selectOption('#view', view);
    assert.deepEqual(await page.locator('article pre').allTextContents(), report.changes.map(c => JSON.stringify(Object.hasOwn(c, view) ? c[view] : '(absent)', null, 2)));
  }
  for (const type of Object.keys(report.summary.byType)) {
    await page.selectOption('#filter', type);
    assert.equal(await page.locator('article').count(), report.summary.byType[type]);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ installedOffline: true, packagedExampleMatches: true, browser: browser.version(), findings: 5, beforeAfterAndFilters: true, narrowViewport: true, externalRequests: requests.length }));
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
