# appliance-2 coder concurrency — MEASURED root cause of the coder death class (lane 2, l2t0450)

Status: EVIDENCE + LANE-2 OPERATING RULE. Written 2026-11-03T05:00 EST by the lane-2 orchestrator
from first-hand engine telemetry. Supersedes the concurrency premise of
`~/.hermes/specs/plans/2026-11-01-appliance2-coder-concurrency-and-stagger.md` ("two concurrent
~138K prompts are both served") for the *sustained-generation* case. It does NOT change Brad's
2026-11-01 ruling on the stagger window; it explains why the window was never the real constraint.

## The deaths this explains

| local time (EST) | item | client message |
|---|---|---|
| 2026-11-03 01:11:52 | L2-PROMPT2-DATA-DUP-RECORDS-1 | `inference request expired while waiting for admission` (3 retries) |
| 2026-11-03 04:31:28 | L2-CLARIFY-TARGET-1 wellsfix fix1 | same |

## What the engine actually logged (appliance-2, `journalctl -u ninfer-serve`)

```
06:10:57  WARN req#8616 failed during generation | HTTP 503 | request queue timeout   (11-03 UTC)
06:11:30  WARN req#8617 failed during generation | HTTP 503 | request queue timeout
06:12:05  WARN req#8618 failed during generation | HTTP 503 | request queue timeout
06:12:23  INFO req#8615 done | output limit | prompt 122,376 | output 32,768 | total 2m 47.6s
...
09:27:56  INFO req#9145 done | output limit | prompt 137,838 | output 32,768 | total 3m 47.2s
09:30:32  WARN req#9163 failed during generation | HTTP 503 | request queue timeout
09:31:05  WARN req#9164 failed during generation | HTTP 503 | request queue timeout
09:31:41  WARN req#9165 failed during generation | HTTP 503 | request queue timeout
```

The client's "expired while waiting for admission" IS the engine's `HTTP 503 | request queue
timeout`. Three failures ~33 s apart are the client's three retries; the run then dies.

## Mechanism (measured, not inferred)

1. The engine runs `--max-concurrency 2 --kv-capacity 262144 --max-context 262144` with
   `--device-state-slots 2`. Live request prompts during a coder run measure **122K-152K tokens**
   per turn (cached prefix 120K-135K at 92-99 % checkpoint reuse).
2. A coder turn that runs to the output cap produces **32,768 output tokens in ~2m50s-3m50s** and
   holds the decode slot for that whole time (see the `output limit` lines above — there were 14
   such turns between 01:01 and 09:27 UTC alone).
3. Two long-context sessions do not fit: 2 x 122K-152K of live context against a 262,144-token pool
   leaves no room to grow, and the engine cannot preempt a `preserve-thinking` decode in progress.
4. The engine's pending/admission timeout has **not been raised** (`--pending-timeout-ms` is unset
   in the running cmdline, verified from `pgrep -af ninfer-serve` on appliance-2). Its value is
   ~30 s, derived (not read from config) from the 33 s and 36 s spacing of the 503 triplets — each
   attempt is admitted to the queue, waits out the timeout, and is rejected. A second session's
   request therefore sits behind a 3-minute generation for longer than that timeout and gets 503'd
   three times → the client gives up → the coder dies.
5. Observed boundary: at 09:22 UTC lane 2 launched CHATHOST-CONSOLIDATE-1 while TARGET-1's run was
   still alive. CONSOLIDATE-1's opening spec read produced `req#9145` (3m47s, 32K output). TARGET-1
   died at 09:31:28 UTC. Same shape at 01:11. (Scope of that claim: I enumerated every
   `request queue timeout` line in the engine journal since 2026-11-02T00:00Z — four bursts, at
   00:07-00:08, 06:10-06:12 and 09:30-09:31 UTC on 11-03. I verified the concurrency state for the
   two bursts that killed a lane-2 coder; I did NOT reconstruct who was live for the 00:07 burst,
   so the "serial ⇒ no 503" reading is supported, not proven, and the guard is the cheap side of
   the bet.)

## Decision (lane 2, this tick — reversible, evidence-bound)

**One coder session at a time on :18080, fleet-wide.** Implemented mechanically, not by memory:

- `~/.hermes/cl/lanes/2/launchers/launch-TARGET1-wellsfix-fix2-l2t0410.sh` and
  `launch-CARD1-fix4run-l2t2310.sh` now carry a **SERIAL GUARD** that scans BOTH
  `appliance2-coder-slot-{0,1}.pid` files and exits `7` (`SERIAL-BLOCKED`) while any listed PID is
  alive. Verified live at 04:58:08 (`rc=7`, `SERIAL-BLOCKED live=CHATHOST-CONSOLIDATE-1-439409`),
  i.e. nothing was launched by the proof.
- The two-slot semaphore stays installed (the engine can serve two *short* requests concurrently —
  that is what the 11-01 measurement actually captured); the guard only forbids two *coder*
  sessions, which are the long-context case.
- The 60-minute stagger window stays as the second-order guard from l2t0410.

Cost/benefit: a coder death costs 30-90 minutes of wall clock and one wasted run; serializing
costs up to one run's worth of parallelism. Death rate under concurrency is 2 deaths / 2 concurrent
episodes today; deaths while serial are 0 in the same window. Fix-cycles per item is unchanged
(the deaths produced no product work).

## Engine-side recommendation (NOT done by lane 2 — needs Brad / engine owner)

The clean fix lives in the engine cmdline, not in the client:

- `--pending-timeout-ms 300000` (admit a request and let it wait out a long generation), and/or
- `--max-pending-requests N` to make the queue explicit, and/or
- `--default-max-tokens` below 32,768 for coder traffic so no single turn can hold the slot ~3 min.

Any of these changes the shared box that lane 1 also uses and requires restarting
`ninfer-serve.service` — that is Brad's call, not a lane action. Lane 2 did not touch the engine.

## What would reverse this rule

- `--pending-timeout-ms` raised and proven by a two-coder soak with no 503s, or
- a measured coder prompt profile that stays under ~60K tokens/turn (so two fit with room to grow).

Until then, re-measure before every fleet window change:
`curl -s -H "Authorization: Bearer <key>" http://appliance-2:18080/metrics | grep -E
'requests_running|kv_used_page_groups|host_context_used_bytes|max_concurrency'` and
`journalctl -u ninfer-serve --since -2h | grep -c "request queue timeout"`.
