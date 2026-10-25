# ANSWER-SURFACE-1 — Route labware-argument clarification cards to the '/l' menu

Lane 2 · item ANSWER-SURFACE-1 · spec l2t0835 · trunk base 534f7e5f
Origin: ARCHITECT DECISION .hermes/plans/decisions/W28-A5h-labware-semantic-noun-answer-decision.md
Q2 TASK ANSWER-SURFACE-1 (binding, verbatim in the decision). NOT Brad-gated (decision Q3).
No separate browser gate — its browser proof rides W28-A5D-R3 (decision Q4.2 surface assertion).

## Oriented facts (orchestrator-verified first-hand at trunk 534f7e5f)

- app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts:
  CLARIFICATION_MENU_BY_REASON (:38-42) keys reason -> menu ('unknown-noun'/
  'ambiguous-noun'/'resolution-lookup-failed' -> '/m'); heldFactToClarificationRequest
  (:75-110) reads `fact.reason` (:82) and picks `CLARIFICATION_MENU_BY_REASON[reason]`
  (:83), returns null when no menu. `fact` is the SPINE-1 frozen unresolved shape —
  actionLocation (with .argument) is ALREADY carried on the wire (module header :6
  says so; workflow/scientist-intent.schema.yaml:220-244). The file's OPEN QUESTION
  (:26-36) is exactly what this task closes.
- app/src/event-editor/right-pane/ai/ClarificationPicker.tsx: resolver selection at
  :31 (`menuProvider === '/l' || kind === 'labware'` -> resolveLabware); answerFromMention
  emits [[labware:<id>|label]] (:118-131); canMint material-only (:262) so a '/l'
  card honestly shows no mint floor; LAYER_PLACEHOLDER/placeholder branch (:254-261)
  already handles the labware wording. NO new chrome needed.
- AiClarificationRequest type: app/src/types/ai.ts (:245-247 area; menuProvider +
  optional materialLayer). Do NOT add fields unless TS forces it; '/l' is an existing
  AiClarificationMenuProvider value.

## Contract (presentation data only — sanctioned table extension)

1. Replace the flat reason->menu lookup with a lookup keyed on (reason,
   fact.actionLocation.argument): when reason has a menu AND the fact's
   actionLocation.argument === 'labware', select '/l'; every other combination keeps
   the existing reason-table value byte-identically ((reason,'*') default).
   `argument` is declared vocabulary data (arg-contract names) — reading it is a
   generic read of the wire fact, NOT a noun/verb/protocol literal. One table shape
   decision (nested map vs tuple key) is coder judgement; the (reason,'*') default
   must be the single fallback, no if-ladders.
2. No schema change, no server change, no server/src change. No materialLayer set on
   the '/l' request unless an existing pattern requires it (canMint already handles
   the floor).
3. The card's prompt/options/candidate handling stays untouched — only menuProvider
   selection changes.

## Acceptance criteria (verbatim obligations)

- Unit (RED-first, in the adapter's existing test file conventions —
  ProtocolLocalizationThread.clarificationAdapter / thread tests):
  (a) fact {reason:'ambiguous-noun', actionLocation:{argument:'labware'}} -> request
  menuProvider '/l'; (b) same reason WITHOUT actionLocation or with
  argument!=='labware' -> '/m' exactly as today; (c) every current table entry with
  (reason,'*') renders unchanged (pin per reason); (d) a fact with no menu for its
  reason still returns null.
- cd <worktree>/app && targeted suites green; full app run fail-FILE names zero NEW
  vs trunk baseline (comm -3 output in report); app tsc file-set comm-empty vs the
  21-file baseline. LiteraturePage.test.tsx suite-load failure pre-existing.
- Scope: `git -c core.fileMode=false diff <base>..HEAD` touches ONLY
  app/src/event-editor/right-pane/protocol/ (+ its test) and .hermes docs.

## Worker mechanics

- Worktree /mnt/vast/home/brad/git/wt/ANSWER-SURFACE-1-lane2-l2t<ts> (branch of same)
  off the THEN trunk tip, bootstrapped via the lane bootstrap pattern; node_modules
  are symlinks into Brad's tree — install nothing.
- Report .hermes/plans/ANSWER-SURFACE-1-report.wip-l2t<ts>.md (worktree), commands +
  raw outputs, end stdout exactly 'ANSWER-SURFACE-1 DONE <sha>'.
- All git -c core.fileMode=false. Never touch :3093/:5193/:3001/:5174, never restart
  stacks, never merge, no App.test.tsx edits.
