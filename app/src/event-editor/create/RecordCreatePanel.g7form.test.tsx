/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 g7form — the create door renders the FORM
 * posture (required markers visible) and drops a stale refusal banner on the
 * first author edit. Gate: receipts/ONTOLOGY/g7-legA-20261113T091102/report.md
 * C-2 (:124-131) + C-3 (:132-135). REAL panel + REAL taptab editor; only the
 * API client is mocked; the projection mirrors schema/workflow/labware-definition.ui.yaml.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { RecordCreatePanel } from './RecordCreatePanel'

const sid = 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml'
const slot = (path: string, label: string, required = false) =>
  ({ id: `s${path.slice(1)}`, path, label, widget: 'text', required })
const slots = [
  slot('$.display_name', 'Display name', true), slot('$.id', 'Identifier', true),
  slot('$.ontology_ref', 'Ontology anchor'), slot('$.vendor', 'Vendor'),
]
const projection = () => ({
  schemaId: sid, recordId: '__draft__', title: 'New record', diagnostics: [], slots,
  blocks: [{ id: 's0', kind: 'section', label: 'Labware definition', slotIds: slots.map((s) => s.id) }],
})

// refuse → the create POST is REFUSED (a 422-style server refusal);
// noProjection → no projection is served (the minimal fallback form path).
const mocked = vi.hoisted(() => ({
  createCalls: [] as Array<[string | undefined, Record<string, unknown>]>,
  refuse: false, noProjection: false,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getSchemas: () =>
      Promise.resolve([{ id: sid, path: 'workflow/labware-definition.schema.yaml', title: 'labware-definition' }]),
    getSchema: () =>
      Promise.resolve({
        id: sid,
        path: 'workflow/labware-definition.schema.yaml',
        schema: {
          type: 'object',
          properties: { id: { type: 'string' }, display_name: { type: 'string' } },
          required: ['kind', 'id', 'display_name'],
        },
      }),
    getEditorDraftProjection: () =>
      mocked.noProjection ? Promise.reject(new Error('no projection served')) : Promise.resolve(projection()),
    createRecord: (schemaId: string, payload: Record<string, unknown>) => {
      mocked.createCalls.push([schemaId, payload])
      return mocked.refuse
        ? Promise.reject(new Error('422 Unprocessable Entity — required property id'))
        : Promise.resolve({ recordId: payload.id })
    },
  },
  describeApiError: (e: unknown) => String(e),
}))

beforeEach(() => { mocked.createCalls = []; mocked.refuse = false; mocked.noProjection = false })
afterEach(() => cleanup())

// The REAL taptab field row for a label (fresh query — the editor re-renders after a commit).
function findRow(label: string): HTMLElement {
  const row = screen.getByText(label).closest('.taptab-field-row')
  expect(row, `the "${label}" field row must render in the REAL editor`).toBeTruthy()
  return row as HTMLElement
}

// Drive the real click-to-edit → Enter commit (the FieldRow contract).
function typeInto(row: HTMLElement, value: string): void {
  act(() => {
    fireEvent.click(row.querySelector('.taptab-widget-value')!)
  })
  const input = row.querySelector('input.taptab-inline-input')
  expect(input, 'the slot must be editable (an inline input opens)').toBeTruthy()
  act(() => {
    fireEvent.change(input!, { target: { value } })
    fireEvent.keyDown(input!, { key: 'Enter' })
  })
}

const submit = () =>
  act(() => {
    fireEvent.submit(screen.getByTestId('record-create-panel').querySelector('form')!)
  })
const renderPanel = () =>
  render(<RecordCreatePanel nodeType="labware-definition" draftTitle="plate" onCreated={() => {}} />)

describe('g7form — create door posture + banner freshness', () => {
  it('renders the FORM posture: .taptab--form (never .taptab--prose), required slots marked', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(findRow('Display name')).toBeTruthy(), { timeout: 8000 })
    expect(container.querySelector('.taptab--form')).toBeTruthy()
    expect(container.querySelector('.taptab--prose')).toBeFalsy()
    for (const label of ['Display name', 'Identifier']) {
      expect(findRow(label).querySelector('.taptab-field-label[data-required="true"]')).toBeTruthy()
    }
    // Optional slots are not marked required.
    expect(findRow('Vendor').querySelector('.taptab-field-label[data-required="true"]')).toBeNull()
  })

  it('clears the refusal banner on the first author edit — no second submit', async () => {
    mocked.refuse = true
    renderPanel()
    await waitFor(() => expect(findRow('Identifier')).toBeTruthy(), { timeout: 8000 })
    submit()
    expect((await screen.findByRole('alert')).textContent).toContain('422')
    expect(mocked.createCalls).toHaveLength(1)
    // The author fixes the field the server refused on.
    typeInto(findRow('Identifier'), 'lbw-def-my-plate@v1')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    // Editing cleared the banner; it did NOT submit again.
    expect(mocked.createCalls).toHaveLength(1)
  })

  it('the minimal fallback form still renders for a kind with no projection', async () => {
    mocked.noProjection = true
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('record-create-title')).toBeTruthy(), { timeout: 8000 })
    expect(document.querySelector('.taptab-field-row')).toBeNull()
    expect(screen.getByTestId('record-create-panel').textContent).toContain('minimal form')
  })
})
