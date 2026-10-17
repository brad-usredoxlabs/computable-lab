# SHORTHAND-COMP-4 (Stage B) — coder report — lane 2 — l2t0910

Branch: cl/COMP-4-lane2-l2t0910 (worktree /mnt/vast/home/brad/git/wt/COMP-4-lane2-l2t0910)
Base: rebased onto cl/integration-2 tip 233231a5 (clean; W2-9-g2dfix5 docs merge only, no overlap).
Spec contract: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-14_0830-COMP4-stageB-vocabulary.md
OQ rulings honored: OQ1 teach BOTH wire forms; OQ2 seed IN with one-line reuse; OQ3 realization stays at resolver/golden layer.

Commits (contractual order: RED -> meta-schema -> data+interpreter+bless):
- 4d580919 test(comp4): RED stage B — T1-T8 (13 failed / 1 passed)
- 5e5bde44 feat(comp4): meta-schema cardinality/itemNounField + lint P5 (meta BEFORE data)
- 876c67ac feat(comp4): composition promoted to a declared vocabulary arg (+ data, interpreter, prompt, golden + MANIFEST re-bless)
- e6924856 docs(comp4): this report (final tip)

---

## 0. Baselines (recorded BEFORE any edit, verbatim)

Full server suite (pre-edit, run 1):
```
 Test Files  92 failed | 621 passed | 9 skipped (722)
      Tests  97 failed | 5699 passed | 70 skipped (6080)
     Errors  2 errors
```
Full server suite (pre-edit, run 2 — same tree, drift band on test counts):
```
 Test Files  92 failed | 621 passed | 9 skipped (722)
      Tests  100 failed | 5733 passed | 70 skipped (6080)
     Errors  2 errors
```
Raw output: /tmp/comp4-baseline-fullsuite-full.txt; failing-file list (47 files with >0 failed tests): /tmp/comp4-baseline-failfiles.txt.

Server typecheck (pre-edit): `npm run typecheck -w server` -> tsc --noEmit, exit 0, 0 "error TS" lines.
(/tmp/comp4-baseline-tsc.txt; grep -c "error TS" = 0. Trunk baseline = 0 per COMP-3/CUE-EXEMPT merge notes; NOT re-baselined.)

promptBudget (pre-edit): 47020 chars (agent 24543 + material-rules 5430 + instruction 3061 + schema 13986) — ceiling 47180, headroom 160.

MANIFEST blob (pre-edit): 83fda3b42519eed879bc5e49290e724f727be509 (measured, matches the orchestrator's citation; the plan's 58c447eb is stale and was NOT used).

## 1. RED evidence (commit 4d580919, before ANY implementation)

Command: `cd server && npx vitest run src/compiler/resolution/compositionArgResolution.test.ts`
Result: `Test Files 1 failed (1)` / `Tests 13 failed | 1 passed (14)` (raw: /tmp/comp4-red-t1.txt).

The single control leg (T4 control: blob bar with NO declared components) passed pre-edit, proving the harness
touches the real pipeline. Every other leg was RED for the diagnosed reasons:
- T1/T2/T2b/T4/T8a/T8b: `ScientistIntentValidationError: scientist-intent failed schema validation: 1 error(s)`
  with serialized error `{ path: '/actions/0', message: 'Unknown property: composition', keyword:
  'additionalProperties', params: { additionalProperty: 'composition' } }` — the action-level key is undeclared
  in the wire schema today (finding 7).
