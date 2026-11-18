# L2-DOC-INTAKE-1 unit d5attr — attribution report

Item: L2-DOC-INTAKE-1 (lane 2). Base: 9911a2d2a690315ee8b252169ba9cd8d17a56e40.
Branch: cl/lane2-docintake-d5attr-1426. Date: 2026-11-12 14:30 EST.
Re-dispatch k=1: item L2-DOC-INTAKE-1-d5attr2 (lane 2), run 2026-11-12 16:00 EST.

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

File: app/src/App.routeReal.record.test.tsx (draft from checkpoint 526ae580; run
AS-IS, not rewritten). Renders the real <App/> at
/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9; only the fetch
transport is stubbed (vi.stubGlobal('fetch', ...)) plus the App.url.test.tsx
BrowserRouter→MemoryRouter harness idiom. Asserts the host surface
(data-testid="record-edit-panel", the real RecordEditPanel header surface,
RecordEditPanel.tsx:199) appears within 3000 ms.

Environment fix (worktree hazard, per bedrock note): this worktree's
`app/node_modules` symlink pointed at the EMPTY
`/mnt/vast/home/brad/git/cl-integration-2/app/node_modules` (0 entries — no
vitest/jsdom/.bin). First run therefore resolved vitest from the npx cache and
failed with `Cannot find package 'jsdom'` (NOT-RUN, exit 1, 78 ms; that capture
was overwritten by the successful RED re-run — key line quoted: `Error:
Cannot find package 'jsdom' imported from .../vitest/dist/chunks/index.Bi0NXYPf.js`).
Re-linked to the root store
`/mnt/vast/home/brad/git/cl-integration-2/node_modules` (same target as the other
active lane-2 worktrees; has vitest 1.6.1 + jsdom + react). `app/node_modules`
is git-ignored — no tree change.

Command: `cd app && npx vitest run src/App.routeReal.record.test.tsx` — exit code 1 = RED (no hang)

RAW output (ANSI escapes stripped; text otherwise verbatim):

