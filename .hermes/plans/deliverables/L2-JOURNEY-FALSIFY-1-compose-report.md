# L2-JOURNEY-FALSIFY-1 — unit falsify-compose: report

Worktree /home/brad/cl-wt/L2-JOURNEY-FALSIFY-1-falsify-compose-lane2, branch
cl/lane2-journey-falsify-1-falsify-compose-0047, base 3dea68321419d5c3c931f5b3d907b9df4f7674c0.
The unit composed the minimal genomics journey (JOURNEY-GENOMICS-MIN-1, task-list
lines 20305-20345) AS DATA from the shipped capability catalogue alone, and landed
one pin test that lints it against the REAL catalogue and the REAL work-surface
registry (no fixtures) and reports every capability the composition consumes.

## Terminal state: REFUSED (the catalogue cannot serve the journey)

The committed declaration (config/journey/declarations/journey-genomics-min.yaml)
carries exactly ONE step — resolve-marker on journey.ontology-lookup — and lints
clean against the real catalogue + registry. The four execution beats the task
names (nucleotide search, retained candidate evidence, human selection into a
committed collection, MAFFT) have NO capability in the 8-id catalogue. Per the
unit contract those steps are left as commented-out entries in the YAML with the
ids NAMED below (F1-F4) — not invented. The pin test reactivates the four beats
as a planted variant and asserts `journey_capability_not_in_catalogue` for exactly
those ids and no others. The rendered-alignment beat is presentation, not
execution (architect-context-l2.md §2.4): a page renders the artefact and owns no
capability, so it is not a step and no capability_ref exists for it.

## Capabilities the composition consumes (as read from the descriptors)

| beat | step_id | capability_ref | catalogue id exists | implemented | available_now |
|---|---|---|---|---|---|
| CURIE resolution of taxon+marker | resolve-marker | journey.ontology-lookup | yes (ontology-lookup.yaml) | true | true |

## Capabilities the composition needs and the catalogue does not supply

| finding | step_id (would-be) | id named (NOT invented into the catalogue) | beat it would serve |
|---|---|---|---|
| F1 | nucleotide-search | journey.ncbi-nucleotide-search | nucleotide search on the resolved taxon+marker, observation recorded as a VERSIONED input (query, retrieval date, truncation/pagination, accession versions). journey.ncbi-gene-search is gene-TARGET resolution against NCBI Gene, not a nucleotide search — not a substitute |
| F2 | retain-candidates | journey.sequence-candidate-record | retained candidate evidence (the versioned external-search observation); no capability records an external-search observation |
| F3 | select-candidates | journey.sequence-collection-create | HUMAN TASK selecting sequences, completion = a committed sequence-collection record with versioned members (not a page visit); no governed-write capability mints a sequence-collection record |
| F4 | run-mafft | journey.sequence-alignment-run | MAFFT execution through the existing engine runner; no capability runs an alignment engine |

The planted-variant refusal (test `refuses every unservable beat with exactly the
named ids`) asserts exactly 4 diagnostics, all `journey_capability_not_in_catalogue`,
on step ids nucleotide-search, retain-candidates, select-candidates, run-mafft,
each naming its ref verbatim — F3 carries a registry-valid human_task contract
(surface `sequences`, kind `sequence` is in the registry selectableKinds) so ONLY
the capability refusals fire.

## Explicit non-claims (the second-authority trap)

- NO runner branch was added; NO change to any runner/dispatch module.
- NO new capability descriptor was added and NO existing one was edited
  (config/journey/capabilities is byte-identical to base: the 8
  `^capability_id:` lines are unchanged, md5 051c133ebea5c2a1ef0cad253ac007e0).
- NO `handler_ref` was invented; NO `governed-writes.yaml` entry was added
  (config/journey/governed-writes.yaml byte-identical to base).
- No `presentation_surface` outside the work-surface registry was granted to any
  step (the declaration grants none at all; the planted F3 contract uses `sequences`,
  which the registry declares).

Diff proof (base..HEAD): exactly 3 files — the two owned code files and this
report. `git diff --name-only 3dea6832..HEAD -- config/journey/capabilities
config/journey/governed-writes.yaml server/src/compiler/journey` minus this unit's
new test file is EMPTY.

## Verification (raw, run at this worktree)

RED (before the declaration existed):
    Test Files  1 failed (1)
         Tests  4 failed | 1 passed (5)
(failure: ENOENT .../config/journey/declarations/journey-genomics-min.yaml)

Mutation probe A (9th id added to the pinned set): pin RED
    Test Files  1 failed (1)
         Tests  1 failed | 4 passed (5)
    (expected [... 'journey.vendor-web-search'] vs actual without 'journey.planted-mutation')
Mutation probe B (step's capability_ref deleted from the YAML): pin RED
    Test Files  1 failed (1)
         Tests  3 failed | 2 passed (5)
Reverted; `git -c core.fileMode=false status --short` printed nothing (clean).

Targeted (final commit state):
    ✓ src/compiler/journey/genomicsMinFalsification.test.ts  (5 tests) 94ms
    Test Files  1 passed (1)
         Tests  5 passed (5)
Suite:
    Test Files  21 passed (21)
         Tests  161 passed (161)     (baseline 20/156 + this file's 5)
Typecheck (touched a .ts): 6 pre-existing errors in 4 files I did not touch
(src/api/handlers/AIHandlers.ts, AiIngestionHandlers.ts, ExtractProtocolHandler.ts,
src/sequences/sequenceRoutes.ts); IDENTICAL 6 errors in the untouched sibling
worktree L2-DELREFS-d5traversal-lane2 — none introduced by this unit.

## Files owned (3)

1. config/journey/declarations/journey-genomics-min.yaml — the composition (data only)
2. server/src/compiler/journey/genomicsMinFalsification.test.ts — the pin + report numbers
3. this report

L2-JOURNEY-FALSIFY-1-falsify-compose UNIT L2-JOURNEY-FALSIFY-1-falsify-compose DONE 9f7cd45b4ec0bdcf55610cc7768255e19ae531fa
