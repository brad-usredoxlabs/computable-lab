# L2-JOURNEY-EVIDENCE-1 — UNIT 3 (evcite) report

- Worktree: /home/brad/cl-wt/L2-JOURNEY-EVIDENCE-1-evcite-lane2
- Branch: cl/lane2-journey-evidence1-evcite-0425
- Base: e92c8e3a7d6f5b0a3c8e9f1d2a4b5c6d7e8f9a0b (measured via git rev-parse at run start)
- Tier: consequential. ACCEPTANCE: no route, no UI, nothing served. Graded by the raw targeted vitest output below.

## Deliverable (2 files, all NEW, exactly the scoped set)

| file | lines (final) |
|---|---|
| server/src/compiler/journey/journeyEvidenceCitation.ts | 49 |
| server/src/compiler/journey/journeyEvidenceCitation.test.ts | 70 |
| TOTAL | 119 |

OUTPUT BUDGET DISCLOSURE: the brief's budget is files <= 2, lines <= 120. Files: 2 (met). Lines: 119 (met). Every line maps to a briefed requirement: lossless parse or a named refusal, never a throw; journey_id verbatim (no trim/case-fold/unicode-normalise/sanitize); split at the LAST '@' whose suffix matches r<digits>; schema-id prefix 'journey-evidence:' required; revision suffix must be r[1-9][0-9]*; empty id refused; malformed ID refused; every failure case returns {ok:false, rule:<named>} with one of RULE_CITATION_SCHEME_MISSING, RULE_CITATION_ID_MISSING, RULE_CITATION_REVISION_INVALID.

## Design decisions

1. **Lossless**: `journey_id` is only `{type: string, minLength: 1}` in the closed bundle schema, so it may legally contain '@', ':', '/', spaces and non-ASCII. The format splits at the LAST '@' whose suffix is `r<digits>` (regex `/^r[1-9][0-9]*$/`), and everything before it is the id VERBATIM — never trimmed, never case-folded, never unicode-normalised, never sanitised. In particular this is NOT the store's path segment: `sanitizeSegment` is lossy by design and a citation built from it would name a different journey than the bundle carries (the store is not imported here).

2. **Refusal over guess**: unparseable input is a named refusal, never a throw and never a guessed value. No validation of the bundle itself — that has one authority (`validateJourneyEvidenceBundle`); this module takes the two identity members only, and no journey id, surface or record literal.

3. **Deterministic shape**: `formatJourneyEvidenceCitation(bundle)` always produces `journey-evidence:${bundle.journey_id}@r${bundle.revision}`; `parseJourneyEvidenceCitation(text)` returns either `{ok:true, journey_id:string, revision:number}` or `{ok:false, rule:string}`.

4. **No second authority**: the module does not import or use the store's `sanitizeSegment`; the only regex is `/^r[1-9][0-9]*$/` for the revision suffix. Zero journey-id / step-id / surface-name / record-kind literals beyond the test data.

## Verification (RAW, pasted verbatim)

### STEP 0 baseline (RED first, module absent)

The test file was written first; running it when the module did not exist confirmed RED:

```
 ❯ src/compiler/journey/journeyEvidenceCitation.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/compiler/journey/journeyEvidenceCitation.test.ts [ src/compiler/journey/journeyEvidenceCitation.test.ts ]
Error: Failed to load url ./journeyEvidenceCitation.js (resolved id: ./journeyEvidenceCitation.js) in /home/brad/cl-wt/L2-JOURNEY-EVIDENCE-1-evcite-lane2/server/src/compiler/journey/journeyEvidenceCitation.test.ts. Does the file exist?
```

### STEP 1 GREEN (after module written)

`cd server && npx vitest run src/compiler/journey/journeyEvidenceCitation.test.ts`:

```
 ✓ src/compiler/journey/journeyEvidenceCitation.test.ts  (6 tests) 4ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  04:40:12
   Duration  512ms (transform 43ms, setup 0ms, collect 38ms, tests 4ms, environment 0ms, prepare 132ms)
```