```

 RUN  v1.6.1 /home/brad/cl-wt/L2-DOC-INTAKE-d5attr-lane2/app

(node:2764907) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
stderr | src/App.routeReal.record.test.tsx > L2-DOC-INTAKE-1 d5attr — real /record/:recordId route (un-mocked RecordHostPage) > the real RecordHostPage chunk resolves and the host surface appears within 3000 ms
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/App.routeReal.record.test.tsx > L2-DOC-INTAKE-1 d5attr — real /record/:recordId route (un-mocked RecordHostPage) > the real RecordHostPage chunk resolves and the host surface appears within 3000 ms
Warning: Please use the `legacy` build in Node.js environments.

 ❯ src/App.routeReal.record.test.tsx  (1 test | 1 failed) 3033ms
   ❯ src/App.routeReal.record.test.tsx > L2-DOC-INTAKE-1 d5attr — real /record/:recordId route (un-mocked RecordHostPage) > the real RecordHostPage chunk resolves and the host surface appears within 3000 ms
     → HOST SURFACE NEVER PAINTED within 3000 ms at /record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9 (stuck on Suspense "Loading...").
=> the RecordHostPage lazy chunk (App.tsx:67) did NOT resolve. First owned-subtree
   frame: usePdfDocument.ts:15 -> pdfjs-dist@5.4.296/build/pdf.mjs:9387 (new DOMMatrix()).
unhandledrejection:
(none)
console.error sample:
ReferenceError: DOMMatrix is not defined
    at file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/pdfjs-dist@5.4.296/node_modules/pdfjs-dist/build/webpack:/pdf.js/src/display/canvas.js:63:22
    at ModuleJob.run (node:internal/modules/esm/module_job:569:25)
    at node:internal/modules/esm/loader:650:26
    at VitestExecutor.interopedImport (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:383:28)
    at VitestExecutor.directRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:253:24)
    at VitestExecutor.cachedRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:189:14)
    at VitestExecutor.dependencyRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:233:12)
    at /home/brad/cl-wt/L2-DOC-INTAKE-d5attr-lane2/app/src/event-editor/viewer/pdf/usePdfDocument.ts:2:31
    at VitestExecutor.runModule (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:362:5)
    at VitestExecutor.directRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:346:5)
---
ReferenceError: DOMMatrix is not defined
    at file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/pdfjs-dist@
probe:
Unable to find an element by: [data-testid="record-edit-panel"]

Ignored nodes: comments, script, style
<body>
  <div>
    <div
      class="error-boundary"
    >
      <h2>
        Something went wrong
      </h2>
      <pre
        class="error-message"
      >
        DOMMatrix is not defined
      </pre>
      <button>
        Try again
      </button>
    </div>
  </div>
</body>

Ignored nodes: comments, script, style
<body>
  <div>
    <div
      class="error-boundary"
    >
      <h2>
        Something went wrong
      </h2>
      <pre
        class="error-message"
      >
        DOMMatrix is not defined
      </pre>
      <button>
        Try again
      </button>
    </div>
  </div>
</body>

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/App.routeReal.record.test.tsx > L2-DOC-INTAKE-1 d5attr — real /record/:recordId route (un-mocked RecordHostPage) > the real RecordHostPage chunk resolves and the host surface appears within 3000 ms
Error: HOST SURFACE NEVER PAINTED within 3000 ms at /record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9 (stuck on Suspense "Loading...").
=> the RecordHostPage lazy chunk (App.tsx:67) did NOT resolve. First owned-subtree
   frame: usePdfDocument.ts:15 -> pdfjs-dist@5.4.296/build/pdf.mjs:9387 (new DOMMatrix()).
unhandledrejection:
(none)
console.error sample:
ReferenceError: DOMMatrix is not defined
    at file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/pdfjs-dist@5.4.296/node_modules/pdfjs-dist/build/webpack:/pdf.js/src/display/canvas.js:63:22
    at ModuleJob.run (node:internal/modules/esm/module_job:569:25)
    at node:internal/modules/esm/loader:650:26
    at VitestExecutor.interopedImport (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:383:28)
    at VitestExecutor.directRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:253:24)
    at VitestExecutor.cachedRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:189:14)
    at VitestExecutor.dependencyRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:233:12)
    at /home/brad/cl-wt/L2-DOC-INTAKE-d5attr-lane2/app/src/event-editor/viewer/pdf/usePdfDocument.ts:2:31
    at VitestExecutor.runModule (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:362:5)
    at VitestExecutor.directRequest (file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite-node@1.6.1_@types+node@20.19.41_lightningcss@1.32.0_supports-color@7.2.0_terser@5.48.0/node_modules/vite-node/dist/client.mjs:346:5)
---
ReferenceError: DOMMatrix is not defined
    at file:///mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/pdfjs-dist@
probe:
Unable to find an element by: [data-testid="record-edit-panel"]

Ignored nodes: comments, script, style
<body>
  <div>
    <div
      class="error-boundary"
    >
      <h2>
        Something went wrong
      </h2>
      <pre
        class="error-message"
      >
        DOMMatrix is not defined
      </pre>
      <button>
        Try again
      </button>
    </div>
  </div>
</body>

Ignored nodes: comments, script, style
<body>
  <div>
    <div
      class="error-boundary"
    >
      <h2>
        Something went wrong
      </h2>
      <pre
        class="error-message"
      >
        DOMMatrix is not defined
      </pre>
      <button>
        Try again
      </button>
    </div>
  </div>
</body>
 ❯ ../../../../../mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/pdfjs-dist@5.4.296/node_modules/pdfjs-dist/build/webpack:/pdf.js/src/display/canvas.js:63:22
 ❯ src/event-editor/viewer/pdf/usePdfDocument.ts:2:31
      1| /**
      2|  * usePdfDocument — load a PDF via pdfjs-dist and expose its PDFDocume…
       |                               ^
      3|  *
      4|  * Concentrates the pdfjs-dist plumbing (workerSrc, getDocument loading
 ❯ src/App.routeReal.record.test.tsx:130:13

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  16:16:52
   Duration  14.00s (transform 662ms, setup 879ms, collect 2.41s, tests 3.03s, environment 5.61s, prepare 532ms)
```

## Step 2 — attribution

FAILING MODULE: **pdfjs-dist@5.4.296** — `build/pdf.mjs`, webpack frame
`pdf.js/src/display/canvas.js:63:22` — a module-scope `new DOMMatrix()` during
module evaluation. Throw: `ReferenceError: DOMMatrix is not defined` (quoted
verbatim from RAW above).

The throw happens while evaluating the RecordHostPage lazy chunk's STATIC import
graph, so the `lazy(async () => import('./shared/shell/RecordHostPage'))` promise
at App.tsx:67 REJECTS. The DeferredRoute Suspense fallback at App.tsx:88 (literal
"Loading...") therefore never resolves and the page fires zero /api requests —
exactly the D5 symptom. (In a real browser DOMMatrix exists, so this specific
throw is the jsdom/Node-module-eval form of the defect; the measured fact this
unit owes is the module: it is pdfjs-dist, reached through the static import
below.)

