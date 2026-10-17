# SHORTHAND-CORPUS WS6 — browser gate, run r5 (TIER-2), ws6fix merge

Task: SHORTHAND-CORPUS · Lane: 2 · Leg: ws6fix merge trunk c9c356f7 · Date: 2026-10-12 (EDT)
Receipts dir: /home/brad/.hermes/cl/receipts/SHORTHAND-CORPUS/2026-10-12_1550-ws6-r5-tier2/

Driver (deterministic Playwright, no interactive browser tools): `harness.shorthand-corpus-ws6-r5.mjs`
(extended from the r4 driver). Three invocations, one fresh browser context/page each:
  run 1  (accept)  -> shots/        + trail.json        (LEG=accept RUNLABEL='')
  run 2  (repro)   -> shots-run2/   + trail-run2.json   (LEG=accept RUNLABEL='-run2')
  discard          -> shots-discard/+ trail-discard.json (LEG=discard RUNLABEL='-discard')
Flow each run: `/runs/EXR-LANE2-AI10` -> focus `protocol-nav-step-step-1` -> type
`add 100uL of DMEM to A1:A12` into `[data-testid="chat-input"] .chat-input__editor` -> Send ->
answer the material-clarification picker -> the Changes review card -> Apply / Discard.

Model sends used: 3 (one per run; the clarification answer re-compiles deterministically with NO
model call, per the app bubble) — under the 6-send budget.

## Stack (re-verified first-hand here, evidence in trail.json step 1-5)

- backend http://localhost:3093 `/api/health` 200 (194 schemas / 83 lintRules), model `qwen/qwen3.8-flash`.
- frontend http://localhost:5193 200. (listeners confirmed via ss.)
- Served revision: /mnt/vast/home/brad/git/cl-integration-2 HEAD **c9c356f7** (cl/integration-2) — the
  ws6fix merge commit; matches the dispatch pin.
- **Served-module proof of the fix**: `GET http://localhost:5193/src/shared/lib/integrationFlags.ts`
  contains `exaVendorEnabled` (trail step: `servedFlagsHasExaVendor: true`, snippet captured) — the
  served app is the candidate build, not a stale bundle.
