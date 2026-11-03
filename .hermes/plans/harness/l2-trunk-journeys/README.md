# L2-TRUNK-JOURNEYS — trunk journeys harness (lane 2)

Standing, re-runnable journeys that treat the lane TRUNK stack (:3093 /
:5193) as ONE system. Journeys are DATA (`journeys/J*.yaml`); ONE driver
(`run-journeys.py`) runs them over REAL transport. Fakes live at the MODEL
layer only. The J2 clarification round trip is determinizable two ways:

- **live** (default): the lane backend answers with its real configured
  sampler (run-meta `backend_health_ai`). J2's answer-turn intentId can drift
  with the sampler's phrasing — that is a PRODUCT defect (filed separately),
  so the live J2 is run as an **advisory** signal (A3) while it is open.
- **fake** (`--fake`, A1): a harness-owned deterministic openai-compatible
  inference endpoint (`fake-inference.py`) stands in for the sampler. The
  backend's OWN inference config is pointed at it through the shipped
  profile surface only (PUT/activate a `l2trunkj-fake` profile), so EVERY
  wire stays REAL: browser -> :3093 `/api/ai/**` (untouched), backend -> fake
  (real HTTP). Canned completions are DATA (`canned/completions.yaml`). The
  live inference URL is RESTORED and asserted afterwards (A2). Interception
  of any `/api/ai/**` path is still BANNED BY CONSTRUCTION in BOTH modes:
  `ui-drive.cjs` contains zero route-handler calls (the self-check greps the
  file and fails closed), the receipt attests `route_handlers_used: 0`, and
  the driver grades ANY nonzero as RED. The fake never touches the browser.

## How to run

cwd = the lane worktree root:

    python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all
    python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --journey J1
    # A1: run against the deterministic model-layer fake (points the backend's
    # inference config at it, restores + asserts the live URL afterwards).
    python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --fake
    # A3: advisory live-sampler J2 — honest verdict, NEVER flips `latest`,
    # does NOT gate claims while the live-drift product defect is open.
    python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --journey J2 --advisory
    python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py

The GATE'S HARD SET is J1 + J2 (fake) + J3 green on a complete trunk run; that
run owns `latest`. The live-sampler J2 (`--advisory`) is extra signal only.

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

`fake_mode` is a first-class run-meta field in EVERY run (fix4 D2). The
gate's HARD SET is J1 + J2 (fake) + J3 green on a complete trunk run, and
ONLY such a run owns `latest`:

- TRUNK is the LITERAL set `{localhost:5193, 127.0.0.1:5193}` (N1: no
  env derivation — `CL_JOURNEY_APP_BASE` can select the run target but
  never make a scratch FE 'trunk'; check-gate re-derives the same
  literal from the run's recorded app_base, so a lying run-meta flag
  cannot pass).
- A complete trunk green that ran on the LIVE sampler (no `--fake`) is
  `GREEN-NOT-GATING` — an honest record, but it never owns `latest` and
  can never clear the gate (D2: a live-sampler lottery is not a trunk
  claim).
- The `latest` flip is GRADED (fix4 D1): the driver flips ONLY after the
  A2 restore grades OK — a fake run whose restore failed is
  `RED-RESTORE-FAILED`, `red_blocks_claims: true`, exit 1, and never
  owns `latest` (a crashed run never flips either).
- An ADVISORY run (`--advisory`, the live-sampler J2 shape) records its
  honest verdict but also never moves `latest` and sets
  `red_blocks_claims: true` (A3).

run-meta carries the `verdicts` table plus `complete`,
`app_base_is_trunk`, `advisory`, `fake_mode`, `latest_was`, `failures`
(N3: reds carry their failure dict), and — for a `--fake` run —
`fake`/`fake_restore` (A1/A2: the pointed and restored inference URLs).

The tick gate (fails closed on all of it):

    python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py
    exit 0 = green (or never-ran) — claim normally
    exit 1 = prints a BLOCKER line: a red journey, an INCOMPLETE
             verdicts table, a NON-TRUNK app_base, a latest that is
             advisory, a latest whose A2 restore record FAILED, a
             non-fake latest (hard set), OR — because the graded flip
             means a failed restore never owns `latest` — the NEWEST
             restore record in the trail graded FAILED (the trail
             itself is scanned; a newer run supersedes the failure)
    exit 2 = receipt trail unreadable — fail closed

## Self-check leg (fails closed)

    python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py

