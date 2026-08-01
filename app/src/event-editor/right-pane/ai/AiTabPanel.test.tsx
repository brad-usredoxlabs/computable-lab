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
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    clearProtocolCandidate: vi.fn(),
  }),
}))

import { AiTabPanel, WarmIndicator, clarificationAnswerPrompt } from './AiTabPanel'
import { mentionTokenForOption } from './MessageLog'
import { systemPromptForViewer } from './systemPromptForViewer'

afterEach(() => cleanup())

describe('WarmIndicator', () => {
  it('pulses while the prefill is pending or warming', () => {
    render(<WarmIndicator status={{ state: 'warming' }} />)
    expect(screen.getByTestId('ai-tab-warm').textContent).toContain('pre-filling context')
  })

  it('shows the token count once warmed', () => {
    render(<WarmIndicator status={{ state: 'warmed', promptTokens: 37787, ms: 42000 }} />)
    const chip = screen.getByTestId('ai-tab-warm')
    expect(chip.textContent).toContain('context ready')
    expect(chip.textContent).toContain('37,787 tok')
  })

  it('notes failure quietly and renders nothing for idle/disabled', () => {
    render(<WarmIndicator status={{ state: 'failed' }} />)
    expect(screen.getByTestId('ai-tab-warm').textContent).toContain('pre-fill failed')
    cleanup()
    render(<WarmIndicator status={{ state: 'idle' }} />)
    expect(screen.queryByTestId('ai-tab-warm')).toBeNull()
    render(<WarmIndicator status={{ state: 'disabled' }} />)
    expect(screen.queryByTestId('ai-tab-warm')).toBeNull()
  })
})

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

describe('clarification answer routing', () => {
  it('builds material mention tokens from CURIE-backed options', () => {
    expect(mentionTokenForOption(
      { id: 'cells', kind: 'material', prompt: 'Which cells?', menuProvider: '/m', options: [] },
      { id: 'fallback-id', label: 'Hep G2 Cells', ref: { id: 'mesh:D056945', kind: 'ontology' } },
    )).toBe('[[material:mesh:D056945|Hep G2 Cells]]')
  })

  it('sends clarification answers with the mention token in the prompt text', () => {
    expect(clarificationAnswerPrompt(
      {
        requestId: 'cells',
        label: 'Hep G2 Cells',
        mentionToken: '[[material:mesh:D056945|Hep G2 Cells]]',
      },
      { id: 'cells', kind: 'material', prompt: 'Which cells?', entityType: 'material', menuProvider: '/m', options: [] },
    )).toBe('Use [[material:mesh:D056945|Hep G2 Cells]] for material.')
  })
})

describe('AiTabPanel', () => {
  it('shows the sidebar header label ("AI Assistant") in the initial ready state', async () => {
    renderWithTab()
    // The sidebar starts in 'ready' mode; headerLabel returns "AI Assistant".
    expect(await screen.findByText('AI Assistant')).toBeTruthy()
  })

  it('renders the system-prompt header element', async () => {
    renderWithTab()
    expect(await screen.findByTestId('ai-tab-system-prompt')).toBeTruthy()
  })

  it('renders SourcesStrip + ChatInput in the initial ready state', async () => {
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
    expect(systemPromptForViewer('pdf').id).toBe('protocol-builder')
    expect(systemPromptForViewer('document').id).toBe('workspace.document')
    expect(systemPromptForViewer(null).id).toBe('workspace.none')
  })
})
