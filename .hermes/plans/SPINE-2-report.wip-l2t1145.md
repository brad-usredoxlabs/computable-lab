# SPINE-2 CODER REPORT — lane 2, l2t1145 (FINAL)

Worktree: /mnt/vast/home/brad/git/wt/SPINE-2-lane2-l2t1145
Branch: spine-2-lane2-l2t1145, base b36f914a (SPINE-1 merge tip)
Spec: .hermes/plans/2026-10-08_0415-SPINE-2-verb-vocabulary-externalization-spec.md (promoted)
Status: ALL acceptance tests GREEN; ONE mandated deletion STOPPED per pin rule (see BLOCKED).

## 1. Claim gate (§2, five artifacts, re-verified at base in MY worktree)
1. server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml — PRESENT, 31 verbs.
2. scientistIntentContract.test.ts — PRESENT (verb-inventory equality + scientist-intent-contract.compatibility).
3. clarificationContract.test.ts — PRESENT.
4. protocolIntent/ProtocolIntentLoweringCharacterization.test.ts — PRESENT.
5. schema/workflow/scientist-intent.schema.yaml — PRESENT with $defs/actionVerb single-source enum, actionLocation, expected*Domain, candidates.
First targeted check §9 (run in worktree per orchestrator delta): `npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent` => Test Files 9 passed (9), Tests 83 passed (83). Claim gate PASSES.

## 2. Step-1 baselines vs FINAL baselines (comm -3 outputs)

### Server tsc (npm run typecheck -w server | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort)
- Step 1: 26 lines / 6 files (AgentOrchestrator 5, RecordStoreImpl 2+..., AuthoringGuard 3, ProtocolIntakeHandlers 2, RecordHandlers 1, bootstrapAdmin 1) — matches orchestrator's expected 26/6 set.
- FINAL: 26 lines / 6 files. `comm -3 /tmp/spine2-tsc-baseline.txt /tmp/spine2-tsc-final.txt` => EMPTY (exit 0). Zero new error lines at EVERY flip commit (checked after each commit; one transient +1 from my own vocabulary.ts ValidationError-shape error was fixed within the same step before commit).

### src/ai failing-file SET (npx vitest run src/ai from <wt>/server)
- Step 1 SET (10 files): AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema.
- Counts: "Test Files 10 failed | 74 passed (84) / Tests 21 failed | 644 passed (665)" + 2 unhandled errors — matches spec §8 expectation exactly.
- FINAL: `comm -3 /tmp/spine2-ai-failset.txt /tmp/spine2-ai-failset-final.txt` => EMPTY (exit 0); counts identical (10 failed | 74 passed / 21 failed | 644 passed).

