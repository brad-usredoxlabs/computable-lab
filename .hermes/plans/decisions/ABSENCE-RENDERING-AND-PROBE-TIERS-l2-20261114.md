# Absence must be rendered on any request, and never asserted from one lookup tier

Status: BINDING ruling from the architect's card in handoff `2026-11-15T00:20-L2-tick-l2t2565`, adopted
2026-11-14. Closes the two outside-assignment defects (7 and 8) of the adversarial review of
`L2-P1-EMPTY-TURN-CARD-2-u1emptycard`.

## Ruling 1 — one absence request must render the absence card

**Measured:** `app/src/agent/ChatLog.tsx:604` mounts `ChatClarificationCard` — the ONLY renderer that
understands `request.absence` — only when `message.clarificationRequests.length > 1`. The empty-turn
guard emits EXACTLY ONE request (`AgentOrchestrator.ts:3142-3155`). So the turn that exists to say "this
type is not in the system; shall I create it?" renders a prompt and a picker with no statement of
absence and no create affordance. Human choice #1 is unmet client-side.

**Rule:** the clarification card (or its absence branch) must mount when ANY request carries an absence
payload, independent of request count. The single-request path keeps its immediate one-click behaviour
AND gains the absence statement plus the create affordance.

**Forbidden:** emitting a second synthetic request to satisfy `length > 1`. That is gaming the renderer's
gate instead of fixing it, and it would put a fictitious question in front of the person. A test must
assert the single-request absence case directly, so the count can never be load-bearing again.

## Ruling 2 — absence is never asserted from one tier

**Measured:** both call sites (`AgentOrchestrator.ts:3142`, `:3582`) pass `shorthandSearchLabwareByHint`
as the probe's lookup. That lookup searches `store.list({kind:'labware'})` only. The labware-definition
registry holds display names that no `labware` record carries: 32 of 38 seed definition display names
return nothing. The card would therefore assert "Not in this lab's records" for definitions the lab
HOLDS.

**Rule:** an absence assertion requires a probe across BOTH tiers before it is made:
1. `labware` store records (what the lab actually holds), and
2. the labware-definition registry by display name (what the lab knows).

The reason wording then distinguishes the three states, and must not collapse them:

- record found → no absence at all (offer it);
- definition found, no store record → "a definition exists in the registry, with no record in this
  lab's store (not lab stock)" — the wording already approved in the starter-pack ruling;
- neither → "not in this lab's records".

**Why this is not a small thing:** a false absence on a card that invites creation is a fabricated
refusal — the same defect class as the `offer_reason` lie we fixed for the deepwell search (a claim
about the store that the store contradicts). It is worse here because the card's next step is to CREATE
the thing the lab already has, producing a duplicate definition.

## Consequence

Both rules are prerequisites for prompt-1 acceptance criterion 2 (a definition exists with the geometry
the person entered) and for `not_done_if` 2 (no generic substitution). Neither may be dodge by changing
the manifest or the corpus text.
