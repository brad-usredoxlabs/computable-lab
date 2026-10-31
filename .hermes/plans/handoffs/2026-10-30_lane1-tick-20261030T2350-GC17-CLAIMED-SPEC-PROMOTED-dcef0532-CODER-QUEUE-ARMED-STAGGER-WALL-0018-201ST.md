# Lane 1 — tick 201 · 2026-10-30T23:20–23:50 EDT

## GC-17 claimed, spec promoted, coder queue armed — stagger wall to ~00:18

## Reconciliation (all first-hand)

1. **speccomp-gc17 COMPLETE**: pid 3285004 gone, rc=0 23:14:52, log tail confirms
   `SPECCOMP-GC17-DRAFT DONE`; deliverable present
   (`.hermes/plans/drafts/DRAFT-2026-10-30T2210-GC17-vendor-exa-honest-capability.md`, 311 L,
   mtime 23:13). Thunderbeast bg slots both free at observation (its slot released).
2. **Coder slots**: slot-0 HELD by lane 2's WELLSET-TOKEN-EMIT-1 coder (launcher 3435608,
   started 23:18:10, ALIVE) — not ours. Slot-1 pid file names dead CHATUI1 pid 2909617;
   `flock -n` proves slot-1 FREE (flock is truth).
3. Fleet coder slots were at 1 live (lane 2); stagger rule = no fresh launch until 60 min
   after 23:18:10 or that coder's death.

## Spec review + promotion (orch judgement, cites verified yourself)

