# Handoff — LANE 2 tick 2026-10-05T16:30 → 17:12 EDT (step_insert payload repair MERGED; UI gate re-dispatched; stack recovered)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`0e798b13`** (was `bb48b96e`; docs/specs left UNCOMMITTED as usual).

## Outcome
The in-flight AI-9 `step_insert` payload repair (l2t1420) was **reconciled, independently verified, and MERGED**.
Its UI acceptance gate (criterion 4) is **re-dispatched and IN FLIGHT** as of 17:12. In the course of merging I
**recovered the lane-2 dev stack** (it went down on a missing `lane2-config.yaml` + a transient data-repo
`index.lock`). No Brad stack touched. The kind-change fix (prepared last tick) is now **unblocked** (its
sequencing gate — "after the insert merge" — is satisfied).

## Reconcile (step 2)
- **AI-9 `step_insert` repair worker** `cl-senior` bash/hermes pid **`2803830`** — **EXITED code=0** at ~16:59
  (ran ~2h33m). Log ends `PROTO-AI-9 STEPINSERT EXITED code=0`. Commits **`66706847`** (fix) + **`17d7a12a`** (report);
  base `bb48b96e` == trunk pre-merge (three-dot clean). Reconciled, not re-dispatched.
- **Architect kind-change decision** — EXITED last tick; decision `decisions/PROTO-AI-9-stepupdate-kindchange-decision.md`
  ADOPTED; fix spec prepared (`2026-10-05_1600-PROTO-AI-2-stepupdate-kindchange-fix.md`). Not re-dispatched.
- No other lane-2 worker alive. Endpoint **1/4** shared thunderbeast slots (the browser reviewer uses appliance-2, not
  thunderbeast). Lane stack `:3093`/`:5193` both 200 (after recovery).

## Verification I performed myself (step 6) — NOT the worker's summary
- **Real diff opened** (`git diff bb48b96e..66706847`): 8 code files +697/-13 (see task-list note for the per-file map).
  Confirmed: closed op object retained (`unevaluatedProperties:false`), per-kind `allOf` if/then, role slots `$ref RoleId`,
  WellSelector/Expr copied verbatim with provenance comments, `ENVELOPE_FILES` gained the two datatype leaves, the applier
  copies declared payload fields with **explicit picks (never a spread)** so op/anchor keys cannot leak, and the two fixture-test
  edits (recovery + coerce tests) only **complete** the wash payload — assertions not weakened.
- **Targeted tests** (worktree): server 5 files / **84 PASS**; app 3 files / **39 PASS**.
- **Typecheck**: server **44 == pristine 44**, app **40 == pristine 40** → **zero new errors**.
- **Merge**: inspected trunk (clean, HEAD `bb48b96e`), merged `--no-ff` → **`bb48b96e` → `0e798b13`** (clean, 9 files).
- Canonical report promoted `.hermes/plans/PROTO-AI-9-stepinsert-report.md`.

## Lane stack recovery (environment; lane-local)
My merge triggered the lane backend's `tsx --watch` reload, which crashed on a transient
`/home/brad/.computable-lab-lane2/worktrees/main/.git/index.lock`; the follow-on
`cl-lane-stack.sh 2 restart` then **stopped** the stack and **aborted** (missing
`/home/brad/.hermes/cl/lanes/2/lane2-config.yaml`). Recovered with the script's own documented fix:
`cp -L .../cl-integration-2/config.yaml lane2-config.yaml` (mode 600; carries `activeProfile: qwen3.8-thunderbeast`)
→ `stop` → `start` (background). Both `:3093` and `:5193` return 200. **No Brad stack touched** (`:3001`/`:5174` untouched).
Recorded as `AS-PROTO-AI-9-LANE2CONFIG-RECREATE`.

## UI gate (step 7) — IN FLIGHT
`cl-browser-reviewer` bash pid **`3154185`** / hermes python **`3154242`**; log
`logs/PROTO-AI-9-washgate-20261005T1712.log`; receipts `receipts/PROTO-AI-9/2026-10-05_1712/`;
candidate revision **`0e798b13`**; verbatim wash flow on PRT-4iaey2 (baseline sha `40cb6866`), probes
`.changes-panel__apply-error`. Do NOT re-dispatch while alive. STATUS stays **in-progress** until `VERDICT: accept`.

## Next tick (prepared, not launched)
1. Read `receipts/PROTO-AI-9/2026-10-05_1712/report.md` → `accept` ? promote report + mark AI-9 done + handoff :
   `fix` ? defect list (absolute screenshot paths) back to cl-senior (resume `66706847`) and re-review :
   `BLOCKED` (serving flake) ? retry the gate fresh.
2. **THEN** dispatch the kind-change fix `cl-senior` with the prepared spec (fresh token) —
   sequencing gate (after the insert merge) is now satisfied.

## Human blockers (unchanged; NOT re-asked — silence is never approval)
- **PROTO-AI-11** — `decisions/PROTO-AI-11-data-approval.md` md5 `c5fb3276249ff81ba57a4ca9dfa1b61a`.
- **PROTO-AI-12 §2** — `decisions/PROTO-AI-12-prereg-approval.md` md5 `edce196b5acaf8005512cc587d6c2423`.

## assumptions:
- **AS-PROTO-AI-9-LANE2CONFIG-RECREATE** (new, reversible, `evidence_debt: false`):
  the lane-2 stack config `/home/brad/.hermes/cl/lanes/2/lane2-config.yaml` was recreated by copying
  `/mnt/vast/home/brad/git/cl-integration-2/config.yaml` (dereferenced; == Brad's live config), mode 600, because the
  original lane file was missing and the stack could not start. It carries `activeProfile: qwen3.8-thunderbeast`, which
  is the profile the gate requires. Does not touch Brad's stack or any acceptance claim. Cleanup: none needed unless a
  lane-specific config override is later required.
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-W8**, **AS-PROTO-AI-9-SURFACE-MOUNTED**,
  **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**, **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only on a
  `cl-browser-reviewer` receipt showing Accept→apply with sha-before/after on a schema-VALID proposal (this tick's
  in-flight gate is exactly that).
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 `3d10b6ab…`);
  acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts
- `cl/integration-2` HEAD **`0e798b13`**. Server tsc baseline **44** (this worktree's pristine measure); app **40**.
- Lane AI profile `qwen3.8-thunderbeast` (in the recreated lane config). Stack `:3093`/`:5193` 200.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — and it ABORTS if `lane2-config.yaml` is missing
  (create with `cp -L .../config.yaml`); `status` is safe.
- Pitfall (carried): a bare `git worktree add` on this NFS needs ~7–10 min for 3196 files; a mid-checkout kill leaves no
  admin dir → `git worktree prune` + `branch -D` + `rm -rf` + retry.
- Endpoint budget: **1/4** thunderbeast slots (browser gate runs on appliance-2, separate).
