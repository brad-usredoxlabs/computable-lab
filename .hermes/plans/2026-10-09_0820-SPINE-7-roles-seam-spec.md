# SPINE-7-ROLES-SEAM — spec (lane 2)

Date: 2026-10-09T08:30 EDT (orch l2t0810). Coder: cl-coder. Worktree
`/mnt/vast/home/brad/git/wt/SPINE-7-lane2-l2t0810`, branch `SPINE-7-lane2-l2t0810`,
base trunk `cl/integration-2` @ 24b43bca (code tip e830cffb).
Approved by Brad 2026-10-09 (packet BRAD-PACKET-spine7-spine8-amendment-20261009.md,
VERDICT: APPROVE BOTH). Ruling (binding acceptance shape):
`/home/brad/.hermes/cl/lanes/2/decisions/SPINE-6-wells-seam-reachability-decision.md`
(item "New product item 1 — SPINE-7-ROLES-SEAM", acceptance items 1–4).

## Goal

Make the chain "wells label on the wire -> SPINE-3 engine binding -> role-carrying
lowered event -> resolve_roles AUTHORITATIVE wells" production-reachable through the
real POST /intent/compile-from-prompt route. R1+R2 are ONE contract: landing half
ships a known-dead arm.

## Verified trunk facts (orch, first-hand at 24b43bca — do not re-derive)

- `schema/workflow/scientist-intent.schema.yaml` :88-100 — `sourceWells`/`targetWells`
  are `type: array, items: string`. A schema-valid doc can never present a scalar label.
- `server/src/compiler/resolution/resolutionEngine.ts` :240-277 — arg loop over
  `vocab.argContracts(verb)` for `kind: resolvable|wells`; :244
  `if (typeof raw !== 'string' || raw.trim().length === 0) continue;` — the doc-level
  door SKIPS arrays. The scalar arm (existing label/hint/adapter machinery) is what a
  label must reach — reuse it, ZERO new branch logic in this file.
- `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts` :2383 —
  `const nounBindings = authoritativeNounSlot(state)?.resolvedByLabel;`; :2410-2413 —
  `const authoritativeWells = nounBindings?.[role]?.addresses;` fallback
  `defaultRoleResolver(role, ctx)`. Comment :2378-2382 promises: slot absent (chatbot
  pipeline) => today's code runs byte-identically. MUST be preserved (chatbot regression
  test required).
