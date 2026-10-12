# HANDOFF — architect — 2026-10-09T08:15 EDT
# Covers: the full round from Brad's 2026-10-07-evening memo reading through wave-1
# completion, plus the standing plan for the WAVE-2 (PDF -> semantic protocol family)
# intake that starts next. Audience: whoever picks up the next planning session
# (architect continuation) and the lane-2 orchestrator.

## 1. WHAT HAPPENED, IN ORDER

### Memo intake and push-to-origin (2026-10-07 evening)
- Read the architecture memo (verbatim record:
  ~/.hermes/specs/discussions/2026-10-06_small-model-semantic-ir-architecture.md):
  extract INTENT into a tiny semantic language; deterministic systems resolve ontology,
  capabilities, constraints, graph. Five ideas: CL shorthand; noun-resolution spine;
  vendor PDF -> Semantic Protocol Family; reuse stack (semantic protocol -> local
  realization -> execution template -> run graph); number provenance
  (VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION).
- Brad's three intake answers (2026-10-07): all 302 dirty files in the main checkout are
  his and "push all"; the memo campaign goes into LANE 2; wave scope = "the data and
  resolution spine" first, PDF intake tomorrow.
- Executed: committed the working tree (7977ec96 docs, 455232cf checkpoint of Oct 3-6
  direct work; scratch excluded: .claude/, tmp probes, model.pkl, config backups);
  pushed origin/main 4c746e80..455232cf (origin/main had been dead since Sept 19),
  origin/cl/integration-1 (new), origin/cl/integration-2. Known future merge conflicts
  recorded in the intake packet (main x int-2: AiTabPanel.tsx, useAiChat.ts,
  config/drafting/adapters.yaml; main x int-1: GlobalNavbar.tsx, signature.schema.yaml,
  qms-manual-testing-cheatsheet.md).

### Wave-1 intake convergence (rounds in ~/.hermes/specs/intake/2026-10-07_cl-shorthand-noun-spine/)
- Wire-format question put to Brad in plain terms; answer: "lets keep the YAML" —
  scientist-intent YAML stays the model-facing contract; the memo's line DSL exists ONLY
  as a later human/prompt render, never a second grammar.
- Noun-resolution spine = compiler pipeline PASS (not a service). Wave-1 bar = HEADLESS.
- One paid synthesis call: openai/gpt-6-astra high, 124s, $0.269; packet + raw response +
  draft preserved in the intake dir. Grounded corrections applied before authorship:
  rejected the draft's parallel /api/scientist-intent/compile route (EXTEND the existing
  POST /intent/compile-from-prompt); verb union verified at 31 (not 29); lint DSL stays
  the only policy home.
- Brad: "approve as is." Published SPINE-1..6 into lane 2 under the queue lock
  (2026-10-07T23:15) with the campaign header carrying all bindings.

### Wave-1 execution (lane-2 ticks, overnight 10-07 -> 10-09): ALL SIX DONE
- SPINE-1 contract freeze (31-verb $defs single-source enum, actionLocation,
  expected*Domain slots) -> ... -> SPINE-6 end-to-end goldens (6 fixtures) + manifest +
  live current-model smoke, each through adversarial gate + orch self-verify + merge.
- Honest outcomes worth remembering: SPINE-6's live smoke on qwen3.8-flash-next returned
  needs-clarification and was classified NOT_SUCCESS_CLARIFICATION (no faked green);
  SPINE-6's coder STOPPED HONESTLY when the wells-seam binding proved unreachable, which
  produced the SPINE-7/8 ruling instead of a fake golden.
