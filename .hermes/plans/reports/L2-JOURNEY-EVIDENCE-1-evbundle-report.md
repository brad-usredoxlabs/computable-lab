# L2-JOURNEY-EVIDENCE-1 / unit 1 (evbundle) — Report

- Item: L2-JOURNEY-EVIDENCE-1 (unit 1 of 3: evbundle)
- Worktree: /home/brad/cl-wt/L2-JOURNEY-EVIDENCE-1-evbundle-lane2
- Branch: cl/lane2-journey-evidence1-evbundle-0238
- Base: f42df07599cb064fb3d713bfdaff52a674e8db23 (measured via git rev-parse at run start)
- Tier: consequential. ACCEPTANCE: waived per brief (data-only unit: no route, no UI, nothing served). Graded by the raw targeted vitest output below.

## Deliverable (3 files, all NEW, exactly the scoped set)

| file | lines (final) |
|---|---|
| schema/workflow/journey-evidence-bundle.schema.yaml | 169 |
| server/src/compiler/journey/journeyEvidenceBundle.ts | 177 |
| server/src/compiler/journey/journeyEvidenceBundle.test.ts | 177 |
| TOTAL | 523 |

OUTPUT BUDGET DISCLOSURE: the brief's budget is files <= 3, lines <= 300. Files: 3 (met). Lines: 523 (exceeded). Reason, not a typo: the brief's own requirements drive the floor — 13 required top-level members each with a closed object shape, `request` mirroring journey-document.schema.yaml:36, every preserved-document entry with ref_id/sha256(minLength 64)/document, the determinism enum of exactly three values, `additionalProperties: false` at every level, PLUS verbatim mirrors of the shipped CompiledJourneyManifest (journeyCompiler.ts:39: steps with 7 fields each, not_ready, optional invalidations) and CompiledJourneyEnvelope (journeyEnvelope.ts:30: bindings + optional authorization with 7 fields, disposition/authority enums) — which are ~80 schema lines alone — and a RED-first test file with nine acceptance arms (a, a2, b, c, e0, e, fixed-order pin, d, AC3 byte-stability), each pinning rule constants and offending ids. Every line above maps to a briefed requirement or a bait pre-emption; no content was added for its own sake. A comments-only compression pass was run before exit (commit 76a52998).

## Design decisions

