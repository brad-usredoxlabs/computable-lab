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

---

# Fix run l2t2351-f1 (adversarial review CUE-EXEMPT-1-c1: VERDICT fix, D1 + D2)

Review read: `/home/brad/.hermes/cl/lanes/2/reviews/CUE-EXEMPT-1-c1-l2t2351.md`. Both MINOR defects fixed in ONE commit:

- `14c2cfc2` fix(cues): present-exempt-without-names throws + containment requires ratio-free labels (adversarial D1/D2)

Files touched (3, exactly the scoped files; `git -c core.fileMode=false show --stat 14c2cfc2`):

```
 config/drafting/mixture-material-cues.yaml         |  8 +++
 .../declaredArgumentReachability.test.ts           | 71 ++++++++++++++++++++++
 .../scientistIntent/normalizeScientistIntent.ts    | 48 +++++++++++----
 3 files changed, 114 insertions(+), 13 deletions(-)
```

## D1 — present `exempt:` without a `names:` key now throws naming the data path

`parseExemptNames` (normalizeScientistIntent.ts): the silent `names === undefined` fallthrough is split. A present object-shaped `exempt:` lacking the `names` KEY (`!('names' in section)`) throws:

```
mixture cue list (<path>): present `exempt:` section needs a `names:` list
```

Genuinely-absent stays the SILENT no-exemption case: no `exempt:` key, `exempt:` null (YAML empty value), and present-but-null `names:` all parse to "no exemption, property absent" (the `names: null` shape is kept silent deliberately — an explicit null is an intentional "no exemptions" declaration; only a missing key is a data error). Loader contract comment updated to state this.

New pins (loader-shape describe):
- `malformed exempt: (present object with NO names: key) throws naming the path (D1)` — fixture `exempt:\n  other: 1\n`, asserts the error message AND the data path in the message.
- `genuinely-absent exempt DATA stays SILENT: exempt: null and names: null parse to no exemption (D1 boundary)` — asserts `'exemptNames' in config === false` for both shapes.

## D2 — containment arm narrowed: exemption by containment requires a RATIO-FREE label (orchestrator-amended rule)

`isExemptMaterialLabel(label, exemptNames, ratioPatterns)` now takes the config's OWN `mixtureShape.ratioPatterns` (passed from `mixtureCuesFound` via `config.shape.ratioPatterns` — zero new literals, zero new patterns). Rule implemented:
- EQUALITY arm unchanged: a normalized label equal to an entry is exempt regardless of ratio.
- CONTAINMENT arm: first computes `hasRatioEvidence = ratioPatterns.some(p => p.test(normalizedLabel))` — ANY ratio/quantity match ANYWHERE in the label; when true, containment does NOT exempt.

Effect (matches the orchestrator ruling exactly):
- `DNase/RNase Free Water` (equality) and `Mix DNase/RNase Free Water Buffer` (ratio-free containment) stay EXEMPT.
- `DNase/RNase Free Water + Trypsin-EDTA/DMEM (50:50)` and `Mix DNase/RNase Free Water 50:50` (ratio present) BAR again — the reviewer's probe3 bars=0 cases are now bars=1.

New pins:
- `D2: a composite ratio blob embedding the exempt phrase BARS again (shipped config)` — both reviewer-named labels, 1 bar each.
- `D2: a ratio-free label carrying the exempt phrase as whole words still EXEMPTS` — `Mix DNase/RNase Free Water Buffer`, 0 bars.
- `D2: the ratio guard is DATA-driven (synthetic exempt entry, config ratioPatterns)` — synthetic `Alpha/Beta`: `Mix Alpha/Beta 50:50` bars, `Mix Alpha/Beta Buffer` exempts (proves the guard is generic, not shipped-name-specific).

YAML comment block: MATCHING RULE section gained a `RATIO GUARD (adversarial D2, orchestrator ruling)` paragraph stating the containment-requires-ratio-free rule, the DATA source (`mixtureShape.ratioPatterns`), and the four named example outcomes. `cues:` and `mixtureShape:` values remain untouched (comment-only YAML diff, +8 lines).

