# Handoff — LANE 2 tick 2026-10-05T18:50 → 19:38 EDT
## (PROTO-AI-9 UI gate VERDICT: accept — all 6 criteria PASS on a89719df; report promoted;
##  AI-9 held in-progress ONLY because the tracked kind-change in-scope repair (l2t1730) is still live)

Campaign: `ai-protocol-edit-and-router` (lane-2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`a89719df`** (unchanged this tick; no code merged, docs left UNCOMMITTED).
Lane stack `:3093`/`:5193` both **200**. Lane AI profile `qwen3.8-thunderbeast`. No Brad stack touched.

## Outcome
1. **PROTO-AI-9 UI acceptance gate returned `VERDICT: accept`** (cl-browser-reviewer, candidate `a89719df`,
   ran ~40 min, exited code=0). Receipts `receipts/PROTO-AI-9/2026-10-05_1848/` (`report.md` 6473 B,
   root `trail.json` consolidating flowAC/flowA2C2/flowB/flowC3, `shots/`). **No code to merge** — the
   AI-9 candidate (wellsfix l2t1815) was already merged last tick (`0e798b13` → `a89719df`).
2. **Report promoted** to canonical `.hermes/plans/PROTO-AI-9-wellsfix-report.md` (uncommitted, as prior
   doc promotions; the trunk HEAD is deliberately left at the reviewed candidate).
3. **AI-9 kept `in-progress`** — its own criteria PASS, but this task block is the campaign's owner of
   record for the kind-change in-scope repair (l2t1730), which is still live/unmerged. Close it when that
   repair merges and its gate accepts.

## Reconcile (step 2)
- **AI-9 UI gate** cl-browser-reviewer bash pid 3333195: **EXITED code=0**, `VERDICT: accept` → adopted.
  Log `logs/PROTO-AI-9-washgate-20261005T1848.log` (0 B buffered until exit — expected).
- **l2t1730 (kind-change repair)** cl-senior hermes pid **3201468**: **STILL LIVE** (~2 h at 19:38;
  `cl-senior` state.db-wal mtime advancing = actively streaming). Worktree
  `wt/PROTO-AI-2-stepupdate-lane2-l2t1730` HEAD `0e798b13`, now **M schema/workflow/protocol-edit-op.schema.yaml,
  M app/.../protocol/protocolEditOps.ts, M app/.../protocolEditOps.test.ts, M server/src/schema/ProtocolEditOpSchema.test.ts**
  → RED-tests → implementation phase (was CLEAN/orientation at the 18:50 checkpoint). Log
  `logs/PROTO-AI-2-stepupdate-l2t1730.log` 0 B (buffered until exit). NOT killed, NOT re-dispatched.
  Release: **`PROTO-AI-2 STEPUPDATE EXITED code=0`**.
- **Human blockers unchanged** (md5 re-measured): AI-11 `c5fb3276249ff81ba57a4ca9dfa1b61a`, AI-12 §2
  `edce196b5acaf8005512cc587d6c2423` → not re-asked (silence is never approval).

## Verification I performed myself (steps 6–7)
Read the gate's `report.md` AND the raw `trail.json` `evaluate` results for flowAC / flowA2C2 / flowC3
(not the reviewer's prose), then re-read the product:
- **C1 PASS** (retry): attempt 1 (flowAC turn sj7h74) flaked to `ops=1` (insert only); the gate's bounded
  RETRY (flowA2C2 turn avlevo, `ops=2`) rendered BOTH rows — `+step … Wash the lysate … after step-3` and
  `-step step-6 … Centrifuge the lysate …`. A serving flake correctly retried, not counted against the candidate.
- **C2 PASS**: sha unchanged across every proposal window (`2dc60f71` = `2dc60f71`, `7c13b655` = `7c13b655`,
  `5e109a0f` = `5e109a0f`) — propose-never-write holds.
- **C3 PASS**: Accept → sha advances EXACTLY ONCE per accept (`2dc60f71`→`7c13b655`→`5e109a0f`), 17 steps,
  wash at ordinal 4 (after step-3), the step-6 centrifuge step DELETED, ordinals contiguous 1..17,
  `.changes-panel__apply-error` NULL ~0.4 s and ~3 s after accept, panel unmounted, input ready.
- **C4 PASS** (flowB): Reject → sha `0a623e2b` unchanged, panel gone, input ready.
- **C5 PASS** (flowC3): labware_add `reagent-reservoir` accepted → labwareRoles 5→6, sha `5e109a0f`→`0a623e2b`
  exactly once.
- **C6 / D2 PASS**: same DOM session, `reload:false` — rail step count 16→17 AND the LABWARE badge
  `▸Labware5` → `▸Labware6`; the `cl:records-changed` success-branch dispatch works as specced.
- **MY OWN, INDEPENDENT OF THE GATE**: `grep` of `.run/backend.log` for 422 = **0 hits** (the prior gate's
  422 defect class is gone); direct `GET /api/records/PRT-4iaey2` after the gate → `contentSha`
  `0a623e2b5ce975baf0ee5354efafec3bfab3df49`, 17 steps, ordinals 1..17 contiguous, `kinds[3]=wash` +
  `kinds[4]=wash` (the expected duplicate from the flake attempt-1 insert), labwareRoles 6 (incl.
  `reagent-reservoir`), instrumentRoles 3. Served `:5193` module carries `cl:records-changed` (count 1);
  served prompt `server/prompts/event-graph-agent.md:118-140` read directly and confirmed carrying the four
  WellSelector object forms + the `{kind:"all"}` default + the op-tag restatement (the wellsfix Part 1).

## Dispatched this tick
- **None.** Both lanes' capacity was already occupied (lane-2: the gate + l2t1730); no new work was launched
  inside the budget. Endpoint: lane-2 senior 1/2 (l2t1730); browser reviewer 1 (gate, now exited).

## Prepared for the next tick (no new dispatch)
- `prompts/review-PROTO-AI-2-kindchange-TEMPLATE.txt` — the kind-change UI gate prompt (criteria verbatim
  from the fix spec's Acceptance section, 4 flows; placeholders for candidateRevision + fresh receipts dir;
  re-read-the-sha-first discipline). Fill and dispatch only AFTER the l2t1730 merge + stack restart.

## Ordered next actions (resume exactly here)
1. Reconcile **l2t1730** (`logs/PROTO-AI-2-stepupdate-l2t1730.log` → `PROTO-AI-2 STEPUPDATE EXITED code=0`).
   Open the REAL diff (expect: envelope `StepUpdateOp` per-kind `allOf` whitelists + `$defs/StepPayloadFields`,
   prompt line `:124`, applier per-kind explicit picks + superseded-field drop, RED-first tests in
   `server/src/schema/ProtocolEditOpSchema.test.ts` + `app/.../protocolEditOps.test.ts`).
   Run the targeted server + app suites and tsc (pristine baselines on this worktree: **server 44 / app 40**);
   verify the envelope ACCEPTS the delta-only incubate case and REJECTS a wrong-kind / no-kind payload with a
   **field-level path**. Merge `--no-ff` into trunk, **inspect trunk first** and resolve the
   `server/prompts/event-graph-agent.md` overlap (l2t1730 edits `:124`; the merged wellsfix insertion is at
   `:127+` — disjoint lines). Then `cl-lane-stack.sh 2 restart` (**background=true**; YAML + prompt change).
2. Dispatch `cl-browser-reviewer` with `prompts/review-PROTO-AI-2-kindchange-TEMPLATE.txt` (fresh receipts
   dir, fresh candidateRevision, re-read the fixture sha). `VERDICT: accept` → **mark PROTO-AI-9 done**
   (its own gate already passed), promote both reports, handoff. `fix` → defect list with absolute
   screenshot paths back to cl-senior; re-review.
3. Human blockers AI-11 / AI-12 §2 stay `on-change` — do not re-ask unless the watched files change.

## assumptions:
- **NEW: `AS-PROTO-AI-9-C5-ROLENAME`** — the gate demonstrated criterion 5 with the new role name
  `reagent-reservoir` because the literal fixture names had already been created by earlier gates' accepts
  (Accept then correctly wrote nothing and surfaced the truthful "already exists" error). Reversible,
  `evidence_debt: false` (the claim rests on an independently re-read real write, disclosed in the report).
  Full entry in `~/.hermes/cl/lanes/2/assumptions.md`.
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-LANE2CONFIG-RECREATE**,
  **AS-PROTO-AI-9-W8**, **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.
- Non-blocking gate findings logged for the backlog (F1 ChangesPanel Accept/Reject render unstyled as
  "RejectAccept" — clickable but reads as dead text, no CSS defines `.changes-panel__btn`; F2 duplicate
  labware_add caught only at Accept + apply-error renders plain despite `role="alert"`; F3 pre-existing
  run-page breadcrumb/"Saturaday" typo/placeholder/"(no response)" bubble). **F1 is a real cosmetic defect
  on a surface Brad reviews — worth a small task later, NOT an AI-9 blocker.**

## Open evidence-debt entries
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 `3d10b6ab…`);
  acceptance-relevant to PROTO-AI-13 → disclose with its digest. **STILL OPEN.**
- `AS-PROTO-AI-9-W7` remains CLEARED (2026-10-05T17:55).

## Baseline facts
- `cl/integration-2` HEAD **`a89719df`**. tsc pristine baselines on this worktree: server **44** / app **40**.
- Fixture `PRT-4iaey2` (lane test data): **`contentSha 0a623e2b5ce975baf0ee5354efafec3bfab3df49`, steps 17,
  labwareRoles 6, instrumentRoles 3** (two `wash` steps at ordinals 4,5). ALL CL records are
  Brad-declared TEST DATA; **a fresh gate must re-read the sha first** — every recorded baseline in older
  gate prompts is now stale.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING → run with `background=true`; it ABORTS if
  `lane2-config.yaml` is missing (recreate with `cp -L …/cl-integration-2/config.yaml`, mode 600); `status` safe.
- Pitfall (carried): bare `git worktree add` on this NFS takes ~4–10 min for ~3200 files → background it.
- Pitfall (new, harness): the gate's reused plan asserts the literal string `AI Assistant` against the
  `ai-tab-system-prompt` testid, which renders uppercase `AI ASSISTANT` — those `assertText` FAILs are
  harness case-mismatch artifacts, never product defects. Fix the plan's expectation before reusing it.

## ADDENDUM 2026-10-05T19:40 EDT — l2t1730 EXITED, VERIFIED and MERGED (supersedes the "still live" reconcile above)
- **l2t1730 (kind-change repair) EXITED code=0** at ~19:31 (ran ~2h05m; release line
  `PROTO-AI-2 STEPUPDATE EXITED code=0` ×2 in `logs/PROTO-AI-2-stepupdate-l2t1730.log`).
  Commits `0aff8c38` (fix) + `b06d6675` (report); base `0e798b13` is an ancestor of trunk.
- **Real diff inspected** (6 files, +668/−10): `schema/workflow/protocol-edit-op.schema.yaml` +279
  (`StepUpdateOp` per-kind payload whitelists via `allOf` if/then, `if` pinning `required:[kind]`+const,
  NO `then.required`; new `$defs UpdateTarget/UpdateSource/UpdateMaterial` + `$defs/StepPayloadFields` as
  DATA + a header carrying the ruling/provenance/§4 disposition), `server/prompts/event-graph-agent.md`
  **1 line** (the `step_update` line: payload fields only with a new `kind`, only the NEW kind's fields,
  apply drops disallowed payload, ASK-don't-guess preserved — the wellsfix `:127+` block is untouched, both
  present post-merge), `app/.../protocol/protocolEditOps.ts` +123 (kind-present rebuild with explicit
  per-kind picks, never a spread; kind-absent path byte-identical), + 3 test files (+216, incl. the
  field-level REJECT paths, a DRIFT LOCK parsing both YAMLs, and the ordinary-update regression guard).
- **Verified myself, in the worktree AND on merged trunk**: server `ProtocolEditOpSchema.test.ts` **60/60**
  (incl. "ACCEPTS a delta-only kind change: {kind: incubate, duration_min:720}" and "REJECTS a wrong-kind
  payload field alongside kind … at /ops/0"), app `protocolEditOps.test.ts` **23/23** (wash→incubate drops
  `washVolume_uL`+`cycles`, wash→mix KEEPS `cycles`, mix→other wipes payload, ordinary update byte-identical).
  tsc on merged trunk: **server 33 / app 34** error lines (the historical trunk baselines — the worker's
  44/40 are its own worktree's lane-exclude symlink artifacts); owned-file error grep clean → ZERO new.
- **MERGED `--no-ff` trunk `a89719df` → `bec054b0`** (clean; git auto-merged the prompt file, no conflict).
  **Stack restarted** (YAML + prompt change, `background=true`) → `:3093`/`:5193` both 200, `/api/health`
  ok (schemas loaded 176). Report promoted to canonical `.hermes/plans/PROTO-AI-2-stepupdate-report.md`.
- **Worker flag for the backlog (non-blocking, not weakened)**: `server/src/ai/promptBudget.test.ts`
  ALREADY fails at trunk (43015 > 12000 chars); this change added ~780 chars to an already-over-budget
  prompt. Brad/backlog decision: raise the budget constant or trim the prompt.
- **Revised next action (this replaces step 1 above; step 2's gate is now the ONLY remaining step)**:
  1. (cheap pre-check) `POST /api/ai/assist/stream`, surface `workspace.deck`, fixture `PRT-4iaey2`
     ("change step N from wash to incubate overnight") → confirm a schema-VALID proposal carrying
     `kind` + `duration_min`; record the sha before/after (must be unchanged).
  2. Dispatch `cl-browser-reviewer` with `prompts/review-PROTO-AI-2-kindchange-TEMPLATE.txt`
     (candidateRevision **`bec054b0`**, fresh receipts dir, RE-READ the fixture sha first:
     `PRT-4iaey2` = `0a623e2b…`, steps 17, labwareRoles 6).
     `VERDICT: accept` → **mark PROTO-AI-9 done**, promote reports, handoff.
- **New trunk baseline**: `cl/integration-2` HEAD **`bec054b0`**; tsc baselines server **33** / app **34**.
