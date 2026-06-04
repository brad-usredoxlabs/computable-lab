/**
 * Tests for the polymorphic Viewer dispatcher.
 *
 * Covers:
 *  - empty state when no tab is active
 *  - PDF tab renders the PdfViewer placeholder with its artifact id/title
 *  - document tab renders the DocumentEditor placeholder
 *  - deck tab renders the DeckViewer, which queries useEventEditor — we
 *    mock that to avoid pulling in the full provider for this test
 *
 * Phase 5/6/7 will swap the placeholders for real implementations; those
 * components will own their own tests. This file only asserts that the
 * dispatcher picks the right one for each kind.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Mock the deck viewer's data source so the test doesn't need the full
// EventEditorProvider tree (which loads platforms over HTTP on mount).
vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: {
      loadState: 'ready',
      platformId: null,
      variantId: null,
      platforms: [],
      focusPlacementId: null,
    },
  }),
}))

// Mock the deck stage so we don't transitively pull in the deck/lawn/well
// rendering tree (which has its own context expectations). The dispatcher
// test only cares that DeckViewer was selected.
vi.mock('../deck/DeckStage', () => ({
  DeckStage: () => <div data-testid="deck-stage-mock">DECK</div>,
}))

// Mock the PdfViewer so we don't transitively import pdfjs-dist (which
// uses DOMMatrix at module-load and crashes in jsdom). Phase 5 has its
// own tests for the real component.
vi.mock('./pdf/PdfViewer', () => ({
  PdfViewer: (props: { artifactId: string; title: string }) => (
    <div className="viewer-placeholder viewer-placeholder--pdf">
      <h2>{props.title}</h2>
      <p className="viewer-placeholder__id">{props.artifactId}</p>
      <p className="viewer-placeholder__hint">Phase 5 placeholder</p>
    </div>
  ),
}))

// Same shape for DocumentEditor — the real component reads from
// DocumentStateProvider; the dispatcher test only cares that DocumentEditor
// was selected for kind=document.
vi.mock('./document/DocumentEditor', () => ({
  DocumentEditor: (props: { artifactId: string; title: string }) => (
    <div className="viewer-placeholder viewer-placeholder--document">
      <h2>{props.title}</h2>
      <p className="viewer-placeholder__id">{props.artifactId}</p>
      <p className="viewer-placeholder__hint">Phase 6 placeholder</p>
    </div>
  ),
}))

import { Viewer } from './Viewer'
import type { WorkspaceTab } from '../workspace/types'

afterEach(() => cleanup())

describe('Viewer dispatcher', () => {
  it('renders the empty state when no tab is active', () => {
    render(<Viewer tab={null} />)
    expect(screen.getByText('No viewer open')).toBeTruthy()
  })

  it('renders the PdfViewer placeholder for kind=pdf', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'pdf',
      artifactId: 'ART-000001',
      title: 'Vendor protocol',
    }
    render(<Viewer tab={tab} />)
    expect(screen.getByText('Vendor protocol')).toBeTruthy()
    expect(screen.getByText('ART-000001')).toBeTruthy()
    expect(screen.getByText(/Phase 5/)).toBeTruthy()
  })

  it('renders the DocumentEditor placeholder for kind=document', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'document',
      artifactId: 'ART-000002',
      title: 'Buffer prep protocol',
    }
    render(<Viewer tab={tab} />)
    expect(screen.getByText('Buffer prep protocol')).toBeTruthy()
    expect(screen.getByText('ART-000002')).toBeTruthy()
    expect(screen.getByText(/Phase 6/)).toBeTruthy()
  })

  it('renders the DeckViewer for kind=deck', () => {
    const tab: WorkspaceTab = {
      id: 't1',
      kind: 'deck',
      eventGraphId: 'EVG-000001',
      title: 'Run 1',
    }
    render(<Viewer tab={tab} />)
    // Mocked DeckStage marker confirms the dispatcher chose deck.
    expect(screen.getByTestId('deck-stage-mock')).toBeTruthy()
  })
})
