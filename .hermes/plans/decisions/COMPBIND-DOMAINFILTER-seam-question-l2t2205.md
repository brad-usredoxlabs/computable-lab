# RULING REQUEST: formulation-as-transfer-source — domain-filter ownership vs narrowing (L2-PROMPT2-COMPOSITION-BIND-1, 2026-11-06T02:2x EST, orch l2t2205)

## Measured blocker (coder's, with debug-trace evidence; report committed at 9bd37e65 in /home/brad/cl-wt/wt-L2-PROMPT2-COMPOSITION-BIND-1-u4)

Wiring in `server/src/compiler/resolution/resolutionEngine.ts` is correct: narrowing is reached and would disambiguate. But `filterCandidatesByDeclaredDomain(candidates,'labware')` in strategies/adapters rejects the formulation candidate (termKind 'material') BEFORE narrowing sees it → always ambiguous-noun.

Residual in worktree (uncommitted): a DEBUG console.log in resolutionEngine.ts + `import { narrowContenders } from './contenders.js'` — diagnostic scaffolding only, not a fix.

## The question (one seam)

Who owns formulation-as-transfer-source candidates:
1. change the domain declaration on the transfer/source vocabulary (data change), or
2. change the test contract (what termKind a formulation mint carries), or
3. change the domain-filter logic to admit 'material'-kind formulations when the intent is a transfer source (logic change).

All three are OUTSIDE the resolutionEngine seam the u4 unit was cut to. The fleet coder cannot pick between them without weakening scope.

## Same seam family

SCIENCE-CHAIN-1 browser-gate D1 (draft-kind mint refs vs record-kind refs at materialRefLabels.ts:728 arm gate) touches the SAME family: minted formulation refs and their kind. The next SCIENCE-CHAIN fix unit (D1-D3 on materialRefLabels arms) is HELD pending this ruling so one seam has one owner.

## Needed

Pick 1/2/3 (or re-cut the seam). Resume of COMPBIND coding and the SCIENCE-CHAIN D1-fix dispatch both gate on this answer.
