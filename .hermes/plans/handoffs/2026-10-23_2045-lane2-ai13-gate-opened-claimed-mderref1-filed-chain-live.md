# LANE 2 HANDOFF — l2t1955 (2026-10-23T20:45 EDT) — PROTO-AI-13 500-GATE OPENED: claimed + coder queued; MDER-REF-1 defect card filed (measured Ajv throw) + queued; CHAIN coder live

Trunk: ac1aec2f -> abf053f5 (docs-only this tick: two specs). NO code merges. Stack UP
:3093/:5193 (200/200, health 199 schemas / 134 lint rules). Brad's stack untouched.

## RECONCILE (start of tick)
- MATRES-CHAIN: coder LIVE since 19:35 (queue 737452, hermes pid 962828, worktree
  wt/MATRES-CHAIN-lane2-l2t1755 branch cl/lane2-matres-chain-l2t1755, PINNED_TIP=4d8fec8b
  = tip at launch). ~22 min in at 20:0x = normal duration (per-role history ~1-3h). Left
  running; task flipped todo -> in-progress. Report owed MATRES-CHAIN-report.l2t1755.md.
- PANEL queue unit 274949 + ANSWERFOLD-FIX2 unit 958594: parked on the fleet flock (log
  WAIT-LOCK lines confirm). Kernel-chosen wake order — advisory only.
- ANSWER-FOLD-NULL-1: correctly in-progress awaiting FIX RUN 2 (no new action — queue 2
  in FIFO). FULFIL done/merged (4d8fec8b) as of last handoff.
- No due/changed blockers from the cheap gate; AI-13 RECOUNT line is now obsolete
  (superseded by the claim annotation in its block).

## THIS TICK
1. PROTO-AI-13 MEASUREMENT (first-hand): /home/brad/.computable-lab-lane2/shadow-router/
   events.jsonl n=502 >= 500; authoritative protocol_edit 75 >= 50. THE GATE OPENED.
   Brad's §2 sign-off verified on file (decisions/PROTO-AI-12-prereg-approval.md —
   SIGNED AS WRITTEN 2026-10-06, p95 router latency <= 2000 ms).
   Orch pre-counts (scorer must re-derive; anchored in the spec as facts-to-re-derive):
   routerPick parse_failure 451 / create_record 42 / event_graph 9; agreement 0/502 (also
   0/51 among non-parse picks); 357/502 authoritative = event_shorthand, an intent added
   AFTER the pre-registration -> can never agree by construction (sensitivity denominator
   required in the report; verdict follows the signed primary denominator; thresholds NOT
   touched). Latency median 149 / p95 315 / max 1622 ms vs the signed 2000 ms.
2. CLAIMED PROTO-AI-13 (todo -> in-progress, queue lock held for the whole transaction).
   Spec orch-authored + ratified: .hermes/plans/2026-10-23_2030-PROTO-AI-13-spike-verdict-spec.md
   (abf053f5). Queue unit systemd run-p1130064 (script queue-protoai13-l2t1955.sh, pid
   1130065) PARKED on the fleet flock at 20:29:46; gate line GATE-OK telemetry n=502.
   Prefab prompts/coder-PROTOAI13-prefab.txt. Report owed
   /home/brad/.hermes/cl/lanes/2/PROTO-AI-13-report.l2t1955.md +
   scripts/shadow-router/score.l2t1955.py in its worktree wt/PROTO-AI-13-lane2-l2t1955.
3. MDER-REF-1 FILED + CLAIMED (in-lane repair authority; handoff l2t1940 directed 'file it
   next tick'). Defect measured FIRST-HAND at 4d8fec8b by orch boot simulation
   (src/schema probe, removed after): registry.addSchemas(199 entries) + topo-order
   validator.addSchema all succeed, then first validate of a material-derivation payload
   THROWS: "can't resolve reference ../core/ref.schema.yaml from id
   .../material-derivation.schema.yaml". Four bad pointers (inputs.items, outputs.items,
   protocol_ref, source_event_graph_ref); repo convention is './datatypes/ref.schema.yaml'
   (aliquot.schema.yaml:28 etc.). DATA-only 4-pointer fix + RED-first lock test.
   Spec .hermes/plans/2026-10-23_2030-MDER-REF-1-spec.md. Queue systemd run-p1130066
   (queue-mderref1-l2t1955.sh, pid 1130067) parked on the flock 20:29:46 (behind
   PROTOAI13 by microseconds — kernel-chosen order). Report owed MDER-REF-1-report.l2t1955.md.
4. assumptions.md: AS-PROTOAI13-TRIGGER-NOW, AS-MDERREF1-INLANE-REPAIR,
   AS-PROTOAI13-PRIMARIES-ORCH-PRECOUNT (evidence_debt=true) appended.

## NEXT TICK (priority order)
1. CHAIN exit watch (962828): on exit -> adversarial gate (cloud OpenRouter, unique suffix,
   report reviews/MATRES-CHAIN-advc-l2t<tick>.md) + §9 battery + bait-list checks. On
   ACCEPT: orch self-verify (double-accept store counts, arithmetic fixtures, scoped
   suites cwd=server, tsc sorted diff, FULFIL-file zero-diff proof) -> merge --no-ff ->
   restart (chain adds YAML: config/drafting/execute-chain-arithmetic.yaml + own lint
   file) -> UI leg §7.5 present => BROWSER GATE MANDATORY on :5193 (rule 6b: merge may
   proceed code-track-first; task stays in-progress until real VERDICT: accept with
   receipts under receipts/MATRES-CHAIN/<ts>/).
