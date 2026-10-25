# PROTO-AI-13 — Router spike VERDICT report (lane 2, worker l2t1955)

Item: PROTO-AI-13 (Spike verdict report — publish gate evaluation, recommend next wave
or remediation). Lane 2 · campaign `ai-protocol-edit-and-router`. NO product code.
Worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-13-lane2-l2t1955`, branch
`cl/lane2-protoai13-l2t1955`, base PINNED_TIP `21defa3922200b0fdb29d5c9a1a18926a4cd8ebb`
(verified at dispatch: `git -c core.fileMode=false log --oneline -3` -> 21defa39 head).
Spec: `.hermes/plans/2026-10-23_2030-PROTO-AI-13-spike-verdict-spec.md` (orch-authored, binding).
Signed contract: PROTO-AI-12 pre-registration §2, SIGNED AS WRITTEN by Brad 2026-10-06T08:52 EDT
(`/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-12-prereg-approval.md`; latency number
p95 router-pick <= 2000 ms on appliance-2 CPU). Thresholds were NOT touched; the scorer
hardcodes them from the signed text.

## 1. Sample provenance

- Live telemetry (append-only, LIVE): `/home/brad/.computable-lab-lane2/shadow-router/events.jsonl`.
- Snapshot taken FIRST per spec (`cp` -> `evidence/events.l2t1955.snapshot.jsonl` in this worktree);
  the scorer scores the snapshot.
- Snapshot sha256: `ce625b65fbdfcd07bef3fe495ebfd7e6011cf3ce2f84bd7938117725b4a0eda6`
- Line count: 502 paired records (>= 500 signed minimum).
- ts range: `2026-10-06T19:39:04.400Z .. 2026-10-23T23:23:44.714Z`.
- At scoring time the live file was byte-identical to the snapshot (same sha256, same 502 lines —
  the scorer was also run directly against the live path and produced identical numbers;
  `evidence/score-raw.live.txt`). Assumption AS-PROTOAI13-SNAPSHOT-EQUALS-LIVE-AT-SCORE: the
  snapshot equals the live file at score time; if the file accrues later, the scorer re-run
  reproduces counts modulo newly appended lines (spec verification clause).
- Scorer: `scripts/shadow-router/score.l2tl2t1955.py` (CLI arg = events path; deterministic;
  no network, no LLM — it scores logged ids only, per the standing no-LLM-judge posture).
  Two consecutive reruns on the snapshot are byte-identical (`evidence/score-raw.rerun1.txt`
  vs `evidence/score-raw.rerun2.txt`, `diff` empty; both exit 1 — exit 1 is the deviation-flag
  signal, see §7).
- Record integrity: all 502 records carry the 8 core keys; 0 duplicate correlationIds; 0 blank or
  malformed lines. 51 records OMIT the optional `errorClass` key — this matches the shipped
  writer (`server/src/ai/shadowTelemetry.ts:51` `errorClass?:`, `:95` sets it only when defined;
  exactOptionalPropertyTypes: a clean pick omits the key rather than writing null). The scorer
  treats absence as clean and flags only inconsistent combinations (none found).
- Authoritative-side provenance detail: the big model changed across the window —
  `qwen3.8-flash-next` 225, `deepseek/deepseek-v4.1-flash` 204,
  `~deepseek/deepseek-flash-latest` 44, `qwen/qwen3.8-flash` 29. Router model is uniformly
  `lfm2.5-350m` (502/502).

## 2. Raw scorer output (verbatim, CODER-CAPTURED)

Raw file: `evidence/score-raw.l2t1955.txt` (command:
`python3 scripts/shadow-router/score.l2tl2t1955.py evidence/events.l2t1955.snapshot.jsonl`).

```text
==============================================================================
PROTO-AI-13 shadow-router verdict scorer (l2t1955)
==============================================================================
events file            : evidence/events.l2t1955.snapshot.jsonl
events sha256          : ce625b65fbdfcd07bef3fe495ebfd7e6011cf3ce2f84bd7938117725b4a0eda6
paired records (n)     : 502
ts range               : 2026-10-06T19:39:04.400Z .. 2026-10-23T23:23:44.714Z
router model(s)        : {'lfm2.5-350m': 502}
big model(s)           : {'deepseek/deepseek-v4.1-flash': 204, 'qwen/qwen3.8-flash': 29, 'qwen3.8-flash-next': 225, '~deepseek/deepseek-flash-latest': 44}

