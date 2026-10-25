# LANE 2 SPEC — SAMPLE-CARD-1 (menu row for stated-but-uncommitted 'not-stated' facts)

Item: SAMPLE-CARD-1. Lane 2 trunk cl/integration-2. Authority: architect decision
.hermes/plans/decisions/W28-A5i-slotless-hedge-bar-decision.md (Q2 TASK SAMPLE-CARD-1,
binding; read fully).

## Root cause (architect-verified first-hand)
The 'sample' hedge arrives as free prose: reason not in the menu table AND no
actionLocation, so (i) no card renders (app/src/event-editor/right-pane/protocol/
ProtocolLocalizationThread.clarificationAdapter.ts:46-73 — a reason with NO menu row
never gets a card, argument or not) and (ii) ANSWER-BIND-1's exact-identity join can
never drop it (identityKey falls to label:<prose>, resolveNounsPass.ts:132-141).
HEDGE-TYPE-1 (companion task) makes the emitter TYPE these facts
(actionLocation + exact label + reason 'not-stated'); this task gives that reason its
menus so the fact becomes answerable.

## Scope (client presentation DATA ONLY — same sanctioned class as existing menu tables)
In clarificationAdapter.ts:
- ONE row in CLARIFICATION_MENU_BY_REASON (:46-50 pattern) for reason 'not-stated'.
- Argument overrides in CLARIFICATION_MENU_BY_REASON_ARGUMENT (:59-61 pattern):
  argument-named routes to '/l' where the declared arg contract's noun kind is labware
  (e.g. argument 'labware'), default '/m' — exactly the existing ANSWER-SURFACE-1
  pattern. NO schema change, NO picker change, NO resolver change, NO drop-rule change:
  the pick emits [[labware:<id>|label]], validateAnsweredSlots + answeredSlotBindings
  bind the slot, and the shipped §5.1 exact-identity join (b52f5dfc) drops the typed
  fact with zero new code.

## Acceptance criteria (verbatim from decision Q2 verified-by)
Client unit tests:
- a fact {reason:'not-stated', actionLocation:{argument:'labware'...}} maps to '/l'
  with NO mint floor;
- an unlocated {reason:'not-stated'} without actionLocation maps to the table default
  ('/m');
- every EXISTING engine-reason card mapping is byte-identical (the (reason,'*') fallback
  rule, :66-73 — pin the existing table with a snapshot/loop test if not already pinned).
npm run test:unit -w app green-set unchanged vs trunk baseline. RED first.

No product UI surface changes beyond the data tables -> no separate browser gate;
browser proof rides W28-A5D-R3 r3 (decision Q4 new assertion 1: the sample card renders
the '/l' surface with no mint floor).

## Environment
Worktree off trunk tip INCLUDING HEDGE-TYPE-1's merge if present (independent tasks —
either order; if it lands first, rebase off new tip). git -c core.fileMode=false.
Tests: cd app && npx vitest run <files>.

## Report / markers
Report .hermes/plans/SAMPLE-CARD-1-report.wip-<token>.md committed.
End stdout: 'SAMPLE-CARD-1 DONE <sha>' / 'SAMPLE-CARD-1 STOPPED <reason>'.
