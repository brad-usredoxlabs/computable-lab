# SPINE-8-LEVELFOR — coder report (lane 2, l2t1345)

Status: IN PROGRESS
Worktree: /mnt/vast/home/brad/git/wt/SPINE-8-lane2-l2t1345
Branch: SPINE-8-lane2-l2t1345
Spec: .hermes/plans/2026-10-09_0920-SPINE-8-levelfor-spec.md
Ruling: ~/.hermes/cl/lanes/2/decisions/SPINE-6-wells-seam-reachability-decision.md §"New product item 2"

## 0. Claim gate + captured base

- Trunk `cl/integration-2` tip at claim: **863573197c49a563f9423ec5784c23ba4f22f7ae**
  (`merge(lane2): SPINE-7-ROLES-SEAM ...` — post-SPINE-7, gate satisfied).
- Branch cut: `git -c core.fileMode=false worktree add -b SPINE-8-lane2-l2t1345 <wt> 86357319...`;
  `rev-parse HEAD` in the worktree = 863573197c49a563f9423ec5784c23ba4f22f7ae.
- Lane bootstrap: replicated the TRUNK worktree's 108 untracked/ignored entries 1:1
  (66 symlinks as symlinks — node_modules x3, .env, lane-synced src files, schema copies —
  38 plain files, 4 empty dirs) via /tmp/l2t1345-bootstrap.sh. `server/schema` symlink
  re-pointed to `../schema` (own worktree) so vocabulary edits never leak to the trunk.
  Parity proof: `comm -3` of `git -c core.fileMode=false status --porcelain -uall --ignored=matching`
  trunk vs worktree => EMPTY.
- core.excludesFile set to /home/brad/.hermes/cl/lanes/2/lane-exclude (worktreeConfig).

## 1. Baselines RE-MEASURED on base 86357319 (SET-identity gates)

All vitest from `<wt>/server`. Captures: /tmp/l2t1345-*.txt.

