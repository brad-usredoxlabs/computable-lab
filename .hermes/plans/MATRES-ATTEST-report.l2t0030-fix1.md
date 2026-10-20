# MATRES-ATTEST — coder FIX RUN 1 report (l2t0030, adversarial cycle 1)

Lane 2. Worktree `/mnt/vast/home/brad/git/wt/matres-attest-lane2`, branch
`cl/lane2-matres-attest-l2t2135`, base HEAD 5e371795 (fixes committed ON TOP, no rebase/amend).
Review read in full: `/home/brad/.hermes/cl/lanes/2/reviews/MATRES-ATTEST-advc1-l2t0005-review.md`.
Spec: `.hermes/plans/2026-10-19_2140-MATRES-ATTEST-attestation-foundation.md` (§0' rulings binding).

All five defects fixed. Both non-blocking observations fixed. plate-event.schema.yaml /
plate-event.lint.yaml byte-untouched in this run (`git diff --name-only` over the fix: zero
plate-event paths). No app/** files. No new kinds, no scope creep.

Files changed (6):
- server/src/attestation/AttestationCase5.test.ts        (Defects 1 + 2 — full isolation rewrite)
- server/src/attestation/CurrentAssertionView.ts         (Defect 4 + Defect 1 obligation semantics)
- server/src/attestation/AttestationAcceptService.ts     (Defect 3 — content-derived correction id)
- server/src/attestation/AttestationAcceptService.test.ts (Defect 3 proof test)
- schema/lab/attestation.lint.yaml                       (Defect 5 — honest always-firing rule)
- server/src/schema/AttestationSchemas.test.ts           (non-blocking observations)

================================================================================
DEFECT 1 (MAJOR) — case-5 outcome 6 was vacuous (hash(x)===hash(x); FULFIL hook decorative)
================================================================================
What I changed:
1. `AttestationCase5.test.ts` case5-6 rewritten. The requirement fixture is now PERSISTED as a
   real artifact on disk (`REQ-0001.requirement.yaml` in the test's tmp workspace) BEFORE the
   correction; its bytes are read back from disk and hashed BOTH before the correction and after
   the correction + fulfillment accept. The assertion compares disk-read-after vs disk-read-before
   — a real before-correction/after-correction measurement, not a tautology.
   (Store-record alternative rejected honestly: no `material-source-requirement` schema exists —
   spec §1 row 7 says requirementId is FULFIL's audit-first work — and inventing a kind would
   break the OQ-2 zero-new-kinds ruling. On-disk persistence + measured bytes satisfies the
   reviewer's fix direction: "snapshot its hash before the correction and assert the SAME bytes
   after the correction".)
2. `CurrentAssertionView.reevaluationObligations()` now DEPENDS on the fulfillment fact's citation:
   a supersession yields an obligation ONLY when some attestation claim CITES the superseded record
   (`assertion.cites` = its recordId), and the obligation names the citing records
   (`citingRecordIds`). case5-6 asserts the full transition:
   - before the correction: `reevaluationObligations(preCorrection)` == [] (no supersession);
   - after the correction, before the fulfillment fact: NO obligation for A (nothing rests on the
     superseded evidence yet);
   - after the fulfillment fact citing A: exactly ONE obligation, `supersededRef === A`,
     `corrections` contains A2, `citingRecordIds` == [fulfillment record id];
   - CONTROL: the same graph with `cites` stripped from the fulfillment claim (in-memory copy)
     yields NO obligation — proving the hook is citation-dependent, not decorative.
3. The lint info finding on the correction record is asserted separately (rule fires, severity
   info, `lintResult.valid === true` — standing info never blocks acceptance).

Proof commands: the case5-6 isolation run and the targeted suite below (all green).

================================================================================
DEFECT 2 (MAJOR) — the seven case-5 outcomes were not individually executable
================================================================================
What I changed: `AttestationCase5.test.ts` rewritten for per-it isolation.
- Shared mutable module state (`aRecordId`, `aHashBefore`, `a2RecordId`) REMOVED.
- `beforeEach` builds a FRESH world per it(): new tmp store (fresh LocalRepoAdapter +
  RecordStoreImpl over the shared read-only schema/lint registry), entity + 10 aliquots seeded,
  Monday attestation A accepted. `afterEach` removes the tmp dir.
- The Tuesday correction is applied INSIDE the outcomes that measure it (case5-2, 3, 4, 5, 6, 7),
  so each test measures a real before->after transition instead of inheriting another test's writes.
- case5-2/3/4 now assert the BEFORE state first (arrival count 1, aliquot ids+payload hashes,
  view lot 09231), then correct, then assert the AFTER state.

Proof: the seven `-t "case5-N"` isolation runs, N=1..7, EVERY one EXIT 0 — verbatim outputs in
§VERIFICATION below. The reviewer's failing probe (`-t "case5-4"` -> expected undefined to be
'09213') now passes standalone.

================================================================================
DEFECT 3 (MINOR) — deterministic id deviated from spec §2c (Q4e)
================================================================================
What I changed: `AttestationAcceptService.ts` — `recordIdOf` is now CONTENT-scoped for
corrections per the §2c formula: a draft carrying BOTH `supersedes` and `correction` gets
`id = ATT-hash(supersedes + changedFacts + claimTarget.mode)` (new `correctionIdentity()` helper).
A content-identical correction resubmitted under a FRESH draftId/revision therefore lands on the
SAME record id — the duplicate-correction case Q4e forbids is closed.
Boundary call stated explicitly (as the reviewer demanded): NON-correction envelopes stay
draft-scoped (`draftId + revision + envelope`) because §2b pins the payload revision of a draft;
§2c's content formula is the correction-identity rule specifically. This is stated in the file
header comment and the `recordIdOf` doc comment. `reviewHash` pinning is unchanged (still the
draft revision — §2b), so the post-accept mutation gate is untouched.
Test added: `AttestationAcceptService.test.ts` — "a content-identical correction resubmitted
under a FRESH draftId lands on the SAME record id (Q4e, §2c)": same supersedes + changedFacts +
mode under `draftId: 'ATT-DRAFT-CORR-2', revision: 9` -> same `recordId`, exactly ONE record by
COUNT. case5-7 additionally re-proves it in the walkthrough (fresh draftId 'CASE5-A2-FRESH-DRAFT',
revision 7 -> same id, one record; different changedFacts -> second correction, A2 byte-unchanged).

================================================================================
DEFECT 4 (MINOR) — hardcoded `lot` in the generic resolver
================================================================================
What I changed: `CurrentAssertionView.ts` no longer special-cases ANY fact key.
- `currentFacts` -> `currentAssertion(records, entityId)`: returns the CURRENT attestation
  generically — `sourceRecordId`, `attestedAt`, the claims about the entity (`AttestedClaim[]`),
  and the folded `changedFacts` from the supersedes chain. No `lot`, no fact-name branch.
- `historicalFacts` -> `historicalClaims(envelope)`: the claims as attested on one record.
- The `lot` reading moved to the TEST side (`lotFactFromClaims` / `lotFact` helpers in
  AttestationCase5.test.ts): consumers read named facts off the returned claims/changedFacts.
Boundary justification (§2c "lot / received-date reads go through this view"): the promise is
satisfied by the view returning the complete current assertion for the entity — consumers resolve
a descendant's provenance THROUGH the view (case5-4 asserts exactly that chain) — not by the fold
knowing fact names. The resolver now hardcodes zero domain vocabulary (`grep -n "lot"
CurrentAssertionView.ts` -> only doc-comment prose). `arrivalsForEntity` takes `verb` as a
consumer-supplied parameter (already was). `reevaluationObligations` reads `assertion.cites`,
which is the claim's own assertion vocabulary (§2a deliberately loose assertion payload), not a
domain fact key.

================================================================================
DEFECT 5 (MINOR) — lint rule asserted a schema-forbidden path (dead assert)
================================================================================
What I changed: `schema/lab/attestation.lint.yaml` rule
`attestation-correction-triggers-reevaluation-review` now asserts
`not: { op: equals, path: kind, value: attestation }` — an assert that is honestly
ALWAYS-FALSE-BY-CONSTRUCTION on a LEGAL path: `attestation.schema.yaml` pins `kind: const
"attestation"`, so the inner equals always passes and the negation always fails; the rule always
fires as info whenever `supersedes` is present. The YAML comment documents this explicitly
("intentionally always-firing info") and records why the old shape was incoherent (dead assert on
a path the closed `correction` object forbids; would have silently stopped firing if the schema
ever allowed the property). No schema-forbidden path is referenced anymore.
Proof: case5-6 asserts the rule fires with severity info on the stored correction AND that
`lintResult.valid === true` (info never blocks acceptance) — green in every run below.

================================================================================
NON-BLOCKING OBSERVATIONS (fixed)
================================================================================
- `AttestationSchemas.test.ts`: the two committed `console.log('ENVELOPE_ERRORS'/'CLAIM_ERRORS')`
  lines removed.
- `buildWorld` no longer swallows addSpec failures silently: a collision involving the
  attestation spec (its name or the error message) is RETHROWN, and the attestation rule id is
  asserted registered (`engine.getRule('attestation-occurred-known-needs-occurred-at')`).
  Non-attestation pre-existing repo-wide collisions remain tolerated (unchanged behavior).

================================================================================
VERIFICATION (real command output, verbatim)
================================================================================
All runs from `/mnt/vast/home/brad/git/wt/matres-attest-lane2/server`, fresh vitest processes
(no tsx --watch; YAML loaded fresh — bait 2).

(1) PER-IT ISOLATION PROBES — `npx vitest run src/attestation/AttestationCase5.test.ts -t "case5-N"`, N=1..7:

--- case5-1 ---
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/matres-attest-lane2/server
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 589ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

--- case5-2 ---
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 612ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

--- case5-3 ---
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 564ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

--- case5-4 ---
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 569ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

--- case5-5 ---
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 651ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

--- case5-6 ---
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 610ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

--- case5-7 ---
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests | 7 skipped) 594ms
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT CODE: 0

(2) FULL TARGETED SUITE — `npx vitest run src/schema/AttestationSchemas.test.ts src/attestation src/store/AppendOnlyWall.attestation.test.ts`:

 ✓ src/store/AppendOnlyWall.attestation.test.ts  (4 tests) 691ms
 ✓ src/attestation/AttestationAcceptService.test.ts  (9 tests) 712ms
 ✓ src/attestation/AttestationCase5.test.ts  (8 tests) 871ms
 ✓ src/schema/AttestationSchemas.test.ts  (19 tests) 4073ms
 Test Files  4 passed (4)
      Tests  40 passed (40)
EXIT CODE: 0
(40 = prior 39 + the new fresh-draftId Q4e test.)

(3) FRESH-draftId-same-id test alone — `npx vitest run src/attestation/AttestationAcceptService.test.ts -t "FRESH draftId"`:

 ✓ src/attestation/AttestationAcceptService.test.ts  (9 tests | 8 skipped) 512ms
 Test Files  1 passed (1)
      Tests  1 passed | 8 skipped (9)
EXIT CODE: 0

(4) TYPECHECK — `npm run typecheck -w server` (from worktree root):

 > @computable/server@1.0.0 typecheck
 > tsc --noEmit
TYPECHECK EXIT CODE: 0   (baseline 0)

(5) REGRESSION spot-check (knob + store untouched by the fix) — `npx vitest run src/store/RecordStore.test.ts`:

 ✓ src/store/RecordStore.test.ts  (49 tests) 278ms
 Test Files  1 passed (1)
      Tests  49 passed (49)

(6) NEGATIVE COMMITMENTS re-checked over the fix diff:
- plate-event files byte-untouched: `git diff --name-only` (fix working tree) contains NO
  plate-event path; `at:`/`t_offset`/anyOf untouched (bait 7 commitment holds).
- `grep -n "lot" server/src/attestation/CurrentAssertionView.ts` -> only doc-comment prose lines
  (7, 17, 19); zero code references. `grep "=== 'attestation'"` in non-test attestation TS -> 0 hits.
- No Date.now()/randomUUID introduced (id change is a pure contentHash over the §2c triple).
- exactOptionalPropertyTypes: typecheck EXIT 0 under `exactOptionalPropertyTypes: true`; no
  `field: undefined` idiom in the new code (conditional spreads / delete-before-build only).
- Diff scope: 6 files, all inside spec §3 IN-list; no app/**; no new schema kinds.

================================================================================
UNRESOLVED / CARRIED (unchanged from coder1 report)
================================================================================
- Live YAML-reload curl proof (spec §9 last item) remains DEFERRED to the orchestrator (stack
  restart + curl); all in-worktree proofs here use fresh processes.
- Full-suite failing-FILE baseline parity was not re-run in this fix pass (targeted suites +
  RecordStore regression only); the fix touches only the six files above, all covered green.
- OQ-1 attest-authority governance gap: unchanged, documented in coder1 report §.

Deliverable: .hermes/plans/MATRES-ATTEST-report.l2t0030-fix1.md
