# u1nucsearch — L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch (Lane 2)

- worktree: /home/brad/cl-wt/L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch-lane2
- branch: cl/lane2-journey-genomics-min-1-nucsearch-0243
- base: 7e9bfc60c92bc1b6b1618cd1dc14da2de9cca8ac
- profile: cl-coder | date: 2026-11-14 (EST)

## What this unit does

Declares `journey.ncbi-nucleotide-search` as a capability descriptor bound to the
already-registered `ncbi_nucleotide_search` tool, admits that tool id to
`AGENT_ALLOWED_TOOLS` (one array entry, Genomics group), and reactivates the F1
nucleotide-search step in `journey-genomics-min.yaml`. F1 stops being a named
gap and becomes an admitted, lint-green beat. Read capability only: no write
path, no governed-writes registry entry, nothing minted
(GOVERNED-WRITE-ADMISSION-l2-20261113: a READ capability is admitted through the
descriptor contract plus the shipped tool allowlist).

Governing line (architect-context-l2.md §2.5, lines 37-39): "Proposal ≠
commitment. Nothing is written before an accept; a staged draft never satisfies
a committed-record port." — the descriptor's output port is a
StagedDraftReference (`version` + `draft_id` only; no record_id, no receipt_id),
per journey-port.schema.yaml:83.

## Changed files (6; 5 owned + 1 forced deviation, flagged below)

1. `server/src/ai/ToolBridge.ts` — ONE array
   entry `'ncbi_nucleotide_search',` after `'ncbi_gene_search',` (line 41 after
   the change). DOMAIN_TOOL_SUBSETS untouched (not part of this unit).
2. `config/journey/capabilities/ncbi-nucleotide-search.yaml` — NEW (39 lines).
   Modelled on ncbi-gene-search.yaml: `capability_id:
   journey.ncbi-nucleotide-search`, `version: "1.0.0"`,
   `ports.input: []`, `ports.output: [{version: "1.0.0", draft_id:
   DRAFT-nucleotide-observation}]` (closed StagedDraftReference),
   `implementation: {handler_kind: agent_tool, handler_ref:
   ncbi_nucleotide_search}`, `effects: [read, external_disclosure]` (comment
   names what leaves the lab: the taxon and marker terms in the outbound query —
   the same claim ncbi-gene-search.yaml:2-3 makes), `permissions:
   [journey.read, network.egress]`, `availability: {}`, `surfaces: [sequences]`
   (presentation only), `idempotency: pure`, `retry: none`,
   `reconciliation: not_required`, `evidence: [audit_event]`,
   `status: {declared: true, implemented: true, available_now: true,
   browser_certified: false}`.
   `available_now: true` is a claim about ADMISSION: the tool is registered
   unconditionally (ncbiTools.ts:152 `const name = db === 'nuccore' ?
   'ncbi_nucleotide_search' : 'ncbi_protein_search';`, registered by
   registerNcbiTools at ncbiTools.ts:251-254) and admitted after the allowlist
   entry. No receipt exists and none is owed by this unit; the search was NOT
   exercised.
   `browser_certified: false` stays. No accession, taxon, vendor or NCBI
   argument is restated in the descriptor (capability-descriptor.schema.yaml
   header forbids it; the taxon/marker are the journey's user-supplied
   parameters).
3. `config/journey/declarations/journey-genomics-min.yaml` — F1 block uncommented
   exactly as FALSIFY-1 wrote it (id `nucleotide-search`,
   `capability_ref: journey.ncbi-nucleotide-search`, `input_ports: []`, output
   `version: v1` + `draft_id: DRAFT-nucleotide-observation`,
   `interaction_mode: automatic`). Two surrounding comments corrected to say F1
   is now SERVED and F2/F3/F4 remain the named gap; file header corrected (the
   "8-id catalogue / F1-F4 unservable" finding is now attributed to FALSIFY-1,
   with the u1nucsearch extension named). F2/F3/F4 blocks left commented out
   byte-identical to before.
