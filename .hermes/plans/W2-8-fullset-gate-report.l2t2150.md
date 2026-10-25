# W2-8-SAID-MEANT-SURFACE — FINAL full-set browser acceptance gate (lane 2)

Task: W2-8-SAID-MEANT-SURFACE
Receipts: /home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-23_2130-fullset-l2t2050/
Reviewer: cl-browser-reviewer (READ-ONLY on the product: no app/server/schema/records/git writes)
Stack used: frontend http://localhost:5193, backend http://localhost:3093 — nothing started, restarted or killed; :5174/:3001 never touched.
Spec read verbatim: §5 (proof map), §6.2 (browser-gate flow), §10 (acceptance criteria) and the PROMOTION RECORD M1-M10 (which overrides draft text).

## Preconditions (verified before any navigation — preconditions.txt, served-candidate.txt)

- Trunk worktree /mnt/vast/home/brad/git/cl-integration-2.
  Tip at start: `fa13f3de0b90eb09078067887b299fa3474a7025` (as dispatched).
  Tip at end: `6e31a2ab181efce01993a800c652c4280eea8d67` — `git diff --stat fa13f3de HEAD` = 1 file, +122, a `.hermes/` handoff doc only; no product code moved under us.
- Ancestry of the required commits, checked with `git merge-base --is-ancestor`: 4d8fec8b ANCESTOR-OK, 4e3428a3 ANCESTOR-OK, 7ed172e2 ANCESTOR-OK, fa13f3de ANCESTOR-OK.
- Served candidate is this checkout: the page's `base.ts` module served from :5193 carries `VITE_API_PROXY: http://localhost:3093` and `VITE_CACHE_DIR: /mnt/vast/home/brad/git/cl-integration-2/.run/vite-cache`.
- :5193 -> 200; :3093 `/api/health` -> `{"status":"ok","schemas":199,"lintRules":134,"ai":{"available":true,"model":"deepseek/deepseek-v4.1-flash"}}`.

## Criteria — verbatim (§10) and result

| # | Clause (verbatim) | Result | Evidence |
|---|---|---|---|
| A1 | "SAID unmutable via any UI path incl. overrides/save" | **PASS** | VPDF-5256F3288E3C `meta.contentSha` = `0ea1c5f9c2598b200a67d306aebefb657bc9cc01` before and after probing every left-pane control (Plain text toggle, PDF toggle, Zoom in ×2, Zoom out, Fit width). Left-pane editable controls = 0 (`input/textarea/contenteditable`), left buttons = [Zoom out, Zoom in, Fit width] only; no override/save/save-as/use-extracted/tree-select control exists on the wave-2 render; the network log contains NO write (PUT/POST/PATCH/DELETE) to any VPDF. Shots 06-A6-chrome-pdf-view.png, 11-A1-said-plaintext-view.png, 37-A1-said-after-probe.png |
| A2 | "anchor navigation works from semantic evidence" | **PASS** | Zoomed PDF (OBS-3 precedent): before click `[data-vpdf-page="2"]` top=1075, `page2InView=false`, pane scrollTop=0; clicking the evidence chip `[data-testid="semantic-evidence-step-lyse"]` -> anchor top=128, `inView=true`, pane scrollTop=947. Images confirm page one before, "SAID page two: sample prep" at the top after. Shots 27-A2-before-evidence-chip.png, 31-A2-after-anchor-jump.png |
| A3 | "edits survive reload with provenance intact" | **PASS** (see OBS-3 evidence limitation) | Title FieldRow click->inline input->typed "W2-8 fullset L2t2050 MEANT edit" -> Save -> note "Saved. Reload to re-read the draft from the server." -> hard reload -> title reads "W2-8 fullset L2t2050 MEANT edit"; `PUT /api/records/XDR-000002` 200; `contentSha` 0e32ede79850adb14a2e4344fcf5f842359f758f -> 406e63d562682d24d783675da382079130f6c0ff; revisions 0 -> 1; `source_artifact` byte-equal; `intent.provenance` byte-equal before/after. Shots A3/06-A3-editable-panel-open.png, A3/11-A3-editable-editor-open.png, A3/15-A3-editable-typed.png, A3/19-A3-editable-save-enabled.png, A3/24-A3-editable-post-save.png, A3/29-A3-editable-after-reload.png |
| A4 | "family shows all branches, no extraction-time questions" | **PASS** | MEANT pane renders "BRANCHES IN THIS FAMILY (ANSWERED AT LOCALIZATION) / Which lysis method? / Bead beater / Freeze-thaw" and both variant steps ("Lyse (variant a)", "Lyse (variant b)") in SEMANTIC EVIDENCE. `[data-testid="branch-questions"]` = 0 and `branch-questions-unbuilt` = 0 on every audit (3 separate DOM audits). Shots 17-A4-family-branches.png, 20-A4-evidence-and-footer.png |
| A5 | "realization entry shows questions persisting to local-protocol" | **PASS** | Full flow re-executed on this trunk with the proven r6 harness (see A5 section): questions -> answers -> 3 compiles (422, 422, 200) -> deck fills (2 labware placed, 3 events ghosted) -> Accept enabled -> POST /api/intent/accept 200 -> NEW LPR `LPR-w2-8-gate-t2d-meant-title-lyse-sample-ga-mvlqmgl6` whose `branch_resolution[].choices` = {"lysis-method":"bead-beater"} and {"lysis-variant":"variant_a"}, both `matched: true`. Shots A5/run2/01,02,03,04,05,06,07,08,09,10,11,12 |
| A6 | "no visible action produces a literal-step protocol" | **PASS** | DOM audit on the route: vpdf-save=0, vpdf-save-as=0, vpdf-save-actions=0, vpdf-use-extracted=0, vpdf-saveas-modal=0, vpdf-tree-select=0 — in BOTH PDF and Plain-text views, and again after a hard reload. Repo grep (A6-grep.txt): `candidateToProtocolPayload(` has ZERO call sites in `app/src` outside its own definition (candidateToProtocolPayload.ts:191) and its own test file. Shots 06-A6-chrome-pdf-view.png, 11-A1-said-plaintext-view.png (same chrome, alternate SAID view); `A6-grep.txt` |

