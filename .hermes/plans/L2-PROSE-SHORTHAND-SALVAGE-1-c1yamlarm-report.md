# REPORT — L2-PROSE-SHORTHAND-SALVAGE-1 / unit c1yamlarm (1 of 2)

Worktree: /home/brad/cl-wt/L2-PROSE-c1yamlarm-lane2 (local disk)
Branch: cl/lane2-prose-c1yamlarm-0812
Base: fb603a5c75fe4ec26a0642e724097e28e066e33c

## STATUS: complete (C1a/C1b/C1c + the C2 server half: the driver value exists and is emitted)

## What landed
`coerceDraftArgsFromContent` / `recoverDraftArgsFromContent` now run ONE internal pass
(`recoverDraftArgsCore`): the existing JSON/`<tool_call>` attempt and argument-key guards
unchanged and FIRST, then — only if those fail — the YAML arm. A shorthand document carried
as text is validated by the existing `parseShorthandForChat` (Ajv sole authority) and, on
success, recovers as the existing shorthand envelope
`{ intent: 'event_shorthand', shorthand: <document verbatim> }` with
`recoveredFrom.driver === 'yaml-shorthand'`. On rejection nothing is coerced: `args: null`,
and the validator's OWN text (its `message` plus the first Ajv row: instance path + the
schema's suggestion naming the offending value) rides `refusal` into the caller's STATUS
channel only — the status event `Refused the shorthand draft in the model's text: <refusal>`.
The code does push that text onto `extraSubmissionNotes` (:2853), but refusal paths never
merge that array into `result.notes` (reviewer probe: notes=undefined on the event-editor
result), so there is NO notes-channel delivery for a refused draft; the caller's re-ask
budget still runs. No second parser was added; `DRAFT_ARG_KEYS` / `SHORTHAND_ARG_KEYS`,
`parseShorthandForChat`, `shorthandChat.ts`, `coerceAgentIntent.ts`, the prompt text and the
:2715 status line shape are untouched.

Accepted shapes are DATA in `config/drafting/draft-content-recovery.yaml`
(shape/driver/enabled). `AgentOrchestrator.ts` holds the only `parseYaml` use for this path
(`extractShorthandYamlCandidate`), reads the DATA per call (the `forcedToolCompliance`
precedent: a DATA edit needs no restart; this is a deliberate deviation from the brief's
word "cached", justified by that file's own documented rule — no behaviour depends on
caching), and throws naming the file path if it is missing or malformed.

## Files changed (the three owned code/DATA paths, plus this report as the fourth file)
- server/src/ai/AgentOrchestrator.ts
- config/drafting/draft-content-recovery.yaml (new)
- server/src/ai/coerceDraftArgs.yamlRecovery.test.ts (new)
- .hermes/plans/L2-PROSE-SHORTHAND-SALVAGE-1-c1yamlarm-report.md (this report — the fourth file)

`git diff fb603a5c --name-only` lists exactly those three; `coerceDraftArgs.test.ts` is
byte-identical to base (C1b pin, 10/10 green unmodified).

## Commits (code head = 102085a1c3b2ebb8c557c924fa46192e34bc39f0)
- a20c2269835b6c532c05774216f3f7cc6a63c512  RED legs for YAML shorthand recovery (C1)
- 238f67d1286cd48f2c9d9e9a719ce1c824e581d3  declared recovery shapes + YAML candidate/loader helpers
- 2f9140a37e64f31c76734f5249e0c47b89ed6a63  wire the yaml-shorthand recovery driver + named refusal
- 10770efcaaa7f3d80c4680f9c313af6b12130a60  compact helper block, load recovery DATA per call
- 102085a1c3b2ebb8c557c924fa46192e34bc39f0  refusal carries the validator row (named reason)
(the report commit that follows this file contains only this report)

## VERIFY (verbatim, run at code head 102085a1)

1. `cd server && npx vitest run src/ai/coerceDraftArgs.test.ts src/ai/coerceDraftArgs.yamlRecovery.test.ts`
```
 ✓ src/ai/coerceDraftArgs.test.ts  (10 tests) 5ms
 ✓ src/ai/coerceDraftArgs.yamlRecovery.test.ts  (5 tests) 32ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  08:59:57
   Duration  2.95s (transform 897ms, setup 0ms, collect 2.80s, tests 37ms, environment 0ms, prepare 167ms)
```
exit 0.

2. `cd server && npx tsc --noEmit`
```
TSC_EXIT=0
```
(zero output)

3. `git status --short` → empty; `git log --oneline -6`:
```
102085a1 L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlarm: refusal carries the validator row (named reason)
10770efc L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlarm: compact helper block, load recovery DATA per call
2f9140a3 L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlarm: wire the yaml-shorthand recovery driver + named refusal
238f67d1 L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlarm: declared recovery shapes + YAML candidate/loader helpers
a20c2269 L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlarm: RED legs for YAML shorthand recovery (C1)
fb603a5c lane2 handoff amend: g6d2 advc c1 FIX 2
```

4. Driver probe (unit level, `npx tsx /tmp/driverProbe.mts`, stack NOT started):
```
[fenced-yaml] args={"intent":"event_shorthand","shorthand":"intentId: seed-hepg2\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n    targetWells: [A1]"} recoveredFrom={"driver":"yaml-shorthand"} refusal=none
[agent probe01] recovered draft args from content as submit_scientist_intent; driver=yaml-shorthand; skipped the second call
[bare-yaml] args={"intent":"event_shorthand","shorthand":"intentId: seed-hepg2\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n    targetWells: [A1]"} recoveredFrom={"driver":"yaml-shorthand"} refusal=none
[agent probe01] recovered draft args from content as submit_scientist_intent; driver=yaml-shorthand; skipped the second call
[invalid-enum] args=null recoveredFrom=null refusal=scientist-intent failed schema validation: 1 error(s): /actions/0/action "teleport_sample" is not allowed here; choose one of: seed, incubate, mix, resuspend, dilute, shake, count, read, add_material, create_container, transfer, stain, fix, permeabilize, block, quench, label, transfect, aliquot, wash, elute, harvest, passage, freeze, thaw, spin, pellet, serial_dilution, media_swap_duplicate_columns, source_wells_to_duplicate_target_columns, repeat_rows, bead_beat.
```

