# RULING — instance → definition identity is a record id, never a name

Lane 2 · architect · 2026-11-13 · answers architect-card-20261112b.md Q3 (subsumes Q2)
Status: BINDING for lane 2. Do not re-litigate in code, in a brief, or in a review.

## The question that was asked

How does a concrete, physical thing (a plate on the deck, a bottle in the fridge) point at the
design it was made from — and specifically, how does `L2-LAB-INVENTORY-CREATE-1`'s "＋ New instance"
resolve which definition it is an instance of? Three candidate answers were on the table:
name-resolved-at-boot, alias-exact matching, or a new governed link record.

## The ruling

**Identity is the record id, and the schema already says so.** No new mechanism, no new record
type, no alias matching as an identity path.

1. `schema/lab/labware-instance.schema.yaml:12` already requires `[kind, recordId, labwareId]`, and
   :22-24 defines `labwareId` as "Parent Labware recordId (design/spec)". An instance that cannot
   name its definition by record id is not a valid instance and must be refused with the field
   named — it is a schema violation, not a soft miss.
2. Name, label, alias and barcode are **preselection conveniences**, permitted only in the picker
   and only to pre-fill a candidate. They never establish identity, they never repair a wrong id,
   and a match on them is never treated as resolution. This is the same rule as the noun policy:
   a name is a hint, a record id is the truth (`Config` precedent: `labwareId` is a string beside
   `recordId` for exactly this reason).
3. If the picker cannot find a definition the person meant, the surface must render a **named
   unresolved slot** ("no labware definition matched '96-well deepwell' — pick one or create it")
   and stop. Silence, a nearest guess, or a name-resolved substitution is a defect of the same
   class as the ghost-first card defect: an assumption shown as a fact.
4. `RegistryLoader`'s name-resolution branch (`cfa4a938`, +223/-22, unmerged) is **not** to be
   landed as an identity path. Its legitimate half — using declared names to *pre-select* a
   candidate in a picker — may be reworked onto that narrower purpose with its own tests.

## Consequences for open work (binding)

- **L2-LAB-INVENTORY-CREATE-1 g3 legs D1/D6/D7**: the freeze is lifted for the seam, not for more
  symptom patches. One unit, one job: `＋ New instance` requires a resolved definition record id
  from the picker; every load/verify path that today re-derives the parent by name must instead
  read `labwareId` and, when it is absent or dangling, surface a typed unresolved slot naming the
  instance and the missing definition. No aliasing layer, no boot-time rewriting.
- **L2-SEED-LABLOCAL-1 D2 (Q2)**: answered by (1) — an instance's definition link must be a real
  record id present in the store; alias-exact matching is not an acceptance criterion, and a
  bootstrap that "resolves" a definition by name must be replaced by seeding the definition and
  referencing its id, or be refused visibly.
- **Tests to write**: a dangling `labwareId` renders a typed unresolved state (non-vacuous, RED
  first); a name that matches two definitions does not resolve; a definition renamed after the
  instance exists does not change the instance's parent.

## Why this is the right seam and not another patch

Nine adversarial FIX verdicts in 24 hours on one item, and two unclosed runs, is the signature of
treating a lookup that guesses as if it were a lookup that knows. Every patch so far taught the
guess a new trick. The store already carries the answer as a typed field; the fix is to stop
accepting anything else.

## Not in scope

Nothing here authorises a general "resolver" service, an alias table, or a migration that rewrites
existing records. If existing seeded records carry a dangling `labwareId`, they surface as named
unresolved slots and are fixed by re-seeding — never by silent repair at boot.
