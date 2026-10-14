# ADVERSARIAL REVIEW — SHORTHAND-COMP-4 (Stage B) — lane 2 — cycle 1

- Item: SHORTHAND-COMP-4 — promote composition to a declared vocabulary arg (Stage B). Server/schema item (no UI, no browser gate).
- Worktree (READ-ONLY): /mnt/vast/home/brad/git/wt/COMP-4-lane2-l2t0910
- Branch: cl/COMP-4-lane2-l2t0910, tip aa13b0e0f09664fdd77df960ce250159f45e9f76 (implementation 876c67ac + report e6924856/aa13b0e0)
- Base used for diff: 233231a5 (coder's rebase point). Task base 7be527f4 verified as an ANCESTOR of HEAD.
- Spec read in full: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-14_0830-COMP4-stageB-vocabulary.md
- Full diff read: 20 files, +1157/-41, vs 233231a5 (commands below). No file in the diff went unread.
- Reviewer: cl-adversarial-reviewer (decorrelated model). Read-only: scratch probe written under server/src/, run, DELETED. HEAD unchanged, `git status --porcelain` empty, zero leftovers.

## Acceptance criteria (verbatim from the spec, §Acceptance criteria)

> Vocabulary lint + resolver tests: unresolvable component -> 422 naming it, no partial mint;
> resolvable mixture binds components AND bars atomically. Existing Part I goldens still pass.
> Files: schema/scientist-intent/scientist-intent-vocabulary.yaml (+ resolver/realization per plan).

## Base / drift note (separate from defects)

`git merge-base --is-ancestor 7be527f4 HEAD` -> true. The coder rebased onto trunk 233231a5 (a docs-only
lane checkpoint; its content is one handoff doc that appears in `7be527f4..HEAD` but NOT in
`233231a5..HEAD`). This is trunk drift, not a coder defect. Reviewed range = 233231a5..HEAD.

## 1. Command battery (my own runs, real output)

### 1a. Targeted suites (spec §Verification)
    cd server && npx --no-install vitest run src/compiler/resolution src/compiler/scientistIntent
    RESULT: Test Files 27 passed (27) / Tests 320 passed (320)  Duration 6.01s
    (resolution 6 files incl. compositionArgResolution 14, resolveNounsPass 20; scientistIntent 21 files.
     Matches the coder's 79/79 + 241/241 = 27 files / 320 tests.)

### 1b. Typecheck (from repo ROOT — `-w server` needs the workspace root)
    cd /mnt/vast/home/brad/git/wt/COMP-4-lane2-l2t0910 && npm run typecheck -w server
    RESULT: exit 0; grep -c "error TS" = 0  (== trunk baseline 0)

### 1c. Goldens + replay
    cd server && npx --no-install vitest run src/compiler/scientistIntent/goldens
    RESULT: 3 files, 16 passed (16)  -> includes golden.manifest.versions-current
    cd server && npx --no-install tsx scripts/golden-replay.ts
    RESULT: 37/37 checks passed, exit 0 (new 422 leg included)

### 1d. Part I / reachability / parity
    cd server && npx --no-install vitest run src/compiler/scientistIntent/declaredArgumentReachability.test.ts \
        src/compiler/scientistIntent/promptShapeParity.test.ts src/compiler/scientistIntent/compositionDecomposition.test.ts
    RESULT: 3 files; promptShapeParity 9, declaredArgumentReachability 41, compositionDecomposition 12; 62 passed

### 1e. promptBudget
    cd server && npx --no-install vitest run src/ai/promptBudget.test.ts
    RESULT: 6 passed (6); stdout: "draft prompt budget: 47090 chars (agent 24543 + material-rules 5500 +
    instruction 3061 + schema 13986) — ceiling 47180 (headroom 90)"
    CONFIRMED: 47090 <= 47180. material-system-rules.md teaches BOTH wire forms (OQ1): diff shows
    "carry EVERY component separately in the action's `params.composition` array (or the declared
    action-level `composition:` key — both are accepted), one entry per component".

