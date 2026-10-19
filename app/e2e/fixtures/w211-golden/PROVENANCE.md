# W211-MACH-1 golden fixture — provenance + self-pin

## SELF-PIN (asserted by zymo-intent.integrity.test.ts and by the golden harness leg before any run)

- `zymo-intent.frozen.yaml` sha256: `be891b174f8b0c63a19ea567f2889985dfe5e7fc687507a214945f956211b768` (fixture v1 content-rev 1.1, final; 1.1 = advc-W211MACH1-c1 FIX1 D3/D5: fidelity block made machine-readable (`expectedMacro`/`expectedActionCount`) + SELF-PIN comment names the real harness file — asserted VALUES unchanged; v1 sha was `706838e9e6f719ce57b339e67f917d54135ddcbcab72ea205e795b483ed35640`)
- `replay-producer.mjs` sha256 (authored copy; the harness spawns THIS file): `8039c582f831d9f68727a0d6e558ee882d11f6d1cb0e877663d80f830be04a30`

Fixture drift refuses the gate (same discipline as the W2-11 campaign fixtures
`server/src/ingestion/vendor-protocol/campaign-fixtures/` + their PROVENANCE.md).

## WHAT THIS IS (honest statement, in the fixture's own words)

This fixture drives a **workflow-integration test**. The natural-language
producer is **replaced at its own wire boundary** — the OpenAI-compatible
`POST /v1/chat/completions` the product's `InferenceClient` calls
(`server/src/ai/InferenceClient.ts:146`) — by the transport-only replay server
in this directory, which serves the frozen `branchQuestionsOutput` /
`modelOutput` blocks verbatim. **This is NOT model proof.** Nothing here claims
a model can produce this output. Everything downstream of the producer — Ajv
validation, normalization, `resolve_nouns`, the SPINE-3 resolution engine,
clarification rendering, answer binding (ANSWER-BIND-1), clarification menu
routing (ANSWER-SURFACE-1), mint, persistence, recompile, deck review, accept,
LPR — runs unchanged on production paths.

## HONEST PROVENANCE

- **Lineage:** the D4_PROMPT fixture lineage (`app/e2e/w2-11-campaign-demo.spec.mjs`
  :888-899, architect ruling `W211-D4-noun-drift-fixture-decision-l2t2150`) plus
  the frozen ZYMO campaign draft content (`server/src/ingestion/vendor-protocol/campaign-fixtures/zymo-semantic-draft.frozen.yaml`,
  self-pinned `d878727a…`, derived from the real decoded Zymo candidate, PDF sha
  `257f57196f6c…`). The `branch_axes` the golden leg answers are the promoted
  family's own declared data (the frozen draft's `branch_axes`, :11-31).
- **Not a frozen model output:** the `modelOutput` block is a HAND-AUTHORED
  scientist-intent macro authored in the shipped vocabulary shape (verbs from
  `schema/scientist-intent/scientist-intent-vocabulary.yaml`, symbolic noun
  labels, no record ids / well addresses / deck slots). It was compiled
  first-hand against the live lane stack to verify the planted obligation
  classes behave as claimed (STEP 0 probes, below). The freeze is honest because
  the harness never claims the producer ran; it replaces it at the wire.
- **Scientific plausibility:** every statement is bench-plausible for a
  ZymoBIOMICS 96 MagBead-style DNA prep (transfer/add_material/bead_beat/spin/
  wash/elute/incubate/read on 96-well plates, uL volumes, rpm, temperature).
- **Authored by:** cl-coder l2t1330, 2026-10-18, under
  `.hermes/plans/2026-10-18_W211-MACH-1-golden-fixture-spec.md` (rulings OQ1
  SEAM A / OQ2 probe / OQ3 adopted).

## STEP 0 (OQ2) PROBE OUTCOME — OUTCOME B for class-(d)