- ACTIVE AI PROFILE: **qwen3.8-flash-OR** (`GET /api/config/ai/profiles` -> `"activeProfile":
  "qwen3.8-flash-OR"`; model qwen/qwen3.8-flash; baseUrl https://openrouter.ai/api/v1). Asserted in
  every trail (`profileOk: true`, all 3 runs) BEFORE the first send — the r3 BLOCKED root cause
  (wrong-profile model) is not present.
- `integrations.exa.enabled=false` declared (`GET /api/config` -> `integrations.exa.enabled:false`;
  trail `exaEnabled:false`, all 3 runs). `POST /api/vendor/exa/search` with `{"q":"DMEM"}` first-hand
  now answers **503 `{"error":"EXA_NOT_CONFIGURED"}`** (no 502 path remains).
- `CLA_CORPUS_LOCAL_PATH=/home/brad/.computable-lab-lane2/corpus/pairs.lane2.jsonl` — baseline
  **1 line / 895 bytes** (mtime 2026-10-12T16:23:11.139Z); neither created nor edited by hand here.

## Criterion results (verbatim a–d)

**(a) A shorthand proposal CARD appears naming the material — PASS.**
Run 1: the Changes review card rendered `[data-testid="shorthand-view"]` + `[data-testid="changes-apply"]`,
both visible, naming the bound material (trail step `read-shorthand`). Card text:

    Scientist-intent shorthand (exactly what the compiler ran)
    intentId: ai-draft-add-material
    actions:
      - action: add_material
        material: Trypsin-EDTA/DMEM (50:50)
        targetWells: A1:A12
        volume: 100
    unresolved: []

Screenshot: **shots/25-changes-card-before-action.png** (the card in the right pane, with Discard +
Apply-to-run; the material row reads `Trypsin-EDTA/DMEM (50:50)`, targetWells `A1:A12`, volume `100`).
The user's "DMEM" was bound by the product's material-clarification policy to the ontology term
`Trypsin-EDTA/DMEM (50:50)`; the card names that material. The discard run independently rendered a
card naming literal **"DMEM"** (shots-discard/19-changes-card-before-action.png) — the criterion
accepts either naming, and the card names the material in both.

**(b) The corpus pair record path engages — PASS.**
After the card was up, `[data-testid="changes-apply"]` was clicked (trail step `accept-click`,
shots/27-after-accept.png). On the wire the Accept fired exactly the corpus seam and the local JSONL
gained the pair:

    POST /api/intent/training-pair
      userPrompt: "add 100uL of DMEM to A1:A12"
      thread: [ { "role": "user", "content": "Use [[material:MAT-trypsin-edta-dmem-50-50-12i0|Trypsin-EDTA/DMEM (50:50)]] for material." } ]
      shorthandYaml: "intentId: ai-draft-add-material\nactions:\n  - action: add_material\n    material: Trypsin-EDTA/DMEM (50:50)\n    targetWells: A1:A12\n    volume: 100\nunresolved: []\n"
      acceptedGraph: { events:[{eventId:"evt-add_material-ac1xyu2j", event_type:"add_material", ... details:{material:"Trypsin-EDTA/DMEM (50:50)", volumeUl:100} ... provenance:{... method:"compiler"}}], labwares:{} }
      confirmedAt: "2026-10-12T19:45:26.880Z"
    -> 200 {"ok":false,"error":"corpus.disabled"}     (remote post off — lane default, expected)

`userPrompt` **verbatim: `add 100uL of DMEM to A1:A12`** — this is exactly the D2/ws6fix fix: the POST
carries the ORIGINAL drafting prompt plus the subsequent user turn (the clarification answer) in
`thread`. r4's OBS-1 ("the pair's userPrompt is only the LAST user turn") is resolved.

The lane's local JSONL **went 1 -> 2** during run 1 (trail baseline vs after-state):
corpusBefore `{exists:true, lines:1, bytes:895}` -> corpusAfter `{exists:true, lines:2, bytes:1858,
mtime:2026-10-12T19:45:26.884Z}` — the expected post-Accept +1 (dispatch EXPECT 2).

**(c) Zero uncaught console errors during the flow — PASS (THE fix under test).**
All three trails report `consoleErrors: []` and `pageErrors: []`:
  run 1: 0 console / 0 page errors;  run 2: 0 / 0;  discard: 0 / 0.
`page.on('request')` captured **zero** `/api/vendor/exa/search` requests in every run
(`vendorExaRequests: []`, `badResponses: []`, `failedRequests: []` all three runs). The D1 fix gates
the slash-menu vendor tier on `integrations.exa.enabled` — with exa declared off, NO request fires at
all. The material-clarification picker that in r4 fired the 502 Exa search now renders ONLY the local
tiers (Ontology `Trypsin-EDTA/DMEM (50:50)`, ROR `DMEM`, MeSH, XCOD rows) with no vendor row and no
error — **shots/17-clarification-suggestions.png**. Backend corroboration: the only `POST
/api/vendor/exa/search` lines in `.run/backend.log` are at 19:41:41 and 19:43:47/19:43:50 UTC —
BEFORE the browser run window (runs start 19:44), and are the orchestrator's/my own curl probes; the
5 incoming exa requests + 1 route-not-found line = 6 total, none inside a run (trail mtimes
19:45-19:47). Zero browser-originated exa requests.

**(d) Reject/discard path — PASS.**
Bounded discard leg on a fresh page load (LEG=discard, separate run/context):
card visible (shots-discard/19-changes-card-before-action.png: intentId `add-material-1`, material
`"DMEM"`, targetWells `["A1:A12"]`, volume `100`, Discard + Apply buttons). Clicked
`.changes-panel__btn--discard` ("Discard") -> the card closed, the deck preview bar cleared, the pane
returned to Chat (shots-discard/21-after-discard.png, no error, no applied note). Result:
`trainingPairPostCount: 0` (no `POST /api/intent/training-pair` fired) and the corpus jsonl was
**UNCHANGED: 2 -> 2 lines** (bytes 1858 -> 1858, mtime identical 2026-10-12T19:45:26.884Z). A
negative change-control check: the discard run started AFTER run 1 had already grown the file to 2,
so "2 -> 2" is a true no-op, not a false 0->0.

## Trail hygiene

- Requested targets vs landed URLs: every navigating step shows
  `url=http://localhost:5193/runs/EXR-LANE2-AI10` — no redirects; the only `about:blank` entries are
  the pre-navigation API-assertion steps (health/profile/config/served-module/baseline), as designed.
- Byte-identical shots (md5) and their cause:
  - shots/14-turn1-outcome.png == shots/16-clarification.png — the `clarification` shot followed the
    turn-1 shot with the picker already settled; same screen. Not a defect.
  - shots/21-turn2-outcome.png == shots/25-changes-card-before-action.png — the intervening
    `open-changes-subtab` click was a no-op (Changes subtab already active). Not a defect.
  - shots-run2/{14,18,20}.png identical — run 2 failed before any card (see below); the screen never
    changed after the error. Consistent with the flake, not a missed action.
  - shots-discard/{08,09,12}.png == shots-run2/{08,09,12}.png — pre-send states are deterministic and
    legitimately pixel-equal across fresh runs.

## Observations (not criteria; for the orchestrator/architect)

- OBS-1 (run 2, reproduced r4's OBS-2 — model-layer flake, non-criterion): the independent
  reproduction turn schema-rejected before any card — `Draft failed: The shorthand document was
  rejected by the scientist-intent schema and could not be repaired: scientist-intent failed schema
  validation: 1 error(s)` with chips `Tool: agent_intent · event_shorthand · 1 field: shorthand` /
  `agent_intent failed` (shots-run2/14-turn1-outcome.png). The forced tool WAS called and a doc WAS
  emitted, but it failed Ajv — a model-layer flake, not a product fault. Run 1 is the receipted
  acceptance run; the discard run independently produced a valid card, so the flake is intermittent,
  not deterministic.
- OBS-2 (UI, pre-existing, out of scope): the deck's PreviewActionBar ("1 event  Discard  View
  changes  Accept") and the AI ChangesPanel ("Discard / Apply to run") are two parallel accept/reject
  affordances visible at once (shots/25, shots-discard/19). Both are functional here, so this is not
  dead chrome — flagged only as possible duplication for the architect; it predates ws6fix.
- OBS-3 (UI, pre-existing): the run page shows an `[agent] no ai.inference.maxTokens for model
  qwen/qwen3.8-flash; using 4096` warning in the backend log during drafting — a config note, not a
  console error and not this flow's code.

## What was NOT done

No product file edited; no server/model/profile/stack restarted or reconfigured; no record written
(EXR-LANE2-AI10 sha `ace28ddd…` unchanged across all runs); no test data fabricated; the corpus jsonl
content was neither read into the report nor edited by hand (only its line/byte counts measured
before/after).

## Verdict

All four criteria pass on the served ws6fix merge (c9c356f7):
(a) the shorthand CARD names the material — shots/25 (bound `Trypsin-EDTA/DMEM (50:50)`) and
shots-discard/19 (literal `DMEM`);
(b) the corpus pair path engages — `POST /api/intent/training-pair` fires with `userPrompt:"add 100uL
of DMEM to A1:A12"` + the clarification turn in `thread`, and the lane JSONL goes 1 -> 2;
(c) ZERO uncaught console errors and ZERO `/api/vendor/exa/search` requests in all three runs (the
D1 fix), corroborated by the backend log showing no browser-originated exa call;
(d) Discard leaves the JSONL UNCHANGED (2 -> 2) and fires no training-pair POST.
The r4 defects are cleared: the 502 Exa console error (D1) and the last-turn-only userPrompt (D2) are
both fixed as specified. Run 2's schema flake is a known model-layer non-determinism (r4 OBS-2),
reported, not a product defect.

VERDICT: accept
