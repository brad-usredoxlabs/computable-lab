# L2-P1-LABWARE-RESOLUTION-TIER-1 — u1restier report

- Item: L2-P1-LABWARE-RESOLUTION-TIER-1
- Unit: u1restier (1 of 1)
- Worktree: /home/brad/cl-wt/L2-P1-LABWARE-RESOLUTION-TIER-1-lane2
- Branch: cl/lane2-labware-res-tier-1-l2t2595
- Base: 059059cd700827446d80c71602e6074d30fe901d
- Date: 2026-11-15 (lane run)

## What was done

`createLabwareLookup` (the `searchLabwareByHint` seam) scored tier is now
RULE-ORDERED across both record sets that answer a labware noun:
kind:labware records (name field `name`) and kind:labware-definition records
(name field `display_name`).

Changed files (exactly the 2 owned files; verified via
`git diff --name-only <base> HEAD` — nothing else touched, no prohibited file):

1. `server/src/ai/compiler/labwareLookup.ts` (198 lines at HEAD)
   - `Scored` gains an internal `kind: 'definition' | 'labware'` tag (never
     returned; `LabwareLookupResult` unchanged).
   - The scored loop now scores BOTH record sets through the SAME scoring
     ladder (100/90/50/40/80/70/30), with name extracted from
     `payload['display_name']` for definitions (mirroring the extraction the
     identity tier already uses — no refactor).
   - Comparator is kind-primary, score-descending within kind:
     `scored.sort((a, b) => (a.kind === 'definition' ? 0 : 1) -
     (b.kind === 'definition' ? 0 : 1) || b.score - a.score)` with a comment
     citing this item. Same-kind equal-score ties keep both entries
     (slice(0,5) unchanged) — a named ambiguity, never a silent pick.
   - UNCHANGED and verified byte-identical to base: function signature,
     `LABWARE_ALIAS_MAP` + early return, and the identity tier block
     (`const definitionRecords = ...` through the identity return), checked
     by programmatic block comparison of base vs HEAD.
   - No per-id special-casing anywhere; the winner emerges from scoring +
     the kind clause.

2. `server/src/ai/compiler/labwareLookup.test.ts` (541 lines at HEAD)
   - New helper `seededStore(labware, definitions)` mirroring the real store
     contract (a kind filter returns only that kind's records).
   - AC1 pin (in `matches exact alias`): on a seeded two-set store, hint
     "96-well plate" returns `lbw-def-generic-96-well-plate` FIRST and keeps
     `lbw-seed-plate-96-flat` as a ranked second entry. Same for "96 well
     plate".
   - AC2 pin (same test): hint "generic 384 well plate (seed)" (exact
     legacy-only name) resolves to `lbw-seed-plate-384` and does NOT contain
     the definition.
   - AC3 pin (new test): two same-kind candidates at the same top score
     (both alias "96-well plate") BOTH appear, in stable order, with nothing
     of a higher score before them.
   - Corrections forced by the behavior change (not new pins):
     a) identity test: the stale bait assertion
        `lookup('Generic 96-Well Deep Well Plate') toEqual([])` encoded the
        OLD behavior ("definitions unreachable by name") — exactly what this
        item changes. Now expects the definition to RESOLVE at top score
        (free text pre-selects a candidate); the case-sensitive recordId
        identity bindings in that test are untouched and stay green.
     b) two pre-existing mocks used `mockResolvedValue(labwareRecords)` for
        ALL list calls, i.e. they returned labware records for the
        labware-definition list call too — inaccurate against the real store
        contract (`RecordStoreImpl.list` filters by kind). Fixed to
        kind-filtered mocks. This was required for the kind-ordered sort to
        be exercised honestly; it does not weaken any assertion.

## Bedrock discrepancies found (repo wins over the context file)