### 1f. MANIFEST blob (measured myself)
    git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
    RESULT: fbf743ab1384778de43eeb113da0f0857eef9fce
    CONFIRMED == coder claim, and != old 83fda3b42519eed879bc5e49290e724f727be509.

### 1g. treeState + new-entry sha256 pins (sha256sum, my run)
    schema/scientist-intent/scientist-intent-vocabulary.yaml: 14d779ce050ee5fd306f2d3772efcaae6386b09cb9fef4e5c9ed8ed7b475f9b4
    schema/workflow/scientist-intent.schema.yaml:            cb54cbeded8c6cab7b31b89b68e9476b62d04c737dab4fb2a30a2a14167f09d5
    fixtures/unresolvable-mixture-component.yaml:            245603b100f927466cb7290656aa0056d489dbd180a1c0c67b8105c1136a3714
    __records__/unresolvable-mixture-component.golden.json:   4c5587f32e8f80786810a4e2581e9f121093b6c696353df6dbda1fdffea95cea
    All four match the MANIFEST entries (lines 33 / 60 / treeState block). CONFIRMED.

## 2. FILE-HEADER LAW — zero domain literals in the generic interpreter

    grep -nE "'(add_material|seed|composition|material)'|\"(add_material|seed|composition|material)\"" \
        server/src/compiler/resolution/resolutionEngine.ts server/src/compiler/resolution/resolveNounsPass.ts
    RESULT: NO-LITERALS-FOUND
    grep -n "composition" .../resolutionEngine.ts .../resolveNounsPass.ts  -> NO-composition

Every `cardinality`/`itemNounField` reference in resolutionEngine/normalize/parse is a FIELD read off the
declared contract (`contract.cardinality === 'many'`, `contract.itemNounField`), never a verb/arg/domain
name. ACKNOWLEDGED and CONFIRMED clean. resolveNounsPass.ts was NOT touched by the diff.

## 3. DATA rules (business rules in YAML, not TS)

- Meta-schema (scientist-intent-vocabulary.schema.yaml) gains GENERIC slots `cardinality: enum[one,many]`
  and `itemNounField: pattern ^[a-z][a-zA-Z0-9_]*$` in the arg-contract properties block (alongside `level`).
  Not composition-shaped; usable by any future many-arg.
- Wire schema (scientist-intent.schema.yaml) declares action-level `composition` with strict items
  (additionalProperties:false + unevaluatedProperties:false, required [material, role], role enum,
  minItems 2). Entry-shape policy lives in DATA. Concrete-instance rejection is by construction.
- Lint P5 `vocab-many-args-declare-item-noun-field` is a DATA rule (fires on the YAML, named by T7c).
- vocabulary.ts adds optional `cardinality?`/`itemNounField?` via conditional spreads (SPINE-8 idiom);
  contractBlock rendering untouched (T7b).
- liftScientistIntent.ts uses `vocab.argContracts(canonical)` union with ALLOWED_PARAM_KEYS (data-driven;
  the spec's preferred step-4 form — spec :168 note is the vocabulary *handle*; `vocab.has` at :137 is the
  pre-existing verb-detection, not the arg passthrough).

## 4. ACCEPTANCE ARMS — my own novel probes (NOT copies of T1-T8)

Probe file: server/src/compiler/resolution/zzz-advc-comp4-probe.test.ts (WRITTEN, RUN, DELETED).
    cd server && npx --no-install vitest run src/compiler/resolution/zzz-advc-comp4-probe.test.ts
    RESULT: 8 passed (8)

- (a/P1) TWO unresolvable components in one composition -> exactly 2 clarifications naming EACH
  ('Ghost Reagent A','Ghost Reagent B'), compiled.outcome 'needs-clarification', terminalArtifacts.events
  == [], store.create/update NEVER called (full cascade pipeline). ZERO partial mint.
- (P5) ordering: unresolvable FIRST entry is named (iterate order preserved).
- (b/P2) partial mixture (3 seeded + 1 unseeded): engine door binds exactly {DMEM,FBS,trypsin-EDTA} AND
  clarifies the unseeded one -> "binds AND bars atomically". (Full-pipeline zero-write proven by P1.)
