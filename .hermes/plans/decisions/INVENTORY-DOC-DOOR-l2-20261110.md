# Ruling — packing slip / invoice is the third door onto inventory creation

Lane 2, 2026-11-10. Brad, verbatim: *"similar to labwares and materials, inventiry should be able to be
created by uploading a packing slip or invoice."* Queued as `L2-INVENTORY-DOC-INGEST-1` (deps:
`L2-LAB-INVENTORY-CREATE-1`, `L2-SPEC-SHEET-INGEST-1`).

## The shape

Three doors, one extractor, one write path: material spec sheet, labware spec sheet, delivery document.
The first two search the web for a sheet; this one reads a document the lab already has. Same
proposals-with-citations contract, same refusal to write before confirmation.

Driving detail that makes it different: **a delivery document is a list.** One invoice is N receipts.
That must be expressed as data, not as a bespoke loop — the extraction spec gains a declared repeating
target (line-item repetition) and a new field map `schema/ingestion/packing-slip.material-receiving.yaml`
declares the columns. A coder who writes line-item iteration in TypeScript has put policy in code.

## Resolution rules per line (no silent picks anywhere)

- Catalogue number -> vendor product: **exactly one** match proceeds. Zero matches leaves that row
  visibly unresolved and offers "create that vendor product first". Two matches **refuses** with both
  ids named and blocks only that row. Identical to the labware-alias rule already in force.
- Lot string is vendor-scoped, never globally unique.
- Quantity and unit come from the line, but the *instance* is created by the receipt (MATRES-RECV
  semantics) — no free-standing instance, ever.
- The uploaded file and any page crops are stored as data-references, never inline blobs.

## What the document cannot supply, it must not invent

`material-receiving` requires `claims`, not a lot field: the lot is an attested claim. So an invoice
that states no lot still produces a VALID receipt whose claim set says the lot was not stated — the
missing lot is then added by supersession when the packing slip or label arrives (corrections are
supersession per the foundation, never a second arrival). What is forbidden is a placeholder lot
string, a guessed expiry, or a rounded quantity.

Invoice unit price has no home on the receipt and does **not** auto-create a vendor offer in this
item: price belongs to `vendor-offer`, and creating offers from an invoice is a separate, deliberate
step with its own evidence. Record the price as part of the stored document; do not promote it.

## Honest negatives the gate must show

- A document that yields no line items reports an explicit no-line-items outcome — it cannot look
  like success.
- A stated total that contradicts the sum of line quantities is REPORTED in the proposal, not
  reconciled silently.
- Nothing appears without a citation, and nothing is written before the user confirms a line.
