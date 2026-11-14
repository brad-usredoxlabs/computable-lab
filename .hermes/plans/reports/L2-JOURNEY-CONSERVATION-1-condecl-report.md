# L2-JOURNEY-CONSERVATION-1 / unit condecl (1 of 4) — report

Lane 2 worktree: /home/brad/cl-wt/L2-JOURNEY-CONSERVATION-1-condecl-lane2
Branch: cl/lane2-journey-conservation-condecl-0409; base 4589d64da8ca3924a5124fd43463bec66a4ccc4e.
Commit: e787bd3b142d129e4d4840bb263a17c8c906a7e2 (the three product files; tree clean).
Report commit: 2866f4cf00114896ac4c24c2b1d019f782d0aea6 (this file).

## Scope delivered
- schema/sequence-analysis/conservation-analysis.schema.yaml (NEW, 90 lines, Draft 2020-12,
  $id https://computable-lab.com/schema/computable-lab/sequence-analysis/conservation-analysis.schema.yaml,
  kind const conservation-analysis-declaration, additionalProperties: false, required list of all 11
  load-bearing fields; every policy field is enum or required sub-field, nothing defaulted).
- server/src/sequences/conservationAnalysisDecl.ts (NEW, 74 lines):
  validateConservationAnalysisDeclaration(doc): { ok: true } | { ok: false; diagnostics: string[] }.
  Schema compiled ONCE at module load (readFileSync via import.meta.url, the oligoOrderAiRead.ts:111
  idiom). Diagnostics derived from validate.errors only — no second copy of the field list. Two named
  rules: conservation_declaration_invalid (instancePath of the offending property; for `required`
  failures the missing property from params) and conservation_declaration_claims_primer_suitability
  (identified by the const location /primer_suitability/claimed).
- server/src/sequences/conservationAnalysisDecl.test.ts (NEW, 113 lines, `// @vitest-environment node`
  line 1): one Ajv2020({ strict: true, allErrors: true }) on a repo-root-relative read (3 up from
  src/sequences/ — the capabilityDescriptor.test.ts:17 idiom has 4 up because it sits one level
  deeper; the corrected depth is why the read is file-based, not cwd-based). 11 tests: the 8
  validation legs (complete doc passes; objective / metric.denominator / gap_policy /
  ambiguity_policy / coverage.threshold / coordinate_mapping.convention omissions refuse;
  primer_suitability.claimed:true refuses) + 3 reader legs ({ok:true}; missing gap_policy names
  conservation_declaration_invalid AND /gap_policy; primer claim gets its own named rule and NOT
  conservation_declaration_invalid). Single-defect `omit()` helper (Mutation B hygiene).
  Fixtures live in the test file only — no config/ file added (domain bait 3).

## Domain bails avoided (as briefed)
- Bait 1 (paint-without-event): the reader refuses real underspecified documents (AC2); no engine
  entry, no available_now flip, no journey step, no consumer faked.
- Bait 2 (second authority): coordinate_mapping.source is const "alignment.coordinateMap" — a
  REFERENCE to the shipped field produced by sequenceRuntime.ts:137; AC4 grep shows only reference
  idioms in the new files, no mapping arithmetic.
- Bait 3 (silent scientific default): objective.kind enum + decided_by + decision_ref required;
  no default conservation policy anywhere under config/.
- Governing line quoted from .hermes/plans/architect-context-l2.md §2.5: "Proposal ≠ commitment.
  Nothing is written before an accept; a staged draft never satisfies a committed-record port."
  (Owner: schema/workflow/capability-descriptor.schema.yaml (effects + governed_write).) A
  conservation DECLARATION is likewise data that makes a later claim auditable — it is not the
  computation and it commits nothing.
- Nearest committed ruling: .hermes/plans/decisions/PROTOCOL-LOCALIZATION-l2-20261113.md (a
  computation is authoritative only through a declared, versioned contract).
- Scenario: none. Measured: `grep -n -iE 'conserv|primer|alignment'
  /mnt/vast/home/brad/git/computable-lab/test-prompts/corpus-manifest.yaml` → ZERO lines, so no
  corpus scenario covers this capability (prompt 8 deferred). Stated as the reason; no scenario id
  invented.

