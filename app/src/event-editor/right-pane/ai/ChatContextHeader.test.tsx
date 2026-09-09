import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ChatContextHeader } from './ChatContextHeader'

afterEach(() => {
  cleanup()
})

type Focus = { stepId: string; label: string; ordinal: number } | null

/** Seeds the focused step ONCE (effect-guarded) so the header reads a stable value. */
function SeedFocus({ focused }: { focused: Focus }) {
  const sel = useProtocolSelection()
  const done = { current: false }
  useEffect(() => {
    if (done.current) return
    done.current = true
    sel?.setFocusedStep(focused)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderHeader(focused: Focus) {
  return render(
    <ProtocolSelectionProvider>
      <SeedFocus focused={focused} />
      <ChatContextHeader />
    </ProtocolSelectionProvider>,
  )
}

describe('ChatContextHeader', () => {
  it('derives the label from the focused step (EDITING: Step N — concept)', async () => {
    const { container } = renderHeader({ stepId: 's3', label: 'Seed T25 flasks', ordinal: 3 })
    const header = container.querySelector('[data-testid="chat-context-header"]')
    expect(header).not.toBeNull()
    // The authoritative label comes from the resolved step, never AI prose.
    expect(header?.textContent).toContain('EDITING')
    expect(header?.textContent).toContain('Step 3')
    expect(header?.textContent).toContain('Seed T25 flasks')
  })

  it('says no step focused when the working focus is empty', () => {
    const { container } = renderHeader(null)
    const header = container.querySelector('[data-testid="chat-context-header"]')
    expect(header).not.toBeNull()
    expect(header?.textContent).toContain('Working focus')
    expect(header?.textContent).toContain('No step focused')
  })
})