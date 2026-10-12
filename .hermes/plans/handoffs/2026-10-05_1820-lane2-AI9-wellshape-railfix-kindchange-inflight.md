# Handoff — LANE 2 tick 2026-10-05T18:10 → 18:22 EDT
## (AI-9 gate verdict adopted; wells-gap architect decision adopted + blocker cleared; two in-scope fixes
##  in flight: wells-shape prompt fix + rail-refresh wiring, alongside the live kind-change repair)

Campaign: `ai-protocol-edit-and-router` (lane-2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`0e798b13`** (unchanged this tick; docs/specs left UNCOMMITTED as usual).
Lane stack `:3093`/`:5193` both **200**. Lane AI profile `qwen3.8-thunderbeast`. No Brad stack touched.

## Outcome
1. **AI-9 UI gate EXITED** → `VERDICT: fix`. Its **D1** is exactly the routed architecture blocker (the
   wells-SHAPE gap); its evidence is adopted. Adopted partial passes: criterion 2 (propose-never-write),
   criterion 4 (Reject → sha unchanged), criterion 5 (labware accept → LABWARE +1, sha advanced EXACTLY
   once, no 422, input ready). Criterion 1 (and the step-accept part of 3) not reachable until D1 is fixed.
2. **The architect decision (wells-gap) is WRITTEN and ADOPTED** — Option (a), a PROMPT/DATA fix in
   `server/prompts/event-graph-agent.md` only, **within approved intent (no Brad amendment)**. AI-9 blocker
   fields CLEARED; status blocked → in-progress.
3. **D2 root-caused by the orchestrator against source** as an AI-9-class in-scope wiring gap and bundled
   into the fix.
4. **DISPATCHED cl-senior (l2t1815)** covering both in-scope fixes (Part 1 prompt DATA + Part 2 one-line
   `cl:records-changed` dispatch). **The `StepUpdateOp.kind` kind-change repair (l2t1730) is STILL LIVE.**

## Reconcile (step 2)
- **AI-9 UI gate** (`cl-browser-reviewer` bash 3154185 / hermes 3154242 from last tick) — **EXITED**;
  `report.md` written 18:05 (8560 B), `trail.json`, `shots/`, `flowAC/flowB/flowB2/flowC2/flowA-attempt5/railprobe`.
  Adopted, not re-dispatched.
- **Architect (wells-gap)** bash 3224217 — **EXITED**; decision artifact written 18:06
  (`decisions/PROTO-AI-9-stepinsert-wells-gap-decision.md`, 15063 B). Adopted.
- **Kind-change repair (l2t1730)** cl-senior hermes pid **3201468** — **STILL LIVE** (~41 min at 18:19;
  `cl-senior` state.db-wal mtime advancing = actively streaming). Worktree
  `wt/PROTO-AI-2-stepupdate-lane2-l2t1730` HEAD `0e798b13`, git status CLEAN (orientation/RED phase;
  precedents 1 h–2 h 50 m). Log `logs/PROTO-AI-2-stepupdate-l2t1730.log` 0 B (buffered until exit).
  NOT killed, NOT re-dispatched.

## The two adopted artifacts (read in full this tick)
- **Gate** `receipts/PROTO-AI-9/2026-10-05_1712/report.md`: D1 (blocks gate) — the verbatim wash ask
  produced NO proposal in **6** bounded turns; each draft rejected by the envelope on `wells`
  (missing / wrong SHAPE — `Expected type: object`), 2 turns also used invalid op tags
  (`insert_after`/`delete`); labware_add drafts from the same model+surface succeed → serving healthy.
  D2 [medium] — after an accepted labware_add the left rail still shows `Labware4` until a page reload.
  D3 [low/cosmetic] — duplicate-role proposal passes envelope, fails at Accept (correct zero-write), and
  the apply-error line renders in plain text. Pre-existing: a React duplicate-key console warning in
  `WorkspaceTabStrip`.
- **Architect decision**: Option (a) — teach the `WellSelector` OBJECT shape at BLOCK level in the
  `protocol_edit` block, a `{kind:"all"}` default for a wells-less ask, an op-tag restatement, and a
  disambiguation line; PRESERVE the ASK rule (`:132`, no numeric default — `cycles` must be asked).
  §3.2 forbids any code change. §5 lists what must not change. Explicitly rejected: (b) a server
  validate-and-CLARIFY/redraft loop, (c) declared model limitation. Source-verified by the architect (§0).

## Orchestrator-rooted D2 (verified against source @0e798b13)
`app/src/run/RunProtocolStepsLoader.tsx:119-123` refills the rail (`setResources`/`setSteps`/bindings) on
the window event **`cl:records-changed`**. Every HUMAN protocol-write path fires it
(`ProtocolStepEditModal.tsx:99`, `ProtocolTabPanel.tsx:1394/1417/1921/1938`, `ProtocolNavPanel.tsx:130/144/164/193`,
`ProtocolSelector.tsx:93`, …). The AI accept path does NOT: `AiTabPanel.tsx` `handleProtocolAccept`
(`:607-633`, `applyProtocolEdit` at `:617`) — so "Accept → rail renumbers" fails on the badge until reload.
In-scope: it is AI-9's own acceptance criterion, and the fix is one line in AI-9's file.

## Dispatched (step 4/5) — token l2t1815
Spec `.hermes/plans/2026-10-05_1815-PROTO-AI-9-wells-shape-and-rail-refresh-fix.md`; prompt
`prompts/fix-PROTO-AI-9-wellsfix-l2t1815.txt`; runner `.orch-run-wellsfix-l2t1815.sh`; worktree
`wt/PROTO-AI-9-wellsfix-lane2-l2t1815` off trunk `0e798b13` (prep done 18:18:14: HEAD `0e798b13`, branch
correct, node_modules symlinked, **linked=124 skipped=0 missing=0**); log
`logs/PROTO-AI-9-wellsfix-l2t1815.log` (0 B, buffered); report
`.hermes/plans/PROTO-AI-9-wellsfix-report.wip-l2t1815.md`; cl-senior hermes pid **3273023**.
Release condition: **`PROTO-AI-9 WELLSFIX EXITED code=0`**.
**SAME-FILE HAZARD (managed):** l2t1730 edits line `:124` of `server/prompts/event-graph-agent.md`;
l2t1815 Part 1 adds block-level lines and is instructed NOT to touch `:124`/`:125`. The orchestrator merges
both and resolves any conflict within approved scope.
Endpoint budget: **2/2** lane-2 senior slots (l2t1730 + l2t1815); no lane-1 senior live.

## Verification I performed myself
- Read the full gate `report.md` and the full architect decision; confirmed the decision is in-scope.
- Root-caused D2 by reading `RunProtocolStepsLoader.tsx` and grepping every `cl:records-changed`
  dispatcher, then reading `AiTabPanel.tsx:607-633` and `protocolEditOps.ts` `applyProtocolEdit`.
- Confirmed worktree prep (HEAD/branch/symlinks/exclude count) and both worker pids alive.
- Trunk HEAD, both stacks, human-blocker md5s (unchanged). Nothing merged → no post-merge re-verify due.

## Human blockers (unchanged; NOT re-asked — silence is never approval)
- **PROTO-AI-11** — `decisions/PROTO-AI-11-data-approval.md` md5 `c5fb3276249ff81ba57a4ca9dfa1b61a` (mtime Oct 4 16:56).
- **PROTO-AI-12 §2** — `decisions/PROTO-AI-12-prereg-approval.md` md5 `edce196b5acaf8005512cc587d6c2423` (mtime Oct 4 16:54).
Both byte-UNCHANGED (re-measured this tick).

## assumptions:
- No new consequential assumptions this tick. The l2t1815 worktree prep used the established lane pattern
  (runner `.orch-run-*`, node_modules symlinks + lane-exclude sync from Brad's tree) — nothing was supplied
  that a source did not provide. Part 2's fix mirrors an existing, cited convention (`cl:records-changed`);
  Part 1 is the architect's own source-verified §3.1 change, no value invented.
- Method note (not an assumption): orientation recon for the spec was done by **bounded direct inspection**
  of the source (each anchor file:line cited in the spec), not `cl-scout`, because the architect decision
  already contains source-verified anchors and the scout endpoint is slow relative to this tick's budget.
  Every load-bearing anchor was read by the orchestrator.
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-LANE2CONFIG-RECREATE**,
  **AS-PROTO-AI-9-W8**, **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 `3d10b6ab…`);
  acceptance-relevant to PROTO-AI-13 → disclose with its digest. **STILL OPEN.**
- `AS-PROTO-AI-9-W7` remains CLEARED (2026-10-05T17:55).

## Baseline facts
- `cl/integration-2` HEAD **`0e798b13`**. tsc pristine baselines on this worktree: server **44** / app **40**
  (re-measure at reconcile time).
- Fixture `PRT-4iaey2` (lane test data) is now **`contentSha 2dc60f71…`, steps 16, labwareRoles 5,
  instrumentRoles 3`** — mutated ONCE by this gate's `flowC2` labware accept (recorded baseline
  `40cb6866…`/4 is STALE). ALL CL records are Brad-declared TEST DATA; **a fresh gate must re-read the sha
  first.**
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING → run with `background=true`; it ABORTS if
  `lane2-config.yaml` is missing (recreate with `cp -L …/cl-integration-2/config.yaml`, mode 600); `status` safe.
- Pitfall (carried): a bare `git worktree add` on this NFS takes ~4–5 min for ~3197 files → background it.

## NEXT TICK (resume exactly here)
1. Reconcile **l2t1815** (`PROTO-AI-9 WELLSFIX EXITED code=0`) and **l2t1730**
   (`PROTO-AI-2 STEPUPDATE EXITED code=0`). For each: open the REAL diff → targeted suites + tsc
   (server 44 / app 40) → merge `--no-ff` into trunk (inspect first; resolve the
   `event-graph-agent.md` overlap) → `cl-lane-stack.sh 2 restart` (background=true).
2. Architect §4 for AI-9: pre-check ×3 (verbatim wash ask, `surface: workspace.deck`, fresh attached block)
   → each must yield `success:True` with a WellSelector-OBJECT `wells` (+ a `step_delete`); record the
   fresh `PRT-4iaey2` sha baseline first (now `2dc60f71…`). Then the `cl-browser-reviewer` wash gate on
   :5193 (criteria verbatim; probes `.changes-panel__apply-error`; D2 → rail badge refreshes WITHOUT reload)
   → `VERDICT: accept` → mark **AI-9 done** + promote reports.
3. If the gate keeps failing after 3 post-fix pre-checks on shape compliance, do NOT fall to option (c) —
   return to the architect for the §1 ordered mitigation (attached-block payload enrichment first).
