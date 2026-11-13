# L2-JOURNEY-EVIDENCE-1 / unit 3 of 3 — evcite3 report

- worktree: /home/brad/cl-wt/L2-EVIDENCE-evcite3-lane2
- item: L2-JOURNEY-EVIDENCE-1-evcite3
- base: 00107a2963d415f75ab744c10375584e9aed5eec
- implementation commit: d1160c95

## What changed

New, owned files only (no other file touched):

- `server/src/compiler/journey/journeyEvidenceCitation.ts` (53 lines)
  - `CITATION_SCHEME_PREFIX = 'journey-evidence:'`
  - `formatJourneyEvidenceCitation(bundle: Pick<JourneyEvidenceBundle, 'journey_id' | 'revision'>): string`
  - `parseJourneyEvidenceCitation(text): { ok: true; journey_id; revision } | { ok: false; rule }`
    (discriminated union; no optional revision, so `exactOptionalPropertyTypes` is satisfied)
  - named refusals: `journey_evidence_citation_empty`, `_scheme_missing`,
    `_separator_missing`, `_revision_invalid`, `_journey_id_missing`
  - type-only import of `JourneyEvidenceBundle` from `journeyEvidenceBundle.ts`.
    No import of `journeyEvidenceStore.ts` (grep count 0), no Ajv, no I/O, no clock,
    no re-sanitising/normalising of the journey id.
- `server/src/compiler/journey/journeyEvidenceCitation.test.ts` (77 lines, `// @vitest-environment node` first line)
  - 14 tests: pinned exact string, scheme constant, plain round-trip, hostile round-trip
    (`A@b:c/d eé中`), id ending in `@r7`, large revision, 8 refusal arms, each asserted
    to be a named refusal object and to never throw.

Split rule implemented as specified: scan candidate `@` positions from the last
backwards, take the last one whose suffix matches `^r[1-9][0-9]*$`; everything
before it is the journey id verbatim (`parts.slice(0, i).join('@')`).

Budget: 2 files, 130 lines total (limit 180).

## RED (module absent) — raw

```
$ cd server && timeout 120 npx vitest run src/compiler/journey/journeyEvidenceCitation.test.ts

 RUN  v1.6.1 /home/brad/cl-wt/L2-EVIDENCE-evcite3-lane2/server

 ❯ src/compiler/journey/journeyEvidenceCitation.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/journeyEvidenceCitation.test.ts [ src/compiler/journey/journeyEvidenceCitation.test.ts ]
Error: Failed to load url ./journeyEvidenceCitation.js (resolved id: ./journeyEvidenceCitation.js) in /home/brad/cl-wt/L2-EVIDENCE-evcite3-lane2/server/src/compiler/journey/journeyEvidenceCitation.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

## GREEN — raw

```
$ cd server && timeout 120 npx vitest run src/compiler/journey/journeyEvidenceCitation.test.ts

 RUN  v1.6.1 /home/brad/cl-wt/L2-EVIDENCE-evcite3-lane2/server

 ✓ src/compiler/journey/journeyEvidenceCitation.test.ts  (14 tests) 4ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

## Neighbour suite — raw

```
$ cd server && timeout 180 npx vitest run src/compiler/journey/

 Test Files  15 passed (15)
      Tests  120 passed (120)
```

Note: the very first neighbour run (immediately after GREEN) showed
`1 failed | 14 passed (15)`, `1 failed | 119 passed (120)` in the
journey-evidence store concurrency assertion ("the file equals the winner's
bytes"). Four subsequent full-directory runs were green (three back-to-back,
then the run above). No owned file is involved in that suite and no store
module is imported by this unit; classified as a pre-existing flaky
concurrency assertion, not a regression from this change. The reviewer should
treat the store test's own stability as out of scope for this unit.

## Typecheck — raw

```
$ cd server && timeout 240 npx tsc --noEmit
tsc_rc=0
```

## Acceptance contract self-check

1. pinned format output `journey-evidence:journey-a@r3` — asserted, GREEN.
2. hostile journey id round-trips verbatim incl. `/` and unicode — asserted, GREEN.
3. all eight refusal arms return `{ok:false, rule:'journey_evidence_citation_*'}`, never throw — asserted, GREEN.
4. no import from `journeyEvidenceStore.ts` — `grep -c` = 0.

Browser grading waived (data-only unit; nothing served).

## Next actions / blockers

None. Tree clean after the report commit.
