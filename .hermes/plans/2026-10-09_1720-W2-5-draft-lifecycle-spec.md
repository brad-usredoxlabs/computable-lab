# W2-5-DRAFT-LIFECYCLE — spec DRAFT (l2t1651, 2026-10-09 ~17:20 EDT)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews +
promotes to `.hermes/plans/<canonical>-W2-5-draft-lifecycle-spec.md`.

GOAL (one sentence): wire the existing extraction-draft -> extraction-promotion lifecycle to the
W2-3 intent-step protocol shape — review edits ride ordinary revisions+audit, the SAID candidate is
write-protected on every server mutation path, promotion honors controlled lifecycle/signature
gating and refuses unresolved-required-constraint drafts with machine-readable lint-data errors,
and the promoted output is a kind `protocol` record — zero new route family, zero new kind, zero
third IR.

Base examined by composer: lane trunk /mnt/vast/home/brad/git/cl-integration-2 @ docs tip
33ab8e9b / code tip 796cfc0f (AFTER W2-1 + W2-2 merges; W2-3 coder LIVE at l2t1650 — its merged
protocol triplet does NOT exist on trunk yet; W2-4 spec drafted, not merged). W2-5 deps:
W2-3-PROTOCOL-SEMANTIC-UPGRADE, W2-4-PROVENANCE-LADDER — every bind to their shapes reads
"CONFIRM AGAINST MERGED TRUNK AT PROMOTION". Merged trunk wins over every shape assumed here.
Screening inputs (corroborating, NOT authority; every load-bearing cite below re-verified
first-hand this session): /home/brad/.hermes/cl/lanes/2/tmp-orch/W2-5-orientation-l2t1651.md,
cl-scout logs /tmp/l2t1651-scout-{audit,candidate,compile}.log — the candidate scout's claim that
"vendor-protocol-candidate is not a database record type" is REFUTED in part: the schema triplet
exists and POST /records can mint any registered kind (see §4); its useful finding (NO write wall
exists today) stands and matches my greps.
git ALWAYS `-c core.fileMode=false`. NEVER :3001/:5174/:3093/:5193 interaction (HEADLESS item,
no browser gate, lane stack belongs to the orchestrator). NEVER touch
/mnt/vast/home/brad/git/computable-lab.
exactOptionalPropertyTypes on backend: optional means ABSENT OR VALUE, never `undefined`.

## 0. TRUNK REALITY (every file:line opened this session at 33ab8e9b/796cfc0f)

0.1 THE DRAFT/PRODUCTION TRIPLET (already registered):
- schema/workflow/extraction-draft.schema.yaml — kind const `extraction-draft` (:17-18), recordId
  `^XDR-` (:20-23), `candidates[]` items required [target_kind, draft, confidence] with
  additionalProperties:false (:46-49), `draft` explicitly "unvalidated at this layer" (:54-56),
  per-candidate `ambiguity_spans[] {path,reason}` (:61-72), `uncertainty` enum
  [low, medium, high, unresolved, inferred] (:79-82), per-candidate `status` enum
  [promoted, rejected] (:84-86), record `status` enum [pending_review, partially_promoted,
  rejected, promoted] (:89-91). NO lifecycleId/state field exists on extraction-draft.
- schema/workflow/extraction-draft.lint.yaml — `rules: []` (:3). DORMANT: server.ts:410-411 skips
  zero-rule specs at boot (`if (spec.rules.length === 0) continue;`), so this file fires NOTHING
  today. Activating it is a W2-5 deliverable (boot-skip is length-checked only — W2-4 OQ3
  confirmed the same boot behavior; a non-empty rules list goes live at boot).
- schema/workflow/extraction-promotion.schema.yaml — audit record: required [kind, recordId,
  source_draft_ref, candidate_path, source_artifact_ref, source_content_hash, output_kind,
  output_ref, promoted_at, version, status] (:11-22); `candidate_path` JSON-path string like
  `candidates[0]` (:46-48); `output_kind` is a FREE STRING (:69-71) — the kind discipline lives in
  lint data, not the schema; `status` enum [active, retracted] (:105-107).
- schema/workflow/extraction-promotion.lint.yaml — five live rules, ids `xpr-recordid-pattern`,
  `xpr-hash-64`, `xpr-promoted-at-iso`, `xpr-version-1`, `xpr-status-enum` (:4-62). Rule-ID
  namespace caution: LintEngine.ts:59-61 throws globally on duplicate rule ids — new ids here must
  not collide (see §8 bait 3).
- Triplets complete: both kinds have .lint.yaml + .ui.yaml (ls-verified).

