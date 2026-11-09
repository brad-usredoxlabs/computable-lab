# LANE 1 TICK 260TH HANDOFF — 2026-11-02 ~22:00–22:45 EST

Every claim below is the orchestrator's first-hand observation unless marked worker/gate report.

## Reconciled first-hand
1. `cl-reconcile.sh 1` (22:00:41): todo 1 (**FAME-1B-BACKFILL — Brad-HOLD, NOT re-asked**), in-progress 1
   (**FAME-8**), superseded 1, done 105. Fleet live workers: none of mine. slot-0 HELD by lane 2's live
   `cl-coder` pair (launcher 3651837 + coder 3651842, started 21:12:05 — verified by `ps`); slot-1 FREE.
   thunderbeast bg slot FREE. Trunk `cl/integration-1` @ 584ade4d. Both ports 200 at tick start.
2. `exa-key-tripwire.sh`: OK, apiKey present and consistent across lane1/lane2/canonical.
3. `corpus-state.md` ABSENT in lane 1 ⇒ CORPUS LOOP skipped (lane 2 owns it). **Corpus priority honoured:
   lane 1 dispatched NO coder this tick** — lane 2 held slot-0 with a live coder and slot-1 was deliberately
   left for lane 2's queue (BRAD-BINDING header 2026-11-02T17:05).
4. Read the 259TH handoff in full, then the gate-3 receipts.

## What happened (in order)
1. **Browser re-gate cycle 3 finished at 21:42 with VERDICT: fix** (unit `cl-l1-browregate-fame8-c3-l1t2141`,
   tier-1, receipts `~/.hermes/cl/receipts/FAME-8/gate3-2115/`). The 259TH handoff had left this as the gating
   obligation, pinned to trunk **879192cc**.
2. **I audited the gate myself** (not the reviewer's word): `report.md` (221 lines) read in full; `trail.json`
   72 entries all `ok`; `shot-md5.txt` 18 shots with 3 disclosed identical groups (one of them — legD
   vertical-wheel vs horizontal-wheel — is *because* the horizontal door had no range); legE carries a real
   `POST /api/ai/assist/stream` 200 SSE with the saved request body; 0 console / 0 page / 0 failed-request
   errors; 0 non-2xx across 72 steps. Served candidate confirmed `879192cc`. **I opened both defect exhibits
   and read the shattered cells with my own eyes** — the finding is real, not a harness artefact.
3. **Verdict content, first-hand:**
   - **D1 (cycle-2's defect) PASSES** — pane 574/574, table 534, `flags` td 1296→1420 vs pane right edge 1440,
     `clientWidth 122 == scrollWidth 122`, no h-scroll, all four flag substrings painted and legible.
   - **DEFECT 1 (medium, NEW):** the same rule shattered every other column — `rt_min "4.946334540681159"` → 6
     line boxes (`4.94`/`633`/`454`/`068`/`115`/`9`); `area_pa_min "1664.7037274749032"` → 6 fragments;
     `area_percent "100"` → `10`/`0`; headers `peak` → `p`/`e`/`a`/`k`, `eligible` → `el`/`ig`/`ib`/`le`.
   - **DEFECT 2 (medium, NEW):** ANR-000069's 14-column `comparison_report_view` crushed to 534 px (columns
     28–52 px), pane `maxScrollLeft = 0` ⇒ **FAME-LAYOUT-1's horizontal door has zero range** (a trusted wheel
     dx=600 moved `scrollLeft` by 0; vertical door works). Pre-fix that table was `scrollWidth 2089` vs 574.
4. **Root cause, established by me from the product diff** (`git diff 5e861a0e..879192cc`): the entire regression
   is one CSS line, `app/src/analysis/AnalysisPage.css:123` —
   `.view-spec__table th, .view-spec__table td { overflow-wrap:anywhere; white-space:normal }`.
   `anywhere` collapses **every** column's min-content to ~1 character, so the table always fits the pane. One
   rule, two opposite outcomes: the `flags` cell is fixed, every other cell is destroyed.
5. **Decision: NOT a fourth coder run — architect.** Honest min-width arithmetic for `assignment_results_view`'s
   10 columns is ≈740–750 px against a 534 px content pane, so A3 ("table must FIT, no h-scroll") and
   FAME-LAYOUT-1 ("wide tables stay reachable through the pane's horizontal door") **cannot both be literal**.
   The three self-consistent repairs (per-column min widths + ~176 px h-scroll / reduced *displayed* precision /
   widened pane) each change an acceptance criterion — that is architect territory, and it is exactly the
   AS-L1T253-2 counter the 259TH handoff pre-committed to ("3rd A3 cycle — STOP, architect packet").
   - Wrote the evidence pack + exact question:
     `.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision-request.md` (measured numbers, my min-width
     table, both gate trails, generic-CSS-vs-declarative-per-column shape question).
   - **DISPATCHED the architect 22:03:46** — unit `cl-l1-arch-fame8-a3-l1t2215` (systemd-run --user --collect),
     prompt `lanes/1/prompts/architect-fame8-a3-l1t2215.txt`, log `lanes/1/logs/architect-FAME8-A3-l1t2215.log`,
     decision path `.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision.md`. Expected ~30–45 min ⇒
     2x check 23:15, 3x 23:45 (next tick).
