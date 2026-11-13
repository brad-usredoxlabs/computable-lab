# VACUOUS-PINS ENUMERATION FOR L2-L2-VACUOUS-PINS-DEBT

## SOURCE CANDIDATES
Candidates were collected from three bounded sources:
(a) Item's own note list: `task-list.md:18147-18152`  
(b) Adversarial-review corpus under `~/.hermes/cl/lanes/2/reviews/` (grep hit list capped at 40 lines)  
(c) Orchestrator-recorded pin defects in item status history: `task-list.md:18142-18146`

## CLASSIFICATION RULE (D4 ARCHITECT RULING)
Per `STALE-ARCHITECT-OBLIGATIONS-DISCHARGED-l2-20261112.md:43-46`:
- **OWNED**: The pin belongs to an item that is otherwise DONE; this item carries its debt.
- **BELONGS-TO \<ITEM-ID\>**: The pin guards an item still open/in-progress/blocked.
- **DISCHARGED**: The claim is measurably no longer true at this base.

## PIN TABLE

| Label | Pin | Guarded Behavior | Item ID | Mutation Proof / RED Evidence | Evidence |
|-------|-----|------------------|---------|-------------------------------|----------|
| DISCHARGED | `server/src/ai/AgentOrchestrator.ghostpaint1.fold.test.ts:10` | production fold path carries details.labwareId via applySoleDeckPlacement in compileFoldedShorthand | N/A | Would RED if import removed; test relies on this symbol | Line 10: `import { compileFoldedShorthand } from './AgentOrchestrator.js';` |
| DISCHARGED | `server/src/receiving/ReceiveElicitation.test.ts:528` | Menu carries compose_receiving and ALL existing intents stay pinned in order | N/A | Would RED if intent enum missing compose_receiving or answer | Measured: `cd server && npx vitest run src/receiving/ReceiveElicitation.test.ts` → 22 passed (22) / Duration 10.56s |
| DISCHARGED | `server/src/compiler/resolution/hintParity.test.ts:161` | reason strings pass through VERBATIM with deep-equal parity assertions | N/A | N/A (test deleted) | Lines 160-170: comment states vacuous mutation-leg test was DELETED per adversarial review D2; no stand-in kept |
| DISCHARGED | `server/src/compiler/scientistIntent/realizeScientistIntent.test.ts:354` | vocabulary-member canonical 'shake' lowers via DIRECT vocabulary door (door 1) | N/A | Would RED same_operation mapping branch if vocabulary.has('shake') returns false | Test at :367 exercises door 2 (agitate -> shake mapping); both branches covered, non-vacuous |
| BELONGS-TO L2-PROTOCOL-LOCAL-BIND-1 | `app/src/run/RunWorkspacePage.tsx:195` | browser gate panel visible over fixed shell RunWorkspacePage.tsx layout | L2-PROTOCOL-LOCAL-BIND-1 | Would RED if panel painting order puts workspace behind fixed shell | task-list.md:18143: "panel painted behind fixed shell RunWorkspacePage.tsx:195" |
| BELONGS-TO L2-PROTOCOL-LOCAL-BIND-1 | `app/src/run/RoleBindingProposalsPanel.tsx:120` | protocolNotFound reason field preserved in error handling UI | L2-PROTOCOL-LOCAL-BIND-1 | Would RED if protocolNotFound drops reason field | task-list.md:18143: "protocolNotFound/reason dropped"; panel renders `data-protocol-not-found` marker |

CENSUS: 6 candidates -> 4 DISCHARGED / 2 BELONGS-TO (L2-PROTOCOL-LOCAL-BIND-1 x2).
