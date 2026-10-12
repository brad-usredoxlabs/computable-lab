# W2-1-NAMING-CROSSWALK — spec (orch-composed, 2026-10-09T11:10 EDT, l2t1050)

Item: W2-1-NAMING-CROSSWALK (lane 2, WAVE 2 semantic-protocol-family; deps: none)
Trunk at authoring: cl/integration-2 docs tip 1e0ce793 / code tip e830cffb.
Binding intake: ~/.hermes/specs/intake/2026-10-09_semantic-protocol-family/
(wave2-tasklist-PROPOSAL.md W2-1; D1-D9 in task-list.md WAVE-2 header; round-0-grounding.md).

## Goal (one sentence)

Author the naming crosswalk as DATA (memo noun -> existing record, zero new record kinds),
plus a mechanical new-term admission check every wave-2 noun must pass before it enters any
schema, lint, or fixture — and one data-declared mapping table adjudicating
`protocol.semanticVerb` (verb-definition records) vs the wave-1 31-verb single-source enum.

## Orch-verified orientation facts (verified by orchestrator directly; scout corroborating)

1. The wave-1 31-verb single-source contract = the scientist-intent triplet under
   `schema/scientist-intent/`: `scientist-intent.schema.yaml` (steps[].action ->
   `$defs/actionVerb`, :79-80/:198-199), `scientist-intent-vocabulary.yaml` (+ .schema/.lint
   siblings). SPINE-1 contract freeze verified count 31 and pinned TS mirrors
   (server types.ts:12-47 union, parseScientistIntent.ts:43-50 KNOWN_ACTIONS — see
   .hermes/plans/2026-10-08_0315-SPINE-1-contract-freeze-spec.md :22-53). SPINE-7 will
   re-touch the vocabulary file (required targetWells on aliquot); do NOT edit that file's
   verbs list in this item.
2. `protocol.steps[].semanticVerb` (:774-775) -> `$defs/SemanticVerbRef` (:669-685): a
   record ref with `type: const verb-definition` + `canonical` + `backendHints[]`.
   `verb-definition` is a SEPARATE record kind: schema/workflow/verb-definition.{schema,lint,ui}.yaml,
   seed records records/seed/verb-definition/verb-*.yaml (rock, autoclave, microwave, read,
   incubate, stir, sonicate, shake, heat, set, ...). This is the second verb vocabulary the
   task block demands adjudicated — it already exists; the crosswalk maps, never merges.
3. A third neighboring vocabulary exists: schema/registry/operations.yaml
   (kind: operation-registry, 27 ops with ontology_refs OBI/EXACT). Name it in the crosswalk;
   do not conflate with either of the above.
4. The 8 neighbor nouns all have REAL triplet files (orch `ls` verified, schema/workflow/):
   protocol; local-protocol; protocol-decision-tree; vendor-protocol-candidate (schema only);
   extraction-draft; extraction-promotion; operation-template; phase-template;
   execution-scale-profile (also schema/registry/execution-scale-profiles/).
   Memo-noun bindings are FIXED by D1/D3 (do not re-decide):
   - "Semantic Protocol Family" = `protocol` (upgraded in place; NO new kind).
   - "Lab Realization Plan" = `local-protocol`.
   - "branch axes" = `protocol.branch_axes`, fed by the protocol-decision-tree.
   - SAID = `vendor-protocol-candidate` (immutable document truth + StepPdfAnchor anchors).
   - MEANT / "draft semantic protocol" = `protocol` governed by extraction-draft +
     extraction-promotion lifecycle (NOT a third representation).
   - "execution-scale choices" = `execution-scale-profile`.
5. schema/lab/datatypes/ holds only chemical-properties (no Quantity); schema/core/datatypes/
   has amount, concentration, reference-ratio etc. — the crosswalk must note that Quantity
   (W2-2) is a genuinely-missing datatype, and check `amount`/`concentration` for overlap
   before minting names (never two local terms for one entity).
6. ontology surface for the admission check: schema/registry/ontology-terms/ exists; CURIE
   convention `cf:` local terms is the project standard (principles doc).

## Deliverables (owned files ONLY; commit these, never `git add -A`)

