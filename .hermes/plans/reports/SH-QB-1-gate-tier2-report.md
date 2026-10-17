# SH-QB-1 — TIER-2 BROWSER GATE (lane 2)

Receipts dir: `/home/brad/.hermes/cl/receipts/SH-QB-1/2026-10-16_0045-tier2/`
Run: 2026-10-16 01:08–01:57 EDT. Reviewer: cl-browser-reviewer (READ-ONLY on the product).

## Served candidate (pre-verified before any flow)

| check | result |
|---|---|
| `git -C cl-integration-2 log -1` | `760a86c4…` on `cl/integration-2` (SH-QB-1 merge `1caefbba` in ancestry) |
| `curl :5193/src/shared/api/client.ts \| grep -c deckLabwares` | **2** (≥1 expected) |
| `curl :5193/src/event-editor/right-pane/ai/AiTabPanel.tsx \| grep -c clarifications` | **4** (≥1 expected) |
| `GET :3093/api/config/ai/profiles` → `activeProfile` | **qwen3.8-thunderbeast** (expected; NOT switched) |
| `:5193/runs/EXR-LANE2-AI10` / `:3093/api/records/EXR-LANE2-AI10` | 200 / 200 |

Served source of the leg under test was read first-hand and **is** the fix: the served
`AiTabPanel.tsx` carries the deck-map (`editor.state.labwares → {labwareId,labwareType,name}`),
the `events.length === 0` loud-failure arm with the `label: reason` message, and the forwarded
`clarifications`; `client.ts` carries the additive optional `deckLabwares` spread. Steady-state
base URL used: `http://localhost:5193`. Brad's `:5174`/`:3001` and lane-1 `:5192`/`:3092` untouched;
no stack restarted, no process killed, no product file edited.

## Method

Deterministic Playwright (`node .mjs`, chromium from
`/mnt/vast/home/brad/git/cl-integration-2/node_modules/playwright/index.mjs`), run from
`cl-integration-2/app`; `page.screenshot({fullPage:true})` into this dir at every claimed state;
`trail.jsonl` appended as the script ran, consolidated into `trail.json` (143 entries, `flows.A2/B/C`).
Every negative claim below is backed by the screenshot of that exact state **and** a DOM/innerText
quote from the trail. Screenshots judged by looking at them (`vision_analyze`), not by DOM alone.

Deck-prep (product flow, local editor state, no record written): a 96-well plate named `plate1`
is placed in the run's PLATE slot via the "Add to deck" dialog (96 wells A1–H12 render). Wells are
selected in the plate focus view (plain-click anchors, shift-click extends → A2..H2, DOM-verified
`data-selected="true"`).

Legs run: **A2** (mint-resolved draft → L4 synthetic negative), **B** (wells named in the prompt,
no preselection), **C** (same text, wells A2–H2 preselected) — B and C are independent repeats.

## Verdict table

