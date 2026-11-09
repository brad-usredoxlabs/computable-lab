/**
 * HARNESS-SEQ-1 Phase 1 — ChatFocusContext + SurfaceFocusHeader.
 *
 * The focus label is DERIVED from resolved surface state published by the host
 * page. Zero model calls, zero AI prose. Without a provider the header renders
 * nothing.
 *
 * LEG D: the 'ChatContextHeader delegation' describes (previously here) are
 * transplanted onto SurfaceFocusHeader coverage — ChatContextHeader.tsx died
 * with AiTabPanel in this leg (its only mount was the RightPane fallback arm,
 * now always-harness). SurfaceFocusHeader is the surviving working-focus
 * header (HarnessChatPane mounts it); its testid (surface-focus-header) is
 * what the run page's three-pane-harness.spec.ts re-pin names.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatFocusProvider, useChatFocus } from './ChatFocusContext'
import { SurfaceFocusHeader } from './SurfaceFocusHeader'

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

describe('working-focus delegation (B1: fall-through-identical without a ChatFocusContext)', () => {
  // LEG D transplant of the 'ChatContextHeader delegation' describes: the
  // surviving header is SurfaceFocusHeader (the chat-context-header testid and
  // its strings died with ChatContextHeader). The semantics carry over —
  // WITHOUT a published focus the header renders nothing (the run page
  // publishes no ChatFocusContext, so its pane shows no header element); WITH
  // a non-null focus it renders the published label with the pane's own
  // testid. Never AI prose, never a fallback string.
  it('renders nothing when no ChatFocusContext exists (the run page never publishes one)', () => {
    render(<SurfaceFocusHeader />)
    // No ChatFocusProvider in the tree: the header must render NOTHING —
    // no element, no placeholder string (the legacy "No step focused"
    // fallback died with ChatContextHeader).
    expect(screen.queryByTestId('surface-focus-header')).toBeNull()
  })

  it('delegates to a non-null ChatFocusContext when one is present', () => {
    render(
      <ChatFocusProvider focus={{ surface: 'sequences', label: 'Sequences — Import' }}>
        <SurfaceFocusHeader />
      </ChatFocusProvider>,
    )
    const header = screen.getByTestId('surface-focus-header')
    expect(header).toHaveTextContent('Working focus')
    expect(header).toHaveTextContent('Sequences — Import')
  })
})
