# Exa-backed vendor products in the event-editor UI and the AI chat

Operating mode: **DIRECT CODING** — code each task yourself, TDD (failing test first),
one commit per task, no subagent handoff.

## Goal

Add "vendor products" (materials, labware, equipment/instruments) sourced from **Exa
web search** to the two surfaces that today add things from **ontology-backed terms /
local records** — the event-editor Add-material flow and the AI chat's slash-menu /
copilot resolvers — each picking an Exa hit and landing it as a local record.

---

## Current context / assumptions (verified by reading the code)

There are **two distinct addition surfaces**, and each already lands ontology +
local terms. The task is to bolt an Exa-vendor-product tier onto each.

1. **Event-editor UI "Add material" family** (`app/src/event-editor/`):
   - `AddMaterialModal.tsx` → `SearchView` renders three sections: *Saved formulations*,
     *Materials* (local), *Ontologies*. Wiring lives in `useMaterialSearch.ts`
     (`app/src/event-editor/material/useMaterialSearch.ts`), which already calls
     `apiClient.resolve(...)` for the ontology tier and `apiClient.searchMaterials` /
     `getFormulationsSummary` for local tiers.
   - `AddLabwareDialog.tsx` (`app/src/event-editor/deck/`) — pure local type picker.
   - The finite resource that already exists: `equipment` has a working Exa path
     (`GET /equipment/exa-search` + `POST /equipment/from-exa`), wired only into the
     chat slash-menu `/e` resolver (`app/src/shared/taptab/slashMenu/resolvers.ts`
     `resolveEquipment`).
   - `MaterialPicker.tsx` (`app/src/editor/material/`) already has a **live vendor**
     section backed by `searchVendorProducts` (`GET /vendors/search`, which SCRAPES
     vendor sites — **not Exa**). `VendorProductBuilderModal` opens from it. So "vendor
     products" exists for the record-editor material picker via scraping, but NOT via
     Exa, and NOT in the event-editor `AddMaterialModal` or labware/equipment dialogs.

2. **AI chat** (`app/src/event-editor/right-pane/ai/ChatInput.tsx` + `AiTabPanel`):
   - Slash menu `/m`, `/l`, `/e`, `/p` etc. via `buildSlashMenuExtension`
     (`app/src/shared/taptab/slashMenu/SlashMenuExtension.ts` → `resolvers.ts`).
     `resolveEquipment` (line ~242) is the ONLY one that already calls Exa
     (`searchEquipmentExa` + `createEquipmentFromExaCandidate`).
   - `@` ontology copilot (`app/src/shared/taptab/ontologyCopilot/OntologyCopilotExtension.ts`)
     resolves via `apiClient.resolve` (tier `vendor` is surfaced by `badgeForCandidate`
     but the spine's `vendorProvider` tier 4 is **never wired** — ResolveSpine.ts line 175
     only adds it if `deps.vendorProvider`, and `createResolveSpineFromContext` (line 252)
     does NOT pass one). So no vendor hits ever appear in resolve today.

3. **Exa backend plumbing already exists:**
   - `server/src/integrations/exa.ts` — `exaSearch`, `exaGetContents`, `resolveExaConfig`
     (key from `integrations.exa.apiKey` / `EXA_API_KEY`).
   - `server/src/api/handlers/EquipmentHandlers.ts` — the exact pattern to copy:
     `searchExa` (GET → `exaSearch` with highlights) and `createFromExa` (POST → makes a
     local `EQP-*` record from a candidate). Routes: `routes.ts:482-483`.
   - `server/src/mcp/tools/exaTools.ts` — agent-facing `web_search_exa` /
     `web_get_contents_exa`.
   - `server/src/api/handlers/VendorSearchHandlers.ts` — `searchGraphLemurPdfs` is the
     other Exa path (vendor PDFs).

**Design decision (smallest faithful shape):** mirror the existing, proven
`/equipment/exa-search` + `/equipment/from-exa` pair into a single **generic**
`/vendor-products/exa-search` + `/vendor-products/from-exa` (materials + labware at
first), and extend the two addition surfaces:

- **Event editor**: add an "Exa vendor products / web" section to `AddMaterialModal`
  and a search tier to `AddLabwareDialog` (and, where present, the deck add-labware),
  reusing the same `useMaterialSearch` shape by adding an `exaResults` field.
