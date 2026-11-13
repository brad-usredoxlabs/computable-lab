# L2-SPEC-SHEET-INGEST-1 / unit g6topofix1 (advc c1 D1+D2) — coder report

Worktree: /home/brad/cl-wt/L2-SPECSHEET-g6topo-lane2
Branch: cl/lane2-specsheet-g6topo-2055
Base: 686c8031 (clean tree at start)
Owned files only: app/src/collections/LabLabwareNewPage.tsx (value expression / synthetic-entry
condition), app/src/collections/LabLabwareNewPage.test.tsx (pins). g5 pre-flight, server/**,
schema/**, extractor untouched.

## Decisions

D1 (MAJOR, fixed). The derivation's third arm was a bare `else 'single'`, so a partial array
(exactly one of topology.rows / topology.columns present, linear_count absent — a reachable
extraction outcome since the source alternatives are disjoint) shipped addressing:'single'
beside rows=8. That is an invented value contradicting the record and it corrupts the Opentrons
export (OpentronsLabwareDefinitionService.ts:400 maps 'single' -> one well).

The derivation is now a guarded value + a conditional synthetic entry:

  addressingValue = rows && columns ? 'grid'
                  : linear_count    ? 'linear'
                  : (!rows && !columns) ? 'single'
                  : undefined            // partial array -> derive NOTHING
  loopProposals   = hasExplicitAddressing || addressingValue === undefined
                  ? proposals              // untouched; g5 collectInvalidRequiredPaths refuses
                  : [...proposals, { targetField:'topology.addressing', value: addressingValue,
                                     sourceUrl: first?.sourceUrl ?? '', passage: '',
                                     specId: 'derived-topology-addressing' }]

The derived proposal still rides the same coercion loop; an extractor-supplied
topology.addressing still wins. Refusal is by name, with NO POST, through the untouched g5
pre-flight (`Cannot save: missing or invalid: topology.addressing`).

D2 (MINOR, fixed). Boundary pins added: rows-only and columns-only refusal legs (D1), plus arm
precedence pins (grid outranks a co-present linear_count; linear_count outranks a partial
array). The g5 refusal-by-name leg (schema-required capacity, no proposal) is retained as-is.

## Verification (raw)

RED before fix, `cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx`:
  2 failed | 31 passed (33)
  FAIL ... only topology.rows is present ... / ... only topology.columns ...
  TestingLibraryElementError: Unable to find an element by: [data-testid="lab-labware-error"]
  (i.e. current code POSTed with 'single' and navigated away)

GREEN after fix, same command: `Tests  35 passed (35)`.
`npx tsc --noEmit` (app): rc=0.

Mutant M2 (`&&` -> `||` in the grid arm) run: `Tests  3 failed | 32 passed (35)` — both
partial-array legs and the linear_count+partial-array leg go RED, then the file was restored and
re-ran 35/35. Raw mutant receipt kept outside git: /tmp/llnp.bak (backup) — mutant not committed.

Baseline before this unit: 31/31 green WITH the bug (as briefed).

## Commits

ddc1646a test(spec-sheet): g6topofix1 pins — partial-array must refuse, not invent single
f69b7658 fix(spec-sheet): derive 'single' only when no array facts at all

## Next actions / notes

- YAML untouched, so no lane-stack reload is needed for this unit.
- Live/browser verification not run here; adversarial + browser review still own acceptance.
- No blockers.

L2-SPEC-SHEET-INGEST-1 UNIT unit DONE f69b76589d1b35211c13483749d9eb5124cd8a3e
