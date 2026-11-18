# Ruling — spec-sheet door B (labware): build the minimal labware door (option a)

Lane 2, 2026-11-10. Answered by cl-architect in response to the tick question repeated at
l2t0800 / l2t0825 / l2t0855 / l2t0910 / l2t0930 / l2t0950 ("Door-B decision question
(architect/Brad — no blind dispatch)"). That question has been blocking a leg since 08:00 EST and
should not have waited on Brad: it is a within-scope implementation choice, decided here.

## The question, as the tick posed it

`L2-SPEC-SHEET-INGEST-1`'s approved clause requires two doors onto the one extractor: materials and
labware. Door A (materials) is proven on a served build. Door B does not exist at all: the labware
tab under `/lab` has no create control, no create modal anywhere in the tree, and the only client
seam for extraction is `apiClient.extractSpecSheetProposals` with a single caller
(`VendorProductBuilderModal.tsx`, `recordKind:'vendor-product'`). Options offered: (a) minimal
`+ New labware` door reusing the `+ New material` pattern, as a leg inside the existing item; or
(b) narrow door B to the server arm, which is already typed and proven.

## Ruling: (a) — build the minimal labware door

Reasons, in order of authority:

1. **Brad's instruction is explicit and uses the word "both".** 2026-11-09, verbatim: *"both labwares
   and materials should have an ingest behavior that uses the exa search (or whatever web search) to
   pull in the spec sheets abd fill in the details based on the spec sheet."* Option (b) narrows an
   approved clause against the words that approved it. That is a scope change, which is exactly what
   the no-re-litigation rule forbids doing silently, and it is not needed here.
2. **It is a wire-up of a pattern that already exists, not a new surface in the sense that matters.**
   `+ New material` is merged, browser-accepted and rides the same modal shape; the labware door is
   the same component with `recordKind:'labware'`, which the server arm already accepts and the gate
   already exercised (g2 CHECK 5). The create modal itself, its form spec and the vendor-product
   validation path are not being invented.
3. **Labware is on the prompt-3 path.** The journey creates its vessel (the single-trough reservoir is
   seeded, but a driver adding labware by hand before a run is the same user story as Brad's Q2
   Option C, which was about materials only because that is what he happened to be looking at).
4. **The alternative is worse in practice.** Narrowing door B leaves the clause's second half
   permanently unimplemented and would have to be re-opened the moment anyone tries to ingest a
   flask or a reservoir spec sheet — the exact case that prompted the request.

## Scope of the leg (within the existing item; no new item, no scope card)

- A create control on the labware tab under `/lab` reusing the `+ New material` affordance pattern,
  reaching the SAME builder modal component with `recordKind:'labware'`.
- The modal's "find the spec sheet" step calls the already-mounted extractor endpoint; proposals
  arrive with source citations; nothing is written until the user accepts.
- Negative behaviour unchanged and mandatory: empty proposal list never renders as success; no value
  may appear without a citation; an unconfigured search provider is reported as unconfigured, never
  as "no data found".
- No new record schema, no second extractor, no duplicated field map. If a field is genuinely
  labware-only, it is added to the existing per-record-type field map YAML, not to TypeScript.

## What this does NOT authorize

- No change to the item's acceptance clauses (the two-door clause stays as approved).
- No new work on door A, whose remaining defect (proposals carrying table header text as the field
  value — SPECSHEET browser gate g3, 2026-11-10) is a separate fix already queued.
- No permission to edit the item's status by the coder; the orchestrator closes it on gate evidence.

## Verification expected

Externally observable on a served revision: from the labware tab, open the new-labware affordance,
search a real labware spec sheet, see proposals with citations, accept, and find exactly one labware
definition record created with the proposed values and the citations retained. A negative run with
the search provider unconfigured must show an explicit unconfigured message and create nothing.