-- SIGNED THRESHOLDS (PROTO-AI-12 §2, signed as written 2026-10-06) --
overall agreement      : >= 95%
protocol_edit agreement: >= 98%
minimum sample         : >= 500 paired turns with >= 50 protocol_edit
latency ceiling        : p95 router-pick <= 2000 ms
denominator rule       : timeouts/abstentions/parse-failures INCLUDED (parse failure counts AGAINST)

-- SAMPLE GATE --
paired turns           : 502 (need >= 500) -> MET
protocol_edit turns    : 75 (need >= 50) -> MET
sample gate            : MET

-- PICK DISTRIBUTIONS --
routerPick:
  parse_failure         451  (89.84%)
  create_record          42  (8.37%)
  event_graph             9  (1.79%)
authoritativePick:
  event_shorthand       357  (71.12%)
  protocol_edit          75  (14.94%)
  event_graph            70  (13.94%)
errorClass:
  parse                 451
  None                   51

-- DENOMINATOR ACCOUNTING (primary = all paired records, as signed) --
  total in denominator : 502
  parse-failures       : 451  (count AGAINST)
  timeouts             : 0
  abstentions/other    : 0
  parseable intent picks: 51

-- AGREEMENT (PRIMARY, signed denominator) --
  overall              : 0/502 = 0.00%  (threshold >= 95%) -> NOT MET
  protocol_edit-class  : 0/75 = 0.00%  (threshold >= 98%) -> NOT MET
  (non-protocol_edit authoritative turns: 0/427 agree)

-- SENSITIVITY (four-intent-restricted denominator; NOT the verdict) --
  authoritative turns outside the pre-registered menu: 357
  restricted denominator : 145 (authoritativePick in ['event_graph', 'deck_layout', 'create_record', 'protocol_edit'])
  restricted agreement   : 0/145 = 0.00%
  restricted parse-failures: 117

-- CONFUSION MATRIX (rows = authoritativePick, cols = routerPick) --
auth \ router           event_graph    deck_layout  create_record  protocol_edit  parse_failure  row total
----------------------------------------------------------------------------------------------------------
event_graph                       0              0             20              0             50             70
deck_layout                       0              0              0              0              0              0
create_record                     0              0              0              0              0              0
protocol_edit                     0              0              8              0             67             75
event_shorthand                   9              0             14              0            334            357  <- post-prereg intent (router cannot pick it)
col total                         9              0             42              0            451            502
4x4 pre-registration submatrix (four intents x four intents) diagonal sum: 0

-- ROUTER PICK LATENCY (routerLatencyMs) --
  primary population   : ALL 502 paired records (parse-failures included, per the signed denominator rule)
    median / p95 / max : 149.0 / 315 / 1622 ms
  secondary population : 51 parseable intent picks only
    median / p95 / max : 152 / 191 / 199 ms
  ceiling              : p95 <= 2000 ms (primary) -> MET
  p95 method           : nearest-rank on sorted values, index ceil(0.95*n)-1

-- VERDICT --
  VERDICT: FAIL
  (follows the PRIMARY signed denominator; sample gate MET; overall NOT MET; protocol_edit NOT MET; latency MET)

-- DEVIATION FLAGS --
  FLAG: verdict FAIL: signed thresholds not met

exit code: 1

