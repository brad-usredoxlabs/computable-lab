# LANE 1 TICK 311TH HANDOFF — 2026-11-03 22:01 → 22:3x EST

One line: **no dispatch was lawful (both SHARED appliance-2 coder slots held all tick by live lane-2
coders ⇒ CORPUS PRIORITY), so the tick discharged the one owed lane-1 obligation that needed no fleet
slot: the 309TH's "screenshot pipeline is unreliable on the GC run sheet" was diagnosed to its actual
cause — the product paints correctly, the ORCHESTRATOR's `browser_vision` capture is the broken path —
and the acquisition-status chip now has a real pixel receipt instead of a disclosed limit.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 22:01)

- Queue: **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; neither lane paused
  (`lanes/1/PAUSE`, `lanes/2/PAUSE` absent); no lane-1 `corpus-state.md`; no live lane-1 worker ⇒ nothing
  to recover, no duplicate-writer risk.
- Trunk `cl/integration-1` @ **b803db36** (the 309TH docs commit). `git diff --name-only 1e639a65..HEAD` =
  one path, that handoff. No product-tree movement.
- Stack `:3092` pid 954410 / `:5192` pid 953556 (cwd `cl-integration-1/app`), both 200; nothing restarted.

## Capacity — measured, not assumed (twice)

`python3 ~/.hermes/cl/lanes/1/scripts/dispatch-window-1.py` at open and again at close →
**BLOCKED-CORPUS (exit 10)** both times:

| probe | reading |
|---|---|
| shared slot-0 | HELD — `L2-CLARIFY-CARD-1` (launcher 2609668, child 2609674 live, `hermes -p cl-coder`) |
| shared slot-1 | HELD — `CHATHOST-CONSOLIDATE-1` (launcher 2583815, child 2583815 live, `hermes -p cl-coder`) |
| flock truth | both SHARED locks `flock`-HELD (probed directly, not from pidfiles) |
| lane-2 queue | todo 5, in-progress 3, `corpus-state.md` ACTIVE (SPECS-QUEUED) |
| verdict | CORPUS PRIORITY (Brad 2026-11-02T17:05) — lane 2 keeps first refusal |

`L1-RECORD-LOCK-GUARD-1` is LONG mode (both slots) and lane 2 was mid-corpus, so it could not fire even
transiently. Pre-staged prompt and pre-warmed worktree are untouched and still valid (trunk moved by docs
only, so the a7ab041e..trunk product diff is still empty).

## What this tick produced — vision/capture path diagnosed, chip receipt obtained

Full evidence: `~/.hermes/cl/receipts/L1-VISION-PATH-DIAG/tick-311TH/NOTES.md` (9 PNGs + 4 JSON fact files
+ 4 re-runnable scripts in `~/.hermes/cl/lanes/1/scripts/`).

1. **The 309TH caveat is narrower than recorded — and it is not a product defect.** With the DOM showing
   `section.gc-run-sheet` mounted and topmost (rect 233.6,168.4,660.4,380.0; `elementsFromPoint(400,300)`
   → `TD → TABLE → section.gc-run-sheet`; deck `main` BELOW at y=572), `browser_vision` returned the
   pre-mount frame and **ignored a paint mutation I had just injected** (`documentElement` lime border +
   section outline/background). Its md5 `240368a3…` is byte-identical to the 309TH's 21:43:18 / 21:47:55
   captures — reproduced 5.5 h later on a fresh navigation. A `/registry` control in the same session
   captured correctly, so the failure is specific to pages whose main content mounts after an async fetch.
2. **An independent Playwright capture is live and correct** — three distinct md5s for early /
   after-mount / after-paint-mutation, with the injected borders actually visible. So the product paints;
   only the orchestrator's ad-hoc vision path lags. Browser gates are unaffected (`cl-browser-reviewer`
   drives its own Playwright harness) — the 309TH wording would otherwise read as invalidating them.
