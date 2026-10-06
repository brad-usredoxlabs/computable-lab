# Handoff — LANE 2 tick 2026-10-05T18:30 → 18:52 EDT
## (wellsfix l2t1815 ACCEPTED + MERGED → trunk a89719df; architect §4 pre-checks ×3 GREEN;
##  AI-9 wash gate DISPATCHED; l2t1730 kind-change repair still live — merge deferred)

Campaign: `ai-protocol-edit-and-router` (lane-2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`a89719df`** (was `0e798b13`; +1 merge this tick).
Lane stack `:3093`/`:5193` both **200**. Lane AI profile `qwen3.8-thunderbeast`. No Brad stack touched.

## Outcome
1. **l2t1815 (wells-shape prompt fix + rail refresh) ACCEPTED and MERGED.** Worker exited code=0 (~21 min).
   Commits `05cc4024` (fix) + `5f99fd72` (report); base `0e798b13` == trunk pre-merge (three-dot clean).
   Merged `--no-ff` **`0e798b13` → `a89719df`** (clean, 4 files / +133).
2. **Architect §4 pre-check ×3 GREEN** — the merged prompt fix makes the verbatim wash ask schema-VALID.
3. **AI-9 UI gate (criterion 1–5 + D2) FRESH DISPATCHED** on candidate `a89719df`.
4. **l2t1730 (StepUpdateOp.kind kind-change repair) STILL LIVE**; its merge is deliberately deferred until
   the gate returns (it changes the same prompt file + YAML → a mid-gate restart would corrupt the gate).

## Reconcile (step 2)
- **l2t1815 (wellsfix)** cl-senior — **EXITED code=0**. Adopted.
  Log `logs/PROTO-AI-9-wellsfix-l2t1815.log` ("PROTO-AI-9 WELLSFIX EXITED code=0" ×2).
  Report `.hermes/plans/PROTO-AI-9-wellsfix-report.wip-l2t1815.md` (7337 B) in the worker worktree.
- **l2t1730 (kind-change)** cl-senior hermes pid **3201468** — **STILL LIVE** (~1 h 13 m at 18:50;
  `cl-senior` state.db-wal mtime advancing = actively streaming; 54 msgs). Worktree
  `wt/PROTO-AI-2-stepupdate-lane2-l2t1730` HEAD `0e798b13`, git status **CLEAN** (orientation/baseline
  phase; precedents 1 h–2 h 50 m). Log `logs/PROTO-AI-2-stepupdate-l2t1730.log` 0 B (buffered until exit).
  NOT killed, NOT re-dispatched. Release: **`PROTO-AI-2 STEPUPDATE EXITED code=0`**.

## Verification I performed myself (step 6)
Read the REAL diff `0e798b13..5f99fd72` (4 files, +133/-0):
- `server/prompts/event-graph-agent.md` **+9** — PURE INSERTION inside the `protocol_edit` block (after
  the `equipment_*` line, before `Hard rules:`): the four WellSelector OBJECT forms with inline examples,
  the bare-array/`null` REJECTION line, the draft-path disambiguation, the `{kind:"all"}` default, the
  op-tag restatement. No code file touched (architect §3.2 respected).
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` **+7** — `handleProtocolAccept` SUCCESS branch now
  `window.dispatchEvent(new CustomEvent('cl:records-changed'))`; comment cites `ProtocolStepEditModal.tsx:99`.
- `app/.../ai/AiTabPanel.protocolEdit.test.tsx` **+42** — 2 RED-first tests (success dispatches once;
  stale-sha failure dispatches NOTHING).
- Ran the app suite myself: **`AiTabPanel.protocolEdit.test.tsx` 9/9 PASS** (incl. both new tests).
- **tsc server 44 / app 40** == pristine baselines → ZERO new; owned-file error grep clean.
- After merge + restart: served `:5193` `AiTabPanel.tsx` carries `cl:records-changed` (count 1).
- **PRE-CHECK ×3** (`precheck-assist-turn.py`, `POST /api/ai/assist/stream`, surface `workspace.deck`,
  fixture `PRT-4iaey2`, verbatim ask) → ALL THREE emitted a schema-VALID proposal
  `{step_insert afterStepId=step-3 kind=wash target:{labwareRole:sterile-microcentrifuge-tube}
  wells:{kind:"all"} cycles:3 ; step_delete step-6}` (`done.keys = [notes, protocolEdit, success]`).
  Pre-fix the same ask was rejected on `wells` (null/array) → the prompt fix works. Logs
  `logs/PROTO-AI-9-precheck-wellsfix-20261005T1843-r{1,2,3}.log`. Record sha **UNCHANGED** `2dc60f71…`.

## Dispatched — AI-9 UI gate (criterion 4), token n/a
`cl-browser-reviewer` hermes pid **3333195**; log `logs/PROTO-AI-9-washgate-20261005T1848.log`;
receipts `receipts/PROTO-AI-9/2026-10-05_1848/`; prompt `prompts/review-PROTO-AI-9-washgate-20261005T1848.txt`;
**candidateRevision `a89719df`**. Criteria: wash ask → diff shows exactly the wash insert + step-6 delete;
sha unchanged pre-accept; Accept → rail renumbers, sha advances EXACTLY ONCE, input ready, NO 422;
Reject → sha unchanged; labware request → LABWARE +1; **+ D2** rail badge refreshes WITHOUT reload.
Release condition: **`VERDICT: accept|fix|BLOCKED`** in the receipts `report.md`.

## Ordered next actions (resume exactly here)
1. Read `receipts/PROTO-AI-9/2026-10-05_1848/report.md` + `trail.json` + PNGs.
   - **accept** → promote report to `.hermes/plans/PROTO-AI-9-wellsfix-report.md` (and the canonical
     `PROTO-AI-9-report.md` if the gate renews it), mark **AI-9 done**, handoff.
   - **fix** → send the defect list (absolute screenshot paths) back to cl-senior resuming the `a89719df`
     wellsfix work; re-review.
   - **BLOCKED (model flake)** → re-dispatch the gate fresh (the prompt forwards the retry guidance).
2. Reconcile **l2t1730** (`PROTO-AI-2 STEPUPDATE EXITED code=0`) → open the REAL diff → targeted
   `ProtocolEditOpSchema.test.ts` + app `protocolEditOps.test.ts` + tsc (server 44 / app 40) → merge `--no-ff`
   into trunk (**inspect first; resolve the `server/prompts/event-graph-agent.md` overlap** — l2t1730 edits
   `:124`, the wellsfix insertion is at `:127+`, disjoint lines) → `cl-lane-stack.sh 2 restart` (background=true)
   → cl-browser-reviewer kind-change gate → accept.

## Human blockers (unchanged; NOT re-asked — silence is never approval)
- **PROTO-AI-11** — `decisions/PROTO-AI-11-data-approval.md` md5 `c5fb3276249ff81ba57a4ca9dfa1b61a`.
- **PROTO-AI-12 §2** — `decisions/PROTO-AI-12-prereg-approval.md` md5 `edce196b5acaf8005512cc587d6c2423`.
Both byte-UNCHANGED (re-measured this tick).

## assumptions:
- No new consequential assumptions this tick. The wellsfix worker's changes mirror a cited, existing
  convention (`cl:records-changed`) and the architect's own source-verified §3.1 prompt DATA; nothing was
  supplied that a source did not provide. The gate prompt corrected the STALE fixture baseline
  (`40cb6866…`/labwareRoles 4 → the live `2dc60f71…`/5) using the orchestrator's own re-read of the record.
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-LANE2CONFIG-RECREATE**,
  **AS-PROTO-AI-9-W8**, **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 `3d10b6ab…`);
  acceptance-relevant to PROTO-AI-13 → disclose with its digest. **STILL OPEN.**
- `AS-PROTO-AI-9-W7` remains CLEARED (2026-10-05T17:55).

## Baseline facts
- `cl/integration-2` HEAD **`a89719df`**. tsc pristine baselines on this worktree: server **44** / app **40**.
- Fixture `PRT-4iaey2` (lane test data): **`contentSha 2dc60f715e57a972e0a46d002ddd93d78e54c67b`, steps 16,
  labwareRoles 5, instrumentRoles 3** (mutated ONCE by the 17:12 gate's `flowC2` labware accept). ALL CL
  records are Brad-declared TEST DATA; **a fresh gate must re-read the sha first.**
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING → run with `background=true`; it ABORTS if
  `lane2-config.yaml` is missing (recreate with `cp -L …/cl-integration-2/config.yaml`, mode 600); `status` safe.
- Pitfall (carried): a bare `git worktree add` on this NFS takes ~4–5 min for ~3197 files → background it.
- Pitfall (carried): prompt `.md` changes need a stack restart (tsx --watch does not watch them) — done this tick.