0.2 THE TWO PROMOTE PATHS (both exist; only one is honest today):
- WORKING PATH (E2E-proven, W2-5's host): `POST /extraction/drafts/:id/candidates/:i/promote`
  (server/src/api/routes.ts:632) -> ExtractHandlers.promoteCandidate
  (server/src/api/handlers/ExtractHandlers.ts:118-321) -> `promoteCandidate()` in
  server/src/extract/CandidatePromoter.ts:100-189 (ambiguity_spans guard :117-122, registered-
  schema check :124-131, Ajv validation :133-141, mints canonical by spreading `draft` and
  overriding kind/recordId :143-149, computes source_content_hash :167, builds extraction-promotion
  record with `output_kind: candidate.target_kind` :170-182) -> persists canonical via
  store.create (:256-265), promotion record (:273-282), flips draft candidate status (:289-318).
  HONEST today except two holes named in §3/§4 (500-swallows-lint :267-270; draft payload spread
  at CandidatePromoter.ts:145 lets a crafted draft carry `state`).
- SECOND PATH (inventory, do NOT build on it):
  `POST /extraction/protocols/:draftId/promote` (routes.ts:874) -> ProtocolHandlers.ts:290-306 ->
  ProtocolExtractionService.promoteDraft (server/src/protocol/ProtocolExtractionService.ts:541-683,
  target_kind must be 'protocol' :564-567) -> runPromotionCompile
  (server/src/compiler/pipeline/PromotionCompileRunner.ts:74-171). Its `schema_validate_draft`
  pass is a declared stub — "simplified implementation that skips actual schema validation" with a
  TODO (SchemaValidateDraftPass.ts:9-11, :44-47) — and its extraction projection returns the AUDIT
  shape as BOTH canonicalRecord and auditRecord
  (PromotionCompileRunner.ts:146-147: `const auditRecord = canonicalRecord;`). Declared as
  finding F-W25-1 (§9); NOT silently repaired here (out-of-scope unless the claim-time trunk proves
  the promoted output of the WORKING path depends on it — it does not at 33ab8e9b).
- PIPELINE DECLARATIONS REUSED, NOT RESTRUCTURED: schema/registry/compile-pipelines/
  promotion-compile.yaml (7 passes; extraction branch gated `when: meta.branch == 'extraction'`
  :17-20, :35-38; header in extraction-compile.yaml:7-8 defers authoritative validation to
  "promotion-compile extraction branch, spec-064") and extraction-compile.yaml (3 passes,
  pipelineId/entrypoint :16-17). W2-5 adds NO pipeline, NO pass, NO route family: it extends the
  EXISTING routes enumerated in §3 and the lint DATA (§2).

0.3 WRITE-WALL MACHINERY THAT EXISTS TODAY (the reuse set):
- Append-only kinds: RecordHandlers.ts:728-738 (PUT) and :1178-1188 (DELETE) build
  `['record-revision','signature','audit-event', ...security.getAppendOnlyKinds?.()]` and answer
  405 APPEND_ONLY; the config knob is server/src/config/types.ts:338-341 (`appendOnlyKinds?`,
  documented as DATA) with DEFAULT_CONFIG value `['audit-event','signature']` at :474, wired at
  server.ts:721. Store-level backstop today is a HARD-CODED triple on update
  (server/src/store/RecordStoreImpl.ts:656-658) and delete (:819-821) — does NOT read config.
- Controlled-content lock: update-time only, at two layers — RecordHandlers.ts:855-857
  (`previous.lifecycleId && state in [approved,effective,superseded,archived] &&
  controlledContent(prev) !== controlledContent(proposed)` -> 409 CONTROLLED_RECORD_LOCKED) and
  RecordStoreImpl.ts:660-662 (same rule, store backstop). `controlledContent()` lives at
  server/src/revisions/RecordRevisionService.ts:31-35. THE CREATE PATH HAS NO SUCH GUARD —
  store.create validates schema + lint only (see §0.5); a created payload can arrive carrying
  `state: effective`.
- Protocol-steps routes are structurally unreachable for candidates: every handler guards
  `payload.kind !== 'protocol'` first (server/src/api/routes/protocol-steps.ts:302, :340, :384,
  :491, :569, :658, :726, :771, :837) and `contentLocked()` (:216-219) mirrors the lock (:391,
  :496, :574, :776, :843). PROTO-AI-5's whole-record mirror is
  `protocolStepWriteGate(previous, proposed)` called AFTER the controlled lock in
  RecordHandlers.ts:858-868 — the exact gate pattern W2-5's draft-write-gate copies (§3.4).
- draftCopy whitelists source kinds `['protocol','controlled-document']`
  (RecordHandlers.ts:233) — a candidate can never be draft-copied. Create-path precedent for
  "state must start draft": RecordHandlers.ts:471-478 (protocol forced `state: 'draft'` on
  POST /records; controlled-document create REJECTS non-draft state with 422
  INITIAL_STATE_REQUIRED).
- vendor-protocol-candidate schema: schema/workflow/vendor-protocol-candidate.schema.yaml —
  additionalProperties:false (:10), required 11 fact arrays (:11), NO lifecycleId/state field
  anywhere in the 254-line file. So no candidate can carry lifecycle state TODAY; it is immutable
  BY CONVENTION ONLY — no server wall names this kind (grep server/src/api, non-test: the kind
  appears only as AI output shapes in ProtocolBuilderHandlers.ts:59,289,375,517,586 and inline
  summaries in VendorSearchHandlers.ts:748,834,1093; no store.update/store.delete path targets it
  because the generic PUT/DELETE /records/:id would happily mutate it).

0.4 REVISIONS + AUDIT + SIGNATURE MACHINERY (lane-1 QMS assets, reuse verbatim):
- RecordRevisionService (server/src/revisions/RecordRevisionService.ts): `capture(source, actor,
  purpose, version?)` :62-82 (content-addressed REV- id :65 — idempotent, existing snapshot
  returned :66-67), `freezeProtocol` :83-107 (expectedToken optimistic check :89-90, controlled
  protocols must be `state==='effective'` before use :87), `token(record) = meta.contentSha ??
  meta.commitSha` :37. Purpose today: `'signature' | 'research-use' | 'derivation'` (:9) — the
  schema pins `purpose: { enum: [signature, research-use, derivation] }` at
  schema/governance/record-revision.schema.yaml:17. NO 'edit' purpose exists (§9 OQ2).
  GET /records/:id/revisions exists (routes.ts:224 -> RecordHandlers.listRevisions, :225).
- Audit surface EXISTS: server/src/governance/AuditEventService.ts:16-41 appends kind
  `audit-event` records (schema schema/governance/audit-event.schema.yaml — kind const :24, EVT-
  pattern :28, action pattern `^[a-z][a-z0-9_]*$` :36, required [recordId, actor, action,
  subjectType, subjectId, occurredAt] :13); best-effort, never fails the operation (:38-40);
  instance wired at server.ts:703. Emitted TODAY at exactly three places: lifecycle transitions
  (RecordHandlers.ts:977-995, action `lifecycle_transition`, asserts via
  server/src/governance/governanceStrictness.test.ts:301-321), signature mint
  (SignatureHandlers.ts:143), collab hook (RecordStoreImpl.ts:761). Plain record EDITS emit NO
  audit event and capture NO revision (only draftCopy :235 and signing :94 call capture()).
- Signature machinery EXISTS end-to-end: schema/governance/signature.schema.yaml (kind const
  signature :25, required incl. action :14-19), POST /signatures (routes.ts:602 ->
  SignatureHandlers.mintSignature; capture(purpose 'signature') :94), and transition-side
  validation in RecordHandlers.ts:795-815 (SIGNATURE_SIGNER_MISMATCH :795, STALE_SIGNATURE via
  revision contentHash compare :801-804, SIGNED_CONTENT_CHANGED via controlledContent :806-808,
  SIGNATURE_TARGET_MISMATCH :809-811).
- Lifecycle engine ENFORCES requires_signature FAIL-CLOSED:
  server/src/lifecycle/LifecycleEngine.ts:131-137 — no signatureAction -> false; otherwise the
  actor must have a presented signature matching (subjectRecordId, signedBy, action). Guard
  vocabulary: schema/core/lifecycle.meta.schema.yaml:66-73 (`requires_signature` :73).
  Controlled signing lifecycle: schema/core/lifecycles/document-controlled-signing.lifecycle.yaml
  — in_review->approved requires different-person + `requires_signature signatureAction: approved`
  (:44-52); approved->effective ("Make effective") requires
  `requires_signature signatureAction: approved` (:57-63). States draft/in_review/approved/
  effective/superseded/archived (:16-37). GET /lifecycle/:id/transitions exists (routes.ts:597).
  NOTE: the lifecycle dir is `schema/core/lifecycles/` (NOT `schema/lifecycles/` — the orientation
  note's path was wrong; corrected by find).

0.5 WRITE-TIME VALIDATION ORDER (what blocks what, today): RecordStoreImpl create path validates
Ajv then LINT and REJECTS on lint errors (`lint.valid === false` -> `success:false,
error:'Lint failed with errors'`, :492-504); update path lints at :697. So ANY rule that fires on
the promoted protocol payload blocks store.create AT PROMOTION TIME for free — W2-5's
unresolved-constraint gate is LINT DATA riding this existing wall (W2-3/W2-4 protocol.lint.yaml
rules + §2's xdr-* rules), never a TS branch.

0.6 LINT DSL REALITY: LintEngine.lint(data, schemaId) (server/src/lint/LintEngine.ts:231),
record-scope-only (no cross-record joins, :126-129 — W2-4 OQ2's finding, re-confirmed), ops
today: exists/nonEmpty/regex/equals/in/all/any/not/has_material_class/state_is/
context_contains/lineage_includes/time_within/mention_kind_matches/allIn/everyItem/noneIn
(server/src/lint/types.ts:51-266). All §2 rules below are expressible with these.

0.7 PINNED BASELINES (this session's re-measures; claim-time re-capture is the gate):
- src/schema+src/lint fail-file SET = {EventGraphEquipmentSchema, LabwarePhysicalGeometryData},
  5 failed tests (captured /tmp/l2t1251-failfiles-schema-lint.txt: 3 EGE + 2 LPG FAIL lines,
  "2 failed | 39 passed | 5 skipped (46)"); W2-2 merge note (task-list l2t1611) records the same
  set with 521 passed on merged trunk.
- server tsc = 26 error-lines; compare PER-FILE+MESSAGE MULTISET (naive line-diff lies — W2-2
  l2t1611 note).
- MANIFEST vocab pin: server/src/compiler/scientistIntent/goldens/MANIFEST.yaml:9-10 pins
  schema/scientist-intent/scientist-intent-vocabulary.yaml sha256
  `014ca71fbbb3716db0df62cb93662d35f6efef3b3462e823518462357786d12c` — byte-untouched (W2-5 mints
  nothing scientist-intent).
- Wave2NamingCrosswalk.test.ts (server/src/schema/) UNTOUCHED green.
- forbidden_kinds (schema/registry/wave2-naming-crosswalk.yaml, admission-tested): semantic-
  protocol-family, semantic-extraction-ir, said, meant, provenance-ladder, provenance-rung,
  realization-plan (+ constraint-class, quantity) — none may appear as a record kind anywhere.

## 1. SCOPE

IN SCOPE (file-by-file in §3):
(a) extraction-draft whose candidates[].draft holds a full W2-3 intent-step protocol payload ->
    review edits via PUT /records/:XDR create ordinary revisions + audit events (existing
    expectedToken/contentSha optimistic locking);
(b) promotion honors lifecycle gating incl. requires_signature where controlled — promoted output
    is ALWAYS born draft; ACTIVE is reachable only through the existing signed transitions;
(c) unresolved REQUIRED constraints (W2-2 vocabulary's required/optional policy is data:
    constraint-vocabulary.yaml `requiredClasses` :242 and `applicability` :271-282 — profile-
    keyed class closure lands with W2-3's consuming mount, CONFIRM AT MERGE) block promotion
    because protocol.lint.yaml findings reject the promoted store.create (§0.5) — W2-5's job is
    activating draft-side rules + surfacing the findings ACTIONABLY;
(d) candidate immutability server-side on EVERY mutation path (§3.5 matrix);
(e) promoted output kind `protocol` via output_kind = candidate.target_kind
    (CandidatePromoter.ts:173), kind discipline declared as lint data, no new kind.

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- New routes, new route families, new pipeline YAML/pass, new record kinds, a third IR (D5/R1-a).
- The second promote path's stub pass + canonical/audit confusion (SchemaValidateDraftPass.ts,
  PromotionCompileRunner.ts:146-147) — DECLARED finding F-W25-1 (§9), not repaired here.
- W2-4's ladder vocabulary and lint (schema/registry/provenance-ladder/ — W2-4 DRAFT §A-C at
  .hermes/plans/2026-10-09_1520-W2-4-provenance-ladder-spec-DRAFT-l2t1451.md:226-233); W2-5
  CONSUMES rung admission, never re-declares it. Rung names VENDOR / DERIVED / INFERRED_INVARIANT
  / LOCAL_REALIZATION appear in W2-5 files ONLY as references to that vocabulary data — never as
  minted kinds, never as TS constants, never minted into protocol payloads by W2-5 code (W2-4's
  transition_policy `mints: {DERIVED: [extraction, review-edit], ...}` and qms_note — W2-4 draft
  :354-369 — say review edits mint DERIVED and e-sign lives at promotion-to-ACTIVE on THIS
  surface; that is W2-5's contract, honored by §3.3's audit payload naming candidate_path+anchors).
- W2-4's locally-validated service host = W2-7 (orch OQ2 disposition, task-list l2t1451 note);
  W2-5 consumes clause data only.
- The reusable-UI surface (W2-8), the AI pass (W2-6), realization (W2-7), the whole `app/` tree.
- scientistIntent goldens + MANIFEST re-bless; any scientist-intent vocabulary edit.
- schema/workflow/protocol.schema.yaml beyond the ONE declared OQ1 seam line (§5).

## 2. PROMOTION-GATING RULE SET — ALL AS DATA, STABLE MACHINE-READABLE CODES

Every code below is a lint rule ID or a handler error code; handlers copy codes verbatim; no TS
branch invents policy. Codes are append-only commitments (never rename, only add).

2.1 schema/workflow/extraction-draft.lint.yaml (ACTIVATE — today `rules: []`), ids `xdr-`:
- xdr-promoted-candidate-anchored (ERROR): every candidate with status==promoted must carry
  evidence_span OR uncertainty != unresolved — expressed with everyItem + any/not over the
  candidates[] selector. Code: rule id.
- xdr-promote-blocked-by-unresolved (ERROR): no candidate with status==promoted may carry
  ambiguity_spans (array empty/absent) — the draft-level twin of CandidatePromoter's existing
  runtime guard (CandidatePromoter.ts:117-122), now with a code and a path (the runtime guard's
  free-text reason has no code — W2-5 keeps the guard, adds the code in the handler response, §3.2).
- xdr-promote-requires-resolvable-target (ERROR): candidates[].target_kind in the SAME list
  promotion is allowed to mint. Data value at claim time: [protocol, material-spec,
  equipment-spec, labware-spec] — mirrors the existing pass map (PromotionExtractionPasses.ts:
  :73-78); naming it in lint data is the point (the TS map predates this rule; W2-5 does NOT edit
  that TS file — deleting the TS map toward data is a named follow-up, §9 F-W25-2).
  This rule + extraction-promotion.lint.yaml additions = the "promoted output is kind protocol"
  wall for wave-2 drafts: for target_kind==protocol drafts, output_kind is protocol by
  construction (CandidatePromoter.ts:173), and no NEW kind can enter because an unregistered/
  non-listed target_kind fails here before any write.
2.2 schema/workflow/extraction-promotion.lint.yaml (ADDITIVE, ids continue `xpr-`):
- xpr-output-kind-registered (ERROR): output_kind in [protocol, material-spec, equipment-spec,
  labware-spec] (same declared list; duplicate the literal pair with a comment cross-ref — the
  DSL has no cross-file ref; two rule ids, one concept, comment names the twin).
2.3 protocol.lint.yaml (W2-3/W2-4's file — W2-5 ADDS NOTHING unless the merged trunk proves the
  required-constraint closure absent; then STOP-and-report, do not author rules into a neighbor's
  surface): the unresolved-required-constraint block works because the promoted protocol payload
  is linted at store.create (§0.5). W2-5's obligation is the PROOF TEST (§6 T2) that a draft whose
  payload trips a required-constraint protocol.lint rule yields a refused promotion with that
  rule's id surfaced — against the MERGED W2-3 rule set (step-intent-*/legacy-*) and MERGED W2-4
  (prov-*). If merged trunk has NO firing required-class rule at protocol scope, that is OQ for
  the orchestrator (§10 OQ3-adjacent), NOT a W2-5-authored rule.
2.4 Lifecycle/signature gate: NO new data needed — the EXISTING
  document-controlled-signing.lifecycle.yaml guards (§0.4) + the create-side rule below are the
  rule set. New handler code `PROMOTION_CONTROLLED_ESCALATION` (§3.3) refuses any promoted payload
  that tries to be born non-draft while declaring lifecycleId.

## 3. FILE-BY-FILE CHANGE PLAN (existing routes extended, enumerated)

3.1 config/types.ts — DEFAULT_CONFIG.server.appendOnlyKinds (:474):
    `['audit-event','signature']` -> `['audit-event','signature','vendor-protocol-candidate']`.
    One data line in the config default (the knob is documented DATA at :338-341); rides the
    EXISTING route-level walls at RecordHandlers.ts:728-738 (PUT) / :1178-1188 (DELETE) -> 405
    APPEND_ONLY. No TS kind-branching added (the wall reads the list).
3.2 server/src/store/RecordStoreImpl.ts — generic append-only backstop:
    RecordStoreConfig (createRecordStore(config?!) :911-918) gains
    `appendOnlyKinds?: string[]`; update (:656) and delete (:819-821) check
    `[...hardcoded-governance-triple, ...config.appendOnlyKinds ?? []]` — generic evaluator, no
    domain kind appears in the TS beyond what is ALREADY hardcoded there; server.ts wiring passes
    the SAME appConfig list already exposed at server.ts:721. This closes the store-level hole
    where any service bypassing the API (e.g. a future W2-6 pass) could mutate a candidate.
    exactOptionalPropertyTypes: pass `...(cfg.appendOnlyKinds ? {appendOnlyKinds: cfg.appendOnlyKinds} : {})`.
3.3 server/src/extract/CandidatePromoter.ts + server/src/api/handlers/ExtractHandlers.ts —
    promotion canonicalization + honest errors (BOTH the promote and reject halves):
  a) Canonicalize in promoteCandidate() (CandidatePromoter.ts:143-149): after the spread, force
     `state: 'draft'` and DELETE any incoming `state`/`version` spoof from candidate.draft when
     target_kind==='protocol'; if the draft declared lifecycleId AND a non-draft state, return
     `{ok:false, reason:'PROMOTION_CONTROLLED_ESCALATION', ...}` (mirrors the create-path rule
     RecordHandlers.ts:471-478 — cite the pattern in a code comment, PROTO-AI-5 discipline).
     A declared lifecycleId survives (the promoted controlled protocol enters the lifecycle AT
     draft state — ACTIVE later, signed, per §0.4).
  b) ExtractHandlers.promoteCandidate error surfacing: store.create failure at :267-270 today
     answers 500 'STORE_ERROR' swallowing result.lint/result.validation. Change: when
     createResult carries lint/validation findings, answer 422 `{error:'PROMOTION_LINT_BLOCKED',
     message, details:{lint_findings:[{rule_id,severity,message,paths}...]}}` — the actionable
     machine-readable body the acceptance clause demands ("refused with an actionable lint
     error"). Same for the rejectCandidate path's store failure (:388-391) — 5xx only for
     transport errors, 422+findings for rule rejections.
  c) Audit the promotion itself: after both creates succeed, `security/auditService.append({
     actor, action:'candidate_promoted', subjectType:'extraction-draft', subjectId:id,
     data:{candidate_path, output_record_id, promotion_record_id} })` — same best-effort service
     (AuditEventService.ts:12-13 comment: never fails the business op); constructor gains an
     optional auditService param threaded from server.ts's instance (server.ts:703, passed into
     createExtractHandlers at its call site — locate at claim: `grep -n createExtractHandlers
     server/src/server.ts`). Action names obey audit-event.schema.yaml:36 (`^[a-z][a-z0-9_]*$`).
3.4 server/src/api/handlers/RecordHandlers.ts — MEANT review edits (updateRecord):
  a) NEW gate `extractionDraftWriteGate(previous, proposed)`, placed EXACTLY like
     protocolStepWriteGate (after the controlled lock :855-857, BEFORE the store write; mirror
     :858-868 and cite the pattern in comments). Codes:
     - XDR_SOURCE_LOCKED (409): source_artifact object changed at all.
     - XDR_CANDIDATE_STATUS_REGRESSION (409): a candidate status moves promoted/rejected -> absent
       or back to the other terminal value.
     - XDR_CANDIDATE_LOCKED (409): the draft body of a candidate with status promoted/rejected
       drifted (deep-equal the candidate object minus `status`).
     All three compare previous-vs-proposed payload shape only — no domain literals.
  b) REVISION + AUDIT on ordinary review edits (the acceptance clause "audit trail shows MEANT
     revisions without candidate content drift"): after a SUCCESSFUL update whose kind is in a new
     config-data list `server.revisionOnEditKinds` (config/types.ts knob beside appendOnlyKinds
     (:341); DEFAULT_CONFIG value `['extraction-draft']`), call
     `new RecordRevisionService(store).capture(preUpdateEnvelope, actor, 'derivation')` THEN
     `auditService.append({actor, action:'record_revised', subjectType:kind, subjectId:id,
     data:{previous_sha:token(previous), new_sha:token(result.envelope), revision_ref:
     revisionRef(rev.recordId)}})`. 'derivation' is the CURRENT enum (record-revision.schema.yaml:
     :17) — if the orchestrator ratifies OQ2's 'edit' widening, flip the literal (one token, both
     sites: schema enum + RecordRevisionService.ts:9 union). Rationale for capture-of-PREVIOUS:
     each edit preserves the superseded snapshot (freezeProtocol idempotence pattern,
     RecordRevisionService.ts:93-94). Candidate (SAID) content is NEVER in scope of this path —
     the XDR payload carries the MEANT drafts; the proof test asserts the VPC hash invariant (§6 T4).
  c) expectedToken story: NONE added — edits ride the existing `expectedSha` body field through
     store.update (RecordHandlers.ts:697, :925). No new header, no new field.
  d) Regulated ACTIVE leg: NO new route. ACTIVE = lifecycle transition on the promoted protocol
     via PUT /records/:PRT with state change + signatureRefs, enforced TODAY (§0.4). W2-5 adds a
     TEST (§6 T3), not code. If the proof test exposes a transition gap (e.g. promoted protocols
     lacking the roleAssignments the guards need), that gap is reported, not silently widened.
