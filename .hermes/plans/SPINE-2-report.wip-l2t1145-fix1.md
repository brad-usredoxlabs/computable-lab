# SPINE-2 CODER FIX-1 REPORT — lane 2, l2t1145-fix1

Worktree: /mnt/vast/home/brad/git/wt/SPINE-2-lane2-l2t1145
Branch: spine-2-lane2-l2t1145 (prior HEAD f38bec37 -> fix commit 836b3d72; no reset/rebase)
Spec: .hermes/plans/2026-10-08_0415-SPINE-2-verb-vocabulary-externalization-spec.md
Prior report: .hermes/plans/SPINE-2-report.wip-l2t1145.md (§7 STOP resolved here)
Status: COMPLETE. The copy-C STOP is resolved and landed; all verification gates green.

## 1. Orchestrator adjudication (recorded)
Copy-C STOP resolved as OPTION (1): surgical SPINE-1-pin edit AUTHORIZED for exactly one
leg of exactly one test. Rationale on record: SPINE-2's acceptance criterion is "TypeScript
keeps no list"; the verb-inventory pin freezes the PRE-migration baseline and SPINE-1 declared
the TS copies are for SPINE-2 to delete; a sanctioned permanent literal would violate the
repo's never-hardcode non-negotiable (option 2 REJECTED).

## 2. Changes (commit 836b3d72, 2 files, +22/-33)

### server/src/compiler/scientistIntent/parseScientistIntent.ts
- KNOWN_ACTIONS literal (31 verbs) DELETED together with its BLOCKED-DELETION note.
- preserveActionLocation(value) -> preserveActionLocation(value, vocabulary): the defense-layer
  membership check is now `vocabulary.has(loc.action)` — the vocabulary that owns the parse.
- Threading: parseScientistIntent already resolved `opts?.vocabulary ?? defaultScientistIntentVocabulary()`
  (flip-a) and normalizeDocument already took the vocabulary; the only new threading was passing it
  into preserveActionLocation at the normalizeDocument call site. Production callers
  (IntentCompileHandlers.ts:61, intentCompile.ts :282/:288/:324) call parseScientistIntent with no
  opts and get the shipped singleton via the existing defaultScientistIntentVocabulary() path —
  zero call-site signature changes were needed anywhere.
- NO new fallback set, NO try/catch, NO verb/class/domain-name conditional added.
- vocabulary.ts NOT touched (no new exported API needed — verbs()/has() already existed).

### server/src/compiler/scientistIntent/scientistIntentContract.test.ts (authorized pin edit, one leg)
- :151-153 KNOWN_ACTIONS regex leg (parseSrc/knownMatch/knownVerbs) REPLACED by
  `const vocabularyVerbs = [...defaultScientistIntentVocabulary().verbs()];` — loader-backed,
  order-preserving read of schema/scientist-intent/scientist-intent-vocabulary.yaml.
- KEEP verified: length-31 assertion for the leg, order equality vs the union, set-identity
  assertion — all byte-preserved with knownVerbs->vocabularyVerbs; the fixture/types.ts-union/
  schema-enum/INTENT_ACTIONS legs are byte-unchanged (diff shows only the leg lines + titles).
- Title wording updated where it named KNOWN_ACTIONS:
  * 'fixture == types.ts union == schema enum == shipped vocabulary == INTENT_ACTIONS, length 31, declaration order'
  * 'the vocabulary-driven defense layer is defense-in-depth behind the enum; ... without a vocabulary update'
  plus the two comment blocks that named the deleted literal (ripple per fix-run item 3; assertions in
  the double-reject test are byte-unchanged).
- Ripple: PARSE_PATH const removed (its only consumers were the deleted regex leg); import of
  defaultScientistIntentVocabulary added. No other edit to this file.

### Not touched (verified)
- schema/workflow/scientist-intent.schema.yaml + scientist-intent.lint.yaml +
  registry prompt-templates/intent.compile.system.yaml: `git -c core.fileMode=false diff --stat
  b36f914a...HEAD -- <those three>` => EMPTY (byte-identical).
