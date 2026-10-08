# Exa vendor products in the event-editor UI and AI chat — completion plan

Operating mode: **PLAN ONLY** (this document). Follow the operating banner of the active plan
corpus before executing.

## Goal

User-visible goal: both the **event-editor UI** and the **AI chat** can add **vendor products**
(materials, labwares, equipment/instruments) sourced from **Exa web search**, in the same
"search → pick → mint a local record" fashion they already add ontology-backed terms — for
materials, labwares, and equipment/instruments.

## IMPORTANT — read this first: the feature is ALREADY implemented and committed

Before writing any code, an implementer with zero context must know the feature is
**substantially done on this branch**. The commits covering it (in order) are on `main`:

| Commit | Scope |
|--------|-------|
| `3f8d17a` | Server: `VendorExaHandlers.ts` — `POST /vendor/exa/search` + `POST /vendor/exa/from` (creates `catalog`=material+vendor-product, `labware`, `equipment` records). Tests pass. |
| `22981b9` | Client: `searchVendorExa` / `createFromVendorExa` + `VendorExaHit`/`VendorExaCategory`/`VendorFromExaResponse` types in `app/src/shared/api/client.ts`. |
| `7d0cdb2` | Shared hook `useVendorExaSearch` (debounced, owned/controlled query modes) + test. |
| `788acd1` | Event-editor **Add-material modal** `catalog` Exa tier (`AddMaterialModal.tsx`, `useMaterialSearch.ts`, `state.ts pickedFromVendorExa`) — "Vendor / web (Exa)" section, mint-on-pick. |
| `e75665b`, `b2a4f69` | Event-editor **Add-labware dialog** `labware` Exa tier (`AddLabwareDialog.tsx`) + a Rules-of-Hooks fix. |
| `307b69d` | AI-chat slash resolvers `/m` (catalog), `/l` (labware), `/e` (equipment) → `appendVendorExaHits` mint-on-select. **All three categories covered in the AI chat.** |
| `ad109bc` | Resolve spine tier-4 Exa vendor provider (`server/src/resolve/providers/vendorExa.ts`) + `@`-copilot surfaces tier-4 hits. |

Exa config exists at root `config.yaml` (`integrations.exa.baseUrl: https://api.exa.ai` + key).

### Coverage matrix (current reality)

| Surface | materials | labware | equipment/instruments |
|---------|-----------|---------|------------------------|
| AI chat (`/m /l /e` + `@`-copilot) | ✅ | ✅ | ✅ |
| Event-editor UI (`AddMaterialModal`, `AddLabwareDialog`) | ✅ | ✅ | ❌ **no equipment add surface in the editor** |

**The genuine remaining gap is the event-editor equipment/instruments Exa tier.** There is
today **no add-equipment/instrument surface in the event editor at all** — the deck adds
labware (plates/tubes/racks), and equipment/instruments (centrifuge, plate reader, pipette)
are only reachable through the AI chat `/e` slash or `@`-copilot. If the goal includes
"equipment/instruments via the event editor," that tier does not exist yet and is the
substantive work below.

**Open question to resolve with the user before executing:** does "equipment/instruments
in the event editor" mean (a) a new standalone "Add equipment/instrument (Exa)" affordance on
the event-editor bench/deck (new surface), or (b) bench equipment that is in practice the
zero-width "lawn-only" labware types (beaker/flask) already addable via `AddLabwareDialog` —
in which case the only work is to also tag those results with an `equipment` category? Default
plan assumes **(a)** on the deck's freeform lawn, mirroring the proven `AddLabwareDialog` tier.

---

## Current context / verified file map (for an implementer with zero context)

Monorepo (npm workspaces): `app/` = React/Vite frontend, `server/` = Fastify TS backend.
Root is this directory; the working tree carries a mode-churn wall — ignore
`100644→100755` noise.

Backend does **not** hot-reload (`npx tsx src/server.ts`, no `--watch`). Server-side changes
require restarting that backend and re-verifying with `curl` (non-404) before browser work.

Two dev stacks run: main (`:5174`→`:3001`, branch `main`, this tree) and an isolated worktree
(`:5191`→`:3091`, different branch). Never blanket-`pkill`; target specific PIDs. A commit on
`main` is not visible on `:5191` until reconciled + restarted.

Key files:

- Server: `server/src/api/handlers/VendorExaHandlers.ts` (+ `.test.ts`), `server/src/resolve/providers/vendorExa.ts` (+ `.test.ts`), routes in `server/src/api/routes.ts` (~line 491), wiring in `server/src/server.ts` (~710).
- Client: `app/src/shared/api/client.ts` (types ~1103, methods ~2387).
- Shared hook: `app/src/shared/vendor-exa/useVendorExaSearch.ts` (+ test).
- Event-editor material: `app/src/event-editor/material/{AddMaterialModal.tsx, useMaterialSearch.ts, state.ts}`.
- Event-editor labware: `app/src/event-editor/deck/AddLabwareDialog.tsx`.
- AI chat resolvers: `app/src/shared/taptab/slashMenu/resolvers.ts` (`appendVendorExaHits`, `vendorExaSuggestions`, `resolveMaterial/Labware/Equipment`); slash menu wiring `SlashMenuExtension.ts` (`/e` alias line 50); `ClarificationPicker.tsx` (`/e` → `resolveEquipment`).
- Deck surfaces: `app/src/event-editor/deck/{DeckSlot.tsx, DeckStage.tsx, LawnSurface.tsx}`.

