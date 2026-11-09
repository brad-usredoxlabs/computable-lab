# BRAD APPROVAL CARD — L2-WELLSET-TOKEN-EMIT-1 (amendment proposal, NOT queued)

Filed 2026-10-30T21:30 EDT (orch l2t2110) per architect ruling
`decisions/LABSTATE-SAMPLER-DETERMINISM-l2t1930-ruling.md` (END-RULING verified;
orch re-verified its load-bearing cites first-hand: vocabulary `wells kind: wellset`
+ `wellsetValueTokens` shipped; `resolve_wellsets` pass ordered after `resolve_nouns`;
passthrough arm `wellsetResolver.ts:545-551`; token absent from 7/7 audited receipts
— the architect reviewed all nine).

## What happened

L2-LABSTATE-CONTENTS-1's mix leg can NEVER go green as matters stand. Root cause is
NOT sampler non-determinism and NOT the item's diff: on every one of nine live drives
the model never emitted the declarative wellset token
`wells: all-wells-containing-materials` on the wire — it free-fills literal well
ranges or omits the arg. The server is contractually forbidden (never-guess) from
guessing the union, so vacuous `details {}` is the *named acceptance failure*,
correctly refused. The missing piece is PRODUCER-SIDE PROMPT DATA:
`schema/registry/prompt-templates/intent.compile.system.yaml` never teaches the model
that a contents-derived phrase ("all wells that have material") maps to the declared
token; RULES :97 actively discourage inventing wells.

## Proposed single lane-2 item: L2-WELLSET-TOKEN-EMIT-1

Declare the wellset token's producer-side semantics as DATA in the intent-compile
prompt template (ARGUMENTS/PARAMETERS/RULES block): a contents-derived phrase is
expressed on a `kind: wellset` argument as the vocabulary's declared token — never a
literal well list, never an invented labware noun. No vocabulary change needed (token
list already ships). Optional same-item work: a vocab-lint pin (P7 family) if desired.

Boundary note (architect Q1): `intent.compile.system.yaml` is the sampler/model-facing
surface, OUTSIDE L2-LABSTATE-CONTENTS-1's approved scope. That item is now structurally
blocked until this ships (ruling Q4): "Re-running a coin-flip harness against a
contract that was never engaged is not evidence either way."

## Acceptance (per ruling Q4)

1. Pre-flight n-probe: the ratified turn-2 utterance yields
   `wells: all-wells-containing-materials` in the shorthand.
2. Full SUITE-A `--all` green.
3. Downstream unblock: the L2-LABSTATE-CONTENTS-1 acceptance drive re-runs (post this
   item's merge) with the ruling-ratified turn-X control re-shape (deck-absent
   store-resolvable plate label, pre-flighted to exactly one bind:pass tier-1
   candidate) — one green all-legs run clears
   ED-L2-LABSTATE-CONTENTS-1-CANONICAL-SHAPE + ED-WELLSET-AC2-LIVE.

Model-variance evidence rides the item: receipt 235639Z turn-X shows the model
hallucinating a second mix action on the control prompt (strengthens the
under-declared-producer-surface case).

## To approve

Append your verbatim approval below (or tell the architect in a check-in). Silence is
not approval; the item stays unqueued until then.

## APPROVAL

> approved as-is

— Brad, 2026-10-30T22:28 EDT, verbatim via architect check-in (architect session,
recorded on Brad's behalf). Item is now APPROVED for queueing by the lane-2
orchestrator per acceptance 1-3 above.
