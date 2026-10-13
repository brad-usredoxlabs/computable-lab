# SHORTHAND-COMP-1 — FIX RUN 2 report (l2t0015-fix2)

Worktree: /mnt/vast/home/brad/git/wt/SHORTHAND-COMP-1-lane2-l2t0015
Branch: SHORTHAND-COMP-1-lane2-l2t0015 (same worktree/branch as fix run 1)
Dispatch tip: 26556626 (fix1 report commit; last fix1 code commit 58a696a9)
Review addressed: /home/brad/.hermes/cl/lanes/2/reviews/SHORTHAND-COMP-1-fix1-l2t1110.md
  (VERDICT fix; D1/D3/D4/D5/D6 CLOSED; the ONE remaining HIGH = D2
  e2e-stub-honesty sub-ask = reviewer N1, plus the bundled CANONICAL-stub minor)
All git commands used `git -c core.fileMode=false`. No stack restart, no port
touched (the lane's :5174/:3001/:3093/:5193 and cl-integration-1's ports were
never driven by Playwright — see §5), no work outside this worktree.

## 0. Baselines at dispatch tip (26556626, re-measured before any edit)

| Check | Command | Result |
|---|---|---|
| server tsc | `npm run typecheck -w server` | 0 errors (exit 0) |
| app tsc | `cd app && npx tsc --noEmit \| grep -c "error TS"` | 23 (branch-pinned) |
| 4 mandated server test files | vitest run (names in §6) | 4 files / 42 tests passed |
| app ghosting neighborhood | vitest run (3 files) | 18 tests passed |
| MANIFEST hash | `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 |

## 1. The defect (reviewer N1 = D2 NOT-CLOSED sub-ask)

The fix1 GHOST-leg stub in `app/e2e/deck-ghost-shorthand.spec.ts` encoded a
payload the server never emits for a proposed/unmatched plate: it claimed
`details.labwareId: 'ghost plate'` AND `details.wells: [well]` AND
`labwareAdditions: [{recordId:'ghost plate'}]` together — a combination
unreachable in ANY single deck state (the only details.labwareId writer is
bindShorthandEventsToDeck, shorthandChat.ts:176/191/201, every arm
deck-provable). AiTabPanel reads result.events RAW (no client bridge), so the
leg passed while proving nothing about server->deck, and fix report §2's
provenance sentence was contradicted by execution.

## 2. RED — pinning the stub-honesty failure first

New test file `server/src/ai/shorthandChat.e2eStubHonesty.test.ts` (commit
`04c31655`). It extracts the e2e spec's OWN stub builders
(`blobClarificationResult` / `fixedShorthandResult`) VERBATIM from the spec
file (esbuild-transpiled, run as written) and deep-compares them against the
REAL pipeline output (parseScientistIntent ->
compileShorthandDeterministically -> shorthandResultFromCompile) for the same
document + deck state. RED against the shipped fix1 spec (real output):

```
 Test Files  1 failed (1)
      Tests  3 failed | 3 passed (6)

 FAIL … deck-match state (fix2 option (b)): stub === shorthandResultFromCompile(ghost doc, deck[plate named ghost plate])
