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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('is CLOSED on mount: no [role=listbox], and the resolver does not auto-run', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={vi.fn()} />)
    // The answer field is present (the affordance) but the popover is closed.
    expect(container.querySelector('input.message-log__clarification-search')).toBeTruthy()
    expect(openListboxCount()).toBe(0)
    // Give the (now-gated) effect a beat: the resolver must NOT have auto-run.
    await new Promise((r) => setTimeout(r, 250))
    expect(resolveMaterial).not.toHaveBeenCalled()
  })

  it('OPENS ON REQUEST: clicking the answer field opens the popover and runs the resolver', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={vi.fn()} />)
    openPicker(container)
    await waitFor(() => expect(openListboxCount()).toBe(1))
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    expect(resolveMaterial.mock.calls[0][0]).toBe('CHO')
    expect(await screen.findByText('CHO cells')).toBeTruthy()
  })

  it('CLOSING: picking a row answers AND closes the picker (dismiss-on-select)', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)
    openPicker(container)
    const row = await screen.findByText('CHO cells')
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
    // And the resolver did not auto-run on the fresh (closed) mount.
    await new Promise((r) => setTimeout(r, 250))
    expect(resolveMaterial).toHaveBeenCalledTimes(1)
    second.unmount()
  })
})