6. **Task list updated under the queue lock** (staged temp + rename, never `open('w')`): FAME-8 gains
   `tick_reconcile_260TH`, `gate3_verdict: fix`, `gate3_receipts`, and a full structured blocker
   (`blocker_kind: architecture`, owner architect, next check `2026-11-02T23:15:00-05:00`, watch path = the
   decision file). **FAME-8 stays in-progress.** No `done` mark.
7. **INFRASTRUCTURE REPAIR — `cl-lane-stack.sh` (my own tooling, not product code).** The 259TH repair left
   :3092 running watch-less because `cl-lane-stack.sh stop` leaked the `tsx --watch` child per restart (35 had
   accumulated and killed the port). I fixed the script and verified it on the live stack:
   - launches are now `exec setsid env … npx tsx [--watch] src/server.ts` **backgrounded from the parent**, so the
     pidfile records the real session/process-group leader (`ps`: pid 3808687, pgid 3808687, sid 3808687;
     previously the pidfile held the *launcher* pid, 3787274, which is not a group leader);
   - `_kill_pidfile` signals the process **group** (`kill -TERM -- -$pgid`, then `-KILL`), fixing the leak;
   - new `_sweep_stale_lane_watchers` kills only processes whose `cwd` is **exactly this lane's** `server/` and
     whose cmdline is `src/server.ts` — it demonstrably did NOT touch lane 2 (lane 2's tree, cwd
     `cl-integration-2/server`, kept running and :3093 stayed up throughout) and never patterns Brad's stack;
   - **watch mode is now OPTIONAL** (`CL_LANE_NO_WATCH=1`): evidence this tick is that `tsx --watch` on this NFS
     checkout fires on *phantom* `node_modules/.pnpm/{zod,better-sqlite3}` events (mtimes 2026-09-06) and
     re-execs the wrapper into a NEW session; the fresh instance then races the one already holding the data
     repo, and the server never reached "Server listening" (observed twice, 22:09 and 22:12). Lane 1 is now
     running **watch-less**: `tsx src/server.ts`, exactly one process tree.
   - readiness window raised 60 s → 240 s: a cold lane-1 start on this NFS box takes ~3.5 min (schema +
     61 UI specs + record index 2354 + AI agent init). The 60 s window produced two false "did NOT become
     ready" reports while the server was still initialising.
   - **VERIFIED LIVE:** `cl-lane-stack.sh 1 status` → backend :3092 http=200, frontend :5192 http=200;
     `/api/schemas` = **204**; fixtures `ANR-000071`, `AOUT-000134`, `ANR-000069` all **200**; no `*.lock`
     left under `/home/brad/.computable-lab-lane1`.
   - CONSEQUENCE: :3092 has **no hot-reload**. Any schema/lint/ui YAML or server/ change needs an explicit
     `cl-lane-stack.sh 1 restart` (with `CL_LANE_NO_WATCH=1`) before verification. Nothing in FAME-8's remaining
     work is a server-side/YAML change (the fix is `app/`), so this gate is unaffected.

## Not done this tick (deliberate)
- **No coder dispatch** — corpus priority; lane 2 held slot-0 with a live coder and slot-1 was left for lane 2.
  FAME-8's fix is spec-shaped, not coder-shaped, until the architect answers. `stagger-trial.log` correctly
  gains no coder line (nothing was launched).
- **No spec composition** — lane 1's only todo (FAME-1B-BACKFILL) is Brad-held.
- **No cl-scout / no browser review** — nothing needed orientation recon; the computable vision slot was idle.
- D2 (`43.514`→`43.` x-tick clip, carried), D3 (`[object Object]` on frozen ANR-000056), gate-3's O1 separator
  and the 4165 px-tall table trade-off remain recorded, unfiled follow-ups.

## assumptions
- **AS-L1T260-1**: the ≈740–750 px readable-minimum figure in the decision request §4 is *my arithmetic from
  character counts*, not a measured layout. It is used only to establish that A3 and FAME-LAYOUT-1 conflict;
  the architect must confirm it with a real measurement before the fix ships, and the next browser gate must
  re-measure. `assumption_evidence_debt: true`.
