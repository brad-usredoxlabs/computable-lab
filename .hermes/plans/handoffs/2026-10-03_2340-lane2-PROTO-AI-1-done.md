# Handoff — LANE 2 tick 2026-10-03T22:11 → 2026-10-03T23:40 EDT

Campaign: `ai-protocol-edit-and-router` (lane 2 task list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2`. Worker profile used: `cl-senior` (thunderbeast, shared 4-slot endpoint).

## Outcome
**PROTO-AI-1 → DONE** (verified, artifact promoted, task list updated). Only one item was ready this
tick (every other task is dependency-blocked on PROTO-AI-1..). No second item claimed.

Ready set computed: `PROTO-AI-1` (deps: none) only. No item was stuck in-progress from a killed tick;
the task list was freshly installed this tick (prior ticks' `no-work.log` entries were pre-campaign).

## Trunk catch-up (preparatory — done BEFORE any dispatch)
The lane trunk was 4 commits behind main and **lacked the protocol pane** (`protocolStepEditing.ts`,
`ProtocolStepNavPanel`, etc.) that PROTO-AI-1..13 are reconciled against. The campaign header states it
was reconciled "against repo @ main (d290a7fc tip)".
- Merged main tip into the lane trunk (merge INTO the trunk only; main / Brad's live tree untouched):
  `git -c core.fileMode=false merge --no-ff d290a7fc` → commit `1472a027`
  (pre-merge trunk `f10bd76a`, baseline main `d290a7fc`). Conflict-free (merge-tree dry-run clean).
  Precedent: lane 1 already does this ("merge main: protocol-ide intake handlers (routes.ts dependency)").
- Ran `cl-lane-sync.sh 2` (linked 2 new untracked deps; 60 already present).
- Restarted the lane-2 stack and re-verified: backend `:3093` **200** (175 schemas, 44 lint rules),
  frontend `:5193` **200**.

## Item PROTO-AI-1 — grounding spike (read-only)
- Spec (orchestrator-authored, committed): `.hermes/plans/2026-10-03_221500-PROTO-AI-1-grounding-spike.md` (`888c110e`).
- Worker: `cl-senior`, worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-1-lane2`, branch `wt/PROTO-AI-1-lane2`
  (off trunk `888c110e`). Launched background; log `~/.hermes/cl/lanes/2/logs/PROTO-AI-1-l2t2215.log`.
- Worker's unique output: `.hermes/plans/PROTO-AI-1-grounding-map.wip-l2t2215.md` (worker did NOT commit — git is orchestrator-owned).
- **Promoted by me** to canonical `.hermes/plans/PROTO-AI-1-grounding-map.md`, committed to the trunk `ca7c4458`.
- `git diff` in the worker worktree: only the untracked `.wip` doc — zero product-code changes. Confirmed.

### Orchestrator verification (I re-checked the load-bearing claims myself)
- Executed-step gate **ABSENT** from the whole-record path — `grep executionMeta` over
  `server/src/store/RecordStoreImpl.ts` + `server/src/api/handlers/RecordHandlers.ts` → zero hits. ✓
- Client gates match the cited lines (`protocolStepEditing.ts:33` kind, `:34` lifecycle-lock, `:79`
  ≥1-step, `:80-81` executed-undeletable). ✓
- `ProtocolStepEditModal.tsx:88` stepId mint = `step-` + 24 lowercase hex from `crypto.getRandomValues(12)`. ✓
- `steps` `minItems: 1` at `schema/workflow/protocol.schema.yaml:301-303`. ✓
- `setting.schema.yaml` required `:13`, `settingId` pattern `:21`, 9-value `type` enum `:35`. ✓
- `attachedProtocol` present ONLY as React state in `ProtocolTabPanel.tsx:1005`, absent from
  `server/src/ai` (EditorContext has no such field). ✓
- `{{EXECUTION_CONTEXT}}` in `server/prompts/event-graph-agent.md:97` has NO replacer in
  `systemPrompt.ts`. ✓
- Executed-delete guard `protocol-steps.ts:502-509` checks `startedAt` only; only `:836` checks a store
  result (result-discard / false-200 class confirmed). ✓

### Headline findings carried forward (from the map)
1. **PROTO-AI-5 work-list item #1:** executed-step-delete is route-enforced only on `DELETE /steps`
   (`protocol-steps.ts:502-509`) and **absent from `PUT /records/:id`** — which is exactly the path the
   human editor itself uses (`ProtocolNavPanel.tsx:122`, `ProtocolStepEditModal.tsx:95`). Today only
   client code protects it.
2. **False-200 class:** every mutation in `protocol-steps.ts` except the subgraph POST discards
   `store.update`'s result → store-level refusals (Ajv `minItems`, `CONTROLLED_RECORD_LOCKED` at
   `RecordStoreImpl.ts:661`) return HTTP 200 on the step endpoints.