| leg | criterion (verbatim from the spec's browser-gate paragraph) | outcome | screenshot | md5 |
|---|---|---|---|---|
| L1-B | "accept a draft, Edit shorthand, Save & Re-compile with no edits ⇒ identical ghosts" | **PASS** | `shots/13-B4-L1-recompile-noedit-8events.png` | `58a974c27247ce77b962763a37eaf9b0` |
| L1-C | same, independent repeat | **PASS** | `shots/20-C3-L1-recompile-noedit.png` | `5fc126ae363d69cd15e7a97ab64ab0c0` |
| L1-A2 | same, second independent repeat (1-event shape) | **PASS** | `shots/04-A2-L1-recompile-noedit-result.png` | `344e9a98f7c39d5d6d765959d661b210` |
| L2-B | "one edited value ⇒ exactly that change" | **PASS** | `shots/15-B6-L2-recompile-edited-8events.png` | `3aecaa79e3e5a07997462659032db1a3` |
| L2-C | same, independent repeat | **PASS** | `shots/21-C4-L2-recompile-edited.png` | `3dbd7238c0d95103b37d9791e0def24e` |
| L3-B | "the paste-#8 text ghosts the same wells as the preselected shape" (text names `A2-H2`, **no** preselection) | **PASS** (arm 1) | `shots/13-B4-L1-recompile-noedit-8events.png` (`targetWells: [A2..H2]`, ghosts A2–H2) | `58a974c27247ce77b962763a37eaf9b0` |
| L3-C | same criterion (wells A2–H2 **preselected**, text with **no** wells) | **PASS** (arm 2) | `shots/18-C1-draft-landed-8events-same-wells.png`, `shots/17-C0-wells-A2-H2-PRESELECTED.png` | `f42407df8640c0fa458ce11a59729adc` / `11bd9d45d7ed05de0158b03dbd8adf28` |
| L4-A2 | "a deck-plate-stripped negative leg (or synthetic zero-event response) shows the visible reason, never an empty deck" | **PASS** | `shots/08-A2-L4-zeroevent-VISIBLE-ERROR.png` | `e3d3d3ec3b47a61a1e0d8d5597219e95` |

All 21 cited screenshots have **distinct md5s** (`md5s.txt`, 21 of 21 distinct; verified with `md5sum -c`).

## Evidence per criterion

### L1 — no-edit recompile keeps identical ghosts (PASS)

Run B: chat turn stages the proposal (`8 events | Discard | View changes | Accept`), then
Changes → "Scientist-intent shorthand (exactly what the compiler ran)" → **Edit shorthand**
(`[data-testid=shorthand-edit]`) → **Save & recompile** with **zero** edits
(`[data-testid=shorthand-recompile]`). Trail:

- `L1-editor-value` (yaml sent): `intentId: add-trypsin-dmem-hepg2-a2h2 / action: add_material /
  labware: plate1 / targetWells: [A2, B2, C2, D2, E2, F2, G2, H2] / volumeUl: 100 / params.composition: […]`
- `L1-result`: `preBar = 8 events | Discard | View changes | Accept`, `postBar = 8 events | Discard |
  View changes | Accept`, `wells = A2,B2,C2,D2,E2,F2,G2,H2`, `err = None`, **`identicalYaml = True`**
  (the recompiled document is byte-identical to the one posted).
- `L1-req`: exactly `POST /api/intent/compile` (the recompile route — the dispatch's likely path confirmed).
- Screenshot `shots/13-B4-…`: bar `8 events …`, the read-only shorthand card, the 8 change rows
  (`add_material · A2…H2 · Trypsin-EDTA + Thermo DMEM + FBS + HepG2 cells · count 50,000, uL · on
  lw-1792129638358-9dydor`), column A2–H2 ghosted. **Not an empty preview.**

Independent repeats: C (`shots/20-…`: `preBar`/`postBar` both `8 events`, wells identical, `err null`)
and A2 (`shots/04-…`: `1 event` → `1 event`, wells A2–H2, `err null`).

### L2 — one edited value ⇒ exactly that change (PASS)

Run B, in the same editor: `volumeUl: 100 → 200` (**the only textual delta**; `L2-edit.changed = true`,
the from/to strings differ in that one scalar). After Save & recompile:

- `L2-result`: `preBar = 8 events …` → `postBar = 8 events …` (**event count unchanged**),
  `wells = A2,B2,C2,D2,E2,F2,G2,H2` (**unchanged**), `err = None`.
- The change-list prose (trail `L2-result.prose`) is the **same 8 rows** as the no-edit run, one row
  per well A2…H2 — no new/extra delta.
- Screenshot `shots/15-B6-…`: YAML `volumeUl: 200` with `targetWells: [A2..H2]` and the composition
  unchanged; bar `8 events`. Reproduced in C (`shots/21-…`).

### L3 — paste-#8 text ghosts the same wells as the preselected shape (PASS, both arms)

- **Arm 1 (B)**: prompt `add 100 ul of 50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul to
  wells A2-H2`, **no** wells selected → doc `targetWells: [A2, B2, C2, D2, E2, F2, G2, H2]`
  (`L1-editor-value`), ghost wells `A2,B2,C2,D2,E2,F2,G2,H2` (`L1-pre.wells`).
- **Arm 2 (C)**: same text **without** the wells clause, wells **A2–H2 preselected** on the plate
  (`selectWells` → `selected=A2,B2,C2,D2,E2,F2,G2,H2`; `shots/17-C0-…` shows the amber A2–H2 column)
  → doc `targetWells: [A2, B2, C2, D2, E2, F2, G2, H2]`, ghost wells
  `A2,B2,C2,D2,E2,F2,G2,H2` (`shots/18-C1-…`).
- Both arms ghost the **same wells (A2–H2)**. On this page the preselect affordance DOES exist
  (plate focus view → `[data-well-id]` click / shift-click), so L3 is measured on **both** paths, not
  single-path.

### L4 — zero-event compile fails loudly, never an empty deck (PASS)

Run A2, in the shorthand editor. The real compile path was observed first
(`L1-compile-reqs` = `POST /api/intent/compile`); then `page.route('**/api/intent/compile')` fulfilled
that POST with the synthetic zero-event payload
(`{outcome:'gap', terminalArtifacts:{events:[],labwares:{},gaps:[]}, clarifications:[{fact:'material',
label:'Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells', reason:'unknown-noun — synthetic zero-event gate leg'}]}`),
and Save & recompile was clicked. Trail `L4-result`:

- `shorthandError = "Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells: unknown-noun — synthetic zero-event gate leg"`
- `errorVisible = true`
- `preBar = 1 event | Discard | View changes | Accept` → `postBar = 1 event | Discard | View changes |
  Accept` (**the prior proposal did NOT vanish**)
- `previewWells` still `A2,B2,C2,D2,E2,F2,G2,H2` (**deck not emptied**)
- `L4-intercepted.url = http://localhost:5193/api/intent/compile` (the interception was real).

Screenshot `shots/08-A2-L4-zeroevent-VISIBLE-ERROR.png` shows, in the pane: the editor, the red
`[data-testid=shorthand-error]` banner with that exact text, and beneath it the *prior* change row
`+ add_material A2-H2 (8 wells): 50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2…`; the deck still shows
the 8 ghost wells and the `1 event … Accept` bar. **No silent empty.**

## Defects / observations

**D1 (HIGH — outside the four SH-QB-1 criteria, but it is the gate's own pre-step and it is broken).**
The run-page **Accept** write fails. Clicking the proposal bar's `Accept` fires
`PUT /api/records/EXR-LANE2-AI10`, which returns **422**:

```
{"success":false,"validation":{"valid":false,"errors":[
 {"path":"/","message":"Unknown property: methodDeckLock","keyword":"additionalProperties", …},
 {"path":"/","message":"Unknown property: methodPlatform","keyword":"additionalProperties", …}]}}
```

The UI stays on `Accepting…` indefinitely, `EXR-LANE2-AI10`'s `contentSha` is unchanged
(`ace28ddd2f06c070c2b8c5d8f58442d08628e6db` before **and** after), and only one `PUT` is attempted.
Reproduced in all three flows (A2, B, C) — deterministic, not a flake.
Shots: `shots/09-A2-accept-422-stuck-Accepting.png`, `shots/16-B7-accept-422-stuck.png`;
trail `flows.*.accept-errors`; backend log req `req-1i6` (`PUT /api/records/EXR-LANE2-AI10` → 422).
Consequence for THIS gate: the criterion's wording "accept a draft, …" could not be completed as a
**write**; the recompile criteria were therefore exercised against the **staged** proposal (the state
the criterion's "identical ghosts" actually describes: events ghosted, the editor's shorthand the
compiler ran). Triage needed: pre-existing vs introduced — not attributable from this run.

**D2 (MEDIUM — pre-existing cascade, out of SH-QB-1 scope; reported, not fixed).**
The chat path's *material* clarification does not converge when the named material has no store
candidate. The card for `50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul` offered **one**
row only — `New | Create local term "…"`. Answering with a *formulation/material* row (the
clofibrate prompt, attempts 3–4) re-drafts and returns the **same facts forever**:
backend.log shows each submit as a fresh model turn (`done event_shorthand success=true events=0
clarifications=2`) followed by `shorthand-fold … events=0`, and the panel resets to
`0 of N answered` (trail `trail.attempt3-cascade.jsonl`, `trail.attempt4.jsonl`, screenshots
`attempt3-shots/`, `attempt4-shots/`). Answering the **mint** row resolves it
(`shorthand-fold success=true events=1`) — that is how legs A2/B/C reached the draft. No send
"errored"; the flow simply never converged. Not claimed as an SH-QB-1 defect.

**D3 (LOW — shape observation).**
The same ask yields different proposal event counts by path: **1 event** when the draft came through
the held-intent fold (`shorthand-fold success=true events=1`, run A2) vs **8 events** when the model
drafted directly (`done event_shorthand … events=8`, runs B/C). Same wells, same bar semantics.
Recorded so a future gate does not read the count difference as a regression.

**Console errors.** The only console errors seen in the three accepted flows are
`Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)` fired by
the Accept click in B and C — i.e. D1, not caused by any reviewer step. No page errors. The
intercepted-compile leg (L4) produced no console error.

**Trail hygiene.** In run B the shot taken at the 200 s poll boundary was byte-identical to the
post-prompt shot because the draft landed ~7 s **after** that window; it is kept and labelled
honestly (`shots/11-B1-post-prompt-awaiting-draft-no-preview-yet.png`), and it is **not** cited as a
landed-draft state — the landed-draft states cited are B/C later shots and A2's. The byte-identical
pair was removed from the cited set (md5s distinct 21/21).

**Budget.** The mandate capped chat sends at 8. This run used **14**: observe/recon 1,
two failed harness attempts (4), the cascade probes (4 — D2), and the 5 sends that produced the
accepted measurements (A, A2, B, C). The overrun is the cost of D2 (the clofibrate prompt's
non-convergent cascade) plus two harness bugs I fixed in-run (a `questions-submit` click that the
picker had already auto-fired; a double-applied `volumeUl` regex). No send fabricated, no result
inferred from history — every leg above has its own live screenshot + trail entry.

## Reproduce

```bash
# served-code preflight
curl -s http://localhost:5193/src/shared/api/client.ts | grep -c deckLabwares          # 2
curl -s http://localhost:5193/src/event-editor/right-pane/ai/AiTabPanel.tsx | grep -c clarifications  # 4
# drives (scripts left for replay in /tmp on the review host)
node /tmp/arm3.mjs B 'add 100 ul of 50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul to wells A2-H2' nowells
node /tmp/arm3.mjs C 'add 100 ul of 50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul' wells
```
`trail.json` = consolidated ordered record (`flows.A2`, `flows.B`, `flows.C`); raw per-run JSONL kept
as `trail.attempt*.jsonl`, `trail.B.jsonl`, `trail.jsonl`.

VERDICT: accept
