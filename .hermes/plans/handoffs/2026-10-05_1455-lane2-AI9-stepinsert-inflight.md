# Handoff — LANE 2 tick 2026-10-05T14:50 → 14:55 EDT (observer tick: repair worker live; no new dispatch)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (unchanged; docs/specs left UNCOMMITTED as usual).

## Outcome
The AI-9 `step_insert` payload-contract repair worker (`l2t1420`, dispatched last tick) is **LIVE and
progressing** — reconciled, **not re-dispatched, not killed**. No other lane-2 work is dispatchable
(ready set empty; the two human blockers are unchanged). This tick added one independent verification
plus one durable tracking entry; nothing to merge.

## Reconcile (step 2)
- AI-9 repair worker `cl-senior` bash/hermes pid **`2803830`**, elapsed **~32 min**; cl-senior
  `state.db-wal` mtime **14:51:20 advancing** = actively streaming. Worktree
  `/mnt/vast/home/brad/git/wt/PROTO-AI-9-stepinsert-lane2-l2t1420` HEAD **`bb48b96e`**, `git status`
  clean (only the node_modules symlinks untracked) → orientation/RED phase (AI-9 precedents: ~1h to
  ~2h50m). Log `~/.hermes/cl/lanes/2/logs/PROTO-AI-9-stepinsert-l2t1420.log` holds only the 14:26
  setup block (worker stdout buffered until exit). **Release condition: `PROTO-AI-9 STEPINSERT
  EXITED code=0`.**
- No other lane-2 worker alive. No lane-1 senior/browser live; endpoint **1/4** shared slots. Lane
  stack `:3093`/`:5193` both HTTP 200. Trunk clean at `bb48b96e`.

## Verification I performed myself (step 6)
1. **Gate fixture baseline re-confirmed** (independent of the handoff): `GET
   http://localhost:3093/api/records/PRT-4iaey2` → `meta.contentSha`
   `40cb686692317b07578dae7702fe43229ec81a65`, `steps` 16, `roles.labwareRoles` 4. This is the
   sha-before the verbatim wash-flow Accept must advance ONCE (baseline for the next browser gate).
2. **Confirmed the architect-flagged `StepUpdateOp.kind` gap against SOURCE** (see Tracking item).

## Recovery before idle (step 3)
- Readiness gate: **0 due/changed blockers**. Human blockers **unchanged** (see below) → **not
  re-asked**; silence is never approval.
- Ready set empty: AI-1..AI-10 done; AI-11 `blocked` (human); AI-12 `blocked` (human, §2 unsigned);
  AI-13 `todo` dep-gated on AI-12. AI-9 the sole in-progress item, with its repair live.
- No new work launched (correct: launching would duplicate a live item or invent scope).

## Tracking item recorded (durable, not a task)
Appended a **TRACKING ITEM** note to the AI-9 block in the task list: the architect-flagged
`StepUpdateOp.kind` kind-change gap is **REAL and the same contract class** as the insert gap.
Evidence (source-verified by me): `protocol-edit-op.schema.yaml` `StepUpdateOp` (:136-168) accepts
`kind` (`#/$defs/StepKind`) with `unevaluatedProperties:false` and **no per-kind payload / no
cross-field rule**; the applier `protocolStepEditing`-mirroring `protocolEditOps.ts:147` does
`if (op.kind !== undefined) changes.kind = op.kind` with **no payload added**. So
`step_update {stepId, kind:<non-other>}` on a step lacking that kind's required payload is
envelope-VALID but UNAPPLIABLE (record PUT 422, zero write). **Out of the l2t1420 repair's scope**
(architect decision §4: separate tracking item; "an existing step edit must never regress"). Needs its
**own small architect decision** (payload-on-kind-change rule vs apply-time gate) before it can become
a campaign task — do NOT invent the scope unilaterally. **Not dispatched this tick** (AI-9 is the
priority; a decision request would be a live process to reconcile). Candidate to open once AI-9 closes.

## Next tick (prepared, not launched)
1. Observe `logs/PROTO-AI-9-stepinsert-l2t1420.log` for `PROTO-AI-9 STEPINSERT EXITED code=0`.
2. Open the REAL diff → targeted server+app suites + tsc (baselines server 33, app 47) → verify the
   envelope **accepts** a complete `step_insert kind:wash {label,kind,afterStepId,target,wells,cycles}`
   and **rejects** one missing `target`/`wells`/`cycles` with a field-level path → merge `--no-ff`
   into trunk (inspect trunk first; may have moved).
3. `cl-lane-stack.sh 2 restart` (YAML change; **BLOCKING → `background=true`**), then re-run
   `cl-browser-reviewer` vs `:5193` with the verbatim wash flow ("add a wash step after step 3 and
   delete the redundant centrifuge step" on PRT-4iaey2), criteria = spec §Acceptance, plan probes
   `.changes-panel__apply-error` after Accept, **baseline sha `40cb6866`** (labwareRoles=4).
   VERDICT: accept → mark AI-9 done + promote report; fix → defect list (abs shot paths) to the SAME
   worker (resume the l2t1420 branch).
4. Optional (post-AI-9): open the StepUpdateOp.kind tracking item's architect decision.

## Human blockers (unchanged; NOT re-asked)
- **PROTO-AI-11** — `decisions/PROTO-AI-11-data-approval.md` md5 `c5fb3276249ff81ba57a4ca9dfa1b61a`.
- **PROTO-AI-12 §2** — `decisions/PROTO-AI-12-prereg-approval.md` md5 `edce196b5acaf8005512cc587d6c2423`.

## assumptions: (none new this tick)
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-W8**,
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only
  on a `cl-browser-reviewer` receipt showing Accept→apply with sha-before/after on a schema-VALID
  proposal.
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts
- `cl/integration-2` HEAD **`bb48b96e`**. Server tsc baseline **33**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Stack `:3093`/`:5193` 200.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Pitfall (carried): a bare `git worktree add` on this NFS needs ~7–10 min for 3196 files; a mid-checkout
  kill leaves no admin dir → `git worktree prune` + `branch -D` + `rm -rf` + retry.
