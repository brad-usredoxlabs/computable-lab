# LANE 2 HANDOFF — l2t2130 (2026-10-24T21:55 EDT) — NO-PROPOSAL-EMPTY-ARGS ROOT-CAUSED (InferenceNet degenerate tool-calls); lane routed via provider-ignore proxy; browser gate ATTEMPT-9 LIVE; checkpoint

Trunk: ce06b20b (docs) / product tip 718fe21d (unchanged this tick — nothing merged, no coder ran).
Stack UP: :5193 200, :3093 200 (restarted through the new proxy path; config =
lane2-config.yaml, maxTokens 65536 intact). Brad's stack untouched all tick.

## ROOT CAUSE (orch-owned diagnosis, first-hand capture — handoff l2t2055 step 1 executed)

Method: orch passthrough proxy (scripts/or-openrouter-proxyl2t2130.mjs, systemd
cl-l2-orproxy-l2t2130, :18099) sat between the lane backend and OpenRouter and captured
the REAL request + raw SSE to evidence/orproxy-l2t2130/. One probe turn reproduced the
class deterministically.

Finding (sse-004.log): upstream provider "InferenceNet" streams valid reasoning for the
canonical 68K-prompt turn, then emits the forced agent_intent tool_call as THREE deltas:
header (name, id), empty-args, and ONE 60-char stub `{"intent": "event_shorthand",
"action": {"action": "focus"}}`, finish=tool_calls, native_finish_reason=stop, real usage
(prompt 41166 / completion 1183 with 1109 reasoning tokens). The server's stream assembly
(AgentOrchestrator.ts:2037-2050 toolCallAcc) is CORRECT — it faithfully concatenates what
arrives; draftArgDiagnostics then honestly names it. NOT a product defect. NOT the
maxTokens cap (attempt-7's guess; the cap warning was already gone). The model NEVER
streamed the shorthand payload on that upstream — reasoning tokens were spent and the
provider cut tool-arg emission to a stub.

Replay proof (same captured body, plain urllib, provider pinned):
  no preference        -> InferenceNet   args_len=60   5.4s   (degenerate, reproduces)
  {"ignore":["InferenceNet"]} -> OpenInference args_len=560 46s (VALID shorthand YAML)

## LANE REPAIR (authorized infra, lane-local, reversible)

- Proxy now rewrites every /chat/completions to pin provider.ignore=[InferenceNet]
  (always on; per-call capture is env-gated CL2_ORPROXY_CAPTURE=1). Unit has
  Restart=always RestartSec=3.
- lane2-config.yaml ds4.1-flash-OR baseUrl -> http://127.0.0.1:18099/api/v1 (comment
  documents the why + evidence path). maxTokens 65536 kept.
- Post-fix probes (/tmp/rg1/probe.mjs): 2/2 drafting turns SUCCEED — backend.log
  success=true clarifications=3 and clarifications=2, card hold renders in the UI.
  AS-LANE2-LANECFG-MAXTOKENS-65536 evidence debt CLEARED (lane drafting turns succeed;
  the cap was never the root cause).

## GATE ATTEMPT-9 (LIVE at checkpoint)

Unit cl-l2-gate-reviseghost-a9-l2t2130 (tier-2 cloud deepseek via OpenRouter), prompt
prompts/gate-REVISEGHOST1-a9-l2t2130.txt (a8 prompt with: candidate ce06b20b/718fe21d,
root-cause + proxy facts embedded, no-proposal re-send allowance tightened to 2, drive10.mjs
pin for reuse), log logs/gate-REVISEGHOST1-a9-l2t2130.log, receipts
/home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-24-attempt9/. Store warmed pre-dispatch.
Dispatched ~21:50 EDT. Expect ~30-60 min; 2x-watch ~22:50; rule 7b (3x -> change approach).
NOTE: the drafting sends the gate DRIVES in the UI go through the lane backend -> same
proxy -> the fix protects the gate drive itself. (The reviewer's own reasoning calls go to
OpenRouter directly via its profile, unaffected by the proxy.)

## NEXT TICK (priority order)

