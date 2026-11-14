# L2-JOURNEY-FALSIFY-1 — unit hidesjourney (refusal half)

Worktree: /home/brad/cl-wt/L2-JOURNEY-FALSIFY-1-hidesjourney-lane2 · branch
cl/lane2-journey-falsify-1-hidesjourney-0104 · base 9b2a4c7cc2686d087057a03d6a2f1b9ebc80ff24.
Lane 2, tier consequential, 2026-11-14. No continuation.

## Grounding (quoted)

- architect-context-l2.md:34-35 — "**Presentation ≠ execution.** A surface is where something is
  shown or a person acts; a capability is what executes. A page must never own a capability, and a
  capability must never require one page." Owner (:36): `schema/workflow/capability-descriptor.schema.yaml`
  (`surfaces`) — the file this unit extends.
- architect-context-l2.md:9-10 — "If a claim here disagrees with the repository, THE REPOSITORY WINS".
  Repository checked, no disagreement.
- GOVERNED-WRITE-ADMISSION-l2-20261113.md — "The capability that names it must resolve against a
  declared registry"; this unit's planted handler resolves from the sibling registry, so the ONLY
  thing wrong with the planted descriptor is that one capability does two steps.
- Governing line for the rule: a journey in disguise is "a whole sequence of steps wearing one
  step's clothing" (task-list.md:20316, quoted in the brief).

## The rule, as declared (schema/workflow/capability-descriptor.schema.yaml, allOf)

One new `allOf` entry beside the existing domain_mutation→governed_write rule; the MUTATING SET is
declared here and only here (schema :119-125):

```yaml
- if:
    properties:
      effects: { type: array, contains: { enum: [workflow_state_change,
        domain_mutation, compute_submission, deployment] }, minContains: 2 }
    required: [effects]
  then: false
```

The four mutating effects: **workflow_state_change, domain_mutation, compute_submission,
deployment**. `read` and `external_disclosure` are not mutations and may co-occur freely.
Draft 2020-12 `if`/`then: false`; `effects` is in the schema's `required` list (:26-28), so the rule
cannot be side-stepped by omitting the field. The descriptor has no step-count field; this is the
closest mechanical signal the format carries today (assumption, below).

The loader (capabilityCatalogue.ts:45-50) maps THAT Ajv failure — root-level `false schema`
keyword, which no other schema in the compiled pair can produce (verified: neither
capability-descriptor nor journey-port contains any standalone boolean schema before this change) —
to exactly one named diagnostic line; the companion `if` error is the same finding, not a second one.
Keyword-keyed; the four effect names appear in the RULE'S home — the schema file — and nowhere in
loader logic (grep-verified: capabilityCatalogue.ts names only the keyword and the diagnostic
string). The new test file names two of them only inside the PLANTED FIXTURE string — that is the
data under test, not a rule — and never re-lists the set as a constant.

Named diagnostic (raw, from the loader — captured by a throwaway probe run, file deleted after):

```
{"ok":false,"capabilities":[],"diagnostics":["planted.yaml: /effects: journey_capability_hides_journey: a capability may declare at most one mutating effect; a second step belongs in the journey, not inside this capability"]}
```

## RED (measured, before the rule existed)

Targeted run at base 9b2a4c7c + new test file only — the planted descriptor (effects
`[domain_mutation, compute_submission]`, `handler_kind: governed_write`, `handler_ref: records.create`,
with `records.create` declared in the sibling `governed-writes.yaml` so the handler RESOLVES) was
ADMITTED:

```
 ❯ src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts  (4 tests | 1 failed) 133ms
   ❯ … > refuses a descriptor declaring two mutating effects with the named diagnostic
     → expected true to be false // Object.is equality
 FAIL  … > refuses a descriptor declaring two mutating effects with the named diagnostic
AssertionError: expected true to be false // Object.is equality
- false
+ true
 ❯ src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts:88:23
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Duration  1.72s
```

RED commit: 6e39c284 (test file only, uncommitted-schema base).

## Refusals (green, final code)

- Case 1 — planted two-mutating-effect descriptor: `ok: false`, zero capabilities admitted, exactly
  ONE diagnostic containing both `planted.yaml` and `journey_capability_hides_journey` (raw output
  above). The refusal is the test.

## Non-refusals (green, final code — no false refusal)

- (a) `effects: [domain_mutation]`, governed_write, handler resolving from the sibling registry →
  admits.
- (b) `effects: [read, external_disclosure]` (two effects, zero mutating) → admits.
- (c) The REAL shipped catalogue `config/journey/capabilities` loaded with
  `new Set(AGENT_ALLOWED_TOOLS)` exactly as labwareDefinitionJourney.test.ts:37 does → `ok: true`,
  >0 capabilities. No hardcoded id list in this file (that pin belongs to falsify-compose).
  Measured at base before the change: no shipped descriptor declares more than one mutating effect
  — `config/journey/capabilities/*.yaml:^effects:` reads `[domain_mutation]` (labware-definition-create,
  labware-instance-place, material-create, noun-create-from-document), `[read]`
  (material-library-search, ontology-lookup), `[read, external_disclosure]` (ncbi-gene-search,
  vendor-web-search). So the rule refuses nothing that exists.