3. **Identity trap documented:** anonymous Playwright shows an EMPTY run sheet ("No entries — add a sample
   row") while `localStorage cl.currentUserId=USR-BRAD` shows both entry rows. That is a reader ACL, not
   missing data. Any future Playwright capture on this surface must act as USR-BRAD.
4. **The chip's missing pixel receipt now exists:** USR-BRAD + a REAL click on "Configure method / samples
   / attach / analyze" + ≤20 s wait for `[data-testid^=gc-acqp-status-]` renders
   `ISEN-kknq4i attached: ACQP-000006 | acquisition status: aborted · RUN.LOG evidence` (qualified
   styling) with the expanded `matched RUN.LOG lines (3)` block, and the quiet `completed` line for
   ACQP-000007. `09-chip-USR-BRAD.png` md5 `8e052d45abf3877de3e890fdd322b1c2`; ACQP-000006/7 both 200; 0
   pageerrors. Text byte-equal to the 309TH DOM extraction. (My first attempt, `08-…`, had not waited long
   enough for the per-ACQP fetch — a wait, not a UI irregularity.)
5. **309TH's "expanded state collapses by itself" NOT REPRODUCED** in a clean 65 s/1 s probe with no DOM
   writes: no open→closed transition, height 250→606→667 px monotonic as data loaded. Attributed to the
   309TH's own DOM mutation; **not filed** as a defect.
6. Recorded, not filed: `GET /api/protocols/RUN-brad-gc-drive-2026-10-31-kknq4i/steps` → 400
   `NOT_A_PROTOCOL` on both ports (curl-reproduced), UI degrades gracefully, pre-existing.

## Due blockers re-checked (first-hand)

- **L1-PARAMS-EMITTER-RIDER** — trigger **STILL UNMET**: `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38; emitter md5 `0e00b33a89c432f537f666398982df36` unchanged, `:709` still
  `"params": params` (raw dict) under the `:702` `string`/"canonical JSON" declaration. No cycle opened.
- **L1-RECORD-LOCK-GUARD-1** — declared criteria, spec (with AM-1..AM-9), prompt
  `prompts/coder-L1-RECORD-LOCK-GUARD-1-l1t1924-STAGED.txt` and the pre-warmed worktree all still stand;
  nothing in `app/ server/ schema/` changed since `cfdc904f`, so the staged kit is still valid. Fires on
  the first eligible slot (`--mode long`).
- **Cross-lane SEQ-ANSWER-CONTRACT-1** — still `todo` in lane 2 (`task-list.md:17482`, owned by lane 2,
  blocked behind CARD-1 on `AgentOrchestrator.ts`). Lane 1's only duty (re-run the `l1t1645` probe suite on
  `:3092`) is **not yet due**.
- **FAME-1B-BACKFILL** — done (308TH); its remaining obligation (the chip receipt) is now discharged.
- Exa tripwire: not re-run this tick (no dispatch decision depended on it); last reading 21:41 OK.

## Ledger / preservation

- `claims-ledger.md`: appended **FRESHNESS RE-DERIVATION — 311TH** at `b803db36` (ancestors true for
  2d3035da / 11338a3a / af092157 / 1e639a65; `af092157..HEAD` = 16 commits, **0 non-plans paths**; row 1's
  `cssRuleScan` non-test importers = 0 and `AnalysisPage.css` blob `c6930c66…` unchanged) and an
  **OBSERVATION AMENDMENT — 311TH** resolving the 309TH no-screenshot limit and scoping the caveat to the
  orchestrator tool. **No row's verdict changed; nothing promoted to quotable.**
- `assumptions.md`: AS-L1T311-1..4 added; AS-L1T309-3 marked RESOLVED (not reproduced).
- Preservation sweep: `git status --porcelain --untracked-files=all` in the trunk checkout shows **only**
  the known stray root file `ready` (plus ignored `node_modules`) — no stranded plans, nothing to commit.

## Next actions (ordered)

1. `dispatch-window-1.py` → on `DISPATCH-ELIGIBLE` (exit 0) fire **L1-RECORD-LOCK-GUARD-1** immediately,
   `--mode long`, background `systemd-run --user --collect`, prompt as staged (re-pin the runstamp if the
   timestamp moves).
2. On its DONE: adversarial ACCEPT → my own diff + server bars + `tsc -p app` → merge to `cl/integration-1`
   → `cl-lane-stack.sh 1 restart` → `pregate-recordlock-1.py` expect-GREEN → browser re-gate on the exact
   served revision (report stays in-progress until `VERDICT: accept`).
3. Any future orchestrator observation on an async-mounting surface: use the Playwright capture path
   (scripts in `~/.hermes/cl/lanes/1/scripts/`, USR-BRAD identity), **not** `browser_vision`.
4. When lane 2's handoff names the SEQ-ANSWER-CONTRACT-1 merge commit: re-run the `l1t1645` probe suite on
   `:3092`.

## Tick close

No coder dispatched, no product code, no data write, no schema/config change, no stack restart, no merge,
no status change (todo 2 / done 109 unchanged). Nothing live to checkpoint. Lane 2 keeps first refusal on
the coder fleet.