- **AS-L1T260-2**: repairing `cl-lane-stack.sh` (setsid + group kill + lane-scoped sweep + optional watch +
  240 s readiness) is orchestrator tooling repair inside lane-1 authority, not product code, and changes no
  product behaviour. Falsified if any process outside lane 1 was signalled (evidence: lane 2's tree and :3093
  survived every stop/restart this tick; Brad's :3001/:5174 were never contacted).
- **AS-L1T260-3**: running lane 1 watch-less is correct *now* given the measured phantom-event restart storm;
  it is not a permanent state — a YAML/server change later this campaign requires an explicit restart, and
  restoring watch mode needs the phantom-event cause fixed (a separate infra item, below). Falsified if a
  graded surface depends on hot-reload.
- **AS-L1T260-4**: leaving slot-1 free for lane 2 means the fleet ran one coder instead of two for this hour.
  That is the corpus-priority ruling's intent (lane 2's queue is the north star), not an oversight; if lane 2
  had no dispatchable item, the slot simply idles rather than being spent on a spec-blocked lane-1 item.
- AS-L1T259-1..4, AS-L1T258-1..4, AS-L1T257-1..3, AS-L1T256-1..3, AS-L1T255-1..2, AS-L1T253-1..2,
  AS-L1T252-1..4, AS-L1T254-1..2 CARRY FORWARD unchanged.

## evidence debt
- **OPEN (gating, NEW):** architect decision at
  `.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision.md` — unit `cl-l1-arch-fame8-a3-l1t2215`,
  log `lanes/1/logs/architect-FAME8-A3-l1t2215.log`, started 22:03:46. On landing: read it, adopt the option,
  write the gatefix5 spec, dispatch on the first free coder slot (corpus priority permitting), then ONE
  browser re-gate. No fourth blind attempt.
- **OPEN (new, infrastructure, LOW urgency but real):** `tsx --watch` is unusable on this NFS checkout because of
  phantom `node_modules/.pnpm` change events. Lane 1 now runs watch-less (`CL_LANE_NO_WATCH=1`); a follow-up
  item should either fix the watch-event source (tsx `--ignore`/`--exclude` of `node_modules`, or move the
  checkout off NFS) or make watch-less the declared lane default with an explicit restart ritual.
- **CLEARED this tick:** the browser re-gate cycle-3 obligation on 879192cc (rendered a real VERDICT with
  receipts — it said *fix*, so FAME-8 is not closeable, but the obligation to obtain evidence is discharged).
- **NEW FACT to carry:** `cl-lane-stack.sh` pidfiles now record a session/process-group leader; any older
  documentation or script that assumed "pidfile = the pid to `kill`" is superseded.
- CARRIED unchanged from 259TH/258TH/257TH: D2 x-tick clipping; D3 `[object Object]` params cell on frozen
  ANR-000056; O1 run-parameter label vs CHEBI:143577 CURIE label mismatch; O3 flag-format test-pin candidate;
  gate-2 observations 1-7 (pre-existing red `Cannot render 'null_area_policy' (const)` chrome; A8 refusal
  rendering page-bottom); markerSaturationFlags; advc-c2 O1-O4 close-out notes; palmitate-walk OQ-1; FAME-6 S2
  narrative; intake pile O-1..O-5; W7b honesty flags; AS-L1T223-1 band note; AS-L1T238-4 revision-lineage;
  GCM-DEMO-AOAC-FAME; FL1; FAME-1B-BACKFILL Brad-held; gate-observations 1-6 routing; ANREV entryScript
  tracked-fixture note; the 4165 px table-height trade-off.

## Next-tick checks (priority)
1. `cl-reconcile.sh 1`; read this handoff; check unit `cl-l1-arch-fame8-a3-l1t2215` and the decision file.
   Still live past ~23:15 = 2x ⇒ inspect the log for forward motion; no motion by ~23:45 (3x) ⇒ write the
   decision yourself from the evidence pack, flag it PROVISIONAL for architect ratification, and proceed.
2. On a decision (architecture or Brad amendment): write the FAME-8-GATEFIX5 spec from it (unique path,
   `app/src/analysis/**` only unless the decision names a declarative surface), dispatch to the first free
   coder slot when corpus priority permits, advc gate, then ONE browser re-gate with the decided measurements.
3. If the decision is "Brad amendment", file ONE card with the recommendation and consequences and keep FAME-8
   in-progress.
4. Verify lane 1 before any gate: `cl-lane-stack.sh 1 status` (backend 200/204 schemas — it is watch-less, so
   restart after any YAML/server change), and confirm :5192 serves the candidate revision.
5. Do not let the gate-3 report's "table 534 px" wording propagate as an acceptance basis — it is the *symptom*
   of the rule, not the goal.
