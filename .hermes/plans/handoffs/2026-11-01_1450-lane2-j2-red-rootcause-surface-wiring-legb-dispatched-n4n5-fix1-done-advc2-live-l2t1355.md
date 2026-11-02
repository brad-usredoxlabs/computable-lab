# Handoff — lane 2 · 2026-11-01T14:50 EDT (l2t1355 — LIVE J2 RUN 1 RED -> ROOT CAUSE FOUND (surface never threaded on the live event-editor path); LEG B CODER DISPATCHED; N4N5 FIX1 DONE + ADVC c2 LIVE)

## Reconcile (all first-hand)
- Prior handoff (l2t1210 final) obligations picked up clean: N4N5 fix-run ARMED, INTENTID live-J2 obligation OPEN, cards wake-on-change only.
- Exa tripwire: OK (present + consistent). Stack :3093/:5193 http=200.
- Brad cards md5 at due-check: TOKENSITE fix-run-2 74692e8b (answer box still `<brad-answer></brad-answer>`, mtime 12:37 = filing time), LABSTATE-FIXRUN3 8fdc840f, MOUNT f65d32b6, LEG-G b13139b7 — ALL UNCHANGED, none re-asked, silence != approval.
- Fleet at tick start: slot-0 flock HELD (lane-1 FAME3FIX1 launcher 3917316, alive 35min), slot-1 FREE; tb-0/tb-1 both FREE (N4N5 worker had exited 13:18 per prior handoff; confirmed via its DONE marker + exit).

## Root-cause finding (the tick's core result) — LIVE J2 criterion-(3) RED, run 1/5
- Ran `python3 run-journeys.py --journey J2 --advisory --json` (trunk ffe13273, live sampler, zero interception): RED-ADVISORY, receipt /home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261101T185646Z (route_handlers_used=0, real transport — evidence clean). Violation: pre-answer intentId `add-trypsin-edta-dmem-fbs` != answer-turn `add-trypsin-dmem-fbs`; agent summary turns=1 toolCalls=1 (the MODEL answered).
- .run/backend.log shows NO fold-null / folded / identity-carried lines on EITHER turn -> the whole shorthand answer arm (AgentOrchestrator.ts:1402, gated on `shorthandSurface`) never ran.
- ROOT CAUSE, verified first-hand three ways: (a) receipt request bodies for /api/ai/draft-events/stream contain NO `surface` field — aiClient.ts:242-243 routes the event-editor surface to the legacy endpoint and :279-281 deliberately omits surface from its JSON body; (b) AIHandlers.ts draftEventsStream (:297+) never reads surface and calls orchestrator.run WITHOUT it -> `surfaceName = surface ?? 'default'` (:1289) -> surfaceDraftsShorthand('default') false (the DATA lists only run-workspace + event-editor); (c) orch re-POSTed the receipt bodies verbatim: reproduced the RED turn with zero fold lines; a `surface:'event-editor'` control POST also stayed 'default' — the handler drops it before run(), confirming the fix belongs in BOTH client and handler.
- CONSEQUENCE (bigger than INTENTID): on the LIVE event-editor chat the deterministic answer fold, the repeat-ask ledger, the event_graph refusal and the no-model wall have ALL been dead — the ANSWER-CHANNEL-1 yaml fix repaired the DATA list but this endpoint never passes a surface for the DATA to match. The unit tests never caught it because they call orchestrator.run directly with a surface. This is the missing wire the fold-null saga kept circling.

