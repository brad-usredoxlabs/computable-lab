/**
 * Tests for the ViewerToolbar dispatcher.
 *
 *  - null tab → renders nothing (slot collapses)
 *  - pdf / document tabs → render their placeholder toolbars
 *  - deck tab → renders the DeckToolbar chips, which pull from useEventEditor
 *    (mocked here to avoid the full provider)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { WorkspaceTab } from '../workspace/types'

const eventEditorMock = vi.hoisted(() => ({
  state: {
    platformId: 'manual',
    variantId: 'manual_single_plate',
    platforms: [{
      id: 'manual',
      label: 'Manual',
      compilerFamily: 'manual',
      allowedVocabIds: ['liquid-handling/v1'],
      toolTypeIds: ['pipette_1ch'],
      variants: [{ id: 'manual_single_plate', title: 'Single plate', slots: [] }],
    }],
    vocabPackId: 'liquid-handling/v1',
    toolTypeId: 'pipette_1ch',
    assistPipetteId: null,
    tipState: { kind: 'empty' },
    eventGraphId: null,
    eventGraphCommit: null,
    runId: null as string | null,
    dirty: false,
    history: { past: [], future: [] },
    runDeckLock: null as null | { locked: true; platformId: string; variantId: string; source: string; lockedAt: string },
  },
}))

// The chips inside DeckToolbar (DeckModeSwitcher / VocabSwitcher /
// ToolSwitcher / TipChip / EventGraphChip) all useEventEditor. Mock the
// hook with a minimal shape that satisfies every chip's reads without
// pulling in EventEditorProvider.
vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: eventEditorMock.state,
    actions: {
      setPlatform: () => undefined,
      setVariant: () => undefined,
      setVocab: () => undefined,
      setTool: () => undefined,
      dropTip: () => undefined,
      undo: () => undefined,
      redo: () => undefined,
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

beforeEach(() => {
  eventEditorMock.state.runDeckLock = null
})

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

  it('renders the DeckToolbar unlocked controls for kind=deck', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'deck',
      eventGraphId: 'EVG-000001',
      title: 'Run 1',
    }
    render(<ViewerToolbar tab={tab} />)
    // The DeckToolbar's wrapper class confirms the deck branch was taken.
    expect(document.querySelector('.viewer-toolbar--deck')).toBeTruthy()
    expect(screen.getByText('Deck')).toBeTruthy()
    expect(screen.getByText('Vocab')).toBeTruthy()
    expect(screen.getByText('Tool')).toBeTruthy()
  })

  it('hides locked deck context controls for deck tabs', () => {
    eventEditorMock.state.runDeckLock = {
      locked: true,
      platformId: 'manual',
      variantId: 'manual_single_plate',
      source: 'first-edit',
      lockedAt: '2026-06-15T00:00:00.000Z',
    }
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'deck',
      eventGraphId: 'EVG-000001',
      title: 'Run 1',
    }
    render(<ViewerToolbar tab={tab} />)
    expect(document.querySelector('.viewer-toolbar--deck')).toBeTruthy()
    expect(screen.queryByText('Deck')).toBeNull()
    expect(screen.queryByText('Vocab')).toBeNull()
    expect(screen.getByText('Tool')).toBeTruthy()
  })
})
