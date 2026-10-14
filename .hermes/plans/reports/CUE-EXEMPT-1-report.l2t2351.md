# CUE-EXEMPT-1 — coder report (lane 2, l2t2351)

Branch: `cl/CUE-EXEMPT-1-lane2-l2t2351`
Worktree: `/mnt/vast/home/brad/git/wt/CUE-EXEMPT-1-lane2-l2t2351`
Branch point: `fd1e496e` (cl/integration-2 tip at dispatch)
Commits:
- C1 `59eded69` test(cues): RED — catalogued single reagent 'DNase/RNase Free Water' false-bars on the flanking arm
- C2 `0980fc6c` feat(cues): declarative non-component exemption — exempt names are DATA, loader reads it generically
- C3 (this report)

Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-13_2355-CUE-EXEMPT-1-spec.md`
Architect grounding: `~/.hermes/cl/lanes/2/decisions/W211-D4-noun-drift-fixture-decision-l2t2150.md` ("The two fact classes" — unrealized-mixture-blob-material is a real product-side false bar; fix is DATA + pin, not an answer surface).

## What was built

1. **`config/drafting/mixture-material-cues.yaml`** — added a top-level OPTIONAL `exempt:` section with a `names:` list, seeded with `"DNase/RNase Free Water"`. The matching rule is documented in the YAML comment: case-folded + whitespace-normalized EQUALS an entry, or a whole-word-run containment (the entry's first/last characters may not sit inside a longer word; word chars = letters/digits/hyphens, the same alphabet the flanking arm treats as component words). Entries are names, not regexes. **Zero lines changed in `cues:` or `mixtureShape:`** — the diff of the YAML is pure addition (0 removed lines, verified: `git diff fd1e496e..HEAD -- config/drafting/mixture-material-cues.yaml | grep -c '^-'` after header markers = 0).

2. **`server/src/compiler/scientistIntent/normalizeScientistIntent.ts`** — one generic reader arm, zero domain literals:
   - `MixtureCueConfig.exemptNames?: readonly string[]` (optional; absent section ⇒ property ABSENT via conditional spread, never `undefined` — exactOptionalPropertyTypes-safe).
   - `parseExemptNames(raw, path)`: absent/null section ⇒ `undefined`, SILENT (the LOUD cue-off rule for `cues:` is untouched); malformed section throws naming the data path, parity with existing loader errors (`mixture cue list (${path}): ...`).
   - `isExemptMaterialLabel(label, exemptNames)`: generic equality-or-whole-word-containment over DATA entries; entries are matched by normalized substring + word-boundary character checks (no regex built from entries; entries are names, not regexes).
   - `mixtureCuesFound` checks the exemption BEFORE any cue fires, so it suppresses every firing arm generically. A label matching an exempt name returns `[]` cues ⇒ the blob bar at the producer site never fires for it.
   - Verified: `grep -in "DNase|RNase|water"` over the .ts diff = **no hits** (reviewer bait 2 clean); `grep -in "spawn|line-dsl|shorthand"` over the loader = clean (bait-11 header scan).

3. **`server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts`** (the spec's "declaredArgument-reachability.test.ts" is this file — camelCase on disk) —
   - SEED_RECORDS gained `MAT-catalogued-single-1` named exactly `DNase/RNase Free Water` (seed idiom of MAT-blob-1: the bar under test is the PRODUCER arm, not resolve_nouns).
   - GUARD-OFF pin added INSIDE the existing fix1/D1 describe `mixture-blob bar SHAPE` (:228): normalize + full-pipeline compile of `material: DNase/RNase Free Water` with NO `unrealized-mixture-blob-material` clarification, outcome `complete`.
   - New describe `exemption loader shape (CUE-EXEMPT-1)` with 6 pins: shipped file parses the exempt list; absent `exempt:` ⇒ property absent + zero warns + blob AND the exempt label both still bar (byte-identical behavior); malformed `names: 42` throws naming `exempt.names` + the data path; malformed bare-list `exempt:` throws naming the path; whole-word boundary pin (synthetic test-local entry `Alpha/Beta` does NOT exempt `GammaAlpha/BetaDelta (50:50)` — bait 6 — but DOES exempt `Mix Alpha/Beta Buffer` at word boundaries); shipped exemption names nothing blob-like (blob pins stay green).

## RED (verbatim, before data+loader change)

`cd server && npx vitest run src/compiler/scientistIntent/declaredArgumentReachability.test.ts` at commit 59eded69:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/scientistIntent/declaredArgumentReachability.test.ts > mixture-blob bar SHAPE (fix1/D1): bare separators do not false-bar real single reagents > GUARD-OFF (CUE-EXEMPT-1): the catalogued single reagent "DNase/RNase Free Water" compiles with NO blob clarification
AssertionError: expected [ { …(4) } ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   Object {
+     "actionLocation": Object {
+       "action": "add_material",
+       "actionIndex": 0,
+       "argument": "material",
+     },
+     "label": "DNase/RNase Free Water",
+     "message": "The material \"DNase/RNase Free Water\" names a recipe, not a component (mixture cues found: \"/\"). A bare concept in a well is never right — materialize it: declare the components (params.composition) or name a single material; a composition becomes a formulation (material-spec).",
+     "reason": "unrealized-mixture-blob-material",
+   },
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 29 passed (30)
   Duration  2.28s (transform 336ms, setup 0ms, collect 1.28s, tests 73ms, environment 0ms, prepare 244ms)
```

