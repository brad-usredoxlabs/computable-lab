# SPINE-1 coder report — lane 2 / l2t0512

Worktree: /mnt/vast/home/brad/git/wt/SPINE-1-lane2-l2t0512
Branch: spine-1-lane2-l2t0512 (base cl/integration-2 @ 55319ef2)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-08_0315-SPINE-1-contract-freeze-spec.md (read fully; §9 deltas bound per worker contract)
Date: 2026-10-08 (EDT)

## 0. Commits (all work committed; `git -c core.fileMode=false` throughout)

1. 8b466f21 test(SPINE-1): RED clarification-contract tests + verb-inventory fixture + characterization pins
2. e8a37779 feat(SPINE-1): scientist-intent contract extension ($defs/actionVerb, actionLocation, expected*Domain, normalizeDocument preservation)
3. 080e3cf5 test(SPINE-1): GREEN — expected-domain slot pins completing the suite

Diff surface (git diff --stat 55319ef2..HEAD): 7 files, +1091/-37:
- schema/workflow/scientist-intent.schema.yaml (modified)
- server/src/compiler/scientistIntent/types.ts (modified)
- server/src/compiler/scientistIntent/parseScientistIntent.ts (modified)
- server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml (new)
- server/src/compiler/scientistIntent/scientistIntentContract.test.ts (new)
- server/src/compiler/scientistIntent/clarificationContract.test.ts (new)
- server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts (new)
git diff --name-only 55319ef2..HEAD -- app/ => 0 files. NO route/handler/prompt/lift/normalizeScientistIntent edits. No lint rule added (see §8).

## 1. Bootstrap notes (orchestrator verification relevant)

