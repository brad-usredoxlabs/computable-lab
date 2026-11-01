/**
 * trunk-journeys — unit tests (spec work item 8).
 *
 * Two mandated fail-closed legs:
 *   (1) YAML parsing/validation — a MALFORMED journey fails closed (load +
 *       validate throw; the driver never runs a journey it can't parse).
 *   (2) banned-interception self-check — a fixture config that intercepts
 *       /api/ai/** makes the driver REFUSE (assertNoBannedInterception throws).
 * Plus the interpolation/pointer helpers the interpreter relies on.
 *
 * Run: npx tsx run-trunk-journeys.test.ts   (asserts; throws on any failure)
 */
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  validateJourneyFile,
  loadJourneyFile,
  readPointer,
  interpolate,
  JourneyError,
  runStep,
  type RunnerCtx,
} from './lib/journey.js';
import { checkGreen } from './check-green.js';
import {
  scanForBannedInterception,
  assertNoBannedInterception,
  BANNED_INTERCEPTION_PATTERNS,
} from './lib/selfcheck.js';

let failures = 0;
let passes = 0;
function ok(cond: unknown, label: string): void {
  if (cond) {
    passes++;
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
function throws(fn: () => unknown, label: string): void {
  try {
    fn();
    failures++;
    console.log(`  FAIL (did not throw) ${label}`);
  } catch {
    passes++;
    console.log(`  ok  (threw) ${label}`);
  }
}

console.log('\n[1] YAML parsing/validation — malformed journey fails closed');
// (a) not an object
throws(() => validateJourneyFile('just a string'), 'validate rejects a non-object doc');
throws(() => validateJourneyFile(42), 'validate rejects a number doc');
// (b) no journeys array
throws(() => validateJourneyFile({}), 'validate rejects a doc with no journeys');
throws(() => validateJourneyFile({ journeys: [] }), 'validate rejects an empty journeys array');
// (c) journey without id
throws(() => validateJourneyFile({ journeys: [{ steps: [{ kind: 'seed' }] }] }), 'validate rejects a journey without id');
// (d) journey without steps
throws(() => validateJourneyFile({ journeys: [{ id: 'X' }] }), 'validate rejects a journey without steps');
// (e) step without kind
throws(() => validateJourneyFile({ journeys: [{ id: 'X', steps: [{ method: 'GET' }] }] }), 'validate rejects a step without kind');
// (f) unknown step kind
throws(
  () => validateJourneyFile({ journeys: [{ id: 'X', steps: [{ kind: 'teleport' }] }] }),
  'validate rejects an unknown step kind',
);
// (g) browser step without actions
throws(
  () => validateJourneyFile({ journeys: [{ id: 'X', steps: [{ kind: 'browser' }] }] }),
  'validate rejects a browser step without actions',
);
// (h) api step without path
throws(
  () => validateJourneyFile({ journeys: [{ id: 'X', steps: [{ kind: 'api', method: 'GET' }] }] }),
  'validate rejects an api step without path',
);
// (i) a VALID doc passes
const valid = validateJourneyFile({
  journeys: [
    {
      id: 'J1',
      steps: [
        { kind: 'seed' },
        { kind: 'api', path: '/api/records/x' },
        { kind: 'browser', actions: [{ goto: '/runs' }] },
      ],
    },
  ],
});
ok(valid.journeys.length === 1 && valid.journeys[0].id === 'J1', 'validate accepts a well-formed journey');

console.log('\n[2] loadJourneyFile — malformed YAML on disk fails closed');
const tmp = mkdtempSync(join(tmpdir(), 'tj-test-'));
writeFileSync(join(tmp, 'bad.yaml'), 'journeys: [ { id: J1, steps: [ { kind: "seed" } ] },\n  # a stray colon-in-scalar breaks the map\nbroken: : not a map\n');
throws(() => loadJourneyFile(join(tmp, 'bad.yaml')), 'loadJourneyFile throws on malformed YAML text');
// a syntactically-valid-but-structurally-wrong file
writeFileSync(join(tmp, 'wrongkind.yaml'), 'journeys:\n  - id: J1\n    steps:\n      - kind: "teleport"\n');
throws(() => loadJourneyFile(join(tmp, 'wrongkind.yaml')), 'loadJourneyFile throws on an unknown step kind');

console.log('\n[3] readPointer / interpolate helpers');
ok(readPointer({ a: { b: { c: 7 } } }, 'a.b.c') === 7, 'readPointer nested');
ok(readPointer({ a: 1 }, 'a.zzz') === undefined, 'readPointer missing -> undefined');
ok(readPointer(null, 'a.b') === undefined, 'readPointer null root -> undefined');
ok(interpolate('hello {{name}}', { name: 'world' }) === 'hello world', 'interpolate single var');
ok(interpolate('{{a}}-{{a}}', { a: 'x' }) === 'x-x', 'interpolate repeated var');
throws(() => interpolate('no {{missing}} here', {}), 'interpolate fails closed on a missing var');
ok(interpolate('no vars', {}) === 'no vars', 'interpolate passthrough when no vars');

console.log('\n[4] banned-interception self-check — /api/ai/** interception REFUSED');
// The banned path is assembled at RUNTIME from parts so THIS source file
// never contains the verb-adjacent literal the scanner matches (no exemption
// loophole: the self-check scans every harness file, including this test).
const AI = '/api/' + 'ai';
// (a) legitimate lines must NOT trip the scanner (no false positive)
const legitFiles = [
  { path: 'driver.ts', content: 'const run = await apiClient.getAnalysisRun(id);\nconst r = await fetch("http://localhost:3094/api/analysis-runs/x/execute", {method:"POST"});\n// NOTE: the AI HTTP surface interception is BANNED by policy.\nconst rev = await apiClient.createRevision(input);' },
  { path: 'journeys.yaml', content: '# journeys do not call AI\n- kind: api\n  path: /api/analysis-runs/{{id}}\n' },
];
ok(scanForBannedInterception(legitFiles).length === 0, 'legit /api/analysis-runs + comment mentions do NOT trip the scanner');
// (b) banned interceptions MUST trip it (fixture content assembled at runtime)
const bannedFiles = [
  { path: 'bad1.ts', content: `await page.route("**${AI}/**", (r) => r.fulfill({ json: {} }));` },
  { path: 'bad2.ts', content: `context.route("**${AI}/chat", handler);` },
  { path: 'bad3.ts', content: `route('${AI}/author', fakeHandler);` },
  { path: 'bad4.ts', content: `const s = setupServer(); // prefix: "${AI}/author"` },
];
const violations = scanForBannedInterception(bannedFiles);
ok(violations.length >= 4, `banned interceptions detected (${violations.length} findings)`);
ok(
  violations.every((v) => v.file.startsWith('bad')),
  'every finding is on a banned file (no legit false positive)',
);
// (c) the assert FAILS CLOSED (throws) on any violation
throws(() => assertNoBannedInterception(violations), 'assertNoBannedInterception throws on violations');
// (d) the assert PASSES on an empty set
try {
  assertNoBannedInterception([]);
  passes++;
  console.log('  ok  assertNoBannedInterception passes on an empty set');
} catch {
  failures++;
  console.log('  FAIL (threw unexpectedly) assertNoBannedInterception empty set');
}
// (e) the pattern list itself is non-empty (the DATA is declared)
ok(BANNED_INTERCEPTION_PATTERNS.length >= 3, `banned pattern list is declared (${BANNED_INTERCEPTION_PATTERNS.length} patterns)`);

console.log('\n[5] JourneyError carries journey + step context');
try {
  throw new JourneyError('J1', 'attach-real-dotd', 'boom');
} catch (e) {
  const je = e as JourneyError;
  ok(je.journeyId === 'J1' && je.stepName === 'attach-real-dotd' && /boom/.test(je.message), 'JourneyError has journeyId/stepName/message');
}

// ============================================================================
// FIX-RUN LEGS (adversarial gate D1/D5/D6/D10 + D4 attribution + D2/D3/D7
// driver-source invariants). These FAIL before the harness fixes land.
// ============================================================================

// --- [6] checkGreen (the RED-BLOCKS-CLAIMS gate) — D1/D6/D7 ---
function verdictFile(root: string, dir: string, obj: unknown, mtimeMs?: number): string {
  const d = join(root, dir);
  mkdirSync(d, { recursive: true });
  const p = join(d, 'journeys-verdict.json');
  writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2), 'utf8');
  if (mtimeMs !== undefined) utimesSync(d, mtimeMs / 1000, mtimeMs / 1000);
  return p;
}
const T0 = 1_750_000_000_000; // 2025-06-15-ish, far in the past -> mtimes are the ordering signal

