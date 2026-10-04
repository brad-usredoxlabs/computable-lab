# Escalation — appliance-2 vision endpoint instability blocks the QMS-6B browser gate (lane 1)

Author: lane-1 orchestrator tick, 2026-10-04 ~10:50 EDT. Audience: Brad (environment / model service).
Status: **environment blocker — no product defect; no lane-side remedy available.**

## The blocker in one line

The QMS-6B integrated browser acceptance gate needs ~8+ fresh screenshots plus vision model calls spread
over several minutes against **appliance-2 `qwen3.6-35b-a3b`** (`http://appliance-2:11434/v1`). The
reviewer's model calls intermittently receive **`HTTP 503: Loading model`**, which aborts the whole run.
**Three consecutive attempts** have now died on exactly this, each ~10-15 minutes in.

## Attempt log (all lane-1, all identical terminal error)

| attempt | dispatch | process | log | outcome |
|---|---|---|---|---|
| 1 | 2026-10-04 09:25 | PID 3400103 | `~/.hermes/cl/lanes/1/qms-6b-browser-20261004T0925.log` | aborted ~09:50, `503 Loading model` |
| 2 | 2026-10-04 09:56 | PID 3459406 | `~/.hermes/cl/lanes/1/qms-6b-browser2-20261004T1005.log` | aborted ~10:09, same |
| 3 | 2026-10-04 10:22 | PID 3511252 | `~/.hermes/cl/lanes/1/qms-6b-browser3-20261004T1030.log` | aborted ~10:35, same (57-byte log) |

Run 3's receipts (`~/.hermes/cl/receipts/QMS-6B/2026-10-04_103500/`) hold trail.json + 25 shots and **no
verdict**; `BLOCKED-INFRA.md` in that dir documents it. Runs 1-2 similarly left partial receipts.

## Orchestrator probes — the endpoint looks HEALTHY when probed

Direct probes of the same endpoint, interleaved with the aborts:

- 10:21 EDT — text chat completion -> **200**; vision chat completion with an 8x8 PNG -> **200**
  (correctly answered "Red"), 0.56 s.
- 10:41 EDT — 6 rounds x (vision + text) -> **12/12 HTTP 200**, sub-second.
- 10:42 EDT — a **117 KB reviewer screenshot** (real shot from the aborted run) -> **200**, but
  **65.7 s** cold, then 5.8 s, then 0.8 s (encoder cache).
- 10:44 EDT — 3-way concurrency (long text generation + 2x the same 117 KB image) -> **all 200**,
  round-1 latencies 109 s / 89 s / 89 s, later rounds 14 s / 4 s / 3.5 s.

So the failure is **not reproducible from a quiet client** at any load level I can generate. The 503
windows correlate with the reviewer running for several minutes, not with any single request shape.

## Interpretation (evidence, not proof)

- `Loading model` is a **model (re)load in progress** response — the server is loading/evicting the
  model, not rejecting an oversized request.
- `/v1/models` on that server also advertises **`ornith-1.5-9b-mtp`** and **`ornith-1.0-9b`**. A shared
  server that swaps models would unload `qwen3.6-35b-a3b` when another client asks for a different model,
  producing exactly this 503 for the next 35B request. Whoever/whatever requests those models is not
  visible from lane 1.
- Cold latencies of 65-109 s for a fresh 117 KB image are ~4x the documented ~16 s/CPU-vision-encode
  baseline, which is consistent with the box being under heavy concurrent load during those windows.
- Consequence: "probe returns 200" is **not** a sufficient predictor of gate viability — the previous
  tick's resume condition ("re-dispatch once appliance-2 serves a vision request without 503") is now
  known to be insufficient, because the endpoint served cleanly immediately before AND after this abort.

## What lane 1 wants from Brad (one concrete question)

Please stabilise or confirm the intended steady state of appliance-2's inference serving for
`qwen3.6-35b-a3b`, or point lane 1 at an endpoint that will not reload/swap the model mid-gate.
Concretely, one of:

1. Pin `qwen3.6-35b-a3b` on appliance-2 so it is not evicted/swapped while other models
   (`ornith-*`) are requested by other clients; or
2. tell lane 1 which client is requesting the other models so the contention can be scheduled around; or
3. name an alternative vision endpoint for the QMS-6B gate.

**Constraint observed by the lane:** the orchestrator may not restart or reconfigure model services, so
no lane-side remedy is attempted.

## Meanwhile

- QMS-6B stays `todo`, environment-blocked, with the corrected re-dispatch brief prepared
  (`/tmp/qms6b-task4.txt` at the time of writing; contents summarised in the handoff) — ready to fire the
  moment the endpoint is stable.
- **This is NOT a product defect.** The partial trail's repeated password-fill failures are a reviewer
  harness bug (invalid Playwright selector), documented in the receipts dir; they must not be read as
  QMS-6B findings.
- Every QMS-6B alternative (and therefore QMS-7) is blocked on this. OPS-1's remaining trunk items are
  unaffected (separate cl-senior worker, thunderbeast).
