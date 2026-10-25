# ARCHITECT DECISION — INSTR-COLLAPSE-1 D1: live Gemini active-read flow fails the declared gate closed

Item: INSTR-COLLAPSE-1 (lane 1), cycle-2 blocker D1. Date: 2026-10-22.
Request: .hermes/plans/2026-10-22_instr-collapse-d1-liveflow-gate-decision-request.md
Prior rulings held: ORCH cycle-1 retype ruling; OQ-1 decision
(.hermes/plans/2026-10-22_instr-collapse-oq1-capability-gate-decision.md).
Review read: /home/brad/.hermes/cl/lanes/1/advreview-instrcollapse1-l1t1330.md (§3 PROBE 2, D1, O1-O3).
Fix report read: /home/brad/.hermes/cl/lanes/1/instr-collapse-1-fix1-report-l1t1130.md.
Code inspected first-hand (read-only, tmp nothing touched): worktree
/mnt/vast/home/brad/git/wt/instr-collapse-1-lane1-l1t0755 @ 816060c1.

====================================================================
1. RULING SUMMARY (one line each, detail below)
====================================================================
- D1 is WORKING-AS-DESIGNED: the 400 capability_gate_verb_unresolvable on the Gemini
  appliance path is the honest, OQ-1-mandated outcome, not a defect to code around.
  OQ-1's fail-closed semantics are NOT amended. No amendment of any kind is made or
  needed — the gate behavior that PROBE 2 observed is exactly the behavior OQ-1
  specified and that the item's own contract test pins.
- Mandate #1 ("interim-broken live flow unacceptable") is hereby overridden BY THIS
  RULING for the Gemini appliance execute paths ONLY, and only in this precise sense:
  trunk ships an honest structured refusal, never a fake success and never a schema
  violation. The mandate's core purpose — "trunk must never ship a flow violating its
  own declared schemas" — is MET (reviewer §1/§2: zero residual violations).
- The real product gap — the appliance execution not carrying its read-event chain —
  is promoted to a NAMED FOLLOW-UP ITEM (INSTR-READCHAIN-1, §4), which closes the
  flow with real data instead of weakening the gate.
- Run 2 of the fix must (a) PIN the blessed behavior with real-schema live-flow tests
  (§3), converting D1 from "untested broken flow" to "designed, tested contract", and
  (b) carry D2's report qualification.
- O1 canonical id: EQP-PLATE-READER (§5). No code change in run 2; COLLAPSE-2 executes.

====================================================================
2. WHY NOT A / B / D (grounded, not preference)
====================================================================
(A) REJECTED FOR THIS RUN — the chain data genuinely does not exist on the chatbot
path, and minting it is new product behavior. Verified first-hand:
  - server/src/ai/runChatbotCompile.ts registers ~31 passes (createEmitInstrument-
    RunFilesPass, createEmitInstrumentApplianceJobsPass :378-379, readiness,
    downstream queue); NO events-emit pass. The only event-graph producers in the
    compiler are EventsEmitPass.ts and PlannedRunEventsEmitPass.ts, both wired into
    runRunPlanCompile.ts (:162-191), a different pipeline from chatbot compile.
  - So a chatbot-compiled run-file has no event graph and no read event to point at.
    Minting one at compile or execute time raises real product questions — WHICH read
    event does this execution belong to; does execution append to the run's graph;
    what is the semanticKey/ordinal discipline — none of which this item's mandate
    authorizes. The packet itself said: if none exists, minting one is NEW product
    behavior — it is, therefore it is a follow-up item, not a fix-run task.
(B) REJECTED ON PRINCIPLE — scoping the appliance measurement host out of the gate, or
  giving the annotation an "absent chain = pass" branch, is exactly the silent-pass
  theater OQ-1 rejected by design ("a silent pass would make the gate theater"). The
  measurement is the evidence-producing write; an ungated measurement write path is
  the checkInstrumentCapabilities failure shape (warn-only, hardcoded policy) the
  whole C2 design exists to replace. B would also leave the flow writing measurements
  whose provenance the system cannot justify — a fabricated-context problem, which
  the project hard-stop ("never fabricate") forbids more squarely than a 400 does.