A. `docs/wave2-naming-crosswalk.md` — the human memo: every memo noun (from the intake
   packet's language: Semantic Protocol Family, Lab Realization Plan, SAID, MEANT, draft
   semantic protocol, branch axes, provenance ladder rungs VENDOR/DERIVED/INFERRED_INVARIANT/
   LOCAL_REALIZATION, semantic operation, constraint classes, Quantity, capability terms)
   -> its bound existing record/term per D1-D9, with file:line pointers to the schema files
   above. Explicit "NO new record kind" declaration list: family, realization-plan,
   semantic-extraction-IR, provenance-ladder are FORBIDDEN as kinds (state it).
B. `schema/registry/wave2-naming-crosswalk.yaml` — the machine-readable crosswalk:
   entries {term, status: existing|missing-datatype|new-vocab-pending-admission, binds_to:
   {kind/schema ref}, source_decision: D1..D9}. Pure data, loadable YAML (mirror
   schema/registry/operations.yaml's registry style; it does NOT need SchemaRegistry
   registration — a registry file, not a schema triplet).
C. `schema/registry/wave2-verb-adjudication.yaml` — the ONE mapping table: verb-definition
   record id <-> scientist-intent 31-verb action (when they denote the same operation),
   verb-definition-only ids listed as protocol-semantic-only (no compiler verb), scientist-
   intent verbs with no verb-definition listed as enum-only. Data-declared mapping; adds NO
   verb to either vocabulary; never a third verb list. Enumerate the actual current sets
   yourself (parse the YAML) — do not copy counts from this spec.
D. Admission check as data + a real check: the admission predicate is expressed in
   `schema/registry/wave2-naming-crosswalk.yaml` (an `admission:` section: every proposed
   wave-2 term must (1) resolve through the crosswalk, (2) not collide with any existing
   record kind / registry id / operations.yaml id / scientist-intent verb, (3) carry a CURIE
   plan `cf:`-style). ENFORCEMENT: a headless test
   `server/src/schema/Wave2NamingCrosswalk.test.ts` that loads the crosswalk + enumerates
   existing kinds/verbs/operation ids and FAILS on a deliberately-colliding fixture term
   (e.g. proposes "local-protocol" or a verb duplicate as a NEW term -> flagged). Generic
   set-comparison only: no hardcoded domain branches beyond reading these data files.

## Hard rules

- Zero new record kinds, zero new verb entries, zero edits to scientist-intent vocabulary
  verbs list, protocol.schema.yaml, or any lint of an existing triplet. If you believe a
  triplet edit is required, STOP and report BLOCKED with the specific line — that is an
  architect call, not a coder call.
- Every claim in deliverable A carries a real file:line you opened. Counts in C are
  machine-extracted, not hand-counted.
- Headless item: NO UI, NO browser gate.
- The "two local terms for one entity" line: if your enumeration finds a genuine collision
  TODAY (not memo-level), record it as a FINDING in the memo + crosswalk data
  (status: collision), do not resolve it here.

## Verification (orch will re-run these; capture outputs in your report)

1. `cd server && npx vitest run src/schema/Wave2NamingCrosswalk.test.ts` green (colliding
   fixture flagged, clean fixture passes).
2. `npm run typecheck -w server`: error-line SET identical to pin /tmp/l2t2230-tsc-server.txt
   (sha 924c18bd...), 26 lines / 6 files.
3. Targeted compiler/scientistIntent suite unchanged (this item must not touch them):
   `npx vitest run src/compiler/scientistIntent/` fail-file SET == 17-file baseline.
4. Report at .hermes/plans/W2-1-report.wip-l2t1110.md naming: collision findings, the
   machine-extracted verb counts for both vocabularies, and the deliberate-collision test
   evidence. End your run by committing (owned files A-D + report) and print final line
   `W2-1 DONE <sha>`.

## Baselines (at your base; re-measure anyway)

server tsc 26 lines/6 files pin sha 924c18bd; compiler fail-file SET 17/29; src/ai 10/21.
git -c core.fileMode=false always. Worktree carries lane-sync strays — NEVER `git add -A`.
