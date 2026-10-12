/**
 * SHORTHAND-CHAT fix cycle 1 (advc1 DEFECT-5) — the clarification turn is
 * proposal-bearing: result.shorthand must ride the `clarifications-needed`
 * dispatch (conditional spread) and render VERBATIM above the questions while
 * the draft is paused.
 *
 * Harness: same option-capturing `useChatThread` seam as
 * AiTabPanel.protocolEdit.test.tsx — the test emits a draft result exactly
 * like the SSE `done` event does and asserts the panel's clarification view.
 * A result WITHOUT shorthand must render the clarification view byte-unchanged
 * (exactOptionalPropertyTypes discipline on the client side).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

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

const mocks = vi.hoisted(() => ({
  chatOptions: null as null | { onDraftResult?: (result: unknown, prompt: string) => void },
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: { onDraftResult?: (result: unknown, prompt: string) => void }) => {
    mocks.chatOptions = options
    return {
      state: { messages: [], pending: null, status: null, error: null },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => null,
}))

import { AiTabPanel } from './AiTabPanel'

const SHORTHAND_YAML = [
  'intentId: chat-add-mystery',
  'actions:',
  '  - action: add_material',
  '    labware: plate',
  '    material: mystery goop',
  '    volumeUl: 50',
  '    targetWells: [A1]',
  '',
].join('\n')

const CLARIFICATION = {
  id: 'unresolved-1',
  kind: 'material',
  prompt: 'The draft names "mystery goop" and the lab spine could not bind it. Choose what it is, or create a local term.',
  menuProvider: '/m',
  query: 'mystery goop',
  options: [],
  allowCreateLocal: true,
}

function renderPanel() {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <OpenTabsProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-1', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

async function emitClarificationTurn(result: Record<string, unknown>) {
  await act(async () => {
    mocks.chatOptions?.onDraftResult?.(result, 'add 50 uL of mystery goop to A1')
  })
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
})

describe('AiTabPanel — SHORTHAND-CHAT fix cycle 1: shorthand on the clarification turn', () => {
  it('carries result.shorthand through clarifications-needed: the paused draft shows the document VERBATIM above the questions', async () => {
    renderPanel()
    await emitClarificationTurn({
      success: true,
      events: [],
      clarificationRequests: [CLARIFICATION],
      shorthand: SHORTHAND_YAML,
    })

    // The clarification view is active (Questions sub-tab + panel).
    expect(screen.getByTestId('questions-panel')).toBeDefined()
    // The shorthand the server carried on the needs-clarification result is
    // rendered VERBATIM — byte-identical, above the questions.
    const pre = screen.getByTestId('shorthand-verbatim')
    expect(pre.textContent).toBe(SHORTHAND_YAML)
    // Render-only during clarification: no edit affordance (the answer fold is
    // the server's deterministic job).
    expect(screen.queryByTestId('shorthand-edit')).toBeNull()
  })

  it('a clarification WITHOUT shorthand renders the questions view byte-unchanged (no shorthand key introduced)', async () => {
    renderPanel()
    await emitClarificationTurn({
      success: true,
      events: [],
      clarificationRequests: [CLARIFICATION],
    })
    expect(screen.getByTestId('questions-panel')).toBeDefined()
    expect(screen.queryByTestId('shorthand-view')).toBeNull()
  })
})
