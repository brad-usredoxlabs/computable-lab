# ANSWER-BIND-1 — Data-side clarification-answer binding (server)

Lane 2 · item ANSWER-BIND-1 · spec l2t0830 · trunk base 534f7e5f (code tip c0c4bed9)
Origin: ARCHITECT DECISION `.hermes/plans/decisions/W28-A5h-labware-semantic-noun-answer-decision.md`
TASK ANSWER-BIND-1 (Q2, verbatim obligations reproduced below). NOT Brad-gated (decision Q3).
Companion item ANSWER-SURFACE-1 (client '/l' routing) is INDEPENDENT — do not implement it here.

## Why (one paragraph)

A clarification answer today is prompt text only: `composeAnsweredPrompt`
(server/src/api/handlers/IntentCompileFromPromptHandlers.ts:147-156) appends every
`answers` entry verbatim into a settled-choices block; nothing interprets it. The
engine's drop-join `boundKeys` (server/src/compiler/resolution/resolveNounsPass.ts:149-152)
is fed EXCLUSIVELY by `engine.bindings`, and an `ambiguous-noun` fires whenever
>=2 candidates sit in the acceptance band (resolutionEngine.ts:195-217; band
`policies.ambiguity.confidenceAccept`). Minting adds tier-1 candidates but can never
shrink an in-band set — so an ambiguous-noun fact is provably inconvergable by any
answer mechanism that only echoes text. This task ships the unshipped DATA half of
THREAD-ASK-1's approved spec: a validated `[[kind:id|label]]` answer becomes an
AUTHORITATIVE slot binding BEFORE resolve_nouns bars.

## Oriented facts (orchestrator-verified first-hand at trunk 534f7e5f — all line
## numbers checked directly, NOT scout output)

