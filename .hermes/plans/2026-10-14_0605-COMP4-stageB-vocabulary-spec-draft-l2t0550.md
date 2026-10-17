# SHORTHAND-COMP-4 (Stage B) — SPEC DRAFT — lane 2 — composer l2t0550
Draft: 2026-10-14T06:05 EDT. Trunk at draft time: cl/integration-2 tip 04e5bbbf (docs-only;
last product merge c7ab226c COMP-3 + 6cf14f60 CUE-EXEMPT-1). DRAFT — orchestrator reviews
and promotes; do NOT dispatch unreviewed.

## Goal (one sentence)
Promote `composition` from the open `params` slot to a DECLARED vocabulary arg on
`add_material` (and `seed`) in schema/scientist-intent/scientist-intent-vocabulary.yaml so the
resolution engine binds each mixture component at compile time and bars atomically (422
needs-clarification, naming the unresolvable component, zero writes) instead of components
only grounding at store write.

## Why
"Things that can be data should be data," applied to the wire contract: today an unresolvable
component (typo, hallucinated reagent) sails through the compiler as a `mint:<label>` draft
ref and only hits the store at accept time (AddMaterialSupport.ts:217), minting garbage.
Stage B moves the bar to the SPINE-4 door — the same atomic 422 mechanism
(resolveNounsPass blocked-pass → IntentCompileFromPromptHandlers.ts:174/337 NEEDS_CLARIFICATION)
that every other noun uses — with the vocabulary YAML as the single authority.

## Ground-truth findings (verified in the tree at 04e5bbbf, file:line)
1. Vocabulary data: `schema/scientist-intent/scientist-intent-vocabulary.yaml` — `seed` at :13,
   `add_material` at :203; NEITHER declares a `composition` arg (grep `composition` in
   `schema/scientist-intent/` = zero hits). Args carry `kind: resolvable|scalar|wells|quantity`
   with `domain:` tags; NO `cardinality` field exists anywhere in the triplet or TS
   (grep `cardinality` server/src + schema = only unrelated protocol/requested-service hits).
2. Meta-schema: `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` arg items are
   `additionalProperties:false, unevaluatedProperties:false` (properties block starts :75);
   kind enum at :81; `level` declaration-slot precedent at :107-131. Adding any new arg
   property REQUIRES a meta-schema edit FIRST — the loader Ajv-validates the shipped doc and
   fail-loud throws on unknown keys (vocabulary.ts schema/lint validation before read,
   :121 schemaPath, throw path verified in loader head).
3. Arg-contract reader: `server/src/compiler/scientistIntent/vocabulary.ts` — `RawArg` :170,
   args map with exactOptionalPropertyTypes conditional spreads :180-190, cached per path
   :252-263 (the LIVE STACK must RESTART after YAML edits; tsx --watch does NOT reload YAML).
   `contractBlock` renders `name??:kind(domain)` :224-234 and feeds the tool-schema/prompt
   disclosure (promptBudget ceiling check exists, see §Bait).
4. The engine doc-door: `server/src/compiler/resolution/resolutionEngine.ts`
   `resolveScientistIntentNouns` :227+ loops `vocab.argContracts(verb)`, skips non-resolvable/
   wells :240-241, and **silently skips any non-string value** (:244
   `if (typeof raw !== 'string' || raw.trim().length === 0) continue;`) — an array-valued
   composition arg is invisible to the engine TODAY (the RED hook). Unresolvable nouns get ONE
   clarification per noun via `clarificationFor(req,'unknown-noun',mints)` :211 (label = the
   verbatim noun; mint affordance offered as candidate, never bound — strategies.ts mint_local
   :118-127 gathers nothing; dedupe drops tier-5 curie-less candidates at :45).