- CRITICAL KEYING CONTRACT (orch find, ruling does not spell it out):
  `resolvedByLabel` is keyed by the engine's bound LABEL
  (`resolveNounsPass.ts:268-281`, `resolvedByLabel[binding.label] = entry`; entry
  carries `recordId`, `addresses?`, `actionIndex?`). The :2410 consumer indexes by
  `details.role`. Therefore the producer MUST set `details.role` to the engine-bound
  label of the well-carrying argument — role-string == label-string is what makes the
  authoritative branch live. Design the golden with ONE action per label to avoid the
  cross-action label-ambiguity (entry carries actionIndex; the lookup does not use it —
  pin today's lookup semantics, do not "fix" it).
- Lowering chain (scout-screened, orch-verified):
  `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` —
  `toCandidateEvent` (~:110-150) maps action fields onto candidate event details via the
  `mappings` table; `['source_wells', ['sourceWells']]` and
  `['wells', ['targetWells', 'wells']]` (~:137-140) — arrays pass through verbatim.
  Geometric macros go to ProtocolPatternIntents (PATTERN_ACTIONS derived from vocab
  YAML class field — do not hardcode a verb set).
- `server/src/compiler/scientistIntent/compileScientistIntent.ts` — pipeline assembly,
  `createExpandBiologyVerbsPass` registered there; the resolve_nouns pass builds
  `engineDeps` WITHOUT `levelFor` (`resolution/resolveNounsPass.ts:250-254`) — that is
  SPINE-8's job, NOT yours. Stay in your lane.
- Vocabulary: `schema/scientist-intent/scientist-intent-vocabulary.yaml` — all 12
  `kind: wells` contracts are `required: false`; `required: true` occurs only at
  :675/:678 (serial_dilution factor/points quantity args). Arg-contract metadata is
  read by `server/src/compiler/scientistIntent/vocabulary.ts` (`buildVocabulary` ~:114,
  entries map :168-186) and the engine loop above.
- Route: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (:154
  `createResolveSpineFromContext({ store })`), NEVER threads a vocabulary dep —
  fixture-vocab injection is NOT available on the real route (ruling D-EXTRA-1). Your
  required-address leg therefore MUST go in as SHIPPED vocabulary data.
- Goldens home: `server/src/compiler/scientistIntent/goldens/` (goldenIntentToGraph.
  test.ts, goldenIntentToClarification.test.ts, fixtures/, `MANIFEST.yaml` pins rule
  files by sha256 via replayKernel.ts).
- serial_dilution-quantity-to-500 TRAP: the required-argument sweep
  (`requiredArgumentClarifications`, resolveNounsPass.ts:262 region) must fire as a 422
  NEEDS_CLARIFICATION arm — a 500 through this path is exactly the failure this item's
  leg 3 must not repeat.

## Scope (each edit declared here; nothing else)

1. SCHEMA (data): `schema/workflow/scientist-intent.schema.yaml` — widen the wells
   fields so a scalar-label form is schema-valid. Shape choice is yours (oneOf
   [array,string] on the existing field vs a separately-declared label field), but the
   shape MUST be data-declared and must keep every currently-valid document valid
   (byte-stable for array payloads).
2. NORMALIZATION (parse layer, no engine branches): normalize the scalar form into the
   engine's EXISTING scalar-label contract arm — i.e. the value reaching
   `fields[contract.name]` at resolutionEngine.ts :243 must be the trimmed string.
   Preferred site: the scientist-intent parse/normalize layer
   (`liftScientistIntent.ts` or `normalizeScientistIntent.ts` / parse path — the
   document the ENGINE consumes, whichever point guarantees BOTH the route and the
   goldens see the normalized form). ZERO new TS branch logic in resolutionEngine.ts.
3. ROLE-CARRYING LOWERING: a producer on the scientist-intent lowering chain carries
   the well role/label into event `details` so `details.role` at
   ChatbotCompilePasses.ts :2390 is the engine-bound label for that argument (see the
   KEYING CONTRACT). Producer must run on the scientist-intent chain only; chatbot
   chain behavior byte-identical (slot absent or role absent — pick whichever your
   design yields and PIN it with the regression test).
4. VOCABULARY (data): declare a required address arg in the SHIPPED vocabulary so the
   `MISSING_REQUIRED_ARGUMENT_REASON` sweep is route-reachable (choose the verb/arg
   consistent with the ruling; if `required: true` support is limited to certain kinds,
   extend the vocabulary schema, not code branches).

## Acceptance (verbatim obligations from the ruling)

(1) ROUTE-REACHABILITY: a schema-valid document carrying a scalar wells label compiles
    through the real route (parse REAL, no vi.mock) and the resolve_nouns slot shows
    the engine binding (addresses/recordId) for it.
(2) D4 CLEARANCE: a route golden binds a role whose single-well address comes from the
    real engine; emitted event wells EQUAL the engine binding's addresses AND DIFFER
    from what `defaultRoleResolver(role, ctx)` would return (provably-different defaults
    or spy/mirror pin proving the authoritative branch, not the fallback); mutation-
    proved per SPINE-6 §4.4 discipline. `AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE` closes
    ONLY on this test — name it in the report.
(3) MISSING-ADDRESS LEG: with the shipped vocabulary declaring a required address arg,
    the MISSING_REQUIRED_ARGUMENT_REASON sweep fires on the 422 needs-clarification arm
    through the real route (NOT the 500 arm).
(4) MANIFEST RE-BLESS: the SPINE-6 golden suite re-blesses ONCE against the new rule
    hashes with a before/after diff per SPINE-6 §11.5/§11.9 (rule files you touch change
    sha256 pins in goldens/MANIFEST.yaml — bless once on your final tip, report the diff).

RED-first: each leg gets a failing test before implementation. The chatbot byte-identity
regression is part of the suite. No UI in scope — no browser gate.

## Evidence-debt dependencies

- Resolves/carries: AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE (closes ONLY on leg 2).
- Do NOT touch AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STRICTNESS (SPINE-8's gate) and do not
  add vendor-kind terms.

## Verification commands

- `cd server && npx vitest run src/compiler/scientistIntent/ src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/pipeline/passes/`
- goldens suite green incl. re-blessed manifest diff in report
- `npm run typecheck -w server`: no NEW error lines vs trunk pin (26 err-lines/6 files,
  /tmp/l2t2230-tsc-server sha 924c18bd).
- src/ai fail-set 10/21 and compiler-scope fail-file SET 17/29 must not grow.

## Report

Write your report to
`/mnt/vast/home/brad/git/wt/SPINE-7-lane2-l2t0810/.hermes/plans/SPINE-7-report.wip-l2t0810.md`:
diff summary, each acceptance leg -> test name + output tail, manifest before/after
diff, tsc/test baselines, any assumption made. Commit your work on the branch.

## Environment

- `git -c core.fileMode=false` always (NFS mode-bit noise).
- NEVER touch :3001/:5174 or Brad's live tree. Lane stack :3093/:5193 belongs to the
  orchestrator; you do NOT need it (route tests are in-process).
- exactOptionalPropertyTypes on backend: optional means absent OR value, never undefined.