- vocabulary.ts, app/**, the other four pin legs (fixture, union, schema enum, INTENT_ACTIONS),
  ACTION_SYNONYMS: untouched.
- mirror-drift test: no edit needed — it never referenced copy C (its list is (a)-(e): union,
  wire enum, tool enum, prompt block, registry block).

## 3. Verification gates (verbatim outputs)

### Gate 1 — targeted suite (cd server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent)
```
 ✓ src/compiler/protocolIntent/ProtocolIntentLowering.test.ts  (7 tests) 6ms
 ✓ src/compiler/protocolIntent/ProtocolIntent.test.ts  (5 tests) 5ms
 ✓ src/compiler/protocolIntent/ProtocolIntentStatePlanner.test.ts  (3 tests) 7ms
 ✓ src/compiler/protocolIntent/ProtocolIntentPatternExpanders.test.ts  (8 tests) 10ms
 ✓ src/compiler/protocolIntent/ProtocolIntentValidation.test.ts  (4 tests) 5ms
 ✓ src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts  (6 tests) 54ms
 ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (6 tests) 19ms
 ✓ src/compiler/scientistIntent/scientistIntentContract.test.ts  (15 tests) 83ms
 ✓ src/compiler/scientistIntent/scientistIntent.test.ts  (20 tests) 89ms
 ✓ src/compiler/scientistIntent/clarificationContract.test.ts  (15 tests) 297ms
 ✓ src/compiler/scientistIntent/vocabularyRipOut.test.ts  (8 tests) 151ms
 ✓ src/compiler/scientistIntent/vocabulary.test.ts  (14 tests) 1089ms

 Test Files  12 passed (12)
      Tests  111 passed (111)
```
Same 12 files / 111 tests as the prior report; SPINE-1's 83 pins green WITH the one authorized
pin-leg edit (15 tests in scientistIntentContract.test.ts, unchanged count).

### Gate 2 — server tsc (npm run typecheck -w server 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort)
26 lines / 6 files. `comm -3 /tmp/spine2-tsc-final.txt /tmp/spine2-fix1-tsc-final.txt` => EMPTY (exit 0).
Set identity vs the 26-line/6-file baseline preserved.

### Gate 3 — src/ai failing-file SET identity (cd server && npx vitest run src/ai)
```
FAIL  src/ai/AgentOrchestrator.bypass.test.ts
FAIL  src/ai/AgentOrchestratorForwarding.test.ts
FAIL  src/ai/AgentOrchestrator.golden.test.ts
FAIL  src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
FAIL  src/ai/AgentOrchestrator.tubeGate.test.ts
FAIL  src/ai/ChatbotCompileDeckSlot.test.ts
FAIL  src/ai/chatbotCompile.e2e.test.ts
FAIL  src/ai/InferenceClient.config.test.ts
FAIL  src/ai/materialFollowUp.test.ts
FAIL  src/ai/submitSuggestionTool.tubeSchema.test.ts
Test Files  10 failed | 74 passed (84)
Tests  21 failed | 644 passed (665)
```
comm -3 vs the prior 10-file set => EMPTY ("AI SET COMM EMPTY"); counts identical.

### Gate 4 — app diff
`git -c core.fileMode=false diff --stat b36f914a...HEAD -- app/` => EMPTY (exit 0).

### Gate 5 — KNOWN_ACTIONS grep
`git grep -n KNOWN_ACTIONS -- server/src` => no output, exit 1 (zero hits in .ts sources,
including comments/titles — the rip-out rule now holds for copy C end-to-end).

### Gate 6 — mutation sanity check (transcript)
Temporarily removed the `pellet` verb block (18 lines, :641-658) from
schema/scientist-intent/scientist-intent-vocabulary.yaml (uncommitted) and ran a throwaway probe
(server/src/compiler/scientistIntent/__mutationProbe.test.ts, deleted after the run):
```
 ✓ loader reflects the mutation (30 verbs, no pellet)            -> vocab.verbs() == 30, has('pellet') == false
 ✓ fabrication gate REJECTS a doc using the removed verb        -> parseScientistIntent({action: pellet}) throws
   ScientistIntentValidationError; Ajv error:
   path '/actions/0/action' [enum] "pellet" is not allowed here; choose one of: seed, ... (30 verbs, pellet absent)
 ✓ a doc using a REMAINING verb still parses                    -> spin doc parses (1 action)
 ✓ actionLocation.action is gated by the SAME injected enum     -> unresolved actionLocation.action: pellet
   rejected at schema level: path '/unresolved/0/actionLocation/action' [enum], allowedValues = the 30 mutated verbs
```
First probe run (before correcting the 4th leg's expectation) captured the rejection verbatim:
`1 failed | 3 passed` with the serialized enum error listing the 30-verb allowedValues WITHOUT pellet —
the injected $defs/actionVerb enum follows the mutated data YAML on BOTH action and actionLocation
surfaces. Corrected probe: `Test Files 1 passed (1) / Tests 4 passed (4)`.
Restore: `git checkout -- schema/scientist-intent/scientist-intent-vocabulary.yaml` + probe deleted;
`git diff --stat HEAD -- schema/` => EMPTY (clean), and the targeted suite re-run green
(12 files / 111 tests) after restore.

## 4. Commit list (this fix run)
1. 836b3d72 feat(SPINE-2) fix1(copy C): KNOWN_ACTIONS deleted + authorized pin-leg edit (the only code commit).
2. docs(SPINE-2): this report.

## 5. Deltas vs prior report (§7 resolution)
- Copy-C disposition (prior §3.1 row C "BLOCKED deletion") is now: DELETED; defense layer
  vocabulary-driven; pin leg swapped per adjudication. Prior §10 unresolved issue 1 CLOSED.
- Prior §8 hard-boundary grep note listing "parseScientistIntent.ts:77 (the BLOCKED KNOWN_ACTIONS
  literal)" no longer applies — the literal is gone.
- No new unresolved issues from this fix run. Prior §10 item 2 (app tsc baseline drift 34/28 vs
  47/24) remains informational; app/** diff remains empty.

SPINE-2 CODER DONE