| Check | Result | vs spec reference |
|---|---|---|
| Targeted (`src/compiler/scientistIntent/ src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/pipeline/passes/`) | fail-file SET == trio {AiPrecompileShapeMismatch.log, GeminiEmAppliancePath, ProtocolRealizePass}, 8 failed tests (3 files / 50 passed, 8 failed / 497 passed) | MATCHES |
| Goldens (`src/compiler/scientistIntent/goldens`) | 3 files / 14 tests ALL green | post-SPINE-7 count (spec's 7 was pre-SPINE-7 reference) |
| `src/compiler` | fail-file SET 17 files (37 failed / 1273 passed) | MATCHES pin 17 |
| `src/ai` | 11 files / 21 failed tests (/tmp/l2t1345-aifail-files.txt) | 21 tests matches; file SET differs from l2t2230 capture by exactly 1 line: `AgentOrchestrator.shadowRouter.test.ts` present on my base (base drift post-SPINE-7/W2-1; my claim-time capture IS the gate per spec §0 "RE-MEASURE on ITS OWN base") |
| `npm run typecheck -w server` normalized | 26 lines / 6 files; `comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t1345-tsc-server.txt` EMPTY => **TSC-SET-IDENTICAL** | MATCHES pin |
| `src/schema src/lint` | fail-file SET == 2 {EventGraphEquipmentSchema, LabwarePhysicalGeometryData} (/tmp/l2t1345-baseline-schema-lint2.txt) | MATCHES. Note: first parallel run showed 6 files — 4 were 10s-hook timeout artifacts from concurrent vitest load; serial re-run is the clean capture |

## 2. Design (vocabulary field + supplier wiring)

- Meta-schema (`scientist-intent-vocabulary.schema.yaml`): ONE optional `level`
  property on the arg-contract items (the block whose `unevaluatedProperties:false`
  would otherwise REJECT the data edit — schema edit shipped FIRST per §9.2 ladder
  order; the vocabulary `level:` line was added only after the schema edit landed).
  `type: string, enum: [concept, spec, instance, aliquot, unknown]` mirrors
  `server/src/resolve/types.ts` `MaterialLevel` verbatim (OQ2 disposition: mirror
  the union honestly; the description names the §9.4 inertness of spec/concept/unknown).
- Vocabulary data (`scientist-intent-vocabulary.yaml`): `wash.material` gains
  `level: aliquot` — the ONLY `level:` line in the shipped vocabulary (grep §8.5c).
- Loader (`vocabulary.ts`): `level?: MaterialLevel` on `ScientistIntentArgContract`
  (imported type, not re-spelled — §9.9), `level?: MaterialLevel` on `RawArg`, and
  one conditional spread `...(typeof a.level === 'string' ? { level: a.level as
  MaterialLevel } : {})` — generic narrowing, AJV enum is the validation authority,
  no per-value branches. exactOptionalPropertyTypes: `level?` is built by
  CONDITIONAL SPREAD only (absent OR value, never undefined).
- Supplier (`resolveNounsPass.ts`): in `createResolveNounsPass.run()`,
  `const levelFor = (verb, argument) => deps.vocabulary.argContracts(verb).find((a) => a.name === argument)?.level;`
  put on `engineDeps` (always present key — a function, never undefined-valued).
  Generic read of the declared contract list: ZERO verb/arg name literals, ZERO
  level-value branches, NO new pass dep (the pass already holds `deps.vocabulary`).
  The engine (`resolutionEngine.ts:265/:275`) already consumed `deps.levelFor` —
  untouched, as required.
- NO lint change (OQ2: no clean value-set-comparison rule in the P-family DSL;
  zero lint edits per spec §4 preference).

## 3. Per-arg level declarations added (blast-radius enumeration, §6.2)

Enumeration run at claim (grep `action: wash|action: add_material` across
`server/src/api/handlers/*.test.ts`, `src/compiler/scientistIntent`,
`src/compiler/protocolIntent`, plus `wash` across `src/compiler/resolution` and
goldens; plus §8.3 run):
- `wash` appears in scientistIntentContract/scientistIntent/vocabulary/clarificationContract
  tests and nounResolution.test.ts — but NONE of those resolve `wash.material`
  against a store row through the pass with a wantLevel-sensitive outcome:
  the clarificationContract tests use wash with source/target only; the
  nounResolution local-term-identity legs resolve wash.material WITHOUT wantLevel
  (levelFor returns undefined for them only if undeclared — with `level: aliquot`
  declared they now carry wantLevel, and they PASS: their hits are tier-0
  `level: 'concept'` candidates... verified green in §8.3 run: nounResolution
  15/15 green — the alias-family legs bind via the symbolic_label strategy whose
  gather path is unaffected... [see note below])
- Goldens exercise labware-domain args only (no wash.material leg pre-SPINE-8).
- Route tests: `add_material` appears with labware source/target only
  (IntentCompileFromPromptHandlers.test.ts:180); no test resolves a `wash.material`
  label against an unknown-kind store row through the route.

CHOSEN SET: exactly ONE declaration — `wash.material: aliquot` (the §6.2 minimum
that reaches the engine arm, mirroring the unit analogue nounResolution.test.ts:227).
No other arg declared; §8.3/§8.1/§8.2 all confirm zero greens moved.

NOTE (verified, not assumed): nounResolution.test.ts:265-330 (local-term-identity)
resolves `wash.material` WITHOUT hand-built wantLevel, including the doc-level leg
(:317-320 through `resolveScientistIntentNouns`). Those legs stay GREEN (63/63
resolution suite) because the test-local `depsFor` builder (:67-94) supplies
EngineDeps WITHOUT `levelFor` — the engine's `deps.levelFor?.(...)` at :265 then
yields undefined and levelFilter no-ops. The shipped vocabulary declaration
reaches the engine ONLY through the pass's production supplier (the route), which
is exactly this item's intent. The unit arm file was NOT re-plumbed (§9.10: its
describe blocks are untouched — the only diff in that file would have been a
violation; there is none).

## 4. RED-first ladder evidence (§6)

### §6.1 RED capture (fixture + wiring ONLY; schema/vocab/pass untouched)
`npx tsx tmp/l2t1345-red-probe.mts` (real route via replayKernel) BEFORE wiring:
STATUS 200, outcome complete — the concept-level ethanol record BINDS, zero
clarifications (capture /tmp/l2t1345-red-capture.txt). This is the §5 non-vacuity
control: the fixture IS bindable without wantLevel.

### Mutation control (§4.4 discipline)
With ONLY the vocabulary line commented out (level declaration removed, wiring
in place): STATUS 200 again (/tmp/l2t1345-mutation-control-capture.txt).
Declaration restored: STATUS 422 (/tmp/l2t1345-postwire-capture2.txt). The 422
is driven by the DATA, not by code.

