/**
 * L2-SUITE-A-uifix2 [C] RED — clarification cards AUTO-OPEN their picker, and
 * the pickers STACK over the transcript (re-gate DEFECT 3, MAJOR = prior-gate
 * D7 class, now one-per-card).
 *
 * Evidence (gate-l2t2130-regate): open [role=listbox] / .term-picker counts
 * grew 10 (restored at open) -> 13 (P4) -> 15 (P5) -> 16 (P6); at P6 the
 * transcript is covered by overlapping lists including the prompt of the card
 * the user is meant to answer; 16 pickers still open after a full page load
 * (shots/108-04-reload-record-vs-screen.png). This is the popover-lifecycle
 * class from findings-20261027-material-picker.md (dismiss-on-select /
 * outside-click lifecycle missing).
 *
 * The ClarificationPicker ran its resolver on MOUNT and rendered its popover
 * whenever it had items — so every card's picker auto-opened and stacked.
 * EXPECTED: pickers OPEN ON REQUEST (click on the card's answer field), never
 * auto-open en masse; at most one open at a time (opening one closes the
 * previously-open one); answering / collapsing (outside-click, Escape) closes
 * it; a fresh page (mount) restores NO open pickers (closed).
 *
 * These locks pin the LIFECYCLE (the popover's open/closed DOM state via its
 * [role=listbox]). The resolver still runs when OPEN (the seeded-query and
 * grounding behavior stays — see ClarificationPicker.test.tsx, updated to
 * open on request first).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ClarificationPicker } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'
import type { SlashSuggestion } from '../../../shared/taptab/slashMenu/types'

const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
}))
const groundMaterialRef = vi.fn()
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

const hit: SlashSuggestion = {
  key: 'material-spec:MAT-cho-1',
  label: 'CHO cells',
  badge: 'Concept',
  mention: { type: 'material', entityKind: 'material-spec', id: 'MAT-cho-1', label: 'CHO cells' },
}

const materialRequest: AiClarificationRequest = {
  id: 'clar-c1',
  kind: 'material',
  prompt: 'Which material for A3?',
  menuProvider: '/m',
  query: 'CHO',
  options: [],
}

/** Count the OPEN pickers (their [role=listbox]) in the current document. */
const openListboxCount = () =>
  document.querySelectorAll('[role="listbox"]').length

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  groundMaterialRef.mockReset()
})

/** Open a picker by clicking its answer field (the open-on-request affordance). */
function openPicker(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input.message-log__clarification-search') as HTMLInputElement
  fireEvent.click(input)
  return input
}