3.5 CANDIDATE WRITE-PROTECTION MATRIX (every mutation path x current wall x new wall):
| path | file:line | current wall vs vendor-protocol-candidate | new wall |
| PUT /records/:id | routes.ts:233 -> RecordHandlers.ts:728-738 | NONE for this kind | appendOnlyKinds data (§3.1) -> 405 APPEND_ONLY |
| DELETE /records/:id | routes.ts:236 -> :1178-1188 | NONE | same data -> 405 |
| store.update backstop | RecordStoreImpl.ts:656 | governance triple only, hard-coded | config-injected list (§3.2) |
| store.delete backstop | RecordStoreImpl.ts:819-821 | governance triple only | config-injected list (§3.2) |
| protocol-steps routes | protocol-steps.ts:302..837 | kind!=='protocol' guard (structurally unreachable) | unchanged; TEST proves refusal persists |
| POST /records/:id/draft-copy | RecordHandlers.ts:233 | kind whitelist excludes candidate | unchanged; TEST proves |
| POST /records/:id/accept-graph | routes.ts:226 | graph-scoped | n/a |
| POST /records (create candidate) | routes.ts:230 | allowed — extraction is the sole VENDOR minter (W2-4 transition_policy:354-356) | unchanged by design |
| promote/reject endpoints | routes.ts:632-633 | only touch XDR, never the candidate | unchanged; TEST asserts candidate sha invariant |
| MEANT edit path | PUT /records/:XDR | none | §3.4 gate + revision + audit (this is the ALLOWED edit surface) |

