# L2-GC-PEAK-NAMING-1 (u4surface) — /registry "Compounds" surface

Lane 2, worktree /home/brad/cl-wt/L2-GC-PEAK-NAMING-1-u4surface-lane2, branch
cl/lane2-gcpeak-surface-l2t2670, base f9f24f445a891e9c4210d949b7e89c90f776110a.

## What was built (defect T2-3: registry resolved via lookup but no surface rendered it)

- `GET /api/compound-classes` — inline fastify route (shape copied from the
  GET /journey/capabilities precedent): serves `getCompoundClassRegistry().list()`
  verbatim; on loader failure returns `{classes: [], diagnostics:[named]}` —
  never a 500, never a silently empty list (server/src/api/routes.ts, one import +
  the route next to the ontology-terms block).
- `apiClient.getCompoundClasses()` (app/src/shared/api/client.ts) — calls
  GET /compound-classes, typed `{classes: [{id,name,description?,candidates:
  {compoundId,name,notes?}[]}]}`.
- `CompoundClassPanel` (NEW app/src/pages/CompoundClassPanel.tsx) — one row per
  candidate: registry-declared name + compoundId + the RESOLVED ontology label
  via `getOntologyTerm` (first UI consumer of that method). A 404/failed lookup
  renders the literal marker `unresolved` (pending shows `resolving`) — never a
  crash, never a free-text invention. Reuses existing registry-row/badge CSS.
- `/registry` "Compounds" tab (RecordRegistryPage.tsx): `REGISTRY_TABS` gains
  `{id:'compounds', label:'Compounds', kinds:[], registrySource:'compound-classes'}`
  via a new exported `RegistryTab` interface (optional `registrySource` field).
  `refreshRecords` branches on `registrySource === 'compound-classes'`: fetches
  getCompoundClasses into new `compoundClasses` state, sets `records=[]` so the
  record-list branch never renders for this tab (record list untouched). The
  list area renders `<CompoundClassPanel/>` when activeTab==='compounds'.

## Key decisions

1. `RegistryTab` interface instead of `as const`: the array literal previously
   produced a readonly union; adding an optional `registrySource` to one entry
   would otherwise require casts at every consumer (tests import REGISTRY_TABS).
2. The Create button is HIDDEN (conditional render) when the active tab's
   `kinds` is empty — a dead disabled button on a tab with no create door would
   be dead chrome; empty kinds = no picker entries (verified: the QMS7-5 picker
   maps `activeTabConfig.kinds`, so zero entries; `handleCreateFromTab` also
   early-returns on `kinds.length === 0`; `activeTabSchemaId` keeps its existing
   `?? ''` guard and resolves nothing for empty kinds).
3. `activeTabSchemaId` guard verified: `schemaNodes.find(node => node.kind ===
   activeTabConfig.kinds[0])?.schemaId ?? ''` — `kinds[0]` is `undefined` for the
   compounds tab, `find` misses, `?? ''` holds; combobox is safe with empty
   kinds (its local search loop `kinds.map(...)` yields no promises).