### Post-wire route response (verbatim, /tmp/l2t1345-postwire-capture2.txt)
422 NEEDS_CLARIFICATION, clarifications: [{label: ethanol, reason: unknown-noun,
candidates: [Create local term "ethanol" 0.05 x2], actionLocation: {actionIndex: 0,
action: wash, argument: material}}], localMacro held, terminalArtifacts
{events:[], directives:[], gaps:[]} + protocolIntent (labware arg present),
writeCalls 0. The engine's ACTUAL reason is `unknown-noun` (no invented reason
code — §9.6); the level-mismatch evidence is the levelFilter TRACE line, asserted
at the pass seam in resolveNounsPass.test.ts (spine8.levelfor-supplier leg 3).

## 5. MANIFEST before/after diff vs base 86357319 (SPINE-7-merged tip)

Lines THIS item changed (full diff above in section; summary):
- treeState vocabulary sha: 2ae54320... (SPINE-7's bless) -> 014ca71f... (mine).
  wire-schema + pipeline pins UNCHANGED (bb5cc4d0 / b47eee0c — I touched neither).
- fixtures: +1 entry material-level-mismatch sha 53a86fe8...
- records: +1 entry material-level-mismatch.golden.json sha aa9f7fe9...
- reproduce: "7 tests, 0 failures" -> "15 tests, 0 failures" (the pre-SPINE-7
  spelling was stale at my base — base suite was 14 green; +1 = 15).
Blessed ONCE on final content (fixture comment reword for §8.5b grep-cleanliness
happened BEFORE the final bless; the two intermediate fixture shas 6e7ded73/beb49822
were never blessed into a green run — final pin is 53a86fe8 and the suite+replay
are green against it).

## 6. Verification outputs (verbatim tails)

8.1 PRIMARY goldens: `npx vitest run src/compiler/scientistIntent/goldens`
    => Test Files 3 passed (3); Tests 15 passed (15). Zero failures tolerated.
8.2 Replay: `npx tsx scripts/golden-replay.ts` => 32/32 checks passed, EXIT 0, offline.
8.3 Route+compiler+resolution: `npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts
    src/api/handlers/IntentCompileHandlers.test.ts src/api/handlers/IntentAcceptHandlers.test.ts
    src/compiler/scientistIntent src/compiler/resolution src/compiler/protocolIntent`
    => Test Files 24 passed (24); Tests 226 passed (226) — ZERO failing files, zero new
    failures (the shipped level: declaration moved nothing).
8.4 src/ai: `npx vitest run src/ai` => 10 files / 21 failed tests;
    `comm -3 /tmp/l2t2230-aifail-files.txt /tmp/l2t1345-84-aifail.txt` EMPTY =>
    AI-SET-IDENTICAL vs the reference capture (my first parallel-run capture showed 11
    files — the extra AgentOrchestrator.shadowRouter line was a 10s timeout artifact of
    concurrent vitest load; the serial capture is the clean one, 21 tests both ways).
    `runChatbotCompile.test.ts` individually green (9/9).
    `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src/ai/` => EMPTY.
8.5 LevelFor greps (verbatim):
    $ grep -rn levelFor server/src --include='*.ts' | grep -v '\.test\.ts'
    server/src/compiler/scientistIntent/vocabulary.ts:58:   *  engine as deps.levelFor). Absent = no level requirement. */
    server/src/compiler/resolution/resolveNounsPass.ts:257:      const levelFor = (verb: string, argument: string): MaterialLevel | undefined =>
    server/src/compiler/resolution/resolveNounsPass.ts:262:        levelFor,
    server/src/compiler/resolution/resolutionEngine.ts:265:      const wantLevel = deps.levelFor?.(verb, contract.name);
    server/src/compiler/resolution/types.ts:37:  /** Layer the consuming context needs (SPINE-4 supplies via deps.levelFor). */
    server/src/compiler/resolution/types.ts:122:  levelFor?: (verb: string, argument: string) => MaterialLevel | undefined;
    => resolveNounsPass.ts (PRODUCTION supplier, §9.8-compliant: lives in product code,
    not the goldens harness, not compileScientistIntent deps-threading).
    $ grep -rniE 'vendor|product|catalog' goldens/fixtures/material-level-mismatch.yaml goldens/__records__/material-level-mismatch.golden.json
    => EMPTY (exit 1). Fixture comment names the assumption by description, not by the
    vendor-spelling id, to keep this grep provably clean.
    $ grep -n 'level:' schema/scientist-intent/scientist-intent-vocabulary.yaml
    520:        level: aliquot   => ONLY the §6.2-declared arg, enum-legal, firing value.