3.6 schema/workflow/extraction-draft.ui.yaml — additive review hints ONLY if the triplet's ui file
    lacks status/confidence columns (open at claim; small).

## 4. WHY "CANDIDATE NOT STORED TODAY" DOES NOT WEAKEN THE DELIVERABLE
The schema triplet exists and SchemaRegistry registration makes POST /records able to mint the
kind (store validates against envelope.schemaId); the acceptance test mints a VPC record that way.
Whether any current flow persists candidates is irrelevant to the wall — W2-6 WILL persist the
full candidate ("full vendor-protocol-candidate" is its input contract), and the wall must be in
place BEFORE that item lands. State precisely, in the report: "no store write of kind vendor-
protocol-candidate exists at claim trunk (grep evidence: VendorSearchHandlers.ts:748,834,1093 are
inline summaries inside vendor-pdf payloads; ProtocolBuilderHandlers.ts:59,289,375,517,586 are AI
output shapes) — the wall is therefore forward-binding + acceptance-test-bearing, not a
regression-closing fix."

## 5. OQ1 SEAM OWNERSHIP (W2-4 §9 OQ1 disposition (a), orch-ACCEPTED — LANDS WITH THIS DISPATCH)

Owner: W2-5. The exact widening (W2-4 draft .hermes/plans/2026-10-09_1520-...-l2t1451.md:883-885:
"promotion note widens W2-3's StepProvenanceRef type const to enum
[vendor-protocol-candidate, evidence] (one schema line + W2-3's fixture leg re-run)"):
- FILE: schema/workflow/protocol.schema.yaml, `$defs/StepProvenanceRef` (W2-3 shape per W2-3 spec
  .hermes/plans/2026-10-09_1305-W2-3-protocol-semantic-upgrade-spec.md:245-252: allOf [ $ref
  ./datatypes/ref.schema.yaml constrained { kind const record, TYPE CONST vendor-protocol-
  candidate }, optional anchor fields ]). THE EDIT: inside that allOf constraint,
  `type: { const: "vendor-protocol-candidate" }` ->
  `type: { enum: ["vendor-protocol-candidate", "evidence"] }`. ONE LINE. Nothing else on protocol.*
  changes (the root stays closed; no rung field ever appears — §8 bait 1).
  CONFIRM AGAINST MERGED TRUNK: W2-3 coder is live; if its merged $defs differs (naming, ref
  composition), locate the constrained-type site by GREP (`grep -n "vendor-protocol-candidate"
  schema/workflow/protocol.schema.yaml`) and apply the same enum widening; if the merged shape has
  no such site, STOP-and-report — do not improvise a slot.
- PROTECTED RE-RUNS (all must stay green; a red here means the widening broke an admission arm):
  `npx vitest run src/schema/Wave2ProtocolIntentSchema.test.ts` (W2-3's fixture leg, its spec
  §4 step 3, :463-464), `npx vitest run src/lint/Wave2ProtocolIntentRules.test.ts`,
  `npx vitest run src/lint/ProtocolLintRules.test.ts` (R1-R3 untouched),
  `npx vitest run src/lint/Wave2ProvenanceLadderRules.test.ts` (W2-4's DERIVED-arm rules must
  still pin candidate refs — the enum widening must NOT loosen W2-4's prov-derived-* lint: refs
  pointing at evidence satisfy the SCHEMA now; only W2-4's LINT decides which lineage shape is
  legal per rung. If W2-4 merged a prov-derived rule keyed on ref.type==vendor-protocol-candidate
  it stays correct; if it keyed on schema-only guarantees, that is a claim-time STOP for the
  orchestrator, §10 OQ2-adjacent),
  `npx vitest run src/schema src/lint` fail-file SET vs §0.7 pin,
  `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts` green UNTOUCHED.
- Plus ONE new negative+positive fixture leg in W2-5's own schema test (§6 T6): an intent-step
  provenance ref with type: evidence PASSES schema; type: material-spec still REJECTS (closed
  enum, not a free string).

## 6. RED-FIRST TEST PLAN (write the failing tests FIRST, one suite per bullet, all headless)

Harnesses to COPY (exact existing suites — do not invent harnesses):
- T1 promote-path API tests — COPY server/src/integration/extractionE2E.test.ts (real
  initializeApp/createServer + in-memory store, mocked ExtractorAdapter; its routes wiring at :305
  mirrors production routes.ts:632): add XDR fixture whose candidates[0].draft is a full W2-3
  intent-step protocol payload (import the merged W2-3 fixture payload; confirm at merge);
  RED arms: (a) promote blocked by unresolved required constraint -> 422 PROMOTION_LINT_BLOCKED
  with rule_id(s) visible in body (needs a merged W2-3/W2-4 firing rule — §2.3); (b) candidate
  with ambiguity_spans -> 400 reason names xdr-promote-blocked-by-unresolved twin code; (c) happy
  promote -> output kind protocol, XPR record created, audit-event action candidate_promoted
  exists (governanceStrictness.test.ts:301-321 predicate style); (d) promote of a draft declaring
  `state: effective` + lifecycleId -> PROMOTION_CONTROLLED_ESCALATION, nothing persisted (assert
  zero new records).
- T2 required-constraint data-gate — COPY server/src/lint/ProtocolLintRules.test.ts (fixture
  lint-firing harness) to prove the specific merged rule(s) fire on the promoted payload, and
  T1(a) proves store.create blocks promotion (§0.5).
- T3 regulated lifecycle leg — COPY server/src/revisions/RevisionRoutes.test.ts (direct handlers +
  memoryStore from server/src/revisions/testStore.ts) + the signature flow of
  server/src/api/handlers/SignatureHandlers.test.ts: promote with lifecycleId -> protocol born
  draft (assert); attempt state->effective via PUT without signature -> refused
  (LIFECYCLE_TRANSITION_DENIED / guard fail-closed, LifecycleEngine.ts:131-137; governanceStrictness
  proves the denial shape); mint signature (POST /signatures contract, SignatureHandlers.ts) for
  action 'approved' on the CURRENT saved revision (content-hash freshness, RecordHandlers.ts:
  :801-804) with role assignments -> transition succeeds; assert audit-event
  action lifecycle_transition exists with signatureRefs (RecordHandlers.ts:982-993).
- T4 candidate immutability matrix — COPY RevisionRoutes.test.ts handler-direct style + supertest
  where routes are needed (protocol-steps.test.ts precedent, PROTO-AI-5): every §3.5 row gets a
  test: mint VPC record -> PUT /records/:id -> 405 APPEND_ONLY; DELETE -> 405; draft-copy -> 422
  DRAFT_COPY_UNSUPPORTED; protocol-steps PATCH -> NOT_A_PROTOCOL; store-level bypass -> update/
  delete fail (append-only from config list); and the invariant arm: run full promote flow -> sha
  of the VPC record byte-identical before/after ("without candidate content drift", literal
  assertion).
- T5 MEANT edit revisions+audit — same harness as T4: PUT /records/:XDR changing
  candidates[0].draft with expectedSha -> 200; GET /records/:XDR/revisions contains a record-
  revision whose snapshot == previous payload (purpose 'derivation' or 'edit' per OQ2); audit-event
  action record_revised exists with previous_sha/new_sha/revision_ref; stale expectedSha -> 409 and
  NOTHING persisted (no revision, no audit event); gate arms XDR_SOURCE_LOCKED /
  XDR_CANDIDATE_STATUS_REGRESSION / XDR_CANDIDATE_LOCKED each refuse persisting nothing;
  appendOnlyKinds does NOT block XDR edits (different kind).
- T6 schema leg for the OQ1 seam — COPY server/src/schema/Wave2ProtocolIntentSchema.test.ts
  pattern; arms per §5.
- T7 lint-data activation proof — COPY server/src/lint/Wave2ConstraintVocabularyRules.test.ts
  (registry-vocab + bound-lint firing harness): xdr-*/xpr-* rules fire with rule ids + instance
  paths; boot test green (non-empty spec now loads; server.ts:411 skip no longer applies);
  extractionCompileYaml.test.ts + PipelineLoader.test.ts UNTOUCHED green (pipeline YAMLs unedited).

VERIFICATION COMMANDS (exact):
- FIRST TARGETED CHECK (proves the approach early, before writing everything):
  `cd <wt>/server && npx vitest run src/integration/extractionE2E.test.ts
  src/api/handlers/ExtractHandlers.test.ts src/compiler/pipeline/extractionCompileYaml.test.ts`
  -> expect ALL GREEN at claim base (the harnesses W2-5 rides work today); then write T1 RED
  against the same harness — the first red that names PROMOTION_LINT_BLOCKED is the approach
  proving itself.
- Full gates: `npx vitest run src/schema src/lint src/integration src/api/handlers src/store
  src/revisions src/governance` -> fail-file SET within src/schema+src/lint == {EventGraphEquipment
  Schema, LabwarePhysicalGeometryData} (5 tests, §0.7); every other named dir ZERO failed.
  `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts` green.
- `npm run typecheck -w server` -> 26 err-lines, per-file+message MULTISET == pin.
- `git -c core.fileMode=false diff --stat -- server/src/compiler/scientistIntent/goldens/ schema/
  scientist-intent/` -> EMPTY (MANIFEST vocab sha 014ca71f...d12c byte-untouched, §0.7).
- Hard-stop greps (expect ZERO in non-test server/src):
  `grep -rn "VENDOR\|DERIVED\|INFERRED_INVARIANT\|LOCAL_REALIZATION" server/src --include='*.ts' |
  grep -v test` ;
  `grep -rn "semantic-protocol-family\|semantic-extraction-ir\|provenance-ladder\|provenance-rung\
  \|realization-plan\|'said'\|'meant'" server/src schema/workflow/extraction-*.yaml | grep -v test`
  (forbidden_kinds wall);
  `grep -n "undefined" server/src/api/handlers/RecordHandlers.ts | grep -E "state:|version:|purpose:"`
  -> no exactOptionalPropertyTypes violations in W2-5's own diff hunks.
- YAML reload trap: tsx --watch does NOT reload YAML — any MANUAL probe needs a stack restart
  (`cl-lane-stack.sh 2 restart` with background=true, blocking-run pitfall recorded in the lane
  list); headless tests boot their own app and are unaffected.

## 7. WORKER CONTRACT

- Branch: `W2-5-lane2-l2t<token>` off the lane trunk `cl/integration-2` TIP AT DISPATCH (post
  W2-3/W2-4 merges — deps are hard gates, spec promotion is the queue signal, queue dispatch is
  NOT a dep gate).
- Worktree: `<integration>/wt/W2-5-lane2-l2t<token>` (coder creates it).
- Unique deliverable: report at TRUNK checkout
  `.hermes/plans/W2-5-report.wip-l2t<token>.md` (the W2-2 lesson: the report lives in the trunk
  .hermes, not the worktree); final log line `W25 DONE <sha>`.
- Owned files ONLY (§3). Every citation in the report is an opened file:line. git always
  `-c core.fileMode=false`. Headless only — no :3093/:5193/:3001/:5174/:5193, no browser.

## 8. REVIEWER BAIT (what the adversarial cycle will hunt; pre-empt all of it)

1. RUNG-NAME LEAK: rung strings must appear NOWHERE in W2-5 TS/fixture literals except as data
   inside protocol fixtures legitimately carrying W2-4 refs — the grep (§6) is the bait; the
   defense: W2-5 writes lifecycle plumbing over refs and statuses, never touches rung vocabulary
   (W2-4 qms_note, draft :366-369: e-sign lives HERE, the ladder carries nothing).
2. exactOptionalPropertyTypes sites: audit `data` spread, revision payload (RecordRevisionService
   .ts:69-75 model: `...(x ? {x} : {})`), config threading (§3.2), ExtractHandlers constructor
   param `auditService?` — never `foo: undefined`.
3. YAML-RELOAD + BOOT TRAPS: extraction-draft.lint.yaml goes 0-rule (skipped, server.ts:411) to
   LIVE — boot must stay green; LintEngine.ts:59-61 GLOBAL duplicate-id throw: new ids xdr-*, plus
   new xpr-* must not collide with merged W2-2 (constraint-vocab-*), W2-3 (step-intent-*/legacy-),
   W2-4 (prov-*) — read ALL merged *.lint.yaml ids before minting (W2-4 §8.12 lesson).
4. ONTOLOGY TERMS: constraint class ids, action names (`candidate_promoted`, `record_revised` —
   snake regex audit-event.schema.yaml:36), no new prefixes, no new CURIEs, target_kind list is a
   lint DATA value not a TS map (§2.1; the existing TS map at PromotionExtractionPasses.ts:73-78
   stays until a named follow-up removes it — F-W25-2).
5. HARDCODE BOUNDARY: appendOnlyKinds/revisionOnEditKinds are CONFIG DATA with documented knobs
   (config/types.ts:338-341); the store backstop evaluates the list generically; the ONLY
   remaining hardcoded kind list W2-5 touches is the one RecordStoreImpl already hardcodes for the
   governance triple (§3.2) — cite, don't expand it.
6. TWO-PROMOTE-PATH CONFUSION: the E2E green you must keep is routes.ts:632 (ExtractHandlers);
   do NOT "fix" PromotionCompileRunner/SchemaValidateDraftPass (F-W25-1) — reviewer reject if you
   touch them; do NOT route W2-5 tests through routes.ts:874.
7. LINT-ERR-BLOCKING IS REAL, NOT ASSUMED: §0.5 cites the create-path rejection; T1(a)+T2 prove it
   end-to-end — a reviewer who doubts gets pointed at RecordStoreImpl.ts:492-504 + the tests.
8. STATE-SPOOF ON PROMOTION is THE security finding of this spec (CandidatePromoter.ts:145 spread
   + no create-side controlled guard while update has one at RecordStoreImpl.ts:660) — §3.3(a)
   closes it, T1(d) proves it; report must name the hole honestly.
9. IDEMPOTENCE: capture() is content-addressed (RecordRevisionService.ts:65-67) — a no-op PUT must
   not mint a duplicate revision; test arm in T5 (same sha in == out -> assert previous revision not
   re-minted... previous-snapshot semantics: identical-content PUT produces identical REV id and
   capture returns the existing one; assert exactly one).
10. 405-vs-409: append-only answers 405 APPEND_ONLY (existing shape, RecordHandlers.ts:733-736) —
    do not invent a new code for the candidate wall; the wall is the SAME wall, widened by data.
11. THE UI FILE: don't skip extraction-draft.ui.yaml silently if §3.6 triggers; don't author app
    code.
12. `rules: []` file edit must KEEP `lintVersion: 1` + exact `schemaId` (:1-2) — a typo'd schemaId
    silently never binds (engine filters by schemaId, LintEngine.ts:103-105 per W2-4 §9 OQ3).

## 9. FINDINGS DECLARED (not repaired here; orchestrator disposition)

F-W25-1: second promote path integrity — SchemaValidateDraftPass.ts:9-11/:44-47 declared-stub +
PromotionCompileRunner.ts:146-147 canonical==audit aliasing behind routes.ts:874. Candidate for
its own item or a W2-6 precondition (W2-6 must NOT use it; W2-6 uses W2-5's promoted surface).
F-W25-2: TARGET_KIND_TO_SCHEMA hardcoded map (PromotionExtractionPasses.ts:73-78) violates the
data principle; §2.1 lint data now twins it; deletion of the map needs the pass re-read pipeline
data — named follow-up, out of W2-5 diff.
F-W25-3: lifecycle-bypass detector exists (RecordStoreImpl.ts:664-668 previousPayload /
lifecycleBypassAudit hook; server/src/lifecycle/BypassAudit.ts) — W2-5's §3.3(a) closes the
create-side hole structurally instead of only detecting it; mention in report, no code.

## 10. ACCEPTANCE CRITERIA (VERBATIM from the task block `verified by:`)

  Headless tests: promotion of an unresolved-constraint draft is refused with an actionable
  lint error; an attempted candidate mutation is refused server-side; regulated ACTIVE
  promotion without required signature refused, with signature succeeds; audit trail
  shows MEANT revisions without candidate content drift; promoted output is a kind
  'protocol' record — no new kind appears.

Clause -> proof map: unresolved-constraint = T1(a)+T2; candidate mutation refused = T4 (every §3.5
row); regulated ACTIVE refused-with / succeeds-with signature = T3; audit-trail/MEANT-revisions/
no-candidate-drift = T5 + T4's sha-invariant arm; output kind protocol / no new kind = T1(c) +
§6 forbidden-kinds greps + Wave2NamingCrosswalk.test.ts untouched.

## 11. Open questions for orchestrator (composer could not resolve locally)

OQ1 — revisionOnEditKinds knob: the MEANT-edit audit+revision hook lands in
RecordHandlers.updateRecord keyed by a NEW config-data list (default ['extraction-draft']),
mirroring the documented appendOnlyKinds pattern (config/types.ts:338-341, wired server.ts:721).
Alternative: hardcode to the extraction-draft flow in the promote handler only (narrower but
leaves direct PUT /records/:XDR edits unaudited — the acceptance clause needs the PUT path).
Checked: AuditEventService.ts (full), RecordHandlers.ts:977-995 emission precedent, no existing
edit-hook config. RECOMMENDATION: the config knob.
OQ2 — purpose enum widening 'edit' vs reuse 'derivation': record-revision.schema.yaml:17 enum is
[signature, research-use, derivation]; RecordRevisionService.ts:9 union matches. 'edit' is a
2-line data widening (schema enum + union) and breaks NO existing filter (freezeProtocol filters
'research-use' :91; pinInheritance signs 'derivation' :119; draftCopy uses 'derivation' :235 —
verified). Reusing 'derivation' keeps the enum but conflates promotion-derivation snapshots with
review-edit snapshots in list/audit reads. RECOMMENDATION: add 'edit'. The spec is written so
either decision is a one-token flip (§3.4b, §5).
OQ3 — signature-enforcement gap sizing: the engine+route enforcement is REAL today
(LifecycleEngine.ts:131-137 fail-closed; RecordHandlers.ts:795-815 stale/signer/content checks;
document-controlled-signing guards :44-63; tested via governanceStrictness.test.ts:301-321) — the
orientation's "inventory before promising" caution resolves favorably. The REAL gap is create-side
state escalation (§8 bait 8) + the untested-for-protocol-records lifecycle leg; W2-5 sizes it as
§3.3(a) code + T3 test. If T3 exposes role-assignment plumbing gaps for promoted protocols
(roleAssignments absent on a freshly promoted record), that is an INCREASED scope signal — report
it at cycle-1 rather than widening guards.

COMPOSED 2026-10-09 ~17:20 EDT by cl-spec-composer (l2t1651). All §0 cites first-hand at trunk
33ab8e9b/796cfc0f; cl-scout screening used for breadth only and corrected where wrong (§0.3
lifecycle dir path, §4 candidate-persistence claim). W2-3/W2-4 bindings marked
confirm-against-merged-trunk; nothing here assumes their unmerged file contents.

---
## PROMOTION RECORD (orchestrator l2t2310, 2026-10-09 ~23:15 EDT)

PROMOTED to canonical. Pre-review CAMT items cleared FIRST-HAND against merged trunk
7d301c1f/78bee2c8:
- extraction-draft.lint.yaml rules: [] (:3) + boot-skip server.ts:410-411 CONFIRMED.
- record-revision purpose enum = [signature, research-use, derivation] (no edit) CONFIRMED.
- W2-3 merged  site EXISTS: protocol.schema.yaml :1029 (allOf-constrained) + :1032
  (properties) both type: { const: vendor-protocol-candidate } — the ONE-LINE enum widening
  in §5 applies; apply at BOTH sites (allOf constraint AND properties block) or the root
  stays narrower than the guard — coder: the draft names one site; merged shape has the
  pattern twice inside the same $defs/Provenance-style block; widen consistently.
- constraint-vocabulary requiredClasses :242 / applicability :271 line hits CONFIRMED —
  PATH CORRECTION for the coder: the file is
  schema/registry/constraint-vocabulary/constraint-vocabulary.yaml (NOT schema/workflow/).
- Wave2ProvenanceLadderRules.test.ts + extractionE2E.test.ts exist; xdr-* id namespace
  collision-free (existing: xpr-* x5, prov-*, step-intent-*, legacy-*, constraint-vocab-*).
- appendOnlyKinds knob config/types.ts:341 + DEFAULT_CONFIG :474; store hardcoded triple
  RecordStoreImpl.ts:656-658 CONFIRMED.
OQ RULINGS (unchanged from l2t1855): OQ1 = config knob revisionOnEditKinds; OQ2 = ADD
purpose edit (schema enum + RecordRevisionService union); OQ3 = accept, T3 gap-report rule.
ACCEPTANCE: headless (§10 verbatim) — NO browser gate.
