# HANDOFF lane-2 2026-10-28T10:05 EDT (orch l2t0930) — RE-GATE 4: tier-1 died, tier-2 rendered VERDICT: fix — D1-D5 cluster is likely ENVIRONMENTAL, not product

## Since the 09:05 handoff

1. TIER-1 regate-4 DIED (harness death, not a verdict): unit run-p1469083-i60140744
   exited 09:08 mid-analysis, partial receipts only
   (gate-l2t0830-regate4/run-main/: 35 steps P1-P3, 14 shots, NO report.md, NO verdict).
   Session 20261028_090031_f2519f's last actions killed its own harness children.
   Tier-1 trail note: its "accept through the deck preview bar" selector reported
   accepted=False 'no preview bar' for P1/P2 — a mount prompt legitimately stages no
   preview (confirmed correct by tier-2 P1 PASS), so that was a harness selector artifact.
2. TIER-2 LADDER (SOUL 6c) fired: cl-browser-reviewer profile with
   -m deepseek/deepseek-v4.1-flash --provider openrouter, unit run-p1495932-i60170184,
   session 20261028_092741_c44caa, UNIQUE receipts
   /home/brad/.hermes/cl/receipts/L2-SUITE-A/gate-l2t0930-regate4-tier2/
   (162 steps, 3 runs, 23 shots, trail.json, report.md, states.json).
   FIRST tier-2 launch attempt died instantly: systemd-run `bash -c` env has no
   'hermes' on PATH -> 'hermes: command not found' (run-p1495189). Relaunched with
   absolute venv path. Skill cl-coder-launcher-pattern patched with this pitfall.
3. TIER-2 VERDICT: fix (real receipts, defect-0 served-candidate check PASSED on
   538499cf with 0e6eb598 ancestor-verified; zero consoleErrors/pageErrors).
   PASS: P1 (mount + honest no-preview copy), P7 amended (mix 75 uL + 3 cycles card),
   P4c/D6 dead-chrome clear on 3 accepts (honest 'Proposal applied (commit ...)' lines),
   ADVC3 deck cite (B1 attributes to single placed vessel), P4b PRESENT arm (mint row
   on rows-[] card, not clicked).
   FAIL (D1-D5, MAJOR cluster): P2 'Place a 96-well plate', P4, P5, P6, T1, T2 all end
   'no proposal: the model's tool call carried no usable draft arguments' (the honest
   wall — NOT forbidden success-with-nothing); D3 two-tile unmet (never got a 2nd
   placement); P3 cascade (42-well commit UNBOUND, paints nothing, no plate on deck);
   P8 staged a plain incubate instead of the card/wall (D5).
   D6 OBSERVATION: well marks paint as TILE outline only, 0 interior pixels changed —
   candidate small item, reviewer explicitly did not assert it as a fix.
   D7 UNTESTED arms: mint-row absence-on-cards-with-rows, two-plate attribution.
   PRECONDITION DRIFT (disclosed): deck driven on a 237-msg restored SHARED thread
   (tier-1 death + plan-validation residue); deck record not empty at open.

## Orch disambiguation BEFORE any coder cycle (l2t0930, first-hand)

- Server arm-log (trunk .run/backend.log): the 6 failing turns are
  'model ignored forced tool call; coerced JSON args after stop as agent_intent
  contentPreview="<empty>"' + agent-summary success:false turns=2 toolCalls=0. That is
  the SAME degenerate forced-tool-call class already root-caused 2026-10-26 to the
  OpenRouter upstream 'InferenceNet' (NO-PROPOSAL-EMPTY-ARGS, lane2-config.yaml:120,
  evidence/orproxy-l2t2130/, mitigated by the provider.ignore=[InferenceNet] passthrough
  proxy cl-l2-orproxy-l2t2130 @127.0.0.1:18099).
- PROXY CRASHED TWICE inside the gate window: ERR_HTTP_HEADERS_SENT at 09:04:49 (auto-
  restarted 3s) and again ~09:08:12 (journal). The reviewer's failing turns are within
  its own run window; a crash-window request cannot surface 'no usable draft
  arguments' (connection refused instead) — but a DEGRADED (non-crashed) upstream route
  is exactly the documented InferenceNet signature, and the proxy cannot prove which
  upstream served each call unless capture was on (CL2_ORPROXY_CAPTURE=1 was off).
- LIVE PROBE at 09:5x through the proxy, same model + forced tool_choice agent_intent,
  'Place a 96-well plate on the deck.': VALID tool call (finish=tool_calls, real
  arguments, 1.3s). Upstream is healthy RIGHT NOW.
- CONCLUSION (assessment, not proven fact): the D1-D5 cluster is most plausibly
  environment (upstream degeneration window and/or 237-msg shared-thread saturation —
  the L2-THREAD-SCOPED-1 contamination is real and the deck thread carried tier-1 +
  plan-validation residue) — the reviewer's own hypothesis, independently supported by
  the arm-log signature and the healthy live probe. NO coder fix run is justified on
  this evidence; the uifix chain's unit+advc gates already passed on exactly these
  surfaces.

## NEXT TICK STARTS HERE

