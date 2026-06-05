/**
 * AiTabPanel composition tests. Phase 7b replaces the placeholder with
 * the real composition (SourcesStrip + MessageLog + ChatInput +
 * RunInEventEditorButton); this file asserts the panel mounts the right
 * pieces in the right contexts without hitting the network.
 *
 *  - system prompt label changes with the active viewer kind
 *  - SourcesStrip is rendered
 *  - ChatInput is rendered (textarea + send button)
 *  - RunInEventEditorButton is hidden for deck tabs and visible for pdf
 *  - the chat reducer/SSE client live in their own test files; we mock
 *    useChatThread so the panel test isn't entangled with that path
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  WorkspaceProvider,
} from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

// Mock pdfjs-dist so PdfStateProvider (transitively imported by
// RunInEventEditorButton) doesn't crash jsdom on DOMMatrix.
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

// Mock useChatThread so the panel renders without triggering an SSE fetch.
// The reducer/client have their own focused tests.
vi.mock('./useChatThread', () => ({
  useChatThread: () => ({
    state: { messages: [], pending: null, status: null, error: null },
    isStreaming: false,
    send: async () => undefined,
    stop: () => undefined,
    reset: () => undefined,
  }),
}))

import { AiTabPanel } from './AiTabPanel'
import { systemPromptForViewer } from './systemPromptForViewer'

afterEach(() => cleanup())

function renderWithTab(
  initialState?: Partial<ReturnType<typeof defaultWorkspaceState>>,
) {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({
          state: { ...base, ...(initialState as Record<string, unknown>) } as ReturnType<
            typeof defaultWorkspaceState
          >,
        })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <AiTabPanel />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

describe('AiTabPanel', () => {
  it('surfaces the no-viewer system prompt when no tab is active', async () => {
    // Phase 12 made defaultWorkspaceState seed a project-details tab as
    // active. To exercise the null-viewer branch we explicitly clear
    // tabs and activeTabId.
    renderWithTab({ tabs: [], activeTabId: null })
    const expected = systemPromptForViewer(null)
    expect(await screen.findByText(expected.label)).toBeTruthy()
  })

  it('surfaces the project-details system prompt for the default landing tab', async () => {
    // Default seed = project-details active.
    renderWithTab()
    const expected = systemPromptForViewer('project-details')
    expect(await screen.findByText(expected.label)).toBeTruthy()
  })

  it('switches the system prompt label when a PDF tab is active', async () => {
    renderWithTab({
      tabs: [
        {
          id: 't1',
          kind: 'pdf',
          artifactId: 'ART-000001',
          title: 'Vendor protocol',
        },
      ],
      activeTabId: 't1',
    })
    const pdf = systemPromptForViewer('pdf')
    expect(await screen.findByText(pdf.label)).toBeTruthy()
  })

  it('renders SourcesStrip + ChatInput', async () => {
    renderWithTab()
    // Wait for the system-prompt label to confirm the panel mounted.
    await screen.findByTestId('ai-tab-system-prompt')
    expect(screen.getByTestId('sources-strip')).toBeTruthy()
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('hides RunInEventEditorButton when the active viewer IS a deck', async () => {
    renderWithTab({
      tabs: [
        {
          id: 't1',
          kind: 'deck',
          eventGraphId: 'EVG-1',
          title: 'Deck',
        },
      ],
      activeTabId: 't1',
    })
    await screen.findByTestId('ai-tab-system-prompt')
    expect(screen.queryByTestId('run-in-event-editor')).toBeNull()
  })

  it('shows RunInEventEditorButton when the active viewer is a PDF', async () => {
    renderWithTab({
      tabs: [
        {
          id: 't1',
          kind: 'pdf',
          artifactId: 'ART-000001',
          title: 'Vendor protocol',
        },
      ],
      activeTabId: 't1',
    })
    expect(await screen.findByTestId('run-in-event-editor')).toBeTruthy()
  })
})

describe('systemPromptForViewer', () => {
  it('returns distinct labels for deck/pdf/document/null', () => {
    const labels = new Set([
      systemPromptForViewer('deck').label,
      systemPromptForViewer('pdf').label,
      systemPromptForViewer('document').label,
      systemPromptForViewer(null).label,
    ])
    expect(labels.size).toBe(4)
  })

  it('exposes stable ids for telemetry', () => {
    expect(systemPromptForViewer('deck').id).toBe('workspace.deck')
    expect(systemPromptForViewer('pdf').id).toBe('workspace.pdf')
    expect(systemPromptForViewer('document').id).toBe('workspace.document')
    expect(systemPromptForViewer(null).id).toBe('workspace.none')
  })
})