console.log('\n[6] checkGreen — the claim gate fails closed (D1/D6/D7)');
{
  // full green set -> 0
  const g = mkdtempSync(join(tmpdir(), 'tj-cg-green-'));
  verdictFile(g, '2026-10-31T100000000-abc1', { result: 'green', journeys: [{ id: 'J1', result: 'green' }, { id: 'J2', result: 'green' }], declaredJourneys: ['J1', 'J2'] }, T0 + 1000);
  const rGreen = checkGreen(g);
  ok(rGreen.code === 0, `checkGreen full-green set -> 0 (got ${rGreen.code})`);

  // full red set -> 1
  const r = mkdtempSync(join(tmpdir(), 'tj-cg-red-'));
  verdictFile(r, '2026-10-31T100000000-abc2', { result: 'red', journeys: [{ id: 'J1', result: 'red', failed_step: 'chromatogram-non-blank' }], declaredJourneys: ['J1'] }, T0 + 1000);
  const rRed = checkGreen(r);
  ok(rRed.code === 1, `checkGreen red verdict -> 1 (got ${rRed.code})`);

  // corrupt newest verdict -> non-zero (distinct fail-closed code)
  const c = mkdtempSync(join(tmpdir(), 'tj-cg-corrupt-'));
  verdictFile(c, '2026-10-31T100000000-abc3', '{ "result": "green", journeys: [CORRUPT', T0 + 1000);
  const rCorrupt = checkGreen(c);
  ok(rCorrupt.code !== 0, `checkGreen corrupt newest verdict -> non-zero (got ${rCorrupt.code})`);

  // D1 core: NEWEST dir has NO verdict, an OLDER dir has a green verdict
  // -> must NOT read the older green (the dead run must block claims).
  const d1 = mkdtempSync(join(tmpdir(), 'tj-cg-newest-no-verdict-'));
  verdictFile(d1, '2026-10-31T100000000-abc4', { result: 'green', journeys: [{ id: 'J1', result: 'green' }, { id: 'J2', result: 'green' }], declaredJourneys: ['J1', 'J2'] }, T0 + 1000);
  mkdirSync(join(d1, '2026-10-31T110000000-abc5'), { recursive: true }); // newest: a run dir with NO verdict file
  utimesSync(join(d1, '2026-10-31T110000000-abc5'), (T0 + 9000) / 1000, (T0 + 9000) / 1000);
  const rD1 = checkGreen(d1);
  ok(rD1.code !== 0, `checkGreen newest-dir-no-verdict (older green exists) -> non-zero (got ${rD1.code})`);

  // D7: a green verdict for a PARTIAL declared set (only J1 of J1+J2) -> NOT overall green
  const p1 = mkdtempSync(join(tmpdir(), 'tj-cg-partial-'));
  verdictFile(p1, '2026-10-31T100000000-abc6', { result: 'green', journeys: [{ id: 'J1', result: 'green' }], declaredJourneys: ['J1', 'J2'] }, T0 + 1000);
  const rPartial = checkGreen(p1);
  ok(rPartial.code !== 0, `checkGreen partial green set (J1 of J1+J2 declared) -> non-zero (got ${rPartial.code})`);

  // explicit scoped run (declaredJourneys == run set) is gated normally: green -> 0
  const s1 = mkdtempSync(join(tmpdir(), 'tj-cg-scoped-'));
  verdictFile(s1, '2026-10-31T100000000-abc7', { result: 'green', journeys: [{ id: 'J1', result: 'green' }], declaredJourneys: ['J1'] }, T0 + 1000);
  const rScoped = checkGreen(s1);
  ok(rScoped.code === 0, `checkGreen explicitly-scoped green run (scope J1, ran J1) -> 0 (got ${rScoped.code})`);

  // no run dirs at all -> permissive explicit policy: 0 (nothing has run)
  const none = mkdtempSync(join(tmpdir(), 'tj-cg-none-'));
  const rNone = checkGreen(none);
  ok(rNone.code === 0, `checkGreen no run dirs at all -> 0 (explicit permissive policy, got ${rNone.code})`);
}

