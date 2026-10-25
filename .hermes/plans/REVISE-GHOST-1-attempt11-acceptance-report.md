# REVISE-GHOST-1 — UI acceptance gate, ATTEMPT-11 (lane 2, computable-lab, tier-2 cloud vision)

- Task: REVISE-GHOST-1 "revise remount + ghosts". Spec authority (criteria VERBATIM source):
  `.hermes/plans/2026-10-21_2030-REVISE-GHOST-1-revise-remount-spec.md` §4C, quoted below.
- Lane 2 trunk worktree `/mnt/vast/home/brad/git/cl-integration-2` (branch cl/integration-2).
  Stack: frontend http://localhost:5193, backend http://localhost:3093. Brad's :5174/:3001 untouched.
- Run page exercised: http://localhost:5193/runs/EXR-LANE2-AI10.
- Receipts (this dir, ABSOLUTE): `/home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-25_033307-attempt11/`
  (`trail.jsonl`/`trail.json` = drive v1-as-dispatched; `trail-v2|v3|v4.json|l` = the three patient
  re-drives; `state-<tag>-*.json`; `shots/*.png`; driver sources copied next to the receipts).
- Reviewer is read-only on the product. Nothing merged, restarted, or edited. Only UI actions and
  read-only HTTP probes were performed.

## 1. Candidate revision — VERIFIED before driving

| check | result |
|---|---|
| dispatched trunk sha `e86b0283fbb09a5b81e7c67eaba3a37d8b5692c7` present | `git rev-parse HEAD` = that sha at dispatch; `git merge-base --is-ancestor e86b0283 HEAD` = YES at report time |
| fix4 artifact in the served checkout | `server/src/api/handlers/AIHandlers.foldStreamTerminal.test.ts` present (10139 bytes, mtime 03:30) |
| served FE module | `curl :5193/src/event-editor/right-pane/ai/AiTabPanel.tsx` serves from `/mnt/vast/home/brad/git/cl-integration-2/...`; contains `interpreting-stop` ×1 and `ai-tab-honest-wall` ×1 |
| served server module | `server/src/ai/shorthandChat.ts` contains `resolvedLabwares` ×4 (fix3 D1 present) |
| stack | `GET :3093/api/health` 200; `GET :5193/` 200; `ss -tlnp` shows pids on :5193 (1463933) / :3093 (1462834) |
| store-warm | ONE `curl -m 180 :3093/api/records` fired at drive start: **200 in 61.9 s** (cold jsonld index, slow by design — not an outage) |
| launch | chromium exec-pin `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, `--no-sandbox`, headless |

HEAD-MOVED DISCLOSURE (full transparency): at report time the worktree HEAD is `cad32f646cf665bf1868cad1725c843a5604fa39`,
100 lines ahead of the dispatch sha. `git diff --stat e86b0283..cad32f64` = **ONE file changed, a
`.hermes/plans/` handoff .md** (committed 03:37:54 at tick l2t0315). **ZERO product-code files changed.**
The dispatched `e86b0283` is an ancestor of HEAD, so every measurement below was taken against
product-identical code; the served app/server modules cannot differ from the dispatched candidate.

## 2. Method (four deterministic node/playwright drives; NO interactive browser tooling)

The orchestrator's pre-prepared `/tmp/rg1/drive10-attempt11.mjs` was copied per dispatch
(`drive10-attempt11.mjs` = the dispatched driver, keys untouched; store-warm + run-scoped fold-line
attribution added). It reproduced the attempt-10 mid-stream artifact (see §3) so three patient
re-drives followed (`drive11b/c/d-attempt11.mjs`, same poll loops, patience added per the orch D3 ruling).

| drive | file | driver sends | what it measured |
|---|---|---|---|
| v1 | drive10-attempt11.mjs (as dispatched) | 1 (canonical) | attempt-11-as-dispatched; **reproduced** the attempt-10 mid-fold artifact |
| v2 | drive11b-attempt11.mjs | 1 (canonical) + UI answer rounds | patient polling: pane never strands; fold re-holds carry cards |
| v3 | drive11c-attempt11.mjs | 2 (canonical, revise) | **A1 PASS**; A3; Accept-variant revise |
| v4 | drive11d-attempt11.mjs | 2 (canonical, revise) | **A1 + A2 PASS**; A4(i)/(ii); spec-literal F1 flow (revise WITHOUT Accept) |

Driver sends total = **6** (the mandated cap). The app's AUTO-fold turns (triggered by answering the
last card) are not driver sends. Console errors: **0** in every drive (`console-errors{,-v2,-v3,-v4}.json`).

## 3. FINDING 0 (the D3 question, binding for this attempt): the "strand" is a HARNESS ARTIFACT — confirmed, then REFUTED

- **v1 reproduced it.** `shots/f1-03-round0-answered.png` shows the answer-fold in flight: pane header
  "UPDATING DRAFT…", chat-log line "7 clarifications needed — see Questions panel above", the
  "Cancel this draft and start a new prompt" escape, and NO question cards / NO chat input
  (measured `cardCount 0, chatInput 0, chatSend 0, honestWall 0, changesPanel 0`).
  Four tail screenshots are BYTE-IDENTICAL (md5 `9ed598d1…`): `f1-03-round0-answered.png` =
  `f1-03-draft-ghosts.png` = `f1-04-revise-not-sendable.png` = `f2-01-hold.png`.
  In `backend.log`, the fold turn `req-tt` has an `incoming request` line and **no `request completed`**
  — the driver read the log 1–2 s into a 2.5 s fold and then closed the page mid-stream (the attempt-10
  `req-2m` signature, exactly).
- **v2/v3/v4 refuted it.** With patient polling (wait for the turn's `done` line, then settle ≥3 s, never
  close during a turn), the pane **always** escaped to a rendered surface. Measured
  `a4-fold-re-hold-recovery.escaped = true` in every drive (waitedMs 84–86 ms), with
  `updatingMode:false` and `inputDisabledText:null`. Every `POST /api/ai/assist/stream` in v2 (req-vw,
  req-xa, req-yi, req-zr) and v4 (req-15f, req-15x, req-165, req-16i) has **incoming + `request
  completed` 200** — the adversarial "fold done-line without request completion = FAIL" condition does
  NOT occur. v4's `final-settle` = `{ok:true, ms:6018}` (page closed with no turn in flight).

Conclusion: the attempt-10/attempt-11-v1 freeze is the fastify client-abort signature produced by a
harness that measures mid-stream. **The orch's D3 reclassification is CORROBORATED. No client arm defect.**

## 4. The four MANDATED assertions — measurements

### A1 GHOSTS MOUNT PRE-REVISE (fix3 D1) — **PASS**
- v3: `[agent 5877yp] done shorthand-fold success=true events=3 elapsedMs=2334` (fold succeeded, real
  draft). ChangesPanel present, `changesApplyVisible=true`; preview bar `"1 new labware, 3 events"`;
  `wellPreview=3, dataPreview=3, ghostRects=3, wells=96` (wells grid rendered), `chatInput/chatSend=1`.
- v4: `[agent itwfth] done shorthand-fold success=true events=1`; preview bar `"1 new labware, 1 event"`;
  `wellPreview=3, dataPreview=3, ghostRects=3, wells=96`, diff `"add_material A1-A3 (3 wells) …
  on LAB-w211-sample-plate"`, Apply enabled.
