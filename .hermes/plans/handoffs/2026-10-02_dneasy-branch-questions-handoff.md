# Handoff — DNeasy intake: wrong question asked, degenerate branch axis, stale trees

STATUS 2026-10-02 ~18:45: ALL THREE DEFECTS FIXED, DEPLOYED, LIVE-VERIFIED.
D1: degenerate-axis suppression in deriveDecisionTree (declared note).
D2: relevantChoices + isAxisVisible semantics fixed (server + UI).
D3: POST /api/protocol-ide/intake/refresh — deterministic re-derive from the
    persisted candidate (no LLM), invalidates positionally-stale proposals
    (accepted/rejected survive), carries sourcePdf forward; ran live on the
    DNeasy parent: 4 trees re-derived, 46 stale proposals invalidated (history
    in embedded git), tree now asks the ONE real question (3 variant options),
    realize("blood-with-nucleated-erythrocytes", manual_tubes) → SGP/EVG b1-s1
    with activeStepIds=['step-22'] exactly.
NOT COMMITTED (shared tree). Remaining polish (optional): a UI affordance to
trigger refresh (button on the review page), and the pre-existing
BranchQuestionsPanel 'not pre-built' copy test failure (broken on HEAD).
Details of the pre-fix investigation retained below for context.

----

Date: 2026-10-02 (~14:30 EDT). Session: architect-q38. Tree: main @ 2a1102bc, shared working tree.

## What the user sees (symptom set)

Review page for the DNeasy handbook, DNeasy-96 blood tree selected:
- "This document asks 1 question → 19 branch realizations"
- The one question shown is the degenerate "Which branch applies: blood with
  nucleated erythrocytes (follow step 1b) / cultured cells (follow step 1c)?"
  (only 2 options — the non-nucleated option is missing from it).
- Selecting it says "This branch runs 1 step (step-20)".
- The book has ~7 protocols but only 4 trees, and only one question is ever asked.
- Earlier today the same surface 404'd on "Build this branch" — that was
  maxParamLength, already fixed and deployed (see "Already landed" below).

## Ground truth collected this session (verified against live server + records)

Live probe: GET /api/protocol-ide/intake/review/VPDF-6711E1FA89E9 (sha256 join)
returns trees[] = 4 trees (blood-96, blood-spin, tissue-96, tissue-spin), all
generatedAt 2026-09-23T02:1x — derived under a2644831, never re-derived since.

Per-tree axes (dumped from /tmp/rev.json, live API):

blood-or-cells DNeasy 96 (PDT-...-dneasy-96-protocol), 19 proposals:
  - branch-axis-step-20   origin=document_branch, NO sectionId, 2 conditions:
      branch-1 -> then_stepIds ['step-20']   (nucleated)
      branch-2 -> then_stepIds ['step-20']   (cultured)     ← EVERY option gates
      the same step. Semantically empty "question" — the answer changes nothing.
  - axis-step-20-variant  origin=document_branch, sectionId=section-...-dneasy-96,
      3 conditions gating step-21 / step-22 / step-23. This is the REAL question
      (deriveStepVariantAxes output, correct 3 options).

blood-or-cells spin-column tree: identical shape (branch-axis-step-1 all gate
step-1; axis-step-1-variant gates step-2/3/4). Same bug.
tissue-96 / tissue-spin: axes 0, 3 proposals each (scale-only).

19 = 18 eager (6 bindings × 3 scales; the degenerate axis doubles the product)
+ 1 realized this session by me (b6-s0, on-demand partial-binding id, created
while testing the maxParamLength fix — verified fetchable, GET 200).

## Root causes (3 defects, compounding)