- Queue-hygiene fix by architect (10-08 ~11:20): duplicate `id: PB-CH-8` blocks (done
  stub + in-progress original) had crashed the readiness gate ("invalid or duplicate
  task ID") for ~1.5h, stalling dispatch. Merged the two blocks losslessly under lock;
  gate rc=0 again. Lesson: tick-side invariant "exactly one block per id" is worth
  codifying (candidate for PB-CH-9's operating-contract docs — that task has since DONE,
  so a follow-up note may be needed; not yet enqueued).
- Also closed meanwhile by ticks: PB-CH-5/6 residual legs, PB-CH-8 (+fix1 ledger-turn
  flag), PB-CH-9 (gate closed DONE 2026-10-09_0650), PROTO-AI-13 (now DONE per task
  list), PB-CH-1..4b/7, HARNESS-1.

### Brad decisions this morning (2026-10-09 ~07:00)
- "1) I approve" — SPINE-7-ROLES-SEAM and SPINE-8-LEVELFOR both APPROVED. Recorded in
  the decision packet (BRAD-PACKET-spine7-spine8-amendment-20261009.md, ANSWER section)
  and published to the lane-2 queue as todo blocks (architect-published 08:0x under
  lock; acceptance shape = the ruling artifact
  SPINE-6-wells-seam-reachability-decision.md). Readiness after publish: "3 0 0", rc=0.
- "2) Let's do the wave 2 intake!" — this handoff defines how.

## 2. QUEUE STATE NOW (verified 08:15)
- Lane 2 todo: PROTO-AI-13 verdict follow-through (task block now reads done — verify
  whether any follow-up leg remains before claiming it empty), SPINE-7-ROLES-SEAM,
  SPINE-8-LEVELFOR. Nothing in-progress, nothing blocked. Fleet coder lock free.
- Lane 1: empty since Oct 5 (QMS campaign done; ticks logging no-work).
- Origin: main at 455232cf; trunks pushed. New-trunk/cut-over still pending —
  conflict set recorded above in §1.

## 3. WAVE-2 INTAKE PLAN — "PDF -> Semantic Protocol Family" (the phase-2 interview)

Intake method is fixed by standing rules: MULTI-ROUND conversation with Brad, 2-3
material questions per round, investigate between rounds (cl-scout bounded recon,
read lane handoffs, answer the two standing questions out loud with citations), ONE
paid openai/gpt-6-astra high-thinking call ONLY after convergence, then architect
authors THE LIST grounded to the trunk, Brad approves, publish to a lane. Open the
packet at ~/.hermes/specs/intake/2026-10-09_semantic-protocol-family/ and append
every round.

Round 0 facts already established (do not re-ask; reuse):
- The memo's wave-2 target chain: Vendor PDF -> Semantic Protocol Family (intents +
  constraints + branches + provenance) -> specialize -> Lab Realization Plan ->
  scientist-intent YAML (wave-1 contract!) -> deterministic compiler -> run graph.
  Wave 1 gives the bottom half a real spine; wave 2 must make its OUTPUT land on that
  spine, not beside it.
- Existing machinery to reuse (grounded 2026-10-07/08): server/src/ingestion/
  (IngestionService, IngestionWorker, pdf/TableExtractionService, pipelines/,
  matching/, normalization/, publishers/; app ingestion protocol-review UI with
  BranchQuestionsPanel — the branch-question PDF system the memo says NOT to throw
  away); the ask/answer round-trip on POST /intent/compile-from-prompt
  (extractBranchQuestionsFromSmallLlm) already discovers branch axes from protocol
  text; schema/ triplet conventions; PROTO-AI-12/13 router evidence for model sizing.
- The provenance ladder (VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION + status
  locally-validated?) and constraint classes (ratios, concentrations, per-unit doses,
  minima/maxima, capacities, thresholds, completion conditions, vendor defaults) must
  be DATA — new record type(s) + lint YAML, per "things that can be data should be
  data". Materials hierarchy applies: a semantic operation is a CONCEPT-level object;
  realization binds instances — never collapse.
- Wave-1 seams wave 2 must respect: semantic-family specialization ultimately emits
  scientist-intent docs; the wells/label/role contract is SPINE-7; material-level
  strictness is SPINE-8 (its vendor-vs-material-strictness open item DIRECTLY touches
  wave-2 vocabulary — consider sequencing SPINE-8 before or inside early wave-2).

Round 1 questions proposed for Brad (the ones that change the list, not ceremony):
1. First semantic-family exemplar: which vendor kit should the family schema be built
   around — DNeasy (memo's own worked example, and live DNeasy data exists but is Brad's
   real data — receipts must not use it without a seeded copy) — and does one exemplar
   family carry wave 2, or two (e.g. a kit + a non-kit protocol)?
2. Family authoring path: extend the existing PDF ingestion pipeline to EMIT the family
   (evolve its output as the memo says), or an interactive "family workshop" where the
   PDF understanding is reviewed by a scientist record-by-record before the family is
   published (review-surface precedent: ChangesPanel / protocol-review)?
3. Authority and validation semantics: who/what marks a constraint
   INFERRED_INVARIANT->LOCAL_REALIZATION "locally validated" — QMS-governed signature,
   simple lint-gated field, or record edit by an authorized actor? (QMS machinery from
   lane 1 exists: revisions, e-signatures, audit events.)

Between-round recon to run: cl-scout on (a) how VendorPdfReviewPage + BranchQuestionsPanel
+ the ingestion pipeline hand off today (what data structures cross the boundary),
(b) where "protocol" records currently sit vs the planned family/realization/template
layers (avoid two terms per entity). Check intake dir + newest handoffs at resume.

Hard rules for the authored list: no PDF tasks resurrect the literal-steps path as the
end-product (intent extraction first); no hardcoded vendor content; every new noun gets
an ontology/CURIE discussion; UI work (if any) rides the browser-review gate; nothing
enters the queue without Brad's approval of the architect-authored list.

## 4. OPEN BOOKKEEPING
- SPINE-7/8 published but spec-path points at the ruling artifact; first tick to claim
  them should compose proper specs from it (composer under thunderbeast, per lane rules).
- The readiness-gate invariant lesson (§1) is unenqueued; raise as a tiny lane-ops task
  or fold into the next campaign's docs task.
- New-trunk cut-over still owed (conflict list §1); wave 2 may start on the current
  trunk — cut-over is Brad's moment, not a blocker for tasks.
