# Handoff — LANE 2 tick 2026-10-06T10:00 EDT
## (human gates ANSWERED at 08:52-08:58 — campaign unblocked; PROTO-AI-11 in fix-cycle; queue built)

Campaigns: `ai-protocol-edit-and-router` (PROTO-AI-*) + NEW `page-builder channel` (PB-CH-*,
approved by Brad 2026-10-06 per task-list header). Trunk `cl/integration-2` HEAD **`dcba2cb9`**
(docs-only; no product merge this tick). Lane stack :3093/:5193 **200**. Brad's :3001/:5174
untouched. Data repo commit `9237255` is LOCAL ONLY (not pushed).

## What changed upstream (detected this tick — NOT re-asked, actual answers present)
All three watched human artifacts changed at 08:57-08:58 EDT (architect recorded Brad's replies):
- **AI-11**: REDEFINE option 2 approved — expectedLabwareKinds data change on PRT-wlj0qm (data
  repo only). HARD GATE satisfied; quoted in spec + dispatch prompt.
- **AI-12 §2**: SIGNED AS WRITTEN; latency number set p95 router-pick <= 2000 ms appliance-2 CPU;
  no separate shadow-overhead ceiling. Remaining scope = §4 ONLY.
- **Backlog**: ADMIT ALL THREE -> new tasks PROTO-AI-14 (F1 ChangesPanel styling + F3 tab
  duplicate-key) and PROTO-AI-15 (F2 promptBudget ratchet) already exist in the list (added with
  the PB-CH wave, approved 2026-10-06). F1/F3 one task; F2 ratchet semantics verbatim in its block.
- The 08:55 idle handoff's "ready set EMPTY" is SUPERSEDED — do not trust it.

## PB-CH-8 (the due blocker) — disposition
Correctly still `blocked`: hard-gated on PB-CH-7's architect decision
(`decisions/PB-CH-7-ledger-storage.md` — file ABSENT, verified). PB-CH-7 is todo, dep PB-CH-1
(todo, no spec yet). The chain needs PB-CH-1 first; no re-ask, no new decision artifact — the
gate fires on-change. Nothing overdue.

## Done this tick (verified with real tool output)
1. **Reconcile**: zero live lane-2 workers at tick start (only this tick's orchestrator + Brad's
   interactive architect, untouched). Coder lock FREE. Coder endpoint healthy
   (`appliance-2:18080/health` 200). Trunk clean (docs tip).
2. **AI-12 §4 pre-recovery**: router serving :8900 was DOWN (conn-refused 09:20) — RELAUNCHED on
   appliance-2 with the EXACT recorded serving-notes command (llama-server b9450,
   LFM2.5-350M-QAD-Q4_0, CPU-only flags; nothing displaced — 8900 free, vision service untouched).
   `/health` ok; real completion 94 ms wall from dev host. Spec updated with Addendum B
   (sign-off quote, §4-only scope, serving-restored state, >=20-call p95 measurement duty).
3. **PROTO-AI-11 claimed + DISPATCHED + worker returned + ADVERSARIAL GATE: fix (cycle 0/2)**:
   - Spec authored with orchestrator-verified orientation:
     `.hermes/plans/2026-10-06_0930-PROTO-AI-11-expected-labware-kinds.md`.
   - cl-coder dispatched 09:35 (fleet lock held during launch; bash 699890; log
     `logs/PROTO-AI-11-l2t0935.log`; report
     `.hermes/plans/PROTO-AI-11-report.wip-l2t0935.md`). Exited code=0 ~09:44; lock auto-released
     (verified FREE, pid gone).
   - Orchestrator self-verification PASSED: full diff opened (1 file, +26/-0, additions-only,
     expectedLabwareKinds lines); all 6 distinct ids grepped present in `records/_index/records.jsonl`;
     I re-ran lint MYSELF (POST :3093/api/lint, schemaId+payload): violations [], summary 3/3
     passed, 0 errors 0 warnings. Data commit `9237255e83af20dbcfd1fc962748ec7165f0a779` (data-repo
     main, not pushed, single-file add; unrelated dirty foundry files untouched).
   - Adversarial review (`logs/review-PROTO-AI-11-20261006T0955.md`): VERDICT fix, 1 [major]
     defect — role `96-well-block` mapped to FLAT 200/350 uL plate defs while the protocol fills
     that vessel with 500-900 uL (steps 8/10/12) and step 13 text equates "deep-well block" with
     "96-Well Block" on one vessel. I VERIFIED the defect evidence myself (step labels :117-217,
     900 µL MagWash-2 line :182). Fabricated-convenience match -> violates spec CONFIRM-or-STOP.
   - **FIX RUN NOT YET DISPATCHED (budget expiry)** — next tick: cl-coder fix (see resume 1).
4. **Queue built**:
   - AI-14 spec authored `.hermes/plans/2026-10-06_1000-PROTO-AI-14-changespanel-styling-tabkeys.md`
     (orientation verified myself: 15 changes-panel__* classes + no css import; WorkspaceTabStrip.
     tsx:113 key={tab.id}; tabId.ts value-derived ids + slotSuffix precedent; OpenTabsContext
     reducer). cl-scout F3 dup-key trace RETURNED (`logs/scout-ai14-tabs-20261006T0945.log`,
     SCREENING ONLY): duplicates enter via sessionYaml.ts:87-97 + loadFromStorage
     OpenTabsContext.tsx:436-450 WITHOUT dedupe; reducer 'open' (:136-168) replaces same-id but
     appends unchecked; no per-entry uid convention exists. Worker must verify then fix at the
     true entry site.
   - AI-15 spec-composer LIVE (bash-side pid 708597, log `logs/spec-composer-AI15-l2t0940.log`,
     draft already on disk `.hermes/plans/PROTO-AI-15-spec-draft.wip-l2t0940.md`). NOT killed —
     next tick: review draft, promote to canonical spec path, link in task block.
   - Both AI-14 and AI-15 QUEUED for the single coder slot (fleet max 1 live coder).

## Ordered next actions (resume exactly here)
1. **AI-11 fix cycle 1/2** (state recorded in the AI-11 task block): dispatch cl-coder fix run —
   change ONLY `96-well-block` expectedLabwareKinds to the two deepwell_96 defs
   (`lbw-def-generic-96-well-deep-plate`, `lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1`) —
   or leave unchanged + data question; fixup/add commit in data repo; unique report
   `.hermes/plans/PROTO-AI-11-report.wip-l2t0935-fix1.md`; re-run adversarial gate with unique
   `-fix1` review path. On accept: promote report, mark done, handoff. NOTE: acceptance's browser
   clause (rail shows warnings cleared) — decide at accept whether a bounded :5193 receipt is
   required or the lint-green + prior rail receipts suffice; if required, cl-browser-reviewer
   (single vision slot — AI-14's gate will need it later; serialize).
2. Review AI-15 composer draft -> promote + link; dispatch coder for AI-11-fix1 FIRST (lock),
   then AI-14 (UI -> browser gate), then AI-15.
3. AI-12 §4 dispatchable now (serving restored): next coder after queue drains. Spec Addendum B
   carries every duty incl. the >=20-call p95 measurement and kill-switch reuse.
4. PB-CH-1 is todo with no spec: commission scout + author spec next tick (campaign wave 1 head).
5. Do NOT re-ask the three human questions — all ANSWERED (baseline md5s now: AI-11 f86d9e33,
   AI-12 615cfa9a, backlog ff9d2144).

## Verification performed myself (real tool output)
- md5sum of the 3 watch files (changed vs old baselines -> answers present; Answer sections
  re-read: explicit dispositions, not placeholders).
- readiness script first attempt timed out under the lock (rc=124, 60 s wrapper); the manual
  reconciliation above covers what the cheap gate reports (PB-CH-8 on-change, decision file
  absent -> not due).
- :3093/api/lint re-run on the CURRENT file (post-commit): 0/0, 3/3 passed (kernel transcript
  above session; summary dict printed).
- `git -c core.fileMode=false show 9237255` full diff + 6x index greps + step-label greps.
- appliance-2 `ss -tln` before relaunch (8900 free; :18080 coder, :11434 absent — the old vision
  port is NOT listening, noted: the vision/Qwen service on 11434 was ALREADY down before this
  tick; not lane-2's process, not restarted per "never model services" — see assumptions).
- `curl :8900/health` + real completion 94 ms (post-relaunch).
- `cl-lane-stack.sh 2 status` -> :3093 200 / :5193 200.

## Dispatched this tick
- cl-coder PROTO-AI-11 (exited, gate=fix) · cl-adversarial-reviewer AI-11 (exited) ·
  cl-scout AI-14 F3 trace (exited) · cl-spec-composer AI-15 (STILL LIVE pid 708597, draft on
  disk — left running, do not duplicate).

## assumptions:
- NEW **AS-PROTO-AI-11-LBW-MATCH-REVIEW**: 96-well-block mapping under fix; the remaining 7
  mappings accepted after adversarial + orchestrator evidence review (volumes/text cross-check).
  reversible true; evidence_debt false; cleanup: fix1 diff re-review. Owner: orchestrator.
- NEW **AS-PROTO-AI-11-BROWSER-CLAUSE-DEFERRED**: acceptance's rail-receipt browser clause
  deferred to accept-time decision (lint-green proven by orchestrator curl; rail structure
  unchanged by a hint-array addition). reversible true; evidence_debt false; cleanup: decide at
  AI-11 accept. Owner: orchestrator.
- NEW **AS-LANE2-11434-VISION-SERVICE-ALREADY-DOWN**: appliance-2 :11434 (Qwen vision) was not
  listening at pre-relaunch `ss -tln` (09:40); serving-notes assumed it running. NOT restarted
  (standing rule: never touch model services not ours); D6 non-displacement held trivially.
  reversible true; evidence_debt false; cleanup: report to Brad if the vision slot is needed
  (cl-scout uses computable:8080, unaffected; only appliance-2 vision consumers care).
  Owner: orchestrator.
- Standing (carried, reversible, evidence_debt false): **AS-PROTO-AI-2-C1-ANCHOR**,
  **AS-PROTO-AI-9-C5-ROLENAME**, **AS-PROTO-AI-9-LANE2CONFIG-RECREATE**, **AS-PROTO-AI-9-W8**,
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab...`); acceptance-relevant to PROTO-AI-13 -> disclose with its digest. **STILL OPEN**
  (§4 running with it is expected; disclosure due at AI-13). `AS-PROTO-AI-9-W7` remains CLEARED.

## Baseline facts
- `cl/integration-2` HEAD **`dcba2cb9`**. tsc baselines on this worktree: server 33 / app 34.
- Fixture PRT-4iaey2 contentSha `30a353a88254c4f9b1ddb2af2432d662c7cc052d` (re-read before use).
- PRT-wlj0qm lint is now GREEN (0/0) at data commit 9237255 (+ pending fix1 for 96-well-block —
  re-run lint after fix1).
- PromptBudget RED at trunk (44,934 vs 12,000) is the KNOWN baseline failure until AI-15 lands —
  do not count it as a regression.
- Pitfalls (carried): lane-stack restart is BLOCKING (background=true; aborts if lane2-config.yaml
  missing -> cp -L recreate, mode 600); readiness script at profiles/orchestrator/scripts/; bare
  git worktree add on NFS ~4-10 min -> background; `hermes -z` one-shots: no notify support, poll
  the log; lint route is POST /api/lint (bare /lint 404s on :3093); data-repo dirty foundry
  artifacts are Brad's — never git add -A there.