There is **no dedicated event-editor equipment/instrument add surface** anywhere in `app/src/event-editor` today (verified: no `EquipmentPicker`/`addEquipment`/`pickEquipment`).

---

## Architecture / proposed approach

Reuse the **exact existing stack** — no new plumbing is invented:

```
Exa (web) ── POST /vendor/exa/search?category=equipment ──► VendorExaHandlers.searchExa
                (already returns category-tagged hits; server already mints `equipment` records
                 on POST /vendor/exa/from — createEquipment is done, committed 3f8d17a)
                       │
                       ▼
             useVendorExaSearch({ category: 'equipment', ... })   (shared hook, done)
                       │
                       ▼
   NEW: event-editor equipment/instrument Exa add surface (the only genuinely new code)
```

The AI-chat `/e` (equipment) already chains `resolveEquipment` → `appendVendorExaHits(...,'equipment')`
→ `createFromVendorExa` and is complete; **do not rebuild it**. The new work is event-editor-only.

---

## Step-by-step tasks

### Task 0 — Resolve the open question (user decision, do before coding)
Ask whether event-editor equipment is a new deck/bench Affordance (a) or an alias for
lawn-only labware (b). Block on the answer — the rest of the plan forks here.

### Task 1 — Browser-verify the ALREADY-SHIPPED surfaces (no code, gate before touching)
Do not assume the committed feature works. Drive the live `main` stack (`:5174`/`:3001`):

1. **Add-material**: open a deck, right-click/select a well → Add material → type a reagent
   (e.g. "rotenone") → the **"Vendor / web (Exa)"** section must list real Exa hits (a `WEB`
   badge). Pick one → a `VPR-…` vendor-product + `MAT-…` concept record is minted → configure step.
2. **Add-labware**: on an empty deck slot, open Add-labware → type "deepwell" → Exa
   `labware` hits appear; pick one → `LBW-…` record minted, plate places.
3. **AI chat `/e`**: in the event-editor ChatInput type `/e thermocycler` → Exa equipment hit
   → mint → an `EQP-…` record.
4. **`@`-copilot**: type `@` + a noun → a "Vendor" badge hit appears (tier-4).

Per SOP rule 12, drive the real interface (`browser_exec` against `:5174`, or Playwright using
`app/playwright.config.ts` — note this host lacks the pinned headless-shell; see
`references/ui-browser-verification.md` for the throwaway local config override). If Exa is
unconfigured the UI must surface the friendly 503 message, not crash.

### Task 2 — (Fork A) Add equipment/instruments Exa tier to the event editor
Only if Task 0 = "(a) new deck/bench affordance". New surface + tier, mirroring `AddLabwareDialog`:

- **`app/src/event-editor/deck/AddEquipmentDialog.tsx`** (new, styled with `--cl-*` tokens):
  a dialog whose body mounts `useVendorExaSearch({ category: 'equipment', controlled: { query } })`
  and lists hits with a `WEB` badge; picking calls `apiClient.createFromVendorExa(hit)` (server
  already mints `EQP-…`) then `onPick(created.ref)`.
  - **Pitfall (committed as a real fix `b2a4f69`)**: declare every hook *above* any early
    `if (!open) return null` — a `useVendorExaSearch`/`useState` after an early return changes
    hook count between renders and throws "Rendered more hooks than during the previous render."
- **`app/src/event-editor/deck/DeckStage.tsx` or `LawnSurface.tsx`**: add a small "+ Equipment"
  affordance (bench/lawn context, not a liquid slot) that opens the dialog. Wire `onPick` to
  place the instrument as a lawn-only object (mirror `resolveOrientation`/`validatePlacement`
  used by `AddLabwareDialog.handlePick`).
- **CSS**: add `--cl-*`-token styles in the deck's stylesheet (see `app/src/shared/styles/tokens.css`
  for real tokens; never invent fallback names — white-on-white in dark mode otherwise).

TDD: write `app/src/event-editor/deck/AddEquipmentDialog.test.tsx` first (mint a
`VendorExaHit` mock → assert the section renders + pick calls `createFromVendorExa`), verify it
fails (no file), implement, verify green. Then `npm run typecheck -w app`. Commit.

### Task 3 — (Fork B, if Task 0 = "lawn-only labware is the equipment") 
No new surface. Tag the existing lawn-only bench types and add an `equipment` category pass so
the same `AddLabwareDialog` tier shows bench instruments. Far smaller; only if the user confirms
"equipment" means beakers/flasks/racks already addable as labware.

