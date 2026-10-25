# CELLRATE-1 — LANE 2 UI ACCEPTANCE GATE (plane 4, browser) — TIER-2 SHOT

- Task: CELLRATE-1 (cells-per-volume rate vocabulary; per-well totals shown derived)
- Candidate: frontend http://localhost:5193 / backend http://localhost:3093 serving
  /mnt/vast/home/brad/git/cl-integration-2 @ trunk cl/integration-2, HEAD 0215ef12
  (CELLRATE-1 merge 20fafc40 in history; served module
  `/src/shared/lib/formHelpers.ts` contains `describeCellTotal` — 200/1 match at load).
- Spec authority: `.hermes/plans/2026-10-21_2130-CELLRATE-1-cells-per-volume-spec.md`
  §5.3 (display helper, five-state table) and §9 acceptance.
- Criterion (plane 4, verbatim from the task):
  > "(4) BROWSER GATE (async): on :5193 with the canonical utterance, tooltip + Changes row show
  > the derived per-well total labeled as derived; VERDICT: accept on the named surfaces."
  Spec §4 restates the named surfaces as: deck/focus well tooltip (`focus/WellTooltip.tsx`),
  Changes panel row, deck context panel.
- Run: 2026-10-23 ~14:47-14:53 EDT, headless chromium (Playwright via the receipt harness's
  `node_modules`), viewport 1600x1000. Deterministic node `.mjs`; no interactive browser tooling.
- Driver: `final.mjs` (primary, deck leg) + `chat3.mjs` (run-page leg); `recon.mjs` supplementary.
- Receipts: this directory (`trail.json` + `shots/`). Supplementary: `trail-final.json`,
  `trail-chat3.json`, `recon-deck.json`.
- Environment preflight: `/api/health` 200; `:5193` 200; `:3093` serving. NOTE: an earlier probe at
  14:44 hit a backend that was mid-restart (a burst of 500s, "Unknown user"); it is recorded in
  `trail-chat1..chat2` history and was NOT used as evidence. Everything below was captured after the
  backend was confirmed healthy.

---

## Result per criterion

| Surface (spec §4) | Criterion | Result |
|---|---|---|
| Changes panel row | derived per-well total labeled derived on the canonical utterance | **PASS** — `add_material · … · uL, 20,000/well = 200/uL x 100 uL (derived)` |
| Deck well tooltip | same, on the well the draft targets | **PASS** — `200 cells/uL · 20,000/well = 200/uL x 100 uL (derived)` |
| Negative pin: declared rate stays 200/uL; 20,000 never shown as observed | PASS — tooltip shows the rate `200 cells/uL` AND the derived total; 20,000 appears only with `(derived)` + operands |

**VERDICT: accept** on both named surfaces (route caveat in "Where the tooltip was exercised" below).

---

## The canonical flow, first-hand

Utterance (task): `Add 100 uL of media with 200 HepG2 cells/uL to well A1`.

Server truth for both legs (`.run/backend.log`):
```
[agent …] start surface=workspace.deck … clarificationAnswers=0
[agent …] turn 1 finish=tool_calls … [agent_intent]
[agent …] done event_shorthand success=true events=1 clarifications=0
```
The wire intent preserved the rate as declared data, exactly per spec §5.1:
```yaml
- action: add_material
  labware: plate1
  volumeUl: 100
  targetWells: [A1]
  params:
    composition:
      - { material: "Thermo DMEM", role: buffer_component }
      - { material: "HepG2 cells", role: cells,
          count: { value: 200, unit: "cells/uL", basis: count_per_volume } }
```

### Surface (a) — deck well tooltip  →  `shots/final-03-tooltip-A1.png`