3. **PROTO-AI-6 confirmed necessary:** attached-protocol steps/roles are NOT injected today; edit sites
   named (`server/src/ai/types.ts` EditorContext, `server/src/ai/systemPrompt.ts:464-470`, app context
   builder `AiTabPanel.tsx:167-258`).
4. Settings surfaces disambiguated: step `settings[]` (`setting.schema.yaml`) vs the cycling-program
   realization gate (`protocol-steps.ts:166-205,751-759`, 422 `REALIZATION_NOT_ACCEPTED`) vs equipment
   settings folded into event-graph labwares. `StepRead.settings` object-vs-array contradiction flagged
   for PROTO-AI-2 adjudication.
5. ChangesPanel minimum additive contract proposed (optional `protocolDiff` on the reviewing state;
   `EventGraphChange` untouched; the one behavioral hook is the hardcoded `onApply` at `AiTabPanel.tsx:764-767`).

## Orchestrator's own error this tick — MUST READ (lane 1 impact)
While stopping the lane-2 worker I used `pgrep -f "hermes -p cl-senior"` to find its PID. **Lane 1 runs
its workers on the same `cl-senior` profile**, so the pattern also matched lane 1's EDITOR-2 worker
(`hermes -p cl-senior -z Work item EDITOR-2 on LANE 1 ...`, PID 2191613) and my `kill` TERMed it.
- Damage: lane 1's EDITOR-2 worker was terminated (~30 min in). Its worktree
  `/mnt/vast/home/brad/git/wt/editor-2-lane1-20261004T030515` is **clean at the lane-1 trunk tip
  `34cfe597` with no commits and no uncommitted product edits** — so no committed work was lost; EDITOR-2
  will simply be re-adopted by lane 1's next tick (in-progress with no handoff).
- My own lane-2 worker had ALREADY exited cleanly on its own (its log ends
  `DONE .../PROTO-AI-1-grounding-map.wip-l2t2215.md`) — the pattern match was against lane 1, not mine.
- Corrective rule for future ticks: identify a worker by its unique prompt token / log path, or kill by
  the exact PID captured at dispatch — **never** by a profile-name pattern (profiles are shared across lanes).

## Exact git state
- Trunk `cl/integration-2` @ `ca7c4458` (working tree clean apart from untracked `node_modules`).
  - `1472a027` merge main @ d290a7fc (baseline)
  - `888c110e` spec(PROTO-AI-1) …
  - `ca7c4458` docs(PROTO-AI-1): grounding map …
- Item branch `wt/PROTO-AI-1-lane2`: **zero commits** (worker read-only; orchestrator committed the
  artifact directly to the trunk, so there was nothing to merge). Worktree being removed after handoff.
- Lane stack: `:3093` 200 / `:5193` 200.

## Recon note
`cl-scout` was NOT used: PROTO-AI-1 **is** the orientation recon (its deliverable is the cited map), so
scouting would have duplicated it at lower fidelity. The map itself is the orientation material for
PROTO-AI-2..13 — paste its sections into those specs.

## Next ready task
`PROTO-AI-2` (Declarative op envelope) and `PROTO-AI-3` (Lint DSL extension) are now unblocked
(deps `PROTO-AI-1` done). Both are disjoint (schema+server-test vs lint-DSL) → next tick may run them
2-way (the lane cap). PROTO-AI-2 should consume the map's (c) settings envelope + (a)/(b) anchors;
PROTO-AI-3 is independent of the map's domain content.

## Remaining issues / open questions
- The 7 open questions in the map (esp. #4 false-200 routing choice, #6 `read`-step settings
  contradiction, #7 startedAt vs startedAt||completedAt) should be resolved in PROTO-AI-2/5 specs.
- Lane 1 recovery: EDITOR-2 re-adoption (above).