// --- [7] interpolate — fail closed on ANY unresolvable placeholder (D5/D6) ---
console.log('\n[7] interpolate — strict placeholder grammar (D5)');
{
  const vars = { 'seed.gcMethod': 'GCM-X', entryId: 'ENT-1' };
  ok(interpolate('a {{seed.gcMethod}} b', vars) === 'a GCM-X b', 'interpolate resolves a DOT-SEEDED var name (trimmed-name lookup)');
  ok(interpolate('a {{entryId}} b', vars) === 'a ENT-1 b', 'interpolate resolves a flat var');
  throws(() => interpolate('{{}}', vars), 'interpolate throws on EMPTY placeholder {{}}');
  throws(() => interpolate('{{ rand }}', vars), 'interpolate throws on a WHITESPACE name (unknown after trim)');
  throws(() => interpolate('x{{missing}}y', vars), 'interpolate throws when a placeholder is embedded mid-string');
  throws(() => interpolate('{{}} ok', vars), 'interpolate throws on a residual {{ }} even with valid vars present');
}

// --- [8] self-check — the idiomatic bypass shapes are caught (D10) ---
console.log('\n[8] self-check — regex-literal / split-string / axios bypasses caught (D10)');
{
  const bypassFiles = [
    { path: 'bypass1.ts', content: `await page.route(/\\/api\\/ai\\//, (r) => r.fulfill({ json: {} }));` },
    { path: 'bypass2.ts', content: `const host = 'http://x'; const res = await fetch(host + '/api/' + 'ai' + '/chat', { method: 'GET' });` },
    { path: 'bypass3.ts', content: `axios.post(\`http://x/api/ai/author\`, body);` },
    { path: 'bypass4.ts', content: `page.route(new RegExp('/api/ai/'), handler);` },
  ];
  const bypassViolations = scanForBannedInterception(bypassFiles);
  const caughtFiles = new Set(bypassViolations.map((v) => v.file));
  ok(caughtFiles.has('bypass1.ts'), 'selfcheck catches a REGEX-LITERAL route intercepting the AI surface');
  ok(caughtFiles.has('bypass2.ts'), 'selfcheck catches a SPLIT-STRING fetch of the AI surface');
  ok(caughtFiles.has('bypass3.ts'), 'selfcheck catches an AXIOS call to the AI surface');
  ok(caughtFiles.has('bypass4.ts'), 'selfcheck catches a RegExp-constructor route on the AI surface');
  // the legit fixture from section [4] must STILL be clean (no false-positive regression)
  const legitClean = scanForBannedInterception([
    { path: 'driver.ts', content: 'const run = await apiClient.getAnalysisRun(id);\nconst r = await fetch("http://localhost:3094/api/analysis-runs/x/execute", {method:"POST"});\n// NOTE: the AI HTTP surface interception is BANNED by policy.\nconst rev = await apiClient.createRevision(input);' },
  ]);
  ok(legitClean.length === 0, 'selfcheck still does NOT flag legit analysis-run fetches / prose mentions');
}

