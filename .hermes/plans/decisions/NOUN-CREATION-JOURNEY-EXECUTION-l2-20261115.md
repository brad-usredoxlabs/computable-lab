# NOUN-CREATION JOURNEY — EXECUTION RULING (after outside review)

Status: RULING by the architect, 2026-11-15, at Brad's request ("run the gpt astra query to get an outside
opinion of the best way to execute this"). The reviewed plan was mine; the review overruled four parts of it
and this document records the corrected execution shape. Brad's canon for the journey is unchanged:
`test-prompts/creation-journey.md`, and his binding words on the return are quoted in the packet.

Packet, raw response and proposal: `~/.hermes/specs/intake/2026-11-15_noun-creation-journey/`
(model `openai/gpt-6-astra`, high reasoning, 165.5 s, 3,097 in / 5,103 out (2,588 reasoning), $0.294).

## What the review agreed with

- The journey should be **shared**, not one per noun kind.
- The return-to-the-jumping-off-point is the right mechanic, and the returned noun must be bound by
  identity and recompiled into the original request — never re-resolved from prose. Gates 10–12 support it.
- Sequence it **between prompt-1 recertification and prompt 1b**, using 1b as its first real consumer.

## What it overruled in my plan (all four accepted)

1. **Doors derived from missing fields — WRONG.** Brad's three doors encode different *provenance intents*,
   not three ways to fill one form. A requirements engine must never decide which history is true: the same
   missing noun can legitimately take any door, and an unidentified-origin bottle is a valid state, not
   missing data. The doors stay as declared journey data.
2. **Requirements scoped by noun kind — TOO BROAD.** Scope them to *operation × lifecycle stage × acquisition
   strategy*. My examples were wrong: a material need not have a known composition; an antibody need not have
   a clone (polyclonal); a saved formulation does not establish that a batch was made or that inventory exists;
   a definition does not establish that a physical plate was placed.
3. **"Completion = a committed record id" — INSUFFICIENT.** Completion means committed outputs *in the
   required lifecycle roles* satisfying a declared contract. Some paths return several related records
   (concept + formulation + attested inventory).
4. **"Must not prefill form fields" — WRONG, and it conflicts with Brad's automated ingestion.** The correct
   boundary: extracted or suggested values remain identifiable **candidates** with visible sources and
   uncertainty; missing values stay missing; human acceptance authorizes regulated creation; committed facts
   keep provenance. A catalogue number read from a selected vendor document may be proposed; geometry guessed
   from the words "96-well plate" may not.

## The one constraint to impose now

> Every journey transition — including completion and return — is governed by a **versioned task contract**
> declaring its input requirements and its **typed lifecycle-role outputs**. No page or chat handler may
> invent completion policy.

New task capabilities are allowed; uncontracted exceptions are not. My "if the second noun needs a TypeScript
branch the shape is wrong" test was too crude — a geometry editor and a formulation editor legitimately differ
in implementation. What must not live in TypeScript is hidden noun-specific policy about prerequisites,
provenance, sufficiency or destination.

## The return contract (recorded, because it is the trust mechanic)

Persist: journey id / principal / status / concurrency revision; origin (original message id and **verbatim**
text, conversation, run/deck identity, **selected well identities** — not "whatever is selected on return");
pending requirement (stable slot id, expected lifecycle role, completion contract); execution definition
(workflow, requirement, schema versions, compiler version); progress (strategy chosen, current task, prefill,
resumable drafts, accepted outputs); dependencies (records **with observed revisions**); receipts
(idempotency, completion, acknowledgement, cancellation reason).

On return: revalidate existence, accessibility, lifecycle role, current revision, and the original run/deck/
well/occupancy/permission state against the pinned workflow versions. An irrelevant label edit need not
re-open the journey; a geometry change, depleted source, deleted record or changed operation meaning must.
Returning **must not execute** the original action — it produces a fresh, visible proposal, and acceptance
rechecks dependency revisions. One effective completion and one event commit per journey.

## Sequencing (binding)

1. Prompt-1 recertification. Creation cannot repair a resolver that cannot consume an existing definition.
2. `L2-NOUN-CREATION-JOURNEY-1` — the vendor-backed **labware** branch, including the interruption tests
   (close/reopen mid-edit; interrupt after commit before acknowledgement, the double-create trap), cancel,
   wrong-kind output, edited/deleted returned record, and an inspectable end-to-end evidence chain.
3. Prompt 1b verbatim, live, with the reviewer naming the served revision. Missing real ingestion or ontology
   prerequisites are BLOCKED, not permission to bypass the canon path.
4. `L2-NOUN-CREATION-FORMULATION-2` — the local formulation branch, which tests concept/formulation/inventory.

## Explicitly deferred

A universal form compiler; every acquisition strategy for every noun; sophisticated sample scanning and
equipment-specific UX; broad vendor-enrichment expansion; a general nested-prerequisite planner.
Unimplemented branches must be **visibly unavailable**, never apparent successes.

## The missing question, and what it obliges

The review asked where a suggestion becomes a fact — and noted that the knowledge layer currently holds zero
assertions, zero evidence and zero context-role records, so the ontology connector cannot be treated as a
navigation detail. The first relevant branch must prove it produces the intended knowledge records (roles,
context, evidence), not merely a term URI on a material record.
