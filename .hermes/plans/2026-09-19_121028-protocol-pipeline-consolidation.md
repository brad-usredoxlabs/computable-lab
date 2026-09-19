# Plan — protocol pipeline consolidation (one review surface, one engine, one axis set)

Date: 2026-09-19
Repo: `/mnt/vast/home/brad/git/computable-lab`
Read first: `specifications/protocol-worldview.md` (the model + decisions D1-D5).
Supersedes: `specifications/protocol-extraction-to-execution-flow.md` for "which
surface is canonical" (that doc predates the TapTab protocol editor).

## Goal

Make the protocol workflow legible: one place to turn a source document into a
runnable protocol, with the layers named and the if/then variant questions
derived from the document — instead of three overlapping surfaces and two
half-used pipelines.

## Current context / assumptions

Everything below is verified against the running appliance (2026-09-19):

- Two protocols have ever been used by a run: `PRT-4iaey2` (PureLink) and
  `PRT-g5zy9e` (CellROX) — both hand-authored, `approved`.
- P1 (`/extraction` → promote → `/ingestion/vendor-pdf` authoring) produced 3
  `CAN-protocol-*` drafts (from `XDR-000008/11/12`); none approved, none in a run.
- P2 (`/intake` corpus loop) produced 13 `PDT-*`, 48 `SGP-*`, 48 `EVG-PDT-*`;
  none attached to a run. 12 of 13 trees have `axisCount: 0`.
- `/ingestion/vendor-pdf/:recordId` renders bare (no `AppShell`, no tab strip) —
  this is the surface that eats the app.
- The tab-hosting pattern already exists twice: `ArtifactHostPage` (`pdf`,
  `document` kinds) and `DeckHostPage` (`deck` kind), each with a `tabPath()`
  case and a `stableTabId()` case.
- App unit baseline is dirty (pre-existing errors in other sessions' files).
  Gate with targeted `npx vitest run <file>` + `grep` the typecheck output for
  the files you touched. Playwright always with `--project=chromium`.
- Session-sensitive e2e specs live in ONE serial file:
  `app/e2e/session-persistence.spec.ts`. Add new gates there while the persisted
  session is per-user server state.

Decisions needed before Phase 2 (they are product calls, not code calls): **D2**
(demote `/protocol-builder`) and **D4** (strip the right-pane picker). Phases 1,
3, 5 do not need them.

---

## Phase 1 — Protocol review becomes a tab (D1) — fully specced

Reversible, no data migration, and it fixes the "it disappears the tab system"
complaint on its own.

### Task 1.1 — Add the `protocol-review` tab kind (RED first)

**Test:** append to `app/src/shared/shell/openTabsReducer.idempotent.test.ts`? No —
new focused file `app/src/shared/session/protocolReviewTab.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { tabPath } from '../shell/WorkspaceTabStrip'
import { stableTabId } from './tabId'
import { entityTabType, type WorkspaceTab } from '../../event-editor/workspace/types'

const tab: WorkspaceTab = {
  id: 'protocol-review:VPDF-1',
  kind: 'protocol-review',
  recordId: 'VPDF-1',
  title: 'ZymoBIOMICS DNA Miniprep',
}

describe('protocol-review tab', () => {
  it('routes to the review surface', () => {
    expect(tabPath(tab)).toBe('/ingestion/vendor-pdf/VPDF-1')
  })
  it('has a stable id derived from the vendor-PDF record', () => {
    expect(stableTabId(tab)).toBe('protocol-review:VPDF-1')
  })
  it('is a viewer tab (no entity colour badge)', () => {
    expect(entityTabType(tab)).toBeNull()
  })
})
```

Run: `cd app && npx vitest run src/shared/session/protocolReviewTab.test.ts` →
RED (`kind` does not exist; `tabPath` returns null).

Implement:

1. `app/src/event-editor/workspace/types.ts` — add to the `WorkspaceTab` union:

```ts
  | {
      id: string
      kind: 'protocol-review'
      /** The vendor-PDF record (VPDF-*) under review. */
      recordId: string
      title: string
    }
```

plus, next to the other id helpers:

```ts
/** Stable id for a protocol-review tab — one per source document. */
export function protocolReviewTabId(recordId: string): string {
  return `protocol-review:${recordId}`
}
```

and in `entityTabType`, add `case 'protocol-review': return null` (viewer tab).

2. `app/src/shared/shell/WorkspaceTabStrip.tsx` — in `tabPath()`:

```ts
    case 'protocol-review':
      return `/ingestion/vendor-pdf/${tab.recordId}`
```

3. `app/src/shared/session/tabId.ts` — in `stableTabId`:

```ts
    case 'protocol-review':
      return protocolReviewTabId(tab.recordId)
```

4. `schema/workflow/lab-session.schema.yaml` — add `protocol-review` to the
   `tabs[].kind` enum (the session document must be able to hold this tab).

Run the test → GREEN. Then:

```
cd app && npx vitest run src/shared/session src/shared/shell         # green
cd .. && npm run typecheck -w app | grep -E "workspace/types|WorkspaceTabStrip|session/"  # no hits
```

Commit: `feat(tabs): protocol-review tab kind (route + stable id + session enum)`.

### Task 1.2 — Host the review surface in the shell

New file `app/src/ingestion/ProtocolReviewHostPage.tsx`, copying
`ArtifactHostPage`'s shape (fetch record → `WorkspaceProvider studyId` →
`AppShell layout="workspace"` with `topbarTabs={<WorkspaceTabStrip />}`,
`viewerToolbar`, `leftPane`, `rightPane={<RightPane />}`), and:

