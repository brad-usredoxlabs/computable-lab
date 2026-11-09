# BRAD CARD — appliance-2 engine admission timeout (fleet throughput)

Filed 2026-11-03T05:40 EST by the lane-2 orchestrator (tick l2t0555). One decision, mechanical,
reversible. Evidence: `.hermes/plans/2026-11-03_0500-L2-appliance2-coder-serialization-evidence.md`
(committed to `cl/integration-2`).

## The ask (pick one)

1. **RECOMMENDED — raise the engine's admission timeout.** On appliance-2, add
   `--pending-timeout-ms 300000` (and optionally `--max-pending-requests 4`) to the
   `ninfer-serve.service` cmdline, then `systemctl restart ninfer-serve`. Effect: a second coder
   session waits out a 3-minute generation instead of being 503'd after ~30 s, so two coders can run
   concurrently again (~265-359 aggregate tok/s measured 2026-11-01) instead of one.
2. **Cap the turn instead** — set `--default-max-tokens 16384` (or lower) so no single coder turn
   holds the only decode slot for ~3 minutes. Cheaper to reason about, but risks truncated
   long-form turns (the class that already loses coder report turns).
3. **Leave it.** Keep the serial rule; accept one coder at a time fleet-wide (~156 tok/s) and the
   queue latency it implies.

## Why this needs Brad and not the lane

Both options restart `ninfer-serve.service` on appliance-2 — a shared box that lane 1 also serves
from. Lane 2's standing rule is "never touch the engine, its unit, or its lifecycle". No lane can do
this.

## What is happening meanwhile (no action needed)

Lane 2 measured the death class rather than guessing at it: both recent coder deaths
(01:11:52, 04:31:28) are the engine's `HTTP 503 | request queue timeout` → client retries x3 →
`inference request expired while waiting for admission`. Journal shows a 32,768-output turn holding
the decode slot 2m47s-3m47s (14 such turns between 01:01 and 09:27 UTC) while live coder prompts
measure 122K-152K tokens against a 262,144-token pool with `--pending-timeout-ms` UNSET (~30 s).

Interim rule, enforced in code (not memory) in both armed lane-2 launchers: **one coder session at
a time fleet-wide**, exit 7 `SERIAL-BLOCKED` while any slot PID is alive. Lane 1 has adopted the
same guard. Cost: up to one run's parallelism. Benefit: 0 coder deaths while serial (2 deaths / 2
concurrent episodes before).

## Reversal condition

Not needed — option 1 is a flag; removing it restores today's behaviour exactly. If option 1 is
applied, the serial guard stands down only after a two-coder soak shows zero `request queue timeout`
lines in `journalctl -u ninfer-serve --since -2h`.