describe('ClarificationPicker — L2-SUITE-A-uifix2 C: open-on-request lifecycle (no auto-open, no stacking)', () => {
  it('is CLOSED on mount: no [role=listbox]; the OQ3 mount pass is BOUNDED + popover-closed (no auto-open)', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={vi.fn()} />)
    // The answer field is present (the affordance) but the popover is closed.
    expect(container.querySelector('input.message-log__clarification-search')).toBeTruthy()
    expect(openListboxCount()).toBe(0)
    // L2-CLARIFY-PICKER-1 (P3, OQ3 ruling amends this pin): the card MOUNT runs
    // exactly ONE bounded, popover-closed candidates pass (the top-3 buttons'
    // source). The uifix2 defect was auto-OPENING the popover en masse — the
    // LISTBOX must stay closed; the non-UI fetch is the OQ3-amended behavior
    // (extended, not loosened: still exactly one pass, still closed).
    await new Promise((r) => setTimeout(r, 250))
    expect(resolveMaterial).toHaveBeenCalledTimes(1)
    expect(openListboxCount()).toBe(0)
  })

  it('OPENS ON REQUEST: clicking the answer field opens the popover and runs the resolver', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={vi.fn()} />)
    openPicker(container)
    await waitFor(() => expect(openListboxCount()).toBe(1))
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    // The popover pass is the LAST call (the OQ3 mount pass ran first,
    // bounded + popover-closed); it ran with the seeded query.
    const calls = resolveMaterial.mock.calls
    expect(calls[calls.length - 1][0]).toBe('CHO')
    // The POPOVER row (scoped — the top-3 button above it carries the same
    // label; this test is about the open listbox, not the buttons).
    await waitFor(async () => {
      const popover = screen.getByTestId('clarification-popover')
      expect(within(popover).getByText('CHO cells')).toBeTruthy()
    })
  })

  it('CLOSING: picking a row answers AND closes the picker (dismiss-on-select)', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)
    openPicker(container)
    // The POPOVER row (scoped — the top-3 button shares the label).
    const row = await new Promise<HTMLElement>((resolve) => {
      void waitFor(async () => {
        resolve(within(screen.getByTestId('clarification-popover')).getByText('CHO cells'))
      })
    })
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    // The pick dismissed the picker (no stacking after answering).
    await waitFor(() => expect(openListboxCount()).toBe(0))
  })

  it('an OUTSIDE click collapses the picker (dismiss-on-outside-click)', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const { container } = render(
      <div>
        <button data-testid="outside">outside</button>
        <ClarificationPicker request={materialRequest} onPick={vi.fn()} />
      </div>,
    )
    openPicker(container)
    await waitFor(() => expect(openListboxCount()).toBe(1))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    await waitFor(() => expect(openListboxCount()).toBe(0))
  })

  it('a single OPEN picker wins: opening a second closes the first (no stacking)', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const second: AiClarificationRequest = { ...materialRequest, id: 'clar-c2', query: 'CHO' }
    // Two cards' pickers coexist (the re-gate's P4->P6 stacking shape).
    const { container } = render(
      <div>
        <ClarificationPicker request={materialRequest} onPick={vi.fn()} />
        <ClarificationPicker request={second} onPick={vi.fn()} />
      </div>,
    )
    expect(openListboxCount()).toBe(0)
    // Both start closed (page-load / fresh-render restores NO open pickers).
    // Open the FIRST.
    openPicker(container.querySelector('div > div') as HTMLElement)
    await waitFor(() => expect(openListboxCount()).toBe(1))
    // Open the SECOND — the first must close (at most one open).
    const inputs = container.querySelectorAll('input.message-log__clarification-search')
    fireEvent.click(inputs[1] as HTMLInputElement)
    await waitFor(() => expect(openListboxCount()).toBe(1))
  })

  it('an UNMOUNTED picker releases its open key: a fresh mount of the same card starts CLOSED (no leaked open state)', async () => {
    resolveMaterial.mockResolvedValue([hit])
    // Mount + open the picker, then unmount it (the card is removed).
    const first = render(<ClarificationPicker request={materialRequest} onPick={vi.fn()} />)
    const input = first.container.querySelector('input.message-log__clarification-search') as HTMLInputElement
    fireEvent.click(input)
    await waitFor(() => expect(openListboxCount()).toBe(1))
    first.unmount()
    // The open key must be released: a fresh mount of the SAME card (a page
    // reload re-mounting it) must start CLOSED, not inherit the previous
    // open state. This is the leak the re-gate's "16 pickers after a full
    // page load" observed — the unmount guard is what prevents it.
    const second = render(<ClarificationPicker request={materialRequest} onPick={vi.fn()} />)
    expect(openListboxCount()).toBe(0)
    expect(second.container.querySelector('[role="listbox"]')).toBeNull()
    // L2-CLARIFY-PICKER-1 (P3, OQ3 ruling amends this pin): the fresh (closed)
    // mount runs its OWN bounded, popover-closed candidates pass (one per
    // card) — total = 3 (first mount pass + the OPEN's popover pass + the
    // fresh mount pass), still ZERO open pickers (the leak the re-gate
    // observed stays dead).
    await new Promise((r) => setTimeout(r, 250))
    expect(resolveMaterial).toHaveBeenCalledTimes(3)
    expect(openListboxCount()).toBe(0)
    second.unmount()
  })

  // L2-CLARIFY-PICKER-1 (P3, OQ3): the mount pass is an extension of the
  // single-open invariant, not a loosening of it — N coexisting cards each run
  // their BOUNDED, popover-closed candidates fetch on mount (for the top-3
  // buttons), and the count of OPEN pickers still stays 0 (the uifix2
  // 10→16 stacking defect stays dead). Extend, don't loosen.
  it('P3 mount pass (N coexisting cards): bounded popover-closed fetches, STILL zero open pickers', async () => {
    const second: AiClarificationRequest = { ...materialRequest, id: 'clar-c2', query: 'DMEM' }
    resolveMaterial.mockResolvedValue([hit])
    render(
      <div>
        <ClarificationPicker request={materialRequest} onPick={vi.fn()} />
        <ClarificationPicker request={second} onPick={vi.fn()} />
      </div>,
    )
    // Both cards run their mount pass (each fetches its own candidates) —
    // …and neither opens its popover (open-on-request is intact).
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalledTimes(2))
    expect(openListboxCount()).toBe(0)
  })
})