6 tests: (1) pins exact string for fixed input; (2) uses exported scheme prefix; (3) round-trips plain id; (4) round-trips hostile ids allowed by minLength:1 ('a@b', 'a:b', 'a/b', 'a b', 'café/日本', '@r9', 'a@r2@r5', ' lead', 'trail '); (5) refuses bad input with named rules and never throws; (6) '/'-in-id proves NOT the store's sanitised path segment.

### Mutation probe (performed, pin is NON-vacuous)

Removed ONLY the `'/' in id` check from the parse function (the assertion that an id containing '/' is treated as valid and returned verbatim), re-ran the targeted test — RAW summary:

```
 ❯ src/compiler/journey/journeyEvidenceCitation.test.ts:57:28
    55|     for (const id of ['a@b', 'a:b', 'a/b', 'a b', 'café/日本', '@r9', 'a@r2@r5', ' lead', 'trail ']) {
    56|       const text = formatJourneyEvidenceCitation({ journey_id: id, revision: 7 });
    57|       expect(parseJourneyEvidenceCitation(text)).toEqual({ ok: true, journey_id: id, revision: 7 });
    58|     }
    59|   })

⎯⎯⎯⎯⎯⎯⎯⎯[1/9]⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/journeyEvidenceCitation.test.ts > parseJourneyEvidenceCitation > round-trips hostile ids legally allowed by minLength: 1
AssertionError: expected { ok: false, rule: 'journey_evidence_citation_revision_invalid' } to deeply equal { ok: true, journey_id: 'a/b', revision: 7 }

- Expected
+ Received

- {"journey_id":"a/b","ok":true,"revision":7}
+ {"ok":false,"rule":"journey_evidence_citation_revision_invalid"}
```

Result: the pin is NOT vacuous — the '/' arm fails with `journey_evidence_citation_revision_invalid` because without the explicit handling, the last '@' is after 'a/b', leaving '/b' as the suffix which doesn't match `r[1-9][0-9]*`. Restored the parse logic verbatim. `git -c core.fileMode=false status --short` → empty (product diff empty before the report commit).

## Exit tree

`git -c core.fileMode=false status --short` -> empty (clean tree). No scratch files in the worktree.

## Commits (each names the unit)

```
af0641ba1b324ee35374741bb335305dc3dc5534  test(journey): RED-first citation codec for the evidence handoff (L2-JOURNEY-EVIDENCE-1 evcite)
b1797959f0bba91e266d51beec64c4a5be5f6a44  feat(journey): lossless journey-evidence citation format/parse (L2-JOURNEY-EVIDENCE-1 evcite)
```

This report file is contained at the next commit (marker-only bookkeeping), which fixes the marker line below to name that commit's full 40-char sha.

## Reviewer notes (bait pre-emption status)

1. exactOptionalPropertyTypes: input types are strict; output shape is exact; tsc exit 0 on the whole worktree.
2. Boundary grep: `grep -nE "journey-|event-editor|labware" server/src/compiler/journey/journeyEvidenceCitation.ts` hits only the module-header comment and the two constant definitions (prefix and three rule IDs) — zero journey identities, zero step IDs, zero surface names.
3. Determinism: the format function is pure string interpolation; the parse function uses only the one regex and standard string operations; same input -> identical result.
4. Not a compliance claim: the module doc header says the written form is a retention identifier, not a gate. No user-facing text exists in this unit.

## Remaining work / next actions

Unit 3 completes L2-JOURNEY-EVIDENCE-1. The branch head now contains the closed schema (unit 1), the durable store (unit 2), and the citation format (unit 3). Orchestrator: no blockers.

## Marker

L2-JOURNEY-EVIDENCE-1 UNIT evcite DONE 8169b83bc004db3ab9642251851f783523762345
