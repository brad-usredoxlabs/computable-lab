# L2-TRUNK-JOURNEYS — trunk journeys harness (lane 2)

Standing, re-runnable journeys that treat the lane TRUNK stack (:3093 /
:5193) as ONE system. Journeys are DATA (`journeys/J*.yaml`); ONE driver
(`run-journeys.py`) runs them over REAL transport. Fakes live at the MODEL
layer only — and today none are needed: the lane backend answers with its
real configured sampler (see run-meta `backend_health_ai`). Interception of
any `/api/ai/**` path (page.route / fulfill / abort) is BANNED BY
CONSTRUCTION: `ui-drive.cjs` contains zero route-handler calls (the
self-check greps the file and fails closed), the receipt attests
`route_handlers_used: 0`, and the driver grades ANY nonzero as RED.

## How to run

cwd = the lane worktree root:

    python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all
    python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --journey J1
    python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py

Env: `CL_JOURNEY_APP_BASE` (default http://localhost:5193 — TRUNK),
`CL_JOURNEY_API_BASE` (default http://localhost:3093), `CL_RECEIPTS`
(default /home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS), `CL_DATA_REPO`
(write-free digest root). Playwright runs headless chromium via the app's
own `@playwright/test` package; the deck legs are single-browser
(one browser per journey, sequential) per the lane --workers=1 rule.

Exit codes (suite-a convention): 0 = every journey GREEN; 1 = any RED;
2 = environment error (backend unreachable / driver misuse — never a fake
verdict).

## The journeys

- **J1 deck surface** (the 2026-10-31 selectedWells channel regression,
  pinned forever): seed a deck record, real pointer selection (tile ->
  well click + Ctrl+click in the plate focus grid), ask
  "mix all wells that have material", then assert the OUTGOING
  `/api/ai/draft-events/stream` body carries `context.selectedWells`
  (object form, labwareId + wells), `context.sourceSelection`,
  `context.eventGraphId`, and `context.selection` ABSENT. Rendered answer
  required. Harness-owned record `EVG-JOURNEYS-1` (TEST DATA), deleted at
  teardown.
- **J2 clarification round trip** (pins 0257123d): the blob prompt yields a
  clarification card; the card's own option button answers it; the answered
  FOLD (`chat-log-clarification-answered`) must appear, the answered card's
  option list must be GONE (no loop), and the follow-up request body must
  carry `clarificationAnswers` STRUCTURED (requestId + optionId).
- **J3 protocol-edit via chat**: the review surface (`/ingestion/vendor-pdf/
  VPDF-5256F3288E3C`, protocol-review -> `/api/ai/assist/stream`) on a
  SCRATCH COPY of the w28 gate draft (`XDR-JOURNEYS-3`, newest-createdAt
  join trick, teardown delete): ask a reword, the ChangesPanel diff opens,
  Accept clicks, `review-ai-apply-note` confirms, and the driver RE-READS
  the record — the accepted label must be IN the record (the expectedSha
  round trip landed the write). The shared fixture is never written; the
  scratch seed also resets the live fixture's promoted-state drift (a
  promoted candidate carries XDR_CANDIDATE_LOCKED — the copy is restored to
  its birth state from e2e/fixtures/w28-said-meant/xdr.json).

## ROUND-TRIP-GATE-1 evidence pair (per journey receipt)

Every `<J>.json` receipt carries:
- `ai_request_bodies` — the FULL outgoing request bodies captured by
  read-only `page.on('request')` listeners (endpoint + sha256/12 + bytes +
  parsed body) — the artifact half;
- `rendered_evidence` + `screenshots` — the visible outcome (assistant turn
  counts, answer texts, answered-fold / accept-note flags, full-page PNGs
  incl. a failure shot on any step failure) — the rendered half;
plus `selection_affordance` (the disclosed real-UI affordance), `violations`
(honest, verbatim), seed/teardown notes.

## RED-BLOCKS-CLAIMS (the tick-facing contract)

The driver atomically flips receipts-root `latest` -> the run dir; run-meta
carries the `verdicts` table. The tick gate:

    python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py
    exit 0 = green (or never-ran) — claim normally
    exit 1 = prints a BLOCKER line naming each red journey — ready set EMPTY
    exit 2 = receipt trail unreadable — fail closed

## Self-check leg (fails closed)

    python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py

Proves without any server/model contact: (1) the J1 channel assertions PASS
on the honest outgoing body and go RED on the rename form
(selectedWells -> selection), the empty-wells form and the null form;
(2) a ui receipt with route_handlers_used=1 is BANNED and `ui-drive.cjs`
contains no interception call at all; (3) check-gate.py blocks on a red
run-meta (exit 1 + BLOCKER) and passes on a green one.

## Canary (how to reproduce the acceptance demo)

On a SCRATCH ref (never the branch tip, never trunk): rename
`selectedWells:` -> `selection:` in
`app/src/event-editor/deck/DeckSurfaceChat.tsx` (:112), serve the worktree
on a scratch FE (e.g. `VITE_API_PROXY=http://localhost:3093 VITE_CACHE_DIR=
/tmp/... npx vite --port 5195` from `app/`), run
`run-journeys.py --journey J1 --app-base http://127.0.0.1:5195` -> RED;
`git checkout -- <file>` -> GREEN. The final branch diff must stay
harness-only.

## Digest

J1/J2 are write-free at rest (seed + teardown delete; digest before/after
compared in run-meta). J3 writes ONLY the scratch record and deletes it;
the data-repo digest before/after is recorded and came back clean.

## Files

    run-journeys.py               # the ONE driver (python3; yaml is the only import)
    ui-drive.cjs                  # the browser executor (ZERO route handlers, by construction)
    check-gate.py                 # the tick-facing red-blocks-claims gate
    test-channel-selfcheck.py     # the fails-closed self-check leg
    journeys/J1.yaml J2.yaml J3.yaml   # the journeys (DATA: add a journey = add a file)