(D) REJECTED — sequencing is not the defect. The pin (schema floor) and the gate
  (declared capability) are both behaving as declared; the flow lacks context data,
  not ordering. One real sequencing insight DID surface during grounding (live mode
  fires the sidecar BEFORE the ingest gate rejects, so a real plate read could
  execute and then be unrecordable — orphan rawData in records/inbox). It is
  folded into INSTR-READCHAIN-1 as a required design point (§4d), not this run:
  moving the gate pre-check before sidecar dispatch is a behavior change to the
  execution path and belongs with the chain design that determines what passes it.

====================================================================
3. WHAT FIX RUN 2 MUST DO (exact files + shape; coder needs no further decisions)
====================================================================
3a. NEW FILE server/src/measurement/MeasurementActiveControlService.liveGate.test.ts
    (new file deliberately — MeasurementActiveControlService.test.ts is already-red
    from the pre-existing pinned-counter drift; do not add pins to an already-red file).
    Harness: copy the proven pattern from
    server/src/measurement/MeasurementService.capabilityGate.test.ts — tmp-dir store,
    REAL loader with schemaDir '../schema' (the REAL measurement.schema.yaml carrying
    x-capability-gate), seeded EQP-PLATE-READER (with equipmentClassRef
    CL:plate_reader), ECP-PLATE-READER, verb-definition seed with
    canonical 'read'. Build the job with the real createGeminiEmActiveReadJob.
    Use a tmp outputPath and parameters.simulate:true so no repo records/inbox write
    and no sidecar/network.
    Two tests:
      T1 DESIGNED-REFUSAL PIN (reviewer's PROBE 2, promoted to a committed test on the
        REAL schema): performActiveRead(producer job.request) -> rejects with
        MeasurementServiceError code 'capability_gate_verb_unresolvable', statusCode
        400; store contains NO measurement record afterwards. Assert error CODE, never
        record ids (drift-immune, same discipline as the fix-1 suites).
      T2 DOOR-OPEN PIN (proves the gate is an honest door, not a permanent block, and
        that no server schema change is needed to carry the chain): the same
        performActiveRead call with the request additionally carrying
        eventGraphRef {kind:'record', id:<seeded EG>, type:'event-graph'} and
        readEventRef <eventId of a seeded event whose semanticKeyComponents.verb is
        'read'> -> succeeds; the persisted measurement carries that readEventRef.
        This is the executable proof for §4's claim that READCHAIN is plumbing, not
        contract surgery.
    These tests close the reviewer's standing complaint "no test on the REAL schema
    covers this path today" (advreview §3). They pass at HEAD as written; they are
    behavior pins for a ruling, not RED-first fixes — say so in the report.
    Do NOT weaken any fail-FILE pin, do NOT touch DeclaredCapabilityGate.ts,
    measurement.schema.yaml, or the gemini sidecar schemas.

3b. D2 RIDES THIS RUN (as the packet states): qualify
    /home/brad/.hermes/cl/lanes/1/instr-collapse-1-fix1-report-l1t1130.md §1 — the
    "SUCCEEDS (success: true)" claim is true only in the reduced-schema harness
    (MeasurementHandlers.applianceJob.test.ts loads a synthetic measurement schema
    with no x-capability-gate); against the real schema the same flow 400s by design
    (§3a T1 now pins that). Record the real-schema outcome explicitly. Same defect
    class as cycle-1 defect 3 — report honesty, not code.

3c. DO NOT TOUCH app/ in run 2. ReadPlateModal.tsx is COLLAPSE-2's surface (C4 owns
    the file); its id-retarget and chain-attach are §4/§5 work items. No server
    production file changes in run 2 at all — 3a/3b only. The full-suite failing-FILE
    delta accounting continues against the baseline2 pin.