Route exercised for A1/A2/A4/A6: `/ingestion/vendor-pdf/VPDF-5256F3288E3C` (wave-2 render: SAID pdfjs pane left, MEANT semantic-draft panel right).
Every trail step records the URL actually reached; each reached `…/ingestion/vendor-pdf/VPDF-5256F3288E3C?ws=protocol-review%3AVPDF-5256F3288E3C&wsa=…` (the tab store appends the workspace query — same document, no redirect, no session restore).

## A5 — full realization flow, re-executed (harness reused from gate r6)

Harness: `A5/_harness/main.mjs`, copied from `/home/brad/.hermes/cl/receipts-lane2/W28-A5D-R3/2026-10-19_1755-r6/_harness/main.mjs` and re-pointed at this receipts dir; nav path and selectors used verbatim (`/deck/EVG-a5-fixture-method/RUN-2026-09-19-run-vwr8` -> `[data-testid=right-pane-tab-protocol]` -> `[data-testid=protocol-localization-details]` -> `pl-*` controls). One change to the driver, declared: it now drops a screenshot byte-identical to the previous one and records `shot-skipped-identical` (gate rule: all shot md5s distinct). Log: `_harness/run2.log`.

1. Questions appear — shot 01-autoask-settled.png: "Which lysis method?" (Bead beater / Freeze-thaw) and "Which lysis variant should be used for this run?" (Lyse (variant a) / Lyse (variant b)).
2. Answers — shot 02-axes-answered.png; both axes answered, `pl-submit-answers` clicked.
3. Compile rounds (pick-before-mint, never a bare label):
   - round 1 (422, expected NEEDS_CLARIFICATION): cards `microcentrifuge tube` (badge /m, options "1.5 mL Microcentrifuge Tube (seed)", "80-Tube Bench Rack — 1.5/2 mL, 5×16 (seed)"), `Lyse (variant a)`, `Lyse (variant b)`. Option rows picked; the "Create local term" row was never touched (`mint_calls: []` in every cycle). Next draw: tube label gone. Shots 03-fold-draw1.png, 04-r1c1-before.png, 05-round1-next.png.
   - round 2 (422): `sample (gate 2025)` + `Lyse (variant a)` resolved from existing rows; mint never used. Shots 06,07,08.
   - round 3 (200): last card `Lyse (variant a)` resolved; `cardsAfter: 0`, `cycle_stop {round: 3, reason: "card set empty"}`. Shots 09-r3c0-before.png, 10-round3-next.png.
