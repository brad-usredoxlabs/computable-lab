# W2-5-DRAFT-LIFECYCLE — coder report (wip, l2t2310)

Branch: W2-5-lane2-l2t2310 @ base 78bee2c8 (lane trunk tip at claim; includes W2-3 merge
2e672c1b + W2-4 merge 7d301c1f). Worktree /mnt/vast/home/brad/git/wt/W2-5-lane2-l2t2310.
Spec: .hermes/plans/2026-10-09_1720-W2-5-draft-lifecycle-spec.md (promoted, PROMOTION RECORD
applied: constraint-vocab path = schema/registry/constraint-vocabulary/; §5 widening at BOTH
:1029 and :1032; OQ1 config knob revisionOnEditKinds; OQ2 purpose 'edit'; OQ3 report-don't-widen).

## 0. RED CAPTURE (baselines on MY base, BEFORE any change)

### 0.1 Worktree parity
- git status --porcelain -uall --ignored=matching: 112 entries BOTH trunk and lane worktree;
  comm -3 of the two sorted lists: EMPTY (parity proven).
- core.excludesFile = /home/brad/.hermes/cl/lanes/2/lane-exclude-W2-5-l2t2310 (113 lines).
- server/schema -> ../schema symlink (lane bootstrap pattern, points at THIS worktree's schema
  so schema edits are visible to the boot loader). node_modules symlinked.
- server/src/store/LifecycleBypassAudit.test.ts is a SYMLINK into Brad's live tree
  (/mnt/vast/home/brad/git/computable-lab/server/src/store/LifecycleBypassAudit.test.ts) —
  the target file's first line is the SPINE-7 adversarial-review prompt text, so vitest fails
  it with a Transform error. PRE-EXISTING on trunk (trunk carries the same broken symlink,
  untracked). NOT mine, NOT touched (lane-synced untracked path — never stage).

### 0.2 First targeted check (spec §6, run EARLY)
Command: cd <wt>/server && npx vitest run src/integration/extractionE2E.test.ts
  src/api/handlers/ExtractHandlers.test.ts src/compiler/pipeline/extractionCompileYaml.test.ts
Captured /tmp/l2t2310-w25-firstcheck.log. Tail VERBATIM:

  ✓ src/compiler/pipeline/extractionCompileYaml.test.ts  (19 tests) 53ms
   FAIL  src/integration/extractionE2E.test.ts > E2E: PDF upload → extract → draft → promote → canonical + audit
   FAIL  src/integration/extractionE2E.test.ts > E2E: PDF upload → extract → draft → promote → canonical + audit
  ⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯
   FAIL  src/api/handlers/ExtractHandlers.test.ts > ExtractHandlers - upload > should return recordId on successful upload
   Test Files  2 failed | 1 passed (3)
        Tests  1 failed | 35 passed (37)

NOT all green at my base — two PRE-EXISTING failures, both environmental, both in the base
fail-file SET (see 0.3), both named honestly here rather than "fixed":
  (a) extractionE2E: `Error: ENOENT ... server/resources/vendor_pdfs/Bulletin_6816.pdf`
      (suite-level hook failure + afterAll cascade). The test resolves
      `process.cwd()/resources/vendor_pdfs/Bulletin_6816.pdf` (extractionE2E.test.ts:322) but
      the tracked file lives at REPO-ROOT resources/ (git ls-files resources → 10 tracked
      files; server/resources/ exists in NO checkout: not trunk, not this worktree, not Brad's
      live tree). Path bug predates W2-5 (2026-08-03_test-failures-snapshot.md already lists
      extractionE2E under integration/ failures). Per the W2-6 draft's own instruction pattern
      ("if it is in the fail-file SET on the claim base, record it, do not 'fix' it") I record
      it. My T1 suite (new file) uses the SAME harness WITHOUT the PDF leg (drafts are seeded
      directly), so the promote-path proof does not depend on this hole.
  (b) ExtractHandlers.test.ts:546 upload-spy assertion expects
      envelope.objectContaining({kind: 'extraction-draft'}) — RecordEnvelope has no `kind`
      field (payload carries kind). Assertion-vs-shape drift, pre-existing. Untouched.

### 0.3 Full-suite fail-file SET at base (SET-identity gate baseline)
Command: npx vitest run src/schema src/lint src/integration src/api/handlers src/store
  src/revisions src/governance   (captured /tmp/l2t2310-w25-baseline-full.log)
  Test Files  11 failed | 92 passed | 5 skipped (108)
       Tests  16 failed | 1008 passed | 53 skipped (1082)
FAIL-file SET (/tmp/l2t2310-w25-baseline-failfiles.txt):
  src/api/handlers/EventEditorFixHandlers.test.ts
  src/api/handlers/ExtractHandlers.test.ts
  src/api/handlers/MeasurementHandlers.applianceJob.test.ts
  src/api/handlers/SignatureHandlers.test.ts
  src/api/handlers/WorkspaceHandlers.test.ts
  src/governance/AuditEventService.test.ts
  src/integration/extractionE2E.test.ts
  src/revisions/RevisionStorage.test.ts
  src/schema/EventGraphEquipmentSchema.test.ts
  src/schema/LabwarePhysicalGeometryData.test.ts
  src/store/LifecycleBypassAudit.test.ts
NOTE: the spec §0.7 pin ({EGE, LPG}, 5 tests) describes the src/schema+src/lint dirs ONLY.
Measured per-dir at my base: src/schema+src/lint = {EventGraphEquipmentSchema,
LabwarePhysicalGeometryData} exactly as pinned; the other 9 FAIL files live in
src/integration src/api/handlers src/store src/revisions src/governance and are PRE-EXISTING
environmental/untracked-symlink failures (0.1(a), broken symlink, and handler-drift suites
that depend on Brad's newer untracked tree state — e.g. RevisionStorage expects an
`ingestion` property the trunk record-revision schema does not carry; SignatureHandlers/
WorkspaceHandlers/AuditEventService/EventEditorFix/MeasurementHandlers.applianceJob drift).
GATE: my tests may only REDUCE this SET, never add to it. Final gate re-runs the same command
and diffs the SET.

### 0.4 server tsc pin
Command: cd <wt>/server && npx tsc --noEmit  → /tmp/l2t2310-w25-tsc-server.txt (27 raw lines,
26 primary error lines). Normalized (strip (line,col), sort) multiset diff vs
/tmp/l2t2230-tsc-server.txt (26 lines): EMPTY — "TSC MULTISET IDENTICAL (primary error lines)".

### 0.5 Goldens / app pins
- sha256sum schema/scientist-intent/scientist-intent-vocabulary.yaml =
  014ca71fbbb3716db0df62cb93662d35f6efef3b3462e823518462357786d12c — matches
  server/src/compiler/scientistIntent/goldens/MANIFEST.yaml:9 pin byte-for-byte.
- git -c core.fileMode=false diff --stat -- server/src/compiler/scientistIntent/goldens/
  schema/scientist-intent/ → EMPTY. git diff --stat -- app/ → EMPTY.
- Wave2NamingCrosswalk.test.ts: 6 passed (green, UNTOUCHED).

### 0.6 Hard-stop greps at base (expect ZERO in non-test server/src)
- rung strings (VENDOR|DERIVED|INFERRED_INVARIANT|LOCAL_REALIZATION) in non-test server/src:
  hits exist TODAY in pre-existing files (protocolIdeVendors.ts PROTOCOL_IDE_VENDORS,
  draftTermManifest.ts comment, VendorProtocolEventGraphPromotionService.ts `EVG-VENDOR-` id,
  CaymanLibraryPublisher VENDOR_PRODUCT_SCHEMA_ID, LabwareSpecCandidateService KNOWN_VENDORS,
  JsonLdGenerator/WellStateTracker/normalizeScientistIntent comments). The grep is a
  W2-5-DIFF gate: my diff must add ZERO rung-string lines. Base hits are not mine.
- forbidden_kinds strings (semantic-protocol-family|semantic-extraction-ir|provenance-ladder|
  provenance-rung|realization-plan|'said'|'meant') in server/src + schema/workflow/extraction-*.yaml
  (non-test): ZERO at base.

## 1. CONFIRM-AGAINST-MERGED-TRUNK (first-hand at 78bee2c8)
- protocol.schema.yaml $defs/StepProvenanceRef: `type: { const: vendor-protocol-candidate }`
  at :1029 (allOf constraint block) AND :1032 (properties block) — grep confirms exactly the
  two sites inside the same $defs block. Widening applied CONSISTENTLY at both (§5).
- constraint vocabulary data: schema/registry/constraint-vocabulary/constraint-vocabulary.yaml
  requiredClasses :242 (well_state: [minimum, threshold]) + applicability :271 — CONFIRMED at
  the corrected path.
- extraction-draft.lint.yaml rules: [] at :3 with lintVersion: 1 + exact schemaId :1-2 —
  CONFIRMED; boot-skip server.ts:410-411 (`if (spec.rules.length === 0) continue;`) CONFIRMED.
- record-revision purpose enum [signature, research-use, derivation] (schema/governance/
  record-revision.schema.yaml:17) — CONFIRMED, no 'edit'.
- appendOnlyKinds knob config/types.ts:341 + DEFAULT_CONFIG value :474
  (['audit-event','signature']) + wired server.ts:721 — CONFIRMED.
- store hardcoded governance triple RecordStoreImpl.ts:656-658 (update) + :819-821 (delete) —
  CONFIRMED.
- xdr-*/xpr-* id namespace: read ALL merged *.lint.yaml ids (uniq -d over every lint.yaml =
  no duplicates today; existing families: xpr-* x5, prov-vendor-*/prov-derived-*/prov-local-*/
  prov-vocab-*, step-intent family (step-role-closure, labware-role-identity-bearing,
  role-id-category-unique, legacy-*, intent-*), constraint-vocab-* x8). Minted ids xdr-* and
  xpr-output-kind-registered collide with NONE.
- TARGET_KIND_TO_SCHEMA map lives at server/src/compiler/pipeline/passes/
  PromotionExtractionPasses.ts:73-78 (material-spec/protocol/equipment-spec/labware-spec) —
  the §2.1 lint DATA twins it; TS map untouched (F-W25-2).
- protocol.schema.yaml lifecycleId is `const: "document-control"` (:234-237) — a promoted
  protocol CANNOT declare lifecycleId: document-controlled-signing (schema reject). See §6 OQ3
  report.

## 2. T1-T7 (clause -> proof) — see §5 below for walkthrough vs §10 verbatim.

(sections filled as implementation lands)