5. The atomic bar: `server/src/compiler/resolution/resolveNounsPass.ts` — `blocked =
   clarifications.length > 0` → `ok:false` with ONE `unresolved_arguments` diagnostic carrying
   clarifications verbatim (pass run() tail, ~:285-310); the runner's cascade barrier then skips
   EVERY downstream pass (header cites PipelineRunner.ts:272-293) — this is structurally
   "no partial mint": expand/mint passes never run, so zero events, zero store writes.
   HTTP shape: 422 `NEEDS_CLARIFICATION` at
   `server/src/api/handlers/IntentCompileFromPromptHandlers.ts:174` (interface) / :337 (bar).
6. Current composition flow (Stage A, merged): open `params` slot verbatim through the lift
   (`liftScientistIntent.ts` params passthrough with the "that is Ajv's (and Stage B's) job"
   comment at :161-169; ALLOWED_PARAM_KEYS set at :60-72 does NOT include `composition` at
   action level), carried to candidate events by normalizeScientistIntent params pass-through
   :708-715 (which also gates the blob-bar exemption on `params.composition` :715), consumed by
   `simpleVerbs.ts` `compositionSnapshotFromParams` :344 (called only from addMaterialExpander
   :471 — `seedExpander` :58-77 does NOT call it), emitted as `composition_snapshot` event
   details, grounded ONLY at store write in `AddMaterialSupport.ts:217`
   (`canonicalCompositionSnapshot`; draft refs minted via `ensureLocalMaterialForDraft` :383-385,
   which REUSES existing materials by label — this is why second-accept reuse already works).
7. Wire schema: `schema/workflow/scientist-intent.schema.yaml` action items are
   `additionalProperties:false, unevaluatedProperties:false` (~:66-70); `params` is an OPEN
   object at :173-175 (`additionalProperties: true`). An action-level `composition` key must be
   DECLARED here or parse-time Ajv rejects it.
8. Goldens + MANIFEST: `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` treeState
   pins sha256 of BOTH files Stage B edits: vocabulary.yaml (014ca71f…) and
   schema/workflow/scientist-intent.schema.yaml (bb5cc4d0…) — I verified with `sha256sum` both
   match the manifest right now, so ANY edit to either goes `golden.manifest.versions-current`
   (goldenIntentToGraph.test.ts:138) RED until re-bless; `replayKernel.ts` :378-380 re-hashes
   treeState and :393 throws naming the drift. **The plan's `58c447eb…` manifest blob hash is
   STALE: current is `git -c core.fileMode=false hash-object
   server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` =
   `83fda3b42519eed879bc5e49290e724f727be509`** (verified this session). COMP-3 and
   CUE-EXEMPT-1 merges both pinned "MANIFEST 83fda3b4 byte-identical" — Stage B is the first
   item since to legitimately change it, so the ORCHESTRATOR must request the re-bless ruling
   and re-baseline any acceptance battery pinning 83fda3b4 (the plan's in-flight-battery
   prerequisite, hash updated).
9. SPINE declared-arg precedent: commit `40ef080d` (SPINE-8 level slot) — the exact migration
   shape: (i) meta-schema property ADDED FIRST (unevaluatedProperties:false ordering), (ii)
   ONE data line, (iii) vocabulary.ts gets the field via conditional spread
   (exactOptionalPropertyTypes-safe), (iv) resolveNounsPass reads it GENERICALLY from
   `argContracts(verb)` — zero verb/arg name literals, (v) resolveNounsPass.test.ts gains
   shipped-declaration + fixture-copy-flip legs. 5 files, +167/−2. Follow it exactly.
10. Part I tests to keep green: `compositionDecomposition.test.ts` (455 L; e2e legs at
    :353-455 use params.composition documents through
    `compileShorthandDeterministically` + EMPTY MemoryRecordStore, expecting outcome
    'complete'), `declaredArgumentReachability.test.ts` (real-pipeline harness idiom with
    SEED_RECORDS spine, :39-42), `promptShapeParity.test.ts`, goldens suite. Because the
    engine reads DECLARED arg fields at ACTION level, params.composition documents stay
    byte-identical and green under Stage B (the declared wire form is additive).