```tsx
  const tab: WorkspaceTab = { id: protocolReviewTabId(recordId), kind: 'protocol-review', recordId, title }
  // register the tab so a deep link / refresh keeps it in the strip
  useEffect(() => { /* navigateActiveTab(tab) — stable callback in deps */ }, [recordId, title, navigateActiveTab])
```

The `leftPane` is the existing review surface. Extract the body of
`VendorPdfReviewPage` into `app/src/ingestion/VendorPdfReviewBody.tsx` (same JSX,
minus the page-level back bar) and have BOTH the old route and the new host
render it — so there is one implementation, and the old route can be retired
later without touching the surface.

Route (`app/src/App.tsx`): point `/ingestion/vendor-pdf/:recordId` at
`ProtocolReviewHostPage` (lazy import, same path so existing links keep working).
Then the review page keeps the tab strip for every existing caller.

Verify live (SOP): open `/ingestion/vendor-pdf/VPDF-651F03789D80` on `:5174`,
confirm `[data-testid=workspace-tab-strip]` is visible, the PDF|editor split
still renders, and Save/Save-as are unchanged.

### Task 1.3 — Opening a source from the run rail adds a TAB, not a page swap

`AttachProtocolPanel` and `ProtocolSelector` currently do
`navigate('/ingestion/vendor-pdf/' + id)`. Change the open affordance to the
tab-opening helper (`openInNewTab` in `app/src/shared/lib/openContent.ts`),
mirroring how the deck/artifact hosts are opened:

```ts
openInNewTab(openTabs, navigate, {
  id: protocolReviewTabId(id), kind: 'protocol-review', recordId: id, title: label,
}, `/ingestion/vendor-pdf/${encodeURIComponent(id)}`)
```

`ProtocolSelector` gets the callback injected (`onOpenIngestedPdf`) — pass it
from `AttachProtocolPanel`, which already has the navigate/router context. Keep
the plain-route navigation as the fallback when there is no OpenTabs provider
(standalone tests).

### Task 1.4 — Register the ingestion surfaces (they are invisible to "where am I")

Today `/ingestion*` resolves to the `project` surface, so the surface chip lies
and the AI gets the wrong context. Add to
`schema/registry/surfaces/surfaces.yaml` (and the id enum in
`schema/registry/surfaces/surfaces.schema.yaml`, plus the `SurfaceId` unions in
`app/src/shared/context/SurfaceContext.ts` and
`server/src/surfaceContext/SurfaceContext.ts`):