// --- [9] runStep / assertExpect / failed-step attribution (D4/D6) ---
console.log('\n[9] runStep / assertExpect / attribution (D4/D6)');
{
  const store: Record<string, unknown> = {
    rec1: { recordId: 'rec1', schemaId: 's', payload: { kind: 'x', count: 3, names: ['a', 'b'], label: 'ok' } },
  };
  const server = createServer((req, res) => {
    const id = (req.url ?? '').replace(/^\/api\/records\//, '');
    const entry = store[id] as { recordId?: string; schemaId?: string; payload?: unknown } | undefined;
    res.setHeader('content-type', 'application/json');
    if (entry) res.end(JSON.stringify({ record: { recordId: id, schemaId: 's', payload: entry.payload } }));
    else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const backend = `http://127.0.0.1:${port}`;

  function fakeCtx(vars: Record<string, unknown> = {}) {
    const logLines: string[] = [];
    const page = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'url') return () => 'http://127.0.0.1:1/';
        return (..._args: unknown[]) => (prop === 'evaluate' ? Promise.resolve(42) : Promise.resolve());
      },
    });
    const ctx: RunnerCtx = {
      backend,
      worktree: '/tmp',
      mountDir: '/tmp',
      screenshotsDir: '/tmp',
      rand: 'test0001',
      vars,
      page: page as RunnerCtx['page'],
      log: (j, s, line) => { logLines.push(`[${j}] ${s}: ${line}`); },
      current: '',
    };
    return { ctx, logLines };
  }

  // assertExpect — eq passes, then each failing mode throws a JourneyError naming the step
  {
    const { ctx } = fakeCtx();
    await runStep({ kind: 'api', name: 'read-rec', path: '/api/records/rec1', expect: { eq: [{ path: 'record.payload.count', eq: 3 }] } } as never, ctx, 'J1');
    ok(ctx.current === 'read-rec', 'runStep sets ctx.current to the executing step name (attribution tag)');
  }
  const failing: Array<{ expect: Record<string, unknown>; label: string }> = [
    { expect: { eq: [{ path: 'record.payload.count', eq: 99 }] }, label: 'eq mismatch' },
    { expect: { nonEmpty: ['record.payload.missingArr'] }, label: 'nonEmpty on missing' },
    { expect: { nonEmpty: ['record.payload.names'] }, label: 'nonEmpty on a populated array (must PASS)' },
    { expect: { exists: ['record.payload.absent'] }, label: 'exists on missing' },
    { expect: { js: '(json) => json.record.payload.count === 99' }, label: 'js predicate false' },
  ];
  for (const f of failing) {
    const { ctx } = fakeCtx();
    const mustThrow = f.label.startsWith('nonEmpty on a populated');
    let threw = false;
    try {
      await runStep({ kind: 'api', name: 'read-rec', path: '/api/records/rec1', expect: f.expect } as never, ctx, 'J1');
    } catch (e) {
      threw = true;
      if (mustThrow) throw new Error('test harness error: expected pass but threw: ' + (e as Error).message);
      if (!(e instanceof JourneyError) || e.stepName !== 'read-rec') throw new Error(`test harness error: wrong error for ${f.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (mustThrow) {
      ok(!threw, `assertExpect ${f.label} -> no throw`);
    } else {
      ok(threw, `assertExpect ${f.label} -> throws a JourneyError named after the step`);
    }
  }
  // D4: entry-logged actions (screenshot) must NOT mask the failing assert —
  // a browser step [screenshot, assertJs(fail)] must leave ctx.current pointing
  // at the FAILING action's tag (assertJs's name), not the last entry-logged one.
  {
    const page = new Proxy({}, {
      get: (_t, prop: string) =>
        prop === 'url'
          ? () => 'http://127.0.0.1:1/'
          : (..._args: unknown[]) => (prop === 'evaluate' ? Promise.resolve(false) : Promise.resolve()),
    });
    const logLines: string[] = [];
    const ctx: RunnerCtx = {
      backend, worktree: '/tmp', mountDir: '/tmp', screenshotsDir: '/tmp',
      rand: 'test0002', vars: {}, page: page as RunnerCtx['page'],
      log: (j, s, line) => { logLines.push(`[${j}] ${s}: ${line}`); },
      current: 'execute-and-chromatogram',
    };
    let threw = false;
    try {
      await runStep(
        {
          kind: 'browser',
          name: 'execute-and-chromatogram',
          actions: [
            { screenshot: 'j1-chromatogram' },
            { assertJs: { name: 'chromatogram-non-blank', expr: 'false' } },
          ],
        } as never,
        ctx,
        'J1',
      );
    } catch {
      threw = true;
    }
    ok(threw, 'browser step: a failing assertJs throws (red leg)');
    ok(
      ctx.current === 'chromatogram-non-blank',
      `failed-step attribution: ctx.current names the failing assert (got ${JSON.stringify(ctx.current)}, last log line was '${logLines.at(-1) ?? ''}')`,
    );
  }
  server.close();
}

// --- [10] D2 isolation gate + D2/D3 driver-source invariants ---
console.log('\n[10] isolation-violated gate + driver-source invariants (D2/D3)');
{
  // check-green: a verdict that records isolation:'violated' blocks even when
  // the journeys are green (D2: the machine signal must enforce the hard rule).
  const iv = mkdtempSync(join(tmpdir(), 'tj-cg-isolation-'));
  verdictFile(iv, '2026-10-31T100000000-abc8', {
    result: 'green',
    journeys: [{ id: 'J1', result: 'green' }, { id: 'J2', result: 'green' }],
    declaredJourneys: ['J1', 'J2'],
    isolation: 'violated',
  }, T0 + 1000);
  const rIso = checkGreen(iv);
  ok(rIso.code !== 0, `checkGreen isolation:'violated' (green journeys) -> non-zero (got ${rIso.code})`);

  // D2 source invariant: the isolation proof is computed BEFORE the verdict
  // write, and the verdict's result is gated on the proof (overallGreen
  // includes isolationOk). Read the driver source directly — the behavioral
  // proof is the live re-run, but the ORDER is a source property.
  const here = dirname(fileURLToPath(import.meta.url));
  const driver = readFileSync(join(here, 'run-trunk-journeys.ts'), 'utf8');
  const isoBefore = driver.indexOf('const liveAfter = await dirDigest(liveDir)');
  const verdictWrite = driver.indexOf("writeFile(join(runRoot, 'journeys-verdict.json')");
  ok(isoBefore !== -1 && verdictWrite !== -1 && isoBefore < verdictWrite, 'D2: isolation digest (liveAfter) computed BEFORE the verdict write');
  const overallGreenDecl = driver.match(/const overallGreen = journeysGreen && isolationOk;/);
  ok(overallGreenDecl !== null, 'D2: verdict result is gated on the isolation proof (overallGreen = journeysGreen && isolationOk)');

  // D3 source invariant: the receipt stamp + seed rand never derive from a
  // minute-precision clock alone.
  ok(!driver.includes('function tsStamp'), 'D3: the old minute-precision tsStamp is gone');
  ok(/ts: `\$\{sec\}-\$\{rand\}`/.test(driver) && /randomBytes\(4\)/.test(driver), 'D3: receipt dir = ms stamp + crypto suffix; rand is randomBytes (never clock-derived)');
}

console.log(`\nRESULT: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