11. The lift HAS a vocabulary handle in scope (uses `vocab.has` at liftScientistIntent.ts
    :168), so declared-arg passthrough can be data-driven; see Implementation step 4.

## Exact YAML delta shape
### A. `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` — FIRST commit
Add to the arg-contract properties block (alongside `level`, :107+):
```yaml
              cardinality:
                type: string
                enum: [one, many]
                description: >-
                  Optional multiplicity of the argument. 'many' on a resolvable arg
                  means the wire value is an ARRAY of entries, each carrying its noun
                  in the property named by itemNounField; the resolve_nouns door
                  iterates it and emits one clarification per unresolved item. Absent
                  = 'one' (every shipped arg). Interpreted generically — no verb or
                  arg NAME is referenced by any consumer.
              itemNounField:
                type: string
                pattern: "^[a-z][a-zA-Z0-9_]*$"
                description: >-
                  For cardinality: many — the entry property carrying the symbolic
                  noun the resolver binds (e.g. 'material'). Required by lint when
                  cardinality is many. Entry shape policy (role/quantity fields,
                  concrete-instance rejection) lives in the wire schema, not here.
```
(Lint extension `vocab-many-args-declare-item-noun-field` in
scientist-intent-vocabulary.lint.yaml: a `many` resolvable arg MUST declare itemNounField —
mirrors P1 vocab-resolvable-args-declare-domain at lint :13.)

### B. `schema/scientist-intent/scientist-intent-vocabulary.yaml` — same commit, AFTER A
Add to BOTH `add_material` (:203) and `seed` (:13) args:
```yaml
      - name: composition
        kind: resolvable
        required: false
        domain: material
        cardinality: many
        itemNounField: material
```
`domain: material` is MANDATORY (lint rule vocab-resolvable-args-declare-domain fails the
loader otherwise). No `hintEligible`, no `level`.

### C. `schema/workflow/scientist-intent.schema.yaml` — declare the wire shape
Add `composition` to the action `properties` (strict items — an undeclared key is a hard
Ajv reject):
```yaml
        composition:
          type: array
          minItems: 2
          description: >-
            Declared mixture components (Stage B). Each entry names ONE component as a
            symbolic material noun; the resolve_nouns pass binds every component and bars
            atomically (422) on an unresolvable one. During the transition the open
            params.composition slot remains valid too — both forms validate.
          items:
            type: object
            additionalProperties: false
            unevaluatedProperties: false
            required: [material, role]
            properties:
              material:
                type: string
                minLength: 1
                description: "Symbolic material noun (the scientist's words) — NEVER a concrete-instance object/ref."
              role:
                type: string
                enum: [solute, solvent, buffer_component, additive, activity_source, cells, other]
              fraction:
                type: string
              concentration:
                type: object
                additionalProperties: false
                required: [value, unit]
                properties:
                  value: { type: number }
                  unit: { type: string, minLength: 1 }
              count:
                type: number
              counterDensity:
                type: object
                additionalProperties: false
                required: [value, unit]
                properties:
                  value: { type: number }
                  unit: { type: string, minLength: 1 }
```
Role enum mirrors composition-entry.schema.yaml :12-20 (schema, not a TS table — OQ2).
Concrete-instance objects are rejected BY CONSTRUCTION: `material` is `type: string`, and
`additionalProperties:false` forbids `kind`/`id`/`curie`/`recordId` keys anywhere in an entry.
`minItems: 2` — a one-entry composition is a plain add (matches the expander's ≥2 rule,
simpleVerbs.ts :354).

## Implementation steps (order is contractual)
1. Meta-schema + lint extension (A) → vocabulary data (B) → wire schema (C) in ONE commit
   (or A one commit earlier; never data-before-meta — loader Ajv fail-loud).
2. `vocabulary.ts`: add `cardinality?: 'one' | 'many'` and `itemNounField?: string` to
   `ScientistIntentArgContract` + `RawArg` (:170) via CONDITIONAL SPREADS exactly like the
   SPINE-8 `level` leg (:186-189 idiom). Do NOT change `contractBlock` rendering (:224-234) —
   it stays `name??:kind(domain)`; pin that in a test (prompt-budget honesty, §Bait).