- Lane parity fix: the worktree was missing the trunk's 99 lane-synced untracked/ignored entries. Replicated 1:1 from the TRUNK worktree (symlinks as symlinks, per lane-exclude discipline). Verified: comm -3 of `git status --porcelain -uall --ignored=matching` between trunk and worktree is EMPTY (104/104 entries).
- server/schema symlink REPOINTED from /mnt/vast/home/brad/git/cl-integration-2/schema to the worktree's own schema/ dir (it is gitignored; the spec's §2.1 symlink-to-repo-schema behavior is preserved worktree-locally). Without this, schema edits would have landed in the lane trunk instead of the worktree — the worker contract explicitly requires worktree-local schema edits. Symlink targets (node_modules, .env, lane-synced file symlinks into Brad's live tree) were NOT modified.
- Cite verification at base 55319ef2 (spec verified at ancestor 18e7b670): all load-bearing cites re-verified — 31 verbs in all five copies with IDENTICAL declaration order (node extraction: union/KNOWN_ACTIONS/INTENT_ACTIONS/schema enum/prompt block all 31, order-equal); schema+lint pair byte-identical to trunk; normalizeScientistIntent/ProtocolIntentLowering/parseScientistIntent/ChatbotCompilePasses cite content holds.
- CITE MISMATCH RECORDED (not re-derived): spec §7 src/ai pin "10 failed | 72 passed (82) / 21 failed | 625 passed (646)" was composed at 18e7b670. At base 55319ef2 (with the lane-synced untracked src/ai test files present) the run is "10 failed | 74 passed (84) / 21 failed | 644 passed (665)". The +2 files/+19 tests delta is base drift from lane-synced untracked test files (e.g. AgentOrchestrator.tubeGate, materialFollowUp, submitSuggestionTool.tubeSchema), NOT a SPINE-1 change — proven by base-vs-head fail-SET identity (§6).

## 2. First targeted check (run FIRST, before writing anything)

cd <wt>/server && npx vitest run src/compiler/scientistIntent/scientistIntent.test.ts src/compiler/protocolIntent/ProtocolIntentLowering.test.ts
=> Test Files 2 passed (2) / Tests 27 passed (27)  [re-confirmed after server/schema repoint: 27/27]

## 3. RED evidence (before the schema change; commit 8b466f21 state)

Run: npx vitest run <3 new test files> => Test Files 1 failed | 2 passed (3) / Tests 7 failed | 27 passed (34)
(First raw run also showed 2 characterization harness failures — un-awaited async pass.run() in my own harness, fixed in the same commit's file before the schema change; the RED set below is the clean right-reason set.)

RED for the RIGHT reason — all 7 in clarificationContract.test.ts, failing because the schema TODAY rejects actionLocation (additionalProperties:false at /unresolved/0):
- 'accepts an optional actionLocation {actionIndex, action, argument} on an unresolved item'
  => AssertionError: expected [ { path: '/unresolved/0', additionalProperties: 'actionLocation', ... } ] to deeply equal []
- 'accepts actionLocation with any subset of its (all-optional) members'
  => AssertionError: expected [ { path: '/unresolved/0', ... } ] to deeply equal []
- 'parse round-trip preserves actionLocation exactly (absent !== undefined)'
  => ScientistIntentValidationError: scientist-intent failed schema validation: 1 error(s)
- 'normalize-level boundary stays candidates+actionLocation-dropped (Q1 ruling)'
  => ScientistIntentValidationError: scientist-intent failed schema validation: 1 error(s)
- 'rejects a non-integer actionIndex, naming the offending instancePath'
  => expected false to be true (no type error at /unresolved/0/actionLocation/actionIndex because the whole object is rejected as additionalProperty)
- 'rejects a fabricated action value in actionLocation (the 31-verb enum is the fabrication gate)'
  => expected false to be true (no enum error at .../actionLocation/action today — object rejected wholesale)
- 'rejects a blank argument, naming the offending instancePath'
  => expected false to be true (no minLength error at .../actionLocation/argument today)

Per spec §9, the verb-inventory test was made GREEN against current code BEFORE anything RED-first (it is a freeze, not a change): scientistIntentContract.test.ts 13/13 green at RED time, including the five-copy 31-verb diff and all characterization pins (hint precedence incl. whitespace-source quirk, serial_dilution label->*Hint, first-role-wins, both-arms-'target' ternary, candidates-dropped-at-normalize, Ajv+KNOWN double-reject). ProtocolIntentLoweringCharacterization.test.ts 6/6 green at RED time (pure characterization).

## 4. GREEN final run

cd <wt>/server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent/ProtocolIntentLowering.test.ts src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts
=> Test Files 5 passed (5) / Tests 63 passed (63)
   scientistIntent.test.ts 20 | scientistIntentContract.test.ts 15 | clarificationContract.test.ts 15 | ProtocolIntentLowering.test.ts 7 | ProtocolIntentLoweringCharacterization.test.ts 6

## 5. Five-list verb-count table (verb-inventory test asserts fixture == first FOUR by set AND declaration order; prompt by toContain per verb)

| Copy | Location | Count |
|---|---|---|
| fixture | server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml | 31 |
| types.ts union | ScientistIntentActionKind | 31 |
| schema enum | $defs/actionVerb (referenced by actions[].action AND unresolved[].actionLocation.action) | 31 |
| KNOWN_ACTIONS | parseScientistIntent.ts | 31 |
| INTENT_ACTIONS | intentCompile.ts | 31 |
| prompt block | INTENT_COMPILE_SYSTEM_PROMPT (fifth copy, toContain-pinned; SPINE-2 deletes as authority) | 31 |

Order pin: fixture is types.ts DECLARATION order, not alphabetical (bait §8.7). Divergence in any copy trips the test (set equality asserted explicitly in both directions).

## 6. tsc before/after pins + src/ai set identity

Server (`npm run typecheck -w server`, exit non-zero by design):
- BEFORE: 26 error lines / 6 files (AgentOrchestrator.ts 8, RecordStoreImpl.ts 11, AuthoringGuard.ts 3, ProtocolIntakeHandlers.ts 2, RecordHandlers.ts 1, bootstrapAdmin.ts 1)
- AFTER: 26 error lines / 6 files, per-file breakdown identical; diff of the error-line sets BEFORE vs AFTER is EMPTY => ZERO new error lines, none in owned files.

App (`npm run typecheck -w app`): 47 diagnostic lines / 24 files before AND after (app tree untouched; pin trivially stable but RUN and recorded as required).

src/ai (`npx vitest run src/ai` from server):
- HEAD: "Test Files  10 failed | 74 passed (84) / Tests  21 failed | 644 passed (665)"
- BASE (55319ef2 versions of the three modified files checked out, everything else identical): same line "10 failed | 74 passed (84) / 21 failed | 644 passed (665)"
- FAIL-FILE SET (comm -3 of grep -oE 'FAIL  src/[^ >]+' base vs head): EMPTY — identical 10-file set:
  AgentOrchestrator.bypass / AgentOrchestratorForwarding / AgentOrchestrator.golden / AgentOrchestrator.goldenWithSeeds / AgentOrchestrator.tubeGate / ChatbotCompileDeckSlot / chatbotCompile.e2e / InferenceClient.config / materialFollowUp / submitSuggestionTool.tubeSchema
  (set identity proven, not just count; count delta vs spec pin explained in §1 cite-mismatch note)

Adjacent pre-existing failures proven NOT mine via checkout-base comparison (identical at base and head): src/schema/EventGraphEquipmentSchema.test.ts + src/schema/LabwarePhysicalGeometryData.test.ts (5 tests, lane-synced untracked schema-data files), src/surfaces/surfacesAjv.test.ts (5 tests, lane-synced untracked app/src/shared/surfaces/registry.ts). IntentCompileFromPromptHandlers.test.ts 4/4 green with the extended schema (route-level consumer untouched).

## 7. Contract extension shape (as landed)

- $defs/actionVerb: the 31-verb enum declared ONCE; actions[].action and unresolved[].actionLocation.action both $ref it => fabricated canonical verbs rejected everywhere (test proves enum error at /unresolved/0/actionLocation/action for 'evaporate').
- unresolved[].actionLocation?: {actionIndex?: integer>=0, action?: verb-enum, argument?: string minLength 1}, additionalProperties:false + unevaluatedProperties:false.
- actions[]: expectedSourceDomain? / expectedTargetDomain? / expectedLabwareDomain? (string, minLength 1) — declaration ONLY; normalizeScientistIntent does not consume them (test pins zero behavioral diff); ad-hoc domain MAPS rejected via additionalProperties:false (Q2 ruling).
- normalizeDocument preserves actionLocation (member-by-member via preserveActionLocation, KNOWN_ACTIONS-gated for defense-in-depth symmetry with the action filter) and candidates at PARSE level; normalizeScientistIntent.unresolvedRefs boundary stays {kind,label,reason} (Q1 ruling; pinned in two tests via Object.keys/not.toHaveProperty key-absence assertions).
- Candidate shape FREEZE test: schema candidates item asserted == {label required, confidence optional 0..1, additionalProperties false, unevaluatedProperties false} + a runtime rejection of an extra property (recordId) — SPINE-3 cannot silently widen it.
- Confidence scale DECLARED, not calibrated (test comment states it; 0/0.5/1 accepted, 1.5/-0.1 rejected, absent accepted).
- exactOptionalPropertyTypes discipline: conditional spread everywhere; tests assert key ABSENCE via Object.keys/not.toHaveProperty (no toEqual-with-undefined).
- Harness: fresh createValidator({strict:false}) per test for negative/edge cases (ProtocolProseFieldsSchema pattern); real parseScientistIntent singleton used for the compatibility + round-trip tests (production behavior).

## 8. Open questions — adopted rulings (per worker contract)

- Q1 ADOPTED: candidates+actionLocation preserved parse-level only; normalize-level drop pinned as characterization (scientistIntentContract + clarificationContract tests). normalizeScientistIntent.ts UNTOUCHED.
- Q2 ADOPTED: three fixed optional expected*Domain tags; no free map (rejection test included).
- Q3 ADOPTED: no synonym freeze — verb-inventory contains canonical verbs only; synonym behavior remains pinned by scientistIntent.test.ts:268-296.
- Lint DSL note (spec §6 conditional): the cross-field rule "actionLocation.action must match actions[actionIndex].action" (and "argument names a field present on that action") is NOT expressible in JSON Schema (no cross-item indexing) AND not expressible in the scalar predicate DSL (PathResolver has no computed-index cross-reference). No lint rule was added; the fabrication gate that IS expressible (verb enum) is enforced and tested. Cross-item consistency is SPINE-3's engine concern. Recorded here so the reviewer does not read silence as oversight.

## 9. Characterization artifact list

1. server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml — 31 verbs, declaration order, migration baseline header.
2. server/src/compiler/scientistIntent/scientistIntentContract.test.ts — compatibility (all inline fixtures + lift outputs + tool-call payloads), verb-inventory five-copy diff, hint precedence (incl. whitespace-source dropped => sourceHint survives; truly-empty source rejected by minLength), serial_dilution label->*Hint params quirk, first-role-wins symbolicLabels, both-arms-'target' ternary quirk, candidates-dropped-at-normalize, Ajv+KNOWN_ACTIONS double-reject (with why-comment per bait §8.8).
3. server/src/compiler/scientistIntent/clarificationContract.test.ts — argument-location accept/subset/round-trip/malformed-reject (instancePath named), fabricated-verb rejection, Q1 parse-vs-normalize split, confidence scale, candidate-shape freeze.
4. server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts — hint->candidate (resolvedRecordId ?? labwareHint, role-bearing reason, deckSlot key-absence), tips/waste continue-guards, deckSlot->labwareAdditions one-match placement, plan_deck_layout first-wins conflict, scientist-intent path NEVER sets deckSlot (normalize + compileScientistIntent end-to-end), blockers-keep-candidates.

## 10. Quirks characterized, NOT fixed (bait §8.6)

whitespace-only source survives schema then dropped by normalizeDocument; serial_dilution raw labels become *Hint params; first-role-wins; :172 both-arms-'target' ternary; candidates+actionLocation dropped at unresolvedRefs. All pinned by tests; fixes deferred to SPINE-3/4.

## 11. Out-of-scope respected

No app/** changes (0 files), no route/handler edits (IntentCompileFromPromptHandlers untouched, its tests green), no prompt edits, no liftScientistIntent/normalizeScientistIntent/ChatbotCompilePasses/ProtocolIntentLowering.ts edits, no pipeline YAML edits, no stack restarts (YAML reload is the orchestrator's job — trap §8.3 acknowledged), no new lint rules.

SPINE-1 CODER DONE
