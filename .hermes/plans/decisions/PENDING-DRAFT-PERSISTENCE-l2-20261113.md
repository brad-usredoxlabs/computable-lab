# RULING — pending intent never becomes a record; drafts ride the checkpoint

Lane 2 · architect · 2026-11-13 · answers architect-card-20261112.md Q1 (DOC-INTAKE-1 g2 D4)
Status: BINDING for lane 2. Do not re-litigate in code, in a brief, or in a review.

## The question that was asked

Gate g2 recorded D4: a half-filled `/lab/materials/new` form is lost on reload. Two shapes were
on the table — (a) save-on-change into a governed "pending draft" record, or (b) session restore
only, in memory. A third, better shape exists and is the ruling: **the draft rides the existing
pending-intent checkpoint.**

## The ruling

**(b), routed through machinery that already ships — not (a).**

1. A half-filled form is **pending intent, not a record**. It has no provenance, no author
   attestation, and no committed meaning; giving it a `recordId` would create a second authority
   for "proposed" alongside the compiler's proposal path, which the architecture forbids
   (`computable-lab-principles.md`: proposal → compiler → native preview → accept; nothing is
   written before accept).
2. The durable home for pending intent already exists and is done: `PendingIntentStore` behind
   `POST /ai/threads/:endpoint/checkpoints` (save / load / resume / attachDelta,
   `server/src/api/handlers/PendingIntentHandlers.ts`, contract
   `server/src/compiler/journey/checkpointContract.ts:26-35`). That store is already file-backed,
   per user + endpoint + thread, version-guarded, and consumption-once. Reuse it. Do not build a
   second persistence mechanism, and do not add a record type called "draft".
3. The draft payload must be **declared and typed in the checkpoint schema**
   (`schema/workflow/pending-intent-checkpoint.schema.yaml`): a `draft` object naming the surface,
   the record kind being authored, the fields the person actually entered, and the unresolved slots
   still empty. It must NOT be stuffed into `restoration_state: Record<string, unknown>`
   (`checkpointContract.ts:32`) — that bag is unvalidated and would make the draft un-lintable.
   This is a data change (schema + contract + one client write on change), not a new subsystem.
4. Restore is a **reload of the draft into the form with its empty slots still empty and visibly
   empty**. Nothing is committed, nothing is "restored as if complete", and resume never implies
   acceptance: the person still presses the accept/save control. Two tabs, one draft: last writer
   wins on the version guard and the losing tab is told so — same rule the checkpoint store already
   enforces for resume.
5. A draft's lifetime ends three ways and all three are declared: it is committed (the checkpoint is
   consumed and the record is written by the governed accept path), abandoned (the person discards,
   the checkpoint is closed with no record), or superseded (a new intent for the same thread
   replaces it, and the old one is closed, not silently overwritten).

## Consequences for open work (binding)

- **DOC-INTAKE-1 / `/lab/materials/new` D4**: one unit — declare the `draft` slot, write it on
  change through the existing checkpoint route, restore it on mount, and prove reload + two-tab +
  discard with receipts. No new route family, no new store.
- **L2-JOURNEY-CHECKPOINT-1**: no rework owed. If its tests pin `restoration_state`'s shape, they
  stay green; the draft is additive and typed beside it.
- **Tests**: reload restores entered fields and leaves untouched ones empty; discard leaves no
  record; two-tab conflict is reported, not merged; nothing appears in `/records` while a draft is
  open.

## Not in scope

No autosave of a *partial record* into the store, no "resume without pressing anything", and no
draft record visible in any collection listing. A draft is not a thing in the lab; it is a
sentence you have not finished typing.