Hovered well A1 (the draft's target) on the deck — measured `.well-tooltip` rect
`{x:201, y:538, w:260, h:95}`; tooltip innerText verbatim:
```
A1 | 100.0 µL
HepG2 cells · cells   200 cells/uL · 20,000/well = 200/uL x 100 uL (derived)
Thermo DMEM · buffer_component   —   —
1 event applied
```
The per-well total is presented as **`20,000/well = 200/uL x 100 uL (derived)`** — the derivation
is readable, the result labeled derived, and the declared rate `200 cells/uL` is shown alongside.
No bare ambiguous number.

### Surface (b) — Changes panel row

- Deck leg — `shots/final-02-after-send.png` (panel rect `{x:986, y:325, w:590, h:429}`) and visible
  in the right rail of `shots/final-03-tooltip-A1.png`. `.changes-panel__change-desc` verbatim:
  ```
  add_material · A1 · Thermo DMEM + HepG2 cells · uL, 20,000/well = 200/uL x 100 uL (derived) · on lw-1792129638358-9dydor
  ```
- Run-page leg — `shots/chat3-02-after-answer.png`. Row verbatim:
  ```
  add_material · media + HepG2 cells · uL, 20,000/well = 200/uL x 100 uL (derived)
  ```

Both rows show the same derived-with-derivation string; neither shows a bare `count 200`.

### Negative pins

- **Rate stays 200/uL.** The tooltip prints the declared `200 cells/uL`; the shorthand that produced
  it (visible in `shots/chat3-01-questions.png`) is `count: { value: 200, unit: "cells/uL",
  basis: count_per_volume }`. `20,000` never appears as an observed amount — only inside
  `20,000/well = 200/uL x 100 uL (derived)`.
- **Two-declared-numbers disagreement is honest (not a silent pick).** The deck's pre-existing
  seeded wells A2/B2 (leftover draft data: `count: 50,000` + `counter_density {500 cells/uL}` +
  `volume 200 uL`, which disagree: 500 x 200 = 100,000 ≠ 50,000) render
  `50,000 · absolute, unverified · 500/uL x 200 uL (derived 100,000)` — both declared numbers shown,
  mismatch flagged. `shots/final-03-tooltip-A2.png`. This is spec §5.3's disagreement arm working as
  designed, not a defect of this criterion.
- **Not exercised (stated honestly): the rate-without-volume state** (`200 cells/uL · per-well total
  unknown`). It is not reachable through the drafting UI without inventing data — the add-material
  flow always carries a volume, and I do not seed records. Recorded as not-exercised; the helper's
  unit test pins it (`formHelpersCellTotal.test.ts:32`).

---

## Where the tooltip was exercised (route caveat — read before certifying)

The task hints at "the run/drafting surface … e.g. an EXR-* run page". On :5193 the run pages
(`/runs/EXR-LANE2-AI10`, `/runs/RUN-2026-09-19-run-vwr8`, `/runs/RUN-w211-gate`,
`/runs/RUN-2026-10-09-run-1i4b`) mount **no plate** — none of their `methodEventGraphId` graphs declare
labware, so the deck reads "Click to choose labware" and has zero `[data-well-id]` elements
(`shots/chat3-00-loaded.png`, `chat3-01-questions.png`, `chat3-02-after-answer.png`). The canonical
draft never declares a `labware_add`, so it does not mount one either. **Consequence: no well exists on
the run page to hover, so the run-page deck tooltip is not reachable.** The Changes row IS reachable
and passed there (chat3 leg).

The deck tooltip was therefore exercised on the **standalone deck surface** at :5193 that mounts the
plate and carries the same AI chat panel:
`/deck/EVG-mvajv2lb-xxwa/EXR-LANE2-AI10` (the "deck tab" surface prior gates used).
There the canonical utterance resolved the labware to the mounted `plate1` and landed the draft
(`events=1 clarifications=0`), and hovering the target well A1 produced the derived tooltip above.
The route is a named spec surface ("deck/focus well tooltip"); the criterion is about the rendered
surface, and both named surfaces render the derived total labeled derived. Flagging the route
difference explicitly so the orchestrator can weigh it.

The deck's seeded plate/wells (`EVG-mvajv2lb-xxwa`, `lw-1792129638358-9dydor`) are pre-existing
lane-2 fixture data at :5193 — not created by this gate. The acceptance-relevant value (well A1,
100 uL, 200 cells/uL) comes entirely from the canonical utterance draft.

## Console / page errors

`consoleErrors: 0`, `pageErrors: 0` in both the deck leg (`trail-final.json`) and the run-page leg
(`trail-chat3.json`). No JS exceptions during the flow.

## How to reproduce

```bash
cd /home/brad/.hermes/cl/browser-receipts/harness
# deck leg (tooltip + changes row, both surfaces)
TAG=final node /home/brad/.hermes/cl/receipts/CELLRATE-1/2026-10-23_1440-tier2/final.mjs
# run-page leg (changes row; deck is empty by fixture design)
TAG=chat3 RUN=EXR-LANE2-AI10 node /home/brad/.hermes/cl/receipts/CELLRATE-1/2026-10-23_1440-tier2/chat3.mjs
grep -a "\[agent .*done event_shorthand" /mnt/vast/home/brad/git/cl-integration-2/.run/backend.log | tail
```

## Trail hygiene

- Each `goto` records `target` and the ended-on `url`; the deck target matched (URL carried only
  restored `?ws=`/`?wsa=` session params).
- `final-01-tooltip-baseline-A2.png` (md5 5978e16b…) vs `final-03-tooltip-A2.png` (171ced20…) are NOT
  byte-identical (the changes panel appeared between them); A2 is a different well from the draft
  target, so its tooltip text is unchanged by design — cited only as the disagreement-branch evidence,
  not as an independent before/after.
- All 11 kept screenshots are distinct (no duplicate-pair findings). Exploratory shots from the
  invalid mid-restart probe were deleted.

VERDICT: accept
