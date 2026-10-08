# Plan: Search across ingested PDFs, candidate protocols, and localized lab protocols in the run Protocol pane

## Goal
Add a search box to the run editor's **Protocol** right-hand tab that, given a query, finds and lets the user attach/use **ingested vendor PDFs**, **candidate protocols**, and **localized lab protocols** — with results matched on title, recordId, and body/step text.

## Current context / assumptions (verified by reading the code)
- **The run editor's right rail** is `/run/RunWorkspacePage.tsx`. Its Protocol mode is `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`, which renders `ProtocolSelector` (`app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`).
- **`ProtocolSelector` has NO search.** It sources candidates from `getProtocolContext(...)` (`server/src/protocol/ProtocolContextService.ts` → `/api/protocol-context`), which returns `projectTemplates`, `experimentProtocols`, `runMethods`, `promotableRunMethods`, and `availableProtocols`. It renders `projectProtocols` (study-scoped `protocol`+`local-protocol`) and `labProtocols` (`availableProtocols` free of study/experiment/run links). There is no query param and no client-side filter.
- **`ProtocolContextService.getContext()`** (lines ~114-165) only supports `studyId` / `experimentId` / `runId` scope filtering. It does NOT free-text match on titles, steps, or extracted text.
- **An analogous search exists but only for study-scoped artifacts**: `app/src/event-editor/right-pane/search/SearchTabPanel.tsx` searches the active study's `useStudyArtifacts()` by title/id/cached extracted-text. It is a DIFFERENT tab, does not cover free-floating vendor-pdfs or protocols, and has no way to **attach** a result to the run (it just opens a viewer).
- **Ingested vendor PDFs** are free-floating `vendor-pdf` records (`schema/lab/vendor-pdf.schema.yaml`) with `title`, `source.url`, `file`, `extractedText[]` (per-page text), and optional `vendorProtocolCandidateRef` / `promotedProtocolRef`.
- **Candidate protocols** referenced by vendor-pdfs are not a dedicated indexed kind in the protocol-context list; the promoted form is a `protocol` record (like `CAN-protocol-*`). Localized lab protocols are `local-protocol` records.
- **`getRecords`** (`app/src/shared/api/client.ts` `listRecordsByKind(kind, limit)`) can fetch all records of a kind (e.g. `vendor-pdf`, `protocol`, `local-protocol`) — the substrate for a client-side filter if we avoid a server API change.
- `/api/search/graph` exists but is a structured JSON graph query engine, not a "give me matching protocol titles" endpoint; wiring it is heavier than needed.

## Architecture / proposed approach
Add a **search box to `ProtocolTabPanel`** that runs a local substring filter over a combined list of candidate/source protocols drawn from `getProtocolContext()` PLUS free-floating `vendor-pdf` records (fetch via `listRecordsByKind('vendor-pdf')`), matching on `payload.title`, `recordId`, and (lazily) extracted text / step labels. Keep it client-side and thin — reuse the existing `getProtocolContext` payload so attach behavior (`useProtocolInRun`) is unchanged. Results are grouped by scope (Project / Lab / Localized / Ingested PDFs), each row is `preview`-able, and (only for actual protocols) `Attach to run` uses the existing `useProtocolInRun`. Vendor-pdf rows open the extraction/review surface instead of attaching directly.

Because `useProtocolInRun` only accepts real protocol/local-protocol records, a `vendor-pdf` result must not offer "Attach" — it offers "Open / Extract protocol" (a link to `/ingestion/vendor-pdf/:id` or the review page). This keeps the change narrow and avoids mutating the attach contract.

## Step-by-step tasks

### Task 1 — Extend `ProtocolSelector` with a client-side search input

File: `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`
- Add `const [query, setQuery] = useState('')` and `const trimmed = query.trim().toLowerCase()`.
- Filter `projectProtocols`, `labProtocols`, and any new `ingestedPdfs` list by `titleOf(p).toLowerCase().includes(trimmed) || p.recordId.toLowerCase().includes(trimmed)` when `trimmed` is non-empty.
- Render a text input at the top:

```tsx
<input
  type="search"
  placeholder="Search protocols and PDFs…"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  data-testid="protocol-search-input"
  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--cl-border)', background: 'var(--cl-bg-elev)', color: 'var(--cl-text)', fontSize: '13px' }}
/>
```

- When `trimmed` is non-empty and zero matches across all groups, show `No matches for "<query>"`. Only filter when non-empty (no behavior change when empty).

Verify: `npm run typecheck -w app`.

### Task 2 — RED test for search filtering

File: `app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` (exists)
Add a test: render `ProtocolSelector` with a `context` containing two lab protocols — one titled "CellROX Flow Assay", one titled "PCR Cleanup Kit" — type "cellrox" into the search input, and assert only the CellROX row is present.

```tsx
it('filters lab protocols by search query', () => {
  const context = {
    projectTemplates: [],
    experimentProtocols: [],
    runMethods: [],
    promotableRunMethods: [],
    availableProtocols: [
      { recordId: 'P-1', payload: { title: 'CellROX Flow Assay', kind: 'protocol' } },
      { recordId: 'P-2', payload: { title: 'PCR Cleanup Kit', kind: 'protocol' } },
    ],
  };
  const view = render(
    <MemoryRouter><ProtocolSelector runId="R-1" studyId="STU-1" context={context} onAttached={() => {}} /></MemoryRouter>,
  );
  // type into the search input
  fireEvent.change(screen.getByTestId('protocol-search-input'), { target: { value: 'cellrox' } });
  expect(screen.getByText('CellROX Flow Assay')).toBeInTheDocument();
  expect(screen.queryByText('PCR Cleanup Kit')).not.toBeInTheDocument();
});
```

