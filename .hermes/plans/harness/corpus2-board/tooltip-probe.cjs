#!/usr/bin/env node
// tooltip-probe.cjs — cold tooltip probe for AC-1 evidence
// Usage: node tooltip-probe.cjs --url <url> --wells E2,A2,D5,H5,A1 --out <path>/tooltip.json

'use strict';

const fs = require('fs');
const path = require('path');
const playwright = require('/tmp/pw-install/node_modules/playwright');

function parseArgs() {
  const args = process.argv.slice(2);
  const url = args.find((a, i) => args[i - 1] === '--url');
  const wellsStr = args.find((a, i) => args[i - 1] === '--wells');
  const outPath = args.find((a, i) => args[i - 1] === '--out');
  if (!url || !wellsStr || !outPath) {
    console.error('Usage: node tooltip-probe.cjs --url <url> --wells E2,A2,D5,H5,A1 --out <path>');
    process.exit(1);
  }
  return { url, wells: wellsStr.split(','), outPath };
}

async function probeWell(page, well) {
  const wellSelector = `[data-well-id="${well}"]`;
  await page.hover(wellSelector);
  await page.waitForSelector('.well-tooltip', { timeout: 5000 });

  const tipVolumeEl = page.locator('.well-tooltip__volume').first();
  const tipVolume = await tipVolumeEl.isVisible() ? await tipVolumeEl.textContent() : null;

  const materialRows = await page.locator('.well-tooltip__material').all();
  const tipRows = [];
  for (const row of materialRows) {
    const name = await row.locator('.well-tooltip__material-name').first().textContent();
    const conc = await row.locator('.well-tooltip__material-conc').first().textContent();
    const vol = await row.locator('.well-tooltip__material-vol').first().textContent();
    tipRows.push({ name, conc, vol });
  }

  const tipMetaEl = page.locator('.well-tooltip__meta').first();
  const tipMeta = await tipMetaEl.isVisible() ? await tipMetaEl.textContent() : null;

  return { well, tipVolume, tipRows, tipMeta };
}

async function main() {
  const { url, wells, outPath } = parseArgs();
  const outDir = path.dirname(outPath);
  const shotsDir = path.join(outDir, 'shots');
  fs.mkdirSync(shotsDir, { recursive: true });

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  for (const well of wells) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // R16: click lawn tile before hovering
    await page.click('.lawn__tile-anchor .tile');
    await page.waitForSelector('main[aria-label="Labware focus"]', { timeout: 10000 });

    const result = await probeWell(page, well);
    results.push(result);
    console.log(`${well}: volume="${result.tipVolume}" rows=${JSON.stringify(result.tipRows)} meta="${result.tipMeta}"`);

    // Screenshot
    await page.screenshot({ path: path.join(shotsDir, `${well}.png`) });
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  await browser.close();

  // Exit nonzero if any well had no tooltip data
  const failed = results.filter(r => !r.tipVolume && r.tipRows.length === 0 && r.tipMeta === null);
  if (failed.length > 0) {
    console.error('Failed wells:', failed.map(r => r.well).join(', '));
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