Final targeted run (raw):

```
 ✓ src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts  (4 tests) 131ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  1.90s
```

## Mutation probes (both RED, both reverted, both proven)

Probe 1 — delete the named-diagnostic mapping in capabilityCatalogue.ts (Ajv failure falls through
to the generic describe). Raw summary:

```
 ❯ src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts  (4 tests | 1 failed) 126ms
     → expected [ …(2) ] to have a length of 1 but got 2
AssertionError: expected [ …(2) ] to have a length of 1 but got 2
- 1
+ 2
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Duration  1.16s
```

The schema still refuses (the planted descriptor is NOT admitted — `ok: false` holds); what broke is
the named form: the diagnostic falls out as two raw Ajv lines
(`false schema` + `if`), so the case-1 assertion on `journey_capability_hides_journey` cannot pass.

Probe 2 (vacuous-pin guard) — remove the `allOf` entry from the schema, re-run. Case 1 goes back to
ADMITTED, identical failure to the RED step (raw):

```
 ❯ src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts  (4 tests | 1 failed) 136ms
     → expected true to be false // Object.is equality
AssertionError: expected true to be false // Object.is equality
- false
+ true
 ❯ src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts:88:23
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Duration  2.47s
```

So the rule added IS the rule being tested. Revert proof for both:
`git -c core.fileMode=false status --short` → empty (clean tree), and `minContains` present at
schema line 122.

## Baselines held (measured at final code, raw)

- `cd server && npx vitest run src/compiler/journey/capabilityCatalogue.test.ts src/compiler/journey/capabilityCatalogue.labwareDef.test.ts`
  → `Test Files  2 passed (2)`, `Tests  16 passed (16)`, 2.13s (brief baseline: 2 files / 16 tests, 3.45s).
  No false refusal of a shipped descriptor.
- `cd server && npx vitest run src/compiler/journey/capabilityDescriptor.test.ts`
  → `Test Files  1 passed (1)`, `Tests  7 passed (7)`, 53ms (brief baseline: 1 file / 7 tests).
  The same schema compiles under Ajv `strict: true` with no new complaint.
- `cd server && npx tsc --noEmit -p tsconfig.json` (run because a .ts file changed): exactly the 6
  pre-existing baseline error lines (AIHandlers.ts 332/438/716, AiIngestionHandlers.ts 291,
  ExtractProtocolHandler.ts 63, sequenceRoutes.ts 37 — all TS2339 in api/handlers + sequenceRoutes);
  zero from the changed files.

## Containment self-checks (the three graded failure paths)

1. False refusal of a shipped descriptor — ruled out by the real-catalogue pin (c) and the 16/16
   baseline suite.
2. Two-mutation descriptor slipping through — ruled out by case 1 plus probe 2 (removing the rule
   makes case 1 fail, so the green is load-bearing on the rule).
3. Mutating set in two places — the four names appear only in
   schema/workflow/capability-descriptor.schema.yaml; capabilityCatalogue.ts names the RULE
   (keyword + diagnostic string) and no effect. Grep-verified.

## Changed files (exactly the owned set minus the report itself at commit time)

- schema/workflow/capability-descriptor.schema.yaml (+10)
- server/src/compiler/journey/capabilityCatalogue.ts (+11 −1)
- server/src/compiler/journey/capabilityCatalogueJourneyHiding.test.ts (new, 124 lines)

Code diff vs base 9b2a4c7c: schema +10, capabilityCatalogue.ts +11 −1, plus the new 124-line test
file. Output budget: 3 code files + this report = 4 files; 124 + 20 + 1 = 145 lines ≤ 150.

## ONE explicit assumption for the architect

"Two or more mutating effects = a journey in disguise" is a **data-derived proxy**: the descriptor
format carries no step-count field, and ≥2 declared mutating effects is the closest mechanical
signal available today. If the architect wants a different signal (e.g. a declared step count, or a
`journey_of:` pointer that the catalogue must refuse), this rule is ONE `allOf` entry and ONE
diagnostic string to replace — not a design.

## Next actions / remaining blockers

- None for this unit. The composition half (composition YAML + report) belongs to unit
  falsify-compose (brief-...-falsify-compose-0047, dispatched 2026-11-14T05:48Z) — untouched here.
- Browser legs (third/fourth `verified by:` clauses) are separate later legs; waived for this unit.
- Environment note (no facts invented, all measured): the lane worktree had no
  `server/node_modules`; the main checkout /home/brad/git/computable-lab (trunk f97f245b) does, with
  byte-identical server/package.json + lockfiles at this lane's base, so a gitignored
  `server/node_modules` symlink points at it (no install, no scaffold). It is gitignored — the tree
  is clean without it. Delete the symlink before the worktree is recycled.
- Scratch root /home/brad/.falsify-hidesjourney-scratch/ (ajv probe, tsc receipts) deleted at exit.