D1 — Degenerate duplicate axis (server, derivation).
For step-20 the model emitted branches[] (non-empty → the branch-marker spine
correctly does not touch it), and deriveBranchAxes turned them into
branch-axis-step-20. Its dedupe guard is option-KEY based, and each condition's
then_stepIds = the branchy step itself, so a single dispatch step with >=2
branch strings yields an axis whose conditions ALL gate step-20. deriveStepVariantAxes
HAS the right guard — "Every option must name a DIFFERENT step, else the choice
changes nothing" (`gated.size !== conditions.length → skip`,
deriveStepVariantAxes.ts:158-160) — deriveBranchAxes lacks it
(deriveBranchAxes.ts:205-231, deriveDecisionTree.ts:179-187 pushes whatever it
returns). Result: the degenerate axis (a) is asked as the top-level question,
(b) doubles the product (18 vs 9 proposals), (c) shows only 2 of the 3 real
options.
Fix shape: suppress in deriveDecisionTree (intake surface) — if a branch axis's
conditions all gate the SAME step set and none carries else_stepIds/
insert_steps, drop it with a declared note (`degenerate_branch_axis_suppressed`,
same refuse-and-note convention as protocolNote/tableNote). Do NOT change
deriveBranchAxes itself (shared by promote/MCP callers; axisId stability
contract tested in deriveDecisionTree.test.ts:157).

D2 — Nested question unreachable in per-protocol child trees (UI + server mirror).
After cl:handbook-section-split, each tree IS one protocol; there is NO
document_section protocol-choice axis anymore. But:
  - UI: app/src/ingestion/protocol-review/axisLabels.ts:134 isAxisVisible —
    `protocolAxisIds.some(id => choices[id] === axis.sectionId)` is false when
    protocolAxisIds is empty → the variant question (carries sectionId) is
    NEVER shown. Hence "1 question": only the degenerate axis is visible.
    Fix: no protocol-choice axis exists → nothing gates nested questions →
    visible. (`if (protocolAxisIds.length === 0) return true`)
  - server: src/protocol-intake/enumerateChoiceBindings.ts:136 relevantChoices —
    `if (axis.sectionId && !Object.values(choices).includes(axis.sectionId))
    continue;` silently DROPS the variant answer on child trees. realizeBinding
    then resolves only the degenerate axis → activeStepIds=['step-20'] →
    "runs 1 step (step-20)". Same fix shape: drop a nested answer only when a
    protocol-choice axis EXISTS and a DIFFERENT section was chosen.
  - Same file's unansweredTopLevel in realizeBinding (ProtocolIntakeService.ts:683)
    stays correct once relevantChoices is fixed (it only demands non-sectionId axes).