- **AI chat**: add an Exa tier to `resolveMaterial` / `resolveLabware` and generalize
  `resolveEquipment`'s existing Exa tier to the shared helper, so `/m`, `/l`, `/e` all
  show web-vendor results and create local records (mirroring how ontology terms
  resolve→mint today).
- **Ontology copilot / spine**: wire Exa vendor hits as `source: 'vendor'` tier-4
  candidates in `ResolveSpine.ts` (a `vendorProvider` powered by `exaSearch`), so
  `@`-copilot and any resolve consumer shows vendor products too. This keeps "vendor"
  honest instead of fake-tiered.

Data offered is the existing record kinds: `vendor-product`, `labware`, `equipment`
(schemas in `schema/lab/`). No new schema. Exa supplies provenance (url, title,
description/snippet); the from-exa create keys on existing `VendorProductBuilderModal` /
`EquipmentHandlers` validation.

## Architecture

Three layers, all shape-mirroring the working `/equipment/*` pair:

```
EXA (web) ── server/src/api/handlers/VendorExaHandlers.ts ── generic supplier
   │          GET  /vendor/exa-search?q=&kinds=      → { items: ProductHit[] }
   │          POST /vendor/from-exa {hit}            → { recordId, label, ref }
   ▼
spine tier-4 vendorProvider (ResolveSpine.ts)   ← →   slash resolvers /m /l /e
   ▼
event-editor useMaterialSearch/AddMaterialModal + AddLabwareDialog + @copilot
```

DRY: one supplier file + one hook (`useVendorExaSearch`) reused by both surfaces and by
the spine's tier-4 provider.

---

## Preflight (do this first, one commit)

- [ ] `git checkout main && git status` — expect the mode-churn wall (mostly
      `100644→100755`), note real edits with `git diff --numstat | awk '$1+$2>0'`.