The RED failure names cue `"/"` — exactly the measured flanking-arm false bar (DNase + RNase satisfy minComponents=2).

## GREEN (verbatim, after C2)

`cd server && npx vitest run src/compiler/scientistIntent/`:

```
 ✓ src/compiler/scientistIntent/declaredArgumentReachability.test.ts  (36 tests) 229ms

 Test Files  21 passed (21)
      Tests  235 passed (235)
   Duration  9.97s (transform 3.17s, setup 1ms, collect 33.16s, tests 13.36s, environment 6ms, prepare 10.67s)
```

Other consumer of the blob reason code outside the suite (`src/ai/shorthandChat.e2eStubHonesty.test.ts`): `Test Files 1 passed (1) / Tests 6 passed (6)`.

## Baselines (branch point fd1e496e vs head 0980fc6c)

| Check | Branch point | Head | Gate |
|---|---|---|---|
| `cd server && npx tsc --noEmit` | 0 error lines (exit 0) | 0 error lines (exit 0) | zero new |
| `npx vitest run src/compiler/scientistIntent/` | 21 files / 228 tests passed | 21 files / 235 tests passed | +7 new pins, zero new failures |
| `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | `83fda3b42519eed879bc5e49290e724f727be509` | `83fda3b42519eed879bc5e49290e724f727be509` | byte-identical, no re-bless |

Raw vitest tail lines (spliced from the raws, leading-space preserved):
- branch point: ` Test Files  21 passed (21)` / `      Tests  228 passed (228)`
- head: ` Test Files  21 passed (21)` / `      Tests  235 passed (235)`

## diff --name-only vs branch point (must equal the 3 scoped files)

```
config/drafting/mixture-material-cues.yaml
server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts
server/src/compiler/scientistIntent/normalizeScientistIntent.ts
```

Exactly the 3 files in §Scope. No schema/** edits, no golden fixture edits, no cue/mixtureShape value edits, no answer-surface work.

## Reviewer-bait self-audit

1. Bar weakened for real blobs? No — `cues:`/`mixtureShape:` diff is 0 removed lines; blob pins (`Trypsin-EDTA/DMEM (50:50)`, `50:50 Trypsin-EDTA/DMEM`) still green; new pin asserts the shipped exempt list names nothing blob-like.
2. TS literal naming a reagent? No — grep of the loader diff for DNase/RNase/water: no hits. All names live in the YAML.
3. Absent-`exempt:` behavior changed? No — pin proves: property absent, zero warns, blob still bars, and even the exempt label still bars when the section is removed (the exemption is purely additive; the LOUD cue-off rule for `cues:` is untouched).
4. exactOptionalPropertyTypes? `exemptNames` is added only via conditional spread `...(exemptNames !== undefined ? { exemptNames } : {})`; never assigned `undefined`. tsc 0 at head with `exactOptionalPropertyTypes: true` (server/tsconfig.json:13).
5. Golden drift / re-bless? MANIFEST hash byte-identical branch-point vs head.
6. Sloppy word-boundary matching? Pinned: exempt entry `Alpha/Beta` does NOT match inside `GammaAlpha/BetaDelta` (word chars on both sides — blob still bars); it DOES match at word boundaries (`Mix Alpha/Beta Buffer`). Boundary alphabet (letters/digits/hyphen) matches the flanking arm's own component-word alphabet.

## Lane-setup repairs (lane infrastructure, NOT committed — outside the 3-file diff)

Fresh lane worktrees on this NFS checkout lacked the exclude materialization (known pitfall). Repaired read-only from trunk before baselining:
- Recreated 62 symlinks matching `/mnt/vast/home/brad/git/cl-integration-2` (`server/node_modules -> computable-lab/server/node_modules`, 43 `server/src/**` file symlinks, `app/**` symlinks); `server/schema` recreated as relative `../schema` (prior-lane convention, resolves to this worktree's own schema copy).
- Copied 3 trunk-UNTRACKED schema files that never materialize in new worktrees: `schema/core/datatypes/revision-ref.schema.yaml`, `schema/registry/labware-definitions/80x2ml-tube-rack.yaml`, `schema/registry/tube-sizes/tube-size-presets.v1.yaml`.
These are untracked lane scaffolding; `git status` shows only `?? app/node_modules` (plus the copied schema files, untracked by trunk definition). No tracked file outside the 3 was touched.

## Assumptions

- AS-CUE-EXEMPT-1-1: the spec's test filename `declaredArgument-reachability.test.ts` is the on-disk `declaredArgumentReachability.test.ts` (camelCase); the fix1/D1 describe at :228 matches the spec's description exactly.
- AS-CUE-EXEMPT-1-2: exemption is checked inside `mixtureCuesFound` (before any cue fires) rather than at the :621 bar site — the single generic choke point; the loader is the only consumer, so the exemption suppresses all firing arms without touching the bar's gating logic (declaresComponents exemption unchanged).
- The generic-exemption design worked as specified: no domain literal was needed anywhere in TypeScript. No STOP condition triggered.

## Unresolved / for the orchestrator

- Nothing blocking. The D4 fixture rewrite (harness-owned, orch-executed per the architect ruling) is independent of this change; with the exemption merged, the W2-11 prompt could in principle name the catalogued label directly, but the ruling's synonym routing stands — not my call.
- Orchestrator verification: rerun `cd server && npx tsc --noEmit` and `npx vitest run src/compiler/scientistIntent/` in the worktree; MANIFEST hash above; `git -c core.fileMode=false diff --name-only fd1e496e..HEAD`.