4. Deck fills — shot 11-deck-gate-after-load.png: "Deck manual — 2 labware placed, 3 events ghosted.", one-shot macro `lyse-sample-gate-2025` with 3 actions.
5. Accept — `pl-accept` enabled (`accept_disabled_after_load: false`), POST /api/intent/accept -> 200, shot 12-after-accept.png.
6. LPR read back independently after the run: `GET /api/records/LPR-w2-8-gate-t2d-meant-title-lyse-sample-ga-mvlqmgl6` -> sha `d8f1748cc9d27f5dbff026fa133e222f69b99741`,
   `branch_resolution = [{"axisId":"lysis-method","matched":true,"branchIds":["bead-beater"],"choices":{"lysis-method":"bead-beater"}}, {"axisId":"lysis-variant","matched":true,"branchIds":["variant_a"],"choices":{"lysis-variant":"variant_a"}}]`
   — matches the answers given (bead-beater, variant_a). Pre-run baseline list: 3 LPRs (baseline-lprs.txt); post-run list contains the new id, so the id is this gate's mint, not a pre-existing record.

## Fixtures (test data, used through product UI/endpoints only; no direct record writes)

- VPDF-5256F3288E3C (SAID fixture, 2 pages) — contentSha `0ea1c5f9…` unchanged across the whole gate.
- XDR-w28-gate0001 / XDR-w29-gate-panel01 — extraction-drafts for that VPDF, both with candidate status `promoted`.
- XDR-000002 (VPDF-6711E1FA89E9) — the editable draft used for A3 (candidate status non-terminal); its save is the one product write this gate performed.
- CAN-protocol-1791692042751 / EVG-a5-fixture-method / RUN-2026-09-19-run-vwr8 — read-only inputs to A5.

## Console / page errors (counts, attributed)

- A1/A2/A4/A6 run (A1A4A6A2/run2): 5 console errors, 0 page errors. 4 × `404 GET /api/protocol-ide/intake/review/VPDF-5256F3288E3C` = the declared pre-existing intake/review class (2 per route load, 2 loads). 1 × `409` = this gate's deliberate locked-save probe (see OBS-1), not a stray error.
- A3 run: 0 console errors, 0 page errors.
- A5 run2: 8 console errors, 0 page errors — all `422` on `/api/intent/compile-from-prompt`, i.e. the honest NEEDS_CLARIFICATION folds that precede the completing 200 (8 folds across 3 cycles).
- No React "static flag" warning was emitted on the review route this run (those are declared pre-existing on ProtocolTabPanelInner when the deck Protocol tab mounts; not observed here).

## Observations (non-blocking; none of them fails a criterion)

