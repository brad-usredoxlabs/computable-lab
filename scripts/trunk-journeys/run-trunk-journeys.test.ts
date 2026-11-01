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
  journeyOutcome,
  type RunnerCtx,
} from './lib/journey.js';
import { checkGreen } from './check-green.js';
import {
  scanForBannedInterception,
  assertNoBannedInterception,
  BANNED_INTERCEPTION_PATTERNS,
} from './lib/selfcheck.js';
// FIX RUN 2 (defect 2): exercise the REAL ensureActorUser 409 path against a
// stub backend (both list orderings + the empty-list fail-closed case).
import { ensureActorUser, ACTOR_ID, ACTOR_USERNAME } from './lib/seed.js';

let failures = 0;
let passes = 0;
const here = dirname(fileURLToPath(import.meta.url));
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
  // The banned path is assembled at RUNTIME from parts (as in section [4])
  // so THIS source file never carries the banned verb+path shapes the
  // hardened patterns now match — the driver self-checks its own files,
  // including this test.
  const AI = '/api/' + 'ai';
  const reEsc = AI.replace(/\//g, '\\/'); // backslash-escaped slashes (regex-literal form)
  const bypassFiles = [
    { path: 'bypass1.ts', content: `await page.route(/${reEsc}/, (r) => r.fulfill({ json: {} }));` },
    { path: 'bypass2.ts', content: ['await fetch(host + ', `'/api/'`, ` + `, `'ai'`, ` + '/chat', { method: 'GET' });`].join('') },
    { path: 'bypass3.ts', content: `axios.post(\`http://x${AI}/author\`, body);` },
    { path: 'bypass4.ts', content: `page.route(new RegExp('${AI}/'), handler);` },
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
  // FIX RUN 2 / defect 3 — the RECORDING of failed_step goes through
  // journeyOutcome (the driver's red path), not the last LOGGED line. The
  // gate's exact symptom: a screenshot entry-logged just before a failing
  // assert meant the last-log parse reported the screenshot path, not the
  // assert. This leg runs the SAME screenshot-then-failing-assert sequence
  // and asserts the RECORDED failed_step (journeyOutcome output) — not just
  // the input ctx.current the old [9] leg checked (journeyOutcome was
  // imported by no test).
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
      rand: 'test0003', vars: {}, page: page as RunnerCtx['page'],
      log: (j, s, line) => { logLines.push(`[${j}] ${s}: ${line}`); },
      current: 'execute-and-chromatogram',
    };
    let caught: Error | undefined;
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
    } catch (e) {
      caught = e instanceof Error ? e : new Error(String(e));
    }
    ok(caught !== undefined, 'D3: the failing assertJs throws (red leg)');
    const outcome = journeyOutcome('J1', ctx, caught ?? new Error('no throw'));
    ok(outcome.result === 'red', 'D3: journeyOutcome records a red result on the thrown step');
    ok(
      outcome.failed_step === 'chromatogram-non-blank',
      `D3: journeyOutcome records failed_step = the failing assert NAME (got ${JSON.stringify(outcome.failed_step)})`,
    );
    // The last LOGGED line is the screenshot path (entry-logging) — the OLD
    // last-log attribution would have reported THAT, not the assert. Proves
    // the recorded field diverges from the log line (the gate's symptom).
    ok(
      (logLines.at(-1) ?? '').includes('screenshot'),
      `D3: the last LOGGED line is the screenshot (so a last-log parse would mis-report; journeyOutcome does not)`,
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

// --- [11] D8/D9 knowledge-layer integrity invariants (seed source) ---
console.log('\n[11] D8/D9 seed knowledge-layer integrity (source invariants)');
{
  const seedSrc = readFileSync(join(here, 'lib', 'seed.ts'), 'utf8');
  // D8: the mislabeled external CURIEs the gate verified are GONE, and no
  // invented external ontology id is written into the knowledge layer.
  // (The claim triple uses the registry-verified GO/RO terms; entered_by is
  // a record ref to the harness actor.)
  ok(!/CHEBI:24431/.test(seedSrc), 'D8: CHEBI:24431 ("chemical entity") no longer labeled as the person actor');
  ok(!/GO:0035004/.test(seedSrc), 'D8: GO:0035004 (obsolete PI3K term) no longer labeled a chromatographic peak');
  ok(!/RO:0002200/.test(seedSrc), 'D8: RO:0002200 ("part of" / "has phenotype" — wrong predicate) is gone');
  ok(!/entered_by: \{ kind: 'ontology'/.test(seedSrc), 'D8: entered_by is a RECORD ref, not an ontology ref');
  ok(/entered_by: \{ kind: 'record', id: ACTOR_ID/.test(seedSrc), 'D8: entered_by = record ref to the harness actor');
  // FIX RUN 2 / defect 1: the D8-repair biology triple (GO:0006635 -RO:0002411->
  // GO:0006979) was incoherent with the claim's TITLE ("GC peak claim") and the
  // assertion that CITES it ("the GC run shows the expected analyte peak(s)",
  // outcome.measure = peak_presence) — the context's subject is a GC SAMPLE,
  // which a beta-oxidation->oxidative-stress biology triple does not describe.
  // The claim is now a coherent MEASUREMENT relationship (the gate's allowed
  // shape: a real analyte/measurement entity with a registry-legal predicate
  // for the GC context, a documented cf: local-term pair): the GC
  // peak-integration measurement CL:measures the analyte-peak-presence
  // quantity. title / statement / triple / the citing assertion are
  // single-meaning (the measurement the GC run performed). The biology terms
  // are GONE (a GC sample does not beta-oxidize), the registry-legal predicate
  // CL:measures (Measurement & Assay family, subject_kinds incl. 'measurement',
  // object_kinds incl. 'quantity') is PRESENT, the documented cf: local-term
  // pair is PRESENT, and the claim TITLE names the measurement (the old
  // "GC peak claim" title + unrelated statement are gone).
  ok(!/GO:0006635/.test(seedSrc) && !/GO:0006979/.test(seedSrc) && !/RO:0002411/.test(seedSrc), 'D1-fix: the incoherent beta-oxidation->oxidative-stress biology triple (a GC sample does not beta-oxidize) is GONE from the claim');
  ok(/id: 'CL:measures'/.test(seedSrc), 'D1-fix: the claim predicate is the REGISTRY-LEGAL CL:measures (Measurement & Assay; subject=measurement, object=quantity)');
  ok(/id: 'cf:gc-peak-analysis'/.test(seedSrc) && /id: 'cf:analyte-peak-presence'/.test(seedSrc), 'D1-fix: the claim triple = a documented cf: LOCAL TERM PAIR (measurement -> measured quantity), per the repo cf: precedent');
  ok(/title: `trunk-journeys GC peak-integration measurement claim/.test(seedSrc), 'D1-fix: the claim TITLE names the measurement (title and statement are single-meaning — the old "GC peak claim" title + unrelated statement pairing is gone)');
  // The citation is consistent: the assertion's statement names what the claim
  // says (the GC run shows the expected analyte peak(s)), and its
  // outcome.measure (peak_presence) is the quantity the claim's OBJECT
  // measures — title / statement / triple / assertion assert ONE thing.
  ok(/measure: 'peak_presence'/.test(seedSrc), 'D1-fix: the citing assertion\'s outcome.measure (peak_presence) is the quantity the claim measures (the citation is consistent, not an unrelated biology statement)');
  // D9: the context's subject_ref RESOLVES — the sample is minted and the
  // read-back follows subject_ref.
  ok(/const sample = `SMP-TJ-\$\{rand\}`/.test(seedSrc), 'D9: the sample record (SMP-TJ-<rand>) is minted by the seed');
  ok(/subject_ref: \{ kind: 'record', id: sample/.test(seedSrc), 'D9: context subject_ref = the minted sample id');
  ok(/await getRecord\(backend, sample\);/.test(seedSrc), 'D9: the read-back follows subject_ref to the sample (dangling ref fails closed)');
  ok(seedSrc.includes('party, request, sample, gcMethod, engine, revision, claim, context, assertion'), 'D9: the read-back loop covers the full fixture set incl. the subject chain');
}

// --- [12] FIX RUN 2 / defect 3 — the driver's RED path records failed_step
//     via journeyOutcome (not the last logged line). Source/call-site
//     invariant: journeyOutcome is imported AND called in the catch; the OLD
//     last-log attribution (parse the last stepLogLines entry into
//     failed_step) is ABSENT. Neutering the driver's catch back to last-log
//     parsing (the gate's mutant) leaves the recorded-field unit leg [9]
//     still meaningful but is caught here in the source.
console.log('\n[12] driver red-path attribution invariant (D3)');
{
  const driver = readFileSync(join(here, 'run-trunk-journeys.ts'), 'utf8');
  ok(
    /import\s*\{[^}]*\bjourneyOutcome\b[^}]*\}\s*from\s*'\.\/lib\/journey\.js'/.test(driver),
    'D3: the driver IMPORTS journeyOutcome from lib/journey.js',
  );
  const catchOutcome = driver.match(/catch\s*\(\s*err\s*\)\s*\{[\s\S]*?journeyOutcome\(/);
  ok(catchOutcome !== null, 'D3: the driver catch BLOCK calls journeyOutcome( (the red path)');
  // The OLD last-log attribution: parse the last stepLogLines entry into
  // failed_step. It must be GONE (neutered to last-log parsing = the gate's
  // mutant that kept the suite green).
  ok(!driver.includes('jr.failed_step = last'), 'D3: the old last-log failed_step parse (jr.failed_step = last...) is gone');
  ok(!/stepLogLines\.filter\(/.test(driver), 'D3: the old last-log attribution (stepLogLines.filter(...) to find the failing step) is gone');
}

// --- [13] FIX RUN 2 / defect 2 — ensureActorUser 409 idempotency. The REAL
//     exported function against a stub backend (POST /api/users -> 409,
//     GET /api/users -> the user list). The list is UNFILTERED (bootstrap
//     USR-LOCAL-ADMIN first on a populated dir), so the actor must be SELECTED
//     by username/recordId, not taken as the first entry. Both orderings +
//     the empty-list fail-closed case.
console.log('\n[13] ensureActorUser 409 idempotency (D12)');
{
  const actorEntry = { recordId: ACTOR_ID, username: ACTOR_USERNAME, displayName: 'trunk-journeys harness admin', status: 'active' };
  const adminEntry = { recordId: 'USR-LOCAL-ADMIN', username: 'local-admin', displayName: 'local admin', status: 'active' };
  // A stub backend: POST /api/users -> 409 CONFLICT (already exists);
  // GET /api/users -> { users: [...] }.
  function stub409Backend(users: unknown[]) {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const path = (req.url ?? '').split('?')[0];
      if (req.method === 'POST' && path === '/api/users') {
        res.statusCode = 409;
        res.end(JSON.stringify({ error: 'CONFLICT', message: 'User already exists' }));
        return;
      }
      if (req.method === 'GET' && path === '/api/users') {
        res.end(JSON.stringify({ users }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
    return server;
  }
  async function startStub(users: unknown[]): Promise<{ backend: string; close: () => Promise<void> }> {
    const server = stub409Backend(users);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    return { backend: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))) };
  }

  // [A] actor FIRST in the list -> resolves to the actor id (the old code's
  // only working case; must still hold).
  {
    const stub = await startStub([actorEntry, adminEntry]);
    let id: string | undefined;
    let err = '';
    try {
      id = await ensureActorUser(stub.backend);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    ok(id === ACTOR_ID, `D12 409 [A] actor-first list resolves to the actor id (got ${JSON.stringify(id)}${err ? `, threw: ${err.slice(0, 50)}` : ''})`);
    await stub.close().catch(() => {});
  }
  // [B] admin FIRST (realistic: USR-LOCAL-ADMIN exists first), actor second.
  // The OLD code took the first entry-with-any-id (the admin) and threw; the
  // FIXED code selects by username -> resolves the actor.
  {
    const stub = await startStub([adminEntry, actorEntry]);
    let id: string | undefined;
    let err = '';
    try {
      id = await ensureActorUser(stub.backend);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    ok(id === ACTOR_ID, `D12 409 [B] admin-first list (actor second) still resolves to the actor id (got ${JSON.stringify(id)}${err ? `, threw: ${err.slice(0, 50)}` : ''})`);
    await stub.close().catch(() => {});
  }
  // [C] the actor is ABSENT from the list (409 from a different user) -> the
  // idempotent path FAILS CLOSED (errors), never returns a wrong id.
  {
    const stub = await startStub([adminEntry]);
    let threw = false;
    let msg = '';
    try {
      await ensureActorUser(stub.backend);
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    ok(threw, `D12 409 [C] actor absent from the list -> the idempotent path fails closed (threw: ${msg.slice(0, 60)})`);
    await stub.close();
  }
  // [D] the GET list is EMPTY (no resolvable entry) -> fails closed.
  {
    const stub = await startStub([]);
    let threw = false;
    try {
      await ensureActorUser(stub.backend);
    } catch {
      threw = true;
    }
    ok(threw, 'D12 409 [D] empty user list -> the idempotent path fails closed');
    await stub.close();
  }
}

// --- [14] FIX RUN 2 / O-A — the legacy verdict path. A verdict with NO
//     declaredJourneys (a pre-fix `--only J1` green) has an UNKNOWN declared
//     scope: it must now BLOCK (fail closed), not exit 0 claiming "full
//     declared set". The no-run-dirs permissive policy is UNCHANGED (nothing
//     has run -> code 0).
console.log('\n[14] legacy verdict (no declaredJourneys) fails closed (O-A)');
{
  // legacy green verdict, NO declaredJourneys, one green journey -> BLOCKED
  const legacy = mkdtempSync(join(tmpdir(), 'tj-cg-legacy-'));
  verdictFile(legacy, '2026-10-31T100000000-abc9', { result: 'green', journeys: [{ id: 'J1', result: 'green' }] }, T0 + 1000);
  const rLegacy = checkGreen(legacy);
  ok(rLegacy.code !== 0, `O-A: legacy verdict (green, NO declaredJourneys) -> non-zero (got ${rLegacy.code})`);
  ok(/PARTIAL|declared/i.test(rLegacy.message), `O-A: the legacy message names the missing/partial declared scope (got: ${rLegacy.message.slice(0, 80)})`);

  // no run dirs at all -> STILL code 0 (the permissive policy is unchanged;
  // O-A only tightens the path where a run dir + verdict exist).
  const none2 = mkdtempSync(join(tmpdir(), 'tj-cg-none2-'));
  const rNone2 = checkGreen(none2);
  ok(rNone2.code === 0, `O-A: no run dirs at all STILL -> 0 (permissive policy unchanged, got ${rNone2.code})`);
}

console.log(`\nRESULT: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
