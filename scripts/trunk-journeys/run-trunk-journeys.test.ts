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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateJourneyFile,
  loadJourneyFile,
  readPointer,
  interpolate,
  JourneyError,
} from './lib/journey.js';
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

console.log(`\nRESULT: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
