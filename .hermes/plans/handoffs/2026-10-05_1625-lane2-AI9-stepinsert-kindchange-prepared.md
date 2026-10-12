# Handoff — LANE 2 tick 2026-10-05T15:50 → 16:25 EDT (insert worker live; kind-change decision adopted + spec prepared)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (unchanged; docs/specs left UNCOMMITTED as usual).

## Outcome
One worker live and reconciled (not re-dispatched, not killed). The `StepUpdateOp.kind` architect decision
**landed and was adopted** (in-scope, no Brad amendment); its fix spec is **authored and held** pending the
hard sequencing gate (must land after the in-flight `step_insert` merge). No code to merge this tick.

## Reconcile (step 2)
- **AI-9 `step_insert` repair worker** `cl-senior` bash/hermes pid **`2803830`**, elapsed **~2h05m** at
  16:25; cl-senior `state.db-wal` mtime 16:24:54 = actively streaming. Worktree
  `/mnt/vast/home/brad/git/wt/PROTO-AI-9-stepinsert-lane2-l2t1420` HEAD `bb48b96e`; phase advanced this
  tick from orientation → RED tests → implementation: now `M schema/workflow/protocol-edit-op.schema.yaml`,
  `M server/src/ai/protocolEditValidation.ts`, `M server/src/schema/ProtocolEditOpSchema.test.ts`
  (editing protocolEditValidation.ts implies the `$ref` route / ENVELOPE_FILES change — to be confirmed
  from the real diff at exit). Log `logs/PROTO-AI-9-stepinsert-l2t1420.log` still 0 B past the setup block
  (worker stdout buffered until exit). **Release condition: `PROTO-AI-9 STEPINSERT EXITED code=0`.**
- **Architect decision worker** `architect` hermes pid **`2895302`** — **EXITED** (pid gone; log ends
  `ARCHITECT DECISION WRITTEN`). Decision artifact
  `~/.hermes/cl/lanes/2/decisions/PROTO-AI-9-stepupdate-kindchange-decision.md` written 15:59 (15,803 B).
  **Adopted.** Reconciled, not re-dispatched.
- No other lane-2 worker alive. Endpoint now **1/4** shared thunderbeast slots (insert worker only).
  Lane stack `:3093`/`:5193` both HTTP 200.

## Architecture routing (step 3 — recovery before idle)
Readiness gate reported **0 due/changed blockers**; ready set empty (AI-1..AI-10 done; AI-11 + AI-12
human-blocked; AI-13 dep-gated on AI-12). The actionable forward item was the architect decision, now
returned and acted on.

**RULING (adopted):** Option (i) RELAXED — extend `StepUpdateOp` to carry the new kind's payload fields,
permitted ONLY on an op that changes `kind`, required by NOTHING at envelope level; per-kind completeness
is enforced by the record PUT (field-level paths → existing clarify-then-redraft loop). **WITHIN approved
intent — NO Brad amendment.** Superseded-field disposition: drop every payload field not allowed by the
NEW kind's set (wash→mix keeps `cycles`, drops `washVolume_uL`; any→other wipes payload).

**Evidence orchestrator spot-checked against source @ trunk `bb48b96e`** (not a summary):
`protocol-edit-op.schema.yaml` `StepUpdateOp` :136-168 (`required:[op,stepId]`, `unevaluatedProperties:false`,
`kind` `$ref #/$defs/StepKind`, no payload props) CONFIRMED; `server/src/ai/protocolEditValidation.ts`
`ENVELOPE_FILES` :34-37 = exactly 2 files (copied route keeps it unchanged) CONFIRMED;
`server/prompts/event-graph-agent.md:124` lists `step_update { stepId, label?, description?, notes?, kind?,
settings? }` CONFIRMED; `app/.../protocolEditOps.ts:147` `if (op.kind !== undefined) changes.kind = op.kind`
CONFIRMED.