1. BRIEF RECORD-DATA FACT IS STALE: the brief says the legacy seed scores 50
   and the definition scores 50 for "96-well plate" (a tie the comparator
   must break). Verified against the repo:
   `records/seed/labware/lbw-seed-plate-96-flat.yaml` (last touched
   05d3cb10b, before base 059059cd7) carries
   `aliases: ["96-well plate", "96 well plate"]`, so the legacy seed scores
   90 (exact alias), while the definition's `display_name: "Generic 96-Well
   Plate"` scores 50 (substring). The scores are NOT equal — a
   score-then-kind comparator CANNOT satisfy AC1 on the real seeded store.
   Decision: implement the comparator KIND-PRIMARY (definition always ranks
   above legacy labware; score descends within kind). This is the reading
   of the brief's normative statement "a DEFINITION beats a legacy labware
   record" (stated unconditionally, not only on tie) and of the governing
   line "Identity is a record id, never a name. Names, labels and aliases
   only pre-select a candidate" — curated, reusable definition records rank
   above legacy seed instances for the same free-text noun. The kind clause
   is the load-bearing rule: the mutation probe below shows AC1 goes RED
   when it is removed, regardless of score.
2. BEDROCK FACT 7 DOES NOT EXIST: `createLabwareDefinitionLookup` is not in
   the repo (repo-wide search: 0 matches). Mirrored the display_name
   extraction from the identity-tier block instead; nothing refactored.

## Commits (all naming u1restier)

- f9ba9aac3 test(labwareLookup): u1restier RED — rule-ordered scored tier pins
- 64ac5e8e3 feat(labwareLookup): u1restier — scored tier is rule-ordered across
  labware + labware-definition; kind comes from record data, same-kind ties
  keep both entries
- 0b8154884 test(labwareLookup): u1restier — drop stray blank line (cosmetic)
- <report commit> — this report (sha below in marker)
- <marker commit> — marker line appended

Base→HEAD diff stat (owned files only):
  labwareLookup.test.ts | 133 ++++++++--- (66 ins / 28 del combined with product)
  labwareLookup.ts      |  66 +++++---
  2 files changed, 171 insertions(+), 28 deletions(-)
Total changed lines: 199 (<= 200 budget). Files: 2 (<= 2 budget).

## ACCEPTANCE mapping

- AC1: GREEN — `matches exact alias` pins
  result[0] = lbw-def-generic-96-well-plate, result[1] =
  lbw-seed-plate-96-flat for "96-well plate" (and "96 well plate") on the
  seeded two-set store.
- AC2: GREEN — legacy-only exact name resolves to the legacy record; no
  definition-shaped regression (asserted not-toContain the definition id).
- AC3: GREEN — two same-kind top-score candidates both returned; identity
  tier and alias-map pins stay green (verified byte-identical product blocks;
  all baseline tests green).

## MUTATION PROBE (stated exactly)

Reverting the comparator tie-break (the kind clause) — replacing the
comparator with `b.score - a.score` while keeping definition scoring — turns
AC1 RED:

  FAIL src/ai/compiler/labwareLookup.test.ts > createLabwareLookup >
       matches exact alias
  AssertionError: expected 'lbw-seed-plate-96-flat' to be
       'lbw-def-generic-96-well-plate' // Object.is equality
  Test Files  1 failed (1)
  Tests  1 failed | 10 passed (11)

(Second, broader probe — product file at base entirely — also turns AC1 RED
plus the updated display-name pin: `Tests 2 failed | 9 passed (11)`.)
Product file was restored to HEAD before committing;
`git -c core.fileMode=false status --short` clean (no product path).

## VERIFY BEFORE EXIT — RAW OUTPUT

RED first (product at base, tests added):
  cd server && npx vitest run src/ai/compiler/labwareLookup.test.ts
    FAIL src/ai/compiler/labwareLookup.test.ts > createLabwareLookup >
         matches exact alias
    AssertionError: expected 'lbw-seed-plate-96-flat' to be
         'lbw-def-generic-96-well-plate' // Object.is equality
    Test Files  1 failed (1)
         Tests  1 failed | 10 passed (11)

