# SH-PROMPT-HYGIENE-1 — coder report (lane 2, l2t1830)

Worktree: /mnt/vast/home/brad/git/wt/SH-PROMPT-HYGIENE-1-lane2-l2t1830
Branch: cl/SH-PROMPT-HYGIENE-1-lane2-l2t1830 (off trunk 680643a1 — verified at start:
`git -c core.fileMode=false log --oneline -1` -> `680643a1 merge(SH-QC-1-OQ1): ...`)
Code commit: 8cfeae842e57aa652c4283b5295cc562ff72c744
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-16_1905-SH-PROMPT-HYGIENE-1-forced-draft-surface-conditional-spec.md

## What was implemented (RECOMMENDED option (a))

- `FORCED_DRAFT_TOOL_INSTRUCTION` (exported) is now composed as
  `[...FORCED_DRAFT_HEAD_BULLETS, ...FORCED_DRAFT_LEGACY_MIDDLE_BULLETS, ...FORCED_DRAFT_TAIL_BULLETS].join('\n')`
  from arrays extracted VERBATIM from the base file programmatically (line-number splice,
  zero transcription) — the exported value is byte-identical to base (hash proof below).
- NEW export `FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND` (AS-2): same head (incl. the :536
  instrument bullet) and same tail (closed-verb rule + generated contractBlock exactly once);
  the middle applies the spec's bullet-by-bullet replacement list:
  - :537 field menu -> "your turn must carry the field that acts — on this surface the action
    rides the `shorthand` document (or `deck_layout` / `create_record`) — not just the intent."
  - :543 tail "never a hand-built labwareRequirements payload" -> "never a hand-built legacy payload"
  - :544 placement clause -> "putting something the lab already owns on the bench goes through
    the shorthand document / deck context — NEVER a raw events payload on this surface; never
    create a second copy of a record the lab owns." (rest of the create_record guidance verbatim)
  - :545 equipment bullet kept with ALL equipment vocabulary intact; the plural legacy token
    "NOT labwareRequirements" -> "NOT a labware request" (AS-1 — see Assumptions; the spec's
    "keep :545 verbatim" and pin 1's token-ban are mutually contradictory for this bullet;
    resolved with the spec's own :543 technique: keep meaning, drop the token)
  - :546 generic-labware fallback kept verbatim (singular `labwareRequirement` is not the banned token)
- Selection at the ONE push site (base :1155, now :1208):
  `if (forceDraftTool) systemSections.push(surfaceDraftsShorthand(args.surface) ? FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND : FORCED_DRAFT_TOOL_INSTRUCTION);`
  ONE ternary on the existing DATA seam, inside buildPrefixRequest (warm/real parity seam).
  Zero new surface-name literals, zero new policy branches, zero YAML-schema change, no
  module-scope policy caching (surfaceDraftsShorthand still loads per call).
- create_record and deck_layout guidance stay in BOTH variants (the AS-4 refusal arm fires only
  on intent === 'event_graph'; verified untouched at :2604).

## RED-first evidence

RED run at base (test file written first, implementation untouched):

```
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

- FAIL pin 1 (workspace.deck forced section names event_graph/labwareRequirements) — expected RED.
- FAIL pin 4 (shorthand variant export missing) — expected RED.
- PASS pins 2 (event-editor + no-surface byte-stability === const), 3 (warm/real parity),
  5 (literal hygiene) — capture correctly scoped at base (spec's "if both fail, capture is
  mis-scoped" check satisfied: the byte-stability pins PASSED while the deck pin FAILED).

GREEN run after implementation:

```
 ✓ src/ai/AgentOrchestrator.forcedDraftSurface.test.ts  (5 tests) 100ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Byte-stability hashes (legacy const value, via tsx probe at base and after)

- Base (pre-implementation) legacy value sha256: f6e99cc7ac4adbefd7027f40725f9e3ea47e74a0772b0044fc1e00eb527f803b (length 10174)
- After implementation legacy value sha256:       f6e99cc7ac4adbefd7027f40725f9e3ea47e74a0772b0044fc1e00eb527f803b (length 10174)  -> BYTE-IDENTICAL
- Shorthand variant sha256: fda29f0f0c76b4b9775dc3b488f1bf91d398c42e840300c386ca1fb80107262c (length 10216)
- Splice script additionally asserted head/legacy-middle/tail arrays == base entry lines exactly
  ("legacy composition == base entry lines exactly (byte-identical by construction)").

## Mutation probe (spec bait #1: pin 1 must be discriminating)

Temporarily re-added the base clause "putting something it already has on the bench is
equipmentRequirements / labwareRequirements inside `event_graph`" to the SHORTHAND variant:

```
 FAIL  ... > pin 1 [RED at base]: the shorthand surface (workspace.deck) forced section names NO event_graph / labwareRequirements token
AssertionError: expected 'EVENT-EDITOR DRAFT MODE:\n- You MUST …' not to match /event_graph|labwareRequirements/
```

Pin 1 goes RED with the mutation. Restored; restore hashes:

- AgentOrchestrator.ts sha256 pre-mutation: 3cf729e5373af947a2c8b4784c8aa9e9886edab37dd5335ab3d08f51289ecf72
- AgentOrchestrator.ts sha256 post-restore: 3cf729e5373af947a2c8b4784c8aa9e9886edab37dd5335ab3d08f51289ecf72  -> byte-exact restore
- Post-restore re-run: `Tests 5 passed (5)`; legacy value hash re-verified f6e99cc7… (unchanged).

## Bar 1 — targeted family (verbatim tail)

`npm run test:run -w server -- src/ai/AgentOrchestrator.forcedDraftSurface.test.ts src/ai/AgentOrchestrator.equipmentInstruction.test.ts src/ai/shorthandContractDisclosure.test.ts src/ai/equipmentVocabulary.test.ts src/ai/workstateComposeRules.test.ts src/ai/analysisReferenceGrounding.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts src/ai/AgentOrchestrator.equipmentE2E.test.ts src/ai/AgentOrchestrator.repeatEcho.test.ts`

```
 ✓ src/ai/AgentOrchestrator.shorthandChat.test.ts  (19 tests) 515ms
 Test Files  9 passed (9)
      Tests  87 passed (87)
```

ALL PASS, 0 failed files. Re-run after the pin-4 strengthening (verb-set-equality added):
`Tests  87 passed (87)` (9 files). Refusal pins shorthandChat :217/:252/:290/:349 green unchanged
(pin 6 — file untouched).

## Bar 2 — golden-diff discipline: ZERO edits

`git -c core.fileMode=false diff 680643a1 -- server/src/ai/AgentOrchestrator.equipmentInstruction.test.ts server/src/ai/shorthandContractDisclosure.test.ts server/src/ai/equipmentVocabulary.test.ts server/src/ai/workstateComposeRules.test.ts server/src/ai/analysisReferenceGrounding.test.ts server/src/ai/AgentOrchestrator.repeatEcho.test.ts server/src/ai/AgentOrchestrator.shorthandChat.test.ts | wc -c` -> `0`

All seven direct-import/pin files show ZERO diff bytes. No golden edit was forced anywhere.

## Bar 3 — typecheck (counted, not exit-code-grepped)

`npm run typecheck -w server 2>&1 | grep -cE "error TS"` -> `1`

```
src/ai/AgentOrchestrator.ts(347,18): error TS2339: Property 'id' does not exist on type 'ResolvedRecordTarget | ResolvedOntologyTarget | ResolvedSequenceTabTarget | ResolvedSequenceRecordTarget'.
  Property 'id' does not exist on type 'ResolvedSequenceTabTarget'.
```

Exactly the 1 pre-existing baseline error; ZERO new lines.

## Full server suite + detach-base parity (fail-file comm)

Post-change run: `Test Files 90 failed | 638 passed | 9 skipped (737)` / `Tests 100 failed | 5978 passed | 70 skipped (6321)`.
Detach-base run (my two files reverted to 680643a1, suite re-run, then byte-exact restore —
restore hashes 3cf729e5… / 3fabd3f8… confirmed): `Test Files 90 failed | 637 passed | 9 skipped (736)` / `Tests 99 failed | 5970 passed | 70 skipped (6316)`.

`comm -3` of the sorted FAIL-file lists (base vs post):

```
	src/integration/W25DraftLifecyclePromotion.test.ts   (post-only)
src/revisions/Qms6bSchemaDrift.test.ts                  (base-only)
```

Both are 10s-testTimeout flappers under parallel load (Qms6b took 10512ms and FAILED at base,
10947ms and PASSED post; W25 timed out post). Targeted re-run of both in my worktree:
`Test Files 2 passed (2) / Tests 9 passed (9)`. Neither file imports AgentOrchestrator
(grepped: 0 matches). Fail-file sets are otherwise IDENTICAL — zero new failing files from this change.

ZymoCampaignNegatives: FAILS in BOTH base and post runs (3 test-level failures: W2-11 N2/N5
sha/import-closure pins) — PRE-EXISTING lane-excluded schema YAML condition, called out per
contract, NOT fixed, NOT counted as new.

## diff --stat from base 680643a1

```
 .../AgentOrchestrator.forcedDraftSurface.test.ts   | 193 +++++++++++++++++++++
 server/src/ai/AgentOrchestrator.ts                 |  59 ++++++-
 2 files changed, 249 insertions(+), 3 deletions(-)
```

AgentOrchestrator.ts hunks: @@ -526,14 +526,29 @@ and @@ -544,8 +559,46 @@ (instruction
construction) and @@ -1152,7 +1205,7 @@ (the one push-site ternary). Nothing else in the file.
Seeded git-excluded node_modules/schema symlinks and the restored lane-excluded files appear in
NO diff (git status shows only the two owned files).

## Stop-boundary check (OUT-of-scope artifacts verified untouched)

`git -c core.fileMode=false diff 680643a1 --stat -- app/ server/prompts/ config/ server/src/ai/submitSuggestionTool.ts server/src/ai/coerceAgentIntent.ts server/src/ai/shorthandChat.ts` -> 0 files.

- INTENT_KEYS / inferAgentIntent / coerceAgentIntent.ts / agent_intent enum /
  submitSuggestionTool.test.ts:287-302 enum-exactness pins: untouched (diff 0).
- submitSuggestionTool.ts:321 tool-def event_graph clause: untouched (OQ-2 residual).
- SUBMIT_SUGGESTION_INSTRUCTION (submitSuggestionTool.ts:59-77, ratchet): untouched. Still names
  `event_graph` (":63 intent \"event_graph\" to draft events") and is pushed at :1154 on migrated
  surfaces — the residual whole-message contradiction is REPORTED (OQ-2), not absorbed; the
  section-scoped pin is the honest falsifiable form (PIN-SCOPE NOTE honored).
- AS-4 refusal arm (now :2604, `shorthandSurface && agentIntent.intent === 'event_graph'`):
  untouched (grep-verified present, byte-unchanged); its pins shorthandChat :217/:252/:290/:349
  green unchanged in Bar 1.
- Precompile/deterministicOnly, buildForcedDraftJsonPrompt, config/drafting/forced-tool-compliance.yaml: untouched.
- Model choice, profiles, compliance probe, app/, YAML-schema changes, server/prompts/*: untouched.

## Assumptions

- AS-1: the spec's replacement list says keep :545 (equipment bullet) "EXACTLY as in the legacy
  const", but :545 itself contains "NOT labwareRequirements" and pin 1 bans that token in the
  deck section — mutually contradictory. Resolution: the shorthand variant's equipment bullet
  keeps the full bullet, all equipment vocabulary (equipmentRequirements, equipment:<kind>, EQP-,
  duplicate, not-a-refusal, never-claim-acceptance, NEVER a deck slot) and meaning, replacing
  only "NOT labwareRequirements" -> "NOT a labware request" (the spec's own :543 technique).
  Checked: equipmentInstruction.test.ts imports the LEGACY const directly (byte-stable, green);
  equipmentVocabulary.test.ts scans the legacy const at module load (unchanged); the advertised-
  kinds arrayContaining list survives intact (Bar 1 green). The legacy const's equipment tokens
  were never touched.
- AS-2: variant name `FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND` (spec: "naming is the coder's").
- AS-3: selection placed inside buildPrefixRequest (not run()) so warm/real parity holds by
  construction; pin 3 asserts strict section equality warm vs real (not weakened to contains).
- AS-4: :533's prose "the event graph" (space) is not the `event_graph` token; the shorthand-doc
  bullet stays verbatim in both variants. Pin 1's regex matches only the underscore token.
- AS-5: the fresh worktree was missing 109 git-IGNORED lane-2 untracked source files declared by
  core.excludesFile /home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430 (e.g.
  server/src/ai/materialRefFields.ts, imported by AgentOrchestrator.ts) — module load failed
  until restored. Restored byte-copies from cl-integration-2 (cmp-verified identical to the
  sibling SH-QC-1-OQ1 worktree's copies: 0 differing). They are git-ignored: `git status` shows
  only my two owned files; they appear in no diff.
- AS-6: W25DraftLifecyclePromotion / Qms6bSchemaDrift fail-file comm entries are timeout flappers
  (evidence above), not caused by this change.
- AS-7: report committed on the lane branch; the DONE marker cites the code commit sha40
  (precedent SH-QC-1-OQ1: marker cites the code commit, report committed after).

## OQ carry-forward (not this item's fixes)

- OQ-1: bench-equipment emission path on migrated surfaces (no equipment verb in the vocabulary;
  event_graph refused total) — both equipment bullets kept verbatim-in-spirit in both variants;
  no answer invented.
- OQ-2: SUBMIT_SUGGESTION_INSTRUCTION + submitSuggestionTool.ts:321 still name event_graph on
  migrated surfaces — recommend a follow-up item with Brad (ratchet strings).

SHPROMPTHYGIENE1 DONE 8cfeae842e57aa652c4283b5295cc562ff72c744
