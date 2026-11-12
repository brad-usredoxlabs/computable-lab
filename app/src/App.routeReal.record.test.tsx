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
 * REPAIRED (d5attr k=1, 2026-11-12): the static `import * as pdfjsLib from
 * 'pdfjs-dist'` in usePdfDocument.ts:15 replaced by a lazy `import('pdfjs-dist')`
 * on first real use, so pdfjs-dist is no longer in the RecordHostPage chunk's
 * static graph. This test is now the GREEN regression pin: the real chunk must
 * resolve and paint within 3000 ms with no component mocks.
 * FOLLOW-UP (optional, named for the record): the served-browser perfs slowness
 * (cold transform ~2.6 s) suggests further code-splitting of the PDF/editing
 * subtree out of the RecordHostPage chunk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// Trunk idiom (GcEvidenceRunPage.route.test.tsx:42): `virtual:cla-ai-overlay` is not
// resolvable in the vitest transform; Slot is the /event-editor/fixit route, not this pin.
// RecordHostPage and every module of its chunk remain REAL.
vi.mock('./extensions', () => ({ Slot: () => null }))

// Trunk idiom (App.url.test.tsx:58): BrowserRouter -> MemoryRouter seeded from location.
vi.mock('react-router-dom', async (original) => {
  const real = (await original()) as typeof import('react-router-dom')
  return {
    ...real,
    BrowserRouter: ({ children }: { children: ReactNode }) => (
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