GREEN same command (final commit, final tree):
  cd server && npx vitest run src/ai/compiler/labwareLookup.test.ts
    ✓ src/ai/compiler/labwareLookup.test.ts  (11 tests) 14ms
    Test Files  1 passed (1)
         Tests  11 passed (11)

Baseline was `Tests 10 passed (10)`; all 10 baseline tests stay green
(2 of them with expectations/mocks corrected as documented above; 1 new
test added → 11 total).

Wider blast check (same suite, base vs HEAD, raw):
  base:  Tests  43 failed | 1328 passed (1371)   Errors  2 errors
  HEAD:  Tests  43 failed | 1329 passed (1372)   Errors  2 errors
  `diff` of the sorted FAIL-line sets: IDENTICAL (zero new failures; the 43
  are pre-existing in files outside this item's seam, e.g.
  AgentOrchestrator.* / shorthandChat.* / submitSuggestionTool.*).
  (Raw logs: /tmp/u1restier-ai-base.log, /tmp/u1restier-ai-head.log;
  fail-set files /tmp/u1restier-ai-fails-{base,head}.txt.)

Typecheck (one run, at final tree):
  cd server && npx tsc --noEmit
  6 pre-existing errors, delta 0 — none in labwareLookup.ts or its test:
    src/api/handlers/AIHandlers.ts(332,31): error TS2339: Property 'parts' ...
    src/api/handlers/AIHandlers.ts(438,31): error TS2339: Property 'parts' ...
    src/api/handlers/AIHandlers.ts(716,31): error TS2339: Property 'parts' ...
    src/api/handlers/AiIngestionHandlers.ts(291,42): error TS2339: Property
        'parts' ...
    src/api/handlers/ExtractProtocolHandler.ts(63,42): error TS2339:
        Property 'parts' ...
    src/sequences/sequenceRoutes.ts(37,60): error TS2339: Property 'file' ...
  `grep -c labwareLookup` on the tsc output: 0.

Tree at exit: `git -c core.fileMode=false status --short` → empty (clean).

## Scope compliance

- Owned files only (verified): labwareLookup.ts, labwareLookup.test.ts.
- Prohibited files untouched: clarifications.ts, AgentOrchestrator.ts,
  runChatbotCompile.ts, records/**, identity-tier block, LABWARE_ALIAS_MAP.
- No installs/scaffolds; scratch in /tmp only; no history rewrites; no
  UI change (no Playwright needed); no YAML change (no lane-stack reload
  needed — the change is TS-only and the caller keeps consuming the same
  `LabwareLookupResult[]` array shape).

## Decisions / notes for reviewer

- The one judgment call is the comparator shape (kind-primary vs
  score-then-kind), forced by the stale bedrock score fact (see
  "discrepancies 1"). AC1 on the REAL seeded store is only satisfiable with
  kind-primary; the brief's normative wording and the governing line both
  support it. Flagging explicitly rather than hiding it.
- No per-id special-casing; no hardcoded id returns in the scored path.
- `LabwareLookupResult` gained no field (kind tag is internal to the sort).

## Next actions / blockers

- None from this unit. Remaining: reviewer acceptance (independent browser
  reviewer owns acceptance; no UI here so code review of the seam is the
  gate). Acceptance is a separate state from implementation-complete.

## Resumability

If re-entered: everything is committed on branch cl/lane2-labware-res-tier-1-l2t2595
above base 059059cd700827446d80c71602e6074d30fe901d. Re-run:
  cd /home/brad/cl-wt/L2-P1-LABWARE-RESOLUTION-TIER-1-lane2/server
  npx vitest run src/ai/compiler/labwareLookup.test.ts   # expect 11 passed
  npx tsc --noEmit                                        # expect 6 pre-existing
  cd .. && git -c core.fileMode=false status --short      # expect clean

L2-P1-LABWARE-RESOLUTION-TIER-1 UNIT u1restier DONE 587e63003c7ec6f24f0a62a4468149207277ec56
