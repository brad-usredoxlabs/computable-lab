# MINT-IDEM-1 — coder report (l2t0015)

Worktree: /mnt/vast/home/brad/git/wt/MINT-IDEM-1-lane2-l2t0015
Branch: wt/MINT-IDEM-1-lane2-l2t0015 @ base e68a6271
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-17_MINT-IDEM-1-mint-idempotency-spec.md (read fully; OQ1/OQ2/OQ3 rulings applied)
Decision: .hermes/plans/decisions/W28-A5d-reshoot-mint-idempotency-decision.md (read fully)

NO BROWSER GATE — server-only task. No :5193 / playwright / picker leg was run or needed.

## Bootstrap verification

- `git -c core.fileMode=false status --porcelain | grep -c '^D'` -> 0 (checkout complete on first poll).
- Links resolve: server/node_modules -> /mnt/vast/home/brad/git/computable-lab/server/node_modules;
  app/node_modules -> .../computable-lab/app/node_modules; node_modules -> .../computable-lab/node_modules;
  server/schema -> <worktree>/schema.
- core.excludesFile = /home/brad/.hermes/cl/lanes/2/lane-exclude-mintidem1-l2t0015 (present, header names this lane).
- All git via `git -c core.fileMode=false`.

## Changed files (the whole diff: one product file + one new test file)

- server/src/api/handlers/VocabHandlers.ts (modified: +47/-2) — lookup-first before store.create:
  name-match arm (store.list({ schemaId: mintable.schemaId, limit: 10000 }), exact
  trim+toLowerCase equality, mirroring MaterialGrounding.ts:211-214), then id arm
  (store.get(localMaterialIdForLabel(label)), mirroring :219-223); on hit returns the SAME
  200 success shape with the EXISTING recordId / `payloadName(...) || label` (OQ1) /
  baseUri+recordId iri. `baseUri` hoisted above the arms (value/default unchanged).
  Local duplicated `asPayload`/`payloadName` helpers (byte-identical to MaterialGrounding
  :50-58; kept private there — no import refactor). :113-118 comment tightened to the new
  reality (allowed by spec EXACT EDITS #5). MISS path (build -> createEnvelope ->
  store.create -> 422 arm -> success return) byte-identical.
- server/src/api/handlers/VocabHandlers.mint.test.ts (NEW, 9 tests) — direct-handler harness
  mirroring RecordHandlers.writeGates.test.ts; fake store HONORS the real collision guard
  (`Record already exists: <id>`, RecordStoreImpl.ts:553-562 wording) so RED is honest.
- .hermes/plans/drafts/probe-mintidem1-red.mts (supporting RED/GREEN probe, tsx direct-handler).

Untouched (spec out-of-scope list respected): RecordStoreImpl.ts, termId.ts,
MaterialGrounding.ts, routes.ts, server.ts, everything under app/. No response-shape change
(MintTermResponse frozen; keys pinned to {success,recordId,label,iri} in test 1), no refKind
change, no reply.status(200) call, no `?? name` (helper returns ''-or-string, code uses `||`).

## BASELINE (pre-fix, at e68a6271, run from server/ package dir)

- `npx tsc --noEmit` -> exit 0, no output (0 errors).
- `npx vitest run src/materials` -> Test Files 6 passed (6), Tests 41 passed (41).
- `npx vitest run src/api/handlers/RecordHandlers.writeGates.test.ts` -> 12 passed (12).
- No pre-existing VocabHandlers test file (OQ2 re-verified first-hand in the worktree:
  `grep -rl "VocabHandlers" src test --include='*.test.ts'` -> only my new file;
  `grep -rl "vocab/mint\|mintTerm" ... --include='*.test.ts'` -> empty).
- Full-suite base raw: /tmp/mintidem1-base-fullsuite-raw.txt ->
  Test Files 94 failed | 662 passed | 9 skipped (765); Tests 105 failed | 6246 passed | 70 skipped (6607);
  Errors 2 (pre-existing unhandled-rejection debt). 94 distinct FAIL file paths extracted.

## RED (pre-fix, unmodified handler)

Targeted run `npx vitest run src/api/handlers/VocabHandlers.mint.test.ts` (raw:
/tmp/mintidem1-RED-raw.txt):

    Test Files  1 failed (1)
          Tests  4 failed | 5 passed (9)

Failing pins (the 3 acceptance arms):
1. "mint(label) twice: both 200, SAME recordId, exactly ONE record" -> expected 200, got 422.
2. "mint \"DMSO\" then \"dmso\"" -> expected 200, got 422.
3. name-match arm: "expected 'MAT-foo-reagent-5c4q' to be 'MAT-FOO-REAGENT'" (tip mints a
   duplicate instead of pointing at the seeded record).