4. `server/src/compiler/journey/genomicsMinFalsification.test.ts` —
   `PINNED_CATALOGUE_IDS` 8→9 (`journey.ncbi-nucleotide-search` inserted in
   sorted position, between `journey.ncbi-gene-search` and
   `journey.noun-create-from-document`); `MISSING` 4→3 (the `nucleotide-search`
   row removed; the `retain-candidates`, `select-candidates`, `run-mafft` rows
   KEPT and still asserted refused by exactly their named ids — 3 refusals,
   sorted step ids, each refusal message names its capability_ref); the
   "consumes exactly one" case adjusted to two capabilities; TWO new cases:
   (i) the admitted catalogue from the shipped loader contains
   `journey.ncbi-nucleotide-search` with `handler_ref: ncbi_nucleotide_search`;
   (ii) the committed declaration lints CLEAN for step `nucleotide-search`
   (no `journey_capability_not_in_catalogue` diagnostics at all; the step is
   present in the committed document). No fixture, no hand-built
   known-handler set, no TS capability-id list.
5. `server/src/compiler/journey/capabilityCatalogue.labwareDef.test.ts` — the
   descriptor-count pin only: title "eight" → "nine", id list gains
   `journey.ncbi-nucleotide-search` in sorted position. Both count pins (this
   file + PINNED_CATALOGUE_IDS) moved deliberately; this unit changes the
   capability set 8→9 on purpose. FALSIFY-1's git history and its report are
   untouched.
6. DEVIATION (out of owned-files list; see below):
   `server/src/compiler/journey/capabilityCatalogueSeed.test.ts` — the
   negative fixture's handler_ref re-pointed from `'ncbi_nucleotide_search'` to
   `'ncbi_protein_search'` (+ 4 comment lines, +1 assertion-string change).
   Nothing else in the file changed; no list pinned; ids still derived from
   the shipped files.

## DEVIATION — flagged for orchestrator/reviewer

The brief said capabilityCatalogueSeed.test.ts "needs no change". Measured at
7e9bfc60 that is NOT the case: its negative fixture hardcodes
`candidate.implementation.handler_ref = 'ncbi_nucleotide_search'` (line 110)
and asserts the loader refuses it. The brief's step-3 allowlist entry admits
that id, so the fixture is admitted and the test goes RED (measured:
`expected rejection, got 10 admitted`, 1 failed | 7 passed). The test's own
header requires the fixture id to be "absent from every registry". Leaving it
RED would mean exiting with a failing suite; "diagnose failures rather than
weakening checks" says the fixture must be a genuinely dangling id. I re-pointed
it to `ncbi_protein_search` — the sibling tool that is registered
(ncbiTools.ts:154) but is NOT in AGENT_ALLOWED_TOOLS and NOT in the governed
registry — so the same `unknown handler id` refusal fires with the same named
diagnostic and the "real ones survive" assertions are untouched. This is a
fixture-value change, not a contract change: the loader, the allowlist, the
registry and every real-directory assertion are unchanged. If the orchestrator
disagrees with touching this file, the alternative is a two-commit split where
the allowlist entry lands AFTER a seed-test fix in its own unit — but that
splits one logical admission across items. Owner: orchestrator.

## Verification (RAW, on the final tree; scratch at /home/brad/.nucsearch-scratch/)

Pre-edit baseline (7e9bfc60, after `npm ci --no-audit --no-fund` in server/):

- `npx vitest run src/compiler/journey/genomicsMinFalsification.test.ts` →
  `Test Files 1 passed (1)`, `Tests 5 passed (5)`.
- `npx vitest run capabilityCatalogue.labwareDef.test.ts
  capabilityCatalogueSeed.test.ts capabilityCatalogueJourneyHiding.test.ts
  labwareDefinitionJourney.test.ts` → `Test Files 4 passed (4)`,
  `Tests 20 passed (20)`.
- `npx tsc --noEmit` → exit 0, 0 error lines. The brief's baseline said 6
  pre-existing error lines; this environment measured 0 at the base (grading
  criterion "no NEW error lines" holds either way: 0 at base, 0 at final).

RED (step 1, commit 87ecca2a — new assertions before any fix):