## Actions taken
1. N4N5 FIX RUN 1 DISPATCHED 13:54 (first action per prior handoff): unit cl-l2-n4n5-fix1-l2t1355 (systemd-run survivor), launcher launchers/worker-HARNESSMAINT-fix1-l2t1340.sh holds tb-slot-0 flock for session life, prompt prompts/coder-HARNESSMAINT-fix1-l2t1340.txt (defect list verbatim), log logs/worker-HARNESSMAINT-fix1-l2t1340.log. EXITED rc=0 14:06: FIX1 DONE 481c776a2b5439e828315276210ffd91d566b30a (code: ui-drive comment honesty + narrowed violation text + self-check 2e limitation-pin arm; docs 8928e489 append-only §5 item). Tree clean; fix touched ONLY the 3 owned harness files + report.
2. ADVC CYCLE-2 (N4N5, RESTRICTED D1 closure + regression) DISPATCHED 14:45: cloud deepseek, unit cl-l2-advc-harnessmaint-c2-l2t1445, prompt prompts/advc-HARNESSMAINT-c2-l2t1445.txt (A1 disclosure honesty, A2 limitation-pin real + runs SELFCHECK PASS, A3 regression incl. cycle-1 accepted scope byte-stable + check-gate over the REAL receipts root, A4 boundary, A5 mutant honesty), report owed reviews/L2-HARNESS-MAINT-N4N5-advc2-l2t1445.md, log logs/advc-HARNESSMAINT-c2-l2t1445.log. On ACCEPT -> orch self-verify (selfcheck + mutants first-hand) -> merge --no-ff -> lane gate re-green. 2nd fix verdict = architect desk.
3. INTENTID LEG B (surface threading) CLAIMED + DISPATCHED 14:40:57: fleet slot-1 flock LOCK-ACQUIRED (slot-0 was held by lane-1's FAME3FIX1; stagger legal — last fleet :18080 launch 13:16:23 >60min). Unit cl-l2-intentid-legb-l2t1415, launcher launchers/queue-INTENTID-legB-l2t1415.sh (flock-queued, stagger loop over both slot pid files), coder launcher 4072951 (slot-1 pidfile), SAME worktree/branch wt/L2-INTENTID-REDRAFT-1-lane2 / cl/lane2-intentid-redraft-1 (leg A tip 6cc8c3b8 verified base, tree clean), prompt prompts/coder-INTENTID-legB-l2t1415.txt, report deliverables/L2-INTENTID-REDRAFT-1-report.legB-l2t1415.md, marker INTENTID-LEGB DONE <40sha>. Scope: RED-first handler test (run() receives surface='event-editor'; absent-surface byte-identical), aiClient includes surface in the event-editor JSON body, draftEventsStream threads it conditionally-spread. Do NOT re-dispatch while 4072951/hermes child alive. On DONE -> advc (cloud, restricted leg B diff) -> self-verify -> merge -> RESTART (client+handler both touched) -> LIVE J2 5/5 obligation resumes (runs 1-? restart at the merged candidate; the pre-fix RED does NOT count toward or against the 5).
4. Queue updated under flock (INTENTID leg-B block, N4N5 fix1+advc-c2 block). assumptions.md: 3 entries appended (below).

## Queue state at exit
- L2-INTENTID-REDRAFT-1: in-progress; LEG B CODER LIVE (fleet slot-1, 14:40; expected ~60-90min per role history; 2x ~15:45, 3x ~16:40 per 7b). Live-J2 obligation: run 1 RED pre-fix (root cause found); 5/5 count starts against the post-leg-B merged trunk. AS-TJ1-J2-INTENTID-FLAP OPEN.
- L2-HARNESS-MAINT-N4N5: in-progress; FIX1 DONE 481c776a; ADVC c2 LIVE (cloud). On ACCEPT -> self-verify -> merge (harness-only, zero YAML).
- AWAITING-BRAD (wake-on-change, all UNCHANGED, not re-asked): LABSTATE-CONTENTS1 token-data fix-run-2 card (74692e8b, answer box empty), LABSTATE-FIXRUN3 boundary (8fdc840f), MOUNT-NONEVENT-1 (f65d32b6), L2-CHAT-UI-1-LEG-G + CHATHOST-SWEEP-1 (b13139b7).
- L2-TRUNK-JOURNEYS-1, WELLSET-RESOLVER-1: done. No new ready/todo claim this tick — the two in-progress items own the fleet and tb capacity that matters; the next todo items are all Brad-card-gated.

## Fleet/capacity at exit
- slot-0 HELD lane-1 FAME3FIX1 (3917316, since ~13:16, alive). slot-1 HELD lane-2 LEGB (4072951, 14:40). Fleet coder capacity fully consumed; stagger clock now 14:40 — no fresh :18080 launch before ~15:40 anyway.
- tb-0/tb-1 FREE at exit (fix1 exited 14:06, released the flock). advc c2 is cloud — no local slot.
- Stack healthy; nothing merged this tick; no restart needed (no YAML, no trunk writes).

## assumptions (open evidence debt carried forward)
- NEW AS-INTENTID-LEGB-SURFACE-ROOTCAUSE: OPEN — cleared when the leg-B handler RED->GREEN test lands on merged trunk (root cause itself is first-hand-verified; the assumption is that the WIRING alone flips the live path, i.e. no second latent blocker sits behind it).
- NEW AS-LEGB-SCOPE-SMALLEST: surface threading = wiring, not policy (activates approved DATA membership); advc grades it, routes back if contested.
- NEW AS-N4N5-LIMITATION-PIN-ARM: the 2e arm pins a known residual per the reviewer's fix direction, not a pass claim; advc c2 A2 re-grades.
- AS-TJ1-J2-INTENTID-FLAP: OPEN — clears at leg-B merge + live J2 5/5.
- AS-FLEETSLOT-PIDFILE-STALE, AS-B9B998CD-TRUNK-DIRECTFIX, AS-INTENTID-CMDLINE-PROMPT-CHECK-FIELD, AS-FIX4-STAGGER-VIA-AGE-NOT-EXIT: unchanged.
- AS-INTENTID-DEFECT4-REPIN, AS-READINGCARD-3FAIL-PREEXISTING, AS-TOKENSITE-FIXRUN2-NOTDISPATCHED-BEFORE-CARD: unchanged (last stays open until Brad's verbatim answer).
- AS-ANSWERFOLD-* CLOSED.

## NEXT TICK (resume condition)
1. LEG B: poll logs/coder-INTENTID-legB-l2t1415.log for INTENTID-LEGB DONE/BLOCKED; on DONE -> advc cloud (restricted leg B diff, mutant: absent-surface byte-identity) -> self-verify -> merge -> RESTART (vite+tsx both serve the fix) -> LIVE J2 runs begin (5/5 no-fake, --advisory until green streak proven; receipts under the lane receipts root) -> retire carve-out + mark INTENTID done + AS-TJ1-J2-INTENTID-FLAP + AS-INTENTID-LEGB-SURFACE-ROOTCAUSE close.
2. N4N5 advc c2: on ACCEPT -> self-verify (selfcheck 50+arms + route_api_wrapped mutant first-hand, check-gate real-root) -> merge --no-ff -> gate re-green -> done. On FIX -> architect desk (cycle cap).
3. Cards: md5-sweep all four Brad cards; consume any verbatim answer.

## TICK CONTINUED (l2t1355 cont., ~15:05) — N4N5 ACCEPTED + MERGED + DONE
11. ADVC c2 EXITED 14:47 rc=0 VERDICT accept, DEFECT COUNT 0 (A1-A5 PASS incl. an independent
    mutant on the 2e limitation-pin; cycle-1 accepted breadth byte-identical).
12. ORCH SELF-VERIFY first-hand: node --check ui-drive.cjs OK; test-channel-selfcheck.py
    SELFCHECK: PASS cwd=worktree; 3-dot diff base 943c4314 (ancestor of tip) = 6 files +576/-30,
    harness dir + deliverables ONLY (zero product code, zero YAML). MERGED --no-ff -> trunk
    dacf6ed7. POST-MERGE gate re-green: check-gate.py over the REAL receipts root
    GATE-VERDICT green rc=0. ZERO YAML -> no restart. Queue: N4N5 status -> done + DONE block.
    Closes AS-N4N5-LIMITATION-PIN-ARM.
## FINAL FLEET AT EXIT: slot-0 lane-1 FAME3FIX1 (13:16, alive); slot-1 lane-2 LEGB launcher
## 4072951 + hermes child 4072986 ALIVE (14:40; 2x ~15:40, 3x ~16:40 per 7b). tb 0/1 free.
## Stack :3093/:5193 200. Trunk dacf6ed7. NEXT TICK = the handoff's NEXT TICK list (LEGB advc
## first; J2-live 5/5 resumes only after the leg-B merge + restart).
