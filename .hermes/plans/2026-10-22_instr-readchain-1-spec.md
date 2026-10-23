# SPEC DRAFT — INSTR-READCHAIN-1: Gemini appliance executions carry their read-event chain

Author: cl-spec-composer (dispatch cl-l1-speccomp-readchain-l1t1910). DRAFT — pending
orchestrator review; NOT dispatchable until promoted to the canonical spec path.
Authority: architect ruling 2026-10-22 DECISION: C refined
(.hermes/plans/2026-10-22_instr-collapse-d1-liveflow-gate-decision.md) §1, §3a pins,
§4 (a)-(e), §5; task block INSTR-READCHAIN-1 (lane-1 task-list :7232-7257).
All file cites below are FIRST-HAND against lane-1 trunk content at 9efeffd6
(the two commits on top, 2d1dc9fd/a3dba0fa, touch only .hermes/plans/handoffs/*.md —
verified via `git diff --name-only 9efeffd6..HEAD`). No scout screening was used;
every cite was opened directly. Cites are anchors, not gospel — re-derive at claim
time (anchor-not-line-number rule, AS-ORCH-L1-265 precedent).

## Goal

Close the honest-400 Gemini appliance path with real data instead of weakening the
gate (ruling §1): the chatbot executor attaches the run's read-event chain
(eventGraphRef + readEventRef) to appliance-job executions when the run's event graph
has exactly one applicable read event, the declared gate is pre-checked BEFORE the
sidecar/hardware dispatch, and the producer's dead EQP-{slug} fallback branch is
deleted.

## Status of this item vs the ruling

The task block (description + stop_boundary) is verbatim from ruling §4/§5; this spec
implements, it does not re-decide. One sub-item — (c) execution-time read-event
minting — is a DESIGN DECISION explicitly NOT implemented by the coder (see §C).

## (a) PINNED NON-GOAL: NO server contract change

The server-side channel already exists end-to-end; this item changes NO schema YAML,
NO HTTP contract, NO gate semantics. Proof stack (all first-hand):

- server/src/api/handlers/MeasurementHandlers.ts:31-46 — `ActiveReadRequestBody`
  declares `eventGraphRef?` (:38), `measurementContextRef?` (:39), `readEventRef?` (:40).
- MeasurementHandlers.ts:57-89 — `validateGeminiApplianceJob` passes unknown request
  fields through (it checks only kind/adapterId/operation/parameters-is-object).
- server/src/measurement/MeasurementActiveControlService.ts:17-30 — `ActiveReadRequest`
  declares the same three fields (:23-25); :239-249 spreads them onto
  `measurements.ingest` via exactOptionalPropertyTypes-safe conditional spreads (:243-245).
- schema/lab/measurement.schema.yaml:55-59 — the x-capability-gate annotation on the
  equipmentRef slot names `resolver: read-event-verb, path: readEventRef,
  graphPath: eventGraphRef`. The chain IS the verb source; attaching it is the fix.
- server/src/capabilities/DeclaredCapabilityGate.ts:83-104 — the `read-event-verb`
  resolver: eventGraphRef -> stored event-graph -> event whose eventId === readEventRef
  -> semanticKeyComponents.verb (canonical NAME string) -> VERB-* record via the
  verb-definition store. Zero TS verb literals (H2).
- The sidecar contract check validates only the internally-built 4-field subset
  (MeasurementActiveControlService.ts:156-165), so the extra request fields can never
  violate gemini-active-read-request.schema.yaml's additionalProperties:false.
- Channel already used in production today: app/src/event-editor/rail/ReadPlateModal.tsx:247
  splices `measurementContextRef` onto `job.request` through this exact channel.
- EXECUTABLE PROOF: server/src/measurement/MeasurementActiveControlService.liveGate.test.ts
  T2 DOOR-OPEN pin (:169-194) — the same performActiveRead call carrying
  eventGraphRef {kind:'record', id, type:'event-graph'} + readEventRef of a seeded event
  with semanticKeyComponents.verb 'read' SUCCEEDS and the persisted measurement carries
  the readEventRef — zero server contract change. T1 (:148-167) pins the no-chain 400
  (`capability_gate_verb_unresolvable`, statusCode 400, no measurement persisted).

EXCEPTION, stated so nobody has to guess: adding the two OPTIONAL fields
`eventGraphRef?: unknown; readEventRef?: string` to the TS interface
`GeminiEmActiveReadRequest` in server/src/compiler/artifacts/InstrumentApplianceJob.ts:18-23
is IN scope and is NOT a contract change — it declares in types what the runtime
handler already accepts (bullet 1 above), and it lets the executor attach the chain
without a cast (ReadPlateModal's `as ApplianceJobRequest` at :247 is the cast
alternative the typed field removes for the chatbot path). No schema YAML, route, or
gate file changes.

## (b) Chatbot path: attach the chain when exactly one applicable read event exists

File: app/src/shared/hooks/useAiChat.ts — `executeInstrumentApplianceJob` at :788-873
(the apiClient call site is :838). This is the chatbot executor named by ruling §4b
(ruling cites app/src/shared/hooks/useAiChat.ts:788-850 — post-COLLAPSE-1 the callback
ends at :873; same callback).

The run-workspace already knows the graph: app/src/graph/RunWorkspacePage.tsx:41-58
builds the AiContext with `surfaceContext.eventGraphId = workspace?.eventGraph?.recordId`
(:50); useAiChat keeps a stable ref to the latest aiContext (:240-241, consumed pattern
at :459). Executor data access: app/src/shared/api/client.ts — `getRecord(recordId)`
(:2296) and `listRecordsByKind(kind, ...)` (:2135-2154, GET /records?kind=...).

Behavior, inserted AFTER the blocked-readiness early-return (:791-806) and BEFORE the
executing-state set (:827) / the apiClient call (:838):

1. Read `eventGraphId` from `aiContextRef.current.surfaceContext`. Absent/null ->
   no chain attached (fall through; (d)'s server pre-flight rejects honestly).
2. Fetch the event-graph record via `apiClient.getRecord(eventGraphId)`.
3. Resolve the job's equipment id DATA-DRIVEN from `job.request.instrumentRef?.id`
   — never a string constant, never `EQP-PLATE-READER` in app TS.
4. Build the equipment's DECLARED verb set from records only:
   a. fetch the equipment record (`getRecord(equipmentId)`) -> `equipmentClassRef.id`.
   b. `listRecordsByKind('equipment-capability')` -> keep records whose
      `equipmentRef.id === equipmentId` OR `equipmentClassRef.id === <class id>` and
      `status === 'active'` -> collect `capabilities[].verbRef.id` (VERB-* ids).
   c. `listRecordsByKind('verb-definition')` -> map the collected VERB-* ids to their
      payload `canonical` strings.
   This mirrors, at read time, exactly the join DeclaredCapabilityGate's
   read-event-verb resolver + EquipmentCapabilityService perform at write time
   (server/src/capabilities/EquipmentCapabilityService.ts:59-117). The executor's
   filter is deliberately CONSERVATIVE: it may under-attach (the class-closure in
   EquipmentKindRegistry is not replicated) — under-attachment falls through to the
   server's honest refusal, which is the designed behavior, never a fabricated pass.
5. Candidate events = graph events whose `semanticKeyComponents.verb` is in the
   canonical set from step 4c. The word 'read' NEVER appears in TS — it arrives as
   data through VERB-READ's canonical (records/seed verb-definition; ECP-PLATE-READER
   binds VERB-READ via class CL:plate_reader, records/seed/equipment/
   eqp-plate-reader.yaml:3).
6. EXACTLY ONE candidate -> attach on the request before dispatch:
   `eventGraphRef: { kind: 'record', id: eventGraphId, type: 'event-graph' }` and
   `readEventRef: <that event's eventId>` — the exact T2 shape
   (liveGate.test.ts:173-174). ZERO or TWO-OR-MORE -> attach NOTHING (pass through;
   do NOT pick "the first one"). Attach by building the request with the typed
   optional fields (see (a) exception); exactOptionalPropertyTypes: absent-or-value,
   conditional spread, never `undefined` assignment.
7. Failure to fetch any record (graph missing, equipment missing) -> treat as
   no-applicable: no chain, no crash; the chat error surface (:856-865) already
   reports the server's structured rejection.

### RED-first tests for (b)

New file app/src/shared/hooks/useAiChat.readChain.test.tsx (follow the mock pattern of
useAiChat.tracesNoExecute.test.tsx / ReadPlateModal.test.tsx's apiMocks; 'read' and
'EQP-PLATE-READER' MAY appear in test FIXTURE DATA — fixtures are data; the ban is on
policy literals in production TS):
- T-b1 one-read-event: aiContext.surfaceContext.eventGraphId set; mocked getRecord
  returns a graph with one event `{ eventId, semanticKeyComponents: { verb: '<canonical of VERB-X>' } }`;
  mocked listRecordsByKind serves an equipment-capability declaring VERB-X for the
  equipment id the job carries and the matching verb-definition. Assert
  `apiClient.executeInstrumentApplianceJob` call[0][0].request carries
  `eventGraphRef.id === <graphId>`, `eventGraphRef.type === 'event-graph'`, and
  `readEventRef === <eventId>`.
- T-b2 zero-candidates: graph events contain none whose verb is declared-capable ->
  assert request has NEITHER eventGraphRef NOR readEventRef (key ABSENT, not undefined).
- T-b3 ambiguous: two capable events -> assert both keys ABSENT.
- T-b4 no-graph: surfaceContext.eventGraphId null -> keys ABSENT and the call still
  happens (today's honest-400 path preserved).
RED at HEAD (the callback attaches nothing today — :838 sends the job untouched).

## (c) Ambiguous / no-graph case: execution-time MINTING — DESIGN DECISION, DO NOT IMPLEMENT

Ruling §4c/§2a: the chatbot compile pipeline emits NO event graph (only EventsEmitPass
+ PlannedRunEventsEmitPass, wired into runRunPlanCompile — a different pipeline), so a
chatbot-compiled run has no graph and no read event to point at. Minting one is NEW
product behavior and the ruling requires this item to SCOPE it explicitly while the
stop_boundary sends "any minting-semantics question -> architect".

Minimal shape, laid out for the architect/Brad sign-off (NOT for this item's coder):
- WHAT: one event appended to an event-graph record, of the SAME shape the T2 fixture
  shows (liveGate.test.ts:105-112): `{ eventId, event_type, details: { wells },
  semanticKeyComponents: { verb: <canonical NAME string>, identity: { plate: <labware id> },
  phaseId, ordinal } }` — verb stamped FROM the resolved VERB-* definition's canonical
  (data-driven; no literal), identity from the job's labware/plate context, ordinal
  discipline = max(existing ordinal)+1 within the graph (open question below).
- WHERE (which graph): the run's own event-graph when the surface knows one
  (RunWorkspacePage eventGraphId); when NO graph exists (pure chatbot compile), the
  ruling's own claim is that creating the graph itself is new product behavior — the
  ledger-correct place is execution time (the read physically happened, §4c) but the
  graph's OWN identity (per-run? per-study? minted by which pass?) is unresolved.
- MUTATION CHANNEL: event-graph update = PUT /records/:id on the existing record API
  vs an append-only event ledger — the ledger discipline (concurrent executions,
  ordinal races, retry idempotency) is exactly the "semanticKey/ordinal discipline"
  ruling §2a lists as unauthorized to invent.

CODER CONTRACT FOR (c): implement the ZERO/AMBIGUOUS branch as attach-nothing and the
server pre-flight rejection ONLY. If any work path appears to need a minted event,
STOP and return requires-rescope to the architect. NO minting code ships in this item.

## (d) Fail-fast pre-flight BEFORE sidecar dispatch

The sequencing defect (ruling §2d folded from §2D): today the declared gate fires only
inside `measurements.ingest` — MeasurementService.ts:175-188 — which
MeasurementActiveControlService.performActiveRead calls at :239, i.e. AFTER the run
has already dispatched. Dispatch sites, first-hand (MeasurementActiveControlService.ts):
- SIMULATE branch :134-147 — `generateGeminiMeasurementFixture` WRITES a fixture CSV
  at `outputPath` (:137-140) before any gate sees the request: the orphan-rawData
  shape, reproducible in tests.
- LIVE URL branch :148-185 — POSTs to `LABOS_GEMINI_READ_URL` via fetchFn (:173): real
  plate read fires, then the gate 400s -> live hardware fired for an unrecordable
  measurement.
- SIDECAR branch :186-194 — `sidecarRunner.run` spawns the adapter process.

WHERE THE PRE-FLIGHT BELONGS: inside `performActiveRead`, after
`validateActiveReadParameters` (:124-132) and BEFORE the runResult dispatch expression
at :134. Evaluation: call `evaluateDeclaredCapabilityGate` (import from
server/src/capabilities/DeclaredCapabilityGate.ts) with the measurement-shaped payload
`{ equipmentRef: input.instrumentRef, eventGraphRef: input.eventGraphRef,
readEventRef: input.readEventRef }` (conditional spreads per exactOptionalPropertyTypes)
against the MEASUREMENT schema id — the SAME interpreter, the SAME schema annotation,
zero new policy. On violation throw **MeasurementServiceError** (already imported at
MeasurementActiveControlService.ts:3) with the violation's code and message and status
400 — deliberately the SAME error class the ingest-gate throws (MeasurementService.ts:186-188),
because:
- liveGate T1 asserts `toBeInstanceOf(MeasurementServiceError)` (:159) with code
  `capability_gate_verb_unresolvable` — throwing anything else (e.g.
  MeasurementActiveControlError) BREAKS A COMMITTED PIN (pin-weakening hard stop).
- MeasurementHandlers.ts:342-368 already catches MeasurementServiceError and produces
  the identical structured {error, message} 400 + failed execution record — the HTTP
  contract seen by clients is byte-identical; only the TIMING moves (before dispatch).
The ingest-side gate call at MeasurementService.ts:175-188 STAYS untouched as
defense-in-depth for every other write path (uploads, direct ingest). This reordering
is a server PRODUCTION code change explicitly mandated by ruling §2D ("moving the gate
pre-check before sidecar dispatch ... belongs with the chain design") — it is not a
contract change under (a): no schema, route, or response-shape edit.

### RED-first tests for (d)

New file server/src/measurement/MeasurementActiveControlService.preflight.test.ts —
COPY the liveGate harness verbatim (tmp /tmp CONFIG_PATH dataDir, REAL schemaDir
'../schema', seeded event-graph via store.create, `parameters.simulate: true`, tmp
outputPath; do NOT add tests to liveGate.test.ts — it is the frozen ruling-§3a pin file,
and do NOT touch MeasurementActiveControlService.test.ts — already-red pinned-counter file):
- T-d1 NO ORPHAN RAWDATA (RED today): producer request, simulate:true, NO chain,
  tmp outputPath -> expect rejection code `capability_gate_verb_unresolvable` AND
  `fs.stat(outputPath under the dataDir worktree)` throws ENOENT. At HEAD this is RED:
  the fixture CSV exists after the rejection (written at :137 before ingest 400s).
  Assert the ERROR CODE and the file's absence — never record ids (drift-immune).
- T-d2 NO HARDWARE FIRE: same request live-mode (simulate:false) with a fetchFn stub
  injected via the constructor (:94-105, fetchFn is the 4th param) and
  LABOS_GEMINI_READ_URL set -> rejection code above AND the stub's call count is 0.
  At HEAD the fetch fires before the 400 -> RED.
- T-d3 (GREEN companion, guards against over-eager pre-flight): the T2 request shape
  (chain present, simulate:true) still SUCCEEDS through the pre-flight -> proves the
  pre-flight rejects only the inevitable, never the recordable.
liveGate T1/T2 must remain GREEN unchanged (they call performActiveRead and assert the
same code/type; timing move is invisible to them).

## (e) Delete the unreachable EQP-{slug} fallback branch (O2 dead code)

File: server/src/compiler/artifacts/InstrumentApplianceJob.ts.
- The fallback: `equipmentRecordId` :110-116 — after the `isGeminiEmInstrument` guard
  returns the constant (:111), the slug path :112-115 builds `EQP-${slug}`.
- Unreachable (ruling O2, re-verified first-hand at 9efeffd6 content): sole non-test
  caller chain is createGeminiEmActiveReadJob (:122, sole call :140) <-
  ChatbotCompilePasses.ts createEmitInstrumentApplianceJobsPass :3565-3597, which
  early-returns on `!isGeminiEmInstrument(runFile.instrument)` at :3577. app/ has ZERO
  imports of the producer (grep app/src = 0); test callers
  (liveGate.test.ts:138, MeasurementHandlers.applianceJob.test.ts:73/143/175,
  EmitInstrumentApplianceJobs.test.ts) all feed Gemini-EM alias names. Ruling-verified:
  zero corpus files make the branch reachable (grep -rn EQP-GEMINI-EM records/ = 0;
  every seed equipment id is a hand-declared record, e.g.
  records/seed/equipment/eqp-plate-reader.yaml:3).
- The delete: reduce `equipmentRecordId` to the constant return (or inline
  GEMINI_EM_EQUIPMENT_RECORD_ID at :140 and delete the function + normalizeInstrumentName
  :106-108 if no other call site survives — check `normalizeInstrumentName` is still used
  by isGeminiEmInstrument :119 KEEP it). KEEP the :92-103 explanatory comment block
  (it is the O1/ruling provenance) and KEEP `isGeminiEmInstrument` (the pass guard uses it).
- O3 STANDS AS RULED: the producer constant naming a seed record (GEMINI_EM_EQUIPMENT_RECORD_ID
  = 'EQP-PLATE-READER' :104) is fine — H1 governs the gate, not the producer. Do NOT
  "data-drive" this constant away; that is out of scope and ruled.
- No behavior change => GREEN-before/after acceptable for existing suites
  (EmitInstrumentApplianceJobs.test.ts, liveGate): this is deletion of unreachable code,
  RED-first does not apply; state that in the report (D2 honesty rule).

## Explicitly OUT of scope

- ANY minting of events/graphs (§C coder contract).
- measurement.schema.yaml, DeclaredCapabilityGate.ts, gemini sidecar schemas, verb-definition
  schema, route wiring — zero edits (ruling §3a do-not-touch carries forward).
- app/src/event-editor/rail/ReadPlateModal.tsx — COLLAPSE-2's C4 owns that file
  (id-retarget already in flight on wt/instr-collapse-2-lane1-l1t1840). Do not touch it;
  the (a)-exception typed fields may let C4's cast go later, not here.
- INSTR-COLLAPSE-2's surfaces (instrument kind deletion, C3/C4/C5) — concurrent item,
  disjoint files; if the collapse-2 merge moves trunk under you, REBASE and re-pin anchors.
- The chatbot compile pipeline emitting event graphs (new product behavior, §2a).
- Evidence/assertion publication flows (ReadPlateModal publishEvidence) — untouched;
  if pulled toward them, read docs/knowledge-layer-canonical-example.md first (CLAUDE.md
  knowledge-layer rule) and stop-boundary.

## Acceptance criteria (verbatim task-block fields first, then this spec's gate)

Task block `verified by:` — "(per ruling §4; author gate criteria at spec time)" — this
spec authors them:
1. Server contract UNCHANGED: `git diff <trunk-at-claim>..HEAD -- schema/ server/src/api/routes.ts server/src/capabilities/DeclaredCapabilityGate.ts schema/lab/measurement.schema.yaml` EMPTY (the sole allowed server/compiler edit is InstrumentApplianceJob.ts: (d)-typed optional fields + (e) dead-branch delete; the sole allowed server/measurement edit is MeasurementActiveControlService.ts pre-flight).
2. (b) RED-first: useAiChat.readChain.test.tsx T-b1..T-b4 committed RED first (inversion named in the commit message), then green; chain attached on exactly-one, ABSENT on zero/ambiguous/no-graph.
3. (d) RED-first: preflight.test.ts T-d1 proves NO rawData file exists after the local rejection; T-d2 proves zero fetchFn calls for a doomed live request; T-d3 proves the recordable request still passes.
4. liveGate T1/T2 GREEN UNCHANGED (file byte-identical: `git diff` on liveGate.test.ts EMPTY); MeasurementService.capabilityGate.test.ts, DeclaredCapabilityGate.test.ts green.
5. Full-suite failing-FILE delta = empty vs the baseline pin captured at the claim-time trunk (MeasurementHandlers.applianceJob hook-timeout is a known baseline member — do not "fix", do not pin-around).
6. (e) `EQP-\$\{` grep inside InstrumentApplianceJob.ts = 0 hits; EmitInstrumentApplianceJobs.test.ts + liveGate green (behavior-preserving deletion).
7. No verb literal: `grep -nE "'read'|\"read\"|VERB-READ|analytical_readout" app/src/shared/hooks/useAiChat.ts` (production file only, fixtures exempt) = 0 hits; no equipment-id constant in the executor (id read from job.request.instrumentRef.id).
8. Typecheck: `npm run typecheck -w server` and `-w app` introduce ZERO new error lines vs the claim-time baseline capture (do not demand exit 0; demand the delta; exactOptionalPropertyTypes sites use conditional spreads).
9. No minting code: `git diff` contains no event/event-graph CREATION outside test seed harnesses (T2-style store.create of a graph is test-seed only).

Stop boundaries (task block, verbatim):
  "same hard stops as INSTR-COLLAPSE-1; any minting-semantics question -> architect."
The COLLAPSE-1 hard stops (as enumerated in the task-list): corpus premise, contract-host,
verb-literal, pin-weakening, out-of-scope kinds, governance rebase conflict. Plus:
requires-rescope on ANY platform gap — never absorb.

## First targeted check (proves the approach early, at claim time)

From /mnt/vast/home/brad/git/cl-integration-1/server:
  npx vitest run src/measurement/MeasurementActiveControlService.liveGate.test.ts
Expected: 2 passed — the T2 door is open at claim-time trunk, i.e. the chain channel
this item plumbs is proven alive on your exact base before you write a line.

## Verification commands (complete)

From server/ (fleet-coder rule: server vitest from server/, app from app/):
  npx vitest run src/measurement/MeasurementActiveControlService.liveGate.test.ts src/measurement/MeasurementActiveControlService.preflight.test.ts src/measurement/MeasurementService.capabilityGate.test.ts src/capabilities/DeclaredCapabilityGate.test.ts
    -> all green; preflight T-d1/T-d2 committed RED first then green.
  npx vitest run src/compiler/pipeline/passes/EmitInstrumentApplianceJobs.test.ts src/api/handlers/MeasurementHandlers.applianceJob.test.ts
    -> green (applianceJob hook-timeout: baseline member, report it, do not touch).
  npx vitest run   (full) -> fail-FILE delta empty vs claim-time baseline pin.
  npx tsc --noEmit  (server) -> zero NEW error lines vs baseline.
From app/:
  npx vitest run src/shared/hooks/ src/event-editor/rail/ReadPlateModal.test.tsx
    -> green incl. new readChain suite; ReadPlateModal suite UNCHANGED (regression guard for staying out of C4's file).
  npx tsc --noEmit (app) -> zero new errors.
Lane stack (:3092/:5192 only, NEVER :3001/:5174): no YAML changed -> no restart needed;
if any schema YAML diff appears in your branch, that is criterion 1 violated.

## Worker contract

- Branch off lane trunk: cl/lane1-instr-readchain-1-l1t<stamp> (trunk at claim time —
  COLLAPSE-2 may merge first; rebase + re-anchor cites, do NOT renumber blindly).
- Worktree: /mnt/vast/home/brad/git/wt/instr-readchain-1-lane1-l1t<stamp>, node_modules symlinked.
- All git via `git -c core.fileMode=false ...`.
- Deliverable/report path (unique): ~/.hermes/cl/lanes/1/readchain-1-report-l1t<stamp>.md;
  prompt/log per lane convention (prompts/readchain-coder-l1t<stamp>.txt,
  logs/coder-READCHAIN1-l1t<stamp>.log).
- RED-first commits name the inversion in the message; (e) states behavior-preserving
  deletion; report carries D2-honesty: what was VERIFY vs CHANGE, real-suite outcomes verbatim.
- Never mark done; orchestrator owns status.

## Reviewer bait (the likely edge errors for this item — pre-empt them)

1. exactOptionalPropertyTypes: every chain attach/splice and the pre-flight payload
   MUST be conditional spreads (`...(x !== undefined ? { x } : {})`), never
   `{ eventGraphRef: undefined }`. Check (b) tests assert key ABSENCE (`'readEventRef' in request === false`),
   not undefined-equality — undefined would pass a weak test and violate rule 6.
2. Pin-weakening trap: making T1 throw MeasurementActiveControlError, editing liveGate,
   "simplifying" T1's expect. The pre-flight must keep T1 GREEN UNCHANGED — same error
   CLASS (MeasurementServiceError), same code, same 400. A reviewer must diff liveGate.test.ts to zero.
3. Verb-literal / hardcode boundary (H1/H2, CLAUDE.md hard boundary): no 'read'/'VERB-READ'/
   canonical string in production TS (useAiChat, MeasurementActiveControlService); the
   capable-verb set and canonical names come from equipment-capability + verb-definition
   RECORDS; the equipment id comes from the job, not a constant. Grep proof = criterion 7.
   Fixture data in tests MAY name 'read' — that is data.
4. YAML-reload trap: none expected (no YAML in scope) — if the coder "needs" a schema
   change, that is the (a) pinned non-goal failing => STOP, requires-rescope. If any
   YAML does land, the lane stack needs a restart and criterion 1 fails — flag either way.
5. Ontology terms: event-graph, equipment-capability, verb-definition, measurement,
   instrument-log are the kind nouns; semanticKeyComponents.verb / eventId /
   equipmentClassRef / capabilities[].verbRef are the field paths — the shapes are
   pinned liveGate.test.ts:98-117 (graph payload) + measurement.schema.yaml:55-59
   (annotation) + EquipmentCapabilityService.ts:91-117 (capability joins). Inventing a
   parallel vocabulary = contract-host bait.
6. Orphan-rawData false-green: asserting only the error code (T1 already does that) does
   NOT prove pre-flight order; the discriminating assertion is the FILE ABSENT / fetch
   call-count 0 (T-d1/T-d2) — RED at HEAD BY CONSTRUCTION, green only if dispatch moved
   after the check.
7. (b) over-attachment: attaching the FIRST capable event when two exist (ambiguous) is
   a fabricated-context bug — T-b3 exists to catch exactly that; under-attachment is safe,
   over-attachment is not.
8. Scope creep toward C4/minting: touching ReadPlateModal.tsx or writing any
   event-minting code — both are named-owner / architect surfaces.

## Open questions (could not resolve locally; each with what I checked)

1. Minting discipline (ruling-sanctioned open): which event-graph record owns a
   chatbot-compiled run's execution events (no graph exists post-chatbot compile —
   ChatbotCompilePasses.ts registers no events-emit pass; only runRunPlanCompile's
   EventsEmitPass/PlannedRunEventsEmitPass produce graphs), and the eventId/ordinal
   discipline + mutation channel (PUT vs append-ledger) on a shared graph. Checked:
   full grep of compiler passes for event emission; liveGate graph fixture; event-graph
   schema usage. Needs architect/Brad sign-off per §C before ANY implementation item.
2. Class-closure fidelity: should the executor's capable-verb filter replicate
   EquipmentKindRegistry's bidirectional kind<->realization closure
   (EquipmentCapabilityService.ts:75-80), or is the conservative equipmentRef/classRef
   direct-join sufficient (my spec choice: conservative; misses fail to honest-400,
   never fabricate)? Checked: both service sources end-to-end. If the architect wants
   full fidelity, the cheap route is a read-only GET endpoint reusing
   EquipmentCapabilityService — that WOULD be a new (additive) server read contract and
   needs the ruling-owner's blessing; I did not assume it.
3. Baseline pin at claim time: the current full-suite fail-file baseline pin is keyed to
   the COLLAPSE-1 era (baseline2-l1t0755 + orchestrator's 9efeffd6 note in the 1905
   handoff says a fresh 9efeffd6 pin may still need capturing); this spec demands a
   claim-time capture — confirm the orchestrator owns that capture step rather than
   this item reusing the stale pin. Checked: tick-1905 handoff NEXT TICK checklist
   item 3, task-list COLLAPSE-1 reconcile block.

draft-complete

## ORCH PROMOTION BLOCK (tick l1t1945, 2026-10-22 20:25)

Promoted from DRAFT-2026-10-22T1915 on orch spot-check basis: load-bearing cites verified
first-hand against trunk 9efeffd6 at promotion time — useAiChat.ts:788
executeInstrumentApplianceJob; MeasurementHandlers.ts ActiveReadRequestBody eventGraphRef/
measurementContextRef/readEventRef :38-40; DeclaredCapabilityGate.ts 'read-event-verb' :83;
InstrumentApplianceJob.ts EQP-{slug} fallback STILL PRESENT :112-115 (the (e) dead-branch
delete target; GEMINI_EM_EQUIPMENT_RECORD_ID='EQP-PLATE-READER' :104 is blessed producer
data per H1 carve-out the draft states); MeasurementService.ts ingest gate :175-188 (stays
untouched per draft). Minting (§C) correctly scoped as architect/Brad sign-off — NO coder
implementation authority. Coder dispatch gate: after COLLAPSE-2 merges (dep + fleet-single).
Remaining cite-verification is the claim-time re-pin's job, not a promotion blocker.
