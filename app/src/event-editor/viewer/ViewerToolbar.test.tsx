/**
 * Tests for the ViewerToolbar dispatcher.
 *
 *  - null tab → renders nothing (slot collapses)
 *  - pdf / document tabs → render their placeholder toolbars
 *  - deck tab → renders the DeckToolbar chips, which pull from useEventEditor
 *    (mocked here to avoid the full provider)
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { WorkspaceTab } from '../workspace/types'

// The chips inside DeckToolbar (DeckModeSwitcher / VocabSwitcher /
// ToolSwitcher / TipChip / EventGraphChip) all useEventEditor. Mock the
// hook with a minimal shape that satisfies every chip's reads without
// pulling in EventEditorProvider.
vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: {
      platformId: 'flex',
      variantId: 'a1',
      platforms: [],
      vocabPackId: 'core',
      toolType: 'p300',
      tipState: { kind: 'empty' },
      eventGraphId: null,
      eventGraphCommit: null,
      runId: null,
      dirty: false,
      // Anything else a chip reads — return a sane default so render doesn't crash.
    },
    actions: {
      setPlatform: () => undefined,
      setVariant: () => undefined,
      setVocabPack: () => undefined,
      setToolType: () => undefined,
      dropTip: () => undefined,
    },
  }),
}))

// Mock the PdfToolbar so we don't transitively import pdfjs-dist (which
// uses DOMMatrix at module-load and crashes in jsdom). Phase 5 has its
// own tests for the real toolbar.
vi.mock('./pdf/PdfToolbar', () => ({
  PdfToolbar: (props: { artifactId: string }) => (
    <div className="viewer-toolbar viewer-toolbar--pdf">
      <span className="viewer-toolbar__hint">
        PDF toolbar · {props.artifactId}
      </span>
    </div>
  ),
}))

// Same shape for DocumentToolbar — the real component reads from
// DocumentStateProvider; the dispatcher test only cares that
// DocumentToolbar was selected for kind=document.
vi.mock('./document/DocumentToolbar', () => ({
  DocumentToolbar: (props: { artifactId: string }) => (
    <div className="viewer-toolbar viewer-toolbar--document">
      <span className="viewer-toolbar__hint">
        Rich-text toolbar · {props.artifactId}
      </span>
    </div>
  ),
}))

import { ViewerToolbar } from './ViewerToolbar'

afterEach(() => cleanup())

describe('ViewerToolbar dispatcher', () => {
  it('renders nothing when no tab is active', () => {
    const { container } = render(<ViewerToolbar tab={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the PdfToolbar placeholder for kind=pdf', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'pdf',
      artifactId: 'ART-000001',
      title: 'Vendor protocol',
    }
    render(<ViewerToolbar tab={tab} />)
    expect(screen.getByText(/PDF toolbar/)).toBeTruthy()
    expect(screen.getByText(/ART-000001/)).toBeTruthy()
  })

  it('renders the DocumentToolbar placeholder for kind=document', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'document',
      artifactId: 'ART-000002',
      title: 'Protocol',
    }
    render(<ViewerToolbar tab={tab} />)
    expect(screen.getByText(/Rich-text toolbar/)).toBeTruthy()
  })

  it('renders the DeckToolbar (and chip CSS classes) for kind=deck', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'deck',
      eventGraphId: 'EVG-000001',
      title: 'Run 1',
    }
    render(<ViewerToolbar tab={tab} />)
    // The DeckToolbar's wrapper class confirms the deck branch was taken.
    expect(document.querySelector('.viewer-toolbar--deck')).toBeTruthy()
  })
})