Proves without any server/model contact: (1) the J1 channel assertions PASS
on the honest outgoing body and go RED on the rename form
(selectedWells -> selection), the empty-wells form and the null form;
(2) a ui receipt with route_handlers_used=1 is BANNED and `ui-drive.cjs`
contains no interception call at all; (3) check-gate.py blocks on a red
run-meta (exit 1 + BLOCKER) and passes on a green one; (4) the A2 restore
grades a leaked fake pointer FAILED and an exact live-URL restore OK; (5) the
A4/N1 literal-trunk set — :5193 is trunk, :5195/None are not (env cannot
spoof), and a lying-flag scratch run-meta is BLOCKED by the gate.

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
    check-gate.py                 # the tick-facing red-blocks-claims gate (literal trunk set)
    test-channel-selfcheck.py     # the fails-closed self-check leg (incl. A2 + A4/N1 + CHATHOST arms)
    fake-inference.py             # the A1 model-layer fake (openai-compatible, driver-managed)
    canned/completions.yaml       # A1 canned completions (DATA, keyed to journey + turn)
    journeys/J1.yaml J2.yaml J3.yaml   # the journeys (DATA: add a journey = add a file)
    chat-hosts-shrink-guard.py    # CHATHOST-SWEEP-1 Change 3: the tick-time inventory
                                  # shrink-guard (importable by check-gate; standalone:
                                  #   python3 chat-hosts-shrink-guard.py [--recompute])

## CHATHOST-SWEEP-1 — the chat-host sweep scope axis (Change 2/3)

The chat-host inventory is DATA: `config/chat/chat-hosts.yaml` (one entry per
universal-chat host: `id`, `surface`, `mount`, `route`, `note` — `surface` is
the machine surface id the server reads; the four-way `analysis` collision is
documented in-file) with a blessed manifest at
`config/chat/chat-hosts.manifest.yaml` (the Change 3 shrink-guard anchor; the
top-level blessed_sha256/blessed_ids is the record of the ORIGINAL first bless,
and the guard uses the `first_blessed_sha256`/`first_blessed_ids` DATA carried
in the same writable manifest as a TRIPWIRE: an accidental or uncited rewrite of
the blessed set goes RED, while a deliberate rewrite that moves the anchor
together with the blessed set is NOT stopped by this guard — that class is
policed by adversarial review and the trunk merge; any deviation of the
top-level sha, INCLUDING a consistent rewrite, requires a spec-cited
blessed_records entry, and the removed-set is derived from the anchor id set so
a dropped host is named on every path — the top-level bless_note is prose,
never authorization — and a re-bless APPENDS a `blessed_records` entry). `check-gate.py` gains a SECOND
scope axis — `--chat-hosts` (the no-flag journey gate is byte-for-byte
unchanged; no parallel harness):

    CL_RECEIPTS=<sweep receipts> python3 check-gate.py --chat-hosts

A sweep run's `run-meta.json` carries a `chat_host_verdicts` table
({host id: {"verdict": accept|green, "receipts": <path>}}) and its `app_base`;
the axis grades it against the inventory: a STRICT-SUBSET table (an inventory
host never swept) is RED (the spec's RED case), as are not-accept verdicts
(fix1 D7: an accept is a VERDICT OBJECT carrying a per-host receipt reference
whose FILE exists — a bare verdict string alone is not-accept), undeclared
hosts (N5 exact-set discipline), a NON-TRUNK `app_base` (fix1 D6: the N1 trunk
rule applies to the chat axis — a scratch-frontend sweep never clears the
gate), and an unauthorized inventory change (the Change 3 guard, run from the
SAME function the standalone tick script uses; the guard derives the
removed-set from the HASHED payload — it asserts
canonical_sha(blessed_ids) == blessed_sha256 and authorizes a shrink only via
a consistent re-bless record whose bless_note cites an existing spec). A
`surface:` value is an accepted ALIAS key only when it names exactly one host
(fix1 D3); the four-way `analysis` collision is never an alias. The RED cases
are pinned non-vacuously by the self-check's CHATHOST arms (drop one host from
a synthetic verdict fixture -> the gate exits non-zero and names the host; the
full table exits zero; plus the D1 invariant/drain, D2 no-spec, the fix2
consistent top-level re-bless (RED uncited / GREEN spec-cited), D3
collision, D6 non-trunk, and D7 receipt arms). The live sweep run on :5193 is
ORCH-OWNED post-merge (the browser gate), not this harness's.

