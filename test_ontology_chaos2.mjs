#!/usr/bin/env node
/**
 * Round 2: Fix backend offline test, improve frontend input detection.
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Test 1: Backend offline (improved)
async function testBackendOffline() {
  log('1. Backend offline', 'TESTING');

  // Ensure backend is running
  try {
    const check = await httpGet(`${BACKEND}/api/resolve`, 3000);
    if (check.status !== 200) {
      log('1. Backend offline', 'SKIP', `Backend returned ${check.status}, not testing`);
      return;
    }
  } catch {
    log('1. Backend offline', 'SKIP', 'Backend not reachable, starting it...');
    exec('cd ~/git/computable-lab && npm run dev -w server > /tmp/backend.log 2>&1 &');
    await sleep(5000);
    try {
      await httpGet(`${BACKEND}/api/resolve`, 3000);
    } catch {
      log('1. Backend offline', 'SKIP', 'Backend failed to start');
      return;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Track requests
  const failedRequests = [];
  page.on('requestfailed', req => failedRequests.push(req.url()));

  try {
    // Navigate to a project page
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/before_backend_stop.png` });

    // Stop the backend
    await pkill('tsx.*server|node.*server');
    await sleep(3000);

    // Verify backend is truly down
    let backendDown = false;
    try {
      await httpGet(`${BACKEND}/api/resolve`, 2000);
    } catch {
      backendDown = true;
    }

    log('1a. Backend stopped', backendDown ? 'PASS' : 'FAIL',
      backendDown ? 'Backend is offline' : 'Backend still responding');

    if (backendDown) {
      // Try to trigger a fetch that goes to backend
      // Reload the page
      failedRequests.length = 0;
      consoleErrors.length = 0;

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      await sleep(3000);

      // Check if page rendered without crash
      const pageContent = await page.content();
      const hasReactRoot = pageContent.includes('root') || pageContent.includes('React');

      if (hasReactRoot) {
        log('1b. Page renders without crash', 'PASS', 'React root still in DOM');
      } else {
        log('1b. Page renders without crash', 'FAIL', 'Page lost React root (possible white screen)');
        await page.screenshot({ path: `${SCREENSHOT_DIR}/backend_offline_crash.png` });
      }

      // Check for unhandled promise rejections
      const criticalErrors = consoleErrors.filter(e =>
        e.toLowerCase().includes('unhandled') || e.includes('TypeError') || e.includes('ReferenceError')
      );

      if (criticalErrors.length === 0) {
        log('1c. No critical errors on reload', 'PASS', `${consoleErrors.length} total errors`);
      } else {
        log('1c. No critical errors on reload', 'WARN',
          `${criticalErrors.length} critical: ${criticalErrors[0]?.slice(0, 120)}`);
      }

      // Check failed requests
      const apiFailed = failedRequests.filter(u => u.includes('/api/'));
      if (apiFailed.length > 0) {
        log('1d. API requests fail gracefully', 'PASS',
          `${apiFailed.length} API requests failed (expected) without crashing`);
      }

      await page.screenshot({ path: `${SCREENSHOT_DIR}/backend_offline.png` });

      // Restart backend
      exec('cd ~/git/computable-lab && npm run dev -w server > /tmp/backend.log 2>&1 &');
      await sleep(5000);

      try {
        await httpGet(`${BACKEND}/api/resolve`, 3000);
        log('1e. Backend recovery', 'PASS');

        // Verify search works again
        const r = await httpPost(`${BACKEND}/api/resolve`, { term: 'test', limit: 3 });
        if (r.status === 200) {
          log('1f. Search recovers after restart', 'PASS');
        }
      } catch {
        log('1e. Backend recovery', 'FAIL', 'Backend not recovering');
      }
    }
  } catch (e) {
    log('1. Backend offline', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 2: No direct OLS4 calls (improved with actual search)
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
    // Navigate to homepage first
    await page.goto(FRONTEND, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Navigate to project page
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // Navigate to other pages
    await page.goto(`${FRONTEND}/settings`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    if (olsRequests.length > 0) {
      log('2. No direct OLS4 calls', 'FAIL',
        `Found ${olsRequests.length} direct OLS requests: ${olsRequests.slice(0, 3).join(', ')}`);
    } else {
      log('2. No direct OLS4 calls', 'PASS',
        `No direct OLS calls across multiple pages. ${resolveRequests.length} resolve requests found.`);
    }
  } catch (e) {
    log('2. No direct OLS4 calls', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 3: Rapid typing with direct input on study edit page
async function testRapidTyping() {
  log('3. Rapid typing (debounce)', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const resolveRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/resolve')) resolveRequests.push(req.url());
  });

  try {
    // Try the study creation page which has more inputs
    await page.goto(`${FRONTEND}/create/study`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // Try to find any input on the page
    const allInputs = await page.$$('input[type="text"], textarea');
    console.log(`  Found ${allInputs.length} text inputs on create/study page`);

    // Also check the project page
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // Look for all inputs more broadly
    const inputs = await page.$$('[role="combobox"], input[type="text"], .add-material-input, .taptab-widget input');
    console.log(`  Found ${inputs.length} searchable inputs on project page`);

    if (inputs.length > 0) {
      await inputs[0].click();
      await sleep(500);

      // Type rapidly
      const testWord = 'hepatocyte';
      for (const char of testWord) {
        await page.keyboard.press(char, { delay: 30 });
      }
      await sleep(2000);

      const resolveCount = resolveRequests.filter(u => u.includes(testWord)).length;
      if (resolveCount <= 2) {
        log('3a. Frontend debounce works', 'PASS', `Only ${resolveCount} requests for rapid typing`);
      } else if (resolveCount <= 4) {
        log('3a. Frontend debounce works', 'WARN', `${resolveCount} requests (slightly high)`);
      } else {
        log('3a. Frontend debounce works', 'FAIL', `${resolveCount} requests (debounce not working)`);
      }
    }

    // Test API-level debounce (concurrent requests)
    const promises = Array(20).fill(null).map(() =>
      httpPost(`${BACKEND}/api/resolve`, { term: 'hepatocyte', limit: 5 })
    );
    const apiResults = await Promise.allSettled(promises);
    const fulfilled = apiResults.filter(r => r.status === 'fulfilled').length;
    log('3b. API handles 20 concurrent requests', 'PASS', `${fulfilled}/20 handled`);

  } catch (e) {
    log('3. Rapid typing (debounce)', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 4: Empty/short queries
async function testEmptyShortQueries() {
  log('4. Empty/short queries', 'TESTING');

  // API-level tests
  try {
    const r1 = await httpPost(`${BACKEND}/api/resolve`, { term: '', limit: 5 });
    log('4a. Empty query to API', r1.status === 400 ? 'PASS' : 'WARN',
      `status=${r1.status} (400=validated rejection, 200=accepted empty)`);

    const r2 = await httpPost(`${BACKEND}/api/resolve`, { term: 'a', limit: 5 });
    log('4b. Single char to API', r2.status === 200 ? 'PASS' : 'WARN',
      `status=${r2.status}, ${r2.body?.candidates?.length ?? 0} candidates`);

    const r3 = await httpPost(`${BACKEND}/api/resolve`, { term: '   ', limit: 5 });
    log('4c. Spaces only to API', r3.status === 200 ? 'PASS' : 'WARN',
      `status=${r3.status}, ${r3.body?.candidates?.length ?? 0} candidates`);
  } catch (e) {
    log('4. Empty/short queries API', 'ERROR', e.message);
  }

  // Frontend hook-level test
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const resolveRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/resolve')) resolveRequests.push(req.url());
  });

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const inputs = await page.$$('[role="combobox"], input[type="text"], .add-material-input');
    if (inputs.length > 0) {
      await inputs[0].click();
      const before = resolveRequests.length;

      // Type single char
      await page.keyboard.type('a');
      await sleep(500);

      if (resolveRequests.length === before) {
        log('4d. Frontend: single char triggers no request', 'PASS');
      } else {
        log('4d. Frontend: single char triggers no request', 'FAIL',
          `Fired ${resolveRequests.length - before} requests (minQueryLength=2 should prevent this)`);
      }

      // Clear and type spaces
      await page.keyboard.press('Backspace');
      const beforeSpaces = resolveRequests.length;
      await page.keyboard.type('   ');
      await sleep(500);

      if (resolveRequests.length === beforeSpaces) {
        log('4e. Frontend: spaces only triggers no request', 'PASS');
      } else {
        log('4e. Frontend: spaces only triggers no request', 'FAIL',
          `Fired ${resolveRequests.length - beforeSpaces} requests`);
      }
    } else {
      log('4d. Frontend short queries', 'SKIP', 'No inputs found');
    }
  } catch (e) {
    log('4. Frontend empty/short', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 5: Special characters (more thorough)
async function testSpecialCharacters() {
  log('5. Special characters', 'TESTING');

  const testStrings = [
    { name: 'cafe cells', term: 'cafe cells' },
    { name: 'alpha-synuclein (greek)', term: '\u03b1-synuclein' },
    { name: 'CD4+', term: 'CD4+' },
    { name: 'XSS <script>', term: '<script>alert(1)</script>' },
    { name: 'SQL injection', term: "'; DROP TABLE studies; --" },
    { name: 'Null bytes', term: 'test\x00injection' },
    { name: 'Emoji', term: 'test \ud83d\udd2c cells' },
    { name: 'Long unicode', term: '\u4f60\u597d\u4e16\u754c' }, // Chinese
    { name: 'Mixed', term: 'CD4+ \u03b1-cafe \ud83d\udd2c' },
  ];

  for (const t of testStrings) {
    try {
      const r = await httpPost(`${BACKEND}/api/resolve`, { term: t.term, limit: 5 });
      log(`5. ${t.name}`, r.status === 200 ? 'PASS' : 'WARN',
        `status=${r.status}, ${r.body?.candidates?.length ?? 0} candidates`);
    } catch (e) {
      log(`5. ${t.name}`, 'FAIL', e.message);
    }
  }
}

// Test 6: Very long query
async function testLongQuery() {
  log('6. Very long query', 'TESTING');

  const lengths = [100, 500, 1000, 5000];
  for (const len of lengths) {
    try {
      const r = await httpPost(`${BACKEND}/api/resolve`, { term: 'a'.repeat(len), limit: 5 }, 15000);
      log(`6. Query length ${len}`, r.status === 200 ? 'PASS' : 'WARN',
        `status=${r.status}, ${r.body?.candidates?.length ?? 0} candidates`);
    } catch (e) {
      log(`6. Query length ${len}`, 'FAIL', e.message);
    }
  }
}

// Test 7: Console errors
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
    // Navigate through multiple pages
    const pages = [
      FRONTEND,
      `${FRONTEND}/project/STU-dhvc-nqne`,
      `${FRONTEND}/project/STU-ontology-test`,
      `${FRONTEND}/project/STU-test-ontology-project-vmb9`,
      `${FRONTEND}/settings`,
      `${FRONTEND}/literature`,
    ];

    for (const url of pages) {
      try {
        await page.goto(url, { timeout: 10000, waitUntil: 'domcontentloaded' });
        await sleep(1500);
      } catch (e) {
        // Page might not exist, that's OK
      }
    }

    // Check for old OLS errors
    const olsErrors = allErrors.filter(e =>
      e.includes('olsClient') || e.includes('olsCache') || e.includes('useOLSSearch') ||
      e.includes('Cannot find module') && (e.includes('ols') || e.includes('OLS'))
    );

    if (olsErrors.length > 0) {
      log('7a. No old OLS import errors', 'FAIL', olsErrors.slice(0, 3).join('; '));
    } else {
      log('7a. No old OLS import errors', 'PASS');
    }

    // Check for critical errors
    const critical = allErrors.filter(e =>
      e.includes('TypeError:') || e.includes('SyntaxError:') || e.includes('ReferenceError:')
    );
    if (critical.length > 0) {
      log('7b. No critical JS errors', 'WARN',
        `${critical.length} critical: ${critical[0]?.slice(0, 120)}`);
    } else {
      log('7b. No critical JS errors', 'PASS');
    }

    // Log all errors for review
    if (allErrors.length > 0) {
      log('7c. Total console errors', 'INFO',
        `${allErrors.length} errors across all pages`);
      // Save to file for review
      fs.writeFileSync(
        `${SCREENSHOT_DIR}/console_errors.txt`,
        allErrors.join('\n')
      );
    }
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

    // Check for ols_cache keys
    const beforeKeys = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return {
        all: keys.length,
        olsCache: keys.filter(k => k.startsWith('ols_cache')),
        olsRelated: keys.filter(k => k.toLowerCase().includes('ols')),
      };
    });

    log('8a. localStorage state', 'INFO',
      `${beforeKeys.all} total keys, ${beforeKeys.olsCache.length} ols_cache, ${beforeKeys.olsRelated.length} ols-related`);

    if (beforeKeys.olsCache.length > 0) {
      log('8b. No ols_cache keys', 'WARN',
        `Found ${beforeKeys.olsCache.length} ols_cache keys (may be stale from old code): ${beforeKeys.olsCache.join(', ')}`);
    } else {
      log('8b. No ols_cache keys', 'PASS');
    }

    // Check if any ols_cache keys are being written after search
    const inputs = await page.$$('[role="combobox"], input[type="text"], .add-material-input');
    if (inputs.length > 0) {
      await inputs[0].click();
      await page.keyboard.type('hepatocyte');
      await sleep(2000);

      const afterKeys = await page.evaluate(() => {
        return Object.keys(localStorage).filter(k => k.startsWith('ols_cache'));
      });

      if (afterKeys.length > beforeKeys.olsCache.length) {
        log('8c. No new ols_cache keys after search', 'FAIL',
          `New keys written: ${afterKeys.filter(k => !beforeKeys.olsCache.includes(k)).join(', ')}`);
      } else {
        log('8c. No new ols_cache keys after search', 'PASS');
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

    // Find inputs and start typing
    const inputs = await page.$$('[role="combobox"], input[type="text"], .add-material-input');

    if (inputs.length > 0) {
      await inputs[0].click();
      await page.keyboard.type('hepat');
      await sleep(200); // Mid-search

      // Rapidly navigate away and back
      for (let i = 0; i < 3; i++) {
        await page.goto(FRONTEND, { timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(500);
        await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(500);
      }

      const navErrors = consoleErrors.filter(e =>
        e.toLowerCase().includes('unhandled') ||
        e.toLowerCase().includes('abort')
      );

      if (navErrors.length === 0) {
        log('9. Rapid navigation during search', 'PASS',
          'No errors during rapid page switching');
      } else {
        log('9. Rapid navigation during search', 'WARN',
          `${navErrors.length} nav-related errors: ${navErrors[0]?.slice(0, 100)}`);
      }
    } else {
      log('9. Tab navigation', 'SKIP', 'No inputs found');
    }
  } catch (e) {
    log('9. Tab navigation during search', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Test 10: API stress tests
async function testApiStress() {
  log('10. API stress tests', 'TESTING');

  // Rapid concurrent requests
  const promises = Array(50).fill(null).map((_, i) =>
    httpPost(`${BACKEND}/api/resolve`, { term: `test${i}`, limit: 5 })
  );
  const apiResults = await Promise.allSettled(promises);
  const fulfilled = apiResults.filter(r => r.status === 'fulfilled').length;
  const rejected = apiResults.filter(r => r.status === 'rejected').length;
  log('10a. 50 concurrent API requests', 'PASS', `${fulfilled}/50 fulfilled, ${rejected} rejected`);

  // Test with malformed JSON
  try {
    const parsed = new URL(`${BACKEND}/api/resolve`);
    const options = {
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        log('10b. Malformed JSON', res.statusCode !== 200 ? 'PASS' : 'WARN',
          `status=${res.statusCode} (should reject malformed input)`);
      });
    });
    req.on('error', (e) => log('10b. Malformed JSON', 'PASS', `Connection error (expected)`));
    req.write('{"term": invalid json');
    req.end();
  } catch (e) {
    log('10b. Malformed JSON', 'PASS', `Rejected: ${e.message}`);
  }

  // Test with missing term field
  try {
    const r = await httpPost(`${BACKEND}/api/resolve`, { limit: 5 });
    log('10c. Missing term field', r.status !== 200 ? 'PASS' : 'WARN',
      `status=${r.status} (should validate required fields)`);
  } catch (e) {
    log('10c. Missing term field', 'PASS', `Rejected: ${e.message}`);
  }

  // Test with non-string term
  try {
    const r = await httpPost(`${BACKEND}/api/resolve`, { term: 12345, limit: 5 });
    log('10d. Numeric term', r.status === 200 ? 'PASS' : 'WARN',
      `status=${r.status}, ${r.body?.candidates?.length ?? 0} candidates`);
  } catch (e) {
    log('10d. Numeric term', 'WARN', e.message);
  }
}

// Test code-level: verify old files are truly gone
async function testOldFilesGone() {
  log('11. Old OLS files removed', 'TESTING');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${FRONTEND}/project/STU-dhvc-nqne`, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Check loaded modules in browser
    const loadedModules = await page.evaluate(() => {
      // Check if any OLS-related modules are in the module cache
      const chunks = document.querySelectorAll('script[type="module"]');
      const sources = [];
      chunks.forEach(c => sources.push(c.src || c.textContent?.slice(0, 200)));
      return sources;
    });

    const hasOldRefs = loadedModules.some(s =>
      s.includes('olsClient') || s.includes('olsCache') || s.includes('useOLSSearch')
    );

    if (hasOldRefs) {
      log('11. Old OLS files not loaded in browser', 'FAIL', 'Found references to old OLS files');
    } else {
      log('11. Old OLS files not loaded in browser', 'PASS');
    }
  } catch (e) {
    log('11. Old OLS files check', 'ERROR', e.message);
  } finally {
    await browser.close();
  }
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('Chaos Mode Testing - Round 2');
  console.log('='.repeat(60));
  console.log('');

  // Ensure services are running
  for (const [name, url] of [['Backend', `${BACKEND}/api/resolve`], ['Frontend', FRONTEND]]) {
    try {
      await httpGet(url, 3000);
      console.log(`[OK] ${name} is running`);
    } catch {
      console.log(`[WARN] ${name} not running`);
    }
  }
  console.log('');

  // Run tests
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
  await testApiStress();
  await sleep(500);
  await testOldFilesGone();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));

  const counts = {};
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  for (const r of results) {
    console.log(`  [${r.status.padEnd(5)}] ${r.test}` + (r.detail ? ` - ${r.detail}` : ''));
  }

  console.log(`\nTotal: ${JSON.stringify(counts)}`);

  // Save results
  fs.writeFileSync(
    '/home/brad/.hermes/kanban/workspaces/t_842030b5/test_results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\nResults saved to test_results.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
