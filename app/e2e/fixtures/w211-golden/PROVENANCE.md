# W211-MACH-1 golden fixture — provenance + self-pin

## SELF-PIN (asserted by zymo-intent.integrity.test.ts and by the golden harness leg before any run)

- `zymo-intent.frozen.yaml` sha256: `706838e9e6f719ce57b339e67f917d54135ddcbcab72ea205e795b483ed35640` (fixture v1, final)
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