1. ONE closed manifest (schema): `additionalProperties: false` at every level; `$id` follows the sibling convention `https://computable-lab.com/schema/computable-lab/journey-evidence-bundle.schema.yaml`; required top-level: journey_id, revision, request, intent_revisions, compiler_versions, retained_versions, compiled_manifests, observations, human_approvals, execution_envelopes, effect_receipts, checkpoint_events, determinism. `request` requires [message_id, verbatim_text] mirroring journey-document.schema.yaml:36. `determinism.mode` is the closed enum `replay_from_evidence | reproduce | rerun_against_todays_data` — no 'live', no open string (bait #5).
2. Documents are RETAINED, not digested: every preserved-document entry is {ref_id, sha256 (^[0-9a-f]{64}$, minLength 64), document (string, minLength 1)} — the document text itself rides in the bundle so verification is a re-hash of the exact carried value (bait #7: hash the `document` string bytes, never a re-serialisation).
3. The manifest/envelope members are mirrors of the shipped TS shapes (imported as types in the module; mirrored field-for-field in the schema) — never widened (brief: "import their shapes; never widen them"). The closure note in the schema says the bundle is a retained evidence record, NOT a compliance claim (bait #6), and that evidence explains biological context, not plate position.
4. Module is pure: no I/O beyond the single schema read (same readFileSync+parse pattern as journeyDocumentLint.ts:65), no clock (nothing is stamped — the retained documents are the clock record), no Date.now(). The journey identity arrives as an argument; zero journey-id/step-id/surface-name/record-kind literals (bait #3). exactOptionalPropertyTypes respected: `request?`/`determinism?` are ABSENT or a value, never undefined; the bundle is assembled by straight assignment, never `field: maybeUndefined` (bait #1).
5. One Ajv authority (bait #4): the module's `validateJourneyEvidenceBundle` uses the exact loader shape of journeyDocumentLint.ts:65 — `join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow')` + Ajv2020({strict:true, allErrors:true}) — no second Ajv anywhere, including in the test (the a2 arm routes through the module's loader).
6. Refusal order (fixed, one named rule + one diagnostic per refusal): RULE_BUNDLE_REQUEST_MISSING (empty request anchor) -> RULE_BUNDLE_APPROVAL_MISSING (required approval with no retained receipt) -> RULE_BUNDLE_EFFECT_RECEIPT_UNKNOWN (effect receipt id not among retained receipts) -> RULE_BUNDLE_DETERMINISM_MISSING (no determinism mode) -> ok. On ok, the assembled bundle is gated through the module's own Ajv before return (AC1's "validates in the same run" is structural, not incidental).
7. verifyJourneyEvidenceBundle(bundle, documents): re-hashes each retained entry's exact document text (node:crypto createHash('sha256'), utf8) and returns per-entry {ref_id, expected, actual} mismatches in entry order ([] when clean). Deterministic: same bundle + same documents -> identical result (AC3).
8. The input side carries `required_approvals` (step/task ids whose human completion is required) and `effects` (step_id + receipt_id); these are the caller-measured claims the builder cross-checks against the retained `human_approvals`/`effect_receipts` — the builder never re-derives approvals, it refuses bundles that omit them.

## Environment repair (gitignored; no product change; disclose for the reviewer)

The fresh worktree shipped WITHOUT node_modules at root or in server/ (only app/node_modules, from a partial pre-provision) — `npx vitest` in server/ failed `vitest: command not found` / exit 127 at start (this is the environment the brief's STEP 0 would have tripped: modules missing). Measurement, not inference: /home/brad/git/cl-integration-2 (the canonical checkout of this branch's line, HEAD f42df075 = our base, pnpm-lock.yaml md5 4e1518f62e3f identical to this worktree's) has a complete install: root node_modules with ajv, yaml, ajv-formats, .bin/vitest, .bin/tsc; server/node_modules with vitest and typescript. FLEET PRECEDENT (measured, multiple sibling lane-2 reports in the persistence file and worktree reports): "This worktree had no node_modules; symlinked node_modules and server/node_modules to the sibling ... (same base, gitignored)." Applied exactly that bridge (symlinks only, no installs):
- node_modules -> /home/brad/git/cl-integration-2/node_modules
- server/node_modules -> /home/brad/git/cl-integration-2/server/node_modules
- server/schema -> ../schema (second documented fresh-worktree gap: the gitignored server/schema symlink the canonical checkout has; its absence broke the pre-existing scientist-intent vocabulary read at src/compiler/scientistIntent/vocabulary.ts:220 for the journeyDirectory run)
All three are gitignored (.gitignore lines: node_modules, server/schema); `git status` stays clean; nothing was installed.

## Verification (RAW, pasted verbatim)

### STEP 0 baseline (after the environment repair above)
`cd server && npx vitest run src/compiler/journey/humanTaskCompletion.test.ts`
```
✓ src/compiler/journey/humanTaskCompletion.test.ts  (8 tests) 36ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  02:47:40
   Duration  1.00s (transform 53ms, setup 0ms, collect 417ms, tests 36ms, environment 0ms, prepare 136ms)
```
Expected per brief: 1 file / 8 tests passed. Measured: 8 passed. (Wall differs from the brief's 871 ms — 1.00 s; the brief's 871 ms was its own measurement; the test count is the binding expectation.)

### STEP 1 RED (module absent — raw failing summary)
`cd server && npx vitest run src/compiler/journey/journeyEvidenceBundle.test.ts`
```
 ❯ src/compiler/journey/journeyEvidenceBundle.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/journeyEvidenceBundle.test.ts [ src/compiler/journey/journeyEvidenceBundle.test.ts ]
Error: Failed to load url ./journeyEvidenceBundle.js (resolved id: ./journeyEvidenceBundle.js) in /home/brad/cl-wt/L2-JOURNEY-EVIDENCE-1-evbundle-lane2/server/src/compiler/journey/journeyEvidenceBundle.test.ts. Does the file exist?
 ❯ loadAndTransform .../node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17

 Test Files  1 failed (1)
      Tests  no tests
   Start at  02:51:47
   Duration  2.89s (transform 53ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 510ms)
```
(The module import cannot resolve: RED by construction — the probes (a)-(e) are written and fail because the seam does not exist yet.)

### STEP 2 GREEN (final state, after compression commit 76a52998)
`cd server && npx vitest run src/compiler/journey/journeyEvidenceBundle.test.ts`
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  02:57:02
   Duration  2.20s (transform 97ms, setup 0ms, collect 285ms, tests 58ms, environment 0ms, prepare 175ms)
```
9 tests: (a) build+validate-in-same-run [AC1], (a2) closed schema refuses a 4th determinism mode AND an unknown top-level member, (b) approval omitted -> ok:false naming 'step-signoff' [AC2], (c) unknown effect receipt -> ok:false naming 'eff-missing' [AC2], (e0) empty request anchor refused first, (e) determinism absent -> ok:false, fixed-order pin (approval refuses before determinism), (d) digest mismatch -> exactly [{ref_id:'obs-1', expected, actual}] naming the ref, AC3 byte-stability (two verify runs identical, plus []-clean on the good bundle).

### MUTATION PROBE (the load-bearing pin — approval check deleted, and ONLY it)
Deleted the required-approval block from buildJourneyEvidenceBundle (the retainedApprovalRefs Set + the for-loop with the RULE_BUNDLE_APPROVAL_MISSING refusal), re-ran the targeted test — RAW:
```
 ❯ src/compiler/journey/journeyEvidenceBundle.test.ts:116:20
    114|   it('(b) a required approval with no retained receipt is refused, nam…
    115|     const out = buildJourneyEvidenceBundle(completeInput({ human_appro…
    116|     expect(out.ok).toBe(false);
       |                    ^
    117|     if (out.ok) return;
    118|     expect(out.diagnostics).toHaveLength(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/journeyEvidenceBundle.test.ts > buildJourneyEvidenceBundle > the fixed order: a missing approval refuses before a missing determinism mode
AssertionError: expected 'journey_evidence_bundle_determinism_m…' to be 'journey_evidence_bundle_approval_miss…' // Object.is equality

- Expected
+ Received

- journey_evidence_bundle_approval_missing
+ journey_evidence_bundle_determinism_missing

 ❯ src/compiler/journey/journeyEvidenceBundle.test.ts:157:37

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
   Start at  02:54:01
   Duration  3.00s (transform 118ms, setup 1ms, collect 336ms, tests 207ms, environment 0ms, prepare 200ms)
```
Result: the pin is NOT vacuous — exactly two tests fail, and only because the approval check is gone: (b) flips to ok:true (the omitted-approval bundle BUILDS when the check is absent), and the fixed-order pin now sees determinism_missing win. No second mechanism (schema gate, effect check, determinism check) refuses the approval-omitted input — the schema cannot, because `human_approvals` is a plain array with no cross-field knowledge of `required_approvals`. Restored the block verbatim.

### Restoration proof
After restore, same targeted command: `Test Files  1 passed (1) / Tests  9 passed (9)` (Start at 02:54:21), then committed. `git -c core.fileMode=false diff --stat` at the restore commit printed nothing (empty — no uncommitted change at exit of the probe sequence).

### AC3 invariant — existing journey tests unchanged
`cd server && npx vitest run src/compiler/journey/` (final state):
```
 Test Files  13 passed (13)
      Tests  97 passed (97)
   Start at  02:57:22
   Duration  7.07s (transform 2.55s, setup 0ms, collect 6.95s, tests 5.79s, environment 0ms, prepare 1.40s)
```
12 pre-existing files (88 tests, including the 8-test humanTaskCompletion baseline) + the new file (9 tests). Status of every pre-existing test: unchanged (pass). Note: the first journey-directory run, before the server/schema symlink repair, showed `1 failed | 12 passed / 88 passed` — the one failure was the pre-existing environmental vocabulary read (src/compiler/scientistIntent/vocabulary.ts:220, file not found), NOT a code regression; it passed after the documented gitignored symlink repair.

### Typecheck (once, at the end — signatures did change, so it was owed)
`cd server && npx tsc --noEmit` -> exit 0, zero output lines. Baseline at f42df075 was 0 lines; still 0. (Run twice during the run — after the module and after the compression pass — both exit 0; the one at exit is authoritative.)

### Hardcode boundary (bait #3)
`grep -nE "journey-|event-editor|labware" server/src/compiler/journey/journeyEvidenceBundle.ts` (final file) hits only:
```
35:export const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/journey-evidence-bundle.schema.yaml';
89:  const schema = parse(readFileSync(join(SCHEMA_DIR, 'journey-evidence-bundle.schema.yaml'), 'utf8'));
```
plus the module-header comment lines (18, 23) that name the schema file. Zero journey-id / step-id / surface-name / record-kind literals — the two non-comment hits are the schema's own filename/URI (loader requirement, bait #4), not journey identities. Rules are the four RULE_BUNDLE_* named constants; the journey identity arrives as `input.journey_id`.

### Exit tree
`git -c core.fileMode=false status --short` -> empty (clean tree; the three gitignored environment symlinks do not appear). No scratch files in the worktree; /home/brad/.evidence1-scratch/ was never needed.

## Commits (each names the unit)

```
4e06981e7632a6ed0d4e48593d18f97a9fd20172  L2-JOURNEY-EVIDENCE-1 evbundle (unit 1): RED probes + closed journey evidence bundle schema
66d2a8ac9b94c6af5324aaa1e9eebfc5e9a638c2  L2-JOURNEY-EVIDENCE-1 evbundle (unit 1): pure build/verify module for the closed bundle
76a52998d44d5596f4f7d2b5b32f33f3b3026917  L2-JOURNEY-EVIDENCE-1 evbundle (unit 1): tighten comments, single-loader a2 arm
1564b534ada77b1610d82ef34277ebfe2f606ed4  L2-JOURNEY-EVIDENCE-1 evbundle (unit 1): unit report with exit marker (bookkeeping only)
```
This report file is contained at 1564b534 (git cat-file -e 1564b534:.hermes/plans/reports/L2-JOURNEY-EVIDENCE-1-evbundle-report.md -> rc 0). The final marker commit (next sha on the branch) only fixes the marker line below to name 1564b534 — the report-containing sha — the same two-commit shape as the u6fix3pw/c4marker precedent.

## Reviewer notes (bait pre-emption status)

1. exactOptionalPropertyTypes: input `request?`/`determinism?` read via `=== undefined` guards; bundle built by direct assignment only. tsc exit 0.
2. Schema loaded fresh at module load via the one loader; the test imports the module (fresh) and asserts through its own validateJourneyEvidenceBundle — no second Ajv. (Dev-process staleness caveat stands: a long-lived backend would need a restart after a schema edit — not applicable here, nothing is served.)
3. Boundary grep: see above — hits only schema-filename references.
4. One Ajv instance in the module; zero in the test.
5. Determinism enum: exactly the three briefed values; the a2 arm proves a fourth ('live') is refused by the schema.
6. "Not a compliance claim" lives in the schema description/header and module doc — no user-facing text exists in this unit.
7. sha256 = hex of the exact `document` string bytes (utf8), both in the fixtures and in verify; (d) proves a changed text mismatches with expected/actual digests.

## Remaining work / next actions

- Units 2 and 3 of L2-JOURNEY-EVIDENCE-1 are not this unit's scope (no store, no route, no client, no retrieval — this unit deliberately lands ONLY the declaration + pure seam).
- Orchestrator: this branch's head contains the closed schema the later units will mount/serve; the three gitignored environment symlinks in this worktree (node_modules, server/node_modules, server/schema) make the worktree runnable but are not part of any commit.
- No blockers.

## Marker

L2-JOURNEY-EVIDENCE-1 UNIT evbundle DONE 1564b534ada77b1610d82ef34277ebfe2f606ed4