====================================================================
4. FOLLOW-UP ITEM TO FILE (orchestrator: enqueue after COLLAPSE-1 merges)
====================================================================
INSTR-READCHAIN-1 (proposed name) — "Gemini appliance executions carry their
read-event chain":
  a. Server-side carries NO contract change (verified first-hand):
     MeasurementHandlers.ts:31-46 ActiveReadRequestBody already declares
     eventGraphRef/readEventRef/measurementContextRef;
     MeasurementActiveControlService.ts:239-249 already spreads them onto
     measurements.ingest; validateGeminiApplianceJob does not reject them; and the
     sidecar contract check validates only the internally-built 4-field subset, so
     gemini-active-read-request.schema.yaml's additionalProperties:false is never
     violated. ReadPlateModal.tsx:248 already attaches an extra field
     (measurementContextRef) through this exact channel today — the channel is
     proven. §3a T2 pins the end-to-end behavior.
  b. Chatbot/AI-panel path (app/src/shared/hooks/useAiChat.ts
     :788-850 executeInstrumentApplianceJob; the run-workspace already knows the
     graph — RunWorkspacePage.tsx:50 puts workspace.eventGraph.recordId into
     aiContext): when the run's event graph contains exactly one applicable read
     event for the job, attach eventGraphRef+readEventRef executor-side.
  c. Ambiguous/no-graph case: minting the read event on the run's graph at execution
     time (execution-time event emission is the ledger-correct place — the read
     physically happened) is the design decision this item must scope explicitly.
     Keep it data-driven; no verb literals (H1/H2 stand).
  d. Fail-fast pre-flight: reject BEFORE dispatching the sidecar when the request
     will inevitably fail the declared gate (live hardware must not fire for a
     measurement that cannot be recorded; no orphan rawData). Reviewer-side
     sequencing insight from this ruling's grounding.
  e. While in the producer file: delete the unreachable EQP-{slug} fallback branch
     (observation O2 — dead code, sole caller guards on isGeminiEmInstrument).
  O3 stands as ruled (producer constant naming a seed record is fine; H1 governs
  the gate, not the producer).

====================================================================
5. O1 RULING — canonical Gemini equipment id
====================================================================
Canonical: EQP-PLATE-READER — record type 'equipment', kind 'record', label 'Gemini
EM' permitted on the ref. It is the ONLY of the three ids backed by corpus data
(verified: grep -rn EQP-GEMINI-EM records/ -> ZERO files — EQP-GEMINI-EM is a
phantom id with no record; EQP-PLATE-READER is the seed-declared record whose
capability ECP-PLATE-READER binds VERB-READ via class CL:plate_reader).
Convention stated generally for the fleet: equipment refs name seed-declared
equipment record ids; path-style ids (instrument/<slug>) are retired; no id may be
emitted that no record declares.
Retirement: instrument/gemini-em and EQP-GEMINI-EM are both retired. COLLAPSE-2
(C4, which owns app/src/event-editor/rail/ReadPlateModal.tsx) retargets BOTH
instrumentRef() (:55-57) and equipmentRef() (:60-63) to EQP-PLATE-READER — this
also removes the reviewer's "retired id still present" finding (O1), which fix-1's
grep missed because it searched a different string.

====================================================================
6. EFFECT ON THE QUEUE
====================================================================
- D1: closed as working-as-designed under this ruling.
- The cycle-2 fix verdict executes ONLY as §3 (test pins + D2 report qualification).
- After run 2 + review: COLLAPSE-1 is merge-eligible — trunk ships zero schema
  violations, a fully-tested declared gate, and an honest structured 400 on the one
  flow awaiting INSTR-READCHAIN-1.
- Orchestrator files INSTR-READCHAIN-1 (§4) and folds the ReadPlateModal id-retarget
  (§5) into COLLAPSE-2's existing C4 remit.

No OQ-1 semantics are weakened or amended by this decision. The gate stays
fail-closed; the fix is data arriving through the door that already exists.

DECISION: C (refined — D1 closed working-as-designed with mandate #1 overridden only for the honest-400 Gemini appliance path; fix run 2 = §3 real-schema pin tests + D2 qualification only; follow-up INSTR-READCHAIN-1 per §4; canonical id EQP-PLATE-READER per §5)
