# Lane-2 handoff — tick l2t0135 (2026-10-26 ~02:00 EDT) — 116th

## HEADLINE
L2-CHAT-1's first coder run DIED instantly: engine returned "HTTP 400: prepared prompt
exceeds Engine max_context 131072" (launcher logged CODER EXITED rc=0 misleadingly).
Re-dispatched on slot-1 with a trimmed prompt; confirmed the new run streams (no repeat
400). Composer delivered the L2-FREEFORM-1 draft; orch reviewed, cite-verified, promoted
it to canonical, ruled OQ1–OQ4, annotated the task block with a HARD dispatch gate.

## LIVE WORKERS (do not duplicate)
- L2-TERM-1: fleet SLOT 0, launcher 683542, hermes child 708467. MOTION CONFIRMED:
  RED commit a1cecc17 on branch cl/lane2-l2term1-l2t0035 + working-tree edits
  (resolvers.ts/.test.ts, ProposedGraphModal, SlashSuggestionList). Report owed
  deliverables/L2-TERM-1-report.l2t0035.md. Expected done ~04:00.
- L2-CHAT-1 (RUN 2): fleet SLOT 1, systemd unit cl-l2-chat1-redisp-l2t0135, launcher
  780858, hermes child 780864, log logs/coder-L2CHAT1-l2t0135.log, prompt
  prompts/coder-L2CHAT1-l2t0135.txt (trimmed 1360 B), report owed
  deliverables/L2-CHAT-1-report.l2t0135.md (write-immediately-first instruction added).
  SAME worktree wt/L2-CHAT-1-lane2-l2t0035 / branch cl/lane2-l2chat1-l2t0035 (was clean
  at dac9f515, no work lost). Started 01:39:47. Expected ~3.5h -> ~05:10.
  slot-1 pidfile = 780858 (fixed: first write captured literal '$' due to quoting).
- cl-spec-composer FREEFORM-1: EXITED rc=0 01:47:52, deliverable received + promoted.

## DEATH DIAGNOSIS (cause pinned, first-hand log evidence)
coder-L2CHAT1-l2t0035.log final lines: worktree checkout OK, then
"HTTP 400: prepared prompt exceeds Engine max_context 131072". The dispatch prompt itself
was only 1507 B — the 131K overflow came from hermes profile bootstrap (cl-coder
AGENTS/config + tool defs) for THIS run, engine-side. RUN 2 (identical mechanics,
trimmed prompt) streams without the 400 as of 01:57 — monitored. IF RUN 2 repeats the
400: the cl-coder profile bootstrap is the suspect; fix = trim
/home/brad/.hermes/profiles/cl-coder/ context (orch-owned infra, not coder work).

## FREEFORM-1 SPEC RATIFIED (no coder — gated)
Canonical: .hermes/plans/2026-10-26_L2-FREEFORM-1-freeform-legs.md (composer draft
31.7 KB promoted l2t0135; OQ rulings appended in-file).
Orch cite spot-checks CONFIRMED first-hand at dac9f515: shorthandChat.ts bindRef
:244-252 fail-open; IntentCompileHandlers.ts :148 third-arg absent (grep
resolvedLabwares=0); AgentOrchestrator.ts :2676-2687 shorthand early-return, :4064+
empty guard arm-scoped, :2460-2462 doc-discussion shape; draftEmptiness.ts :40-51.
RULINGS: OQ1 per-event cards, whole-turn failure only when nothing binds;
OQ2 REFUSE sole-candidate unmatched (no fuzzy; alias policy needs Brad, out of scope);
OQ3 server structural marker + one client term via CHAT-1's module + drift pin same
commit; OQ4 requestId-keyed escalation N=1, no surface-membership change.
HARD GATE: dispatch only after L2-CHAT-1 MERGES (branches off post-merge tip).

## NEXT TICK (priority order)
1. Poll logs: TERM-1 logs/coder-L2TERM1-l2t0035.log + CHAT-1
   logs/coder-L2CHAT1-l2t0135.log for 'CODER EXITED rc=' AND report files
   (deliverables/L2-*-report.l2t0035.md / .l2t0135.md — reports are the completion
   artifact; launcher 'rc=0' alone proves NOTHING, see death diagnosis).
   CHAT-1: FIRST check the log for a repeat HTTP 400; if repeated, profile-trim route
   above, re-dispatch on slot-1 after it frees.
2. On coder exit: adversarial gate FIRST (unique path reviews/<ITEM>-advc1-l2t<tick>.md),
   then self-verify (real diff, targeted vitest cwd per report, sorted tsc vs baseline),
   merge --no-ff (sequential if both land: CHAT-1 first per l2t0035 handoff, re-run
   TERM-1 tests post-merge), restart stack if YAML touched, browser gate per item
   (receipts ~/.hermes/cl/receipts/<ITEM>/<ts>/). TERM-1 gate: DMEM picker tiers.
   CHAT-1 gate: draft->cards->ghosts->revise->remount->Apply + honest-wall adversarial
   turn; campaign gate doctrine: per-prompt deterministic probe AND vision receipts.
3. After CHAT-1 merge: dispatch FREEFORM-1 coder off new tip per canonical spec
   (worktree wt/L2-FREEFORM-1-lane2-l2t<tick>, unique report path) IF a slot is free.
4. L2-SUITE-A harness spec via composer once predecessors near merge.
5. Health-check :3093 /api/health + :5193.

## DECISIONS / ASSUMPTIONS
- AS-L2T0135-CHAT1-RUN1-ENGINE-400: run 1 died on engine max_context 400 despite a
  1507 B prompt (overflow source = profile bootstrap, engine-side). RUN 2 streams clean.
  Evidence debt: if run 2 also 400s, suspect cl-coder profile growth (OPEN).
- AS-L2T0135-FREEFORM-SPEC-RATIFIED: OQ1-OQ4 ruled by orch as above; reversible,
  evidence-based; no evidence debt.
- Carried from l2t0035 handoff, unchanged: AS-L2T0035-UC-SPECS-ORCH-AUTHORED,
  AS-L2T0035-TERMCHAT-ZONE-SPLIT, MATRES-REPLAY worksheet legs UNCHANGED-gated
  (Brad ruling outstanding, NOT re-asked), AS-LANE2-TRUNK-REPOINTED-TO-MAIN-MERGE
  (branches off current tip). Full carried evidence-debt list in l2t1330 handoff
  §DECISIONS; none cleared this tick, none new.

## LIVE AT EXIT
- coder L2-TERM-1 (slot 0: launcher 683542 / child 708467) — RED committed, GREEN phase.
- coder L2-CHAT-1 run 2 (slot 1: launcher 780858 / child 780864) — orienting.
- cl-l2-orproxy-l2t2130 — DO NOT stop. Foreign architect procs — do not touch.
- Lane stack serving dac9f515 (:3093 /api/health 200, :5193 200). Brad's stack untouched.
- Fleet coder capacity: 2/2 slots LIVE (TERM-1 + CHAT-1). Do not dispatch a third.
