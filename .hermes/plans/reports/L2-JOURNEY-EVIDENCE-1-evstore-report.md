# L2-JOURNEY-EVIDENCE-1 — UNIT 2 (evstore) report

- Worktree: /home/brad/cl-wt/L2-JOURNEY-EVIDENCE-1-evbundle-lane2
- Branch: cl/lane2-journey-evidence1-evbundle-0238 (continuation on the unit-1 branch)
- Base (continuation tip): 7026ae8756fac9689b6039cc80f3297ab003d198
- Composed: 2026-11-13 (UTC-05:00 session, this run)

## STEP 0 (done first, 3 tool calls)
- `ls server/src/compiler/journey/journeyEvidenceBundle.ts` → present.
- `git rev-parse HEAD` → 7026ae8756fac9689b6039cc80f3297ab003d198 (matches the brief's `base:`; no drift).
- `cd server && npx vitest run src/compiler/journey/journeyEvidenceBundle.test.ts` →
  `Test Files  1 passed (1)` / `Tests  9 passed (9)` / Duration 2.14s. Not blocked; nothing installed.

## Authority check (module > brief paraphrase)
Read journeyEvidenceBundle.ts in full (177 lines, committed at base). The module's
`verifyJourneyEvidenceBundle(bundle, documents)` matches the brief's anticipated
signature exactly — called as-is. `validateJourneyEvidenceBundle` exposes the unit-1
module's ONE compiled Ajv instance (lazy `getCompiled()`, SCHEMA_DIR relative to the
module file, same shape as journeyDocumentLint.ts:65). Both consumed; no second Ajv
instance created, no hash re-implementation (node:crypto sha256Hex is unit-1's,
reached only through its verifier).

## Changed files (exactly the two owned paths, all NEW)
- server/src/compiler/journey/journeyEvidenceStore.ts — 141 lines
- server/src/compiler/journey/journeyEvidenceStore.test.ts — 158 lines
- Total: 299 lines ≤ 300; 2 files ≤ 2. `git diff --stat 7026ae87..HEAD` lists exactly these two paths (315 → 299 after comment-only compaction; no code change in the compaction).

