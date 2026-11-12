# L2-DOC-INTAKE-1 unit d5attr — attribution report

Item: L2-DOC-INTAKE-1 (lane 2). Base: 9911a2d2a690315ee8b252169ba9cd8d17a56e40.
Branch: cl/lane2-docintake-d5attr-1426. Date: 2026-11-12 14:30 EST.

## Mandate

Prove, with a REAL (un-mocked) module import on /record/:recordId, WHICH module in
the RecordHostPage lazy chunk (App.tsx:67) fails to load and why. Land a minimal
repair if <=80 changed product lines in owned files; otherwise commit report +
pin and exit BLOCKED naming the follow-up unit.

Symptom (D5, g2 receipt lanes/2/receipts/DOC-INTAKE-browser-g2-l2t1335): the served
build at /record/<id> stays on the literal "Loading..." (DeferredRoute Suspense
fallback, App.tsx:88) forever and fires ZERO /api requests — i.e. the lazy import
at App.tsx:67 either rejects (module-evaluation throw inside the chunk's static
graph) or never resolves. App.url.test.tsx:48 mocks RecordHostPage, so the 6/6
green there cannot see the defect.

## Step 1 — RED (real-import test, no component mocks)

File: app/src/App.routeReal.record.test.tsx (NEW). Renders the real <App/> at
/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9; only the fetch
transport is stubbed (vi.stubGlobal('fetch', ...)) plus the App.url.test.tsx
BrowserRouter→MemoryRouter harness idiom. Asserts the host surface
(data-testid="record-edit-panel", the real RecordEditPanel header surface,
RecordEditPanel.tsx:199) appears within 3000 ms.

Command: `cd app && npx vitest run src/App.routeReal.record.test.tsx`

RAW output:

(placeholder — paste)

## Step 2 — attribution

(placeholder)

## Step 3 — repair / pin

(placeholder)

## AC mapping (browser gate)

- AC1: /record/<existing id> shows editor header + record's fields, no "Loading...",
  no manual reload. If BLOCKED: this report names the exact failing module:line.
- AC2: "Loading..." is pre-load only (at most one paint), never terminal; missing
  record id shows honest not-found/empty state.
- AC3: /record/new/run/<experimentId>, /runs, /lab, /claims unchanged;
  App.url.test.tsx 6/6 green unmodified.

## Verify before exit

(placeholder)
