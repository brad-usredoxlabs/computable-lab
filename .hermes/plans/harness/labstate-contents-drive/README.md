# L2-LABSTATE-CONTENTS-1 — live no-seed multi-turn drive (spec §11)

The LIVE NO-SEED multi-turn P3 drive the spec makes the acceptance line-1
gate (closing ED-WELLSET-AC2-LIVE at the post-merge re-drive, D13-C).

## What it is

`drive.py` drives the ACTUAL wire path the deck surface rides
(`POST /api/ai/draft-events/stream` — the run-suite-a.py `post_sse` idiom)
with ONE held session and BYTE-STABLE surface + context identity
(`conversationKey = deriveContextCacheKey(surface, context)` is stable
across turns — the SAME identity the `LabStateCache` is keyed by).

NO seeded state, NO cache priming, NO `priorLabState` fixture: the ONLY
inputs are the spec §11 utterances, verbatim from the ruling (typed exactly,
hyphen and all — the model lowering to well-range form is part of what the
drive tests, OQ-2). The four turns (OQ-1 ratified):

| label | utterance (verbatim)                |
|-------|-------------------------------------|
| A     | `Place a 96-well plate on the deck.`|
| 1     | `add material A to A1-H1`           |
| 1b    | `add material B to A2-H2`           |
| 2     | `mix all wells that have material`  |

plus the never-guess CONTROL turn (spec §11 failure-arm):
`add material Z to the ghost-plate well C1` (unknown plate -> diagnostic +
no contents).

## Why the arm-log

The wire `done` frame (the `AgentResult` the stream returns) does NOT carry
`labStateDelta` — the `AgentResult` type has no such field. So the per-turn
committed ledger (the spec §11 "turn 1: the accepted compile's
`labStateDelta.snapshotAfter`" + "persistence proof") is captured from the
backend ARM-LOG: `createLabStatePass` emits a `[lab_state ARM-LOG]` line when
`LABSTATE_ARM_LOG=1` (inert otherwise). Each line carries the PRIOR committed
ledger (the cache READ leg — a later turn's prior must already contain an
earlier turn's contents) and the POST-FOLD snapshot (the contents this turn
wrote). The drive captures the backend log window between turns and extracts
these lines into the receipt. This is the spec §11 "backend arm-log line or
drive-captured payload" evidence form.

## Evidence (receipt dir)

`/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/<UTC ts>/drive-receipt.json`:

- per-turn: the FULL raw `done` frame (`events`, `labwareAdditions`,
  `clarificationRequests`, `unresolvedRefs`, `notes`, `error`), the
  `pipeline_diagnostics` + `error` frames, the ARM-LOG lines (prior + after
  labware ledgers), the SSE frame types, the request + context-identity shas,
  the wall time, and the raw tail.
- the four acceptance legs (each named; a vacuous pass is a FAILURE):
  - `turn1_contents` — turn 1's accepted add leaves `snapshotAfter.labware`
    populated (a non-empty `after_labware` over the A1..H1 addresses); the
    seen `materialId`/`kind` ride the payload.
  - `turn1b_persistence` — turn 1b's PRIOR already contains turn 1's contents
    (the cache write leg fired) — captured, not asserted-by-construction.
  - `turn2_mix_union` — the mix event's `details` carry the resolved union
    EXACTLY A1..H1 + A2..H2 (the A1:H2 bounding union, 16 wells — count
    reconciled per ruling LABSTATE-TOKENSITE-gate-l2t2355 Q2) BY THE
    COMMITTED LEDGER. Vacuous `[]==[]` is an ACCEPTANCE FAILURE (WELLSET's
    #1 trap applies verbatim).
  - `control_never_guess` — the unknown-plate control no-ops (no contents
    written) + the lab_state diagnostic rides the payload/log. NON-VACUOUS
    (D3, advc fix-run 1): the leg requires (1) a non-empty ARM-LOG for the
    control turn (the fold PROVABLY ran), (2) after_labware == prior_labware
    with BOTH captured non-None (the no-op wrote nothing), and (3) >=1
    `lab_state_unresolved*` diagnostic in the captured payload/log (the wire
    `pipeline_diagnostics` frame OR the env-gated ARM-LOG `unresolved_codes`
    — the wire done frame does not carry diagnostics, so both captured
    channels are counted). A turn where the fold never executed CANNOT pass
    this leg (the pre-fix `None == None => ok True` vacuous path is gone).

## parse_arm contract (FIX RUN 2, l2t0915 — advc2 N1 BLOCKER closed)

`parse_arm` and the emitter it parses (`createLabStatePass`,
`ChatbotCompilePasses.ts:1895`) are pinned to each other by the committed
fixture `test_parse_arm.py` (plain `python3 test_parse_arm.py`, no deps —
run it before any re-drive):

- the EMITTER's exact line shape is the 4-token form
  `turn=<n> prior_labware=<json> after_labware=<json>
  unresolved_codes=<json>` (compact JSON, `turn=` a raw number); the
  PRE-FIX 3-token form (no `unresolved_codes=`, the 20261030T063626Z
  receipts' format) is still tolerated — `unresolved_codes` degrades to
  `None` on that form.
- each payload is parsed from its OWN bounded slice (depth-0 marker scan +
  brace-balanced, JSON-string-aware): tokens embedded in a payload's
  string content are NOT separators, and a malformed payload degrades that
  field to `None` (no exception; well-formed neighbors still parse).
- `turn=` parses to the tag only (bounded by the next depth-0 marker).
- a line with no well-formed ARM-LOG fields yields all-`None`.

The pre-fix parser handed the whole REST OF THE LINE to `json.loads` per
token (only the last token could ever parse): once `60db0a3a` appended
`unresolved_codes=` after `after_labware=`, `after_labware` degraded to a
raw string and all four acceptance legs were unreachable. The fixture's
leg-predicate probes (run on REAL `parse_arm` output, not hand-built
dicts) pin the N1/D3 closure: a no-op control line with an unresolved
code makes `control_never_guess` satisfiable; wrote-turns, code-less
no-ops, the pre-fix 3-token form, garbage, and an empty arm_log all make
it False. The fixture is FORM-AGNOSTIC — it pins the parse of
emitter-shaped lines, never the drive's `TURNS` strings (orch owns the
`TURNS` edit with the re-drive, ruling Q4).

## Run

```
# Boot MY worktree backend on :3093 (lane-local — see labstate-worktree-stack.sh
# for WHY not cl-lane-stack.sh: that serves trunk, which lacks these commits,
# and the task forbids touching trunk). LABSTATE_ARM_LOG=1 is set by the stack
# script.
#   /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/labstate-worktree-stack.sh start
# wait for :3093/api/health=200, then:
python3 .hermes/plans/harness/labstate-contents-drive/drive.py
```

Env overrides: `DRIVE_BASE` (default `http://localhost:3093`),
`DRIVE_RECEIPTS` (default receipts dir), `DRIVE_BACKEND_LOG` (the backend log
path for the ARM-LOG capture), `DRIVE_TURN_TIMEOUT` (default 300s).

## Ownership

This harness is L2-LABSTATE-CONTENTS-1's own drive (spec §8 "NEW drive
harness"). It makes NO edits to l2-suite-a/expectations or lib (WELLSET's
P7.json is DO-NOT-TOUCH). It is a standalone driver — it does not import
run-suite-a.py.