- Images (`shots/r2-04-A1-draft-ghosts.png`, `shots/r2-04c-A1-well-tooltip.png`, both from drive v4):
  the "Sample Plate (PROPOSED)" 96-well grid carries **THREE dashed/purple ghost wells on A1–A3** (NOT an
  empty plate). Hovering ghost well A1 renders a tooltip **"A1 / empty / 1 event applied"** — tooltips
  inspectable. This is the D1 fix, previously failing (attempt-9 measured `slotPreview/wellPreview/
  ghostRects = 0` with a `"3 events"` draft mounted — see `2026-10-24-attempt9/state-f1-03-round0-answered.json`).
- PASS: ghosts > 0 with the fold's stream terminated (request-completed line present).

### A2 GHOSTS REMOUNT POST-REVISE — **PASS**
Spec-literal F1 flow measured in **v4** (draft mounted, then revise "Actually make it 32 wells
instead, keep the rest the same." — no Accept, so the answered bindings persist inside the active
proposal per OQ-1):
- Canonical → 3-card hold → answered → fold `events=1` → draft (A1 ghosts). Revise sent → the revise turn
  returned a **legitimate needs-clarification hold** (`[agent rwfdlo] done event_shorthand success=true
  events=0 clarifications=2`) asking exactly the two OUT-OF-REMIT cards (the 110 % fraction-sum READING
  card + the composition-role-gap card — the ANSWER-FOLD-NULL-1 close). It did **NOT** re-ask the nouns
  it had already bound (Trypsin-EDTA / DMEM / FBS / HepG2 cells) — the reuse hint held.
