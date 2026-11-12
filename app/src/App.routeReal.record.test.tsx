/**
 * L2-DOC-INTAKE-1 unit d5attr — RED pin: REAL /record/:recordId route, NO component mock.
 *
 * Renders the real <App/> at /record/DOC-9 with ONLY the fetch transport stubbed. The lazy
 * import at App.tsx:67 (the RecordHostPage chunk) runs for REAL — RecordHostPage's whole
 * static subtree (RecordEditPanel -> taptab barrel, PdfViewerContext -> usePdfDocument ->
 * pdfjs-dist, AppShell, ShareRecordDialog, SurfaceChatBridge, apiClient) is imported, never
 * mocked. App.url.test.tsx:48 mocks RecordHostPage wholesale, so its 6/6 green cannot see a
 * chunk that rejects or stalls at module-evaluation time. This pin documents that failure.
 *
 * EXPECTED WHILE THE DEFECT IS OPEN (jsdom): the chunk REJECTS at module-evaluation —
 * usePdfDocument.ts:15 `import * as pdfjsLib from 'pdfjs-dist'` evaluates
 * pdfjs-dist@5.4.296/build/pdf.mjs:9387 `const SCALE_MATRIX = new DOMMatrix()` at module
 * scope, which throws `ReferenceError: DOMMatrix is not defined` (jsdom 29.1.1 has no
 * DOMMatrix; real browsers do). The lazy import rejects, Suspense stays on "Loading...",
 * the host surface never paints, and this test FAILS (that failure IS the pin).
 *
 * In the served browser (g2 receipt DOC-INTAKE-browser-g2-l2t1335) the same oversized eager
 * chunk (167 app modules + ~1 MB pdfjs) does NOT throw (no console/page errors) but
 * COLD-TRANSFORMS too slowly to resolve within 30 s (perfs: 2.2 KB -> 1802 ms, 6.4 KB ->
 * 2603 ms; zero /api/records/* + /api/ui/record/*). Same root cause: the RecordHostPage lazy
 * chunk is oversized. FOLLOW-UP UNIT: code-split the PDF/editing subtree out of the eager
 * RecordHostPage chunk (lazy-load the PDF subtree; ideally the whole editing subtree).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Trunk idiom (GcEvidenceRunPage.route.test.tsx:42): `virtual:cla-ai-overlay` is not
// resolvable in the vitest transform; Slot is the /event-editor/fixit route, not this pin.
// RecordHostPage and every module of its chunk remain REAL.
vi.mock('./extensions', () => ({ Slot: () => null }))

// Trunk idiom (App.url.test.tsx:58): BrowserRouter -> MemoryRouter seeded from location.
vi.mock('react-router-dom', async (original) => {
  const real = (await original()) as typeof import('react-router-dom')
  return {
    ...real,
    BrowserRouter: ({ children }: { children: unknown }) => (
      <real.MemoryRouter initialEntries={[window.location.pathname]}>{children}</real.MemoryRouter>
    ),
  }
})

const fetchMock = vi.fn()
class StubResponse {
  constructor(
    public status: number,
    public ok: boolean,
    private body: unknown,
  ) {}
  json(): Promise<unknown> {
    return Promise.resolve(this.body)
  }
}

// Only the transport is stubbed (the brief: "stub only fetch"). Header-keyed and shaped to
// the real RecordResponse / editor-projection / access-policy contracts the real client
// expects (client.ts getRecord/getRecordEditorProjection/getAccessPolicy).
const RECORD = {
  recordId: 'DOC-9',
  kind: 'controlled-document',
  studyId: 'STU-1',
  payload: { title: 'DOC-9' },
}

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/ui/record/DOC-9/editor')) {
      return new StubResponse(200, true, { sections: [] })
    }
    if (url.includes('/records/DOC-9/access-policy')) {
      return new StubResponse(200, true, { isPolicyRoot: false, canAdmin: false })
    }
    if (url.includes('/records/DOC-9')) {
      return new StubResponse(200, true, { record: RECORD })
    }
    // Inert 404 for everything else: every consumer in the real graph catch-swallows, so
    // the page paints its honest state instead of hanging.
    return new StubResponse(404, false, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `no stub: ${url}`,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

import { App } from './App'

const URL = '/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9'

describe('L2-DOC-INTAKE-1 d5attr — real /record/:recordId route (un-mocked RecordHostPage)', () => {
  it('the real RecordHostPage chunk resolves and the host surface appears within 3000 ms', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rejections: unknown[] = []
    const onRej = (e: PromiseRejectionEvent) => {
      e.preventDefault() // absorb so vitest does not report a separate unhandled error
      rejections.push(e.reason)
    }
    window.addEventListener('unhandledrejection', onRej)
    window.history.replaceState({}, '', URL)
    render(<App />)
    let host: HTMLElement | null = null
    let probe: unknown = null
    try {
      host = await screen.findByTestId('record-edit-panel', undefined, { timeout: 3000 })
    } catch (e) {
      probe = e // the host surface never painted (chunk rejected / stalled)
    } finally {
      window.removeEventListener('unhandledrejection', onRej)
    }
    if (!host) {
      const consoleErrors = errSpy.mock.calls.map((c) => c.join(' ')).join('\n---\n')
      const reasonStr = rejections
        .map((r) =>
          r instanceof Error
            ? `${r.name}: ${r.message}\n${(r.stack ?? '').split('\n').slice(0, 5).join('\n')}`
            : String(r),
        )
        .join('\n---\n')
      throw new Error(
        `HOST SURFACE NEVER PAINTED within 3000 ms at ${URL} (stuck on Suspense "Loading...").\n` +
          `=> the RecordHostPage lazy chunk (App.tsx:67) did NOT resolve. First owned-subtree\n` +
          `   frame: usePdfDocument.ts:15 -> pdfjs-dist@5.4.296/build/pdf.mjs:9387 (new DOMMatrix()).\n` +
          `unhandledrejection:\n${reasonStr || '(none)'}\n` +
          `console.error sample:\n${consoleErrors.slice(0, 2000) || '(none)'}\n` +
          `probe:\n${probe instanceof Error ? probe.message : String(probe)}`,
      )
    }
    expect(host).toBeTruthy()
    const consoleErrors = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(consoleErrors).not.toMatch(/Failed to fetch dynamically imported module|Minified React error/)
    // AC2 pin: once the host painted, the Suspense fallback text is gone (never terminal).
    expect(document.body.textContent).not.toContain('Loading...')
  }, 10000)
})