- `npx vitest run src/compiler/journey/genomicsMinFalsification.test.ts` →
  `Test Files 1 failed (1)`, `Tests 4 failed | 3 passed (7)`:
  - `pins the real catalogue id set (9 ids, sorted)` → `expected [ …(8) ] to
    deeply equal [ …(9) ]` (journey.ncbi-nucleotide-search missing).
  - `admits journey.ncbi-nucleotide-search with handler_ref
    ncbi_nucleotide_search` → `the real shipped directory must admit the
    descriptor: expected undefined not to be undefined`.
  - `consumes exactly two catalogue capabilities` → `expected [
    'journey.ontology-lookup' ] to deeply equal [ 'journey.ontology-lookup',
    …(1) ]`.
  - `lints clean for the committed step nucleotide-search` → `expected false to
    be true` (the step is commented out, so it is absent from the document).

After the descriptor, before the allowlist entry (commit 08595c68), the shipped
loader refused the new file exactly as expected:

- `Error: real capability catalogue not ok: ncbi-nucleotide-search.yaml:
  /implementation/handler_ref: unknown handler id 'ncbi_nucleotide_search'`

Final verify (commits ad32b13e, 4594e47c, 8863c8e8):

- `cd server && npx vitest run src/compiler/journey/genomicsMinFalsification.test.ts`
  → `✓ src/compiler/journey/genomicsMinFalsification.test.ts (7 tests) 67ms`,
  `Test Files 1 passed (1)`, `Tests 7 passed (7)`. (Baseline's 5, two adjusted,
  plus the 2 new cases; 0 failed.)
- `cd server && npx vitest run src/compiler/journey/capabilityCatalogue.labwareDef.test.ts src/compiler/journey/capabilityCatalogueSeed.test.ts`
  → `Test Files 2 passed (2)`, `Tests 8 passed (8)`; seed suite prints
  `negative diagnostic: ["dangling-candidate.yaml:
  /implementation/handler_ref: unknown handler id 'ncbi_protein_search'"]`.
- Also run (beyond the required list): capabilityCatalogueJourneyHiding.test.ts
  + labwareDefinitionJourney.test.ts → green (part of `Test Files 5 passed`,
  `Tests 27 passed (27)` across the five journey suites).
- `cd server && npx tsc --noEmit` → exit 0, 0 error lines at the final commit.
  NO NEW ERROR LINES vs the measured baseline.
- `git -c core.fileMode=false status --short` → empty (0 lines) at exit.

## Mutation probes (applied exactly, reverted before commit)

Mutation A — delete `'ncbi_nucleotide_search',` from AGENT_ALLOWED_TOOLS, keep
the YAML file, run genomicsMinFalsification.test.ts. RAW:

- `FAIL src/compiler/journey/genomicsMinFalsification.test.ts` (suite-level,
  beforeAll): `Error: real capability catalogue not ok:
  ncbi-nucleotide-search.yaml: /implementation/handler_ref: unknown handler id
  'ncbi_nucleotide_search'` → `Test Files 1 failed (1)`. RED as required: the
  allowlist entry is load-bearing; without it the shipped loader refuses the
  descriptor. Reverted.

Mutation B — re-comment the F1 step block (descriptor + allowlist kept), run
the same file. RAW:

- `Test Files 1 failed (1)`, `Tests 2 failed | 5 passed (7)`:
  - `lints clean for the committed step nucleotide-search (no
    journey_capability_not_in_catalogue)` → `AssertionError: expected false to
    be true // Object.is equality` at the step-presence sub-assertion (`the
    step is present in the committed document — not commented out`).
  - `consumes exactly two catalogue capabilities` → `expected [
    'journey.ontology-lookup' ] to deeply equal [ …(1) ]`.
- Honest note: the brief predicted RED "with
  journey_capability_not_in_catalogue for journey.ncbi-nucleotide-search". That
  is not what the lint produces when the step is absent from the document: with
  the step commented out there is no step to name, so the lint of the file is
  clean and the new it() goes RED on its step-presence sub-assertion instead.
  The assertion still BINDS TO THE STEP (re-commenting the step turns it RED;
  the file alone does not), which is the property the probe exists to prove.
  Reverted.