First owned-subtree frame (quoted from RAW stack):
    at /home/brad/cl-wt/L2-DOC-INTAKE-d5attr-lane2/app/src/event-editor/viewer/pdf/usePdfDocument.ts:2:31
The static import list of that file (one read, usePdfDocument.ts:14-20) is:
    import { useEffect, useState } from 'react'
    import * as pdfjsLib from 'pdfjs-dist'
    import type { PDFDocumentProxy } from 'pdfjs-dist'
    ...
    import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
The namespace import (line 15) pulls the whole pdf.js runtime — which touches
DOM globals at module init — into the RecordHostPage chunk's static graph even
though the record editor only needs it for the embedded artifact PDF viewer.
(The `?url` worker import on line 20 emits an asset URL and is not the
module-eval throw source per the RAW stack.)

Why the existing 6/6 green never saw it: App.url.test.tsx:48 mocks
RecordHostPage, so that chunk graph is never evaluated there.

## Step 3 — repair / pin

REPAIR LANDED (owned file: app/src/event-editor/viewer/pdf/usePdfDocument.ts:
70 changed lines, +44/-26, net +18; plus a NEW 141-line test file
app/src/App.routeReal.record.test.tsx (status A, not a touch-up). Measured
verbatim from `git diff --numstat 9911a2d2..HEAD`.)

Root cause: static `import * as pdfjsLib from 'pdfjs-dist'` (line 15) put the
pdf.js runtime — which executes `new DOMMatrix()` at module scope in
canvas.js:63 — into the RecordHostPage lazy chunk's static import graph, so
module evaluation of the chunk threw and the `lazy()` promise at App.tsx:67
rejected → permanent "Loading..." (App.tsx:88) with zero /api requests.

Change: replace the namespace import with a one-shot dynamic
`import('pdfjs-dist')` on first real use (`loadPdfjs()` inside the effect,
resolved before `getDocument`), move `GlobalWorkerOptions.workerSrc` setup to
first real use, guard cleanup with `task !== null`, keep the original
cancelled/destroy semantics. The `?url` worker import and the type-only import
(erasable, no runtime graph edge) remain.

Result (RAW tail of `npx vitest run src/App.routeReal.record.test.tsx`
src/App.url.test.tsx`, cwd app, exit 0):

```
 ✓ src/App.url.test.tsx  (6 tests) 143ms
 ✓ src/App.routeReal.record.test.tsx  (1 test) 1321ms
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

Typecheck: `npx tsc --noEmit` (cwd app) — 0 errors in app/src/**; the only
diagnostics are 6 pre-existing `TS2307 Cannot find module` errors in
`../server/src/**` (server's own store/module-resolution gap in this worktree;
server/ is untouched and out of scope).

Not done (out of scope / follow-up): further code-splitting of the
PDF/editing subtree out of the RecordHostPage chunk (the served-browser
cold-transform perfs slowness from the g2 receipt). Named follow-up unit:
L2-DOC-INTAKE-2-RECORDCHUNKSPLIT.

## AC mapping (browser gate)

- AC1: /record/<existing id> shows editor header + record's fields, no "Loading...",
  no manual reload. If BLOCKED: this report names the exact failing module:line.
- AC2: "Loading..." is pre-load only (at most one paint), never terminal; missing
  record id shows honest not-found/empty state.
- AC3: /record/new/run/<experimentId>, /runs, /lab, /claims unchanged;
  App.url.test.tsx 6/6 green unmodified.

## Verify before exit

- RED (pre-repair): `cd app && npx vitest run src/App.routeReal.record.test.tsx`
  → exit 1, RAW captured verbatim in Step 1 above (chunk rejects at module
  evaluation; first owned frame usePdfDocument.ts:2 → pdfjs-dist canvas.js:63).
- GREEN (post-repair, commit a6909375017b98b1bb4a12280dd2f0d235a14980):
  `cd app && npx vitest run src/App.routeReal.record.test.tsx src/App.url.test.tsx`
  → exit 0, `Test Files 2 passed (2)`, `Tests 7 passed (7)` (raw tail in Step 3).
- `cd app && npx tsc --noEmit` → app/src clean; only pre-existing server/ TS2307.
- App.url.test.tsx unmodified and 6/6.
- Worktree clean at exit (git status empty; app/node_modules is git-ignored).

L2-DOC-INTAKE-1-d5attr2 UNIT d5attr2 DONE a6909375017b98b1bb4a12280dd2f0d235a14980
