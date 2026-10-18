/**
 * DeckSetupChip — the run's deck setup as ONE compact, CASCADING control.
 *
 * Contract:
 *  - closed: a single trigger chip summarising the setup; no native <select>;
 *  - open: three rows in the order the decision is actually made —
 *    Vocab → Deck → Variant — with only the FIRST row's options expanded;
 *  - each menu is dictated by the previous choice: the deck list holds only
 *    platforms whose allowedVocabIds include the chosen pack; the variant list
 *    only that platform's layouts;
 *  - picking a vocab the current deck cannot run re-seats the deck on the first
 *    platform that can (the reducer reseeds variant + tool);
 *  - once the run has its deck the rows are greyed (disabled) with one explicit
 *    "Switch deck" action that un-greys them;
 *  - the panel is portalled so a scrolling toolbar can never clip it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const platforms = [
  {
    id: 'manual',
    label: 'Manual',
    compilerFamily: 'manual',
    // liquid handling only — the cascade must hide it for a cell pack
    allowedVocabIds: ['liquid-handling/v1'],
    toolTypeIds: ['pipette_1ch'],
    variants: [
      { id: 'manual_single_plate', title: 'Single SBS Plate', slots: [] },
      { id: 'manual_collapsed', title: 'Manual Technician Mode', slots: [] },
    ],
  },
  {
    id: 'integra_assist',
    label: 'Integra Assist',
    compilerFamily: 'assist_plus',
    allowedVocabIds: ['cell-culture/v1'],
    toolTypeIds: ['viaflo'],
    variants: [{ id: 'assist_plus_3pos', title: 'Integra Assist Plus (3-position)', slots: [] }],
  },
]

const mocked = vi.hoisted(() => ({
  setPlatform: vi.fn(),
  setVariant: vi.fn(),
  setVocab: vi.fn(),
  state: {
    platformId: 'manual',
    variantId: 'manual_single_plate',
    vocabPackId: 'liquid-handling/v1',
    platforms: [] as unknown[],
    placements: [] as unknown[],
    events: [] as unknown[],
    runDeck: null as null | { platformId: string; variantId: string },
  },
}))

vi.mock('../EventEditorContext', () => ({
  // Mirror the real predicate: a run that declares its deck, or an editor with
  // deck content, has already made the start-of-run choice.
  isDeckSetupLocked: (state: typeof mocked.state) =>
    state.runDeck !== null || state.placements.length > 0 || state.events.length > 0,
  useEventEditor: () => ({
    state: mocked.state,
    actions: {
      setPlatform: mocked.setPlatform,
      setVariant: mocked.setVariant,
      setVocab: mocked.setVocab,
    },
  }),
}))

vi.mock('../../shared/vocab/registry', () => ({
  getAllPacks: () => [
    { packId: 'liquid-handling/v1', displayName: 'Liquid Handling v1' },
    { packId: 'cell-culture/v1', displayName: 'Cell Culture v1' },
  ],
}))

import { DeckSetupChip } from './DeckSetupChip'

function setup(state: Partial<typeof mocked.state> = {}) {
  mocked.state.platforms = platforms
  mocked.state.runDeck = null
  mocked.state.placements = []
  mocked.state.events = []
  Object.assign(mocked.state, state)
  return render(<DeckSetupChip />)
}

function open() {
  fireEvent.click(screen.getByTestId('deck-setup-trigger'))
}

afterEach(() => {
  cleanup()
  mocked.setPlatform.mockReset()
  mocked.setVariant.mockReset()
  mocked.setVocab.mockReset()
})

describe('DeckSetupChip', () => {
  it('renders ONE compact control — no native selects anywhere', () => {
    setup()
    expect(screen.getByTestId('deck-setup-chip')).toBeInTheDocument()
    expect(document.querySelectorAll('select')).toHaveLength(0)
    const text = screen.getByTestId('deck-setup-trigger').textContent
    expect(text).toContain('Liquid Handling v1')
    expect(text).toContain('Manual')
    expect(text).toContain('Single SBS Plate')
  })

  it('opens with the three cascade rows, only the FIRST expanded', () => {
    setup()
    open()
    const panel = screen.getByTestId('deck-setup-panel')
    const rows = Array.from(panel.querySelectorAll('[data-setup-step]')).map((el) =>
      el.getAttribute('data-setup-step'),
    )
    expect(rows).toEqual(['vocab', 'deck', 'variant'])

    // Only the vocab options are on screen until that choice is made.
    expect(screen.getByTestId('deck-setup-vocab-cell-culture~v1')).toBeInTheDocument()
    expect(screen.queryByTestId('deck-setup-option-manual')).toBeNull()
  })

  it('step 2 is dictated by step 1: only decks that can run the chosen vocab', () => {
    setup()
    open()
    // liquid-handling → Manual only (Integra declares cell-culture).
    fireEvent.click(screen.getByTestId('deck-setup-vocab-liquid-handling~v1'))
    fireEvent.click(screen.getByTestId('deck-setup-row-deck'))
    expect(screen.getByTestId('deck-setup-option-manual')).toBeInTheDocument()
    expect(screen.queryByTestId('deck-setup-option-integra_assist')).toBeNull()
  })

  it('choosing a vocab the current deck cannot run re-seats the deck', () => {
    setup()
    open()
    fireEvent.click(screen.getByTestId('deck-setup-vocab-cell-culture~v1'))
    expect(mocked.setVocab).toHaveBeenCalledWith('cell-culture/v1')
    // Manual declares liquid-handling only, so the deck moves to Integra.
    expect(mocked.setPlatform).toHaveBeenCalledWith('integra_assist')
  })

  it('choosing a deck advances to its variants and dispatches setPlatform', () => {
    setup()
    open()
    fireEvent.click(screen.getByTestId('deck-setup-vocab-liquid-handling~v1'))
    fireEvent.click(screen.getByTestId('deck-setup-row-deck'))
    fireEvent.click(screen.getByTestId('deck-setup-option-manual'))

    expect(mocked.setPlatform).toHaveBeenCalledWith('manual')
    // Manual has two layouts, so the cascade advances to the variant row.
    expect(screen.getByTestId('deck-setup-option-manual_collapsed')).toBeInTheDocument()
  })

  it('choosing a variant dispatches setVariant and closes the panel', () => {
    setup()
    open()
    fireEvent.click(screen.getByTestId('deck-setup-vocab-liquid-handling~v1'))
    fireEvent.click(screen.getByTestId('deck-setup-row-deck'))
    fireEvent.click(screen.getByTestId('deck-setup-option-manual'))
    fireEvent.click(screen.getByTestId('deck-setup-option-manual_collapsed'))

    expect(mocked.setVariant).toHaveBeenCalledWith('manual_collapsed')
    expect(screen.queryByTestId('deck-setup-panel')).toBeNull()
  })

  it('renders the panel in a portal so no toolbar overflow can clip it', () => {
    setup()
    open()
    const panel = screen.getByTestId('deck-setup-panel')
    expect(panel.parentElement).toBe(document.body)
    expect(panel.style.position).toBe('fixed')
  })

  it('clicking INSIDE the panel does not close it (outside-click ignores the portal)', () => {
    setup()
    open()
    fireEvent.mouseDown(screen.getByTestId('deck-setup-panel'))
    expect(screen.getByTestId('deck-setup-panel')).toBeInTheDocument()
  })

  it('once the run deck is locked every row is greyed but still readable', () => {
    setup({ runDeck: { platformId: 'manual', variantId: 'manual_single_plate' } })
    open()
    const deckRow = screen.getByTestId('deck-setup-row-deck') as HTMLButtonElement
    expect(deckRow.disabled).toBe(true)
    // The chosen values stay visible.
    expect(deckRow.textContent).toContain('Manual')
    expect(screen.getByTestId('deck-setup-switch')).toBeInTheDocument()
  })

  it('"Switch deck" un-greys the cascade and restarts it at vocab', () => {
    setup({ runDeck: { platformId: 'manual', variantId: 'manual_single_plate' } })
    open()
    fireEvent.click(screen.getByTestId('deck-setup-switch'))

    const deckRow = screen.getByTestId('deck-setup-row-deck') as HTMLButtonElement
    expect(deckRow.disabled).toBe(false)
    expect(screen.queryByTestId('deck-setup-switch')).toBeNull()
    // The cascade restarts at step 1.
    expect(screen.getByTestId('deck-setup-vocab-cell-culture~v1')).toBeInTheDocument()
  })

  it('states the consequence: switching clears the deck', () => {
    setup({
      runDeck: { platformId: 'manual', variantId: 'manual_single_plate' },
      placements: [{}, {}, {}],
    })
    open()
    expect(screen.getByTestId('deck-setup-switch-note').textContent).toMatch(/clears/i)
  })

  it('the panel CSS is NOT scoped under .event-editor (it is portalled out of that tree)', () => {
    // Regression: the panel is portalled into .cl-app, so an ancestor selector
    // `.event-editor .deck-setup__panel` matches nothing and the menu renders
    // unstyled with no theme tokens.
    const css = readFileSync(
      resolve(process.cwd(), 'src/event-editor/styles/eventEditor.css'),
      'utf8',
    )
    expect(css).toContain('.deck-setup__panel {')
    expect(css).not.toMatch(/\.event-editor\s+\.deck-setup__panel/)
    expect(css).toContain('.deck-setup__row {')
    expect(css).toContain('.deck-setup__value {')
  })

  it('closes on Escape', () => {
    setup()
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('deck-setup-panel')).toBeNull()
  })
})
