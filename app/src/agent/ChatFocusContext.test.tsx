/**
 * HARNESS-SEQ-1 Phase 1 — ChatFocusContext + SurfaceFocusHeader.
 *
 * The focus label is DERIVED from resolved surface state published by the host
 * page. Zero model calls, zero AI prose. Without a provider the header renders
 * nothing (the run page's ChatContextHeader fallback must stay untouched).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatFocusProvider, useChatFocus } from './ChatFocusContext'
import { SurfaceFocusHeader } from './SurfaceFocusHeader'
import { ChatContextHeader } from '../event-editor/right-pane/ai/ChatContextHeader'

afterEach(cleanup)

function Reader() {
  const focus = useChatFocus()
  return <span data-testid="focus-reader">{focus === null ? 'none' : focus.label}</span>
}

describe('ChatFocusContext', () => {
  it('has no focus without a provider', () => {
    render(<Reader />)
    expect(screen.getByTestId('focus-reader')).toHaveTextContent('none')
  })

  it('has no focus inside an empty provider', () => {
    render(
      <ChatFocusProvider>
        <Reader />
      </ChatFocusProvider>,
    )
    expect(screen.getByTestId('focus-reader')).toHaveTextContent('none')
  })

  it('reads the focus published by the host', () => {
    render(
      <ChatFocusProvider focus={{ surface: 'sequences', label: 'Sequences — Analysis' }}>
        <Reader />
      </ChatFocusProvider>,
    )
    expect(screen.getByTestId('focus-reader')).toHaveTextContent('Sequences — Analysis')
  })
})

describe('SurfaceFocusHeader', () => {
  it('renders nothing when no ChatFocusContext is present', () => {
    render(<SurfaceFocusHeader />)
    expect(screen.queryByTestId('surface-focus-header')).toBeNull()
  })

  it('renders the published label with its own testid', () => {
    render(
      <ChatFocusProvider focus={{ surface: 'sequences', label: 'Sequences — Editor · pUC19' }}>
        <SurfaceFocusHeader />
      </ChatFocusProvider>,
    )
    const header = screen.getByTestId('surface-focus-header')
    expect(header).toHaveTextContent('Working focus')
    expect(header).toHaveTextContent('Sequences — Editor · pUC19')
  })

  it('renders nothing when the provider holds no focus', () => {
    render(
      <ChatFocusProvider>
        <SurfaceFocusHeader />
      </ChatFocusProvider>,
    )
    expect(screen.queryByTestId('surface-focus-header')).toBeNull()
  })
})

describe('ChatContextHeader delegation (B1: fall-through-identical without a ChatFocusContext)', () => {
  it('keeps the existing protocol-selection path byte-for-byte when no ChatFocusContext exists', () => {
    render(<ChatContextHeader />)
    // No ChatFocusProvider in the tree (the run page never publishes one): the
    // header must render its existing no-step-focused strings and testid.
    const header = screen.getByTestId('chat-context-header')
    expect(header).toHaveTextContent('Working focus')
    expect(header).toHaveTextContent('No step focused — ask the AI to navigate')
    expect(screen.queryByTestId('surface-focus-header')).toBeNull()
  })

  it('delegates to a non-null ChatFocusContext when one is present', () => {
    render(
      <ChatFocusProvider focus={{ surface: 'sequences', label: 'Sequences — Import' }}>
        <ChatContextHeader />
      </ChatFocusProvider>,
    )
    const header = screen.getByTestId('chat-context-header')
    expect(header).toHaveTextContent('Working focus')
    expect(header).toHaveTextContent('Sequences — Import')
  })
})