```yaml
  - id: ingestion
    label: "Ingestion · Vendor PDFs"
    path: "/ingestion"
    objectTypes: [document]
    selectableKinds: [material, labware]
    aiRole: "source documents and extraction jobs"
  - id: protocol-review
    label: "Protocol review"
    path: "/ingestion/vendor-pdf/:recordId"
    params:
      recordId: document
    objectTypes: [document]
    selectableKinds: [material, labware, protocol-step]
    aiRole: "extract a protocol from a source document"
```

and in `app/src/shared/surfaces/resolveSurface.ts`'s `SURFACE_BY_PATH` (ordered,
more specific first): `{ pattern: /^\/ingestion\/vendor-pdf\//, surface: 'protocol-review' }`
before `{ pattern: /^\/ingestion(?:\/|$)/, surface: 'ingestion' }`. Extend
`activeFromPath` to read `:recordId` as `{objectType: 'document'}` so
`surfaceRoute()` can deep-link it.

Verify: `cd server && npx vitest run src/surfaces/` green (the `params ⇄ :token`
binding test must pass for the new entry), then the live chip reads
"Protocol review".

### Task 1.5 — e2e gate (append to the serial spec)

In `app/e2e/session-persistence.spec.ts`:

```ts
test('opening a source document from the run rail adds a tab and keeps the strip', async ({ page, request }) => {
  await resetServerSession(request)
  await page.goto(`/ingestion/vendor-pdf/VPDF-651F03789D80`)
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.workspace-tab')).toHaveCount(1)
  await expect(page.getByTestId('vpdf-review')).toBeVisible()
  await page.reload()
  await expect(page.locator('.workspace-tab')).toHaveCount(1)   // refresh keeps the tab
})
```

(Non-mutating: it never clicks Save.) Run
`cd app && npx playwright test e2e/session-persistence.spec.ts --project=chromium`
→ all green.

Commit per task; Phase 1 is done when 1.1-1.5 are green and the live check passes.

---

## Phase 2 — One review surface, one engine (D2) — needs your sign-off

The end state: `/ingestion/vendor-pdf/:recordId` (now a tab) is **the** review
surface, and it opens with the intake engine's output loaded:

```
┌ PDF (left) ──────────────┬ Questions (top right) ────────────────┐
│                          │ Which sample source?                  │
│                          │  ○ cell culture  ○ tissue             │
│                          │  ○ bacterial     ○ buccal             │
│                          │ Scale: ○ manual tubes ○ 96-well bench │
│                          ├ Editable protocol (TapTab) ───────────┤
│                          │ …branch-resolved steps, editable…     │
└──────────────────────────┴───────────────────────────────────────┘
                            [ Save (promote to protocol) ]
```

Tasks (task-level; each gets a RED test first when it touches behaviour):

1. **2.1** `GET /api/protocols/review/:documentId` (new) returns
   `{ decisionTree, proposals, candidate }` for a VPDF record — a thin join over
   the existing `protocol-decision-tree` / `subgraph-proposal` records (no new
   storage). Test with the Zymo 96 kit document id.
2. **2.2** Review surface renders the tree's axes as questions above the editor;
   selecting answers picks the matching `SGP-*` (its `choices`/`branchPath`) and
   the active step set (`activeStepIds`) drives which steps the editor shows.
3. **2.3** `POST /api/protocols/review/:documentId/promote` writes a `protocol`
   with `source: {type: vendor, ref: VPDF-*}`, the chosen `branchSelection` in
   its metadata, and `state: 'draft'` — the P1 promotion semantics, now
   branch-aware. Emits an `extraction-promotion` audit row.
4. **2.4** Redraft: expose the existing
   `POST /protocol-ide/intake/proposals/:id/prompt` + `…/redraft` from the review
   surface (one instruction box), so "take what the AI did, add a prompt, send it
   back" happens where you are looking at the result.
5. **2.5** Demote the duplicates once 2.1-2.4 are live: `/extraction` becomes a
   read-only audit list (no promote button), `/protocol-builder` either redirects
   into the review surface or is deleted if 2.1-2.4 cover its flow. Add a
   superseded banner to `specifications/protocol-extraction-to-execution-flow.md`.

---

## Phase 3 — Sample-source axes (D3)