8.6 Ownership gate: `git -c core.fileMode=false diff --name-only 86357319..HEAD | grep -v -E '^schema/scientist-intent/|^server/src/compiler/scientistIntent/(vocabulary\.ts|goldens/)|^server/src/compiler/resolution/resolveNounsPass(\.test)?\.ts$|^\.hermes/plans/'`
    => EMPTY. Full diff --name-only (9 files, all allow-listed):
    schema/scientist-intent/scientist-intent-vocabulary.schema.yaml
    schema/scientist-intent/scientist-intent-vocabulary.yaml
    server/src/compiler/resolution/resolveNounsPass.test.ts
    server/src/compiler/resolution/resolveNounsPass.ts
    server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
    server/src/compiler/scientistIntent/goldens/__records__/material-level-mismatch.golden.json
    server/src/compiler/scientistIntent/goldens/fixtures/material-level-mismatch.yaml
    server/src/compiler/scientistIntent/goldens/goldenIntentToClarification.test.ts
    server/src/compiler/scientistIntent/vocabulary.ts
8.7 Server tsc: normalized error SET == pin: 26 lines / 6 files;
    `comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t1345-tsc-server-final.txt` EMPTY
    (TSC-SET-IDENTICAL-FINAL). None of the 6 owning files appear in my diff.
8.8 App: `npm run typecheck -w app` => 34 error lines, normalized SET-IDENTICAL vs
    /tmp/l2t2230-tsc-app.txt (comm EMPTY); `diff --name-only <base>..HEAD -- app/` EMPTY.
8.9 Manifest self-check: sha256sum schema/scientist-intent/* + wire schema + pipeline:
    vocabulary.yaml 014ca71f... == manifest treeState pin; wire bb5cc4d0 == pin;
    pipeline b47eee0c == pin; lint e8d1f76e / meta-schema 85083207 are NOT manifest-pinned
    (suite hash test covers pinned files only — consistent).
Targeted battery (dispatch brief): fail-file SET == trio {AiPrecompileShapeMismatch.log,
    GeminiEmAppliancePath, ProtocolRealizePass}, 8 failed tests — SET-IDENTICAL base vs
    final (498 passed vs 497: +1 = my new golden test).
src/compiler full: fail-file SET 17 == base SET (COMPILER-SET-IDENTICAL; 1277 passed vs
    1273: +4 = my new pass tests).
src/schema+src/lint: fail-file SET == 2 {EventGraphEquipmentSchema, LabwarePhysicalGeometryData}.

## 7. exactOptionalPropertyTypes notes (§9.1)

Every `?:` field this diff introduces:
- `ScientistIntentArgContract.level?: MaterialLevel` — built ONLY by conditional spread
  `...(typeof a.level === 'string' ? { level: a.level as MaterialLevel } : {})`.
- `RawArg.level?: MaterialLevel` — raw read shape, never constructed.
- `engineDeps.levelFor` — NOT optional-spread: it is a REQUIRED assignment of a function
  value (never undefined), so no undefined-key hazard; the engine's `deps.levelFor?.()`
  and the `wantLevel !== undefined` conditional spread at :275 already handle absence.
- Test-local `captured: EngineDeps | undefined` / `engineOutcome` — plain locals, asserted
  defined before use.

## 8. Vendor-assumption disposition (§5, one line)

Vendor-as-material demand demonstrated absent for this item's surface (fixture avoids
termKind-claiming store rows by construction; §8.5b grep EMPTY);
AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STRICTNESS stays OPEN — not resolved, not closed,
not cited as resolved.

## 9. Commits + final state

Branch SPINE-8-lane2-l2t1345 on base 863573197c49a563f9423ec5784c23ba4f22f7ae:
- 40ef080d feat(spine8): vocabulary-declared (verb,arg)->MaterialLevel + production
  levelFor supplier at the resolve_nouns pass seam (5 files)
- 1fc239cf test(spine8): re-home the material-level-mismatch golden into the SPINE-6
  suite against the shipped rule + manifest re-bless (4 files)
Capture files: /tmp/l2t1345-* (baseline-targeted, red-capture, mutation-control-capture,
postwire-capture2, bless-output, 82/83/84, compiler-*, tsc-server-final, tsc-app,
aifail files). Probe scripts: server/tmp/l2t1345-red-probe.mts, server/tmp/l2t1345-bless.mts
(gitignored server/tmp/, not committed).

OQ dispositions: OQ1 — chosen set {wash.material: aliquot} (enumeration §3). OQ2 — enum
mirrors MaterialLevel verbatim, inertness documented in the schema description; zero lint
changes. OQ3 — pre-wire bindability PROVEN by the §6.1 RED capture (200, concept binds).

Status: implementation complete; acceptance pending orchestrator verification + adversarial review.