## RED first (raw)
Before the schema/reader existed:
  FAIL  src/sequences/conservationAnalysisDecl.test.ts
  Error: Failed to load url ./conservationAnalysisDecl.js ... Does the file exist?
  Test Files  1 failed (1); Tests  no tests
(raw vitest output; the suite could not collect because the import target was absent)

## Mutation probes (on the FINAL committed content, both reverted and re-verified green)
- A: primer_suitability.claimed const:false → type:boolean → 2 tests RED
  (schema leg 'refuses a declaration that claims primer suitability' + reader leg
  'refuses a primer claim with its OWN named rule'). Reverted.
- B: gap_policy removed from the schema required list → 2 tests RED
  (the missing-gap leg + the AC2 reader leg). Reverted.

## Verification (all run at the final tree)
- cd server && npx vitest run src/sequences/conservationAnalysisDecl.test.ts
  → Test Files 1 passed (1); Tests 11 passed (11)
- cd server && npx tsc --noEmit → 6 error lines, byte-identical set to the base-4589d64d baseline
  (AIHandlers.ts 332/438/716, AiIngestionHandlers.ts 291, ExtractProtocolHandler.ts 63,
  sequenceRoutes.ts 37 — all pre-existing .parts/.file). No new error line.
- cd server && npx vitest run src/sequences/oligoOrderAiRead.test.ts (AC neighbour)
  → 1 passed; Tests 7 passed (7)
- cd server && npx vitest run src/validation/IdShape.test.ts src/graph-query/schema.test.ts
  (recursive loadAllSchemas harnesses that pick up schema/sequence-analysis/)
  → 2 files passed; Tests 13 passed (13) — the new schema loads cleanly under the house registry.
- AC2 node-level (node /home/brad/.condecl-scratch/ac2-check.mjs, declaration missing gap_policy):
  {"ok":false,"diagnostics":["conservation_declaration_invalid: /gap_policy — must have required
  property 'gap_policy'"]}
- AC3: git diff --name-only 4589d64d..HEAD → exactly the three owned files;
  git diff --stat → 3 files changed, 277 insertions(+), 0 deletions.
  oligo-order-draft.schema.yaml untouched (zero diff).
- AC4: grep -rn "alignment.coordinateMap\|coordinateMap" schema/sequence-analysis/
  server/src/sequences/conservationAnalysisDecl.ts → only reference idioms (schema description
  lines 12-13 + const on line 70; reader doc-comment lines 13-15). No re-derived mapping.
- Known pre-existing (NOT caused by this unit, proven by stashing the three new files and re-running):
  src/sequences/oligoOrder.test.ts 2 failed (13 tests) at ArtifactBlobStore.resolveDevice —
  identical failures with and without the condecl files present.
- Budget: 3 files, 277 lines total (schema 90 + reader 74 + test 113) ≤ 300.

## Environment notes (no product effect)
- Worktree carried no node_modules/schema symlink (gitignored, per .gitignore:5/:52). Mirrored the
  sibling-worktree convention: server/schema -> ../schema,
  server/node_modules -> /mnt/vast/home/brad/git/cl-integration-2/server/node_modules. No install
  was run. Both symlinks are gitignored; the tree stays clean with or without them.
- Scratch at /home/brad/.condecl-scratch/ (mutation backups, ac2-check.mjs) — to be deleted at exit.

## Decisions
- Synchronous reader (matching the brief's exact signature) over the repo's async idiom, compiling
  at module load: no caller awaits a validator, and the brief's AC2 example calls it synchronously.
- Primer named rule keyed on the error instancePath /primer_suitability/claimed rather than the
  `const` keyword alone, so the rule names the declaration property a scientist would look for.
- `required` diagnostics carry `instancePath/missingProperty` (e.g. /gap_policy) — matches the
  AC2 requirement that the text names the path.

## Next action / owner
Implementation complete (implementation ≠ acceptance). Owner: orchestrator → adversarial review
(no browser lane for this unit — acceptance waived by the brief's data+validator scope; the
compute/interval/rendition legs are units 2-4). YAML change: no lane-stack reload needed for
review of this unit (nothing reads the schema at runtime yet by design — the reader is the first
consumer).

L2-JOURNEY-CONSERVATION-1-condecl UNIT condecl DONE 2866f4cf00114896ac4c24c2b1d019f782d0aea6 (report contained at this sha; marker finalised in follow-up commit)
