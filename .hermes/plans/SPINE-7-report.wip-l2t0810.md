# SPINE-7-ROLES-SEAM — WIP report (l2t0810)

Worktree: /mnt/vast/home/brad/git/wt/SPINE-7-lane2-l2t0810
Branch: SPINE-7-lane2-l2t0810 (base 24b43bca)
Spec: .hermes/plans/2026-10-09_0820-SPINE-7-roles-seam-spec.md
Ruling: ~/.hermes/cl/lanes/2/decisions/SPINE-6-wells-seam-reachability-decision.md (item "New product item 1")

## Bootstrap (lane convention)

Trunk untracked/ignored entries replicated 1:1 (symlinks as symlinks):
`bash /tmp/l2t0810-bootstrap.sh` -> linked=66 copied=34 dirs=4 skipped=0 missing=0.
Parity proof: comm -3 of `git -c core.fileMode=false status --porcelain -uall --ignored=matching`
(trunk vs worktree) -> EMPTY (104/104 paths).

## Pre-implementation probes (RED evidence, before any product edit)

`server/tmp/l2t0810-probe.mts` (git-ignored tmp, npx tsx):

- PROBE1 (wire door): scalar `targetWells: control_well` REJECTED by the current schema:
  `scientist-intent failed schema validation: 1 error(s) [{"path":"/actions/0/targetWells","message":"Expected type: array"}]`
- PROBE2 (engine scalar arm, parse bypassed): hand doc with `targetWells: 'control_well'` through the REAL
  resolve_nouns pass + store-backed spine: blocked=false, resolvedByLabel keys
  ['source plate','destination plate','control_well']; entry
  `{"verb":"transfer","argument":"targetWells","label":"control_well","recordId":"well:A12","resolvedLabel":"A12","addresses":["A12"],"actionIndex":0}`
  -> the EXISTING scalar arm + LABEL keying (resolveNounsPass.ts:268-281) work once the wire carries the string.
- PROBE3 (strategy audit): shipped transfer wells contracts carry NO hintEligible -> for kind:wells only
  explicit_wells applies; the engine's wells binding source IS defaultRoleResolver(label, {landscape,96-well-plate}).
  defaultRoleResolver('control_well')=['A12'], ('A1')=[], ('source plate')=[].
  CONSEQUENCE for leg 2: the only production-reachable engine wells binding is single-address
  (multi-candidate clarifies at resolve_nouns), and for control_well the fallback default is the SAME
  ['A12']. The ruling's "provably different defaults OR spy/mirror pin" therefore lands on the
  PIN arm: the test pins (a) emitted wells == the real engine slot's addresses, (b) the emitted event
  carries NO `wells` array (the scalar never reaches event details as addresses), (c) the fallback
  defaultRoleResolver(role, ctx) value is pinned separately, and (d) mutation legs kill the
  authoritative path (role-carrying producer removed -> pass-through; slot key mismatch -> fallback).

## Baselines (measured at base 24b43bca in this worktree)

- Targeted suite `vitest run src/compiler/scientistIntent/ src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/pipeline/passes/`:
  3 failed files / 8 failed tests, 47 passed files / 467 passed tests. Fail files:
  AiPrecompileShapeMismatch.log.test.ts, GeminiEmAppliancePath.test.ts, ProtocolRealizePass.test.ts (pre-existing).
- `vitest run src/compiler` fail-file SET: 17 files -> /tmp/l2t0810-baseline-compiler-failfiles.txt (matches the 17-file figure).
- `vitest run src/ai`: 21 failed tests (fail-file list captured; spec pin 10/21 -> 21 tests figure).
- server tsc pin: /tmp/l2t2230-tsc-server.txt sha256 924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41 (26 err-lines/6 files).

## Design decisions (assumptions recorded)

1. SCHEMA: widen `sourceWells`/`targetWells` to `oneOf: [array-of-string, string(minLength 1)]` on the
   existing fields (array branch byte-stable; every currently-valid doc stays valid).
2. NORMALIZE: parse layer (`normalizeDocument` in parseScientistIntent.ts) canonicalizes the scalar form
   (trimmed string kept; arrays unchanged) -> BOTH the engine door (fields[contract.name] string) and the
   lowering chain see the normalized form. liftAction already passes the scalar through untouched.
   ZERO new branches in resolutionEngine.ts.
3. ROLE-CARRYING LOWERING: normalizeScientistIntent (scientist-intent chain only) loops the vocabulary's
   DECLARED argContracts(verb) (data, no verb table); for a kind:wells contract whose value is a scalar
   string it sets candidate-event `role: <label>` and does NOT map the scalar into the expander's array
   wells params. The transfer expander carries `role` into event details (conditional spread).
   details.role == engine-bound label == resolvedByLabel key.
   Chatbot chain: no resolve_nouns pass (slot absent) AND no chatbot producer emits candidate `role`
   -> byte-identical; pinned by a dedicated regression test.
4. VOCABULARY: `transfer.targetWells` -> `required: true` (shipped data). Lint P3 only forbids
   required RESOLVABLE args on pattern verbs -> compliant. transfer is the only non-pattern verb whose
   expander consumes targetWells (aliquot's expander reads target_wells only; pattern verbs route to
   ProtocolPatternIntents where wells stay optional). Sweep fires on the resolve_nouns 422 arm
   (requiredArgumentClarifications -> reconcile -> UNRESOLVED_ARGUMENTS_CODE bar), never the 500 arm.

## Status

- [x] bootstrap + parity
- [x] probes
- [x] baselines
- [ ] leg 1 RED->GREEN
- [ ] leg 2 RED->GREEN (D4 clearance: AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE)
- [ ] leg 3 RED->GREEN
- [ ] chatbot byte-identity regression
- [ ] manifest re-bless (once, final tip)
