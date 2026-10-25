# PROTO-AI-13 — Router spike verdict report (spec, orch-authored l2t1955)

Lane 2 · campaign ai-protocol-edit-and-router · dep PROTO-AI-12 (done). Branch off
`cl/integration-2` in your OWN worktree. ONE worker.

## Why now (orch measurement, 2026-10-23T20:0x EDT)
The pre-registered minimum sample is MET: shadow-router telemetry at
`/home/brad/.computable-lab-lane2/shadow-router/events.jsonl` has n=502 lines (>= 500
paired turns), with 75 authoritative protocol_edit turns (>= 50). Brad signed §2 of the
pre-registration AS WRITTEN on 2026-10-06 (decision artifact
`/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-12-prereg-approval.md`; latency number
p95 router-pick <= 2000 ms on appliance-2 CPU). The gate exists to be read.

## Orch's preliminary numbers (RE-DERIVE with your script; do not copy)
- 502 paired records; routerPick distribution: parse_failure 451, create_record 42,
  event_graph 9.
- Agreement routerPick==authoritativePick: 0/502 (0.00%) overall; 0/75 protocol_edit.
  Even the 51 non-parse picks agree 0 times.
- Router latency: median 149 ms, p95 315 ms, max 199 ms among non-parse picks (the
  signed latency bar PASSES; agreement fails overwhelmingly — thresholds overall >=95%,
  protocol_edit >=98%).
- 357/502 authoritative picks are `event_shorthand`, an intent added AFTER the
  pre-registration (the router classifies over the four pre-registration intents only).
  Those turns can never agree by construction. Your script MUST report BOTH readings
  honestly: (a) the pre-registration denominator as signed (all 502 paired records,
  parse-failures count AGAINST) and (b) the four-intent-restricted denominator
  (excluding event_shorthand-authoritative turns) as a labelled sensitivity analysis.
  The verdict follows (a) — pre-registration is binding and you may not change it.

## Deliverables (UNIQUE paths — suffixed token, never canonical names)
1. `scripts/shadow-router-score.l2t<token>.py` (lane worktree `scripts/shadow-router/`):
   reproducible scorer. Input: the events.jsonl path (CLI arg). Output: class counts,
   4x4 confusion matrix (plus the event_shorthand row broken out), agreement overall and
   protocol_edit-class, timeout/parse-failure/abstention counts in denominator, latency
   median/p95/max, verdict PASS/FAIL/INSUFFICIENT against the SIGNED thresholds
   (>=95% / >=98% / n>=500 with >=50 protocol_edit / p95 <=2000 ms). Exit non-zero on any
   deviation flag. Deterministic: no network, no LLM.
2. `.hermes/plans/PROTO-AI-13-report.l2t<token>.md`: the verdict report. Sections: sample
   provenance; metrics vs signed thresholds; confusion matrix; the event_shorthand menu
   drift documented as a finding (the surface gained an intent the spike never
   registered a classifier for — state what that means for any future routing wave);
   latency numbers vs the signed 2000 ms p95; remediation or single-model recommendation
   (D5: in BOTH outcomes the tiny model stays log-only; it never drafts payloads, never
   writes records; PASS only produces a recommendation memo for a future
   routing-enablement wave, no routing authority).
3. Run the scorer against the real file; paste raw stdout into the report. Report must end
   with exactly `STATUS: complete`.

## Hard rules
- DO NOT touch the thresholds, the events file, or any server/app source. You own only
  the two unique-path deliverables (scripts/ and .hermes/plans/ inside YOUR worktree).
- Do not edit the task list. Do not merge.
- No LLM judge for any correctness claim (standing posture): you are scoring logged ids.
- If the file's last timestamp moves under you (live accrual), snapshot it to your
  worktree first (`cp` + record sha256 in the report) and score the snapshot.
- Verify at dispatch tip: `git -c core.fileMode=false log --oneline -3`.

## Verification the orchestrator will run
Your scorer, re-run by the orchestrator against a fresh snapshot of the live file; counts
must reproduce modulo new appended lines. Report's numbers must match the scorer's raw
output verbatim.