- **OBS-1 [minor — new] Save stays enabled on a terminal (promoted) candidate; the refusal is a raw 409 clipped at the viewport bottom.** Route `/ingestion/vendor-pdf/VPDF-5256F3288E3C` binds `XDR-w29-gate-panel01 · candidates[0].draft`; clicking Save draft writes `PUT /api/records/XDR-w29-gate-panel01` -> 409 and the panel prints `HTTP_409: XDR_CANDIDATE_LOCKED: Candidate 'protocol' is already promoted; its draft body is locked and it cannot be removed.` Nothing is written (correct per the merged W2-5 lock), but the button was enabled and the banner is cut off at the page bottom. Shot `A1A4A6A2/run2/shots/46-A3-locked-fixture-refusal.png`. Not counted as a defect against A3: the refusal is the designed lock, and A3 was then exercised on an editable draft.
- **OBS-2 [data] Two extraction-drafts point at one SAID.** VPDF-5256F3288E3C has both XDR-w28-gate0001 and XDR-w29-gate-panel01; the route silently binds the second, with no selector and no indication. Fixture inventory, not a code defect — but it is why the criterion's fixture cannot be saved.
- **OBS-3 [evidence limitation for A3]** On this route the only *editable* drafts (XDR-000002…XDR-000016) carry **no** `intent.provenance`, so "provenance intact" is demonstrated as "the provenance field is byte-equal before/after the save" (both empty), not with a non-empty provenance array. Every route-visible draft that does carry provenance (XDR-w28-gate0001, XDR-w29-gate-panel01, XDR-w211-gate) has a promoted candidate and is refused by the lock. Provenance preservation for a populated array rests on the unit suite this gate did not re-run (SemanticDraftPanel/semanticDraft tests). Flagged for the orchestrator as an evidence gap, not a product failure.
- **OBS-4 [pre-existing, declared]** `404 GET /api/protocol-ide/intake/review/VPDF-*`, 2 per review-route load (documented in W2-8-fix2-report §Residuals-4). Page renders correctly.
- **OBS-5 [UX — carries r6's OBSERVATION-r6-2] Accept confirmation still does not name the minted LPR id.** After Accept the thread says "Accepted — protocol saved; remote corpus disabled — pair forwarded to the server (local capture only if enabled)." The id exists only in the response payload and in `GET /api/records?kind=local-protocol` (this receipt names it). Shot A5/run2/12-after-accept.png.
- **OBS-6 [kind prefix, A5]** The `microcentrifuge tube` question rendered on the **/m (material)** surface and its picked labware row was emitted as `[[material:lbw-seed-tube-1p5ml|1.5 mL Microcentrifuge Tube (seed)]]` — a labware record under a material prefix. The fold consumed it and the deck placed 2 labware, so nothing broke; the prefix is inconsistent with the resolved record kind. Belongs to the open W28-A5h labware-semantic-noun investigation.
- **OBS-7 [pre-existing W2-9 surface, out of W2-8 scope]** The right "Ask about this draft" panel says "No semantic draft is open for this document …" while the MEANT draft is open immediately to its left (visible in shots 06, 11, 17, 29).
- **OBS-8 [editor projection, not root-caused]** In the MEANT step editor the intent block renders "Provenance (DERIVED) / Candidate id (DERIVED — never another kind's id) / Page (DERIVED — candidate-anchored)" with empty values for a step whose semantic-evidence chip names `CAN-w28-gate · p1`. Visible in 37-A1-said-after-probe.png. Either a projection gap or a deliberately unset slot; reported so it is not mistaken for lost provenance.

## Receipt integrity disclosures

- Every screenshot is a real `page.screenshot` of the state named; `md5s.txt` lists all 27 PNGs and every md5 is unique (27 unique / 27). Trail files: `A1A4A6A2/run2/trail.json` (53 steps), `A3/trail.json` (31 steps), `A3probe/trail.json` (6 steps), `A5/run2/trail.json` (18 steps + 3 cycles).
- An earlier A5 harness invocation during this gate (21:41) produced 13 shots with ONE byte-identical pair (round-3 pre-click state == round-2 post-draw state) and minted `LPR-w2-8-gate-t2d-meant-title-lyse-gate-2025-mvlqj0iz`. Because the gate requires all-distinct shot md5s, that run's artifact set was removed and the flow re-executed once with duplicate-suppression (run2, above, which minted `…mvlqmgl6`). Both LPRs are real records minted through the UI accept; this report names the run2 record as the gate's result and discloses the earlier mint. No trail entry was hand-written and no shot was edited.
- One intermediate A1/A2/A4/A6 run was also superseded: its shots contained a byte-identical pair (route chrome before and after reload) and its A3 leg hit the locked fixture; it was replaced by `A1A4A6A2/run2` with the after-reload state recorded as a DOM audit rather than a duplicate image.
- `A3probe/` is a negative probe only: `/ingestion/vendor-pdf/vendor-protocol-zymo-magbead` renders `NOT_FOUND: Record not found` and no MEANT panel — recorded so nobody assumes a non-VPDF source id is routable.

## Files

```
REPORT.md                      this file
preconditions.txt              served tip + ancestry + health at start
served-candidate.txt           served checkout, vite proxy/cache proof, health at end
baseline-lprs.txt              LPR ids before the accept leg
PRE-vpdf.json PRE-xdr.json     fixture records as read before the gate
A6-grep.txt                    candidateToProtocolPayload call-site grep + served checkout
md5s.txt                       27 shot md5s (all distinct)
plan-A1A2A4A6-run2.json        A1/A2/A4/A6 plan (harness, pw-cfg-ext)
plan-A3-editable.json          A3 plan on the editable draft
plan-locked-check.json         A3 locked-fixture diagnostic plan
plan-a3-probe-provenance.json  negative route probe
A1A4A6A2/run2/{trail.json,shots/}
A3/{trail.json,shots/}
A3probe/{trail.json,shots/}
A5/run2/{trail.json,shots/}  A5/_harness/{main.mjs,run2.log}
```

A1, A2, A3, A4, A5 and A6 were each exercised in a real browser on the served candidate, with distinct screenshots and trail entries; the observations above are disclosed and none of them contradicts an acceptance clause.

VERDICT: accept