```

## 3. Metrics vs the signed thresholds

| Signed rule (PROTO-AI-12 §2, as written) | Measured (primary, signed denominator) | Status |
|---|---|---|
| overall agreement >= 95% | 0/502 = 0.00% | NOT MET |
| protocol_edit-class agreement >= 98% | 0/75 = 0.00% | NOT MET |
| >= 500 paired turns | 502 | MET |
| >= 50 protocol_edit turns | 75 | MET |
| p95 router-pick <= 2000 ms | 315 ms (primary, all 502) | MET |

Denominator accounting (signed rule: timeouts, abstentions AND parse-failures are IN the
denominator; a parse failure counts AGAINST, never skipped):
- total in denominator: 502
- parse-failures: 451 (89.84% of all turns)
- timeouts: 0; abstentions/other: 0
- parseable intent picks: 51 (create_record 42, event_graph 9; deck_layout 0, protocol_edit 0)

Router picks vs the big model's authoritative pick agree ZERO times — overall 0/502, and even
restricted to the 51 parseable picks, none matches its turn's authoritative intent
(the 4x4 pre-registration submatrix diagonal sum is 0).

Sensitivity reading (labelled, NOT the verdict — the verdict follows the primary signed
denominator): excluding the 357 authoritative turns outside the four pre-registered intents
gives a restricted denominator of 145 with agreement 0/145 = 0.00% (117 of those 145 are
parse-failures). The FAIL verdict is robust: even the most charitable denominator the data
permits fails both agreement thresholds by the same margin.

## 4. Confusion matrix (rows = authoritativePick, cols = routerPick)

```
auth \ router           event_graph    deck_layout  create_record  protocol_edit  parse_failure  row total
----------------------------------------------------------------------------------------------------------
event_graph                       0              0             20              0             50             70
deck_layout                       0              0              0              0              0              0
create_record                     0              0              0              0              0              0
protocol_edit                     0              0              8              0             67             75
event_shorthand                   9              0             14              0            334            357  <- post-prereg intent (router cannot pick it)
col total                         9              0             42              0            451            502
```

Reading: the 4x4 pre-registration submatrix has a zero diagonal — the router never produced the
authoritative intent of its own turn. Its only non-parse outputs (42 create_record, 9 event_graph)
land on wrong rows: 20 create_record picks against authoritative event_graph, 8 against
protocol_edit, 14 against event_shorthand; 9 event_graph picks against event_shorthand. The
authoritative side emitted no deck_layout or create_record turns in this window. The
event_shorthand-authoritative row (357) is broken out above and is structurally unmatchable
(see §5).

## 5. event_shorthand menu-drift finding (stated plainly)

The surface gained an intent the spike never registered a classifier for. First-hand:
- The big model's forced-tool intent enum today (`server/src/ai/submitSuggestionTool.ts:453`)
  carries ELEVEN intents: event_graph, deck_layout, create_record, protocol_edit,
  workspace_action, compose_workstate, compose_analysis, query_workstate_history,
  **event_shorthand**, compose_record_draft, compose_receiving.
- The shadow router classifies over exactly the FOUR pre-registration intents
  (`server/src/ai/shadowRouterAdapter.ts:39`: `INTENT_TOKENS = ['event_graph', 'deck_layout',
  'create_record', 'protocol_edit']`).
- 357/502 (71.12%) of authoritative picks in the window are `event_shorthand` — an intent added
  to the surface AFTER the 2026-10-04 pre-registration. For those turns the router CANNOT agree
  by construction: the correct answer is not in its menu.

What this means for any future routing wave: the evaluation target drifted out from under the
pre-registered classifier. A router trained/classifying over the four-intent menu is scoring
against a surface that is now majority something else; any future wave must (a) re-register the
evaluation against the CURRENT menu (a new pre-registration, signed BEFORE evidence — D5:
changing thresholds or the menu after evidence is a re-registration, never a tweak), and
(b) decide honestly whether a 350M CPU classifier can even cover an 11-intent menu, given this
spike's parse behaviour (89.84% parse_failure overall; PROTO-AI-12's §4 honest finding already
recorded 42/60 parse_failure on real calls with no prompt shape reliable). The drift does NOT
rescue the verdict: the four-intent-restricted sensitivity reading is 0/145 = 0.00%, so the
router fails even on the turns its menu could in principle have matched.

## 6. Latency vs the signed 2000 ms

Signed number (Brad, 2026-10-06): p95 router-pick <= 2000 ms on appliance-2 CPU.
Measured (routerLatencyMs, nearest-rank p95 on sorted values):
- PRIMARY population — ALL 502 paired records, parse-failures included (the signed denominator
  rule counts them, so the latency population should too): median 149.0 ms, p95 315 ms, max 1622 ms.
- SECONDARY population — the 51 parseable intent picks only: median 152 ms, p95 191 ms, max 199 ms.
- Ceiling MET under BOTH populations (315 ms and 191 ms, both <= 2000 ms).
- Disclosure vs orch pre-counts: the orch's preliminary line mixed the two populations
  (median 149 from all-records, max 199 from parseable-only). This scorer states both
  populations explicitly; no signed number changes.
- The serving latency ceiling is the ONLY signed criterion met. It shows the serving/host
  (appliance-2 CPU, LFM2.5-350M) is not the bottleneck — the model's classification and
  output-formatting reliability is.

## 7. Verdict (per the signed rules, not weakened)

VERDICT: **FAIL**

- Sample gate: MET (502 >= 500 paired turns; 75 >= 50 protocol_edit) — the gate opened, so the
  measurement is admissible and the verdict is FAIL, not INSUFFICIENT.
- Overall agreement 0.00% < 95%: NOT MET.
- protocol_edit-class agreement 0.00% < 98%: NOT MET.
- p95 latency 315 ms <= 2000 ms: MET.
- The verdict follows the PRIMARY signed denominator (all 502 paired records, parse-failures
  counting against). The sensitivity reading (§3) is reported honestly and does not change it.
- Scorer exit code 1 is the deviation-flag signal (verdict != PASS); it is the designed outcome
  here, not a scorer fault.

## 8. Recommendation (per D5)

D5 posture, binding in BOTH outcomes: the tiny model stays LOG-ONLY. It never drafts payloads,
never writes records, and gains no routing authority from this report. The shadow adapter and
telemetry may continue as measurement infrastructure; nothing in this verdict licenses routing.

Given FAIL, the recommendation is: **do NOT open a routing-enablement wave on this evidence;
recommend single-model operation as the default posture.** The big model keeps full authority
exactly as today; the measured alternative fails the pre-registered agreement bar by ~95
percentage points overall and ~98 on the campaign's own target class (protocol_edit), and it
fails even under the most charitable denominator.

If routing is still wanted later, remediation must be a NEW pre-registration (D5), not a
re-scoring of this corpus, and at minimum:
1. Re-register the menu: the evaluation must cover the CURRENT authoritative intent vocabulary
   (11 intents as shipped at `submitSuggestionTool.ts:453`), signed BEFORE new evidence.
2. Fix the parse contract first: 89.84% parse_failure means the dominant failure is the model's
   output framing, not intent selection; any wave must pre-register a parse-success floor
   (human-labelled fixtures, never an LLM judge) before agreement is even measurable.
3. Re-baseline against drift: the surface changes faster than a spike window (this corpus spans
   2026-10-06..2026-10-23 and the menu changed mid-window); a future gate needs a menu-stability
   pin or the denominator drifts again.
The serving machinery itself (appliance-2 CPU, p95 315 ms) is proven adequate and can stay up
log-only for a future pre-registered wave; the 350M classifier as currently prompted is not.

## 9. Files and verification handles

- Scorer: `scripts/shadow-router/score.l2tl2t1955.py` (worktree-relative).
- Snapshot: `evidence/events.l2t1955.snapshot.jsonl` (sha256 §1).
- Raw scorer outputs: `evidence/score-raw.l2t1955.txt` (snapshot), `evidence/score-raw.rerun1.txt`
  / `evidence/score-raw.rerun2.txt` (determinism proof), `evidence/score-raw.live.txt` (live-path
  run at score time).
- Orchestrator re-verification recipe: fresh `cp` of the live events file, then
  `python3 scripts/shadow-router/score.l2tl2t1955.py <snapshot>`; counts reproduce modulo newly
  appended lines; every number in this report is the scorer's raw output verbatim (§2).
- Touched paths (this worker, nothing else): the two deliverables above plus the snapshot/raw
  evidence copies under `evidence/`. No task-list, trunk, server/app source, events file, or
  threshold edits.

STATUS: complete
