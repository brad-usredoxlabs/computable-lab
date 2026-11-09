# L2-TRUNK-JOURNEYS-1 — trunk journeys harness (spec, orch l2t1130)

Item: L2-TRUNK-JOURNEYS-1 (lane 2 list). BRAD-APPROVED 2026-10-31 ("append blocks 1-3 onto
both lane task-lists"; proposal ~/.hermes/specs/plans/2026-10-31_trunk-journeys-and-roundtrip-gate-proposal.md).

## Goal

A standing, re-runnable journeys harness that treats the lane TRUNK stack as one system:
journeys declared as DATA (YAML), executed by ONE driver against :3093/:5193 over REAL
transport, with honest per-journey JSON receipts. A red journey blocks new claims: the tick
reads the latest receipt set before claiming items.

## Hard rules (from the item text — BINDING)

- Fakes are allowed at the MODEL layer ONLY (a deterministic fake assistant response standing
  in for the sampler). page.route / interception of ANY /api/ai/** path
  (draft-events/stream, assist/stream included) is BANNED BY CONSTRUCTION, enforced by a
  channel self-check leg (l2-suite-a test-channel-selfcheck pattern) that FAILS CLOSED.
- Journeys are YAML data under the harness dir: surface, user actions, expected wire
  channels, expected rendered outcome. The driver reads the YAML; adding a journey = adding
  a YAML file, not editing driver code (schema-driven principle).
- Receipts discipline per l2-suite-a: per-journey JSON receipts + run-meta.json under
  /home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/<UTC-ts>/, honest verdicts, write-free
  digest where applicable (CL_DATA_REPO digest before/after).
- Each journey's receipt MUST include the OUTGOING REQUEST BODY artifact + rendered-outcome
  evidence pair (ROUND-TRIP-GATE-1, lane 2 header, 2026-10-31).

## Minimum journeys (acceptance criteria verbatim from the item)

J1 deck surface: select wells on the deck, type "mix all wells that have material", assert
   the OUTGOING request body carries the declared context channels BY NAME — selectedWells
   (AiTabPanel.tsx:263 parity, be270f5f) among them — and a rendered answer returns. This leg
   IS the 2026-10-31 channel regression, pinned forever.
   NOTE (measured, orch, this tick): trunk @ be270f5f makes DeckSurfaceChat call
   buildAcceptedEventGraphProjection (emits selectedWells, sourceSelection, wellStateSnapshot,
   deckPlacements, activeDeckScope). The regression form was `context.selection` (unread by
   server; systemPrompt.ts:672 reads context.selectedWells). Assert selectedWells PRESENT
   with the selected well list, and `selection` ABSENT.
   Well selection: the deck plate is SVG; a real pointer drag-select is Brad's manual
   fallback. Programmatic path: use whatever selection affordance the existing
   chatui1-leGE-surface-matrix / deck specs use (they drive selection legs today WITHOUT
   touching /api/ai/** — see app/e2e or app Playwright specs named chatui1-*). If a real
   pointer interaction is genuinely infeasible headless, the journey may drive selection via
   the page's own UI-state affordance (a click/keyboard path on the real app), but NEVER by
   stubbing a network route; disclose the exact affordance in the receipt.
J2 clarification round trip: a clarification card fires, the answer is submitted, the fold is
   reachable and the answer does NOT loop (pins 0257123d — clarificationAnswers ride the
   request body structured, and the folded answer turn produces a user-visible answer with
   the same intentId; the arm-log line `shorthand answer folded deterministically` in
   .run/backend.log is corroboration, not the assertion).
J3 protocol-edit via chat: draft -> ChangesPanel diff -> accept -> expectedSha round trip
   lands the write (then revert the written record, or run against a scratch protocol copy —
   ALL records are TEST DATA per Brad, but leave the data repo digest clean if cheaply doable).

## RED-BLOCKS-CLAIMS contract

Write a file the tick can read atomically: receipts root `latest` symlink (or
run-meta.json with a `verdicts` table). The lane tick reads the newest run-meta.json; any
journey red => ready set empty + blocker line naming it. Implement `--json` exit codes like
l2-suite-a (0 all-green, 1 any-red, 2 env error).

## Canary acceptance (verified-by (1), non-negotiable)

On a SCRATCH branch (never trunk): rename the deck pane's outgoing selectedWells to
selection -> run J1 -> it goes RED; revert -> GREEN. Raw evidence of BOTH runs in the report.

## Verified by (acceptance, verbatim from the item)

1. CANARY as above (red on the rename, green on revert).
2. All three journeys GREEN on trunk (:3093/:5193) with receipts under
   /home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/<ts>/ (request-body artifact +
   rendered-outcome evidence per journey).
3. A red canary run makes a tick skip claiming (proved once against a deliberately red
   receipt set — i.e., demonstrate the tick-facing contract: leaving the latest receipt set
   red, a subsequent run of the harness' gate-check helper reports blocking; show its raw
   output).
4. cl-browser-reviewer receipts VERDICT: accept on the journeys RUNNER surface itself only if
   it gains any UI; driver is headless => expected NO-UI => no browser gate. Declare in the
   report: "runner surface gains no UI" with the diff proving it.

## Where things live

Harness dir: .hermes/plans/harness/l2-trunk-journeys/
  journeys/*.yaml           (J1-J3 declarations)
  run-journeys.py           (the ONE driver)
  test-channel-selfcheck.py (fails closed if any /api/ai/** route is intercepted, and
                             proves the channel assertions catch a renamed channel — reuse
                             l2-suite-a/test-channel-selfcheck.py structure)
  README.md                 (how to run; the tick-facing contract)
Reference assets (READ, reuse, do not reinvent):
  .hermes/plans/harness/l2-suite-a/README.md   (wire shape capture: aiClient.ts:233-236
     forks event-editor -> /api/ai/draft-events/stream, else /api/ai/assist/stream)
  .hermes/plans/harness/l2-suite-a/test-channel-selfcheck.py (B3 discipline: expected sets
     come from the compiler's own expansion, never re-encoded in the harness)
  .hermes/plans/harness/labstate-contents-drive/drive.py (multi-turn conversation + arm-log
     parsing receipts)
Model-layer faking: the SERVER decides the sampler. Prefer running against the REAL sampler
config the lane stack already uses (suite-a receipts prove the lane backend answers today).
A model-layer fake is permitted where a journey needs a deterministic assistant response
(J2's card, J3's draft ops): implement it as a server-side deterministic stub SEAM if one
exists in the test config; otherwise record the honest choice in the report and get the
determinism from the shipped prompt budget being irrelevant — i.e. a fake inference endpoint
pointed at by config, NEVER a browser route interception.

## Environment facts (every worker)

- Worktree: /mnt/vast/home/brad/git/wt/L2-TRUNK-JOURNEYS-1-lane2 (branch
  cl/lane2-trunk-journeys-1, off cl/integration-2 tip AT DISPATCH — recorded in the prompt).
- ALWAYS `git -c core.fileMode=false` (NFS mode-bit noise).
- NEVER touch /mnt/vast/home/brad/git/computable-lab or :3001/:5174. :5193 serves TRUNK —
  your candidate code (the harness lives under .hermes/plans/harness/, which is NOT served,
  so running your driver against :5193 exercises trunk product code: that is BY DESIGN;
  do NOT restart the stack).
- Journeys J1-J3 run against the RUNNING trunk stack; a journey red is an honest RED finding
  (route it in the report — you do NOT patch product code; product fixes = separate items).
- Playwright (if used for deck selection): cd app && npx playwright test <file>
  --project=chromium --workers=1 (lane rule: --workers=1 for deck legs).
- Data repo: /home/brad/.computable-lab/worktrees/main (ALL records are TEST DATA).

## Owned files (HARD BOUNDARY)

.hermes/plans/harness/l2-trunk-journeys/** (NEW dir, all yours)
+ optionally: a one-line README pointer in the harness parent.
NOT OWNED: app/**, server/**, schema/**, config/**, the l2-suite-a harness dir itself,
task-list, other handoffs. Product-code defects found => report them, do not fix them.

## Report

/home/brad/.hermes/cl/lanes/2/deliverables/L2-TRUNK-JOURNEYS-1-report.<token>.md —
BASELINE section first (what trunk serves, stack health), per-journey evidence (request-body
artifact paths + rendered outcome), canary raw (red+green), tick-gate proof, boundary diff
stat, "runner gains no UI" declaration. End 'STATUS: complete' then final line
'L2-TRUNK-JOURNEYS-1 DONE <40-char tip sha>'.

## Stop conditions

- A journey cannot pass without product-code change => honest finding, journey declared
  RED-BY-PRODUCT-DEFECT with root-cause cite; item report names it (orch routes it).
- Deck pointer-selection infeasible headless => disclose affordance substitute (rule above).
Never weaken a channel assertion to make a journey green — the harness exists to catch
exactly that class (the selection/selectedWells rename).