- T5: `expected false to be true` — liftScientistIntent DROPS composition (ALLOWED_PARAM_KEYS, finding 11).
- T7a: `add_material must declare composition: expected undefined not to be undefined` (finding 1).
- T7b: contractBlock contains no `composition?:resolvable(material)` (arg not declared).
- T6/T7c: flip regexes no-op (no `cardinality: many` in the shipped data yet).
- T7d: ordering-trap copy threw nothing (no cardinality in the data yet).
The engine-skip RED (resolutionEngine.ts:244 skipping array args) is pinned post-declaration by T6's flipped-copy
leg: with cardinality removed from a copied vocabulary, the SAME intent + SAME engine yields ZERO composition
requests — the exact pre-Stage-B skip behavior (bait 3's mutation counter).

## 2. Per-test T-map to acceptance criteria

Acceptance (verbatim): "Vocabulary lint + resolver tests: unresolvable component -> 422 naming it, no partial
mint; resolvable mixture binds components AND bars atomically. Existing Part I goldens still pass."

| Test | Proves |
|---|---|
| T1 | unresolvable component -> outcome 'needs-clarification'; exactly ONE clarification with `label === 'Equine Serum'` (the COMPONENT name, not 'composition'), `reason 'unknown-noun'`, `actionLocation {actionIndex:0, action:'add_material', argument:'composition'}`; the `unresolved_arguments` pass diagnostic carries it verbatim; `terminalArtifacts.events == []`; store.create/update NEVER called (no partial mint through the FULL cascade-barriered pipeline) |
| T1 + golden | the 422 WIRE arm: golden.intent-to-clarification.unresolvable-mixture-component replays the REAL handler -> status 422, error NEEDS_CLARIFICATION, atomic zero-artifact (Object.keys == directives/events/gaps/protocolIntent, events+gaps empty), writeCalls 0, deep-equal vs blessed record (bait 6) |
| T2 | resolvable mixture: engine door builds one request per entry; bindings keyed by all 4 component labels; zero composition clarifications |
| T2b | full pipeline: fully resolvable mixture compiles with zero composition clarifications, outcome NOT needs-clarification |
| T3 | concrete-instance entry `{material:{kind:'record',id:'MAT-x'}}` -> ScientistIntentValidationError at parse, error path names `/actions/0/composition/0` — Ajv reject by construction, never a 422, never a bind (bait 9) |
| T4 | mixture-shaped `material` label + action-level composition -> blob bar does NOT fire (no double-bar); control leg: label with NO components still bars (Part III D1 unbroken) |
| T5 | action-level composition survives liftScientistIntent + strict Ajv |
| T6 | mutation flip (tmp triplet COPY, cardinality/itemNounField removed): shipped vocab iterates (3 bind + 1 clarify naming 'Equine Serum'); flipped copy: ZERO composition requests — behavior follows DECLARED data, not a TS table (bait 3) |
| T7a | shipped vocabulary declares composition on add_material AND seed: kind resolvable, required false, domain material, cardinality many, itemNounField material |
| T7b | contractBlock rendering stays `name??:kind(domain)` — no 'many'/itemNounField leakage (prompt-budget honesty, bait 10) |
| T7c | lint P5 mutation: a many resolvable arg WITHOUT itemNounField throws naming `vocab-many-args-declare-item-noun-field` |
| T7d | ordering trap: data carrying cardinality WITHOUT the meta-schema property -> loader throws `failed schema validation ... 'cardinality' ... additionalProperties` (bait 1) |
| T8a | seed leg: seed + declared composition + unseeded component bars identically (422 arm, names 'Equine Serum', zero writes) |
| T8b | seed leg realization: fully resolvable seed composition -> the add_material event carries `composition_snapshot` (2 entries) — no silent drop (bait 11) |
| resolveNounsPass.test.ts comp4.many legs | shipped declaration at the PASS seam (resolvedByLabel keys component labels, bar names the component) + fixture-copy flip at the pass seam (scalar behavior) — SPINE-8 precedent shape |
| Part I goldens | compositionDecomposition.test.ts (455L, UNMODIFIED) green; declaredArgumentReachability green; promptShapeParity green; goldens suite 16/16; golden-replay.ts 37/37 checks |

## 3. MANIFEST re-bless (blessed ONCE, same commit as the vocabulary + wire-schema edits)

NEW MANIFEST blob hash: `fbf743ab1384778de43eeb113da0f0857eef9fce`
(`git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`;
replaces 83fda3b42519eed879bc5e49290e724f727be509 — record this in the post-merge battery re-baseline.)

Named before/after diff per blessed entry (drift-proven: the ONLY divergences are the two treeState hashes +
the two new entries; every other fixture/record line is byte-identical — DECK-FOLD-1 bar):

treeState:
- schema/scientist-intent/scientist-intent-vocabulary.yaml: 014ca71fbbb3716db0df62cb93662d35f6efef3b3462e823518462357786d12c -> 14d779ce050ee5fd306f2d3772efcaae6386b09cb9fef4e5c9ed8ed7b475f9b4 (composition declared on add_material + seed)
- schema/workflow/scientist-intent.schema.yaml: bb5cc4d00fe4c55ddc0f21598e1dbe12db5cdc5e8fa6dba8d562464227814178 -> cb54cbeded8c6cab7b31b89b68e9476b62d04c737dab4fb2a30a2a14167f09d5 (action-level composition property, strict items)
- schema/registry/compile-pipelines/scientist-intent-compile.yaml: b47eee0c... UNCHANGED

fixtures (new entry only):
- + golden.intent-to-clarification.unresolvable-mixture-component, fixtures/unresolvable-mixture-component.yaml, sha256 245603b100f927466cb7290656aa0056d489dbd180a1c0c67b8105c1136a3714

records (new entry only):
- + golden.intent-to-clarification.unresolvable-mixture-component, __records__/unresolvable-mixture-component.golden.json, sha256 4c5587f32e8f80786810a4e2581e9f121093b6c696353df6dbda1fdffea95cea

reproduce expectation updated "15 tests" -> "16 tests" (the new leg). No untouched entry re-blessed.
Record generated by replaying the fixture through the SAME replayKernel the tests use (one-shot generator,
deleted after use; the blessed record is the kernel's own normalized output).

## 4. promptBudget (OQ1 edit, ceiling asserted NOT widened)

After the material-system-rules.md Mixtures edit (teaches BOTH forms, +70 chars):
```
draft prompt budget: 47090 chars (agent 24543 + material-rules 5500 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 90)
```
promptBudget.test.ts 6/6 green. CORE_PROMPT_CEILING_CHARS untouched. contractBlock unchanged (T7b pin).

## 5. Verification (post-edit, all from the worktree, vitest cwd = server)

- `npx vitest run src/compiler/resolution` -> 6 files, 79/79 green (incl. compositionArgResolution 14, resolveNounsPass 20, spine4/spine8 legs unbroken)
- `npx vitest run src/compiler/scientistIntent` -> 21 files, 241/241 green (vocabulary, vocabularyContractBlock, vocabularyRipOut, promptShapeParity, compositionDecomposition 455L UNMODIFIED, declaredArgumentReachability, realizationGolden, goldens 16/16 incl. golden.manifest.versions-current)
- `npx tsx scripts/golden-replay.ts` -> 37/37 checks passed, exit 0 (new 422 leg included)
- `npx vitest run src/ai/promptBudget.test.ts` -> 6/6 green, 47090 <= 47180
- `npm run typecheck -w server` -> exit 0, 0 "error TS" (== baseline 0)
- Full suite (head): `Test Files 92 failed | 622 passed | 9 skipped (723)` / `Tests 100 failed | 5750 passed | 70 skipped (6097)` / `Errors 2 errors` — file count +1 = my new test file; failing-file set (47 files with failed tests) vs baseline (47): comm shows exactly TWO load-timeout flaps (base-only ZymoCampaignGoldenE2E, head-only Wave2SemanticPassE2E); BOTH proven green in isolation (45s/25s runs, 16/16 and 7/7 passed) — the known load-timeout flap class, not new failures. Failing-file lists: /tmp/comp4-baseline-failfiles.txt vs /tmp/comp4-head-failfiles.txt; raw head output /tmp/comp4-head-fullsuite.txt.
- `git -c core.fileMode=false diff --name-only 233231a5..HEAD` -> 19 files, ALL inside the spec's allowed set (3 triplet YAMLs, wire schema, vocabulary.ts, resolutionEngine.ts, liftScientistIntent.ts, normalizeScientistIntent.ts, parseScientistIntent.ts, simpleVerbs.ts seed leg, new test file, resolveNounsPass.test.ts flip legs, goldens/{MANIFEST.yaml,fixtures/,__records__}, goldenIntentToClarification.test.ts, golden-replay.ts, material-system-rules.md, lint yaml, vocabulary.test.ts rule-list pin, this report).

## 6. Implementation notes (what changed and why it stays generic)

1. Meta-schema FIRST (unevaluatedProperties:false ordering): `cardinality` (enum one|many) + `itemNounField`
   (pattern ^[a-z][a-zA-Z0-9_]*$) added to the arg-contract properties block alongside `level`. Lint P5
   `vocab-many-args-declare-item-noun-field` mirrors P1's declaration-slot discipline.
2. Vocabulary data (same commit, after meta): composition on add_material AND seed — kind resolvable,
   required false, domain material, cardinality many, itemNounField material. No hintEligible, no level.
3. Wire schema: action-level `composition` declared with strict items (additionalProperties:false +
   unevaluatedProperties:false, required [material, role], role enum mirroring
   composition-entry.schema.yaml, minItems 2). Concrete-instance rejection is BY CONSTRUCTION.
4. vocabulary.ts: `cardinality?: 'one' | 'many'` + `itemNounField?: string` on ScientistIntentArgContract +
   RawArg via conditional spreads (SPINE-8 level idiom, exactOptionalPropertyTypes-safe). contractBlock
   rendering untouched.
5. resolutionEngine.ts doc-door: extracted `requestFor(...)` (shared by both arms — the scalar leg is
   behavior-identical); new declared-field branch `contract.cardinality === 'many' && Array.isArray(raw)` ->
   one ResolutionRequest per entry, label = `entry[contract.itemNounField]` (blank/non-string entries skipped
   defensively; malformed entries are Ajv's job). ZERO verb/arg/domain NAME literals in engine or pass —
   verified: the only new string comparisons are `cardinality`/`itemNounField` FIELD reads off the contract.
6. parseScientistIntent: declared many-args ride through VERBATIM (membership from `argContracts(verb)`,
   not a key list) so the door sees the array.
7. liftScientistIntent: passthrough union `ALLOWED_PARAM_KEYS ∪ argContracts(canonical)` names — data-driven,
   no new key literal (spec step 4 preferred form).
8. normalizeScientistIntent: generic carry of declared many-args onto the candidate event (params passthrough
   wins when both forms present — Part I byte-honesty); blob-bar exemption now ALSO honors a declared
   action-level many-arg (no double-bar).
9. seedExpander: one-line `compositionSnapshotFromParams(params.composition, params.material)` reuse (OQ2) —
   the declared value is CONSUMED into the add_material event details.
10. material-system-rules.md Mixtures block: teaches `params.composition` AND the declared action-level
    `composition:` key (both valid during the transition).

## 7. Assumptions block

- The lane trunk gained only docs commits (233231a5) before my first commit; rebase was clean and file-disjoint.
- 'Equine Serum' chosen as the unseeded component name (shares no token with any seed) so spine substring
  matching can never produce a confounding ambiguous-noun bar (declaredArgumentReachability seed hygiene).
- The golden fixture seeds materials as `title`-only records (fixture-store idiom); the spine's tier-1 hit
  grounds them; 'Equine Serum' matches nothing -> the EXISTING unknown-noun arm (no invented reason code).
- The golden record was blessed from the replayKernel's own normalized output on FINAL tree content (never
  over pending wording); the one-shot generator script was deleted after use (not committed).
- Full-suite failing-file comm flaps (ZymoCampaignGoldenE2E / Wave2SemanticPassE2E) are the known load-timeout
  flap class: both green in isolation, headline failing-file COUNT identical (47) and Errors count identical (2,
  the pre-existing AgentOrchestrator.golden* unhandled-rejection debt).
- No live-stack proof attempted (:3093/:5193 untouched; vocabulary cache means a live proof would need the
  orchestrator's restart — not claimed).
- Server tsc baseline 0 preserved, not re-baselined. MANIFEST hash cited from measurement, never from the plan text.

## 8. Reviewer-bait self-audit (all 12 pre-empted)

1. Ordering: meta committed BEFORE data (5e5bde44 precedes the data commit); T7d proves the loader fail-loud.
2. exactOptionalPropertyTypes: conditional spreads only; server tsc 0.
3. Hardcode boundary: no `contract.name === 'composition'` or verb literal in engine/pass/normalize; T6 +
   pass-seam flip legs are the mutation counters.
4. YAML-reload: all proofs are headless per-process loads; no live-stack claim.
5. MANIFEST: blessed ONCE, in the same commit as the final wording, both treeState pins moved, named
   per-entry diff above, measured hash cited.
6. 422-naming-it: golden replays the REAL handler (422 body shape) AND asserts label == component name.
7. No partial mint: asserted through the FULL pipeline (cascade barrier) — events empty + write spies zero.
8. Part I byte-honesty: compositionDecomposition UNMODIFIED + green; params.composition documents untouched;
   blob-bar exemption fires for BOTH forms (T4).
9. Concrete-instance smuggling: T3 parse reject naming `/actions/0/composition/0`.
10. Prompt budget: contractBlock unchanged; material-rules +70 chars; ceiling asserted, never widened.
11. Silent drop on seed: seedExpander consumes the arg (T8b).
12. minItems 2 vs expander: wire rejects 1-entry action-level compositions; params slot unchanged; expander's
   >=2 drop untouched (existing pin green).

SHORTHAND-COMP-4 DONE 876c67ac (implementation tip; report commits e6924856 + follow-up on branch cl/COMP-4-lane2-l2t0910)