- (c/P3) concrete-instance rejection by construction, 4 variants: nested-object material; extra key `id`
  inside an entry; missing `role`; single-entry (minItems:2). ALL -> ScientistIntentValidationError at
  parse (Ajv), never a 422, never a bind.
- (d) Part I goldens: compositionDecomposition.test.ts runs 12/12 and is UNMODIFIED (git diff empty).
- (e) clarification label = component name: golden body `{"label":"Equine Serum",...}` and my probes.
- (f) seed reuse: seedExpander.ts:70 is a ONE-line call to the SAME helper addMaterialExpander uses
  (`compositionSnapshotFromParams(params.composition, params.material)`); the details spread mirrors
  addMaterialExpander's, no parallel implementation.
- (g) declared-arg passthrough is data-driven (argContracts union), verified above.
- NEW GENERIC PROOF (P4, the anti-hardcode counter): I copied the triplet, added a NOVEL many-arg
  `wombat` (kind resolvable, cardinality many, itemNounField material, domain material) to add_material,
  and ran the engine door on an intent carrying `action.wombat` entries. Result: the door iterated
  `wombat` GENERICALLY — 2 bound by label, 1 clarified naming the component, actionLocation.argument
  == 'wombat'. This proves the engine is NOT composition-shaped and drives purely off declared data.

## 5. MANIFEST bless — per-entry verification

Diff of MANIFEST vs base shows exactly and only:
- treeState: vocabulary.yaml 014ca71f… -> 14d779ce… (matches my sha256sum); scientist-intent.schema.yaml
  bb5cc4d0… -> cb54cbed… (matches my sha256sum). Pipeline pin b47eee0c… UNCHANGED.
- fixtures: +1 entry golden.intent-to-clarification.unresolvable-mixture-component (sha256 verified).
- records: +1 entry same name (sha256 verified).
- reproduce: "15 tests" -> "16 tests".
No other fixture/record line re-blessed. CONFIRMED.

## 6. Unmodified-file + green checks

- compositionDecomposition.test.ts (455L): `git diff 233231a5..HEAD -- <file>` = EMPTY. CONFIRMED unmodified.
- declaredArgumentReachability 41 green; promptShapeParity 9 green; golden.manifest.versions-current green
  (goldens 16/16). CONFIRMED.
- Scope: `git diff --name-only 233231a5..HEAD` = 20 files (list below). No file touched outside the
  item's subject area; see Findings for the naming-set nuance.

## 7. exactOptionalPropertyTypes

Server tsc = 0 errors. New optional fields use conditional spreads only
(`...(typeof a.cardinality === 'string' ? { cardinality: a.cardinality as 'one' | 'many' } : {})`, etc.).
No `x: undefined` pattern in the diff. requestFor/parse/normalize all guard before assignment. CONFIRMED.

## 8. Over-claim hunt (every numbered coder-report claim)

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | RED-first ordering (4d580919 before impl) | CONFIRMED | git log order: RED -> meta 5e5bde44 -> data 876c67ac |
| 2 | target tests green (resolution 27 files/320 t) | CONFIRMED | §1a |
| 3 | typecheck 0 | CONFIRMED | §1b |
| 4 | goldens 16/16 + replay 37/37 | CONFIRMED | §1c |
| 5 | promptBudget 47090<=47180 | CONFIRMED | §1e |
| 6 | MANIFEST new blob fbf743ab… | CONFIRMED | §1f |
| 7 | per-entry before/after diff (2 treeState + 2 new) | CONFIRMED | §5 |
| 8 | compositionDecomposition UNMODIFIED | CONFIRMED | §6 |
| 9 | no partial mint (events empty, writes 0) | CONFIRMED | my P1/P2 probes + golden |
| 10 | zero verb/arg/domain literals in engine/pass | CONFIRMED | §2 |
| 11 | seed one-line reuse | CONFIRMED | §4(f) |
| 12 | baseline failing-file set equality (47==47, 2 flaps) | PARTIALLY VERIFIED | see below |
| 13 | "diff = 19 files" | REFUTED (cosmetic) | actual `--name-only` = 20 (incl. the report file itself) |