1. **3.1 (spike, timeboxed)** In `server/src/ingestion/vendor-protocol/deriveBranchAxes.ts`,
   the current unit is one axis per branchy step. Write the failing case first:
   a fixture extracted from the ZymoBIOMICS DNA Miniprep document where steps
   1/3/5 each carry branches whose option SETS are the same conceptual question.
   The test asserts ONE axis with the union of options, and `then_stepIds` across
   all three steps.
2. **3.2** Implement cross-step grouping: axis identity = normalized option-set +
   question text (document evidence), not the step id. Keep per-step axes as the
   fallback when a step's options are unique to it.
3. **3.3** Re-derive the corpus: the nightly intake CLI
   (`server/src/tools/protocolFoundry*.ts`) re-runs; acceptance is
   `GET /api/protocol-ide/intake/trees` showing the Miniprep tree with
   `axisCount >= 1` and a `sampleSource`-style axis with ≥3 options, and
   `proposalCount == options × scaleLevels`.
4. **3.4** The question gate (already in the intake service) must still refuse a
   draft when a variant question has no answer — that is the "which DNA kit
   variant are we extracting?" behaviour you asked for.

Note: this is the one phase that touches the extraction engine rather than
wiring, so it carries the real risk. Do 3.1 as a spike and re-plan if the option
sets disagree in wording.

---

## Phase 4 — One protocol surface per workspace (D4)

1. `app/src/event-editor/right-pane/RightPane.tsx` — the `protocol` tab stops
   rendering the picker: keep `ProtocolTabPanel` for editing the *attached*
   protocol record, drop the `noProtocol || changingProtocol` branch (it is dead
   in the run workspace and duplicated by the rail).
2. Add a "Change protocol" entry in the rail's step-list footer that reuses
   `AttachProtocolPanel alreadyAttached` (the component already supports it).
3. Gate: the run workspace e2e keeps asserting one attach affordance; add an
   assertion that the right-pane Protocol tab no longer shows
   `[data-testid=protocol-search-input]`.

---

## Phase 5 — Name the layers in the UI (D5)

1. Add a `protocolLayerLabel(layer)` helper (`document-truth | ai-draft | global | lab | run`)
   and render it in the surface header of: the review surface (Document truth),
   `/extraction` (AI draft), the protocol record editor (Global vs Lab, from
   `protocolLayer`), the run rail (This run). One vocabulary, no synonyms.
2. Extend `SurfaceIndicator` to show it next to the surface name.

---

## Tests / validation (whole plan)

- Per task: targeted `npx vitest run <file>` RED → GREEN, then
  `npm run typecheck -w app` / `-w server` inspected for the touched paths.
- Per phase: `cd app && npx playwright test e2e/session-persistence.spec.ts --project=chromium`.
- Live check on `:5174` for every UI phase (surface + tab strip + no console
  errors). Restart the backend only for new routes, targeting the exact PID
  (`ss -tlnp | grep :3001`), never a blanket pkill.
- Evidence in commit bodies: the observed values, not adjectives.

## Risks, tradeoffs, open questions

1. **Phase 3 is the real work.** Everything else is wiring. If cross-step option
   sets disagree in wording, the honest fallback is a small declarative mapping
   (`schema/` table: branch-text alias → canonical question+option) rather than
   fuzzy matching in code — keep business logic out of TypeScript.
2. **`/protocol-builder` deletion is a product call.** Its `FeedbackChat` and
   configuration panel may cover cases the review surface does not (URL ingest,
   paste-text source). Check before deleting; a redirect is the safe default.
3. **`CAN-protocol-*` ids.** The three promoted drafts use a non-schema-looking
   id prefix. Either rename them to `PRT-*` on next save or teach the id shape to
   the schema — do not leave a third id convention undocumented.
4. **Two `planned-run`s per protocol today** (CellROX has 4 PLRs, PureLink 2)
   because each attach creates a new one. That is probably right (one per run),
   but the PLR naming (`PLR-plan-<protocol-slug>-<hash>`) makes them look like
   duplicates in a list. Worth a naming pass when the review surface lands.
5. **Superseded docs.** `specifications/protocol-extraction-to-execution-flow.md`
   should get a banner, not a delete; the corpus/history value of these docs is
   real.