- Handler call site: IntentCompileFromPromptHandlers.ts — `answers` gate :339-340;
  answered-compile block :360-388: `composeAnsweredPrompt` (:147), declared-roles
  append, then `compileFromSmallLlm({ prompt, llmClient, model, deps: { searchLabwareByHint, spine }, labInventory })`.
  The handler ALREADY has store-backed loaders in this same file (`loadLabInventory`,
  `loadDeclaredRolesBlock(body?.sourceProtocolId)` — follow their access pattern for
  validating an answer's recordId; ctx/store is in reach).
- `compileFromSmallLlm` (server/src/compiler/scientistIntent/intentCompile.ts:244)
  -> LLM -> parseScientistIntent -> compile result; threading lives through
  `compileScientistIntent` -> `buildRegistry` -> `registry.register(createResolveNounsPass({...}))`
  (server/src/compiler/scientistIntent/compileScientistIntent.ts:154-171).
  All new params MUST be optional so every other caller is byte-unchanged.
- `createResolveNounsPass` (resolveNounsPass.ts:243): builds adapters, runs
  `engine = await resolve(deps.intent, deps.vocabulary, engineDeps)` (:272),
  `requiredArgumentClarifications` (:277), `reconcileModelUnresolved(intent.unresolved,
  [...engine.clarifications, ...required], engine.bindings)` (:280-284), SH-QA-1 gated
  survivors join via `boundSlotKeys` (:293-304), `resolvedByLabel` from bindings (:312-325),
  `blocked = clarifications.length > 0` (:326), bar diagnostic :335-343.
- §5.1 identity machinery: `identityKey` (resolveNounsPass.ts:107-116) —
  `slot:<actionIndex>:<argument>` when both present, else label identity;
  `reconcileModelUnresolved` (:139-152) adds for each binding BOTH
  `identityKey(b)` and `label:<b.label>` to boundKeys. A model hedge is dropped iff
  its key is in boundKeys (:165). So a synthesized binding whose label equals the
  answered label ALSO drops the model's hedge for that label — zero new drop rule.
- `BoundNoun` (server/src/compiler/resolution/types.ts:95-108): {verb, argument,
  label, curie?, resolvedLabel?, tier?, level?, confidence, source?, addresses?, actionIndex?}.
  Tier-1 local-record candidates already use curie = recordId (adapters.ts:125,:162).
  `recordIdFromCurie` is already used by the pass for resolvedByLabel.
- `ResolutionRequest` / arg contracts: contracts come from
  `deps.vocabulary.argContracts(verb)` (resolveNounsPass.ts:264-265); the noun-kind
  discriminator is `contract.kind === 'resolvable'` (vocabulary DATA —
  schema/scientist-intent/scientist-intent-vocabulary.yaml; 91 resolvable slots).
  Engine's single-in-band binding arm: resolutionEngine.ts:199-207 (`bindingFor`).
- Intent shape: `ScientistIntent.actions: ScientistIntentActionValue[]`
  (scientistIntent/types.ts:128); action argument values are the scientist's raw
  label text — the SAME string that rides as the clarification label and therefore
  as the answers-map KEY.
- Client emits answers values exactly `[[<kind>:<id>|<label>]]`
  (ClarificationPicker.tsx answerFromMention :118-140; idiom also consumed by
  server/src/lint mention walkers and server/src/ai/resolveMentions.ts — do NOT
  reuse resolveMentions' fuzzy path; this task needs exact-id validation only).

## Contract (the binding rule — declarative-first, zero domain literals)

Input: the request's `answers: Record<string,string>` (already parsed at the handler).
1. An entry whose VALUE matches the mention idiom `^[[<kind>:<id>|<label>]]$`
   (kinds are the client's recordType strings — parse generically, no kind allow-list
   in TS) is an ANSWER CANDIDATE. Every other entry (axis answers, plain text, label
   hedges) keeps riding the prompt EXACTLY as today — the composed prompt is NOT
   changed by this task at all (prompt behavior byte-identical; only ADD a data
   channel beside it).
2. VALIDATE: the id must exist in the store (existing store/record-provider access
   in the handler; same pattern as loadDeclaredRolesBlock's record load). A nonexistent
   id is IGNORED HONESTLY: no binding, fact re-bars, output byte-identical to today.
3. MATCH generically: scan `intent.actions` (index = actionIndex); for each action,
   for each arg contract from `vocabulary.argContracts(action.kind)` with
   `kind === 'resolvable'`, if the action's value at `contract.name` (the raw slot
   label) EQUALS the answers-map KEY of this entry, that slot is answered. No
   verb/argument/kind name literals anywhere; the vocabulary's declared contract list
   is the only matcher. If several actions carry the same label value, every matching
   slot is answered (the scientist answered the mention).
4. BIND: for each answered slot, inject an AUTHORITATIVE binding — it REPLACES the
   engine's gathered set for that slot (that is what "settled, do not re-ask" means):
   - push `BoundNoun {verb: action.kind, argument: contract.name, label: <answered
     key>, curie: <recordId>, resolvedLabel: <record's title/label from store>, tier:
     1, confidence: 1, source: 'scientist-answer', actionIndex}` into the bindings the
     §5.1 join and resolvedByLabel consume;
   - DROP any engine clarification (ambiguous-noun / unknown-noun /
     resolution-lookup-failed — key on the engine's OUTPUT facts, not reason-name
     branches: drop an engine clarification iff its identityKey is one of the answered
     slot keys and it is not a `missing-required-argument` required-sweep fact) and
     do not run the engine's ambiguity arm for that slot. Implementation choice:
     filter AFTER `resolve()` inside the pass (smallest) or pre-seed a single-candidate
     adapter — coder's judgement, MUST satisfy: required-argument sweep still fires
     for genuinely missing slots; an ANSWERED slot counts as present.
   - The binding must reach `resolvedByLabel` for free (existing :312-325 loop reads
     bindings) — downstream deck/plan compile sees a normal tier-1 binding.
5. Threading: handler -> `compileFromSmallLlm` (new OPTIONAL arg, e.g.
   `answeredSlots`) -> `compileScientistIntent` -> `createResolveNounsPass` (new
   OPTIONAL dep). Validation + slot matching happens where store access + the parsed
   intent are BOTH available — recommend: handler parses/validates the idiom+ids and
   passes the validated [{label, recordId, recordLabel}] list; slot matching against
   the PARSED intent happens inside the pass (the intent only exists post-LLM). This
   split is a suggestion; the contract above is binding, the seam is yours — cite
   your chosen seam + why in the report.
6. NEVER: mutate the prompt, add schema fields, add YAML, touch the client, add a
   reason/verb/kind literal switch, or drop a fact that lacks slot identity (KEEP
   rules of reconcileModelUnresolved stay untouched).

## Acceptance criteria (verbatim obligations from the decision)

- Server tests (RED-first): (a) answered compile with `[[labware:<real seed id>|X]]`
  for an intent whose X slot would be ambiguous binds deterministically — the
  ambiguous fact for X is GONE on that request's result, no redraw needed; (b) a
  nonexistent id yields output byte-identical to today's behavior (assert full
  clarifications payload equality, not a subset); (c) axis answers (non-idiom values)
  unchanged; (d) §5.1 join pin: a model hedge fact with the answered label is dropped
  by the existing boundKeys machinery with ZERO changes to reconcileModelUnresolved's
  rules; (e) an answer for a label no slot carries changes nothing; (f) goldens
  updated deliberately, diff in report — never pinned around.
- Suites: `cd <worktree>/server && npx vitest run src/compiler/resolution src/api/handlers`
  (or the existing handler test path) targeted green; FULL server run fail-FILE names
  zero NEW vs the lane baseline (~89 failed files pre-existing — comm -3 the names,
  report the comm output). Server tsc: zero new error files.
- Scope gate: `git -c core.fileMode=false diff <base>..HEAD` touches server/ + tests +
  .hermes docs ONLY. Zero app/, schema/, *.yaml hunks.

## Worker mechanics

- Worktree /mnt/vast/home/brad/git/wt/ANSWER-BIND-1-lane2-l2t0830 (branch of same),
  bootstrapped from trunk 534f7e5f via the lane bootstrap pattern
  (scripts/bootstrap-ANSWERBIND1-l2t0830.sh; untracked trunk files synced,
  excludesFile configured; node_modules are symlinks into Brad's tree — never
  install anything).
- Report: .hermes/plans/ANSWER-BIND-1-report.wip-l2t0830.md in the worktree, commands
  + raw outputs, end with exactly `ANSWER-BIND-1 DONE <sha>`.
- All git via `git -c core.fileMode=false` (NFS mode-bit noise). Never touch
  :3093/:5193/:3001/:5174, never restart stacks, never merge, no App.test.tsx.
