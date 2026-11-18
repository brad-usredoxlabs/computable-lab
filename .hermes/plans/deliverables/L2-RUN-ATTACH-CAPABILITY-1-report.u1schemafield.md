# L2-RUN-ATTACH-CAPABILITY-1 / u1schemafield — unit report

- item: L2-RUN-ATTACH-CAPABILITY-1
- unit: u1schemafield
- lane: 2
- worktree: /home/brad/cl-wt/L2-RUN-ATTACH-CAPABILITY-1-u1schemafield-lane2
- branch: cl/lane2-run-attach-capability-1-u1schemafield-1325
- base: 9fa799ac38914138639e8eb96e8532f5d6dbb8fa
- tier: normal
- verdict: DONE (implementation complete; acceptance = this report's verification battery, all green on the final commit)

## What changed (one seam: YAML field declaration + one schema-shape test; NO TypeScript behavior change)

1. schema/lab/measurement.schema.yaml — NEW optional property `materialRef` (13 added lines),
   inserted after the equipmentRef block (its x-capability-gate ends at :59) and before
   `labwareInstanceRef`. Shape modeled on the equipmentRef ref-slot precedent, minus the
   capability gate (no capability governs it):
     materialRef:
       allOf:
       - $ref: "./datatypes/ref.schema.yaml"
       - type: object
         properties:
           kind: { const: record }
           type: { enum: [material, aliquot] }
   kind pinned to record, type pinned to the material kinds — the enum is REAL, not a free ref.
2. schema/lab/measurement.ui.yaml — NEW triplet `$.materialRef` / widget "ref" / label "Material"
   (3 added lines), directly after the `$.equipmentRef` triplet in the Provenance section.
3. schema/knowledge/acquisition-package.schema.yaml — NEW optional property `materialRef`
   (3 added lines), directly after `sampleRef`, SAME plain-$ref shape as its neighbors
   (package-level ref stays a plain record ref; kind-pinning lives on the measurement slot).
4. schema/knowledge/acquisition-package.ui.yaml — NEW slot `material-ref-slot` (path
   `$.materialRef`, label "Material Ref", widget "ref", help line) after `sample-ref-slot`
   (+6 lines) AND claimed it in the `manifest-and-links` block slots array (+1/-1):
   slots: ["signal-collection-ref-slot", "source-run-ref-slot", "sample-ref-slot", "material-ref-slot"]
   The claim is REQUIRED: UISpecLoader rule (c) rejects any declared slot not claimed by a block
   (server/src/ui/UISpecLoader.ts:372-375); adding the slot without the claim would have broken
   the zero-spec-errors + block-claim tests in AcquisitionPackageSchemas.test.ts.
5. server/src/measurement/measurementMaterialRef.schema.test.ts — NEW schema-shape test
   (182 lines). Harness copied verbatim from MeasurementService.capabilityGate.test.ts
   (same initializeApp wiring: schemaDir resolve(process.cwd(),'..','schema'), recordsDir
   'records', baseDir process.cwd()). Three pinned cases:
     (a) minimal measurement payload + materialRef {kind:'record', id:'MAT-TEST-1',
         type:'material'} -> store.create VALID, and read-back of the slot is verbatim.
     (b) same payload + materialRef type:'equipment' -> REJECTED with a REAL enum error:
         assertion requires a ValidationError with keyword 'enum' at path '/materialRef/type'
         (not just any reject — proves the enum is enforced).
     (c) minimal acquisition-package payload (same required fields as
         server/src/storage/acquisitionPackage.test.ts's minimal-valid-package fixture:
         kind/type/recordId/registeredAt/registeredBy/acquisitionStatus/signalCollectionRef/
         contentHash) + materialRef plain record ref -> VALID. Pinned at the VALIDATOR level
         via AppContext.validator.validate(payload, ACQP_SCHEMA_ID) — the brief explicitly
         allows this ("If the store harness is too heavy for (c), pin (c) at the validator
         level exactly as acquisitionPackage.test.ts does"), and it mirrors that file's
         ctx.app.validator.validate(...) pattern against the real served schema tree.
   NO product .ts file touched; RunSheetHandlers.ts / acquisitionPackage.ts untouched.

## Line count vs output budget (files <= 6, lines <= 140, "the YAML additions are ~20 lines")

- 5 files changed vs base (budget 6): 4 YAML + 1 test. OK.
- YAML additions: 26 lines (schema 13 + ui 3 + schema 3 + ui 7) — the parenthetical target.
- Test file: 182 lines. TOTAL delta vs base: 207 insertions / 1 deletion (measured:
  `git diff --stat 9fa799ac..HEAD`). The 140-line cap is NOT met by total delta; the
  three-cases-pinned acceptance contract (each case with real assertions + verbatim
  bedrock) could not fit a single test file under 180 lines while keeping the harness
  verbatim. Acceptance criteria 1-4 all green (below); the budget miss is flagged here,
  not papered over.

## Verification (all commands run in this worktree; real outputs)

Baseline (measured BEFORE the YAML change, on the RED commit with base YAML):
  cd server && npx vitest run src/measurement/MeasurementService.capabilityGate.test.ts src/storage/acquisitionPackage.test.ts
  -> Test Files 2 passed (2), Tests 23 passed (23)  [3 capabilityGate + 20 acquisitionPackage]
  (matches the brief's 13:30Z measured baseline exactly)

1. RED (committed; reproduced again at 13:44Z with base YAML checked out from the RED
   commit — /tmp/red-repro.log — and the tree restored, exit code 1):
  cd server && npx vitest run src/measurement/measurementMaterialRef.schema.test.ts
  -> Test Files 1 failed (1), Tests 3 failed (3). All three failures were exactly the
     predicted unevaluatedProperties rejection, verbatim:
     {"path":"/","message":"must NOT have unevaluated properties","keyword":"unevaluatedProperties","params":{"unevaluatedProperty":"materialRef"}}
     (a) store.create -> success:false, error 'Validation failed' (field closed by :9)
     (b) no enum error at /materialRef/type existed — the reject was the generic closure
     (c) validator -> valid:false with the same unevaluatedProperties error

2. GREEN after the YAML commit:
  cd server && npx vitest run src/measurement/measurementMaterialRef.schema.test.ts
  -> Test Files 1 passed (1), Tests 3 passed (3)

3. Adjacent suites UNCHANGED (re-run on the FINAL commit after the YAML):
  cd server && npx vitest run src/measurement/MeasurementService.capabilityGate.test.ts src/storage/acquisitionPackage.test.ts
  -> Test Files 2 passed (2), Tests 23 passed (23)  [identical to the measured baseline]

4. Schema boot / UI triplets (final commit):
  cd server && npx vitest run src/measurement/MeasurementActiveControlService.liveGate.test.ts src/schema/AcquisitionPackageSchemas.test.ts
  -> Test Files 2 passed (2), Tests 30 passed (30)  [liveGate 2 + AcquisitionPackageSchemas 28,
     including the zero-spec-errors + block-claim UI tests that gate the triplet edits]

5. Typecheck (final commit): cd server && npx tsc --noEmit
  -> exactly the 6 PRE-EXISTING errors, unchanged vs the BLOCKED-leg baseline
     (AIHandlers.ts:332/438/716, AiIngestionHandlers.ts:291, ExtractProtocolHandler.ts:63,
     sequenceRoutes.ts:37 — all FastifyRequest 'parts'/'file' property errors in AI handler
     files). ZERO new errors from the new test file.

## Commits (branch cl/lane2-run-attach-capability-1-u1schemafield-1325, base 9fa799ac3)

All four SHAs below were read from `git log --format=%H` in this worktree.

- b7e9eea12f51277ff34a78804c8685be23aba801  commit 1 — RED test (3/3 red, verbatim above)
- 2f33083683a72c3fb9d96205da4cf9d10320733e  commit 2 — the 4 YAML edits (one seam, one commit)
- <this commit>                            commit 3 — this report
- <next commit>                            commit 4 — DONE marker (names this report commit's real 40-char sha, read via git rev-parse HEAD right after this commit)

Note: an earlier draft of this report (superseded by the clean re-commit) carried a
transcribed SHA for the RED commit; the value above is the one read from git. No code
content differs between the two report commits — only this SHA line.

## Unblock status for the later legs

Both prior legs were BLOCKED solely because `materialRef` was undeclared while
`unevaluatedProperties: false` closed both payloads:
- /home/brad/.hermes/cl/lanes/2/reports/L2-RUN-ATTACH-CAPABILITY-1-u1matbind-report.md
- /home/brad/.hermes/cl/lanes/2/reports/L2-RUN-ATTACH-CAPABILITY-1-u1acqmaterial-report.md
That blocker is now removed at the schema seam (verified live: (a) and (c) green against the
served schema tree). u1matbind / u1acqmaterial rebase on this merge and own the register-flow
behavior (RunSheetHandlers.ts / acquisitionPackage.ts) — NOT this unit's scope.

## Next actions / owners

- u1matbind, u1acqmaterial (other units): rebase on this merge; their BLOCKED state should
  clear. No further schema/** edits needed for the material binding.
- Orchestrator: reload the lane stack before any live UI verification of the new triplets
  (YAML change; standard rule).
- Independent reviewer: acceptance of the UI leg belongs to the browser reviewer; this unit
  only ships the schema-shape + triplet declaration.

## Remaining blockers

None. Tree clean at the marker commit; all verification green.

L2-RUN-ATTACH-CAPABILITY-1-u1acqgraph DONE fc697e53af8c2bee5e91dd140c5ed9732497caab
