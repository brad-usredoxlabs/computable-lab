/**
 * L2-CLARIFY-PICKER-1 — P1 focus-default + P2 consequence/section rendering in
 * the shared suggestion list (RED-first; the fields exist on the type and the
 * rows carry them from resolvers, but the LIST does not render/skip them yet).
 *
 * Pins (spec Change 1 focus rule + Change 2 + reviewer bait 6):
 *  - the per-row commit-consequence line renders inline (the W3 hover-card
 *    unreachability stops mattering);
 *  - the contains-section label renders on the FIRST row of a contains band
 *    (the data-declared template filled in by the comparator);
 *  - the focused (keyboard) default starts at the FIRST row whose
 *    canBeDefault !== false; a composition row (canBeDefault false) is never
 *    the default REGARDLESS of its position;
 *  - the default stays row 0 when no row carries canBeDefault: false (the
 *    slash editor's byte-stable behavior);
 *  - non-defaultable rows are skipped by arrow navigation and are never
 *    Enter-committable (the W1 wrong-material commit).
 */
import { createRef } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlashSuggestionList, type SlashSuggestionListHandle } from './SlashSuggestionList'
import { consequenceFor } from './clarifyPickerRanking'
import type { SlashSuggestion } from './types'

// jsdom implements no layout: the list's scroll-into-view effect (pre-existing)
// calls scrollIntoView, which jsdom's HTMLElement lacks. Standard stub.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

afterEach(cleanup)

function row(overrides: Partial<SlashSuggestion> & Pick<SlashSuggestion, 'key' | 'label'>): SlashSuggestion {
  const id = overrides.key.split(':')[1] ?? 'MAT-x'
  return {
    badge: 'Concept',
    mention: { type: 'material', entityKind: 'material', id, label: overrides.label },
    ...overrides,
  }
}

const D = (n: number) =>
  document.querySelectorAll(`[data-slash-row="${n}"]`)

describe('SlashSuggestionList — L2-CLARIFY-PICKER-1 P2: the per-row consequence line', () => {
  // advc-c1 DEFECT 5: the fixture is BUILT THROUGH consequenceFor (the
  // production generator), not hand-typed literals — so a wording drift in the
  // generator (the `(material)`/`(material-spec)` second vocabulary) FAILS
  // this test instead of the fixture merely echoing whatever it was written
  // with. The list still only proves the line RENDERS under the label.
  it('renders the consequence line under the label (the row says what committing it binds)', () => {
    const concept = { recordId: 'MAT-dmem-ykg0', kind: 'material', title: 'DMEM', category: 'concept-only' }
    const composition = { recordId: 'MSP-1', kind: 'material-spec', title: 'DMEM + FBS', category: 'saved-stock' }
    const items = [
      row({ key: 'material:MAT-dmem-ykg0', label: 'DMEM', consequence: consequenceFor(concept) }),
      row({ key: 'material-spec:MSP-1', label: 'DMEM + FBS', badge: 'Composition', consequence: consequenceFor(composition) }),
    ]
    render(<SlashSuggestionList items={items} loading={false} command={vi.fn()} />)
    // The SPEC kind words (concept / formulation), not the raw mention kind.
    expect(screen.getByText('binds material record MAT-dmem-ykg0 "DMEM" (concept)')).toBeTruthy()
    expect(screen.getByText('binds formulation MSP-1 (composition of 2 components)')).toBeTruthy()
  })

  it('renders the contains-section label on the FIRST row of a contains band only (the data-declared presentation)', () => {
    const items = [
      row({ key: 'material:MAT-dmem-ykg0', label: 'DMEM' }),
      row({ key: 'material:MAT-a', label: 'DMEM + FBS', sectionLabel: 'contains "DMEM" (9)' }),
      row({ key: 'material:MAT-b', label: 'Thermo DMEM' }),
    ]
    render(<SlashSuggestionList items={items} loading={false} command={vi.fn()} />)
    expect(screen.getByText('contains "DMEM" (9)')).toBeTruthy()
    expect(screen.getAllByText('contains "DMEM" (9)')).toHaveLength(1)
  })
})

describe('SlashSuggestionList — L2-CLARIFY-PICKER-1 P1: first-defaultable focus', () => {
  it('a composition row (canBeDefault: false) at position 0 is NEVER the focused default; the first defaultable row is', () => {
    const items = [
      row({ key: 'material-spec:MSP-comp', label: 'DMEM + FBS', badge: 'Composition', canBeDefault: false }),
      row({ key: 'material:MAT-dmem-ykg0', label: 'DMEM' }),
    ]
    render(<SlashSuggestionList items={items} loading={false} command={vi.fn()} />)
    expect(D(0)[0]?.className).not.toContain('--focused')
    expect(D(1)[0]?.className).toContain('--focused')
  })

  it('arrow navigation skips non-defaultable rows and Enter never commits one (the W1 wrong-material commit)', () => {
    const command = vi.fn()
    const items = [
      row({ key: 'material-spec:MSP-comp', label: 'DMEM + FBS', badge: 'Composition', canBeDefault: false }),
      row({ key: 'material:MAT-dmem-ykg0', label: 'DMEM' }),
    ]
    const handle = createRef<SlashSuggestionListHandle>()
    render(
      <SlashSuggestionList ref={handle} items={items} loading={false} command={command} />,
    )
    // The list's keyboard handler is exposed via ref (the TipTap extension
    // forwards keystrokes through onKeyDown — jsdom has no real key events
    // on the listbox), so drive it through the handle. State updates flush in
    // act (the handler mutates the selected index).
    // The focused default is row 1 (row 0 is non-defaultable). ArrowUp
    // displays row 0 (non-defaultable)…
    act(() => { handle.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' })) })
    expect(D(0)[0]?.className).toContain('--focused')
    // …but Enter on it commits NOTHING (it cannot hold the focused default).
    act(() => { handle.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })) })
    expect(command).not.toHaveBeenCalled()
    // ArrowDown back to the defaultable row; Enter commits it.
    act(() => { handle.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' })) })
    expect(D(1)[0]?.className).toContain('--focused')
    act(() => { handle.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })) })
    expect(command).toHaveBeenCalledTimes(1)
  })

  it('default focus stays row 0 when NO row carries canBeDefault: false (slash editor byte-stable)', () => {
    const items = [row({ key: 'material:MAT-a', label: 'A' }), row({ key: 'material:MAT-b', label: 'B' })]
    render(<SlashSuggestionList items={items} loading={false} command={vi.fn()} />)
    expect(D(0)[0]?.className).toContain('--focused')
  })
})
