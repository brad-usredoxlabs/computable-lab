# REVISE-GHOST-1 — FIX RUN 2 coder report (lane 2, l2t1835) — worktree copy

Canonical deliverable: /home/brad/.hermes/cl/lanes/2/deliverables/REVISE-GHOST-1-fix2-report.l2t1835.md
(Identical content below; docs commit additive after the product commit per ruling l2t1835 allowlist item 6.)

1|# REVISE-GHOST-1 — FIX RUN 2 REPORT (lane 2, l2t1835)
2|
3|Worktree: /mnt/vast/home/brad/git/wt/REVISE-GHOST-1-lane2-l2t2050
4|Branch: cl/lane2-revise-ghost-1-l2t2050 (additive commits on top of e11cbca4 — no amend/rebase)
5|Commits this run:
6|  a7d86a37 e11cbca4  test(lane2): REVISE-GHOST-1 fix2 RED — D-b/D-c + Ruling-3 drift pin (RED at e11cbca4)
7|  fefe17e5 a7d86a37  fix(lane2): REVISE-GHOST-1 fix2 — ruling l2t1835 implemented (GREEN tip)
8|Ruling implemented: /home/brad/.hermes/cl/lanes/2/decisions/REVISEGHOST1-fix2-wall-predicate-jurisdiction-l2t1835.md — read in full; ends `RULING: final` (verified before any edit).
9|Cycle-2 defects closed: Defect 1 MAJOR (identity-less protocolEdit-only success landed EMPTY ChangesPanel + live 'Apply to run'), Defect 2 MAJOR (server canonical widened 7->9 + AgentOrchestrator rewired).
10|All git run with `git -c core.fileMode=false` (NFS mode-bit noise).
11|
12|## 0. Ruling implementation map
13|
14|- Ruling 1 (protocolEdit jurisdiction = client, by ARM ORDER): the protocolEdit term is REMOVED
15|  from `draftProducedNothing` (draftEmptiness.ts). No delivery-marking flag, no state. The mappable
16|  envelope returns inside the arm (AiTabPanel.tsx:514, arm body byte-untouched); the identity-less /
17|  unmappable fall-through remnant is judged empty by the 8-term predicate and walls.
18|  Client ⊇ server pinned (never ==): equipmentRequirements stays as the sanctioned client-superset
19|  member (destination-proven by the existing setPreview + previewPlacements > 0 negative).
20|- Ruling 2 (server REVERT): `server/src/ai/AgentOrchestrator.ts` and `server/src/ai/draftArgDiagnostics.ts`
21|  restored to their 4903ec61 text via `git checkout 4903ec61 -- <both files>`. The inline 7-term
22|  `const emptyResult` guard is back verbatim; the `agentDraftProducedNothing` helper is deleted.
23|  Client comments that cited the phantom helper (draftEmptiness.ts header, AiTabPanel.tsx wall-arm
24|  comment) corrected in the same commit. `assistStream.ts` `deckLayout?` stays (ruling: justified
25|  type completion, not part of Defect 2) — untouched at e11cbca4.
26|- Ruling 3 (drift-pin strength): rewritten in honestWall.test.tsx — server arm slices the
27|  `const emptyResult =` block from AgentOrchestrator.ts and asserts a predicate-term REGEX per
28|  canonical channel (`result\.<channel>\??\.length|!result\.<channel>\b`), plus negative legs that the
29|  server block contains NO equipmentRequirements/protocolEdit terms; superset arm asserts per-channel
30|  functional behaviour of the client and the client's extra set is exactly {equipmentRequirements};
31|  the protocolEdit leg INVERTS to `true` (old :446 leg deleted).
32|
33|## 1. RED first (D-e) — tests committed BEFORE the product change (a7d86a37, tree at e11cbca4)
34|
35|cwd=app: npx vitest run src/event-editor/right-pane/ai/AiTabPanel.honestWall.test.tsx
36|  Test Files  1 failed (1)
37|       Tests  3 failed | 10 passed (13)
38|  FAIL NEGATIVE (D-b): identity-less protocolEdit-only success — wall expected, NOT rendered
39|       (Unable to find an element by: [data-testid="ai-tab-honest-wall"]) — reproduces the cycle-2
40|       gate's PROBE_STATE {"wall":false,"changesPanel":true,"changesApply":true}
41|  FAIL NEGATIVE (D-c complement): attached-identity UNMAPPABLE envelope — wall expected, NOT rendered
42|  FAIL DRIFT PIN (Ruling 3): AssertionError: expected -1 to be greater than or equal to 0
43|       (the `const emptyResult =` anchor does not exist at e11cbca4 — the helper call replaced it)
44|(The D-c POSITIVE destination leg already passes at e11cbca4 — it is a destination pin guarding the
45|arm surface, per Ruling D-c; the defect-kill legs D-b/D-c-complement/pin are RED.)
46|
47|## 2. Product change (fefe17e5)
48|
49|- app/src/event-editor/right-pane/ai/draftEmptiness.ts — 8 terms exactly: events,
50|  clarificationRequests, error, labwareAdditions, labwareRequirements, equipmentRequirements,
51|  recordCreations, deckLayout. NO protocolEdit term. Header states the pinned relationship honestly
52|  (client ⊇ server canonical; protocolEdit governed by arm order; equipmentRequirements is the
53|  client-surface deliverable with destination test). No phantom-helper cite.
54|- app/src/event-editor/right-pane/ai/AiTabPanel.tsx — wall-arm COMMENT only (single hunk
55|  @@518,27 +518,35 — comment lines; the `if (result.success === true && draftProducedNothing(result))`
56|  line and every arm's code unchanged). Arm body :463-519 byte-identical to e11cbca4 (verified:
57|  `diff <(git show e11cbca4:... | sed -n '463,519p') <(sed -n '463,519p' ...)` -> ARM IDENTICAL).
58|- server/src/ai/AgentOrchestrator.ts + server/src/ai/draftArgDiagnostics.ts — REVERT ONLY (net
59|  fix-delta vs 4903ec61: zero hunks, see §4 D-a).
60|- app/src/event-editor/right-pane/ai/AiTabPanel.honestWall.test.tsx — D-b new case, D-c replacement
61|  (old wall-absence-only negative deleted), D-c complement, drift-pin rewrite, harness gained an
62|  attachable protocol identity (AiTabPanel.protocolEdit.test.tsx pattern; null when unattached so
63|  every other leg behaves exactly as before).
64|
65|## 3. GREEN verification (real outputs, run at tip fefe17e5)
66|
67|cwd=app  npx vitest run src/event-editor/right-pane/ai/AiTabPanel.honestWall.test.tsx
68|  Test Files  1 passed (1)   Tests  13 passed (13)
69|  (A1 true-nothing wall, A2 legit-hold + no-success-key negatives, A3 create_record/labwareReq/
70|   equipmentReq destination negatives, D-b wall-fires + changes-panel null + changes-apply null +
71|   protocol-diff null + setPreview NOT called, D-c protocol-diff + 'Accept' + empty event-graph
72|   diff div, D-c complement wall, drift pin — all green.)
73|
74|cwd=app  npx vitest run AiTabPanel
75|  Test Files  14 passed (14)   Tests  99 passed (99)
76|  (baseline 14 files/97 tests after fix-1; +2 net new legs; failing-file set unchanged = EMPTY.)
77|
78|cwd=app  npx vitest run src/event-editor/right-pane/ai/
79|  Test Files  1 failed | 46 passed (47)   Tests  1 failed | 318 passed (319)   Errors  1 error   EXIT=1
80|  sole failing file = useChatThread.deckLayout.test.tsx (pre-existing 'onDeckLayout' trunk debt;
81|  same file failed in the cycle-2 gate's sweep at e11cbca4: 1 failed | 46 passed (47), 317 -> 319
82|  tests = +2 new legs, zero new failing files, zero new errors).
83|
84|cwd=server  npx vitest run src/ai/AgentOrchestrator.equipmentE2E.test.ts src/ai/AgentOrchestrator.protocolEdit.test.ts src/ai/AgentOrchestrator.protocolEditRecovery.test.ts
85|  Test Files  3 passed (3)   Tests  15 passed (15)   (the gate's 15/15, now against the REVERTED
86|  base 7-term inline guard — the revert restores exactly the state the gate proved.)
87|
88|cwd=server  npx vitest run src/ai/shorthandChat src/ai/AgentOrchestrator.equipmentE2E src/ai/AgentOrchestrator.reconcileQuantities src/ai/AgentOrchestrator.protocolEditRecovery src/ai/AgentOrchestrator.protocolEdit src/ai/AgentOrchestrator.honestRefusal src/ai/AgentOrchestrator.draftProseSuppression src/ai/clarificationLoop src/ai/AgentOrchestrator.shorthandChat
89|  Test Files  15 passed (15)   Tests  100 passed (100)   (cycle-2 gate's 9-suite cluster, 15/15 files stays 15/15 after the revert)
90|
91|cwd=server  npx vitest run src/ai/shorthandChat.reviseReuse.test.ts src/api/handlers/AIHandlers.shorthandCancel.test.ts
92|  Test Files  2 passed (2)   Tests  11 passed (11)   (A4: D2 CLOSED work stays green; files untouched)
93|
94|cwd=server  npx tsc -p . --noEmit | wc -l  ->  0
95|
96|cwd=app  npx tsc --noEmit | sort  ->  28 error lines
97|  sorted-diff vs the fix-1 baseline (/tmp/rg1-fix1-app-tsc-baseline.raw, TSC_EXIT marker stripped,
98|  sorted): EMPTY (diff exit 0, 28 vs 28 lines identical). None names a touched file.
99|  exactOptionalPropertyTypes: no key:undefined spread introduced (test harness uses plain literals +
100|  truthiness-narrowed ternary).
101|
102|## 4. Scope / hygiene (gate deltas)
103|
104|- D-a server revert mechanical check:
105|  git -c core.fileMode=false diff 4903ec61...HEAD -- server/src/ai/AgentOrchestrator.ts server/src/ai/draftArgDiagnostics.ts | wc -l  ->  0
106|  Content check: the guard block at HEAD :3918-3926 byte-compares IDENTICAL to 4903ec61:3918-3926
107|  (diff -> "BLOCK IDENTICAL"): the 7-term inline `const emptyResult` + `if (emptyResult) {`, comment
108|  block above it reverted too (no REVISE-GHOST-1 helper mention).
109|- Fix2 delta (e11cbca4...HEAD) touches EXACTLY the allowlist:
110|  M app/.../AiTabPanel.honestWall.test.tsx
111|  M app/.../AiTabPanel.tsx            (comment-only hunk @@518)
112|  M app/.../draftEmptiness.ts
113|  M server/src/ai/AgentOrchestrator.ts   (revert only)
114|  M server/src/ai/draftArgDiagnostics.ts (revert only)
115|  Full diff 4903ec61...HEAD = 7 files: the 4 app files above + assistStream.ts (deckLayout? type,
116|  ruling-sanctioned, untouched this run) + shorthandChat.ts + AIHandlers.ts + AIHandlers.shorthandCancel.test.ts
117|  (CLOSED D2 work, byte-untouched this run). No schema/, no YAML, no file outside right-pane/ai except
118|  the two server reverts.
119|- G-g: legacy :3728 hold — `git diff 5e9c4bb1...HEAD -- server/src/ai/AgentOrchestrator.ts | grep -c "3728\|parsed.events = \[\]"` -> 0.
120|  Reagent nouns in the fix2 product diff -> NONE. YAML files in delta -> 0.
121|  Arm body :463-519 + arm order byte-unchanged (ARM IDENTICAL). No amend/rebase: a7d86a37 parent
122|  e11cbca4, fefe17e5 parent a7d86a37 (`git log --format='%h %p'`).
123|- git -c core.fileMode=false status --porcelain -> EMPTY (clean at every step).
124|- grep -rn "agentDraftProducedNothing" app/src server/src -> no hits (phantom helper fully gone;
125|  comments no longer cite it).
126|
127|## 5. Assumptions / notes for the gate
128|
129|- The D-c positive leg passes already at e11cbca4 (the arm's mappable path was never broken); its
130|  value is the DESTINATION pin the cycle-2 review demanded (protocol-diff surface + 'Accept' + empty
131|  event-graph changes div asserted explicitly), replacing the bait-2 wall-absence-only negative.
132|- The harness attaches a protocol identity via the mocked ProtocolSelectionContext (the proven
133|  AiTabPanel.protocolEdit.test.tsx pattern) — an attached-identity fixture at the real onDraftResult
134|  seam, so D-c asserts the visible surface, not an arm-guard proxy.
135|- Consequence recorded by the ruling (not a defect): server guard (7 terms) and client wall (8 terms)
136|  now intentionally differ by exactly {equipmentRequirements}; the drift pin's superset arm makes any
137|  change to either side fail a test.
138|
139|STATUS: complete
140|