AssertionError: expected { events: [ { …(6) }, …(95) ], …(3) } to deeply equal { events: [ { …(6) }, …(95) ], …(3) }
  Object {
    "events": Array [
      Object {
        "details": Object {
-         "labwareId": "LBW-96-1",      (real pipeline emits the DECK id)
+         "labwareId": "ghost plate",   (the stub claims the symbolic label)
          "material": "DMEM", … "wells": ["A1"], …
        },
-       "labwareId": "LBW-96-1",
+       "labwareId": "ghost plate",
 FAIL … stub === shorthandResultFromCompile(canonical doc, no deck)
  (the stub carries TWO material requests; the real compile emits THREE:
   unknown-noun(plate), unknown-noun(blob), unrealized-mixture-blob-material(blob),
   and the legacy clarification head is the labware bar '/l', not the material bar)
 FAIL … the spec must not re-introduce the unreachable combination (symbolic details.labwareId + labwareAdditions)
AssertionError: expected 'import { test, expect, type Page } fr…' not to match /labwareId:\s*'ghost plate'/
```

The no-deck characterization (passes at RED and GREEN — it is the fact that
makes the stub dishonest) — my own probe of the stub's exact shorthand through
the real seam (`tsx`, run inside server/, outputs identical to the reviewer's):

```
===== GHOST doc / NO deck (the fix1 reset state) =====
  outcome: complete | events: 96
  labwareAdditions: [{"recordId":"ghost plate","reason":"ProtocolIntent labware resource ghost plate"}]
  event[0].labwareId: "ghost plate"
  event[0].details: {"well":"A1","material":"DMEM","volumeUl":50,"volume":{"value":50,"unit":"uL"}}
  event[0].details keys: ["well","material","volumeUl","volume"]   <- NO labwareId, NO wells
===== GHOST doc / deck[name=ghost plate, id=LBW-96-1] =====
  outcome: complete | events: 96
  labwareAdditions ABSENT (hasOwnProperty false)
  event[0].labwareId: "LBW-96-1"
  event[0].details: {"well":"A1","material":"DMEM","volumeUl":50,"volume":{…},
                     "labwareId":"LBW-96-1","wells":["A1"]}
===== CANONICAL doc / NO deck =====
  outcome: needs-clarification | events: 0
  clarificationRequests reasons: ["unknown-noun","unknown-noun","unrealized-mixture-blob-material"]
  clarificationRequests labels: ["plate","50:50 Trypsin-EDTA/DMEM","50:50 Trypsin-EDTA/DMEM"]
```

## 3. Which option was chosen and WHY: option (b) — an EXISTING deck plate

Option (a) (stub the raw no-deck payload and assert what honestly renders)
was rejected for this campaign: with an empty deck the server emits details =
{well, material, volumeUl, volume} — NO details.labwareId and NO
details.wells — and collectEventLabwareIds (previewProjection.ts:120-134)
reads details.* only, so the 96 events bucket under NO labware and the wells
CANNOT ghost. An honest no-deck leg would prove the GAP, not the Part IV fix
(Part IV criterion 1: "compiled shorthand add_material carries details.labwareId
+ wells"; criterion 3: mouseover shows the pending add). The campaign needs the
ghost proven plain-material, and the deck-matched state is the ONLY single
deck state where the server genuinely emits details.labwareId + details.wells.

Option (b) models the intended scenario honestly: the deck is seeded (via the
normal record-PUT path the sibling deck specs already use) with an EXISTING
plate named 'ghost plate' (id LBW-96-1, lawn placement). The exact deck-name
match is what makes bindShorthandEventsToDeck rewrite the hint to the deck id
and write the Part IV carriers — the server's own behavior, not a stub claim.
The honesty test pins the choice: its no-deck case asserts the bucket keys are
absent there ("why option (b)"), and its spec-text case forbids re-introducing
the unreachable combination.

Both campaign criteria stay proven:
- blob blocked canonical: the CANONICAL leg still stubs the verbatim
  needs-clarification turn (now the THREE real requests) and asserts 0 ghost
  tiles / 0 preview wells; the server-side bar stays pinned in
  declaredArgumentReachability.test.ts (CANONICAL leg test).
- ghost proven plain-material: the GHOST leg drives the honest deck-matched
  payload through the REAL client code path (buildPreviewFromDraft ->
  buildPreviewWellIndex -> collectEventLabwareIds/getAffectedWells ->
  LabwareTile data-affected -> WellGrid data-preview -> WellTooltip volume).

## 4. GREEN — the rewritten spec + the honesty pin

`app/e2e/deck-ghost-shorthand.spec.ts` (commits `02f5fd81`, `515e76c5`):
- CANONICAL leg: stub = the verbatim no-deck needs-clarification payload —
  THREE clarificationRequests [unknown-noun(plate, '/l'), unknown-noun(blob,
  '/m'), unrealized-mixture-blob-material(blob, '/m')], legacy clarification =
  the FIRST request (the labware bar), shorthand verbatim, notes ABSENT
  (bundled minor fixed: the fix1 stub omitted the plate bar and carried the
  wrong head). Assertions unchanged (questions panel names the blob label;
  0 ghost tiles; 0 preview wells).
- GHOST leg: deck seeded with the plate (schema-valid labwares + editorLayout
  placement per schema/workflow/event-graph.schema.yaml; the PUT's success is
  asserted, so a schema rejection would fail the test loudly). Stub = the
  verbatim deck-matched payload: 96 events, labwareId 'LBW-96-1', details =
  {well, material, volumeUl, volume, labwareId:'LBW-96-1', wells:[well]}, NO
  labwareAdditions. Assertions now prove the server->deck path: the committed
  tile (data-ghost="false") flips data-affected="true" (the client bucketed
  the server-emitted details.labwareId onto the deck placement), drilling in
  shows 96 data-preview="true" wells, A1 tooltip names 50.
- Legs run serial (they share the one deck fixture and seed it differently).

Honesty pin (GREEN):
```
 ✓ src/ai/shorthandChat.e2eStubHonesty.test.ts  (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```
The pin is two-way: stub === real pipeline output (deep compare, eventId +
provenance.timestamp excluded as per-compile random) AND the spec text must
not re-introduce `labwareId: 'ghost plate'` or a `labwareAdditions: [` stub.
Re-verified RED-then-GREEN: with the fix1 spec restored the same file fails
3/6; with the fix2 spec it passes 6/6.

## 5. e2e run (where, and how the port constraint was honored)

The task forbids driving Playwright against :5174/:3001/:3093/:5193. The
original fix run's convention was "the already-running :5174 dev server,
read-only". To honor the constraint literally, I started my OWN dev server
from THIS worktree's app/ on a fresh port 5175 (vite, own VITE_CACHE_DIR,
proxying /api to the already-running :3001 — the same shared stack the lane
specs always read; no stack restarted, no forbidden port driven by Playwright;
the server was killed after the run):

```
$ PLAYWRIGHT_BASE_URL=http://localhost:5175 npx playwright test e2e/deck-ghost-shorthand.spec.ts --project=chromium
 ✓ 1 [chromium] › CANONICAL leg: the blob prompt yields the mixture clarification and ghosts NOTHING (interim bar, no blob record) (8.9s)
 ✓ 2 [chromium] › GHOST leg: the plain-material proposal ghosts A1:H12 on the deck with volumes (no model) (3.4s)
 2 passed (12.9s)
```

The GHOST leg's deck-seed PUT returned 200 (asserted in-test), proving the
seed payload is schema-valid on the live stack; the CANONICAL leg's empty-deck
PUT likewise. The :5193 live browser gate remains orchestrator-gated and was
NOT run here.

## 6. Corrected provenance text (fix report §2)

`.hermes/plans/reports/SHORTHAND-COMP-1-report.l2t0015-fix1.md` §2 now reads
(commit `b00e0497`): the original sentence "the probe confirmed the server
emits the SAME label on both when the deck has no matching plate" is struck
and replaced with: the probe confirmed the TOP-LEVEL `event.labwareId` carries
the symbolic 'ghost plate' label when the deck has no matching plate, but
`details.labwareId` is NOT emitted in that state at all (details = {well,
material, volumeUl, volume}; the only details.labwareId writer is
bindShorthandEventsToDeck and every arm requires a deck-provable match); the
deck-matched state emits details.labwareId = the DECK id ('LBW-96-1'), never
the symbolic label, and no labwareAdditions; the fix1 stub therefore encoded a
payload no single deck state emits, and fix2 rewrote the leg to the honest
deck-matched scenario. A provenance addendum states the fix2 stubs are
byte-compared against the real pipeline output by
`server/src/ai/shorthandChat.e2eStubHonesty.test.ts`.

## 7. Baselines at head (zero NEW)

| Check | Command | Result |
|---|---|---|
| server tsc | `npm run typecheck -w server` | 0 errors (exit 0) |
| app tsc | `cd app && npx tsc --noEmit \| grep -c "error TS"` | 23 (unchanged; e2e/ is outside tsconfig include, server tsconfig excludes **/*.test.ts) |
| 4 mandated server test files + honesty test | `npx vitest run src/compiler/biology/verbs/addMaterialVolume.test.ts src/compiler/scientistIntent/declaredArgumentReachability.test.ts src/ai/shorthandChat.labwareIdBinding.test.ts src/ai/shorthandChat.labwareResult.test.ts src/ai/shorthandChat.e2eStubHonesty.test.ts` | 5 files / 48 tests passed (42 mandated + 6 new) |
| src/compiler/scientistIntent/ | `npx vitest run src/compiler/scientistIntent/` | 175 tests passed |
| shorthand neighborhood | AgentOrchestrator.shorthandChat / shorthandDeckBinding / coerceAgentIntent | 35 tests passed |
| app ghosting neighborhood | shorthandPreviewGhosting / previewProjection / wellRange | 18 tests passed |
| MANIFEST hash | git hash-object | 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (byte-identical) |
| scope | `git -c core.fileMode=false diff --name-only a28d9789..HEAD` | 13 files — the 12 of fix1 + `server/src/ai/shorthandChat.e2eStubHonesty.test.ts`; NO AgentOrchestrator.ts, NO ChatbotCompilePasses.ts, NO wellRange.ts, NO goldens, NO schema/**, no app product code |

## 8. Fix2 commit list

- `04c31655` test(shorthand): RED fix2/N1 — honesty test extracting the spec's stub builders + deep-compare vs the real pipeline (3 failed | 3 passed against the fix1 spec)
- `02f5fd81` fix(e2e): GREEN fix2/N1 — option (b) honest deck-matched ghost leg + three-request canonical stub + honesty pin green (6/6)
- `515e76c5` test(e2e): assert the deck seed/reset PUTs succeed (last CODE commit)
- `b00e0497` docs+test(SHORTHAND-COMP-1): corrected fix1 §2 provenance sentence + spec type cleanup (APIRequestContext) — the LAST commit carrying spec/report corrections; the fix2 report commit is the branch tip on top of it (a commit cannot contain its own hash; same convention as fix1)

The DONE sha names `b00e0497` — the last commit carrying the corrected
provenance text and the final spec state (the last pure-CODE commit is
`515e76c5`). Verify with `git -c core.fileMode=false log -1` (tip = the fix2
report commit).

SHORTHAND-COMP-1 FIX2 DONE b00e0497