Empirical probes against the live lane stack (:3093, 2026-10-18; raw bodies
under the worktree's `.hermes/plans/w211-step0/`):

- probeA/probeB (fixture prose, no answers): **200 ask arm** (`axes`, `needsAnswers`).
- probeB2 (answered draw, real model): **422 held bundle** carrying
  `ambiguous-noun 'Bead Beating Plate' actionLocation.argument 'labware'`
  (candidates A/B, confidence 1.0) AND a prose gap fact (`actionLocation` absent,
  0 candidates). The held-422 fold IS reachable.
- probeC (BIND-1 proof): answering (b) with `[[labware:LAB-w211-golden-beadplate-a|…]]`
  → the (b) fact is GONE on the next draw; only the (c) unknown-noun remains.
- probeD: `POST /vocab/mint {refKind:'material'}` mints the (c) noun; the idiom
  answer clears it. (Mint residue deleted afterwards; nonce stays fresh.)
- probeE (frozen macro compiled deterministically via `POST /intent/compile`):
  exactly TWO facts — the planted (b) `ambiguous-noun arg:labware` and the (c)
  `unknown-noun arg:material` — NO fact for any class-(a) noun, NO gap fact.
- probeF2 (all nouns resolvable): `outcome complete`, 14 events, 4 titled
  `resolvedLabwares` → `deriveDeckLabware` renders 4 titled checkboxes.
- **Class-(d) finding:** a non-noun gap fact reaches NO answerable card surface.
  On the held-422 arm `heldFactToClarificationRequest` maps it to `null`
  (`CLARIFICATION_MENU_BY_REASON` has no row for a free-text reason → no card,
  infoMsg only); on the 200-gap arm the client's 200 arms never read
  `res.clarifications` and `setHeldCards([])`. Under the frozen replay producer
  the macro emits NO gap fact at all (probeE), so the golden leg cannot plant
  one without a product change. **Filed as named fix task W211-GAPCARD-1**
  (class-(d) deck-surface answerability gap). Legs (a)/(b)/(c) stand; the
  deck-surface fidelity bar transfers to the (b)-picked record's placement offer.

## OBLIGATION CLASSES AS PLANTED (per the W211-MACH-1 block, STEP 0 outcome applied)

- (a) unique-in-band role noun: `Sample Plate` — exactly one seeded record;
  binds with NO card (probeE: no fact names it).
- (b) genuine ambiguity on a labware slot: `Bead Beating Plate` — two seeded
  in-band records (A/B); card routes `'/l'` (ANSWER-SURFACE-1); answered by PICK
  in the real ClarificationPicker; binds authoritatively (ANSWER-BIND-1).
- (c) unknown material noun: `MagBinding Beads v211g1` — zero-match cohort
  nonce; card routes `'/m'` WITH the mint floor row; answered by the REAL UI
  mint act (material-only, governed `status: proposed`).
- (d) gap fact through its real surface: **BLOCKED-ON-FIX** (W211-GAPCARD-1).

## SEED PLAN DISCIPLINE (DECK-FOLD-1 trap, spec.mjs :1038-1041)

Every seeded noun is named in `seedPlan.seededLabware` / `seedPlan.seededMaterials`;
the one noun that stays ZERO-MATCH is named in `seedPlan.zeroMatchNouns`
(`MagBinding Beads v211g1` — material-only mint creates it during the leg).
`neverSeed` names the two traps: no LAB record for the (c) noun (labware mint
is the ruled category error, A5h Q3) and no third 'Bead Beating Plate' record
(would flip (b) to a single-winner bind). NOTE recorded at build time: at this
tip `deriveDeckLabware` (ProtocolLocalizationThread.tsx:116-165) folds
`labwareAdditions` AND `resolvedLabwares` AND `labwareRequirements`, so the
trap's original mechanism ("resolvedLabwares re-empty the review") no longer
holds verbatim; the seed plan still names every seeded and every unseeded noun,
and the leg asserts label-correspondence (probeF2: the completing compile
carries NO labwareAdditions — all 4 deck rows are resolved placements titled
with the records' real titles).

## FIX RUN (advc-W211MACH1-c1 l2t2030 — D2/D3/D5/D6, l2t2110)

Fixes applied (D4 and D1 are orchestrator adjudications — untouched here):

- **D2** (RED half incomplete): committed evidence note
  `.hermes/plans/w211-step0/red-answered-facts-prebind1-note.md` — git-level
  proof 534f7e5f is pre-BIND-1 (`merge-base --is-ancestor b52f5dfc 534f7e5f`
  -> exit 1; `--is-ancestor 534f7e5f 5cdfb8d0` -> exit 0) + citation of BIND-1's
  own committed RED receipts (RED commit b7347111, tests-only, ancestor-proven
  of base; raws in `.hermes/plans/ANSWER-BIND-1-report.wip-l2t0830.md`
  §"RED-first evidence": "fact still bars" = answered facts survived pre-BIND-1).
- **D3** (fidelity bar hardcoded): fixture `fidelity` block made machine-readable
  (`expectedActionCount: 11`, `expectedMacro` — 11 entries with `params`, the
  `elute` entry carries `fromMacroAction: elute` for the product's
  liftScientistIntent transfer lift). The G1 leg now asserts the recomputed
  macro AND the LPR `overrides.parameters` against `fx.fidelity` — the harness
  carries NO inline fidelity literals (the old `toBe('30 s')/toBe(500)/
  toBe(37)/toBe('absorbance')/toBe(11)` literals are gone). Asserted VALUES are
  the proven bar from the three green runs — unchanged, only their source of
  truth moved. Anti-drift: integrity test 8 pins `fidelity.expectedMacro`
  against the frozen `modelOutput` (per-entry verb order + every param both
  directions). Fixture content-rev 1.1 (sha below); pins updated in
  integrity.test.ts, spec.mjs, and this file.
- **D5** (stale filename): fixture SELF-PIN comment now names
  `app/e2e/w2-11-campaign-demo.spec.mjs` leg G1 (`-g "G1"`), not the
  nonexistent `w211-golden-fixture.spec.mjs`.
- **D6** (asymmetric 409): `seedGoldenRows` material loop now tolerates 409
  exactly like the labware branch. Probe (private stack, this run):
  `fix1/D6-409-probe.txt` — POST of an existing material row genuinely returns
  `409 {"success":false,"error":"Record already exists: MAT-w211-magbuffer"}`.

### RAW VERIFICATION OUTPUTS (fix1, private SEAM-A stack :3193/:5293/:43117 only — orch :3093/:5193 untouched)

1. `node --check app/e2e/w2-11-campaign-demo.spec.mjs` -> exit 0 (NODE-CHECK OK).

2. Integrity test GREEN at the new fixture (8 tests, was 7):

```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/app
 ✓ e2e/fixtures/w211-golden/zymo-intent.integrity.test.ts  (8 tests) 5ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

   Drift-leg proof (temporarily desynced copy — `temperatureC: 37` -> `38` in
   `expectedMacro`, NOT committed; fixture restored to sha
   `be891b174f8b0c63a19ea567f2889985dfe5e7fc687507a214945f956211b768` after):

```
 ❯ e2e/fixtures/w211-golden/zymo-intent.integrity.test.ts  (8 tests | 2 failed) 11ms
   ❯ ... > 1. self-pin: fixture bytes match the pinned sha256 (drift refuses the gate)
     → fixture drift — update PROVENANCE.md and re-review before running the gate: expected '72dfa99ca87e0bf2a2fd157e77e57b1120163…' to be 'be891b174f8b0c63a19ea567f2889985dfe5e…'
   ❯ ... > 8. the fidelity block is machine-readable and pinned to the frozen macro (advc c1 D3 anti-drift)
     → fidelity entry 'incubate' param 'temperatureC' must equal the frozen macro value: expected 37 to be 38
```

3. ONE green G1 re-run (D3 sourced-fidelity + D6 pass) — full raw in
   `app/e2e/receipts/w211-mach1-l2t1740/fix1/G1-green-at-fix1.raw`:

```
[G1 draw1 attempt 1] ask arm -> HTTP 200
[G1 draw2 attempt 1] answered compile -> HTTP 422
[G1 pick-b] answered re-POST -> HTTP 422
[G1 mint-c] POST /vocab/mint (fired by the UI) -> recordId MAT-magbinding-beads-v211g1-vizl
[G1 pick-c] answered re-POST -> HTTP 200
[G1 seam-a proof] replay log grew 5 entries during the leg: [branch-questions, branch-questions, intent-draw-tool, intent-draw-tool, intent-draw-tool]
  ✓  1 [chromium] › e2e/w2-11-campaign-demo.spec.mjs:1290:3 › W2-11 zymo campaign demo gate › G1: golden fixture — replay producer drives the real UI end-to-end with fidelity assertions (41.5s)
  1 passed (49.0s)
```

   Byte-stability bar HOLDING at the fix run:
   `md5sum fix1/g1-deck-content.json` = `c45096014e9bd6053e83b5dd89b20ce1`
   (identical to run-1/2/3); `canonicalCompileSha` =
   `41500602713bde26345e2eb013ad3f336af26c80c02c48b6ccca6c6b81880d2b` (identical);
   `rawCompileSha` differs as named (eventId suffixes — recorded, not averaged).

Receipts: `app/e2e/receipts/w211-mach1-l2t1740/fix1/` (raw + json + screenshots
+ D6 probe). Private stack stopped after the run (own pidfiles only).
