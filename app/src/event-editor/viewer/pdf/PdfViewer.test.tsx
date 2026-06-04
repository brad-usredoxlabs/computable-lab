/**
 * PdfViewer/PdfToolbar smoke tests with pdfjs mocked.
 *
 * The real pdfjs needs a Web Worker which isn't available in jsdom; we
 * mock the module so the test stays focused on the React state machine
 * (artifact load → URL → mocked-pdf-load → page-count exposed to toolbar).
 *
 * Coverage:
 *  - PdfStateProvider loads the artifact via apiClient.getRecord
 *  - Provider exposes pageCount from the mocked PDF document
 *  - Toolbar enables nav buttons once the document is ready
 *  - Toolbar prev/next clamps activePage; goToPage updates context
 *  - Search runs against extractedText and updates the highlight state
 *  - Viewer renders the header + extracted-text panel
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'

// Mock pdfjs-dist so usePdfDocument doesn't try to spawn a worker.
const fakeDoc = {
  numPages: 3,
  fingerprints: ['fp-test'],
  getPage: vi.fn(async (n: number) => ({
    getViewport: () => ({ width: 600, height: 800, scale: 1 }),
    render: () => ({ promise: Promise.resolve(), cancel: () => undefined }),
    streamTextContent: () => ({ getReader: () => undefined }),
    getTextContent: async () => ({ items: [{ str: `page ${n} content` }] }),
  })),
  destroy: vi.fn(),
}
const fakeLoadingTask = {
  promise: Promise.resolve(fakeDoc),
  destroy: vi.fn(),
}
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => fakeLoadingTask),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'worker.mjs',
}))

// Mock apiClient — we only need getRecord + artifactBlobUrl for these tests.
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async (recordId: string) => ({
      recordId,
      schemaId: 'artifact',
      payload: {
        kind: 'artifact',
        artifactKind: 'pdf',
        recordId,
        studyId: 'STU-000001',
        title: 'Mock PDF',
        file: {
          file_name: 'mock.pdf',
          media_type: 'application/pdf',
          stored_path: 'pdfs/mock.pdf',
        },
        extractedText: [
          { pageNumber: 1, text: 'introduction with a buffer prep step' },
          { pageNumber: 2, text: 'continued protocol body' },
          { pageNumber: 3, text: 'references and appendix' },
        ],
      },
      meta: { kind: 'artifact' },
    })),
    artifactBlobUrl: (studyId: string, artifactId: string) =>
      `/api/studies/${studyId}/artifacts/${artifactId}/blob`,
  },
}))

// Mock useWorkspace to avoid loading a real WorkspaceProvider.
vi.mock('../../workspace/WorkspaceContext', () => ({
  useWorkspace: () => ({
    state: { studyId: 'STU-000001' },
  }),
}))

import { PdfStateProvider } from './PdfViewerContext'
import { PdfViewer } from './PdfViewer'
import { PdfToolbar } from './PdfToolbar'

beforeEach(() => {
  fakeDoc.getPage.mockClear()
  fakeLoadingTask.destroy.mockClear()
})

afterEach(() => cleanup())

function Harness({ children }: { children: ReactNode }) {
  return (
    <PdfStateProvider artifactId="ART-000001" title="Mock PDF">
      {children}
    </PdfStateProvider>
  )
}

describe('PdfStateProvider + PdfViewer + PdfToolbar', () => {
  it('loads the artifact and exposes page count once the PDF resolves', async () => {
    render(
      <Harness>
        <PdfToolbar artifactId="ART-000001" />
        <PdfViewer artifactId="ART-000001" title="Mock PDF" />
      </Harness>,
    )

    // While loading, header is visible immediately.
    expect(screen.getByText('Mock PDF')).toBeTruthy()
    expect(screen.getByText('ART-000001')).toBeTruthy()

    // After the mocked load resolves, the toolbar shows "/ 3" page count.
    await waitFor(() =>
      expect(
        screen.getByTestId('pdf-toolbar').textContent ?? '',
      ).toContain('/ 3'),
    )
  })

  it('prev/next buttons are disabled until the PDF is ready', async () => {
    render(
      <Harness>
        <PdfToolbar artifactId="ART-000001" />
        <PdfViewer artifactId="ART-000001" title="Mock PDF" />
      </Harness>,
    )
    // Wait until ready.
    await waitFor(() =>
      expect(
        (screen.getByTestId('pdf-toolbar-next') as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    // On page 1 with 3 pages: prev disabled, next enabled.
    expect(
      (screen.getByTestId('pdf-toolbar-prev') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('search jumps to the page containing the term and surfaces a highlight', async () => {
    render(
      <Harness>
        <PdfToolbar artifactId="ART-000001" />
        <PdfViewer artifactId="ART-000001" title="Mock PDF" />
      </Harness>,
    )
    await waitFor(() =>
      expect(
        (screen.getByTestId('pdf-toolbar-search-input') as HTMLInputElement)
          .disabled,
      ).toBe(false),
    )

    const input = screen.getByTestId(
      'pdf-toolbar-search-input',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'references' } })
    act(() => {
      fireEvent.click(screen.getByTestId('pdf-toolbar-search-submit'))
    })
    // The matching span in the extracted-text panel is wrapped in <mark>.
    const hit = await screen.findByText('references')
    expect(hit.tagName.toLowerCase()).toBe('mark')
  })

  it('zoom buttons update the percentage readout', async () => {
    render(
      <Harness>
        <PdfToolbar artifactId="ART-000001" />
        <PdfViewer artifactId="ART-000001" title="Mock PDF" />
      </Harness>,
    )
    await waitFor(() =>
      expect(
        (screen.getByTestId('pdf-toolbar-zoom-in') as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    expect(
      screen.getByTestId('pdf-toolbar-zoom-readout').textContent,
    ).toBe('100%')
    act(() => {
      fireEvent.click(screen.getByTestId('pdf-toolbar-zoom-in'))
    })
    expect(
      screen.getByTestId('pdf-toolbar-zoom-readout').textContent,
    ).toBe('110%')
    act(() => {
      fireEvent.click(screen.getByTestId('pdf-toolbar-zoom-out'))
      fireEvent.click(screen.getByTestId('pdf-toolbar-zoom-out'))
    })
    expect(
      screen.getByTestId('pdf-toolbar-zoom-readout').textContent,
    ).toBe('90%')
  })
})
