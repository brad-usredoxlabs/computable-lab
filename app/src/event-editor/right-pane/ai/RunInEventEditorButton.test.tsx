/**
 * RunInEventEditorButton tests.
 *
 *  - hidden when no active tab
 *  - hidden when the active tab is already kind=deck
 *  - visible on pdf / document tabs
 *  - clicking opens a new deck tab when none exists, and calls onPrefilled
 *    with the composed prompt + viewer excerpt
 *  - clicking activates the existing deck tab when one is open
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  WorkspaceProvider,
  useWorkspace,
} from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState, type WorkspaceTab } from '../../workspace/types'
import { RunInEventEditorButton } from './RunInEventEditorButton'
import { PdfStateProvider } from '../../viewer/pdf/PdfViewerContext'
import { DocumentStateProvider } from '../../viewer/document/DocumentEditorContext'

afterEach(() => cleanup())

// Mock pdfjs-dist so DocumentEditorContext+PdfStateProvider can mount in
// jsdom without DOMMatrix.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      fingerprints: [''],
      getPage: () => Promise.resolve(null),
      destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

// Mock apiClient so PdfStateProvider's getRecord doesn't hit the network.
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async (id: string) => ({
      recordId: id,
      schemaId: 'artifact',
      payload: {
        kind: 'artifact',
        recordId: id,
        studyId: 'STU-000001',
        title: 'X',
        artifactKind: 'pdf',
        file: { stored_path: 'x.pdf' },
        extractedText: [{ pageNumber: 1, text: 'sample excerpt body' }],
      },
      meta: { kind: 'artifact' },
    })),
    artifactBlobUrl: (s: string, a: string) => `/api/studies/${s}/artifacts/${a}/blob`,
    updateRecord: vi.fn(async () => ({ ok: true })),
  },
}))

interface HarnessProps {
  tabs?: WorkspaceTab[]
  activeTabId?: string | null
  promptDraft?: string
  onPrefilled?: (text: string) => void
  registerWs?: (ws: ReturnType<typeof useWorkspace>) => void
}

function Probe({ register }: { register: (ws: ReturnType<typeof useWorkspace>) => void }) {
  const ws = useWorkspace()
  register(ws)
  return null
}

function renderButton(props: HarnessProps) {
  const tabs = props.tabs ?? []
  const activeTabId = props.activeTabId ?? null
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const buttonAndProbe = (
    <>
      <RunInEventEditorButton
        activeTab={activeTab}
        promptDraft={props.promptDraft ?? ''}
        onPrefilled={props.onPrefilled ?? (() => undefined)}
      />
      {props.registerWs ? <Probe register={props.registerWs} /> : null}
    </>
  )

  // The per-viewer state providers (PdfStateProvider / DocumentStateProvider)
  // call useWorkspace internally, so they must live INSIDE the
  // WorkspaceProvider. Compose accordingly per active-viewer kind.
  let inner: React.ReactNode = buttonAndProbe
  if (activeTab?.kind === 'pdf') {
    inner = (
      <PdfStateProvider artifactId={activeTab.artifactId} title={activeTab.title}>
        {buttonAndProbe}
      </PdfStateProvider>
    )
  } else if (activeTab?.kind === 'document') {
    inner = (
      <DocumentStateProvider
        artifactId={activeTab.artifactId}
        title={activeTab.title}
        loadFn={async () => ({
          kind: 'artifact' as const,
          recordId: activeTab.artifactId,
          title: activeTab.title,
          studyId: 'STU-000001',
          artifactKind: 'protocol',
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'document body sample' }],
              },
            ],
          },
        })}
        saveFn={async () => undefined}
      >
        {buttonAndProbe}
      </DocumentStateProvider>
    )
  }

  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({
          state: {
            ...defaultWorkspaceState('STU-000001'),
            tabs,
            activeTabId,
          },
        })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        {inner}
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

describe('RunInEventEditorButton', () => {
  it('renders nothing when there is no active tab', () => {
    renderButton({ activeTabId: null })
    expect(screen.queryByTestId('run-in-event-editor')).toBeNull()
  })

  it('renders nothing when the active tab is already a deck', () => {
    const deck: WorkspaceTab = {
      id: 't1',
      kind: 'deck',
      eventGraphId: 'EVG-1',
      title: 'Run 1',
    }
    renderButton({ tabs: [deck], activeTabId: 't1' })
    expect(screen.queryByTestId('run-in-event-editor')).toBeNull()
  })

  it('renders on pdf tabs and dispatches with viewer excerpt', async () => {
    const pdf: WorkspaceTab = {
      id: 't1',
      kind: 'pdf',
      artifactId: 'ART-000001',
      title: 'Vendor protocol',
    }
    const onPrefilled = vi.fn()
    renderButton({
      tabs: [pdf],
      activeTabId: 't1',
      promptDraft: 'put a plate at A1',
      onPrefilled,
    })
    const btn = await screen.findByTestId('run-in-event-editor')
    fireEvent.click(btn)
    expect(onPrefilled).toHaveBeenCalledOnce()
    const text = onPrefilled.mock.calls[0][0] as string
    expect(text).toContain('put a plate at A1')
    expect(text).toContain('-- Source: PDF ART-000001')
  })

  it('opens a deck tab when none exists and activates it', async () => {
    const pdf: WorkspaceTab = {
      id: 't1',
      kind: 'pdf',
      artifactId: 'ART-000001',
      title: 'Vendor protocol',
    }
    let lastWs: ReturnType<typeof useWorkspace> | null = null
    renderButton({
      tabs: [pdf],
      activeTabId: 't1',
      onPrefilled: () => undefined,
      registerWs: (ws) => {
        lastWs = ws
      },
    })
    const btn = await screen.findByTestId('run-in-event-editor')
    fireEvent.click(btn)
    // The button creates a deck tab and switches active to it.
    expect(lastWs).not.toBeNull()
    const tabs = lastWs!.state.tabs
    expect(tabs.some((t) => t.kind === 'deck')).toBe(true)
    expect(lastWs!.state.activeTabId).toBeDefined()
  })

  it('activates the existing deck tab when one is already open', async () => {
    const pdf: WorkspaceTab = {
      id: 't1',
      kind: 'pdf',
      artifactId: 'ART-000001',
      title: 'Vendor protocol',
    }
    const deck: WorkspaceTab = {
      id: 'existing-deck',
      kind: 'deck',
      eventGraphId: '',
      title: 'Existing deck',
    }
    let lastWs: ReturnType<typeof useWorkspace> | null = null
    renderButton({
      tabs: [pdf, deck],
      activeTabId: 't1',
      registerWs: (ws) => {
        lastWs = ws
      },
    })
    const btn = await screen.findByTestId('run-in-event-editor')
    fireEvent.click(btn)
    // No new deck tab is created — the existing one is activated.
    expect(lastWs!.state.tabs.filter((t) => t.kind === 'deck')).toHaveLength(1)
    expect(lastWs!.state.activeTabId).toBe('existing-deck')
  })
})