### Task 4 — E2E browser gate (mandatory after any event-editor UI change)
Extend `app/e2e/` (or add `app/e2e/exa-vendor-products.spec.ts`):
seed a deckable event graph (write a small event-graph YAML into the shared store
`~/.computable-lab/worktrees/main/records/unknown/`, or POST `/api/records` with
`x-user-id: USR-LOCAL-ADMIN` — the API create path currently rejects event-graph payloads with
injected `createdBy`; the file-drop path is what worked in prior verification), drive:
empty slot → Add-equipment → type query → assert Exa hit + `WEB` → pick → assert a
`EQP-…` record was created (deletes/mints). Remove the throwaway config/seed after use
(machine-specific paths must not be committed).

### Task 5 — Reconcile the second worktree
The worktree (`:5191`/`:3091`, branch `wt/architect-ds4-…`) diverges. After the commits land on
`main`, reconcile (merge/cherry-pick — expect conflicts in `routes.ts`/`server.ts`/`client.ts`),
restart that backend, and confirm `get /vendor/exa/search` is non-404 there. Confirm Brad is
looking at the RIGHT instance before claiming any UI work is live.

---

## Risks, tradeoffs, open questions

- **The feature is 90% shipped.** The biggest implementation risk is an implementer **rebuilding
  what exists** instead of verifying + finishing the one gap. Read the commit list and verify the
  live surface first.
- **Equipment semantics in the event editor are genuinely ambiguous** — resolve Task 0 with the
  user. Building a whole new bench-equipment surface if the user just wanted lawn-only labware is
  wasted work (YAGNI).
- **Backend not hot-reloading** — server edits stay 404 until that backend restarts.
- **Exa key/cost** — all three surfaces key off `integrations.exa.apiKey`. Unconfigured → 503;
  UI must degrade gracefully.
- **Shared reference `useVendorExaSearch`** — the event-editor material/labware flows call it in
  `controlled` mode (external query); new surfaces must too, or the debounce resets on a
  different clock.
- **`exactOptionalPropertyTypes` on** (server) — never pass `undefined` for an optional prop;
  spread-conditional instead (`...(x ? { x } : {})`).

## Verification checklist (final gate)

- [x] Server typecheck + tests: `npm run typecheck -w server`; `npx vitest run src/api/handlers/VendorExaHandlers.test.ts src/resolve` green.
- [x] App typecheck + unit: `npm run typecheck -w app`; `AddEquipmentDialog.test.tsx` + affected suites green.
- [x] Browser (live stack, real Exa): Add-material tier, Add-labware tier, `/e` chat, and NEW bench-instruments tier all show real Exa hits and mint records.
- [x] NEW bench-instruments flow browser-verified end-to-end: opens Add-equipment → live Exa "shaker/thermomixer" hits (WEB badge) → pick mints a schema-valid `EQP-…` record → instrument tile placed on the bench.
- [~] Playwright e2e spec asserting the equipment tier: NOT added as committed spec — browser-verification performed via `browser_exec` on the live stack instead (deck-load mocking is brittle; unit test `AddEquipmentDialog.test.tsx` is the durable gate). Mark per SOP rule 12 (real-interface review done).
- [x] Cleanup: throwaway playwright config removed; scratch seed + instrument records removed from the store.

---

## Implementation status (2026-09-07)

User confirmed the shipped Add-material Exa tier works and chose Fork A (dedicated bench
instruments). Executed the remaining bench-equipment work:

**Committed:**
- `b5fa92c` — **server fix**: `VendorExaHandlers.createEquipment/createLabware` minted
  LOWERCASE ids (`EQP-eppendorf-…`) which the `equipment.schema.yaml` pattern
  `^EQP-[A-Z0-9][A-Z0-9_-]*$` REJECTS on a real store (unit mock skipped validation). Fixed
  `slugTitle` to uppercase; added a regression test asserting the id matches the schema pattern.
- `96065ef` — **bench instruments feature**: new `instrument` lawn-only `LabwareType`
  (carries the minted `EQP-` record in `sourceRecordId` so the EQP record stays canonical),
  new `AddEquipmentDialog.tsx` (Exa equipment search → mint → `instrument` tile, hooks above
  the Rules-of-Hooks early return), `LawnSurface` "+ Add equipment (Exa)" affordance + staggered
  default placement, and `--cl-*`-token CSS (also styles the previously-unstyled
  `ee-dialog__vendor-*` rows shared with AddLabwareDialog).

**Not started (out of scope, future):** "move the plate from the bench to the shaker to the
instrument as part of the event editor" — the user flagged this as a future idea. The
`instrument` lawn tile is forward-compatible with it.

**Remaining repo-level step:** Task 5 (reconcile the `:5191`/`:3091` worktree + restart its
backend to surface `/vendor/exa/search`) — not done; would need the worktree branch reconciled.