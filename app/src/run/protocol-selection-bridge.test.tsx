/**
 * Focused tests for protocol-selection wiring in the run workspace:
 *   (a) ProtocolSelectionProvider gives useProtocolSelection() a non-null value.
 *   (b) ProtocolPreviewBridge renders null without throwing when both
 *       ProtocolSelectionProvider and a mocked EventEditorProvider are present.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'

// Mock the EventEditorContext module so ProtocolPreviewBridge can render
// without pulling in the full EventEditorProvider (which does API fetches).
vi.mock('../event-editor/EventEditorContext', () => {
  const createContext = vi.fn(() => ({
    Provider: ({ children }: { children: unknown }) => children,
  }))
  return {
    createContext,
    useEventEditor: () => ({
      state: { preview: null },
      actions: {
        setPreview: vi.fn(),
        clearPreview: vi.fn(),
      },
    }),
  }
})

import { ProtocolSelectionProvider, useProtocolSelection } from '../event-editor/protocol/ProtocolSelectionContext'
import { ProtocolPreviewBridge } from '../event-editor/protocol/ProtocolPreviewBridge'

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProtocolSelectionProvider + ProtocolPreviewBridge', () => {
  it('useProtocolSelection() returns a non-null value inside ProtocolSelectionProvider', () => {
    function Consumer() {
      const ctx = useProtocolSelection()
      return (
        <div data-testid="proto-context">
          {ctx !== null ? 'present' : 'null'}
        </div>
      )
    }

    const { container } = render(
      <ProtocolSelectionProvider>
        <Consumer />
      </ProtocolSelectionProvider>,
    )

    expect(
      container.querySelector('[data-testid="proto-context"]')?.textContent,
    ).toBe('present')
  })

  it('ProtocolPreviewBridge renders null without throwing inside both providers', () => {
    // Should not throw during render.
    expect(() =>
      render(
        <ProtocolSelectionProvider>
          <ProtocolPreviewBridge />
        </ProtocolSelectionProvider>,
      ),
    ).not.toThrow()

    // The bridge itself returns null -- no DOM nodes.
    const { container } = render(
      <ProtocolSelectionProvider>
        <ProtocolPreviewBridge />
      </ProtocolSelectionProvider>,
    )
    expect(container.firstChild).toBeNull()
  })
})