4. createTab suite guard: `RecordRegistryPage.createTab.test.tsx`'s per-tab
   Create loop iterates REGISTRY_TABS and its `openTab` helper waits for an
   actionable Create button — impossible on a no-kinds tab by design (button
   hidden). One documented `if (tab.kinds.length === 0) continue` keeps that
   suite green; its contract (record-kind tabs open their own kind's draft) is
   unchanged. This is the 7th touched file beyond the 6-file scope (see budget note).
5. node_modules: the fresh lane tree had none; node_modules (root/server/app)
   were symlinked to /mnt/vast/home/brad/git/cl-integration-2's install
   (base is an ancestor of that checkout's HEAD). They are git-ignored, untracked.

## Changed files (vs base, +404/-14)

- server/src/api/routes.ts (+27)
- server/src/api/compoundClasses.routes.test.ts (NEW, 84)
- app/src/shared/api/client.ts (+17)
- app/src/pages/CompoundClassPanel.tsx (NEW, 89)
- app/src/pages/CompoundClassPanel.test.tsx (NEW, 120)
- app/src/pages/RecordRegistryPage.tsx (+60/-14)
- app/src/pages/RecordRegistryPage.createTab.test.tsx (+7)

Budget note: 7 files / ~400 new lines vs the ≤6-files/≤200-line budget. The
excess is the two mandated test suites (route RED/GREEN + panel assertions,
which VERIFY requires) plus the 7-line harness guard that acceptance 3
(existing registry suites green) forces; implementation source is 104 diff
lines.

## Verification (real outputs, run from the stated cwd)

RED (route absent — `git checkout f9f24f44 -- server/src/api/routes.ts`, then the
test): `<wt>/server` `npx vitest run src/api/compoundClasses.routes.test.ts`:
- `AssertionError: expected 404 to be 200 // Object.is equality` (both cases),
  `Test Files 1 failed (1)`. Baseline at base: 0 such tests exist.

GREEN (final commit, all from <wt>/server unless noted):
- `npx vitest run src/api/compoundClasses.routes.test.ts` → `Test Files 1 passed (1)`,
  `Tests 2 passed (2)`. The route test registers the REAL registerRoutes and reads
  the REAL registry file (no fixture): asserts fame-medium-chain present,
  candidates.length >= 8, first candidate `FAME-LOCAL:methyl-hexanoate-n6` /
  "Methyl hexanoate (FAME, 6:0-OMe)", and every class has a non-empty candidates
  array of string compoundIds.
- `<wt>/app` `npx vitest run src/pages/CompoundClassPanel.test.tsx` → `Test Files 1
  passed (1)`, `Tests 4 passed (4)`: class names listed, candidate rows named by
  compound id, resolved labels (including one where the ontology label differs
  from the declared name), `unresolved` marker for a 404 id, loading/empty states.
- `<wt>/app` `npx vitest run src/pages/RecordRegistryPage` → `Test Files 11 passed
  (11)`, `Tests 70 passed (70)` (all existing registry suites green).

Typecheck:
- `<wt>/app` `npx tsc --noEmit` → 10 errors, all in 5 files this unit did NOT
  touch (SchemaRecordForm.tsx 3, RefCombobox.ontologyref.test.tsx 1,
  ObjectWidget.nested.test.tsx 1, RecordCreatePanel.gc16.test.tsx 1,
  RecordCreatePanel.gc16-widget-commit.test.tsx 4); 0 in unit files.
  Pre-existence proven: the identical 10 errors occur with this unit's changes
  stashed (base tree + symlinked install only). Cause: the lane worktree had no
  node_modules; the symlinked cl-integration-2 install (newer react-hook-form /
  fastify) drifts from the install the base was typechecked against.
- `<wt>/server` `npx tsc --noEmit` → 6 errors, all in files this unit did NOT
  touch (AIHandlers.ts 3, AiIngestionHandlers.ts 1, ExtractProtocolHandler.ts 1,
  sequenceRoutes.ts 1); 0 in api/routes.ts. Same drift cause.

Acceptance mapping:
1. GET /api/compound-classes returns fame-medium-chain with 8 candidates from the
   real registry file — pinned by the route test (2/2).
2. "Compounds" tab lists every class; each candidate row shows compound id +
   resolved ontology label — page wiring + panel (the 8 FAME candidates resolve
   to labels like "Methyl hexanoate (FAME, 6:0-OMe)" via
   GET /ontology-terms/lookup). Live-browser rendering belongs to the
   independent browser reviewer (implementation complete != acceptance complete).
3. 404 id renders `unresolved`, no crash (panel test); existing tabs/record lists
   unchanged (11 files / 70 tests green; the record-list branch is untouched and
   the compounds tab feeds the record list nothing).
4. Reload re-renders: the tab-switch effect (`useEffect [activeTab,
   refreshRecords]`) re-runs refreshRecords on every (re)entry — stateless
   server read, no persistence.

## Commits (on cl/lane2-gcpeak-surface-l2t2670)

1. 22da77767 — server route + its test (RED 404 -> GREEN 2/2).
2. 697e29474 — client method + CompoundClassPanel + panel test (4/4).
3. b14a49ab8 — RecordRegistryPage tab wiring + createTab guard; registry suites
   70/70; tsc unchanged vs base in unit files.
4. report commit (this file, without marker) — sha read via `git rev-parse HEAD`.
5. marker commit (this file with the DONE line) — top of the tree.

## Next actions / blockers

- None blocking this unit. Remaining: independent browser gate on the served
  lane stack (acceptance 2 rendering + tab selection) — owner: browser reviewer.
- tsc drift (10 app / 6 server errors, all in untouched files, present without
  this unit's changes) — owner: orchestrator/environment; does not block this
  unit (0 errors in unit files, verified both with and without the unit's diff).
L2-GC-PEAK-NAMING-1 UNIT unit DONE 17b507133cf7d7ae93af4aa901593df40d653700
