/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 g7form — the create door must render the FORM
 * posture, so required markers are visible, and a stale refusal banner must
 * drop on the first author edit.
 *
 * Defects (browser gate receipts/ONTOLOGY/g7-legA-20261113T091102/report.md,
 * VERDICT: fix, served revision 4de1cb85):
 *   C-2 (:124-131) — the create panel passed NO `style` to
 *       ProjectionTapTabEditor, which defaults to 'prose'
 *       (TapTabEditor.tsx:184). `.taptab--prose .taptab-field-label[
 *       data-required="true"]::after` computes `:` (taptab.css:451-452), so
 *       the required marker on a create form was suppressed.
 *   C-3 (:132-135) — handleFormChange never cleared `error`; the refusal
 *       banner was reset only at the NEXT submit.
 *
 * Harness: the REAL panel over the REAL taptab editor (no taptab mock), the
 * API client mocked. The projection mirrors schema/workflow/
 * labware-definition.ui.yaml (the door the gate opened): display_name + id
 * are `required: true`, ontology_ref/vendor optional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { RecordCreatePanel } from './RecordCreatePanel'

const sid =
  'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml'

const projection = () => ({
  schemaId: sid,
  recordId: '__draft__',
  title: 'New record',
  blocks: [{ id: 's0', kind: 'section', label: 'Labware definition', slotIds: ['s-name', 's-id', 's-ont', 's-vendor'] }],
  slots: [
    { id: 's-name', path: '$.display_name', label: 'Display name', widget: 'text', required: true },
    { id: 's-id', path: '$.id', label: 'Identifier', widget: 'text', required: true },
    { id: 's-ont', path: '$.ontology_ref', label: 'Ontology anchor', widget: 'text' },
    { id: 's-vendor', path: '$.vendor', label: 'Vendor', widget: 'text' },
  ],
  diagnostics: [],
})

const mocked = vi.hoisted(() => ({
  createCalls: [] as Array<[string | undefined, Record<string, unknown>]>,
  // true → the create POST is refused (a 422-style server refusal).
  refuseSubmit: false,
  // true → no projection is served (the minimal fallback form path).
  noProjection: false,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getSchemas: () =>
      Promise.resolve([
        { id: sid, path: 'workflow/labware-definition.schema.yaml', title: 'labware-definition' },
      ]),
    getSchema: () =>
      Promise.resolve({
        id: sid,
        path: 'workflow/labware-definition.schema.yaml',
        title: 'labware-definition',
        schema: {
          type: 'object',
          properties: { id: { type: 'string' }, display_name: { type: 'string' } },
          required: ['kind', 'id', 'display_name'],
        },
      }),
    getEditorDraftProjection: () =>
      mocked.noProjection
        ? Promise.reject(new Error('no projection served'))
        : Promise.resolve(projection()),
    createRecord: (schemaId: string, payload: Record<string, unknown>) => {
      mocked.createCalls.push([schemaId, payload])
      return mocked.refuseSubmit
        ? Promise.reject(new Error('422 Unprocessable Entity — required property id'))
        : Promise.resolve({ recordId: payload.id })
    },
  },
  describeApiError: (e: unknown) => String(e),
}))

beforeEach(() => {
  mocked.createCalls = []
  mocked.refuseSubmit = false
  mocked.noProjection = false
})
afterEach(() => cleanup())

/** The REAL taptab field row for a label (fresh query — the editor re-renders
 *  after each commit, detaching stale elements). */
function findRow(label: string): HTMLElement {
  const row = screen.getByText(label).closest('.taptab-field-row')
  expect(row, `the "${label}" field row must render in the REAL editor`).toBeTruthy()
  return row as HTMLElement
}

/** Drive the real click-to-edit → Enter commit (FieldRow contract). */
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

function submit(): void {
  act(() => {
    fireEvent.submit(screen.getByTestId('record-create-panel').querySelector('form')!)
  })
}

const renderPanel = () =>
  render(<RecordCreatePanel nodeType="labware-definition" draftTitle="plate" onCreated={() => {}} />)

describe('L2-ONTOLOGY-ANCHOR-SOURCES-1 g7form — create door posture + banner freshness', () => {
  it('renders the FORM posture: .taptab--form (never .taptab--prose) and the required slots carry data-required', async () => {
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
    mocked.refuseSubmit = true
    renderPanel()
    await waitFor(() => expect(findRow('Identifier')).toBeTruthy(), { timeout: 8000 })
    submit()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('422')
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
    expect(screen.queryByTestId('record-create-panel').textContent).toContain('minimal form')
  })
})