A. RE-GATE 5 with thread hygiene (the reviewer's own recommended next step):
   1. Give the gate a CLEAN thread. Cheapest correct lever TODAY: the reviewer drives a
      deck whose chat thread carries none of the residue. The thread store keys
      (surface,user) — no per-tab isolation until L2-THREAD-SCOPED-1 lands — so either
      (a) reset/clear the lane data repo's event-editor thread for USR-BRAD on the lane
      TEST data (lane data is TEST DATA per Brad; orch may clear it), or (b) mint a
      distinct viewer identity for gates (check viewer ACL: gate fixtures need USR-BRAD
      ACL per skill computable-lab references — verify before inventing a user).
   2. RE-SEED the deck fixture: plan-main.json claims deck e0bedf9b 'EMPTY at plan
      time' — it is drifted (2 draft events). Re-seed the two drive decks
      (e0bedf9b, e5bb716f) to the planned pre-state from the seeded-record source used
      at 20261027T192830Z (find the seeder: grep receipts dir + old handoffs; if no
      seeder exists, orch-authored reset via lane API is permitted on TEST data).
   3. Re-gate 5 TIER-2 DIRECTLY (tier-1 already proved fragile twice on this plan;
      ladder record: tier-1 died l2t0830, tier-2 full pass-through l2t0930). Absolute
      hermes path. Unique receipts gate-l2t<tick>-regate5-tier2.
   4. If re-gate 5 STILL shows the D1 wall on a clean thread + fresh upstream probe
      -> THEN it is product: fix run 4 on a free fleet slot, SAME worktree/branch
      cl/lane2-suite-a-uifix1-l2t1755, defect list = D1/D4/D5 verbatim + arm-log lines.
B. Small-item candidates (do NOT bundle into gates): D6 per-well pixel paint decision;
   mint-row absence arm needs a drive that organically produces cards-WITH-rows (the
   P4 material ambiguity with a real seeded candidate library); proxy
   ERR_HTTP_HEADERS_SENT crash-on-client-disconnect bug (infra, one-file fix candidate —
   wrap res.write after head-sent; it has restarted cleanly 2x, low urgency, but it
   crashed DURING gates twice).
C. Fleet slots: BOTH FREE by design (queue launchers WELLSET/THREAD-SCOPED self-fire on
   the SUITE-A done-flip; pollers run-p1159102/run-p1159104 caps ~15:13 — if re-gate 5
   ACCEPTs, mark SUITE-A done under lock and the launchers fire).
D. MOUNT-NONEVENT-1 / MATRES-REPLAY remain AWAITING-BRAD — never re-asked, unchanged.

## LIVE AT CHECKPOINT (do not duplicate)
- No live workers. Tier-2 gate EXITED clean (unit inactive). Both fleet slots free.
- WELLSET + THREAD-SCOPED pollers live (caps ~15:13).
- Trunk 538499cf (docs tip over 0e6eb598). :5193/:3093 200. Proxy live (listening 18099,
  restarted 09:08).
- SUITE-A fix-run ledger unchanged (fix3 #1, fix4 #2) — the tier-2 'fix' verdict was
  NOT routed to a coder cycle; it is under orch environmental triage per above.

## assumptions
- Carried: AS-L2T0350-FIX2-DEG-ARMS, AS-L2T0310-TSC-BASELINE-20, AS-L2T0310-CLOFIBRATE-
  MINT-FOLLOWUP, AS-L2T0455-SLOT1-PIDFILE-STALE, AS-L2T0520-CHATUI-TOPOLOGY,
  AS-L2T0520-CHATUI-LEGD-GATE, AS-L2T0540-FIX2-TOKENCAP-DEATH, AS-L2T0540-TSC-COUNT-
  DYNAMICS, AS-L2T0630-ADVC-TSC-20-20, AS-L2T0735-FIX3-REPORT-20-20-CONFIRMED,
  AS-L2T0825-PIDFILE-DOLLAR all stand.
- OPEN EVIDENCE DEBT: AS-L2T0340-GATE3-TRAIL-COLLISION — cleared: tier-2 honored the
  unique dir and rendered full cited receipts. Retired here.
- AS-L2T0930-REGATE4-D1-ENVIRONMENTAL (EVIDENCE DEBT OPEN): the D1-D5 cluster is being
  treated as environment (upstream degeneration / shared-thread residue), NOT product,
  on arm-log signature + healthy live probe + reviewer hypothesis concordance; no coder
  cycle was burned on it. Value: re-gate 5 on a clean thread will confirm or falsify.
  Cleanup: re-gate 5 result. Owner: orchestrator.
- AS-L2T0930-DECK-FIXTURE-DRIFT: gate plans assumed an EMPTY deck; decks e0bedf9b/
  e5bb716f carry residue (2 draft events, placements). Gates must re-seed or disclose;
  re-gate 5 prompt MUST state the true pre-state. Owner: orchestrator. Evidence debt
  until re-gate 5 runs on a declared pre-state.
- AS-L2T0930-PROXY-ROUTE-OPAQUE: proxy capture (CL2_ORPROXY_CAPTURE) was OFF during the
  gate window, so per-call upstream provenance is unavailable for the failed turns.
  Turn capture ON for re-gate 5 (cheap, evidence/orproxy-*). Owner: orchestrator.

## HEALTH / BUDGET
Entered ~09:12, budget crossed ~10:00. Actions this tick: reconciled tier-1 (dead,
partial receipts, not a verdict), fired+monitored tier-2 (real VERDICT: fix read
first-hand, report + trail + shots opened), triaged the defect cluster against the
server arm-log + lane config + proxy journal + a live forced-tool probe (healthy),
annotated the SUITE-A task block twice under queue lock, patched
cl-coder-launcher-pattern (systemd PATH pitfall), this handoff. No task marked done.