Reviewed the draft against the task row's verified_by + stop_boundary. Eight load-bearing
cites re-checked first-hand on trunk @ dcef0532 — ALL CONFIRMED: VendorExaHandlers.ts:43
`configured: boolean` declared; :87-93 the 503 EXA_NOT_CONFIGURED path; exa.ts:135 `fetchFn`
injection point; integrationFlags.ts:28 exaVendorEnabled + :39 test-reset seam;
useVendorExaSearch.ts:58 initial `configured=true`, :23-24 debounce 350/MIN_QUERY 2;
client.ts:1381 mirror interface; resolvers.ts:357-359 the "browser logs a resource error the
app cannot suppress" comment verbatim; useVendorExaSearch.test.ts:63 the existing
configured=false test the draft says must be re-worked. `mapHintFieldEntry` present in the
new worktree's documentMapper (WIDGET-R1 lineage confirmed).
**PROMOTED**: `.hermes/plans/2026-10-31_GC-17-vendor-exa-honest-capability-spec.md` (commit
dcef0532). The draft's key correction to my interim direction stands and is adopted:
fire-gating alone cannot fix D4 (enabled:true + dead key is Brad's exact state); the
load-bearing half is the server response contract — credential-capability class
(upstream 401/403 by HTTP STATUS on a typed error; unconfigured) -> 200
`{configured:false, reason:'key_rejected'|'not_configured', items:[]}`; genuine outage with a
valid key STAYS 502 EXA_SEARCH_FAILED (anti-laundering pin, policy call flagged for the
adversarial reviewer). Client gates on the existing exaVendorEnabled + sticky-negative seam
on the SAME cache; no new vocabulary. OQ1 (exact mount-fire chain: slash-menu preload vs
useMaterialSearch) is empirical — the server contract covers every path; OQ2 (sibling
EquipmentHandlers/VendorSearchHandlers same legacy pattern) -> candidate follow-up item, NOT
this item; OQ3 sticky lifetime per-page-load adopted.

## Dispatch

- Worktree `wt/gc-17-lane1-l1t2330` off trunk @ dcef0532, config.yaml + node_modules symlinks
  replicated from the WIDGET-R1 worktree pattern. Trunk cite sanity-checked inside it.
- Prompt `prompts/coder-GC17-l1t2330.txt` (RED-first T1-T8, file boundary, status-via-report,
  unique report `deliverables/gc-17-report-l1t2330.md`, token GC17L1T2330, NEVER-print-key,
  spare-port live-proof guidance — coder must NOT curl :3092 for its own code proof since
  :3092 serves the trunk).
- Launcher `launchers/queue-GC17-l1t2330.sh` armed 23:41 as **unit
  queue-gc17-inner2-l1t2330 running `--inner` directly** (the known systemd-run trap reconfirmed
  the hard way: the outer form died with its cgroup before setsid handed off — NO coder
  launched from the first dispatch; log shows only the direct --inner unit).
- Queue log witness: "stagger wall: newest fleet stamp 23 min old (<60) — waiting". It takes
  slot-1 flock when the wall opens (~00:18, or on lane-2 coder death), stamps the pid file,
  then launches cl-coder. Ownership: inner queue pid 3480096 (unit queue-gc17-inner2-l1t2330).

## Queue state

- GC-17 in-progress (claimed under queue lock, md5 0a994c0d). Zero other todo items.
- FLEET-3B idle-window: NOT applicable (slot-0 coder live since 23:18). Next check on-change.
- Id-mint decision: answer file STILL ABSENT -> provisional D-A+R-1 stands (AS-L1T176-1),
  question unchanged, not re-asked.
- PARKED stays parked (MOUNT-NONEVENT-1, MATRES-REPLAY, transform_sequence revcomp).
- OQ2 follow-up (sibling exa handler consistency) NOT yet queued as a task — no new campaign
  scope without Brad; carry as a recommendation.

## Evidence debt (open) after this tick

- AS-L1T176-1 — id-mint provisional D-A+R-1 (decision file absent). Carried.
- NEW AS-L1T201-1 (OQ3 sticky-negative lifetime per-page-load assumed desired; reversible,
  pinned by T7/T8, flagged if Brad wants TTL semantics), AS-L1T201-2 (GC-17 live valid-key
  regression leg = MOCK evidence per verified_by; environment note, live path needs Brad's
  key) — both recorded in assumptions.md, evidence_debt noted there.
- Carried (evidence_debt=false): AS-L1T200-1/2, AS-L1T199-1, AS-L1T198-1, AS-L1T197-1,
  AS-L1T196-1, AS-L1T195-1/3, AS-L1T194-1/3, AS-L1T193-1/2, AS-L1T191-1, AS-L1T190-1/2,
  AS-L1T188-1/2, AS-L1T187-1/2/3, AS-L1T186-1, AS-L1T185-1/2, AS-L1T184-1, AS-L1T183-1/2,
  AS-L1T181-1, AS-L1T180-1/2, AS-L1T179-1/2, AS-L1TICK174-1/2, AS-L1T2100-1, AS-L1T172-1/2,
  AS-L1T173-1/2, AS-L1T177-1.

## assumptions:

- AS-L1T201-1 (evidence_debt=false): sticky-negative per-page-load lifetime adopted from the
  existing integrationFlags cache semantics; reversible pre-implementation call inside the
  spec; T7/T8 pin the behavior either way.
- AS-L1T201-2 (evidence_debt=false): GC-17 configured-key regression is MOCK-evidence-gated by
  the task row's own verified_by wording; live-path note carried into the gate report.
- AS-L1T176-1 (open, carried): id-mint provisional D-A+R-1 while the answer file is absent.

## Live workers at checkpoint (~23:50)

- GC-17 queue gate: unit queue-gc17-inner2-l1t2330 (inner pid 3480096) — alive, sleeping on the
  stagger wall; will self-launch the coder into slot-1 at wall-open. NOT a coder yet.
- Lane-2 WELLSET coder holds slot-0 (their ownership; stagger input only).
- Trunk dcef0532. :3092/:5192 200. No YAML touched -> no restart. Engine :18080 alive (401 auth
  probe).

## NEXT TICK (202nd) — in order

1. GC-17 coder: check queue log for "slot-1 LOCK-ACQUIRED; launching coder" + inner hermes pid;
   reconcile against report `deliverables/gc-17-report-l1t2330.md` (expected 40-80 min from
   launch; 2x watch). If the queue gate died WITHOUT launching (stagger window + slot lost to
   lane 2), re-arm; the prompt/worktree are idempotent.
2. On coder exit: ADV GATE first (reviewer brief = spec's reviewer-bait block; unique report
   reviews/GC17-adv-<ts>.md), then orch self-verify (suites, tsc zero-new vs coder's recorded
   baseline, the curl witness), then merge, then browser gate: plain /runs/:runId load, ZERO
   exa-attributable >=400 entries (protocols-steps 400 is the segregated campaign-noted item),
   receipts dir per protocol, tier-1.
3. FLEET-3B: only when BOTH coder slots idle + ninfer journal running 0.
4. Id-mint watch on-change; PARKED stays parked; OQ2 = recommend follow-up item to Brad's
   next dossier exchange, do not self-add campaign scope.
