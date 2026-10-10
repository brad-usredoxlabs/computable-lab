/**
 * W2-8-FIX2 D1 — FieldRow editability contract at the real editor boundary.
 *
 * The TapTab document model has NO text positions (CustomDocument 'section+',
 * Section 'sectionHeading fieldRow+', fieldRow is an atom NodeView), so free
 * typing into the outer contenteditable can never mutate the doc — by design.
 * Editable field VALUES are achieved through the FieldRow NodeView's widget
 * layer: click the value -> inline input -> commit -> updateAttributes ->
 * editor onUpdate -> serializeDocument -> isDirty. That is the interactive
 * widget path every other TapTab surface (BudgetDocumentSurface, registry
 * surfaces) uses. These tests pin that contract for the MEANT editor:
 *
 * 1. an editable text slot click-to-edits and fires onUpdate with dirty=true;
 * 2. a slot declared read-only renders read-only — no click-to-edit affordance
 *    (the Intent/Provenance hints stay hints);
 * 3. serialization does not pollute the payload: wildcard hint paths ('[*]')
 *    are display hints, not addressable fields, and null values for paths the
 *    payload does not carry never mint junk keys (bait 2/5: the PUT rebuild
 *    must PRESERVE untouched fields).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SelectionProvider } from '../../shared/context/SelectionContext'
import { ProjectionTapTabEditor } from './TapTabEditor'
import type { ProjectionBlock, ProjectionSlot } from '../../types/uiSpec'

afterEach(() => {
  cleanup()
})

function wrap(ui: React.ReactNode) {
  return (
    <MemoryRouter>
      <SelectionProvider>{ui}</SelectionProvider>
    </MemoryRouter>
  )
}

// Mirrors the protocol-surface projection the review route fetches
// (POST /ui/schema/protocol.schema.yaml/editor-draft): an editable title,
// a read-only wildcard intent hint slot.
const blocks: ProjectionBlock[] = [
  { id: 'b-protocol', kind: 'section', label: 'Protocol', slotIds: ['sl-title', 'sl-purpose'] },
  { id: 'b-intent', kind: 'section', label: 'Intent', slotIds: ['sl-verb'] },
]

const slots: ProjectionSlot[] = [
  { id: 'sl-title', path: '$.title', label: 'Title', widget: 'text', required: true },
  { id: 'sl-purpose', path: '$.purpose', label: 'Purpose', widget: 'text' },
  { id: 'sl-verb', path: '$.steps[*].intent.semanticVerb', label: 'Semantic verb', widget: 'ref', readOnly: true },
]

const draftData: Record<string, unknown> = {
  kind: 'protocol',
  recordId: 'PRT-w28-editability',
  title: 'semantic family draft',
  steps: [{ stepId: 'step-1', label: 'Lyse samples', ordinal: 1 }],
}

/**
 * FieldRow NodeViews mount asynchronously (TipTap's Portals), so the rows are
 * found by waiting for their labels, then located through the label.
 */
async function rowByLabel(container: HTMLElement, label: string) {
  await waitFor(() => {
    const found = [...container.querySelectorAll('.taptab-field-row')].find(
      (row) => row.querySelector('.taptab-field-label')?.textContent === label,
    )
    if (!found) throw new Error(`fieldRow for ${label} not mounted yet`)
  })
  return [...container.querySelectorAll('.taptab-field-row')].find(
    (row) => row.querySelector('.taptab-field-label')?.textContent === label,
  )!
}

describe('ProjectionTapTabEditor — FieldRow value editability (D1)', () => {
  it('click-to-edit on an editable field value fires onUpdate with the new value and dirty=true', async () => {
    const updates: Array<{ serialized: Record<string, unknown>; dirty?: boolean }> = []
    const { container } = render(
      wrap(
        <ProjectionTapTabEditor
          blocks={blocks}
          slots={slots}
          data={draftData}
          onUpdate={(serialized, dirty) => updates.push({ serialized, dirty })}
        />,
      ),
    )

    // The FieldRow NodeView renders as a react-renderer whose HOST carries
    // contenteditable=false — that is the architecture, not the defect. The
    // interactive affordance is the value span inside the row.
    const titleRow = await rowByLabel(container, 'Title')
    expect(titleRow.getAttribute('data-read-only'), 'an editable slot must not be read-only').toBe('false')

    const value = titleRow.querySelector('.taptab-widget-value')
    expect(value, 'editable slot must expose the click-to-edit value affordance').toBeTruthy()

    fireEvent.click(value!)
    await waitFor(() => {
      if (!titleRow.querySelector('input.taptab-inline-input')) throw new Error('inline input not open')
    })
    const input = titleRow.querySelector('input.taptab-inline-input') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'EDITED semantic draft' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(updates.length).toBeGreaterThan(0))
    const last = updates[updates.length - 1]!
    expect(last.serialized.title, 'committing the input must serialize the new value').toBe('EDITED semantic draft')
    expect(last.dirty, 'a real value edit must report dirty (the Save gate)').toBe(true)
  })

  it('a read-only slot renders read-only: no inline input on click (Intent hints stay hints)', async () => {
    const { container } = render(
      wrap(<ProjectionTapTabEditor blocks={blocks} slots={slots} data={draftData} />),
    )
    const verbRow = await rowByLabel(container, 'Semantic verb')
    expect(verbRow.getAttribute('data-read-only'), 'a readonly slot must render read-only').toBe('true')
    const value = verbRow.querySelector('.taptab-widget-value')
    if (value) fireEvent.click(value)
    await new Promise((r) => setTimeout(r, 50))
    expect(
      verbRow.querySelector('input.taptab-inline-input'),
      'a readonly slot must never open an editor input',
    ).toBeFalsy()
  })

  it('serialization preserves the draft body: no wildcard-path junk keys, no null-minted keys', async () => {
    const updates: Array<Record<string, unknown>> = []
    const { container } = render(
      wrap(
        <ProjectionTapTabEditor
          blocks={blocks}
          slots={slots}
          data={draftData}
          onUpdate={(serialized) => updates.push(serialized)}
        />,
      ),
    )

    const titleRow = await rowByLabel(container, 'Title')
    fireEvent.click(titleRow.querySelector('.taptab-widget-value')!)
    await waitFor(() => {
      if (!titleRow.querySelector('input.taptab-inline-input')) throw new Error('inline input not open')
    })
    const input = titleRow.querySelector('input.taptab-inline-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'clean save' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(updates.length).toBeGreaterThan(0))
    const serialized = updates[updates.length - 1]!
    expect(serialized.title).toBe('clean save')
    // The draft round-trips as DATA: untouched keys survive, and the editor
    // must NOT mint keys the payload never carried.
    expect(serialized.kind).toBe('protocol')
    expect(serialized.recordId).toBe('PRT-w28-editability')
    expect(serialized.steps).toEqual(draftData.steps)
    expect('steps[*]' in serialized, 'wildcard hint paths must never mint a literal key').toBe(false)
    expect('purpose' in serialized, 'an untouched absent field must not mint a null key').toBe(false)
    expect('semanticVerb' in serialized).toBe(false)
  })
})