D3 — Stale trees / stale proposals (the user's "cached version" hunch: correct).
Trees are reused unless refresh:true (persistTree, ProtocolIntakeService.ts:810-851;
`input.refresh` plumbed at :461 but no API/UI caller passes it). The DNeasy trees
predate any D1/D2 fix and will predate the fix again — so the fix MUST ship with a
re-derive path, and re-derive has a collision problem:
  - Re-intake today re-runs the LLM extraction (persist:true, "the persisted
    artifact is the MODEL's output verbatim"). No deterministic re-derive exists.
    The parent candidate IS persisted deterministically-readable:
    readCandidateArtifact(workspaceRoot, documentId) (VendorProtocolCandidateService.ts:143),
    parent artifact exists: artifacts/foundry/protocol-candidates/vendor-protocol-dneasy-blood-pdf.json.
    A cheap refresh = read parent candidate → spinePatterns()/annotateStepVariants
    (already cached in ProtocolIntakeService.ts:64-79) → splitHandbookSections →
    per-child deriveDecisionTree → persistTree(refresh:true). No LLM.
  - COLLISION (decide deliberately): proposal ids are positional
    (proposalIdFor(tree.recordId, bindingIndex, scaleIndex)). Axis set changes →
    the SAME ids mean different bindings; draftOneProposal's dedupe guard then
    skips drafting the NEW binding under the OLD proposal's id (returns the
    stale graph, `proposal_exists`). 18 stale SGPs + my b6-s0 exist on the real
    tree. Options: delete stale SGPs/EVGs on refresh (embedded git keeps history;
    declare count in diagnostics) vs mark state:'rejected'. Recommend delete +
    declared diagnostic, and drop proposals whose branchPath references a
    suppressed axisId. NOTE b6-s0 was created by my verify step, not by the
    reviewer — safe to supersede.
  - UI subtitle `proposals.length` counts everything including stale +
    partial-binding realizations. Recount after refresh; "19" is itself a symptom.

## Already landed THIS session (uncommitted, deployed to the live backend)

1. server/src/server.ts — Fastify maxParamLength: 512 (find-my-way default 100
   was router-404'ing the 109-char treeId → the original "Route POST .../realize
   not found"). Verified live: realize now runs end-to-end (created
   SGP-...-b6-s0 / EVG-...-b6-s0, both GET 200).
2. server/test/api/longParamRoutes.test.ts — 3 tests, green. Pin:
   `npx vitest run test/api/longParamRoutes.test.ts` (+hookTimeout for initializeApp).
3. Server restarted via ./start-app.sh (old Sep-21 tsx --watch child ignored
   restart; watcher log .run/backend.log).
4. RED tests written, NOT yet green (this is where to resume):
   server/src/protocol-intake/enumerateChoiceBindings.test.ts — two
   relevantChoices tests: (a) nested answer on a tree with NO protocol-choice
   axis must be KEPT (currently fails — D2 server), (b) nested answer dropped
   only when another protocol chosen (should already pass — regression pin).

## Resume checklist (ordered, small)

0. Verify D1 premise cheaply: step-20's branches[] in
   artifacts/foundry/protocol-candidates/vendor-protocol-dneasy-blood-pdf.json
   (expect 2 branch strings on the dispatch step; the 3-clause truth lives in
   sourceText — the variant axis got all 3 right).
1. GREEN D2-server: fix relevantChoices (enumerateChoiceBindings.ts:136) per
   shape above → the two new tests green. Run enumerateChoiceBindings.test.ts +
   ProtocolIntakeService.test.ts + bindingIndexFor.test.ts.
2. RED+GREEN D2-UI: app axisLabels.test.ts add "child tree (no protocol axis)
   shows its nested question"; fix isAxisVisible. Run app vitest for
   protocol-review + VendorPdfReviewPage tests.
3. RED+GREEN D1: deriveDecisionTree.test.ts add degenerate-suppression test
   (single dispatch step with branches[] + variant axis → only variant axis
   survives, note declared; multi-step shared axes unaffected). Fix in
   deriveDecisionTree.ts near :179.
4. D3: deterministic refresh path (candidate-artifact re-derive, no LLM) + SGP
   invalidation + wire one caller (MCP tool flag or intake route refresh:true
   param — pick, don't fabricate a new hardcode). Then run it on the DNeasy
   parent and verify: blood-96 tree has 1 axis (the variant, 3 options), 9
   eager bindings × 3 scales capped at maxProposals, spin tree likewise,
   realize with {axis-step-20-variant: blood-with-nucleated-erythrocytes}
   gates step-22, NOT step-20.
5. Full gates: npm run test:run -w server (known pre-existing failures from the
   sibling governance workstream: test/api/settings.test.ts 4 fails, hook
   timeouts — NOT ours), npm run typecheck both workspaces, app unit tests.
6. Nothing is committed; working tree is SHARED with Brad's intake/equipment
   session — re-grep own edits before trusting; no state-changing git from
   children.

## Numbers to quote back to Brad

- 4 trees, not 7: the split yields one per protocol SECTION (blood×2 methods,
  tissue×2 methods); pretreatments attach, they don't fan out.
- "19" = 18 stale + my 1 test realization; "1 question" = degenerate axis shown,
  real one hidden; "1 step (step-20)" = the degenerate axis's gated step.
- All three trace to trees derived 2026-09-23 and reused verbatim since
  (tree_exists reuse; nothing re-derives without refresh:true).