2. First fleet-slot winner among PANEL (274949) / FIX2 (958594) / PROTOAI13 (1130065) /
   MDERREF1 (1130067) fires automatically — whichever it is, exactly ONE coder runs; do
   not duplicate, do not kill the holder. PANEL remains first CLAIM in spirit per Brad's
   ruling but the kernel picks the flock winner; the queue order is advisory (recorded as
   AS-LANE2-FIX2-FIFO-ORDER). PANEL exit -> advc + spec §11 must-checks -> merge -> its
   MANDATORY browser gate (:5193). FIX2 exit -> advc cycle-1-of-this-defect -> merge ->
   ORCH REPLAY re-run (scripts/replay-answerfold-live-l2t1850.py) — discharges
   AS-ANSWERFOLD-LIVECONV-NOTCODERPROOF + AS-ANSWERFOLD-FIXTURE-ENTRY-SHAPE.
   PROTOAI13 exit -> verify scorer reproduces (orch re-run vs fresh snapshot, sha256 in
   report; numbers must match raw stdout verbatim) -> promote report to canonical
   .hermes/plans/PROTO-AI-13-report.md + scorer to scripts/shadow-router/score.py -> done.
   MDERREF1 exit -> advc -> orch re-run 3 scoped suites + diff --stat two-file proof ->
   merge -> restart (schema YAML) -> done (no browser gate; server-data item).
3. If CHAIN is still live next tick at >2x expected duration (~by ~22:30), inspect
   state.db/log motion + worktree commits; at 3x (~by ~01:00) treat ownership as stale
   ONLY with log evidence (timeout alone is not proof), adopt committed artifacts.
4. REVISE-GHOST-1 browser-gate attempt 5 stays gated on ANSWER-FOLD criterion (2) —
   FIX2 replay discharges it.
5. Brad watch unchanged: ROLE-AXES-1 + CFG-UNION-1 blocked-on-approval (not re-asked);
   no new Brad question this tick (nothing needed an answer — both claims were pre-
   registered/pipeline-authorized; see assumptions).

## Open obligations (carried)
- ANSWER-FOLD criterion (2) live convergence — FIX RUN 2 + orch replay re-run
  (AS-ANSWERFOLD-LIVECONV-NOTCODERPROOF OPEN; AS-ANSWERFOLD-FIXTURE-ENTRY-SHAPE OPEN).
- REVISE-GHOST-1 browser-gate attempt 5 OPEN (gated on the replay above).
- MIXFRAC-1 gate obligations from handoff l2t0855 — carry unchanged.
- AS-PROTOAI13-PRIMARIES-ORCH-PRECOUNT evidence debt OPEN until the scorer reproduces.
- AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY + AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY
  [main-promotion only]. AS-ANSWERFOLD-FIXTURE-FRACTIONS [recorded finding].
  AS-LANE2-FULFIL-CWD-CONVENTION, AS-LANE2-FIX2-FIFO-ORDER, AS-LANE2-CHAIN-OQ2-CORRECTION
  [carried].
- Untracked leftovers logged not deleted (reviews/, app/harness-*.mjs, app/d1-c3-*, two
  DRAFT docs, server/.artifacts/shqa3-replay/, stray wt/ dir entry in trunk copy).
- Hygiene: compositionRoles.ts:214 off-by-filter (non-blocking, no card yet).

## assumptions:
- AS-PROTOAI13-TRIGGER-NOW [NEW, evidence_debt=false] — claimed the verdict the moment the
  pre-registered n gate opened; no new human input needed (Brad signed §2).
- AS-MDERREF1-INLANE-REPAIR [NEW, evidence_debt=false] — defect card filed + dispatched
  under in-lane repair authority per handoff l2t1940 directive; smallest DATA-only fix.
- AS-PROTOAI13-PRIMARIES-ORCH-PRECOUNT [NEW, evidence_debt=true] — coder must re-derive
  every number; orch re-runs the scorer post-merge before done.
- AS-ANSWERFOLD-LIVECONV-NOTCODERPROOF [OPEN], AS-ANSWERFOLD-FIXTURE-ENTRY-SHAPE [OPEN],
  AS-ANSWERFOLD-FIXTURE-FRACTIONS [recorded], AS-LANE2-FULFIL-CWD-CONVENTION,
  AS-LANE2-FIX2-FIFO-ORDER, AS-LANE2-CHAIN-OQ2-CORRECTION, AS-ANSWERFOLD-COMMITS-COMPLETE-
  REPORT-LOST, AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY,
  AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY [carried as applicable].

## live-worker checkpoint at exit (~20:45 EDT; ~50 min wall — checkpointing, launching nothing further)
- Fleet coder slot: CHAIN coder hermes 962828 LIVE (queue bash 737452 holds the flock;
  pid-file 'l2t1755 MATRES-CHAIN'). Fleet rule honored: exactly ONE live coder.
- Parked queue units (all legitimate, auto-fire on flock release, kernel-chosen order):
  PANEL 274949, FIX2 958594, PROTOAI13 1130065, MDERREF1 1130067.
- Trunk HEAD abf053f5 (docs-only above the last code merge 4d8fec8b); tracked tree clean;
  stack UP after this tick's checks (no YAML landed this tick — no restart needed).
- AI-13 recount line is now a CLAIM annotation, not an INSUFFICIENT note.
- No Brad stack touched; no model services touched.
