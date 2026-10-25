# SPEC — MATRES-SHELF: Concept-keyed inventory lookup (side lookup, campaign 2)

Task: MATRES-SHELF (lane 2, campaign MATERIAL-RESOLUTION & ATTESTATION). Claimed
2026-10-19T18:35 EDT. Independent of MATRES-0 per campaign header.

## Shape decision (spec must pick one — THIS spec picks SIDE LOOKUP, and why)

**Side lookup module, NOT a spine adapter.** The spine (`server/src/resolve/
ResolveSpine.ts`) answers "what noun is this term?" — one term in, CURIE-ranked
candidates out, tier-scored (types.ts:50-66). The lazy-brand question ("what brand
of DMSO do we have") is an INVENTORY query: no single term-to-CURIE ranking is the
output; the output is a grouped bill of RECORDED MATERIAL. Bolting it onto a spine
tier would force an inventory report through the RankedCandidate ranking law (tier
gap dominates score) and pollute noun resolution with custody-shaped data — both
against P4 (occurrence-level vs inventory-level are different queries) and P7.
The spine adapter interface (`CandidateAdapter { id; gather(label, req):
Promise<TierOutcome> }` — server/src/compiler/resolution/types.ts:53-56, verified
by orch) is the wrong return shape for a grouped inventory report. Ship it as a
dedicated lookup module behind a read-only API handler, so the chat/UI can call it
directly (later MATRES tasks consume it).

## Verified repo anchors (orch-verified 2026-10-19, trust these over exploration)

- `server/src/resolve/providers/records.ts` — TIER-1 LEXICAL provider: matches
  `name/title/label/synonyms` substring only (:31-40, :69-71). This is exactly the
  gap: a bottle filed "Sigma D8642" never matches a "DMSO" query lexically. Copy
  its *provider style* (factory over `RecordStore`, kinds list, per-kind try/catch
  :62-67) but NOT its matching law.
- `RecordStore.list(filter?: RecordFilter): Promise<RecordEnvelope[]>` —
  server/src/store/types.ts:167. No query index beyond kind — filter in code.
- Join data (schema verified):
  - `schema/lab/vendor-product.schema.yaml`: required `material_ref` (:14) — the
    existing concept<->catalog join. Also `vendor`, `catalog_number` (:14).
  - `schema/lab/material-instance.schema.yaml`: optional refs `material_ref`,
    `material_spec_ref`, `vendor_product_ref`, `parent_material_instance_ref`
    (:29-39).
  - `schema/lab/material-lot.schema.yaml`: required `material_ref` (:13),
    `lot_number` (:27), `vendor_lot` (:39).
  - `schema/lab/aliquot.schema.yaml`: optional `parent_material_instance_ref`,
    `source_lot_ref`, `material_spec_ref` (:27-37).
- Handler wiring pattern: optional-handlers registration in
  `server/src/api/routes.ts` (e.g. `materialProfileHandlers?: MaterialProfileHandlers`
  :124; factory `createMaterialProfileHandlers` at
  `server/src/api/handlers/MaterialProfileHandlers.ts:92`). Follow that pattern for
  a new `InventoryShelfHandlers` (or add to an existing narrow handler file — coder
  picks, cite in report).
- Server typecheck baseline: 0 error lines at trunk (post-OPTIONBIND). App tsc 23 —
  untouched (server-only change expected).

## Contract (BINDING)

New module `server/src/resolve/shelfLookup.ts` (name fixed):

1. `createShelfLookup(store: RecordStore): { queryShelf(term: string):
   Promise<ShelfReport> }` — async, read-only (store.list ONLY; zero writes; a
   write-spy test proves it).
2. Resolution rule (NON-lexical-first): resolve the term to concept/material
   records via the SAME local tiers the spine would use for the CONCEPT, then join
   DOWN to inventory. Minimum viable join set (do not invent a new resolution
   engine — reuse `createRecordProvider(store, ['material'])`-style concept hits,
   plus direct `vendor-product.material_ref` membership):
   - a `material-instance` surfaces if ANY of: its `material_ref` ∈ concept ids;
     its `vendor_product_ref` -> vendor-product whose `material_ref` ∈ concept ids;
   - `material-lot` via `material_ref`; `aliquot` via `parent_material_instance_ref`
     (instance already surfaced) or `source_lot_ref` (lot already surfaced).
   - The canonical fixture proves the point: instance payload name "Sigma D8642"
     with NO 'DMSO' anywhere in its own payload, joined to the DMSO concept ONLY
     through its vendor-product -> material_ref, MUST surface for query "DMSO".
3. Output shape `ShelfReport`: grouped by vendor/lot. HARD NAMING LAW (P7): every
   report line is RECORDED MATERIAL — the words `available`, `availability`,
   `reserved`, `sufficient` must appear NOWHERE in the response shape or field
   names (test greps the serialized JSON). Each entry: recordId, kind, label,
   referent level (instance|lot|aliquot), vendor (from vendor-product when joined),
   lot string (vendor_lot/lot_number when present), join-path recorded as data
   (`joinedVia`: e.g. `vendor-product` | `direct-material-ref` | `unknown`).
4. MISSING LINKS ARE VISIBLE: instances/lots with NO resolvable concept join that
   matched the term lexically (name/synonyms, records.ts-style match) surface with
   `joinedVia: 'unknown-provenance'` — never silently absent (task text), and with
   no provenance claim attached.
5. HTTP surface: one read-only GET route (path `GET /api/inventory/shelf?term=...`
   unless an existing read route pattern is a better fit — coder decides, cites the
   pattern) registered via the optional-handlers pattern. No UI in this task.
6. No new vocabulary verb; no schema file changes; no spine file changes
   (`ResolveSpine.ts`, providers/, compiler/resolution/* BYTE-UNCHANGED — proven by
   three-dot diff). All policy above lives as data-const tables INSIDE the new
   module only where unavoidable (kind->level map may reuse the existing
   `KIND_LEVEL` shape by import, not copy, if exported; if not exported, a local
   const is acceptable — record as assumption).

## Ownership (hard boundary)

CREATE: server/src/resolve/shelfLookup.ts + shelfLookup.test.ts (+ handler file +
its test if a new handler is chosen). EDIT ONLY: server/src/api/routes.ts wiring
(one optional handler). NOTHING else. If the honest shape requires touching spine
files or schemas: STOP AND REPORT (deliverable path below), do not expand scope.

## Acceptance (verified-by, RED-first vitest, `npm run test:run -w server`)

A. DMSO fixture as above (vendor-product join only) surfaces for "DMSO"; grouped
   by vendor/lot.
B. Unjoined instance matched only lexically reports as unknown-provenance; no
   silently-absent case.
C. Serialized response contains none of the banned words (P7 grep test).
D. Write-spy on store proves zero mutations across a query.
E. Three-dot diff touches spine dirs zero; `npm run typecheck -w server` at
   baseline 0.
F. Route test: 200 with grouped report for the seeded fixture; empty-but-shaped
   report for a no-match term.

## Dispatch facts

- Branch `cl/lane2-matres-shelf1-l2t1830` off trunk `cl/integration-2` (e91163a5+)
  in worktree /mnt/vast/home/brad/git/wt/matres-shelf1-lane2.
- Deliverable (UNIQUE): .hermes/plans/MATRES-SHELF-report-l2t1830.md in the
  worktree; log /home/brad/.hermes/cl/lanes/2/logs/coder-MATRES-SHELF-l2t1830.log.
- exactOptionalPropertyTypes on backend: optional means absent OR value.
- Orch promotes the report to .hermes/plans/MATRES-SHELF-report.md on accept.

## Orch recon provenance

cl-scout recon proc_6a783e12343f (exit 0) supplied the CandidateAdapter/TierOutcome
shapes and adapters.ts template; ALL load-bearing claims re-verified by orch
(types.ts:44-56, adapters.ts:69-101, providers/records.ts, schema refs,
store/types.ts:167, routes.ts:124). Scout output used as orientation only.