**PREPARED (not dispatched):** spec `.hermes/plans/2026-10-05_1600-PROTO-AI-2-stepupdate-kindchange-fix.md`
(recorded under PROTO-AI-2 vocabulary + PROTO-AI-8 applier, tracked as AI-9's in-scope repair class per the
decision §2).

**HARD SEQUENCING (binding on the next tick):** dispatch the kind-change fix ONLY AFTER the insert repair
(l2t1420) MERGES — same envelope/prompt/test files (disjoint regions). Do NOT dispatch it while pid
2803830 is alive.

## Verification I performed myself (step 6)
- Architect decision artifact read in full (203 lines) and its 4 load-bearing citations spot-checked
  against source (above).
- Fixture baseline unchanged: PRT-4iaey2 contentSha `40cb686692317b07578dae7702fe43229ec81a65`, steps 16,
  labwareRoles 4 (last confirmed 15:42 tick; no write since — trunk unchanged).
- Trunk HEAD `bb48b96e`; worker worktree HEAD `bb48b96e` (no commit yet).
- Human blockers byte-UNCHANGED: AI-11 md5 `c5fb3276249ff81ba57a4ca9dfa1b61a`,
  AI-12 §2 md5 `edce196b5acaf8005512cc587d6c2423` → not re-asked (silence never approval).

## Artifacts created this tick
- `.hermes/plans/2026-10-05_1600-PROTO-AI-2-stepupdate-kindchange-fix.md` (dispatch-ready fix spec).
- `~/.hermes/cl/lanes/2/prompts/review-PROTO-AI-9-washgate-TEMPLATE.txt` (reusable browser-gate prompt;
  fill `<TIMESTAMP>`/`<REVISION>` at dispatch).
- Task-list note appended under lock (reconcile + decision adoption + prepared dispatch).

## Next tick (prepared, not launched)
1. Observe `logs/PROTO-AI-9-stepinsert-l2t1420.log` for `PROTO-AI-9 STEPINSERT EXITED code=0`.
2. Open the REAL diff → targeted server+app suites + tsc (baselines server 33, app 47) → verify the
   envelope ACCEPTS a complete `step_insert kind:wash {label,kind,afterStepId,target,wells,cycles}` and
   REJECTS one missing `target`/`wells`/`cycles` with a field-level path → merge `--no-ff` into trunk
   (inspect trunk first; may have moved).
3. `cl-lane-stack.sh 2 restart` (YAML change; **BLOCKING → background=true**), then `cl-browser-reviewer`
   vs `:5193` using `prompts/review-PROTO-AI-9-washgate-TEMPLATE.txt` (verbatim wash flow on PRT-4iaey2,
   baseline sha `40cb6866`, probe `.changes-panel__apply-error`). VERDICT: accept → mark AI-9 done +
   promote report; fix → defect list (abs shot paths) to the SAME worker (resume l2t1420 branch).
4. **THEN** dispatch the kind-change fix `cl-senior` with the prepared spec (fresh token), and browser-gate
   per architect §3.6.

## Human blockers (unchanged; NOT re-asked)
- **PROTO-AI-11** — `decisions/PROTO-AI-11-data-approval.md` md5 `c5fb3276249ff81ba57a4ca9dfa1b61a`.
- **PROTO-AI-12 §2** — `decisions/PROTO-AI-12-prereg-approval.md` md5 `edce196b5acaf8005512cc587d6c2423`.

## assumptions: (none new this tick)
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-W8**,
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only on
  a `cl-browser-reviewer` receipt showing Accept→apply with sha-before/after on a schema-VALID proposal.
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts
- `cl/integration-2` HEAD **`bb48b96e`**. Server tsc baseline **33**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Stack `:3093`/`:5193` 200.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Pitfall (carried): a bare `git worktree add` on this NFS needs ~7–10 min for 3196 files; a mid-checkout
  kill leaves no admin dir → `git worktree prune` + `branch -D` + `rm -rf` + retry.
- Endpoint budget: **1/4** slots used (insert worker only; architect exited).