## RED (verbatim, new pins before the loader/matching fix)

`cd server && npx vitest run src/compiler/scientistIntent/` after adding the 5 new pins only:

```
 FAIL  ... > exemption loader shape (CUE-EXEMPT-1): ... > malformed `exempt:` (present object with NO `names:` key) throws naming the path (D1)
AssertionError: expected [Function] to throw error matching /present `exempt:` section needs a `names:` list/ but got null

 FAIL  ... > exemption loader shape (CUE-EXEMPT-1): ... > D2: a composite ratio blob embedding the exempt phrase BARS again (shipped config)
AssertionError: expected [] to have a length of 1 but got +0

 FAIL  ... > exemption loader shape (CUE-EXEMPT-1): ... > D2: the ratio guard is DATA-driven (synthetic exempt entry, config ratioPatterns)
AssertionError: expected [] to have a length of 1 but got +0

 Test Files  1 failed | 20 passed (21)
      Tests  3 failed | 237 passed (240)
   Duration  6.24s (transform 3.05s, setup 1ms, collect 26.84s, tests 8.89s, environment 5ms, prepare 13.83s)
```

3 genuine REDs (D1 x1, D2 x2); the 2 boundary/still-exempt pins were already green and stay green (they pin the behavior that must NOT change).

## GREEN (verbatim, after the fix commit)

`cd server && npx vitest run src/compiler/scientistIntent/` (raw tail lines spliced from the raw, leading space preserved):

```
 ✓ src/compiler/scientistIntent/declaredArgumentReachability.test.ts  (41 tests) 313ms

 Test Files  21 passed (21)
      Tests  240 passed (240)
   Start at  00:53:23
   Duration  3.88s (transform 2.11s, setup 1ms, collect 14.71s, tests 7.55s, environment 5ms, prepare 3.72s)
```

Targeted single file: `npx vitest run src/compiler/scientistIntent/declaredArgumentReachability.test.ts` → ` Test Files  1 passed (1)` / `      Tests  41 passed (41)` (36 → 41 = +5 new pins).

## Verification gates (fix commit 14c2cfc2)

| Check | Result | Gate |
|---|---|---|
| `cd server && npx vitest run src/compiler/scientistIntent/` | 21 files / 240 tests passed, exit 0 | all green, zero new failures (235 → 240 = +5 fix pins) |
| `cd server && npx tsc --noEmit` | exit 0 (TSC_EXIT=0) | zero errors |
| `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | `83fda3b42519eed879bc5e49290e724f727be509` | unchanged, no re-bless |
| `git -c core.fileMode=false status --porcelain --untracked-files=no` (post-commit) | empty | no tracked file outside the 3 scoped files touched |

Reviewer-bait re-check after the fix: bait 1 (blob pins `Trypsin-EDTA/DMEM (50:50)` / `50:50 Trypsin-EDTA/DMEM` still green, bars=1); bait 2 (no reagent literal in TS — the D2 guard reads `config.shape.ratioPatterns`, the new YAML text is comment-only); bait 5 (whole-word boundary pin `GammaAlpha/BetaDelta` still green); bait 6 (exactOptionalPropertyTypes: conditional spread untouched, tsc 0); bait 7 (MANIFEST byte-identical). The D2 fix strictly STRENGTHENS the bar (two former bars=0 labels now bar); no existing exemption pin weakened.

Assumption AS-F1-1: `names: null` (explicit null value) stays the silent no-exemption declaration; only a MISSING `names` key on a present object throws. The task text says "Keep genuinely-absent (no key / null) as the silent no-exemption case" — read as: absent section (no key / null section) stays silent, and an explicit null `names:` value is a declaration, not a typo; the typo class the review names (`name:` for `names:`) is a missing-key shape and throws.

