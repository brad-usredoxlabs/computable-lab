# W2-5-DRAFT-LIFECYCLE — coder report (wip, l2t0030r2 — RESUMED RUN)

Branch: W2-5-lane2-l2t0030r2 worktree /mnt/vast/home/brad/git/wt/W2-5-lane2-l2t2310
(branch W2-5-lane2-l2t2310) @ base 78bee2c8 (lane trunk tip at claim; includes W2-3 merge
2e672c1b + W2-4 merge 7d301c1f). Spec: .hermes/plans/2026-10-09_1720-W2-5-draft-lifecycle-spec.md
(promoted, PROMOTION RECORD applied: constraint-vocab path = schema/registry/constraint-vocabulary/;
§5 widening at BOTH :1029 and :1032; OQ1 config knob revisionOnEditKinds; OQ2 purpose 'edit';
OQ3 report-don't-widen).

This is the RESUMED run (r2). The first run (l2t2310) died to harness context-compression after
completing only its baseline capture. Its report .hermes/plans/W2-5-report.wip-l2t2310.md is
committed alongside this one; its §0 RED capture and §1 CAMT confirmations were produced
FIRST-HAND at THIS EXACT BASE and are carried here as inherited baseline (cited, not redone).

## 0. RED CAPTURE (inherited from l2t2310 §0, cited — verified carried, not redone)

- Worktree parity (prior §0.1): 112 entries BOTH trunk and lane worktree; comm -3 EMPTY.
  core.excludesFile = /home/brad/.hermes/cl/lanes/2/lane-exclude-W2-5-l2t2310 (113 lines).
  server/schema -> ../schema symlink. node_modules symlinked.
  LifecycleBypassAudit.test.ts is a SYMLINK into Brad's live tree whose target's first line is
  adversarial-review prompt text -> vitest Transform failure. PRE-EXISTING, not mine, not touched.
- Base fail-file SET (/tmp/l2t2310-w25-baseline-failfiles.txt, 11 files) for the scoped command
  `npx vitest run src/schema src/lint src/integration src/api/handlers src/store src/revisions
  src/governance`: EventEditorFixHandlers, ExtractHandlers, MeasurementHandlers.applianceJob,
  SignatureHandlers, WorkspaceHandlers, AuditEventService, extractionE2E, RevisionStorage,
  EventGraphEquipmentSchema, LabwarePhysicalGeometryData, LifecycleBypassAudit.
  Base scoped tail (prior §0.3): Test Files 11 failed | 92 passed | 5 skipped (108);
  Tests 16 failed | 1008 passed | 53 skipped (1082).
- Server tsc baseline multiset: /tmp/l2t2310-w25-tsc-server.txt = 26 primary error lines
  (27 raw lines incl. one continuation line); == dispatch pin /tmp/l2t2230-tsc-server.txt (26).
- Goldens: MANIFEST + schema/scientist-intent/ diff EMPTY at base (prior §0.7, MANIFEST vocab sha
  014ca71f...d12c byte-untouched).
- Rung-string base hits (prior §0.6): pre-existing VENDOR/DERIVED hits in vendor-documents/,
  ingestion/, compiler/, jsonld comments — NOT mine; my diff adds none (see §6 greps).

## 1. FIRST TARGETED CHECK (spec §6, re-run by me)

Command: cd <wt>/server && npx vitest run src/integration/extractionE2E.test.ts
  src/api/handlers/ExtractHandlers.test.ts src/compiler/pipeline/extractionCompileYaml.test.ts
My tail VERBATIM:

  ✓ src/compiler/pipeline/extractionCompileYaml.test.ts  (19 tests) 20ms
   FAIL  src/integration/extractionE2E.test.ts > E2E: PDF upload → extract → draft → promote → canonical + audit > full pipeline: upload PDF → extract → draft → promote → canonical + audit
   FAIL  src/api/handlers/ExtractHandlers.test.ts > ExtractHandlers - upload > should return recordId on successful upload
   Test Files  2 failed | 1 passed (3)
        Tests  2 failed | 35 passed (37)

Both failures are the prior run's §0.2 PRE-EXISTING environmental failures, both in the base
fail-file SET — recorded, NOT fixed:
  (a) extractionE2E: ENOENT server/resources/vendor_pdfs/Bulletin_6816.pdf — the test resolves
      process.cwd()/resources/... but the tracked file lives at REPO-ROOT resources/ (prior §0.2,
      first-hand). My T1 suite uses the SAME harness WITHOUT the PDF leg (drafts seeded directly),
      so the promote-path proof does not depend on this hole.
  (b) ExtractHandlers.test.ts:546 upload-spy expects envelope.objectContaining({kind: ...}) —
      RecordEnvelope has no `kind` field (payload carries kind). Assertion-vs-shape drift,
      pre-existing. Untouched.
(The green one, extractionCompileYaml.test.ts, re-verified green first-hand before any edit.)

## 2. WHAT LANDED (implementation, §3-§5)

§2/§3.1 DATA knobs — server/src/config/types.ts: new documented `revisionOnEditKinds?: string[]`
mirroring appendOnlyKinds; DEFAULT_CONFIG.server: appendOnlyKinds gains 'vendor-protocol-candidate'
beside the governance pair; revisionOnEditKinds: ['extraction-draft'].

§2.1 lint DATA — schema/workflow/extraction-draft.lint.yaml ACTIVATED (was rules: []): keeps
lintVersion: 1 + the EXACT schemaId (:1-2, bait 12); three rules minted in the collision-free
xdr-* namespace (all merged *.lint.yaml ids read first; LintEngine.ts:59-61 global duplicate-id
throw verified non-firing across the whole merged tree in T7):
  - xdr-promoted-candidate-anchored (everyItem candidates: promoted -> evidence_span nonEmpty OR
    uncertainty != unresolved)
  - xdr-promote-blocked-by-unresolved (promoted candidate must not carry ambiguity_spans — the
    lint twin of the runtime guard)
  - xdr-promote-requires-resolvable-target (target_kind in [protocol, material-spec,
    equipment-spec, labware-spec] — the promotable list as DATA, no new kind can enter)
§2.3 additive — schema/workflow/extraction-promotion.lint.yaml: xpr-output-kind-registered after
the merged xpr-status-enum (existing five rules UNTOUCHED).

§3.2 store backstop — server/src/store/RecordStoreImpl.ts: update (:~656) and delete (:~1277)
walls now evaluate ['record-revision','signature','audit-event', ...config appendOnlyKinds] — the
governance triple stays hardcoded (cited, not expanded, bait 5), the config list is appended
generically; DEFAULT_CONFIG gains appendOnlyKinds: []. server/src/store/types.ts documents the
store-config knob. server/src/server.ts:721 wires ctx.appConfig.server.appendOnlyKinds into
createRecordStore AND exposes getAppendOnlyKinds + getRevisionOnEditKinds live accessors to
RecordHandlers.

§3.3 promote path — server/src/extract/CandidatePromoter.ts: PromotionOutcome gains `code?`;
ambiguity guard keeps its reason and now names the xdr-promote-blocked-by-unresolved twin code;
canonicalization hardened (kind/recordId/state overrides — bait 8, see §5 below).
server/src/api/handlers/ExtractHandlers.ts: promote refusal surfaces actionable bodies —
422 PROMOTION_LINT_BLOCKED with rule_ids + instance paths when the store write wall carries lint
findings; 422 + findings for validation/lint store rejections on both promote and reject halves
(5xx only for transport errors); promotion audit event appended via AuditEventService (action
candidate_promoted, data names candidate_path + source_content_hash + output refs — W2-4 qms_note
contract: e-sign lives HERE); createExtractHandlers gains optional auditService param (bait 2:
optional means ABSENT OR VALUE — server.ts passes the instance, never undefined).

§3.4 MEANT edit path — server/src/api/handlers/RecordHandlers.ts: new extractionDraftReviewWriteGate
(mirrors protocolStepWriteGate EXACTLY: runs AFTER the controlled lock, BEFORE the store write, so
a refusal persists nothing) enforcing XDR_SOURCE_LOCKED (source_artifact immutable provenance —
any content-hash change refused), XDR_CANDIDATE_STATUS_REGRESSION (promoted->rejected etc.),
XDR_CANDIDATE_LOCKED (terminal candidate draft body drift). On a successful edit of a kind in
revisionOnEditKinds: capture(previous, actor, purpose 'edit') + audit-event action record_revised
with previous_sha/new_sha/revision_ref (OQ1 knob + OQ2 purpose).

§3.5 candidate wall — NO new wall code: the SAME 405 APPEND_ONLY wall (existing shape, bait 10)
widened by DATA (appendOnlyKinds names vendor-protocol-candidate); draft-copy whitelist,
protocol-steps NOT_A_PROTOCOL, promote/reject XDR-only behavior unchanged, proven by tests.

§3.6 UI — schema/workflow/extraction-draft.ui.yaml had NO list view (open at claim): additive
`list.columns` review hints (recordId/status/candidates[*].target_kind/candidates[*].confidence),
ui-v1 definitions/column shape, wildcard paths per the merged protocol.ui.yaml `$.steps[*]...`
precedent. Probe vs ui-v1 meta: my /list/ arm adds ZERO errors; the file's 4 pre-existing
/form/sections field-shape errors are IDENTICAL at base (git show HEAD: verified) — declared
neighbor drift, not repaired here.

§5 OQ1 seam — schema/workflow/protocol.schema.yaml $defs StepProvenanceRef: type const
vendor-protocol-candidate -> enum [vendor-protocol-candidate, evidence] at BOTH sites (:1029 allOf
constraint block AND :1032 properties block — sites confirmed non-divergent, widened consistently;
closed enum, never a free string). Nothing else on protocol.* changed.

§OQ2 — schema/governance/record-revision.schema.yaml purpose enum + RecordRevisionService.ts union
gain 'edit' (verified no existing filter breaks: freezeProtocol filters 'research-use',
pinInheritance signs 'derivation', draftCopy uses 'derivation').

## 3. §6 VERIFICATION COMMANDS — verbatim tails (all headless)

Scoped full gate (after all changes):
  npx vitest run src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance
   Test Files  11 failed | 99 passed | 5 skipped (115)
        Tests  16 failed | 1051 passed | 53 skipped (1125)
  Fail-file SET == base SET EXACTLY (comm -13 NEW: EMPTY; comm -23 FIXED: EMPTY — the gate is
  SET-identity: my tests only ADD passing files 92->99, tests 1008->1051; zero new failures).
  src/schema+src/lint failed files == {EventGraphEquipmentSchema, LabwarePhysicalGeometryData}
  (the §0.7 pin pair); every other named dir's failures are the base SET members.

  npx vitest run src/schema/Wave2NamingCrosswalk.test.ts -> green (with extractionCompileYaml +
  PipelineLoader re-run: Test Files 3 passed (3), Tests 41 passed (41) — pipeline YAMLs UNTOUCHED).

Protected re-runs (§5, widening must not break admission arms):
  npx vitest run src/schema/Wave2ProtocolIntentSchema.test.ts src/lint/Wave2ProtocolIntentRules.test.ts
    src/lint/ProtocolLintRules.test.ts src/lint/Wave2ProvenanceLadderRules.test.ts
   Test Files  4 passed (4)
        Tests  107 passed (107)

Typecheck:
  npx tsc --noEmit (server) -> 27 raw lines / 26 primary error lines; primary-line multiset
  (coords stripped) == /tmp/l2t2310-w25-tsc-server.txt EXACTLY (diff EMPTY) == dispatch pin
  /tmp/l2t2230-tsc-server.txt (26 primary lines; the 27th raw line is a continuation line present
  in both files). ZERO new tsc errors introduced.

Goldens gate:
  git -c core.fileMode=false diff --stat -- server/src/compiler/scientistIntent/goldens/
    schema/scientist-intent/ app/ -> EMPTY (MANIFEST vocab sha byte-untouched; app/ untouched).

Hard-stop greps (§6):
  grep -rn "VENDOR|DERIVED|INFERRED_INVARIANT|LOCAL_REALIZATION" server/src --include='*.ts' |
    grep -v test -> hits ONLY in pre-existing files (protocolIdeVendors, draftTermManifest,
    VendorProtocolEventGraphPromotionService EVG-VENDOR- id prefix, CaymanLibraryPublisher,
    LabwareSpecCandidateService, JsonLdGenerator/WellStateTracker/normalizeScientistIntent
    comments) — the prior §0.6 base list. My diff's added lines contain rung strings ONLY inside
    explanatory comments (protocol.schema.yaml seam comment names INFERRED_INVARIANT as a W2-4
    vocabulary reference; test comments) — zero rung strings in TS code, fixtures, or payloads.
  grep forbidden_kinds wall (semantic-protocol-family|semantic-extraction-ir|provenance-ladder|
    provenance-rung|realization-plan|'said'|'meant') server/src schema/workflow/extraction-*.yaml
    | grep -v test -> ZERO.
  grep -n "undefined" RecordHandlers.ts | grep -E "state:|version:|purpose:" -> ZERO (bait 2).
  My diff's single `undefined` addition is a helper RETURN value (asCandidates), not a property
  assignment — exactOptionalPropertyTypes-clean, tsc-verified.

Boot/activation (T7): the activated spec is non-empty so the server.ts:410-411 zero-rule skip no
longer applies; the whole merged lint tree loads with NO duplicate-id throw (LintEngine.ts:59-61);
boot stays green — proven by T1's real initializeApp/createServer boot (5/5 green) and by the
scoped suite (booting suites green).

## 4. T1-T7 CLAUSE -> PROOF WALKTHROUGH vs §10 ACCEPTANCE (verbatim criteria)

§10 verbatim: "promotion of an unresolved-constraint draft is refused with an actionable lint
error; an attempted candidate mutation is refused server-side; regulated ACTIVE promotion without
required signature refused, with signature succeeds; audit trail shows MEANT revisions without
candidate content drift; promoted output is a kind 'protocol' record — no new kind appears."

(a) "promotion of an unresolved-constraint draft is refused with an actionable lint error"
    = T1(a) + T2. T1(a) (real app boot, routes.ts:632 ExtractHandlers path ONLY — never :874):
    promote of an XDR whose candidates[0].draft is a literal (non-intent) protocol payload ->
    422 error PROMOTION_LINT_BLOCKED with rule_ids ['legacy-literal-bounded'] + instance paths in
    the body (the merged W2-3/W2-4 firing rule, §2.3). T2 (ProtocolLintRules.test.ts harness copy,
    REAL protocol.lint.yaml parsed from disk): the rule FIRES on the promoted payload with rule id
    + instance path; an intent-bearing payload does NOT trip it (gate is data, not blanket); the
    gate lives in DATA — W2-5 authored nothing there. Store.create blocking proven end-to-end
    (RecordStoreImpl.ts:492-504 create-path rejection + T1(a) body).
(b) "an attempted candidate mutation is refused server-side" = T4, every §3.5 row:
    PUT /records/:id -> 405 APPEND_ONLY (config data); DELETE -> 405 APPEND_ONLY; draft-copy ->
    422 DRAFT_COPY_UNSUPPORTED; protocol-steps PATCH -> 400 NOT_A_PROTOCOL (route harness copy,
    protocol-steps.test.ts precedent); promote/reject touch only the XDR; store-level bypass arms
    on a REAL RecordStoreImpl (tmp git repo + REAL VPC schema): store.update AND store.delete both
    refused APPEND_ONLY from the config-injected list, stored token (token() = meta.contentSha)
    byte-identical after the attempts; knob-is-data assertion (DEFAULT_CONFIG names the kind
    beside the governance pair).
(c) "regulated ACTIVE promotion without required signature refused, with signature succeeds"
    = T3 (RevisionRoutes.test.ts direct-handlers + testStore + REAL LifecycleEngine + REAL
    document-control/document-controlled-signing lifecycle YAMLs + SignatureHandlers mint flow):
    leg A: promoted protocol born draft (state draft asserted) PUT->effective refused fail-closed
    LIFECYCLE_TRANSITION_DENIED, nothing persisted (LifecycleEngine.ts:131-137 requires_signature
    fail-closed); leg C: ACTIVE transition refused WITHOUT signature, then SUCCEEDS with a minted
    signature (POST /signatures contract: capture purpose 'signature' on the CURRENT saved
    revision, content-hash freshness per RecordHandlers.ts:801-804) + role assignments; audit-event
    action lifecycle_transition exists WITH signatureRefs (RecordHandlers.ts:982-993 shape).
(d) "audit trail shows MEANT revisions without candidate content drift" = T5 + T4(e):
    T5 (RevisionRoutes harness + W2-5 security accessors): PUT /records/:XDR changing
    candidates[0].draft with expectedSha -> 200; GET /records/:XDR/revisions contains a
    record-revision whose snapshot == previous payload, purpose 'edit' (OQ2); audit-event action
    record_revised with previous_sha/new_sha/revision_ref; stale expectedSha -> 409 persisting
    NOTHING (no revision, no audit event); gate arms XDR_SOURCE_LOCKED /
    XDR_CANDIDATE_STATUS_REGRESSION / XDR_CANDIDATE_LOCKED each refuse persisting nothing;
    appendOnlyKinds does NOT block XDR edits (different kind — the wall is the list, not a
    wildcard); bait-9 idempotence: double capture of the same envelope re-returns the identical
    content-addressed REV, exactly one revision minted. T4(e): full promote flow -> the VPC
    record's token() byte-identical before/after ("without candidate content drift", literal).
(e) "promoted output is a kind 'protocol' record — no new kind appears" = T1(c) + greps +
    crosswalk: T1(c) happy promote -> output record payload.kind === 'protocol' born state draft,
    XPR extraction-promotion record created, audit-event action candidate_promoted exists
    (governanceStrictness.test.ts:301-321 predicate style); forbidden-kinds greps ZERO (§3 above);
    Wave2NamingCrosswalk.test.ts green UNTOUCHED; xdr-promote-requires-resolvable-target +
    xpr-output-kind-registered lint DATA carry the promotable-kind list (F-W25-2 twin, no TS map).

T1 arms beyond (a)/(c): (b) ambiguity_spans candidate -> 400 naming the
xdr-promote-blocked-by-unresolved twin code; (d) state-spoof arm, see §5.
T6 arms: seam site exists as CLOSED ENUM at both $defs sites; POSITIVE type: evidence validates;
original const member still validates (additive); NEGATIVE type: material-spec rejects; NEGATIVE
free string rejects.
T7 arms: lintVersion 1 + exact schemaId kept; xdr-promoted-candidate-anchored FIRES (no
evidence_span + uncertainty unresolved) and stays SILENT (anchored / pending);
xdr-promote-blocked-by-unresolved FIRES on ambiguity_spans, SILENT when empty/absent;
xdr-promote-requires-resolvable-target FIRES on unregistered target_kind, passes the declared
list; xpr-output-kind-registered FIRES/passes; whole merged tree loads with no duplicate-id throw;
activated draft spec satisfies the lint-v1 meta-schema (Ajv).

Suite inventory (all green in the scoped gate): W25DraftLifecyclePromotion 5, W25RequiredConstraintGate 3,
W25RegulatedLifecycle 4, W25CandidateImmutability 8, W25MeantEditRevisions 7, Wave25OQ1SeamSchema 5,
W25LintActivation 11 — 43 arms total.

## 5. THE STATE-SPOOF HOLE (§8 bait 8) — named honestly

At base, CandidatePromoter.ts:145 spreads candidate.draft into the canonical record, so a draft
declaring `state: effective` (or lifecycleId + controlled state) could be promoted straight into a
CONTROLLED-EFFECTIVE protocol: the create-side had NO controlled guard while the update path has
one (RecordStoreImpl.ts:660). This is the security finding of the spec. §3.3(a) closes it
STRUCTURALLY: the promoter canonicalizes kind/recordId/state (promoted protocols are born draft;
a draft declaring a controlled non-draft state alongside lifecycleId is refused BEFORE any write
with code PROMOTION_CONTROLLED_ESCALATION), and T1(d) proves it: promote of a draft declaring
state: effective + lifecycleId -> 422 PROMOTION_CONTROLLED_ESCALATION and NOTHING persisted
(record-id set before == after; zero new records). F-W25-3 note: the lifecycle-bypass DETECTOR
(RecordStoreImpl.ts:664-668 previousPayload / lifecycleBypassAudit hook, lifecycle/BypassAudit.ts)
exists and stays; W2-5 closes the create-side hole structurally instead of only detecting it.

## 6. CONFIG-KNOB DOCUMENTATION DIFF (verbatim)

server/src/config/types.ts:
+  /**
+   * Record kinds whose ordinary review EDITS (PUT /records/:id) capture a
+   * record-revision snapshot of the superseded payload and append a
+   * `record_revised` audit event. Mirrors the appendOnlyKinds pattern: a
+   * documented DATA knob, evaluated generically by the record handler — no
+   * kind-branching in TypeScript. Defaults to the extraction-draft review
+   * surface in DEFAULT_CONFIG.
+   */
+  revisionOnEditKinds?: string[];
 DEFAULT_CONFIG.server:
-    appendOnlyKinds: ['audit-event', 'signature'],
+    appendOnlyKinds: ['audit-event', 'signature', 'vendor-protocol-candidate'],
+    revisionOnEditKinds: ['extraction-draft'],
Wired at server.ts:721 (createRecordStore config + getAppendOnlyKinds/getRevisionOnEditKinds
accessors). OQ1 ruling (config knob) implemented as directed.

## 7. diff --name-only (tracked changes) + new test files

schema/governance/record-revision.schema.yaml
schema/workflow/extraction-draft.lint.yaml
schema/workflow/extraction-draft.ui.yaml
schema/workflow/extraction-promotion.lint.yaml
schema/workflow/protocol.schema.yaml
server/src/api/handlers/ExtractHandlers.ts
server/src/api/handlers/RecordHandlers.ts
server/src/config/types.ts
server/src/extract/CandidatePromoter.ts
server/src/revisions/RecordRevisionService.ts
server/src/server.ts
server/src/store/RecordStoreImpl.ts
server/src/store/types.ts
(13 files, 432 insertions(+), 11 deletions(-))
New test suites (7): server/src/integration/W25DraftLifecyclePromotion.test.ts,
server/src/lint/W25RequiredConstraintGate.test.ts, server/src/api/handlers/W25RegulatedLifecycle.test.ts,
server/src/integration/W25CandidateImmutability.test.ts, server/src/revisions/W25MeantEditRevisions.test.ts,
server/src/schema/Wave25OQ1SeamSchema.test.ts, server/src/lint/W25LintActivation.test.ts.
Scratch probes live in server/scratch/ and are NOT committed. NO compiler-pipeline pass files
touched (SchemaValidateDraftPass / PromotionCompileRunner / PromotionExtractionPasses — F-W25-1/2
untouched per contract).

## 8. nonEmpty-object probe note (scratch/probe-nonempty3.ts, LintEngine addSpec)

Engine semantics verified first-hand for the rules I authored: nonEmpty on `{}` -> VIOLATION;
`{a:1}` -> valid; `[]` -> violation; `'x'` -> valid; `null` -> violation; MISSING key -> violation
(PathResolver.isEmpty: undefined/null/empty-string/empty-array/empty-object all empty). So
xdr-promoted-candidate-anchored's `nonEmpty: evidence_span` fires on both an absent and an
empty-object/empty-array evidence_span, and stays silent on a populated one.

## 9. F-W25-1 / F-W25-2 / F-W25-3 DISPOSITIONS

- F-W25-1 (second promote path: SchemaValidateDraftPass declared stub + PromotionCompileRunner
  canonical==audit aliasing behind routes.ts:874): NOT repaired, NOT touched (contract boundary;
  reviewer-reject zone). All W2-5 tests route via routes.ts:632 (ExtractHandlers) only. Remains
  the orchestrator's disposition (own item or W2-6 precondition).
- F-W25-2 (TARGET_KIND_TO_SCHEMA hardcoded map, PromotionExtractionPasses.ts:73-78): map left in
  place (pass files untouched); §2.1 lint data now TWINS it (xdr-promote-requires-resolvable-
  target + xpr-output-kind-registered carry the lists as DATA). Map deletion needs the pass
  re-read pipeline data — named follow-up, out of this diff.
- F-W25-3 (lifecycle-bypass detector exists; detection-only): §3.3(a) closes the create-side hole
  STRUCTURALLY (promoter canonicalization + PROMOTION_CONTROLLED_ESCALATION refusal before write);
  detector untouched; T1(d) proves the closure. Mentioned, no detector code changed.

## 10. OQ3 GAP REPORT (cycle-1, per ruling — guards NOT widened)

T3 leg B1: a freshly promoted protocol record carries NO payload createdBy (the promoter mints
from candidate.draft; the VPC/protocol schemas are closed and carry no createdBy the promoter
could stamp), so roleAssignments.author is ABSENT on the promoted record and author-role lifecycle
transitions fail closed on a promoted-shaped payload. The machinery itself works once an author is
assigned (leg B2: createdBy present -> draft->in_review by the author, in_review->approved by a
DIFFERENT reviewer — requires_different_person honored). Per the OQ3 ruling this is REPORTED as an
increased-scope signal (who assigns the author role on a promoted record — promote handler stamp,
policy default, or orchestrator decision), NOT repaired by widening guards. Related base note
(prior §1): lifecycleId const document-control at protocol.schema.yaml:234-237 — same OQ3
territory; untouched.

## 11. DECLARED FINDINGS (pre-existing, recorded not fixed)

- extraction-promotion.lint.yaml does NOT satisfy the lint-v1 meta-schema AT BASE (git show
  HEAD: probe: 136 errors; with my additive rule: 164 — every error sits on the five merged rules
  ($. -rooted paths + static values vs the shipped oneOf/pattern set), ZERO on my rule's shape
  beyond the same family). Neighbor drift; not silently repaired (T7 asserts both facts). My
  activated extraction-draft.lint.yaml validates meta-CLEAN.
- extraction-draft.ui.yaml /form/sections field-shape drift vs ui-v1 (4 errors) identical at base
  and after my additive list arm (probe-verified both).
- surfacesAjv.test.ts failures: the lane-synced surfaces registry symlink into Brad's live tree
  (registry.ts untracked lane-synced file) — environmental, out of the scoped SET, untouched.
- Full-suite (beyond the §6 scoped gate) run shows ~77 out-of-SET files failing with 30s
  initializeApp timeouts under parallel NFS load (e.g. initializeApp.extractionRunner "Test timed
  out in 30000ms") — environmental boot pressure, not in the contract gate; the scoped §6 gate is
  SET-identical to base.
- Durable lane store hygiene: my early T1 runs (before I pinned CONFIG_PATH to an isolated
  server/tmp config) leaked fixtures into the lane-2 durable store (/home/brad/.computable-lab-
  lane2/worktrees/main). Purged with chore commits 6fdd352/e07e265 (+ index-entry cleanup):
  records/ and records/_index/records.jsonl now carry ZERO w25 entries (grep-verified). The test
  now pins CONFIG_PATH + isolated dataDir in beforeAll; later runs wrote nothing durable.

## 12. GATE SUMMARY

- Scoped §6 gate: SET-identical to inherited base (11 failed files, 16 failed tests; +7 new
  passing files, +43 passing arms). Wave2NamingCrosswalk + extractionCompileYaml + PipelineLoader
  green. Protected §5 re-runs 107/107 green. tsc multiset == pin (26 primary lines, zero new).
  Goldens/app diff EMPTY. Hard-stop greps clean. Boot green with the activated spec. Headless
  throughout — no browser, no :3093/:5193/:3001/:5174.