Claim 12: I did NOT re-run the pre-edit baseline (would require checking out base). I DID compare the
coder's raw artifacts: /tmp/comp4-baseline-failfiles.txt (47) vs /tmp/comp4-head-failfiles.txt (47);
`comm -3` shows EXACTLY two reversals — base-only ZymoCampaignGoldenE2E.test.ts and head-only
Wave2SemanticPassE2E.test.ts — the declared load-timeout flap class. NONE of the 47 failing files is in
this item's dirs (resolution/, scientistIntent/, goldens/, ai/promptBudget). My own independent head
re-run: "Test Files 91 failed | 623 passed | 9 skipped (723); Tests 98 failed | 5739 passed | 70 skipped
(6084); Errors 2" — same 723-file headline and same flap class, within the known run-to-run drift band
(coder head was 92/622). Set equality per se is UNVERIFIABLE from a single run; the flap-band honesty is
confirmed and no new failure is attributable to this item.

## 9. REGRESSION-CLAIM-REOPENED

None. The blob-bar control leg (mixture label with NO declared components still bars, Part III D1) is green
in the coder suite and compositionDecomposition (Part I byte-honesty) is unmodified and green. No
previously-closed W2/COMP class re-leaks in this diff.

## Findings (minor — none gate acceptance)

F1 (minor, scope-list nuance): The spec §Verification enumerates an allowed file set and says
'ANYTHING else = scope fail'. The coder additionally touched parseScientistIntent.ts,
goldens/goldenIntentToClarification.test.ts, golden-replay.ts, and vocabulary.test.ts, which are not in
that enumeration. Each is feature-intrinsic: parseScientistIntent's `normalizeDocument` whitelist DROPS
undeclared action keys (parseScientistIntent.ts:79-113), so without the declared-many carry the composition
array never survives parse and the feature cannot work; the golden test + replay-bar + lint-pin updates are
required to bless/pin the new fixture and rule. The spec's enumeration is incomplete, not the coder
overreaching. I did NOT treat this as a fix-gate; flagging it as the one place the diff exceeds the
literal allowed list.

F2 (minor, report accuracy): Report §5 says "diff --name-only = 19 files"; actual is 20 (the report file
itself is inside the range). Cosmetic.

F3 (minor/latent, spec-directed): The wire schema declares `composition` on the shared action `properties`
block, so it is valid on EVERY verb; a non-declaring verb (e.g. `transfer`) would Ajv-accept a
`composition` array and the engine/normalize would silently ignore it (the arg is not declared on that
verb). This matches the spec text ("Add `composition` to the action `properties`"), so it is not a
deviation — noting the latent wire-vs-declaration looseness for a future item.

F4 (minor/observation): compositionSnapshotFromParams still reads `entry.material` as a TS literal in the
biology expander (simpleVerbs.ts:375), while the resolver now reads the declared `itemNounField`. They are
consistent today (both 'material'); a future many-arg with a different itemNounField would need the
expander generalized. Spec OQ3 froze realization for Stage B, so this is out of scope, not a defect.

## Claim verification:

Targeted suites 27 files/320 tests green (reproduced); typecheck 0 (reproduced); goldens 16/16 + replay
37/37 (reproduced); promptBudget 47090<=47180 (reproduced); MANIFEST blob fbf743ab… + both treeState pins
+ both new-entry sha256 pins (reproduced by my own hash-object/sha256sum); compositionDecomposition
unmodified+green (reproduced); zero domain literals in the generic interpreter (reproduced by grep); my 8
novel adversarial arms all pass incl. the GENERIC novel-many-arg proof; coder full-suite failing-file flap
claim partially verified via the coder's raw artifacts (47==47, comm = 2 flap reversals, no item-dir file
failing), set-equality unverifiable from a single run. Only cosmetic/nuance findings (F1-F4); no
blocker/major defect.

VERDICT: accept