## MUTATION PROBE (raw)
Mutation: `if (true) return { args: null, driver: null };` inserted immediately before
`extractShorthandYamlCandidate(content)` in `recoverDraftArgsCore`, then
`npx vitest run src/ai/coerceDraftArgs.test.ts src/ai/coerceDraftArgs.yamlRecovery.test.ts`:
```
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 12 passed (15)
```
The 3 failures are the two positive YAML legs and the refusal leg; the JSON legs and the
prose-mention leg still pass, and `coerceDraftArgs.test.ts` stays 10/10. Mutation reverted;
tree clean.

## Reviewer-bait pre-emption
- `exactOptionalPropertyTypes`: `refusal` is spread conditionally
  (`...(recovered.refusal ? { refusal } : {})`); `recoveredFrom` is `null`, never `undefined`.
- No surface ids, no `'yaml'` magic string, no per-shape `if` chain: the arm is gated by
  `declaredDraftDriver(shape)` iterating the YAML `shapes:` list; grep of the diff for
  `'event-editor' | 'run-workspace' | 'workspace.deck'` is empty.
- Exactly one `parseYaml` use for this path (inside `extractShorthandYamlCandidate`); the
  refusal is `error.message` + the validator's own first row, never a re-derived string.
- Stack not started; no YAML-reload exposure.

## Deliverable / budget note (disclosed, not silent)
At c1 HEAD f7a419d7, `git -c core.fileMode=false diff --stat fb603a5c..HEAD` = 4 files
changed, 408 insertions(+), 37 deletions(-) — the fourth file is this report (the earlier
"3 files" claim was wrong because the report commit itself is in the range). The
200-line budget is exceeded; the overrun is comment/validation text plus the mechanical
re-indent of the pre-existing `coerceDraftArgsFromContent` body into the single-pass core
(~50 lines of pure indentation churn). No files were widened: still exactly the three owned
code/DATA paths plus this report. If the reviewer wants the budget met literally, the cheapest cut is the loader's
per-field named errors — flagged here rather than silently dropped.

## Next actions / remaining blockers
- Independent review + the browser gate re-run own acceptance (this unit does not self-accept).
- C2 surface half (the `recoveredFrom` attribute on the done payload's consumer) is the
  separate unit; this unit only guarantees the driver value exists and is emitted.
- Nothing blocked; no config reload needed for the lane stack beyond the orchestrator's own
  restart when it next redeploys this branch (the DATA file is read per call).

## fix1 — advc C1 defects D1-D4 (unit c1yamlarm-fix1)

- D1 (MAJOR, test-only): added the leg "does NOT recover a declared-but-disabled shape
  (`enabled: false` gates the arm)". It points the loader at a temp policy DATA file
  (narrow seam: optional `policyPath` on `loadDraftContentRecoveryPolicy`,
  `declaredDraftDriver`, `recoverDraftArgsCore` and the two public entry points; production
  callers pass nothing) that declares `fenced-yaml` with `enabled: false`, and asserts args
  null / no yaml driver frame.
  Mutation proof M2a (`declaredDraftDriver` body -> `return 'yaml-shorthand';`):
    FAIL  coerceDraftArgs.yamlRecovery.test.ts > ... does NOT recover a declared-but-disabled shape
    AssertionError: expected { intent: 'event_shorthand', ...(1) } to be null  (line 75)
    Tests 1 failed | 5 skipped (6)
  Reverted: `Tests 8 passed (8)` (after D3 legs landed); at D1-only commit `6 passed (6)`.
  No named refusal was added for a declared-but-disabled shape: that stays a silent drop,
  because the existing `if (driver)` guard carries no refusal path without widening scope.
- D2 (report): corrected the false claim — the refusal rides the STATUS channel only;
  refusal paths never merge `extraSubmissionNotes` into `result.notes`.
- D3: chose the documented FAIL-CLOSED contract over structural-only membership: one comment
  line at the `DraftContentShape` declaration states the closed unions are what the extractor
  /`RecoveredDraftDriver` can emit, so DATA naming anything else throws by name (a new shape
  is a code change, never silently half-data). Pinned non-vacuously by two new legs: unknown
  `shape` and unknown `driver` in temp DATA both throw naming the accepted vocabulary.
- D4 (report): stat line now quotes the f7a419d7 range (4 files, 408 insertions(+),
  37 deletions(-)) and names this report as the fourth file.

Verification: `timeout 300 npx vitest run server/src/ai/coerceDraftArgs.yamlRecovery.test.ts`
= 8 passed (8); `cd server && timeout 240 npx tsc --noEmit` = rc 0.
Code commits: 9021ad4e (D1), 8cc3550f (D3).

L2-PROSE-SHORTHAND-SALVAGE-1-c1yamlarm UNIT unit DONE 102085a1c3b2ebb8c557c924fa46192e34bc39f0
L2-PROSE-SHORTHAND-SALVAGE-1-c1yamlarm-fix1 UNIT 1 of 1 DONE 8cc3550fa03b61386db4d368c3193b0ff1314051