### app
- `git -c core.fileMode=false diff --name-only b36f914a..HEAD -- app/` => 0 files (EMPTY). Gate satisfied.
- app tsc measured once (N/A-once per spec §8): 34 error lines / 28 files. Cite mismatch recorded: spec §8 cites a 47/24 pin (and my lane notes carry 47/24 for trunk); this worktree measures 34/28. app/** diff is empty, so app state is untouched by this item; mismatch recorded, not re-derived.

### 7-copy verb counts at base (all verified programmatically)
A types.ts union 31 | B wire-schema enum 31 | C KNOWN_ACTIONS 31 | D INTENT_ACTIONS 31 | E prompt block 31 | F CANONICAL_ACTIONS 31 | G registry template block 31. PATTERN_ACTIONS 4.

## 3. Seven-copy disposition table (§3.1)

| Copy | What it was | Disposition |
|---|---|---|
| A types.ts union | compile-time type | KEPT as drift-checked MIRROR (Q1 ruling); doc-comment added; gated by mirror-drift (a) |
| B wire-schema enum | frozen wire contract enum | KEPT byte-identical as human mirror; runtime validator now uses vocabulary-injected enum ($defs/actionVerb injection); gated by mirror-drift (b) |
| C KNOWN_ACTIONS | runtime drop-filter set | **BLOCKED deletion** — see §7. Enum injection + normalizeDocument filter now vocabulary-driven; the literal survives ONLY for the pinned preserveActionLocation defense layer |
| D INTENT_ACTIONS | runtime tool-enum list | DELETED as literal; export is now GENERATED (`defaultScientistIntentVocabulary().verbs()`); tool enum <- `vocab.toolActionEnum()`; gated by mirror-drift (c) |
| E prompt verb block | hand-written block in constant | GENERATED from `vocab.promptVerbBlock()` via `intentCompileSystemPrompt(vocab)`; INTENT_COMPILE_SYSTEM_PROMPT = generated production default (byte-identical to pre-migration text, verified against git HEAD copy); gated by mirror-drift (d) |
| F CANONICAL_ACTIONS | runtime lifter set | DELETED; `canonicalSet(vocab)` derives from `vocab.verbs()`; liftAction verb-key recognition <- `vocab.has` |
| G registry template | registry/UI prompt | KEPT as YAML mirror, drift-gated (mirror-drift (e)); NOT generated; untouched (no sync forced) |
| (adjacent) PATTERN_ACTIONS | hand-list of 4 macros | DELETED as hand-list; derived from vocabulary `class: pattern` (Q3); set identity proven by current-verb-parity + characterization pins |

## 4. Commit list (migration order §7, one consumption flip per commit)
1. 4e87a341 feat: triplet + vocabulary.ts + resolver-spec.validation GREEN (pure addition)
2. 63c953b5 test: mirror-drift GREEN pre-deletion vs (a)-(e) + mutation leg
3. 02f13ead fix: loader error detail (repo ValidationError shape); promptVerbBlock width-74 byte-parity
4. 3ee550fa flip-a(parser): $defs/actionVerb enum injection + per-vocabulary validator cache + opts.vocabulary + filter <- vocabulary.has (KNOWN_ACTIONS deletion STOPPED, see §7)
5. 00a25e76 flip-c(prompt): generated ALLOWED ACTIONS block (byte-identical output proven)
6. bac191c9 flip-b(tool schema): enum <- vocab.toolActionEnum(); INTENT_ACTIONS literal deleted (generated export)
7. 45c3c076 flip-d(lifter): CANONICAL_ACTIONS deleted; canonicalSet <- vocab.verbs()
8. 3dc55926 flip-e(PATTERN_ACTIONS): derived from vocab.patterns()
9. a1fe6714 test: rip-out + strategy-order flip + prompt-exclusivity (test+fixtures only)
10. docs(SPINE-2): types.ts mirror doc-comment (union untouched)
NOTE: spec §7 order was (a) parser, (b) tool, (c) prompt; I landed (a) then (c) then (b) because the prompt-flip edit was already staged when the parser collision analysis completed; each commit ran the full scientistIntent+protocolIntent suite green + tsc comm -3 identity. One surface per commit respected.

## 5. Acceptance tests (§6 verbatim names) — all GREEN
Final targeted run: `npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent` => **Test Files 12 passed (12), Tests 111 passed (111)** (SPINE-1's 9 files/83 tests byte-green throughout + 3 new files/28 tests).

- scientist-intent-vocabulary.rip-out (vocabularyRipOut.test.ts, 5 tests): fixture vocab minus pellet -> generated prompt lacks `pellet` + contains the other 30; `parseScientistIntent(doc, {vocabulary: fixtureVocab})` THROWS (enum injection follows the fixture); non-pellet doc parses; shipped vocab still accepts pellet. Test-only commit (a1fe6714) — zero product TS edits.
- scientist-intent-vocabulary.mirror-drift (vocabularyMirrorDrift.test.ts, 6 tests): set diffs BOTH directions empty vs (a) union, (b) wire enum, (c) tool enum, (d) prompt block, (e) registry block; order pinned vs verb-inventory for (a)(b). MUTATION LEG: temp copy of wire-schema text with `- pellet` removed -> diff assertion goes RED (`onlyA == ['pellet']`, order pin trips) — test-the-test proven in-suite.
- current-verb-parity (vocabulary.test.ts): vocab verbs == verb-inventory.yaml == 31 ORDER-AWARE + set identity; class:pattern == exactly the 4 macros; THREE_ACTION + full-vocab fixtures parse through the REAL parseScientistIntent singleton; ACTION_SYNONYMS targets all ∈ vocabulary verbs (Q2 pin).
- resolver-spec.validation (vocabulary.test.ts): shipped vocab validates + lints CLEAN (zero findings; 5 rules present — backstop for server.ts empty-spec skip); mutations each NAMED-fail: P1 missing domain -> vocab-resolvable-args-declare-domain; P2 undeclared policyRef -> vocab-policy-refs-declared; P3 pattern+required resolvable -> vocab-pattern-verbs-forbid-required-resolvable; P4 unknown strategyRef -> vocab-strategy-refs-declared; struct (arg without kind) -> schema validation failure; hint-verbs-carry-policy-ref additionally guards hint surfaces.
- strategy-order flip (vocabularyRipOut.test.ts): fixture pair with reversed strategyOrder reports the swapped order via `policies()`; shipped order unchanged; zero TS touched (test-only commit).
- prompt-exclusivity (vocabularyRipOut.test.ts): captured mock-client system prompt contains OUTPUT ONLY YAML + the generated verb block (all 31 verbs + exact promptVerbBlock() text); no line-DSL/shorthand/spawn surface in scientistIntent product files.
- Loader-registration proof (bait 4): data file matches neither DEFAULT_PATTERNS nor .lint.yaml (loadAllSchemas on the vocab dir registers exactly 1 entry = the schema; loadAllLintSpecs registers exactly 1 spec named scientist-intent-vocabulary).

### RED evidence (before GREEN)
- resolver-spec first run against draft triplet: 9 failed | 5 passed — surfaced (i) strategyOrder pattern rejecting underscore ids (fixed: `^[a-z][a-z0-9_-]*$`), (ii) P2 firing on shipped doc, exposing the DSL limitation (below). After fixes: 14 passed.
- Attempted KNOWN_ACTIONS deletion (flip-a): verb-inventory pin went RED: "expected [] to have a length of 31 but got +0" (the pin regex-extracts the literal from parse source). Per contract ("a pin update request = STOP; do not edit pins") the deletion was reverted and escalated; the rest of flip-a landed green.

### Emptied-fixture loud-failure transcript (bait 1)
```
LOUD FAILURE: scientist-intent vocabulary failed schema validation (/mnt/vast/home/brad/git/wt/SPINE-2-lane2-l2t1145/server/src/compiler/scientistIntent/fixtures/vocab-empty/scientist-intent-vocabulary.yaml): 1 error(s): /verbs [minItems]: Array must have at least 1 items
```
Missing-file case: "scientist-intent vocabulary vocabulary file not found: <path> — the vocabulary triplet is required; there is no default verb set". No try/catch fallback anywhere in vocabulary.ts; no `?? DEFAULTS` anywhere.

## 6. Representation + design rulings (recorded per §5.0 "pick ONE representation and say it")
- verbs AND args are ARRAYS of name-keyed declarations (spec sanctions array form because everyItem needs arrays); verb order == verb-inventory declaration order (order-aware parity).
- P2 deviation (forced by DSL reality, evidence): the lint DSL's `[*]` projection cannot flatten nested wildcards — `verbs[*].args[*].policyRef` selects ARRAYS-OF-VALUES as items (debug transcript: selected = [["hint-authority","hint-authority"],...]) and allIn then compares serialized arrays against ruleIds. policyRef therefore lives at VERB level (`verbs[*].policyRef` flat selection), matching §5.0's own wording "every hintEligible arg's VERB participates in a policy id". An additional rule (vocab-hint-verbs-carry-policy-ref) enforces that any verb with a hintEligible arg carries a policyRef. No interpreter changes were made.
- P1/P3 use nested everyItem (verbs -> args) for the same array-selection reason.
- Injection point: wire schema `actions[].action` is `$ref: '#/$defs/actionVerb'` (SPINE-1 single-source); injection sets `$defs.actionVerb.enum = vocabulary.toolActionEnum()` — covers BOTH action and actionLocation.action (fabrication gate stays vocabulary-driven). On-disk enum untouched (mirror).
- Validator cache keyed per vocabulary INSTANCE: production default vocabulary is the cached singleton (production behavior unchanged); fixture vocabularies get fresh validators (bait 2).
- exactOptionalPropertyTypes: all optional vocabulary fields built by conditional spread; tests assert key absence.
- vocabulary.ts contains NO conditional on any verb/class/domain NAME (only the generic `class === 'pattern'` read of the declared class field, which is the data field itself, not a verb name).

## 7. STOP / BLOCKED portion (pin collision — orchestrator adjudication required)
Copy C (KNOWN_ACTIONS, parseScientistIntent.ts) deletion is mandated by §4/§7(a)/§10, but SPINE-1's FROZEN verb-inventory pin (scientistIntentContract.test.ts:152) regex-extracts the literal `const KNOWN_ACTIONS ... new Set<ScientistIntentActionKind>([...])` from parse source text and asserts 31 literals in declaration order. Deleting or deriving the literal makes the pin RED (evidence above); keeping the pin green and deleting the literal are mutually exclusive without editing the pin, which my contract forbids ("if a pin needs updating, STOP and report; do not edit pins").
State landed: the Ajv fabrication gate IS vocabulary-driven (enum injection), normalizeDocument's drop-filter consults `vocabulary.has()`, and the literal survives ONLY for the pinned preserveActionLocation defense layer with a BLOCKED-DELETION note in source. Resolution options for orchestrator: (1) authorize a SPINE-1-pin edit (swap the KNOWN_ACTIONS leg for the vocabulary API) in a follow-up commit; (2) accept the defense-layer retention as a sanctioned exception. Everything else in §4/§6/§7 is complete and green.
Secondary note: INTENT_ACTIONS (D) keeps its EXPORT NAME (generated from YAML) for the same reason — the frozen pin imports it; the hand-maintained LIST is gone.

## 8. §10 verification commands (verbatim outputs)
- targeted suite: Test Files 12 passed (12), Tests 111 passed (111).
- src/ai: failset comm -3 EMPTY; 10 failed | 74 passed (84) / 21 failed | 644 passed (665).
- server tsc: comm -3 vs step-1 baseline EMPTY (26 lines).
- rip-out proof-of-zero-TS: `git -c core.fileMode=false diff --name-only b36f914a..HEAD -- 'server/src/**/*.ts' | grep -v -E 'vocabulary|parseScientistIntent|intentCompile|liftScientistIntent|normalizeScientistIntent|types\.ts'` => EMPTY.
- hard-boundary grep `grep -rn "media_swap_duplicate_columns" server/src --include='*.ts' | grep -v test | grep -v 'type\['` => protocolIntent downstream IR surface (ProtocolIntentValidation/PatternExpanders/ProtocolIntent — §3.3 boundary, untouched), types.ts union (sanctioned mirror), normalizeScientistIntent.ts:5 doc comment, parseScientistIntent.ts:77 (the BLOCKED KNOWN_ACTIONS literal, §7 above). CANONICAL_ACTIONS gone; PATTERN_ACTIONS derived; INTENT_ACTIONS generated.
- frozen contract byte-identity: `git diff b36f914a..HEAD --stat -- schema/workflow/scientist-intent.schema.yaml schema/workflow/scientist-intent.lint.yaml schema/registry/prompt-templates/intent.compile.system.yaml` => EMPTY (all three byte-identical; G never needed sync).
- full diff surface vs base: exactly §4 IN SCOPE — 3 new schema/scientist-intent files, 4 fixture triplet dirs + 5 mutation fixtures, vocabulary.ts, 3 new test files, edits to parseScientistIntent/intentCompile/liftScientistIntent/normalizeScientistIntent/types.ts (doc-comment only). Zero app/**. Zero schema/workflow/**.

## 9. Cite mismatches recorded (spot-checks, not re-derived)
- §9 `grep -c "^  - "` verb-inventory == 31: fixture uses top-level `verbs:` with `- ` at column 0; `grep -c "^- "` == 31. Count identity holds.
- §3.1 line cites drift by 1-2 lines at this tip (KNOWN_ACTIONS actual :44-51 pre-edit; CANONICAL_ACTIONS actual :19-26; wire enum now at $defs/actionVerb :24-59 due to SPINE-1 restructure). Substance verified.
- §8 app pin 47/24 vs measured 34/28 in this worktree (app diff empty; N/A-once).

## 10. Unresolved issues for orchestrator
1. KNOWN_ACTIONS deletion (copy C) — adjudicate pin edit vs sanctioned retention (§7 above).
2. app tsc baseline drift (34/28 here vs 47/24 lane note) — informational; app untouched.