Run `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx`. If `context` typing rejects `availableProtocols` entries, check the `ProtocolContextResponse` type in `app/src/shared/api/client.ts` (line ~58). → **Fail** (no search input yet).

### Task 3 — Fetch free-floating ingested vendor PDFs and surface them as a searchable group

File: `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`
- Add a `useEffect` that loads free-floating vendor-pdfs into the selector's scope:

```tsx
const [ingestedPdfs, setIngestedPdfs] = useState<RecordEnvelope[]>([])
useEffect(() => {
  let cancelled = false
  apiClient.listRecordsByKind('vendor-pdf', 200).then((r) => {
    if (!cancelled) setIngestedPdfs(r.records)
  }).catch(() => {})
  return () => { cancelled = true }
}, [])
```

- Add a third group below `labProtocols`, rendered only when `ingestedPdfs` has matches (or, when there's a query, only matching PDFs). Each row:
  - Title = `titleOf(pdf)` (the vendor-pdf `payload.title`).
  - Sub = `recordId · Vendor PDF`.
  - **No "Attach to run"** — instead a single "Open" button that calls a new optional prop `onOpenIngestedPdf?: (recordId: string) => void`, defaulting to navigating to `/ingestion/vendor-pdf/${recordId}`.
- Pass `onOpenIngestedPdf` from `ProtocolTabPanel` (add prop; default `(id) => window.open(\`/ingestion/vendor-pdf/${id}\`,'_blank')` or `navigate`).

Verify: `npm run typecheck -w app`.

### Task 4 — Include localized lab protocols and candidate protocols in the searchable set

- Localized lab protocols are already present in `getProtocolContext` results (`projectProtocols` study-scoped + `labProtocols` lab-wide) — the search from Task 1 already covers them (title/id). Confirm by checking that `local-protocol` records carry a `title` (they do, via `titleOf`).
- "Candidate protocols" (the `CAN-protocol-*` promoted protocol records) are free-floating `protocol` records already in `labProtocols` (promoted protocols have no study link). So they are already searchable once Task 1 lands. No new fetch needed for them — verify with a test that a promoted `protocol` record in `availableProtocols` appears under a matching query.
- Add one more test to `ProtocolSelector.test.tsx`: a query matching a `local-protocol` title returns it.

Run `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` → all pass.

### Task 5 — (Optional) Search by step text / extracted body

If the user wants search inside the protocol step text (not just title/id), extend the match predicate to include the preview's steps and (for PDFs) extracted text. Because step text requires a fetch (the protocol-context list only has `recordId`/`title`), reuse the lazy body-cache pattern already in `SearchTabPanel.tsx` (lines 46-101): on query, fetch pages of candidates' step text / PDF `extractedText` once (cached by recordId), then match. Keep the fetch budget bounded (e.g. ≤ 10 per keystroke, as `SearchTabPanel` does).

This is OPTIONAL; include only if step-body search is required. It adds network calls per keystroke; keep Task 1-4 as the core.

### Task 6 — Wire the search input and PDF-open prop through `ProtocolTabPanel`

File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- Render `<ProtocolSelector ... onOpenIngestedPdf={(id) => navigate('/ingestion/vendor-pdf/' + id)} />` (add the missing prop). Confirm `ProtocolTabPanel` has `useNavigate`; add if missing.
- No change to the attach flow (`useProtocolInRun`) — Task 1-4 keep it intact.

Verify: `npm run typecheck -w app` clean.

## Tests / validation summary
- `ProtocolSelector.test.tsx`: (1) title query filters lab protocols; (2) vendor-pdf row appears when queried and has no attach button; (3) `local-protocol`/promoted `protocol` match by title; (4) no-match shows "No matches". Each written RED before its implementation, then GREEN.
- `npm run typecheck -w app`.
- Live: start the app (Vite dev on :5174), open a run's Protocol tab, type "cellrox" → CellROX kit (freed vendor-pdf) shows; the freely-ingested PDF row has an "Open" (not "Attach") action; a protocol with "cellrox" in its title shows under Lab Protocols with Attach.

## Risks, tradeoffs, open questions
- **No server search engine is used** — this is a local substring filter over `getProtocolContext` + one `listRecordsByKind('vendor-pdf')` fetch. For large libraries this won't scale (N records × substring match), but the app's library is small today. If it grows, move the filter server-side into `getProtocolContext` (add a `q` query param) — a clean follow-up.
- **`useProtocolInRun` contract is unchanged** — only real protocol/local-protocol rows attach; vendor-pdf rows open/extract. This avoids touching protocol-context validation.
- **Attaching a vendor-PDF directly is intentionally NOT offered** — the run's protocol tab attaches a `protocol`/`local-protocol`, not a raw PDF. The user's ask is to *find* PDFs, then presumably extract/attach a protocol from them. Confirm the expected click path: "Open → review page → Extract Protocol → Promote → back to run to attach." If the user wants one-click PDF→attach, that's a larger change (promote-then-attach ephemeral flow) out of scope here.
- **Step-body search** (Task 5) adds per-keystroke fetches; kept optional + bounded. Confirm it's wanted before building.
- **Are ingested PDFs in the same "run editor" or the standalone `/protocol-builder`?** I assumed the run editor's Protocol tab (per "right hand protocols pane in the run editor"). If the user means a different pane, the same search component can be reused there.