## Design decisions
1. **Class**: `JourneyEvidenceStore({ rootDir })` — rootDir is the only option; no derived default path inside logic; no journey-id / surface-name / `var/` literals (the literal strings in the code are the path segment 'journeys' and the filename template `{revision}.bundle.json` — structural, per the brief's stated path shape).
2. **save**: validate through `validateJourneyEvidenceBundle` (unit-1's single Ajv loader) before any write → `JourneyEvidenceStoreError(rule='schema_rejected')` on refusal. Byte compare of existing vs new payload: identical → no-op return (file untouched); different → `JourneyEvidenceStoreError(rule='revision_exists')` thrown. Tmp-then-rename copies the AiThreadStore idiom verbatim (`mkdir(recursive)` → `${finalPath}.${randomUUID()}.tmp` → `writeFile` → `rename`).
3. **load**: `readBundle` (read → JSON.parse → `validateJourneyEvidenceBundle`), then the unit-1 digest check. Absent (ENOENT), malformed JSON, schema-invalid (incl. determinism.mode absent or a fourth mode on disk), OR digest-mismatched → `null`. This implements the UNIT line "on read, refuse a bundle whose retained document no longer hashes to its declared sha256" — load returns null for tampered; verify names it. No "latest" fallback, no sibling-journey scan.
4. **verify**: `readBundle` then the same digest check; readable + clean → `{ ok: true, mismatches: [] }`; readable + tampered → `{ ok: false, mismatches: [{ref_id, expected, actual}] }` from the unit-1 verifier in entry order; absent/malformed → `{ ok: false, mismatches: [] }` (distinct from tampered: nothing readable to re-hash).
5. **Single digest call site**: `private digestMismatches(bundle)` wraps `verifyJourneyEvidenceBundle` exactly once — `load` and `verify` both delegate to it. This makes the brief's mutation probe mechanical (remove the one call, run the test) and keeps "no hash re-implementation" verifiable by search (one occurrence of the unit-1 verifier in this module).
6. **Error surface**: `JourneyEvidenceStoreError` carries a named `rule` (`revision_exists`, `invalid_segment`, `schema_rejected`). `readMaybe` swallows ONLY ENOENT → undefined ("absent"); every other fs error propagates — "tampered" vs "absent" vs "store failure" stays distinguishable to the caller.
7. **Path sanitisation**: `sanitizeSegment` rejects empty, `.`, `..`, and any `/` in both `journey_id` and `revision` (stringified) segments, before any path join — tested with `load('..', 1)`, `load('a/b', 1)`, `verify('..', 1)`, and `save` of a bundle whose `journey_id` is `../escape`.

## Tests (RED first, per repo rule "tests are the gate")
Test file written first; run with the module absent:
`Tests  no tests` / `1 failed (1)` (ERR: module absent) — RED confirmed.
Module written; two real failures found and fixed on first run:
(a) load did not yet run the digest check (I had delegated verify-only) — the UNIT line's "refuse on read" is the pin; added the digest check to load. (b) a test-assertion bug of mine (`rejects` on a no-op re-save) — fixed the test.
Final: `Test Files  1 passed (1)` / `Tests  8 passed (8)` (824 ms wall in the final run).
Root: `mkdtemp(join(tmpdir(), 'evstore-'))` under `os.tmpdir()`, `rm(recursive, force)` in `afterAll`; nothing written into the worktree.

## AC evidence (raw, final post-restoration run)
AC1 — targeted test passes; round-trip case asserts `loaded.determinism === bundle.determinism` (toEqual on the whole bundle AND explicit `bundle.determinism.mode === loaded.determinism.mode`); on-disk raw bytes equal the bundle object.
AC2 — the tamper case's raw printed line from the final run:
`AC2 verify result: {"ok":false,"mismatches":[{"ref_id":"obs-1","expected":"b5cf15786be7b9869691a7f07a36335289c46e0c59af8ea882164207da73d94e","actual":"8c2beebdfaa214b493defcb379deaac6a823f1a27322e7c16ee30b89d9821ade"}]}`
(ok:false, names ref_id obs-1, expected ≠ actual; same test also asserts load → null for that revision.)
AC3 — regression `Tests  9 passed (9)` (643 ms wall, final run); `git diff --stat 7026ae87..HEAD` lists only the two owned paths (no schema file); the revision_exists test asserts the original file bytes are unchanged after the refused re-save.

## Mutation probe (performed, pin is NON-vacuous)
Removed ONLY the unit-1 verifier call from `digestMismatches` (file read + return shape untouched), ran the targeted test — RAW summary:
`Tests  1 failed | 7 passed (8)`; the AC2 case failed with
`AssertionError: expected true to be false` and printed
`AC2 verify result: {"ok":true,"mismatches":[]}` — the tampered bundle was returned as valid and load returned it. So the load-time digest check IS the load-bearing pin; no second refusal mechanism (e.g. the schema's sha256 pattern) caught it, because the on-disk edit keeps the schema-valid shape with a wrong digest. Restored the line; `git -c core.fileMode=false status --short` → empty (product diff empty before the report commit, as the probe requires).

## Invariants held
No route in server/src/api/**, no client/app code, no schema/YAML edit, no second Ajv instance, no local re-hash (one `verifyJourneyEvidenceBundle` call site), no `determinism: undefined` writes (exactOptionalPropertyTypes clean — tsc 0), no hardcoded journey ids/surface names as literals, no scratch in the worktree (test root is mkdtemp under os.tmpdir(); /home/brad/.evstore-scratch never created).

## Verification commands (all executed this run, in order)
- `cd server && npx vitest run src/compiler/journey/journeyEvidenceBundle.test.ts` → `Tests  9 passed (9)` (STEP 0, 113 ms; again post-restoration, 564 ms; again after comment compaction, 643 ms).
- `cd server && npx vitest run src/compiler/journey/journeyEvidenceStore.test.ts` → `Tests  8 passed (8)` (final, 824 ms wall).
- `cd server && npx tsc --noEmit 2>&1 | wc -l` → pre-edit baseline 0 (measured on the base tree before any edit); post-edit 0 (measured after the compaction commit). Exit number equals baseline.
- `git -c core.fileMode=false status --short` → empty at exit (after the final code commit; the report file itself is committed next, after which the marker is appended and bookkeeping-committed, mirroring unit 1's 1564b534/7026ae87 pattern).
- `git diff --stat 7026ae87..HEAD` → exactly:
  server/src/compiler/journey/journeyEvidenceStore.test.ts | 159 insertions (final 158 after compaction)
  server/src/compiler/journey/journeyEvidenceStore.ts      | 156 insertions (final 141 after compaction)
  (2 files, 315 → 299 total lines)

## Commits (this unit, in order)
- 7997464b journey evidence evstore: durable store for the unit-1 bundle — save (tmp-then-rename, single Ajv authority via the unit-1 loader, append-only revision_exists refusal), load (absent/malformed/schema-invalid/digest-mismatched → null, never defaulted), verify (unit-1 digest check by ref_id, never re-hashed locally); rootDir is an option, no literals
- 79f47ad0 journey evidence evstore: targeted tests — round-trip incl. determinism.mode, revision_exists refusal with the original file byte-identical, on-disk tamper named by verify (expected ≠ actual) and refused by load, absent/malformed → null, byte-stable verify, determinism-absent read → null, '..'/'/' segment refusal before any write (mkdtemp root under os.tmpdir(), removed in afterAll)
- 85709ab2 journey evidence evstore: comment-only compaction to fit the 2-file/300-line output budget (no code change; tests re-run 8/8 and 9/9, tsc 0)
(Note: the pre-compaction 315-line total overran the 300-line budget; the honest fit was comment-only compaction, verified by re-running all tests and tsc — no third module was needed, so no BLOCKED.)

## Next actions / blockers
None for this unit. Unit 3 (handoff citation format / route surface) is un-briefed and not started — out of scope here.

## Marker
(append after the report commit)
