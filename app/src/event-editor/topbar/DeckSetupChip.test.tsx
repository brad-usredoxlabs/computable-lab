/**
 * DeckSetupChip — the run's deck setup is ONE composite control, not three
 * pulldowns (Deck / Variant / Vocab) eating toolbar width — worst on a phone.
 *
 * Contract:
 *  - closed: a single trigger chip summarising the current setup; no <select>;
 *  - open: the choices in their natural PROGRESSIVE order — Deck, then Variant,
 *    then Vocab — as one panel;
 *  - picking a deck uses the existing action (the reducer reseeds variant +
 *    vocab + tool defaults for the new platform);
 *  - once the run's deck is locked the setup is read-only: no panel, no knobs
 *    (it was chosen at the start of the run).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const platforms = [
  {
    id: 'manual',
    label: 'Manual',
    compilerFamily: 'manual',
    allowedVocabIds: ['liquid-handling/v1', 'cell-culture/v1'],
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
    allowedVocabIds: ['liquid-handling/v1'],
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
    // The summary names the chosen deck and variant, so the toolbar needs no
    // separate labels.
    expect(screen.getByTestId('deck-setup-trigger').textContent).toContain('Manual')
    expect(screen.getByTestId('deck-setup-trigger').textContent).toContain('Single SBS Plate')
  })

  it('opens ONE panel with the choices in progressive order: Deck, Variant, Vocab', () => {
    setup()
    expect(screen.queryByTestId('deck-setup-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    const panel = screen.getByTestId('deck-setup-panel')
    expect(panel).toBeInTheDocument()

    const labels = Array.from(panel.querySelectorAll('[data-setup-step]')).map((el) =>
      el.getAttribute('data-setup-step'),
    )
    expect(labels).toEqual(['deck', 'variant', 'vocab'])
  })

  it('choosing a deck dispatches setPlatform (the reducer reseeds variant + vocab)', () => {
    setup()
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    fireEvent.click(screen.getByTestId('deck-setup-option-integra_assist'))
    expect(mocked.setPlatform).toHaveBeenCalledWith('integra_assist')
  })

  it('choosing a variant and a vocab pack dispatch their actions', () => {
    setup()
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    fireEvent.click(screen.getByTestId('deck-setup-option-manual_collapsed'))
    expect(mocked.setVariant).toHaveBeenCalledWith('manual_collapsed')
    fireEvent.click(screen.getByTestId('deck-setup-vocab-cell-culture~v1'))
    expect(mocked.setVocab).toHaveBeenCalledWith('cell-culture/v1')
  })

  it('once the run deck is locked the chip still opens, but every choice is greyed out', () => {
    setup({ runDeck: { platformId: 'manual', variantId: 'manual_single_plate' } })
    const chip = screen.getByTestId('deck-setup-chip')
    expect(chip.textContent).toContain('Manual')

    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    expect(screen.getByTestId('deck-setup-panel')).toBeInTheDocument()
    // Choices are visible (so you can see what the run was set up with) but
    // inert.
    const platform = screen.getByTestId('deck-setup-option-manual') as HTMLButtonElement
    expect(platform.disabled).toBe(true)
  })

  it('locks the SAME panel behind an explicit "Switch deck" action', () => {
    setup({ runDeck: { platformId: 'manual', variantId: 'manual_single_plate' } })
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))

    const switchBtn = screen.getByTestId('deck-setup-switch')
    expect(switchBtn.textContent).toMatch(/switch deck/i)

    fireEvent.click(switchBtn)
    const platform = screen.getByTestId('deck-setup-option-integra_assist') as HTMLButtonElement
    expect(platform.disabled).toBe(false)

    fireEvent.click(platform)
    expect(mocked.setPlatform).toHaveBeenCalledWith('integra_assist')
  })

  it('re-locks when the panel is closed and reopened', () => {
    setup({ runDeck: { platformId: 'manual', variantId: 'manual_single_plate' } })
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    fireEvent.click(screen.getByTestId('deck-setup-switch'))
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    const platform = screen.getByTestId('deck-setup-option-manual') as HTMLButtonElement
    expect(platform.disabled).toBe(true)
  })

  it('states the consequence: switching clears the deck', () => {
    setup({
      runDeck: { platformId: 'manual', variantId: 'manual_single_plate' },
      placements: [{}, {}, {}],
    })
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    expect(screen.getByTestId('deck-setup-switch-note').textContent).toMatch(/clears/i)
  })

  it('renders the panel in a portal on document.body so no toolbar overflow can clip it', () => {
    setup()
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    const panel = screen.getByTestId('deck-setup-panel')
    // A toolbar with overflow-x:auto clips absolutely-positioned children —
    // on a phone the panel existed but was never visible. Portal out.
    expect(panel.parentElement).toBe(document.body)
    expect(getComputedStyle(panel).position === 'fixed' || panel.style.position === 'fixed').toBe(true)
  })

  it('clicking INSIDE the panel does not close it (outside-click must ignore the portal)', () => {
    setup()
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    fireEvent.mouseDown(screen.getByTestId('deck-setup-panel'))
    expect(screen.getByTestId('deck-setup-panel')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    setup()
    fireEvent.click(screen.getByTestId('deck-setup-trigger'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('deck-setup-panel')).toBeNull()
  })
})