After both mutations: `git -c core.fileMode=false status --short` → 0 lines
(proved no product file left mutated before the final commits).

## What must NOT change — confirmed unchanged

- schema/** and .hermes/plans/** (except this report): not edited.
- config/journey/governed-writes.yaml: not edited (read capability; an entry
  there would be a second authority and a false write admission).
- The other seven descriptors: not edited.
- server/src/mcp/tools/ncbiTools.ts: not edited (name, db mapping, argument
  schema intact; registration is unconditional, ncbiTools.ts:251-254).
- server/src/compiler/journey/capabilityCatalogue.ts: not edited; the
  `unknown handler id` refusal at :68 keeps firing (Mutation A demonstrates
  it; the seed suite's re-pointed fixture demonstrates it on a different id).
- app/**: not edited.
- DOMAIN_TOOL_SUBSETS: not touched.
- Journey-hiding rule, draft-port refusal, invented-id refusal (the three
  remaining unservable beats refuse by name, asserted in the same commit that
  dropped F1 from MISSING — 3 refusals, sorted, each named).

## Status claims (no inflation)

- Nothing here says the nucleotide search "works", "is verified" or "returned
  results". `available_now: true` claims admission (registered + admitted),
  not a live call. `browser_certified: false`. No receipt exists; none is owed.
- ACCEPTANCE is waived (data-only unit): the observables are the admitted
  catalogue read back through the shipped loader
  (loadCapabilityCatalogueDir — the same loader routes.ts:356 uses) and the
  lint verdict on the committed declaration. AC1/AC2/AC3 all hold on the final
  tree (9 descriptors admitted, empty diagnostics; invented ids
  journey.sequence-alignment-run / journey.sequence-collection-create /
  journey.sequence-candidate-record still refused by name; the committed
  declaration lints clean against the real catalogue and real work-surface
  registry with F2/F3/F4 still commented out and asserted refused).

## Pre-existing, unrelated (measured, not caused by this unit)

- `server/src/api/journeyCompile.routes.test.ts` and
  `server/src/api/journeyCapabilities.routes.test.ts` fail at COLLECTION
  (import chain: submitSuggestionTool → resolutionEngine → scientistIntent
  vocabulary → missing
  `server/schema/scientist-intent/scientist-intent-vocabulary.yaml`). The
  directory is absent from the BASE commit's tree (`git ls-tree 7e9bfc60
  --name-only server/schema/scientist-intent/` → empty) and no file this unit
  touches is in the import chain. They were never collectable in this lane
  worktree.

## Next actions

- None in this unit's scope. The item's remaining beats F2/F3/F4 and the live
  Pilot-B drive are later legs (per the brief), owned by later units.
- Orchestrator review of the capabilityCatalogueSeed.test.ts deviation
  (flagged above).
- Raw test/typecheck outputs are kept on disk at /home/brad/.nucsearch-scratch/
  (red1.txt, mutationA.txt, mutationB.txt, verify1-final.txt, verify2-final.txt,
  final-tsc.txt, final-suites.txt) for the reviewer; no other scratch was used.

## Exact reproduction commands

- `cd /home/brad/cl-wt/L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch-lane2/server && npm ci --no-audit --no-fund`
- `cd /home/brad/cl-wt/L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch-lane2/server && npx vitest run src/compiler/journey/genomicsMinFalsification.test.ts`
- `cd /home/brad/cl-wt/L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch-lane2/server && npx vitest run src/compiler/journey/capabilityCatalogue.labwareDef.test.ts src/compiler/journey/capabilityCatalogueSeed.test.ts`
- `cd /home/brad/cl-wt/L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch-lane2/server && npx tsc --noEmit`
- `cd /home/brad/cl-wt/L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch-lane2 && git -c core.fileMode=false status --short`

Commits (base 7e9bfc60 → final): 87ecca2a (RED), 08595c68 (descriptor),
ad32b13e (allowlist entry), 4594e47c (declaration), 8863c8e8 (count pins +
seed fixture re-point).

L2-JOURNEY-GENOMICS-MIN-1-u1nucsearch UNIT u1nucsearch DONE e8f96d3047ea3a3744cb40279be244c727eb91ec
