# L2-LAB-INVENTORY-CREATE-1 u4select Report

## Unit
u4select — role-binding proposal projection for labware-instance records

## Summary
Changed the labware role-binding proposal loop to project concrete labware-instance
records (instead of abstract labware definitions) into the candidate list. When a
declared definition has one or more instances, those instances replace the definition
as candidates. When no instances exist, the definition itself is proposed as fallback.

## Changed Files
- server/src/protocol/roleBindingProposal.ts (lines 170-197: added labware-instance grouping logic)
- server/src/protocol/roleBindingProposal.test.ts (added 5 new tests for u4select)

## Decisions
- Instances replace (not supplement) the definition in the candidate list, preventing
  stateOf from demoting single-candidate roles to ambiguous
- Group instances by labwareId (definition recordId) using a Map, only including
  instances whose labwareId matches a declared definition
- candidateOf derives recordKind from envelope.meta.kind; no new label builder needed
- Deterministic sort preserved: candidates.sort(byRecordId) covers instance arm
- Bound arm semantics unchanged: a binding pointing at a definition ID still resolves

## Verification
- grep: listKind('labware') at line 185; listKind('labware-instance') at line 173
- Tests: 15 passed in roleBindingProposal.test.ts (10 existing + 5 new)
- 31 total tests passed across 3 test files (roleBindingWrite: 8, localPlanGraph: 8)
- runProtocolList.test.ts fails with pre-existing ajv module resolution error
- tsc: pre-existing errors in AiThreadStore.ts and AgentOrchestrator.ts; no new errors

## Remaining Legs
- u5: material-instance projection (noted in WHY; deliberately out of scope)
- u3shelf: term/labware shelf visibility (different seam)

## Fix Commit
5faa42c6f8ec66f67c6e908bd65d66f638e24f87

L2-LAB-INVENTORY-CREATE-1-u4select UNIT unit DONE 5faa42c6f8ec66f67c6e908bd65d66f638e24f87
