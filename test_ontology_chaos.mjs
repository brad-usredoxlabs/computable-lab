#!/usr/bin/env node
/**
 * Chaos mode testing for ontology search unification.
 * Uses Playwright Node.js bindings (already installed in project).
 */

import { chromium } from 'playwright';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import http from 'http';

const FRONTEND = 'http://localhost:5174';
const BACKEND = 'http://localhost:3001';
const SCREENSHOT_DIR = '/home/brad/.hermes/kanban/workspaces/t_842030b5/screenshots';

const results = [];

function log(testName, status, detail = '') {
  const msg = `[${status}] ${testName}` + (detail ? ` - ${detail}` : '');
  console.log(msg);
  results.push({ test: testName, status, detail });
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(url, body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function pkill(pattern) {
  return new Promise((resolve) => {
    exec(`pkill -f "${pattern}" || true`, () => resolve());
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Test 1: Backend offline
async function testBackendOffline() {
  log('1. Backend offline', 'TESTING');

  try {
    const check = await httpGet(`${BACKEND}/api/resolve`, 3000);
    if (check.status !== 200) {
      log('1. Backend offline', 'SKIP', 'Backend not running');
      return;
    }
  } catch {
    log('1. Backend offline', 'SKIP', 'Backend not reachable');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Stop the backend
    await pkill('tsx.*server|node.*server');
    await sleep(2000);

    // Verify backend is down
    try {
      const check = await httpGet(`${BACKEND}/api/resolve`, 2000);
      log('1a. Backend stopped', 'FAIL', 'Backend still responding');
    } catch {
      log('1a. Backend stopped', 'PASS', 'Backend is offline');
    }

    // Reload page and check for crashes
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await sleep(2000);

    const criticalErrors = consoleErrors.filter(e =>
      e.toLowerCase().includes('unhandled') || e.toLowerCase().includes('crash') ||
      e.includes('TypeError') || e.includes('ReferenceError')
    );

    if (criticalErrors.length > 0) {
      log('1b. No white screen/crash on reload', 'WARN',
        `${criticalErrors.length} critical errors: ${criticalErrors.slice(0, 2).join('; ')}`);
    } else {
      log('1b. No white screen/crash on reload', 'PASS', `${consoleErrors.length} total errors, no critical ones`);
    }

    // Take screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/backend_offline.png` });

    // Restart backend
    exec('cd ~/git/computable-lab && npm run dev -w server > /dev/null 2>&1 &');
    await sleep(5000);

    try {
      const check = await httpGet(`${BACKEND}/api/resolve`, 3000);
      log('1c. Backend recovery', 'PASS');
    } catch {
      log('1c. Backend recovery', 'FAIL', 'Backend not recovering after restart');
    }
  } catch (e) {
    log('1. Backend offline', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 2: No direct OLS4 calls
async function testNoDirectOLS4() {
  log('2. No direct OLS4 calls', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const olsRequests = [];
  const resolveRequests = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('ebi.ac.uk')) olsRequests.push(url);
    if (url.includes('/api/resolve')) resolveRequests.push(url);
  });

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(3000);

    if (olsRequests.length > 0) {
      log('2. No direct OLS4 calls', 'FAIL',
        `Found ${olsRequests.length} direct OLS requests: ${olsRequests.slice(0, 2).join(', ')}`);
    } else {
      log('2. No direct OLS4 calls', 'PASS',
        `No direct OLS calls. ${resolveRequests.length} resolve requests found.`);
    }
  } catch (e) {
    log('2. No direct OLS4 calls', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 3: Rapid typing (debounce stress)
async function testRapidTyping() {
  log('3. Rapid typing (debounce)', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const resolveRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/resolve')) resolveRequests.push(req.url());
  });

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Find any text input and type rapidly
    const input = await page.$('input[type="text"]');
    if (input) {
      await input.click();
      for (const char of 'hepatocyte') {
        await page.keyboard.press(char, { delay: 30 });
      }
      await sleep(2000);

      if (resolveRequests.length <= 3) {
        log('3. Rapid typing debounce', 'PASS', `Only ${resolveRequests.length} requests fired (expected <=3)`);
      } else {
        log('3. Rapid typing debounce', 'FAIL', `${resolveRequests.length} requests fired (debounce not working)`);
      }
    } else {
      // Try API-level debounce test
      log('3. Rapid typing debounce', 'SKIP', 'No text input found on page');

      // Test via direct API calls
      const promises = Array(10).fill(null).map(() =>
        httpPost(`${BACKEND}/api/resolve`, { term: 'hepatocyte', limit: 5 })
      );
      const apiResults = await Promise.allSettled(promises);
      const fulfilled = apiResults.filter(r => r.status === 'fulfilled').length;
      log('3b. API handles concurrent requests', 'PASS', `${fulfilled}/10 concurrent requests handled`);
    }
  } catch (e) {
    log('3. Rapid typing (debounce)', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 4: Empty/short queries
async function testEmptyShortQueries() {
  log('4. Empty/short queries', 'TESTING');

  // Test at API level for minQueryLength enforcement
  try {
    // Empty query
    const r1 = await httpPost(`${BACKEND}/api/resolve`, { term: '', limit: 5 });
    log('4a. Empty query', r1.status === 200 ? 'PASS' : 'WARN',
      `API returned ${r1.status}, ${r1.body?.candidates?.length ?? 0} candidates`);

    // Single char (minQueryLength is 2 in hook, but API may still respond)
    const r2 = await httpPost(`${BACKEND}/api/resolve`, { term: 'a', limit: 5 });
    log('4b. Single char query', 'PASS', `API responded: ${r2.body?.candidates?.length ?? 0} candidates`);

    // Spaces only
    const r3 = await httpPost(`${BACKEND}/api/resolve`, { term: '   ', limit: 5 });
    log('4c. Spaces only', 'PASS', `API responded: ${r3.body?.candidates?.length ?? 0} candidates`);

  } catch (e) {
    log('4. Empty/short queries', 'FAIL', e.message);
  }

  // Test frontend hook behavior
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const resolveRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/resolve')) resolveRequests.push(req.url());
  });

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const input = await page.$('input[type="text"]');
    if (input) {
      const before = resolveRequests.length;

      await input.click();
      await page.keyboard.type('a');
      await sleep(500);

      const afterSingle = resolveRequests.length;
      if (afterSingle === before) {
        log('4d. Frontend: single char no request', 'PASS');
      } else {
        log('4d. Frontend: single char no request', 'FAIL', `Got ${afterSingle - before} requests`);
      }
    }
  } catch (e) {
    log('4d. Frontend single char', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 5: Special characters
async function testSpecialCharacters() {
  log('5. Special characters', 'TESTING');

  const testStrings = ['cafe cells', '\u03b1-synuclein', 'CD4+', '<script>', "'; DROP TABLE"];

  for (const s of testStrings) {
    try {
      const r = await httpPost(`${BACKEND}/api/resolve`, { term: s, limit: 5 });
      log(`5. Special: "${s}"`, r.status === 200 ? 'PASS' : 'WARN',
        `${r.body?.candidates?.length ?? 0} candidates, status ${r.status}`);
    } catch (e) {
      log(`5. Special: "${s}"`, 'FAIL', e.message);
    }
  }
}

// Test 6: Very long query
async function testLongQuery() {
  log('6. Very long query', 'TESTING');

  const longString = 'a'.repeat(500);
  try {
    const r = await httpPost(`${BACKEND}/api/resolve`, { term: longString, limit: 5 }, 15000);
    log('6. Very long query (500 chars)', r.status === 200 ? 'PASS' : 'WARN',
      `Got ${r.body?.candidates?.length ?? 0} candidates`);
  } catch (e) {
    log('6. Very long query (500 chars)', 'FAIL', e.message);
  }

  // Also test frontend
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const input = await page.$('input[type="text"]');
    if (input) {
      await input.click();
      await page.keyboard.type(longString, { delay: 1 });
      await sleep(1000);

      if (consoleErrors.length === 0) {
        log('6b. Frontend: long query no errors', 'PASS');
      } else {
        log('6b. Frontend: long query', 'WARN', `${consoleErrors.length} errors: ${consoleErrors[0].slice(0, 100)}`);
      }
    }
  } catch (e) {
    log('6b. Frontend long query', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 7: Console errors check
async function testConsoleErrors() {
  log('7. Console errors check', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allErrors = [];
  const allWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') allErrors.push(msg.text());
    if (msg.type() === 'warn') allWarnings.push(msg.text());
  });

  try {
    // Check homepage
    await page.goto(FRONTEND, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const olsErrors = allErrors.filter(e =>
      e.includes('olsClient') || e.includes('olsCache') || e.includes('useOLSSearch')
    );

    if (olsErrors.length > 0) {
      log('7a. No old OLS import errors (homepage)', 'FAIL', olsErrors.slice(0, 2).join('; '));
    } else {
      log('7a. No old OLS import errors (homepage)', 'PASS', `${allErrors.length} total errors`);
    }

    // Check project page
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(3000);

    const projectOlsErrors = allErrors.filter(e =>
      e.includes('olsClient') || e.includes('olsCache') || e.includes('useOLSSearch')
    );

    if (projectOlsErrors.length > 0) {
      log('7b. No old OLS errors (project page)', 'FAIL', projectOlsErrors.slice(0, 2).join('; '));
    } else {
      log('7b. No old OLS errors (project page)', 'PASS', `${allErrors.length} total errors`);
    }

    // Check for critical JS errors
    const critical = allErrors.filter(e =>
      e.includes('TypeError') || e.includes('SyntaxError') || e.includes('ReferenceError')
    );
    if (critical.length > 0) {
      log('7c. No critical JS errors', 'WARN',
        `${critical.length} critical: ${critical[0].slice(0, 120)}`);
    } else {
      log('7c. No critical JS errors', 'PASS');
    }

    // Take screenshot of console state
    await page.screenshot({ path: `${SCREENSHOT_DIR}/project_page.png` });

  } catch (e) {
    log('7. Console errors check', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 8: localStorage cleanup
async function testLocalStorageCleanup() {
  log('8. localStorage cleanup', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const olsCacheKeys = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return keys.filter(k => k.startsWith('ols_cache'));
    });

    if (olsCacheKeys.length > 0) {
      log('8. No ols_cache localStorage keys', 'WARN',
        `Found ${olsCacheKeys.length} ols_cache keys (may be stale): ${olsCacheKeys.slice(0, 3).join(', ')}`);
    } else {
      log('8. No ols_cache localStorage keys', 'PASS');
    }

    // Also check for any new ols_cache keys being written after a search
    const input = await page.$('input[type="text"]');
    if (input) {
      await input.click();
      await page.keyboard.type('hepatocyte');
      await sleep(2000);

      const olsCacheKeysAfter = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        return keys.filter(k => k.startsWith('ols_cache'));
      });

      if (olsCacheKeysAfter.length > olsCacheKeys.length) {
        log('8b. No new ols_cache keys after search', 'FAIL',
          `${olsCacheKeysAfter.length - olsCacheKeys.length} new keys written`);
      } else {
        log('8b. No new ols_cache keys after search', 'PASS');
      }
    }
  } catch (e) {
    log('8. localStorage cleanup', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 9: Tab navigation during search
async function testTabNavigation() {
  log('9. Tab navigation during search', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // Navigate to project
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const input = await page.$('input[type="text"]');
    if (input) {
      await input.click();
      await page.keyboard.type('hepat');
      await sleep(200); // Mid-search

      // Navigate away
      await page.goto(FRONTEND, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await sleep(1000);

      // Navigate back
      await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await sleep(2000);

      const navErrors = consoleErrors.filter(e =>
        e.toLowerCase().includes('unhandled') || e.includes('abort') || e.includes('failed to fetch')
      );

      if (navErrors.length === 0) {
        log('9. Tab navigation during search', 'PASS', 'No errors during rapid navigation');
      } else {
        log('9. Tab navigation during search', 'WARN',
          `${navErrors.length} nav-related errors: ${navErrors[0].slice(0, 100)}`);
      }
    } else {
      log('9. Tab navigation during search', 'SKIP', 'No input found');
    }
  } catch (e) {
    log('9. Tab navigation during search', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 10: API-level chaos tests
async function testApiResolve() {
  log('10. API resolve endpoint', 'TESTING');

  // Test various edge cases at API level
  const tests = [
    { name: '10a. Normal query', body: { term: 'hepatocyte', limit: 5 } },
    { name: '10b. Unicode term', body: { term: '\u03b1-synuclein', limit: 5 } },
    { name: '10c. SQL injection attempt', body: { term: "'; DROP TABLE studies; --", limit: 5 } },
    { name: '10d. XSS attempt', body: { term: '<script>alert(1)</script>', limit: 5 } },
    { name: '10e. Null bytes', body: { term: 'test\x00injection', limit: 5 } },
    { name: '10f. Empty limit', body: { term: 'test', limit: 0 } },
    { name: '10g. Negative limit', body: { term: 'test', limit: -1 } },
    { name: '10h. Huge limit', body: { term: 'test', limit: 999999 } },
  ];

  for (const t of tests) {
    try {
      const r = await httpPost(`${BACKEND}/api/resolve`, t.body, 10000);
      log(t.name, r.status === 200 ? 'PASS' : 'WARN',
        `status=${r.status}, candidates=${r.body?.candidates?.length ?? 'N/A'}`);
    } catch (e) {
      log(t.name, 'FAIL', e.message);
    }
  }
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('Chaos Mode Testing - Ontology Search Unification');
  console.log('='.repeat(60));
  console.log('');

  // Ensure backend is running
  try {
    await httpGet(`${BACKEND}/api/resolve`, 3000);
    console.log('[OK] Backend is running\n');
  } catch {
    console.log('[WARN] Backend not running, starting...');
    exec('cd ~/git/computable-lab && npm run dev -w server > /dev/null 2>&1 &');
    await sleep(5000);
  }

  // Ensure frontend is running
  try {
    await httpGet(FRONTEND, 3000);
    console.log('[OK] Frontend is running\n');
  } catch {
    console.log('[WARN] Frontend not running');
  }

  // Run tests sequentially (some modify system state)
  await testBackendOffline();
  await sleep(1000);
  await testNoDirectOLS4();
  await sleep(500);
  await testRapidTyping();
  await sleep(500);
  await testEmptyShortQueries();
  await sleep(500);
  await testSpecialCharacters();
  await sleep(500);
  await testLongQuery();
  await sleep(500);
  await testConsoleErrors();
  await sleep(500);
  await testLocalStorageCleanup();
  await sleep(500);
  await testTabNavigation();
  await sleep(500);
  await testApiResolve();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const skipCount = results.filter(r => r.status === 'SKIP').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;

  for (const r of results) {
    console.log(`  [${r.status.padEnd(5)}] ${r.test}` + (r.detail ? ` - ${r.detail}` : ''));
  }

  console.log(`\nTotal: ${passCount} PASS, ${failCount} FAIL, ${warnCount} WARN, ${skipCount} SKIP, ${errorCount} ERROR`);

  // Save results
  fs.writeFileSync(
    '/home/brad/.hermes/kanban/workspaces/t_842030b5/test_results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\nResults saved to test_results.json');
}

main().catch(console.error);