3. Generic `many` iteration in the doc-door — `resolutionEngine.ts`
   `resolveScientistIntentNouns`: replace the :244 string-skip with a declared-field branch —
   `kind resolvable && cardinality many && Array.isArray(raw)` → for each entry read
   `entry[contract.itemNounField]` as the label (skip empty strings defensively; malformed
   entries are Ajv's job) and build one ResolutionRequest per entry with `actionLocation =
   {actionIndex, action: verb, argument: contract.name}` — the clarification's `label` is the
   COMPONENT NAME, which is how the 422 "names it". Existing scalar leg byte-identical
   (additive-expander honesty). ZERO verb/arg/domain name literals in the engine and the pass
   (file header law, resolveNounsPass.ts :20-24) — everything driven off the declared contract.
   Do NOT extend `ScientistIntentActionLocation` with an itemIndex; clarification identity via
   `label:` is sufficient (reconcileModelUnresolved, resolveNounsPass.ts :134-146).
4. `liftScientistIntent.ts`: action-level `composition` must survive the lift
   (ALLOWED_PARAM_KEYS :60 currently drops it). Data-driven fix preferred: allow any key that
   `argContracts(canonical)` declares (the vocab is already in scope at :168) unioned with the
   existing set; the literal-set fallback is acceptable ONLY with a `// Stage B` comment —
   reviewer decides.
5. `normalizeScientistIntent.ts`: carry the declared `composition` onto the candidate event
   (params pass-through :708-715 covers `params.composition` only; an action-level declared
   array needs a generic carry of declared non-scalar args, or the existing `mappings` list
   entry `['composition', ['composition']]`); the blob-bar exemption at :715 must ALSO honor
   action-level composition (else a label+declared-arg mixture double-bars). In the chatbot
   chain the candidate arrives as the expander's `params` (simpleVerbs :468-471 comment), so
   `compositionSnapshotFromParams(params.composition, …)` reads it with NO expander edit.
6. `seed`: per plan the arg is declared on `seed` too (the resolution bar fires there — that
   IS the Stage B value on that verb). `seedExpander` (simpleVerbs.ts :58-77) does not consume
   the snapshot today; the one-line reuse `compositionSnapshotFromParams(params.composition,
   params.material)` into its add_material event details is the honest minimal realization
   (silently ignoring a declared value violates the declared-reachability doctrine,
   normalizeScientistIntent.ts :650-700). See OQ2 — orchestrator may descope.
7. RED-first tests (§Test plan) BEFORE steps 1-6, per task.
8. Goldens: add ONE new fixture pair + re-bless MANIFEST in the SAME commit (see Bless steps).
9. Prompt data: extend `server/prompts/material-system-rules.md` "Mixtures" block (:127+) to
   teach the ACTION-level `composition:` form alongside `params.composition` (both valid
   during transition). Check `promptBudget.test.ts` ceiling after (it measures
   agent + material-rules + instruction + tool-def against CORE_PROMPT_CEILING_CHARS,
   server/src/ai/promptBudget.test.ts :104-113).

## Migration / bless steps (MANIFEST re-bless — orchestrator obligation)
- Bless is DONE ONCE, in the same commit as the vocabulary + wire-schema edits, on the claim
  branch after all RED→GREEN work for the tree files is final (never bless pending wording —
  MANIFEST header law; SPINE7-REBLESS / DECK-FOLD-1 precedent recorded in MANIFEST comments).
- Steps: (1) re-hash the two edited treeState files (`sha256sum
  schema/scientist-intent/scientist-intent-vocabulary.yaml
  schema/workflow/scientist-intent.schema.yaml`) and update their MANIFEST treeState entries;
  (2) add the new fixture + blessed record entries with their hashes; (3) run
  `cd server && npx vitest run src/compiler/scientistIntent/goldens/` — green means
  `golden.manifest.versions-current` passes; (4) `git -c core.fileMode=false hash-object
  server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` → report the NEW blob hash
  (replaces 83fda3b4…) in the report header AND the handoff. The report MUST show a named
  before/after diff per blessed entry (drift-proven: the ONLY divergences are the two treeState
  hashes + the new entries — DECK-FOLD-1 bar).
- ORCHESTRATOR: before bless, confirm no in-flight acceptance battery pins MANIFEST
  83fda3b42519… (the plan's prerequisite with the CURRENT hash — 58c447eb in the plan text is
  superseded); after merge, re-baseline any such battery.

## RED-first test plan (vitest, existing harness conventions)
New file (unique deliverable): `server/src/compiler/resolution/compositionArgResolution.test.ts`,
modeled on resolveNounsPass.test.ts + declaredArgumentReachability.test.ts idioms
(parseScientistIntent → compileScientistIntent/createResolveNounsPass with a store-backed
spine `createResolveSpineFromContext` over MemoryRecordStore seeded with 3 of 4 components):
- T1 RED-first (write FIRST, paste RED): action-level `composition`, one unseeded component →
  compile outcome `needs-clarification`; exactly ONE clarification naming the unseeded
  component as `label` with `actionLocation.argument === 'composition'`; pass diagnostic code
  `unresolved_arguments`; store.list() EMPTY (no partial mint). Today's RED: the door SKIPS the
  array (resolutionEngine.ts :244) so the doc compiles 'complete'.
- T2 resolvable mixture: all 4 components seeded → outcome 'complete'; the resolve_nouns slot
  exposes 4 bindings keyed by component label (resolvedByLabel).
- T3 concrete-instance entry `{ material: { kind: 'record', id: 'MAT-x' } }` → Ajv REJECT at
  parseScientistIntent (wire schema), offending path named — never a 422, never a bind.
- T4 no-double-bar: mixture-shaped `material` label + declared action-level composition →
  blob-bar does NOT fire (params-composition leg already pinned; add action-level leg).
- T5 lift leg: action-level composition survives liftScientistIntent + Ajv.
- T6 fixture-copy flip (SPINE-8 mutation leg, vocab-required-flip idiom, tmp triplet copy):
  remove `cardinality` from a copied vocabulary → the copied doc's many-arg behaves as scalar
  (door skips the array) — proves the iteration follows DECLARED data, not a TS table.
- T7 vocabulary loader green on the shipped triplet after edits (schema + lint pass; new lint
  rule fires on a `many` arg lacking itemNounField — lint test convention in vocabulary.test.ts).
- T8 seed leg (if OQ2 keeps seed in scope): seed with declared composition + unseeded
  component bars identically.

## First targeted check (prove the approach early)
After writing T1 ONLY (no implementation):
```bash
cd server && npx vitest run src/compiler/resolution/compositionArgResolution.test.ts
```
Expected RED: T1 fails with outcome 'complete' / 0 clarifications (the array is skipped at
resolutionEngine.ts:244 today). This single command proves the diagnosis and the harness shape
before any YAML is touched.

## Verification commands (complete, with expected output)
All from the worktree; vitest cwd MUST be `server` (paths resolve via
`process.cwd()/schema` — server/schema is a symlink into the repo schema/):
- `cd server && npx vitest run src/compiler/resolution/` — ALL green incl. the new file +
  spine8/spine4 legs unbroken.
- `cd server && npx vitest run src/compiler/scientistIntent/` — green incl. vocabulary.test,
  vocabularyContractBlock.test, promptShapeParity, compositionDecomposition (Part I goldens),
  declaredArgumentReachability, realizationGolden, goldens/ suite (post-re-bless).
- `cd server && npx vitest run src/ai/promptBudget.test.ts` — green; if the ceiling fails, the
  prompt-data edit is too chatty — shrink it (Brad's standing rule), do NOT raise the ceiling.
- `cd server && npx tsc --noEmit | grep -c "error TS"` — expect `0` (trunk baseline is 0 for
  server per COMP-3/CUE-EXEMPT merge notes).
- `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
  — NEW hash (≠ 83fda3b4…), reported verbatim in the handoff.
- `git -c core.fileMode=false diff --name-only <base>..HEAD` — ONLY: the three triplet YAMLs,
  schema/workflow/scientist-intent.schema.yaml, vocabulary.ts, resolutionEngine.ts,
  liftScientistIntent.ts, normalizeScientistIntent.ts, simpleVerbs.ts (seed leg only if OQ2),
  new test file, resolveNounsPass.test.ts (flip leg), goldens/{MANIFEST.yaml,fixtures/,__records__},
  material-system-rules.md, the lint yaml, the report. ANYTHING else = scope fail.
- No live-stack proof is required for done-gate (headless acceptance per verified-by), but if
  any :3093 leg is run, the orchestrator restarts the stack first (YAML + in-process
  vocabulary cache, vocabulary.ts :252-263; tsx --watch does NOT reload YAML).

## Acceptance criteria (verbatim from the task list)
> Vocabulary lint + resolver tests: unresolvable component -> 422 naming it, no partial mint;
> resolvable mixture binds components AND bars atomically. Existing Part I goldens still pass.
> Files: schema/scientist-intent/scientist-intent-vocabulary.yaml (+ resolver/realization per plan).

## Worker contract
- Worktree: `/mnt/vast/home/brad/git/cl-integration-2/wt/SHORTHAND-COMP-4-lane2-l2t0550`
  off trunk cl/integration-2 tip AT DISPATCH (04e5bbbf at draft time; RE-ANCHOR every
  file:line above against the branch point — trunk moves).
- Branch: `cl/SHORTHAND-COMP-4-lane2-l2t0550`. Fleet coder lock: acquire before coding, one
  coder at a time (pid-file semantics per assumptions.md).
- Report: `<worktree>/.hermes/plans/reports/SHORTHAND-COMP-4-report.l2t0550.md`; end marker
  `COMP-4 DONE <sha>`.
- Commit style: `feat(vocab): stage B declared composition arg …` / `test(...)` RED commits
  first; never `git add -A`; `git -c core.fileMode=false` for every git call.
- Environment facts: lane-2 stack :3093/:5193; tsx --watch does NOT reload YAML (restart is the
  orchestrator's; never restart it yourself); exactOptionalPropertyTypes ON the backend —
  optional means absent OR value, never `: undefined` (conditional spreads only).

## Reviewer bait (expected adversarial probes — pre-empt all)
1. **Ordering trap**: data-before-meta-schema = loader Ajv fail-loud kills every consumer on
   import. Prove the ordering with the T7 RED leg (add the key to a tmp triplet copy WITHOUT
   the meta-schema edit and show the loader throw naming the key).
2. **exactOptionalPropertyTypes sites**: `cardinality?`/`itemNounField?` on
   ScientistIntentArgContract + any payload assembly; `x: undefined` fails tsc.
3. **Hardcode boundary**: any `if (contract.name === 'composition')` or verb literal in
   resolutionEngine.ts / resolveNounsPass.ts / normalizeScientistIntent.ts is a scope-kill —
   T6's fixture flip is the mutation-proof counter.
4. **YAML-reload trap**: a "live proof" run without a stack restart tests the CACHED
   vocabulary (vocabulary.ts :252-263) — headless tests re-load per process; the live stack
   needs the orchestrator's restart. Do not claim live behavior pre-restart.
5. **MANIFEST**: blessing twice, blessing before the final wording, blessing without a named
   per-entry before/after diff, or forgetting that BOTH edited schema files are treeState-pinned
   (finding 8). Also: the plan's 58c447eb is STALE (current 83fda3b4…) — cite the hash you
   measured, never the plan's.
6. **422-naming-it**: assert the clarification `label` IS the component name (not 'composition')
   AND that the HTTP arm exists (golden.intent-to-clarification replay family proves the 422
   body shape; a pass-level bar alone doesn't prove the wire).
7. **No partial mint**: assert `store.list()` length 0 after the bar through the FULL pipeline
   (cascade barrier), not just that the pass returned ok:false.
8. **Part I byte-honesty**: params.composition documents must stay byte-identical end-to-end
   (compositionDecomposition :242 'byte-identical' idiom extended to action-level coexistence);
   the blob-bar exemption must fire for BOTH forms (T4).
9. **Concrete-instance smuggling**: T3 — `{material: {...}}` must be a PARSE reject naming the
   path, never a clarification with a nested-object label stringified.
10. **Prompt budget**: contractBlock unchanged (step 2); material-rules edit small;
    promptBudget ceiling asserted, never widened.
11. **Silent drop on seed**: if seed keeps the arg, seedExpander must consume it (step 6) —
    otherwise it is exactly the unrealized-declared-argument defect class.
12. **`minItems: 2` vs expander**: wire schema rejects 1-entry action-level compositions, but
    the params slot (open) still admits 1-entry shapes; the expander's ≥2 drop (simpleVerbs
    :354) must remain byte-identical (pin already exists, :257).

## Open questions (orchestrator)
1. **Wire form vs prompt**: do we also teach the model to emit action-level `composition:`
   (prompt edit) or hold prompts on `params.composition` and let the declared form be
   server-side-only during the transition? (I checked material-system-rules.md :127-150 teaches
   params-form only; the contractBlock adds `composition?:resolvable(material)` to the tool
   disclosure REGARDLESS, so full silence is not available.) Default in this spec: teach both,
   small edit.
2. **Seed scope**: plan declares composition on seed; seedExpander doesn't consume it today
   (simpleVerbs :58-77). One-line reuse vs descoping seed to a later item — orchestrator
   ruling (spec assumes one-line reuse unless descoped).
3. **Realization depth**: this spec keeps realization byte-unchanged (draft-ref snapshot;
   AddMaterialSupport reuse-by-label already grounds second-accepts, finding 6). "Binds
   components" is proven at the resolver/golden layer. If the orchestrator wants resolved
   record refs to FLOW into composition_snapshot (record_ref instead of draft_ref), that is a
   materially larger expander+chain change — confirm it is NOT in Stage B. (Checked:
   AddMaterialSupport.ts :217/:383-385, compositionDecomposition :266-352, plan Stage B text
   names only resolver binding + 422.)

## Assumptions the coder may NOT make
- May NOT assume the plan's MANIFEST hash 58c447eb is current (it is not: 83fda3b4…; measure it).
- May NOT assume `cardinality` or `itemNounField` already exist anywhere (grep-verified absent).
- May NOT assume the engine sees array-valued args (resolutionEngine.ts :244 skips them — the
  RED is real and expected on first run).
- May NOT assume `composition` passes the lift today (ALLOWED_PARAM_KEYS :60 drops it) nor
  that normalize carries action-level composition to candidates (it doesn't).
- May NOT assume the blob-bar exempts action-level composition (only params.composition at
  normalizeScientistIntent.ts :715).
- May NOT assume seed's expander consumes composition (it doesn't) nor that declaring the arg
  without a consumer is acceptable.
- May NOT assume tsx --watch picked up YAML edits, nor that the vocabulary singleton re-reads
  after first load in a live process.
- May NOT assume server tsc baseline is nonzero (trunk = 0) nor re-baseline it.
- May NOT assume params goldens exercise the declared-arg path (they take the OPEN-slot route;
  the action-level wire form needs its OWN tests + goldens).
- May NOT assume the orchestrator restarts the stack mid-coding, nor restart it themselves.
- May NOT invent ontology/level terms: no `level:` line on the new arg (SPINE-8 inertness
  aside, nothing here requires it), no CHEBI/namespace literals.
- May NOT edit goldens fixtures/records except the ONE new fixture pair + treeState re-hash;
  no re-bless of untouched entries.

SPEC-DRAFT-STATE: draft for orchestrator review; canonical promotion is the orchestrator's call.
