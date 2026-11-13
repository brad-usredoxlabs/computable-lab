/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 (idmintreadonly6) — when the served UI
 * projection marks the record's identity field readonly (the
 * labware-definition $.id slot), the create panel mints the id at submit
 * instead of demanding one from the author, so the chosen ontology anchor
 * reaches the POST. The g4 browser-gate defect, verbatim: pressing Create
 * on /record/new/labware-definition with name + anchor set issued ONE write
 * carrying ontology_ref (LWO:0000120) and NO id — the server 400'd with
 * 'payload must contain recordId or id field'.
 *
 * The discriminator is the PROJECTION SLOT's readOnly flag (never the kind
 * name, never !isSpine): a non-spine kind whose identity is WRITABLE keeps
 * the D16 note and the no-mint behavior (arm 2 — the gc16 file's 10 tests
 * are the full pin and run alongside this file in the verify command).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { RecordCreatePanel } from './RecordCreatePanel'

// jsdom has no scrollIntoView (the EnumCombobox mount effect) — same
// test-side stub the gc16 file uses.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// Stubbed projections + the captured create payloads live in vi.hoisted:
// the vi.mock factory runs at import time (before module-scope consts).
const { calls, lwProjection, asnProjection } = vi.hoisted(() => {
  const base = 'https://computable-lab.com/schema/computable-lab/'
  const mk = (kind: string, readonlyId: boolean) => ({
    schemaId: `${base}${kind}.schema.yaml`,
    recordId: '__draft__',
    title: 'New record',
    blocks: [
      {
        id: 'b1',
        kind: 'section',
        label: 'Body',
        slotIds: ['slot-id', 'slot-name', 'slot-ontology_ref'],
      },
    ],
    slots: [
      { id: 'slot-id', path: '$.id', label: 'ID', widget: 'text', ...(readonlyId ? { readOnly: true } : {}) },
      { id: 'slot-name', path: '$.name', label: 'Display name', widget: 'text' },
      { id: 'slot-ontology_ref', path: '$.ontology_ref', label: 'Ontology anchor', widget: 'text' },
    ],
    diagnostics: [],
  })
  return {
    calls: [] as Array<Record<string, unknown>>,
    lwProjection: mk('labware-definition', true),
    asnProjection: mk('assertion', false),
  }
})

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getSchemas: () =>
      Promise.resolve(
        ['labware-definition', 'assertion'].map((kind) => ({
          id: `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`,
          path: `${kind === 'labware-definition' ? 'workflow' : 'knowledge'}/${kind}.schema.yaml`,
          title: kind,
        })),
      ),
    // A minimal served schema document: declares NO shortSlug (so the
    // panel's shortSlug-deletion branch is the D9 outcome) and does not
    // require title (the stub projections have no title slot).
    getSchema: () =>
      Promise.resolve({
        id: '',
        path: '',
        title: '',
        schema: { type: 'object', properties: {}, required: ['kind', 'id'] },
      }),
    getEditorDraftProjection: (schemaId: string) => {
      const kind = (String(schemaId).split('/').pop() ?? '').replace(/\.schema\.yaml$/, '')
      return Promise.resolve(kind === 'labware-definition' ? lwProjection : asnProjection)
    },
    createRecord: (_schemaId: string, payload: Record<string, unknown>) => {
      calls.push(payload)
      return Promise.resolve({ recordId: String(payload.id ?? payload.recordId ?? '') })
    },
  },
  describeApiError: (e: unknown) => String(e),
}))

afterEach(() => {
  calls.length = 0
  cleanup()
})

/** Fresh field-row query by label (the editor re-renders after each
 *  commit, detaching stale elements — the gc16 file's findRow pattern). */
function fieldRow(label: string): HTMLElement {
  const el = screen.getByText(label)
  const row = el.closest('.taptab-field-row')
  expect(row, `the "${label}" field row must render in the REAL editor`).toBeTruthy()
  return row as HTMLElement
}

/** Drive the REAL text slot's click-to-edit → Enter commit (the FieldRow
 *  contract; a readonly slot renders NO input — the D10 RED shape). */
function commitText(row: HTMLElement, value: string): void {
  const valueEl = row.querySelector('.taptab-widget-value')
  expect(valueEl, 'the slot must render the taptab value span').toBeTruthy()
  act(() => {
    fireEvent.click(valueEl!)
  })
  const input = row.querySelector('input.taptab-inline-input')
  expect(input, 'clicking an EDITABLE slot must open the inline input').toBeTruthy()
  act(() => {
    fireEvent.change(input!, { target: { value } })
    fireEvent.keyDown(input!, { key: 'Enter' })
  })
}

function submitCreate(): void {
  const form = screen.getByTestId('record-create-panel').querySelector('form')
  expect(form, 'the create panel renders a form').toBeTruthy()
  act(() => {
    fireEvent.submit(form!)
  })
}

describe('L2-ONTSRC idmintreadonly6 — a projection-marked readonly identity slot mints a REC- id at submit', () => {
  it('labware-definition: $.id is readonly in the served projection → the single write carries a minted REC-<8hex> id + the authored anchor + display name (RED: today the payload has NO id → the server 400s)', async () => {
    render(
      <RecordCreatePanel nodeType="labware-definition" draftTitle="bench top" onCreated={() => {}} />,
    )
    const nameRow = await waitFor(() => fieldRow('Display name'), { timeout: 8000 })
    commitText(nameRow, 'bench top')
    commitText(fieldRow('Ontology anchor'), 'LWO:0000120')
    submitCreate()
    await waitFor(() => expect(calls).toHaveLength(1))
    const payload = calls[0]
    console.log('RAW CAPTURED PAYLOAD (readonly $.id):', JSON.stringify(payload))
    expect(
      payload.id,
      'identity slot readonly ⇒ the panel mints the id (the g4 400: a write with the anchor and NO id)',
    ).toMatch(/^REC-[0-9A-F]{8}$/)
    expect(payload.ontology_ref, 'the chosen ontology anchor must survive the POST').toBe('LWO:0000120')
    expect(payload.name, 'the authored display name must survive the POST').toBe('bench top')
    expect(payload.kind).toBe('labware-definition')
    expect(
      'recordId' in payload,
      'no recordId invented for a non-spine kind (the server derives it from id)',
    ).toBe(false)
  }, 20000)

  it('D16 pin (writable identity): $.id NOT readonly → the "client does not mint knowledge ids" note renders and the payload carries NO client-minted id (the discriminator is the slot readOnly flag, not the kind)', async () => {
    render(
      <RecordCreatePanel nodeType="assertion" draftTitle="scoped assertion" onCreated={() => {}} />,
    )
    const nameRow = await waitFor(() => fieldRow('Display name'), { timeout: 8000 })
    commitText(nameRow, 'scoped assertion')
    expect(
      screen.getByTestId('record-create-id-note').textContent,
      'the D16 note must still render for a writable identity',
    ).toContain('the client does not mint knowledge ids')
    submitCreate()
    await waitFor(() => expect(calls).toHaveLength(1))
    const payload = calls[0]
    console.log('RAW CAPTURED PAYLOAD (writable $.id):', JSON.stringify(payload))
    expect(
      payload.id,
      'writable identity ⇒ NO client-minted id (D16 — the author supplies it; the server speaks)',
    ).toBeUndefined()
    expect(payload.name).toBe('scoped assertion')
    expect(payload.kind).toBe('assertion')
  }, 20000)
})
