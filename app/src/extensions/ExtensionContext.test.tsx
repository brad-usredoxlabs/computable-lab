import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(() => cleanup())

import type { ExtensionManifest } from '@cla-lab/ai-extension-api'
import { ExtensionProvider, Slot } from './ExtensionContext'
import { NULL_OVERLAY } from './loadOverlay'

function FakeDock({ label }: { label?: string }) {
  return <div data-testid="fake-dock">dock-{label ?? 'default'}</div>
}

describe('ExtensionProvider + Slot', () => {
  it('renders the registered component when the slot has an entry', () => {
    const manifest: ExtensionManifest = {
      slots: { 'event-editor.dock': FakeDock },
      aiClient: null,
    }
    render(
      <ExtensionProvider manifest={manifest}>
        <Slot name="event-editor.dock" label="hello" />
      </ExtensionProvider>,
    )
    expect(screen.getByTestId('fake-dock')).toHaveTextContent('dock-hello')
  })

  it('falls back to NullSlot when no entry is registered', () => {
    render(
      <ExtensionProvider manifest={NULL_OVERLAY}>
        <Slot name="event-editor.dock" />
      </ExtensionProvider>,
    )
    expect(screen.getByTestId('null-slot-event-editor.dock')).toBeInTheDocument()
    expect(screen.getByTestId('null-slot-event-editor.dock')).toHaveTextContent(
      /AI feature unavailable/,
    )
  })

  it('forwards arbitrary props to the registered component', () => {
    const manifest: ExtensionManifest = {
      slots: { 'chat.panel.literature': FakeDock },
      aiClient: null,
    }
    render(
      <ExtensionProvider manifest={manifest}>
        <Slot name="chat.panel.literature" label="lit" />
      </ExtensionProvider>,
    )
    expect(screen.getByTestId('fake-dock')).toHaveTextContent('dock-lit')
  })
})