4. id arm: "expected 422 to be 200".
The 5 passing pins are the regression pins (first-mint byte-identity, 400/422 pins) — green
pre-fix exactly as expected.

Direct-handler probe against the UNMODIFIED handler (/tmp/mintidem1-RED-probe.txt) — the 422
symptom verbatim:

    mint #1 status= 200 response= {"success":true,"recordId":"MAT-idem-probe-label-173v","label":"idem probe label","iri":"http://localhost:3001/records/MAT-idem-probe-label-173v"}
    mint #2 status= 422 response= {"error":"VALIDATION_FAILED","message":"Minting \"idem probe label\" failed: Record already exists: MAT-idem-probe-label-173v"}
    store size = 1

## GREEN (post-fix)

- `npx vitest run src/api/handlers/VocabHandlers.mint.test.ts` (raw: /tmp/mintidem1-GREEN-mint-raw.txt):
  Test Files 1 passed (1); Tests 9 passed (9).
- `npx vitest run src/materials` -> 6 files, 41/41 passed.
- `npx vitest run src/api/handlers/RecordHandlers.writeGates.test.ts` -> 12/12 passed.
- Targeted-adjacent (`grep -rl "ensureLocalMaterialForDraft\|MaterialGrounding\|localMaterialIdForLabel" src --include='*.test.ts'`):
  2 files (termId.test.ts, VocabHandlers.mint.test.ts), 15/15 passed, 0 failures.
- GREEN probe (/tmp/mintidem1-GREEN-probe.txt): mint #2 status= 200, SAME recordId
  MAT-idem-probe-label-173v, store size = 1.
- `npx tsc --noEmit` -> exit 0, no output. Base 0 -> head 0: ZERO new typecheck errors.

## Full-suite zero-new proof (comm -3 of normalized FAIL-file lists)

Head raw: /tmp/mintidem1-head-fullsuite-raw.txt ->
Test Files 90 failed | 667 passed | 9 skipped (766); Tests 100 failed | 6273 passed | 70 skipped (6616).

    comm -13 /tmp/mintidem1-base-failfiles.txt /tmp/mintidem1-head-failfiles.txt   # NEW fails in head
    (EMPTY)

    comm -23 ... # base-only files (flapped to pass run-to-run):
    src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts
    src/revisions/DraftCopyDerivedRefValidation.test.ts
    src/revisions/Qms6bSchemaDrift.test.ts
    src/sequences/sequenceRoutes.test.ts

94 base FAIL files -> 90 head FAIL files; ZERO new. The 4-file delta is the documented
run-to-run flap (load-timeout flaps), not my change: my file appears in the head raw as
`✓ src/api/handlers/VocabHandlers.mint.test.ts (9 tests)` and no FAIL line in either raw
references VocabHandlers. The ~94-failing-file trunk baseline is documented pre-existing
debt and was not chased.

## Assumptions

- AS-L2T0015-IDEM-01: fake-store collision string `Record already exists: <recordId>` —
  taken from RecordStoreImpl.ts:561 wording per the spec's harness instruction ("the fake
  MUST honor the real guard"); exact store internals (path lookup) not reproduced.
- AS-L2T0015-IDEM-02: tests construct the handler with NO NamespaceConfig, so the default
  baseUri 'http://localhost:3001/records/' (unchanged from tip) is what the iri pins assert.
- AS-L2T0015-IDEM-03: seeded ids in tests ('MAT-FOO-REAGENT', arbitrary) are test fixtures,
  not values supplied by any source; chosen to prove id ≠ localMaterialIdForLabel(label).
- AS-L2T0015-IDEM-04: label fixtures ('idem probe label', 'foo reagent', 'DMSO'/'dmso',
  'bead beating reagent', 'lysis-reagent', 'bead-beating reagent', 'bad mint') are mine;
  the decision-doc real labels were not reused to avoid coupling to live-store records.

## Reviewer-bait self-check (spec's 8 items)

1. No collision string-matching anywhere — lookup-first avoids the collision (createCalls
   pinned to 1 on repeat mint, 0 on name/id hits). 2. Response shape frozen (keys pinned).
3. Normalization is exactly trim+toLowerCase equality over schemaId-filtered materials
   list limit 10000 — no substring/fuzzy/all-records drift. 4. No app/ files touched.
5. termId.ts untouched; only VocabHandlers.ts's own comment updated. 6. First-mint payload
   keys pinned to kind/id/name/domain/status (+definition iff sourceQuery) — test 4.
7. exactOptionalPropertyTypes: helper returns ''-or-string, `||` used, no `: undefined`,
   no reply.status(200). 8. RecordStoreImpl.ts untouched.

## Unresolved

None. Acceptance criteria all verified above. A5d re-shoot's in-browser repeat-mint leg is
the orchestrator's later gate, explicitly NOT this task's gate.