- [ ] Confirm the two dev stacks still hold (smoke, don't kill): `ss -tlnp | grep -E
      '.(3001|3091|5174|5191)'`; leave both running. Never blanket-pkill.
- [ ] Confirm the server isn't hot-reloading (it isn't — `npx tsx src/server.ts` no
      watch). Any server change below requires restart of **that** backend.

---

## Task 0 — Shared Exa supplier + route pair (server)

**File: `server/src/api/handlers/VendorExaHandlers.ts`** (new), copied from
`EquipmentHandlers.ts` (keep its timeout / dedupe / 503-EXA_NOT_CONFIGURED /
502-EXA_SEARCH_FAILED conventions). Export:

```ts
export type VendorExaCategory = 'material' | 'labware' | 'equipment'
export interface VendorExaHit { id; title; url; snippet?; score?; category; }
export interface VendorExaSearchResponse { configured; query; items: VendorExaHit[] }
export function createVendorExaHandlers(deps: {
  getAppConfig: () => AppConfig | undefined
  store: RecordStore
}): { searchExa; createFromExa }
```

- `searchExa(req)` — `q` >=2 chars; optional `category` query param validated against
  `['catalog','labware','equipment']`; default: search all. Query to
  `exaSearch(config, { query: \`${q} {vendor laboratory product catalog|labware|instrument|equipment}\`, ...})`,
  shape hits like `shapeEquipmentResult` (url/title/snippet/score), tag → category via
  the `query` we appended.
- `createFromExa(req)` — body `{ title, url, description?, category? }`; validation:
  title+url required (`400` else); delegate per category to existing record creators:
  - `equipment` → reuse the existing `EquipmentHandlers.createFromExa` record shape
    (`EQP-*` slug + notes provenance).
  - `labware` → create a `labware` record (`schema/lab/labware.schema.yaml`), `recordId`
    `LBW-<slug>`, name=title, manufacturer `{ name?, catalogNumber?, url }` from candidate,
    `labwareType:'other'` unless inferable.
  - `material` → create a `vendor-product` record (`schema/lab/vendor-product.schema.yaml`)
    **and** a bare `material` concept ref it links to, mirroring `VendorProductBuilderModal`
    `ensureMaterialRecord` / `stableOntologyMaterialId`; id `VPR-<slug>-<hash>`.

**Route wiring:** `server/src/api/routes.ts` near `EquipmentHandlers` (line ~482):

```ts
const { vendorExaHandlers } = options
if (vendorExaHandlers) {
  fastify.post('/vendor/exa/search', vendorExaHandlers.searchExa.bind(vendorExaHandlers))
  fastify.post('/vendor/exa/from', vendorExaHandlers.createFromExa.bind(vendorExaHandlers))
}
```
Add `vendorExaHandlers?` to the `RouteOptions` interface; instantiate in
`server/src/server.ts` near line 705 (`createVendorExaHandlers({ getAppConfig: () =>
ctx.appConfig, store: ctx.store })`).

**Test (TDD)**: `server/src/api/handlers/VendorExaHandlers.test.ts` mirroring
`EquipmentHandlers.test.ts` — stub global fetch, assert search request body/url
(`api.exa.ai/search`), hit shaping, `502` on failure, `createFromExa` writes
EQP/LBW/VPR records via the store.
- Run: `cd computable-lab/server && npx vitest run src/api/handlers/VendorExaHandlers.test.ts`
  → red (no file) then green after implementing.
- Typecheck: `npm run typecheck -w server`.

Commit: `feat(server): vendor/exa search + from-exa record creation (materials/labware/equipment)`

---

## Task 1 — client API methods

`app/src/shared/api/client.ts` (near existing `searchEquipmentExa` line ~2345):

```ts
async searchVendorExa(params: { q: string; category?: 'catalog'|'labware'|'equipment'; limit?: number }): Promise<VendorExaSearchResponse>
async createFromVendorExa(candidate: VendorExaHit): Promise<VendorFromExaResponse>
```
Add `VendorExaSearchResponse` / `VendorExaHit` / `VendorFromExaResponse` interfaces
mirroring the server shapes (and the existing `EquipmentExa*` types).

**(TDD)** extend `app/src/shared/api/client.test.ts` (or the existing client test file)
to assert the two methods hit `/vendor/exa/search` and `/vendor/exa/from` with the
expected body/query. Run `cd computable-lab/app && npx vitest run src/shared/api`.
Typecheck `cd computable-lab/app && npm run typecheck`.

---

## Task 2 — shared hook `useVendorExaSearch`

`app/src/shared/` is forbidden for speculative code, but THIS hook is consumed by **2
modules** (event-editor + chat), so it qualifies. Create
`app/src/shared/vendor-exa/useVendorExaSearch.ts`:

```ts
export interface UseVendorExaSearchResult {
  query: string; setQuery: (v)=>void
  exaResults: VendorExaHit[]; loading: boolean; error: string|null
  searchNow: () => Promise<void>; clear: () => void
}
export function useVendorExaSearch(category?: VendorExaCategory): UseVendorExaSearchResult
```
Debounced (like `useMaterialSearch`'s 350ms), min 2 chars, calls `searchVendorExa`,
fallback `[]` on error. Mirrors `app/src/event-editor/material/useMaterialSearch.ts`.

(TDD) — `app/src/shared/vendor-exa/useVendorExaSearch.test.ts` render-hook (seed once —
see harness pitfall in skill: never call a context setter during render). Assert
debounce + empty env guard. Run vitest; typecheck.

---

## Task 3 — wire into event-editor Add-material flow

`app/src/event-editor/material/useMaterialSearch.ts`: add `exaResults` / `loadingExa` /
`errorExa` surfaced from the new hook, driven by the same `query`.

`app/src/event-editor/material/AddMaterialModal.tsx` `SearchView`: add a **4th section
"Islands/web vendor"** (`[VENDOR_RESULTS]` — label it "Vendor / web (Exa)"), rendered
when `exaResults.length>0`, each row `data-category="vendor-exa"`. Click →
`dispatch({ type:'pick', material: pickedFromVendorExa(hit) })`.

`app/src/event-editor/material/state.ts`: add `pickedFromVendorExa(hit)` producing a
`PickedMaterial` with `ref` = `createFromVendorExa(...)`→record ref, domain inferred
from the hit category. On pick, `applyAddMaterial` (same apply path as `search`).
Careful: `state.ts` `PickedMaterial` (see applied `AddMaterialModal` `handleApply`)
already carries `materialRef`/`biologicalType`/`volume` — a vendor-product picking must
resolve the generic `VOL ref`, reuse `groundMaterialRef` style if the hit has no local
ref yet — **first mint (Task 0 `createFromExa`) then keep the `result.recordId`**.

(TDD) — extend `app/src/event-editor/material/AddMaterialModal.test.tsx` to assert the
4th section renders for a stub `searchVendorExa` response and that clicking routes to
`configure` with a `ref` whose kind == 'record'. Typecheck; then **browser-verify**
(Playwright on host / `browser_exec` on `localhost:5174`): open Add-material on a plate,
type a vendor product name, confirm the Exa section lists hits; click one — configure
step. This is a real UI surface → **must be driven in the actual browser**, not just
unit-tested (SOUL.md rule 12). See `references/ui-browser-verification.md`.

---

## Task 4 — Event-editor labware dialog Exa tier

`app/src/event-editor/deck/AddLabwareDialog.tsx`: below the local type grid, render the
same `useVendorExaSearch('labware')` results; picking one calls
`onPick(createLabwareFromVendorHit(hit))` — either mint a `labware` record via the
client (`createFromVendorExa`) and keep its `recordId`, or fall back to `createLabware('other')`
+ manufacturer metadata. Wire the "Name on deck (optional)" field from the hit title.

(TDD) — `app/src/event-editor/deck/AddLabwareDialog.test.tsx` asserting the vendor
section renders a returned `searchVendorExa({category:'labware'})`. Then browser-verify in
Live the same way (task 3).

---

## Task 5 — AI chat slash resolvers get an Exa vendor tier

`app/src/shared/taptab/slashMenu/resolvers.ts`:
- Add a module-level `async function appendVendorExaHits(ctx, seen, q, category)` that
  calls `apiClient.searchVendorExa`, maps hits to `SlashSuggestion`s:
  - `key: \`vendor-exa:${h.url}\``, `badge: 'Web'`, `subtitle: h.url`,
    `detail: { source:'Exa web search', id:h.url }`,
    `resolveMention: async () => { const created = await apiClient.createFromVendorExa(h);
       return { type: (category==='equipment'?'equipment':'material'), entityKind:'vendor-product'??..., id: created.recordId, label: created.label } }`.
- In `resolveMaterial` (kat.30) add a **below-first-paint** `onUpdate` pass that ALSO calls
  `appendVendorMetaHits(seen, 'catalog')` (right after OAK/OLS4 passes). Keep local
  records + OAK/OLS4 first.
- In `resolveLabware` add an Exa `labware` pass in the same place (fallback after
  local records/definitions, matching how `resolveEquipment` treats it).
- Refactor `resolveEquipment`'s inline Exa block to re-use `appendVendorExaHits`.

Follow the skill **`steps[]` must be `kind:'other'`** pitfall: mention/resolve pulls of
these are fine (they're mentions, not steps), but do check you're not emitting a
structured step anywhere; you're not.

(TDD) — `app/src/shared/taptab/slashMenu/resolvers.test.ts` mirrors for material/labware
what exists for equipment: stub `searchVendorExa`, fire `resolveMaterial('Cayman')`,
assert the last additions include a `vendor-exa-` rows. Run: vitest; then typecheck.
(Browser-verify the slash menu on `:5174` chat as optional but encouraged.)

---

## Task 6 — `. @`-copilot + resolve spine tier-4 vendor supplier

`server/src/resolve/ResolveSpine.ts` — wire tier 4 vendor by supplying a
`vendorProvider` backed by `${exaSearch}`:
- In `createResolveSpineDeps` the `vendorProvider` already exists; add a real provider:
  in `createResolveSpineFromContext` accept `vendorProvider` optionally (default: a
  provider that calls `vendorExaHandlers.searchExa` and maps hits to
  `ProviderHit{label,curie,uri}` — where `curie` is a synthetic `local:<vendor-hash>`
  tier 4 `source: 'vendor'`).
- In `app/src/shared/taptab/ontologyCopilot/OntologyCopilotExtension.ts`,
  `suggestionForCandidate` already handles `source==='vendor'` (`badgeForCandidate` →
  -'Vendor'); make sure `resolveOntologyItems` surfaces the tier-4 hits (it currently
  maps all candidates; keep vendor). `@`-opens will then show "Vendor" rows. Also ensure
  `resolveOntologyItems` keeps `limitt` 8, dedupe on `url`.
- Update `RESOLVE_SOURCE_LABEL.vendor` in `resolvers.ts` to "Vendor / Exa web" for clarity.

(TDD) — add spine test in `server/src/resolve/providers/*test` for tier-4 `vendor`
wiring with a stubbed fetch (mirror `ResolveSpine.test.ts`), assert `source:'vendor'`;
and an ontology-copilot resolver test asserting a returned `Vendor`-badged suggestion on
selected hit produces a `resolveMention` that calls `/vendor/exa/from`.

Run vitest (server) + worm neverleave; typecheck.

---

## Task 7 — restore/reconcile second instance

The isolated-worktree (`architect-ds4`) runs a different branch. Since this vendor work
touches `routes.ts`/`server.ts`, it will diverge from the live reconciliated instance.
Verify `git log --oneline | grep -c vendor` on the worktree branch; if `Brad` reports the
new `/vendor/exa/search` 404s on :3091, reconcile: `git -C ... <merge/cherry-pick>` and
restart that backend (that instance does NOT hot-reload either). This is the known
reconciliation, not a port.

---

## Tests / validation

Per task: TDD (write failing test → `npx vitest run ` → red → implement → green) and
`npm run typecheck` both workspaces. Server-level requirements:
- `cd computable-lab/server && npx vitest run src/api/handlers/VendorExaHandlers.test.ts
  src/resolve` (Task 6 case)
- `cd computable-lab/app && npx vitest run src/shared/vendor-exa src/event-editor/material
  src/shared/taptab/slashMenu`

**Browser gate (SOP rule 12)** — after Task 3 & 4 (real UI): `browser_exec` the live
stack on :5174 (backend :3001; for the worktree :5191/:3091). For each:
1. a plate open; open `Add material`; type a common reagent ("Cayman", "1.0 µM DMSO");
2. assert the `vendor / web (Exa)` section renders result rows;
3. click a row → configure/accept step appears with the vendor record;
4. labware dialog: same with `AddLabwareDialog` + `category:'labware'`.
Note swell — dark mode uses `--cl-*` tokens (skill pitfall): no invented CSS fallbacks.

Expected outputs are the harness-observed hits; if `integrations.exa.apiKey` is empty
(`EXA_API_KEY` unset) the 502/503 path shows: assert the friendly "Exa is not
configured" error is surfaced, not a JS crash.

---

## Risks, tradeoffs, open questions

- **Exa key / cost**: the existing equipment + PDF paths already require
  `integrations.exa.apiKey`. If unset, all three new surfaces degrade to the
  `EXA_NOT_CONFIGURED` 503 — decide whether that should be a silent-hidden section or an
  explicit disabled note in the UI. Default (per repo convention): render nothing and log.
- **vendor/hit domain**: Exa returns arbitrary web domains, not the 6 curated catalogs
  the scrape (`/vendors/search`) used. Decide: keep BOTH (scrape=curated purchase-ready,
  Exa=discover) — plan keeps both; `VendorProductBuilderModal` stays scrape-backed.
- **Default category on untyped query**: the plan has all-category search + a
  per-surface `category` hint; edge case is a `material` user wanting a `labware` — fine,
  rows are category-tagged.
- **Material ref grounding**: `pickedFromVendorExa` must mint via `createFromExa`
  (Task 0/1) then carry the `recordId`; do NOT insert a bare ontology CURIE into a well
  (CLAUDE rule 8 / pledge) — the real legacy `groundMaterialRef` path remains the net.
- **`kinds` envelope for `applyAddMaterial`**: Azure the added material kind from the
  existing `PickedMaterial`; vendor-product ref type might not be in the event `Ref`
  union — reuse `vendor-product` (already a material-kind in `ISlidesMention`).
- **Second worktree (architect-ds4) divergence**: `routes.ts`/`client.ts` diverge; do not
  port blindly — reconcile/merge and restart that backend. Do not touch its Vite pids.
- **`localOnly` spine path**: the slash-menu first paint calls `resolve() localOnly:true`
  (drops remote vendor tier intentionally). Vendor hits arrive via `onUpdate` second
  paint — keep vendor in the `localOnly`-gated block only when the tier is remote.

---

## Commit sequence (one per task, exact messages when relevant signpost)

1. `feat: vendor/exa-search + from-exa route handlers`
2. `feat(app/clientfo): vendor-exa API client methods`
3. `feat(app): shared useVendorExaSearch hook`
4. `feat(event-editor): Exa vendor section in Add-material modal`
5. `feat(event-editor): Exa vendor tier in AddLabwareDialog`
6. `feat(chat): Exa vendor tier for /m /l /e slash resolvers`
7. `feat(spine+copilot): tier-4 vendor provider wired to Exa`
8. `chore: reconcile second worktree + browser-verify all surfaces`