- The two cards were answered (UI's own controls); the fold then compiled the REVISED draft:
  `[agent wmvuhz] shorthand answer folded deterministically onto the held intent … no model call` →
  `done shorthand-fold success=true events=1 elapsedMs=60`. The revised shorthand reads
  **`intentId: seed-hepg2-32wells … labware: Sample Plate … targetWells: A1:D8`** and the deck mounts
  **`wellPreview=32, dataPreview=32, ghostRects=32`** (32 wells = A1:D8).
- Image `shots/A2b-ghost-plate.png` (drive v4): preview bar `"1 new labware, 1 event"`, ChangesPanel diff
  `"add_material A1:D8 (32 wells): Trypsin-EDTA/DMEM + FBS + HepG2 cells, 200 cells/uL … on
  LAB-w211-sample-plate"` with Enabled "Apply to run", and the plate grid shows the **32-well A1:D8
  block highlighted as ghosts**. Compare `shots/r2-07-revise-remount.png` (the pre-answer state of the
  same revise: the old 3-well preview still mounted while the hold is up).
- PASS: after the revise the revised draft mounts ghosts on the deck.

### A3 F2 SENDABLE — **PASS**
At the point the spec requires the revise input (draft mounted, preview active), v3 and v4 both measured
`chatSend=1, chatInput=1, inputDisabledText=null` (`pre-revise` step), and the revise was successfully
sent from that state (`send-revise`). The input is ABSENT only during a legitimate hold
(`"Answer the questions above to continue."`), which the architect ruling (attempt-5, F2 sub) states is
**not** a defect.

### A4 NO STUCK-EMPTY HOLD + FOLD RE-HOLD TERMINAL RECOVERY — **PASS (i) and (ii)**
- (i) Every needs-clarification hold rendered its QUESTION CARDS: v3's revise hold `cardCount=5
  ("0 of 5 answered")`; v4's revise hold `cardCount=2 ("0 of 2 answered")`; v1/v2 the same shape. The
  forbidden `cards=0 chatInput=0 honestWall=0` "No operations parsed yet" shape NEVER occurred. Image:
  `shots/r2-07-revise-remount.png` (5 cards + Cancel) and `shots/A2b-r0-result.png`.
- (ii) **BINDING measurement** `a4-fold-re-hold-recovery`: after the fold done-line the pane escaped
  updating/interpreting mode within **~85 ms** in every drive — v2 `escaped:true` (cardCount 6,
  honestWall 0, changesPanel 0, chatSend 0, chatInput 0, **updatingMode false**), v3 `escaped:true`
  (changesPanel 1, chatSend 1), v4 `escaped:true` (changesPanel 1, chatSend 1). The fold done-lines used
  are RUN-SCOPED (byte-offset baseline logged per drive), so no stale line from an earlier run can
  produce the PASS. Every fold turn's reqId has a matching `request completed` (§3).
- **The D3 class is CLOSED as a client defect — it does not reproduce under a patient harness.**

## 5. §4C F1/F2 legs (spec text quoted for the record)

> "At :5193 on a fresh run workspace — draft with the canonical utterance, then a revise prompt (e.g.
> change volumes) -> ghosts REMOUNT, tooltips inspectable, revised composition readable; and the
> negative: force the hold path, cards visible OR honest failure line, never an empty plate with a happy
> panel. VERDICT: accept."

- F1 positive: canonical draft → answered → fold draft → **ghosts mount** (A1) → revise → **revised
  composition readable + ghosts remount** (A2, 32 wells A1:D8). Tooltips inspectable (A1 shot).
- F1 negative / F2 head: the hold path renders **cards visible** with the Cancel affordance and no
  actionable Apply (`changesPanelApplyVisible=false` during holds); the forbidden "empty plate + happy
  panel" state was never observed. No honest-wall line was needed because the zero-event+zero-card
  trigger shape did not arise.
- F2 sub: the Cancel affordance + reason text were present in every hold.

## 6. Trail hygiene (read critically)

- Requested `target` vs final `url` on every step: identical modulo the app's own querystring
  `?ws=run%3AEXR-LANE2-AI10&wsa=…` — the navigation took effect; no redirect.
- v1's four byte-identical screenshots (§3) are recorded as the mid-stream artifact, not a pass.
- NOTE (honest limitation): the three re-drives reused the same `shots/r2-*` filenames, so the PNG on
  disk is from the LAST drive that wrote it (v3's shots were overwritten by v4's; `r2-06-post-accept.png`
  is v3-only, `A2b-*.png` is v4-only). Each drive's numeric measurements are preserved per-tag in
  `state-<tag>-*.json`; `shots/A2b-ghost-plate.png`, `shots/r2-04-A1-draft-ghosts.png`,
  `shots/r2-04c-A1-well-tooltip.png`, `shots/r2-07-revise-remount.png` are drive-v4 images.
- `consoleErrors` = 0 across all drives.

## 7. Observations (NON-GATING — record only, per dispatch)

1. **The attempt-9/10 reading-option OBS does NOT reproduce.** The composition fraction-sum card renders
   `readingOptions=3` and its `[data-testid^="reading-option-"]` rows ARE clickable (v2
   `state-v2-r2-01-canonical-result.json` cardInfo; v3/v4 click steps `reading-picked-r0-*`,
   `A2b-reading-0-unresolved-c-68d65279c6`). The earlier `innerText` timeout was the harness, not a
   testid-contract mismatch. No separate task candidate arising.
2. **Store ambiguity treadmill (fixture, not product).** The canonical utterance can hold with a varying
   card count (2 → 7) across drives because the store now carries many near-duplicate material records
   (e.g. `MAT-dmem-ykg0` "DMEM", `MAT-thermo-dmem-1vq1` "Thermo DMEM", and 8+ `MSP-DRAFT-EVG_*_…`
   saved-stock records for "Thermo trypsin-EDTA + …"; 30–33 hits per noun). Answering an ambiguous label
   with an AGGREGATE record (e.g. `Formulation Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2
   cells`) re-introduces fresh "Thermo …" labels and re-holds — a treadmill. Reaching a draft required
   choosing the simple/label-exact candidate the picker offers (a legitimate scientist choice); the
   driver was changed to prefer simple rows. Worth a fixture-hygiene note for the orchestrator (the
   spec's own §2/§5 already call the near-duplicate spine "the lab's steady state").
3. **Accept ends the proposal (by design) → the post-Accept revise re-asks.** In v3 (Accept then revise)
   the revise re-held with **5 cards** re-asking the answered nouns (DMEM/FBS/Trypsin-EDTA/HepG2 cells).
   That is consistent with OQ-1 ("bindings never cross a proposal boundary; …fresh-start clears them"),
   and — as §4C's negative branch anticipates — the pane rendered those cards. Measured on the
   spec-literal flow (no Accept) the revise re-asked only the two out-of-remit cards (§4 A2). Reported so
   the dispatched A2 wording ("after Accept + revise … producing a fresh draft") is read with that
   lifecycle in mind.
4. **Preview-bar event count varies across drives** for what reads as the same 3-well A1:A3 add_material:
   v3 "1 new labware, 3 events" (`events=3`) vs v4 "1 new labware, 1 event" (`events=1`). The two drives
   answered different card sets (7-card vs 3-card canonical hold), so the compiled event lists may
   legitimately differ; both mounted 3 ghosts. Recorded as an observation, not a gate failure.

## 8. Defects

None. All four mandated assertions (A1, A2, A3, A4(i)+(ii)) produced passing measurements; the §4C F1
positive/negative legs and F2 hold behaviour are evidenced; zero console errors; every stream completed.

## 9. Criteria → evidence

| criterion | verdict | evidence (this receipts dir) |
|---|---|---|
| A1 ghosts mount pre-revise | PASS | `state-v3-r2-04-A1-draft-ghosts.json`, `state-v4-r2-04-A1-draft-ghosts.json`; `shots/r2-04-A1-draft-ghosts.png`, `shots/r2-04c-A1-well-tooltip.png` |
| A2 ghosts remount post-revise | PASS | `state-v4-A2b-ghost-plate.json` (wellPreview=32, A1:D8), `state-v4-A2b-r0-result.json`; `shots/A2b-ghost-plate.png`, `shots/A2b-r0-result.png` |
| A3 revise input sendable | PASS | `trail-v3.json`/`trail-v4.json` `pre-revise` (chatSend=1, chatInput=1, disabled=null) + `send-revise` |
| A4(i) hold shows cards, never stuck-empty | PASS | `state-v3-r2-07-revise-remount.json` (5 cards), `state-v4-r2-07-revise-remount.json` (2 cards); `shots/r2-07-revise-remount.png` |
| A4(ii) fold re-hold terminal recovery | PASS | `a4-fold-re-hold-recovery` escaped=true (v2/v3/v4); `shots/r2-05-a4-fold-recovery.png`; v2/v4 reqId completion audit |
| D3 strand = harness artifact | CONFIRMED | v1 `shots/f1-03-round0-answered.png` + `backend.log` req-tt (incoming, no completion); v2/v3/v4 all-complete |
| fix4 regression lock present | VERIFIED | `server/src/api/handlers/AIHandlers.foldStreamTerminal.test.ts` in the served checkout @ `e86b0283` (ancestor of HEAD) |

VERDICT: accept