1. ATTEMPT-9 verdict (read receipts report.md + trail.json first-hand):
   - accept -> REVISE-GHOST-1: all gates have now passed (advc c3 ACCEPT, orch self-verify,
     merged 718fe21d, fix-2 live corroboration measured clean in a7+a8, F1 via a9) ->
     mark DONE under queue lock + done-trail; then W2-11-ZYMO-GOLDEN-DEMO D4 (read its
     criteria block; if its flows are covered by attempt-9's receipts, adjudicate directly).
   - fix -> defect list to a fix run per normal (fleet lock free).
   - BLOCKED with a NEW provider name in backend.log/SSE -> add provider to proxy ignore
     list (assumption AS-LANE2-INFERENCE-PROVIDER-ROUTE-VIA-PROXY), re-probe, attempt-10.
   - Dead/hang/no-trail -> ladder 6c tier rules (a9 is already tier-2; then orch-own the
     drive with drive10.mjs and judge artifacts).
2. Fleet coder IDLE (lock free; pid file residue = stale l2t2350 entry, no holder alive —
   flock itself is free). Ready todo set: 0 (all remaining items done/in-progress/blocked).
3. MATRES-REPLAY: unchanged Brad-blocked (MATRES-0 ratification) — do NOT re-ask.
4. Equipment-schema product gap stays NOTED for Brad/architect.

## Blockers / open obligations (carried)

- REVISE-GHOST-1: in-progress; sole gate = browser F1 leg, attempt-9 LIVE on the fixed
  route. fix-2 obligation (b) already MEASURED CLEAN twice (a7 12 states, a8 8 states).
- attempt-6/7/8 acceptance debt carries; a9 supersedes on evidence.
- W2-11 D4: gated on the same flows.
- MIXFRAC-1 gate obligations carry unchanged. GAPCARD/CELLRATE main-promotion debts carry.
- EVIDENCE DEBT CLOSED this tick: AS-LANE2-LANECFG-MAXTOKENS-65536 (drafting succeeds).
- OPEN evidence debt: AS-LANE2-INFERENCE-PROVIDER-ROUTE-VIA-PROXY (routing fix sufficient
  for the class) — clears on attempt-9 accept.

## assumptions:
- NEW: AS-LANE2-INFERENCE-PROVIDER-ROUTE-VIA-PROXY (proxy route permanent; InferenceNet
  unreliable for forced-tool streaming; if class recurs with a different provider name,
  extend ignore list, do NOT re-open REVISE-GHOST-1 as product defect; OPEN until a9
  accept), AS-LANE2-OPENROUTER-REPLAY-METHOD (capture+urllib-replay triage idiom) — both
  appended to lanes/2/assumptions.md.
- CLEARED: AS-LANE2-LANECFG-MAXTOKENS-65536 (evidence debt closed: 2/2 post-fix drafting
  successes; cap was not root cause).
- CARRIED (no change): AS-LANE2-DRIVE-GAP-READING-CARDS, AS-LANE2-STACK-RESTART-STALE-HOLDER,
  AS-LANE2-EQUIPMENT-WIP-SYMLINK-RESIDUAL, AS-LANE2-TASKLIST-EDIT-INSERT-ONLY,
  AS-LANE2-ADVC-C2-PROMPTS-RATIFICATION-EMBED, AS-F4-1/F4-2/F4-3, QUEUE-PIDWATCH-BELT,
  ADVC-PRESTALL-PROMPTS, D1C3-STRAY-RECEIPTS, QUEUELOCK-FILE-RESIDUE, FIXQUEUE-FIFO-ORDER,
  MENU CAND set, READCARD-CODER-SELFREPAIR, READCARD-D1-RATIFIED, CHAING1C-TIER2-DIRECT,
  CHAIN-CARD-LOCATION, APP-TSC-BASELINE-28, PLAYWRIGHT-EXEC-PIN, PANEL set,
  CHAIN-DEFECTS-ORCH-VERIFIED, CHAIN-OQ2-CORRECTION, ANSWERFOLD-FIXTURE-FRACTIONS,
  FULFIL-CWD-CONVENTION, GAPCARD-PARAMINPUT-TRACKED-COPY,
  CELLRATE-OQ1-PRECLEARED-TRACKED-COPY, PROTOAI13-MENU-DRIFT-NEW-PREREG,
  CHAIN-G1B-VISION-FIFO, ANSWERFOLD-BASE-PRECELLRATE, SPECCOMP-EMPTYARG-QUIRK,
  ROLEAXES-COMPRESSION-EXIT-COMPLETE, BACKEND-HEALTH-ROUTE, FLOCK-NOFIFO-RACE,
  TASKLIST-STATUS-NOT-LANDED-TWICE, ATTEMPT6-TRUNK-NOFIX, ROWCOUNT-MATCHER-CALIBRATION,
  AS-LANE2-ARCH-SUPERSEDES-PRESTAGED-GATE.

## live-worker checkpoint at exit (~21:55 EDT)
- LIVE: cl-browser-reviewer attempt-9 (unit cl-l2-gate-reviseghost-a9-l2t2130, cloud
  OpenRouter tier — no local slot used; started ~21:50; expected ~30-60 min).
- LIVE INFRA: cl-l2-orproxy-l2t2130 (Restart=always; DO NOT stop — the lane backend's
  inference baseUrl points at it; if it dies the class re-appears).
- NO coder (fleet lock free), no queue units, no other workers.
- Trunk HEAD ce06b20b; :5193 200, :3093 200. Brad's stack untouched.
- Pin: /tmp/rg1/drive10.mjs, /tmp/rg1/probe.mjs, evidence/orproxy-l2t2130/, proxy script
  with capture env-gate, prompts/gate-REVISEGHOST1-a9-l2t2130.txt.
