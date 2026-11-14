// @vitest-environment jsdom
/**
 * L2-P1-CREATE-DOOR-1 u3anchor — the create surface records the labware
 * definition's ontology anchor from an explicit, resolved term pick (the
 * shared ontologyRefFromCandidate mapper over the existing resolve spine),
 * and refuses the save with a NAMED reason when no anchor row was picked.
 *
 * The POST body is asserted field-by-field from the CAPTURED request: no
 * `ontology_ref` may exist unless a row was clicked, no value may be derived
 * from the typed name, and no key beyond the five the schema declares
 * (`ontology_ref` is additionalProperties:false).
 *
 * NOTE on the apiClient seam (deliberate deviation from the 3-arg spy in
 * LabLabwareNewPage.test.tsx:25-30): that idiom — `vi.spyOn(clientModule,
 * 'apiClient', 'get')` — replaces `apiClient` with a stub carrying only
 * extractSpecSheetProposals/getSchema/createRecord, so `apiClient.resolve` is
 * stripped (verified: `hasResolve:false` after the spy). The anchor UI
 * (useMaterialSearch) calls `apiClient.resolve`, so under that idiom no row can
 * ever render and no anchor can ever be picked. This file instead uses the SAME
 * vi.mock factory the material-page test uses (LabMaterialNewPage.test.tsx:16-27)
 * — which preserves the real client and mocks `resolve` — plus the three
 * save-path mocks. That is the only way to exercise the anchor row click the
 * unit under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

const { mockExtract, mockCreateRecord, mockGetSchema, mockResolve } = vi.hoisted(() => ({
  mockExtract: vi.fn(),
  mockCreateRecord: vi.fn(),
  mockGetSchema: vi.fn(),
  mockResolve: vi.fn(),
}))

// Preserve the real client; mock the resolve spine + the local-DB reads
// useMaterialSearch fires per keystroke, plus the three save-path methods.
vi.mock('../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      ...(actual as Record<string, unknown>).apiClient as object,
      resolve: (...args: unknown[]) => mockResolve(...args),
      searchMaterials: vi.fn().mockResolvedValue({ items: [] }),
      getFormulationsSummary: vi.fn().mockResolvedValue([]),
      extractSpecSheetProposals: (...args: unknown[]) => mockExtract(...args),
      getSchema: (...args: unknown[]) => mockGetSchema(...args),
      createRecord: (...args: unknown[]) => mockCreateRecord(...args),
    },
  }
})
vi.mock('../shared/lib/integrationFlags', () => ({
  exaVendorEnabled: () => Promise.resolve(false),
  noteExaUnavailable: () => undefined,
}))

import { LabLabwareNewPage } from './LabLabwareNewPage'

beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { cleanup() })

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/lab/labware/new?prefillName=Test%20Plate']}>
      <Routes>
        <Route path="/lab/labware/new" element={
          <ThemeProvider><OpenTabsProvider><LabLabwareNewPage /></OpenTabsProvider></ThemeProvider>
        } />
        <Route path="/lab/labware" element={<div data-testid="labware-category" />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Mirrors schema/workflow/labware-definition.schema.yaml (root + nested required),
// same shape as the geometry test's labwareSchemaShape so the payload is valid.
const SCHEMA = {
  required: ['kind', 'recordId', 'type', 'id', 'display_name', 'topology', 'capacity'],
  properties: {
    kind: { const: 'labware-definition' },
    recordId: { type: 'string' },
    type: { const: 'labware_definition' },
    id: { type: 'string' },
    display_name: { type: 'string' },
    topology: { type: 'object', required: ['addressing'], properties: { addressing: { type: 'string' }, rows: { type: 'integer' }, columns: { type: 'integer' } } },
    capacity: { type: 'object', required: ['max_well_volume_uL'], properties: { max_well_volume_uL: { type: 'number' } } },
  },
}

// Proposals fixture covering the schema's required fields (same shape as the
// sibling tests), sized so the payload is valid once the anchor is present.
const PROPOSALS = [
  { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
  { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
  { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
  { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL', specId: 's4' },
]

// Fictitious fixture candidates (no real LWO id, no real namespace literal): the
// ontology comes from the resolve spine at runtime; the fixtures only shape it.
const noUri = { curie: 'FOO:1', label: 'Test term A', namespace: 'FOO', tier: 2 as const, level: 'concept' as const, score: 10, source: 'local-obo' as const }
const withUri = { curie: 'BAR:42', label: 'Test term B', namespace: 'BAR', tier: 3 as const, level: 'concept' as const, score: 8, source: 'oak' as const, uri: 'https://example.org/terms/BAR_42' }
const third = { curie: 'BAZ:9', label: 'Test term C', namespace: 'BAZ', tier: 2 as const, level: 'concept' as const, score: 5, source: 'ols4' as const }

async function extractOnly() {
  mockExtract.mockResolvedValue({ configured: true, proposals: PROPOSALS })
  mockGetSchema.mockResolvedValue({ id: 'labware-definition', schema: SCHEMA })
  mockCreateRecord.mockResolvedValue({ success: true })
  renderPage()
  fireEvent.change(screen.getByTestId('lab-labware-url-input'), { target: { value: 'https://example.com/sheet' } })
  fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
  await waitFor(() => expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument())
}

async function searchAndReturnRows() {
  fireEvent.change(screen.getByTestId('lab-labware-ontology-search-input'), { target: { value: 'test term' } })
  fireEvent.click(screen.getByTestId('lab-labware-ontology-search-button'))
  return screen.findAllByTestId('lab-labware-ontology-candidate')
}

describe('LabLabwareNewPage ontology anchor (L2-P1-CREATE-DOOR-1 u3anchor)', () => {
  it('(a) proposals present, NO anchor picked → named refusal naming the ontology anchor, createRecord ZERO times', async () => {
    await extractOnly()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument())
    expect(screen.getByTestId('lab-labware-error').textContent).toContain('ontology anchor')
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  it('(b) clicked row → captured POST body carries ontology_ref deep-equal to {kind,id,namespace,label[,uri]}', async () => {
    mockResolve.mockResolvedValue({ candidates: [noUri] })
    await extractOnly()
    const rows = await searchAndReturnRows()
    fireEvent.click(rows[0]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(1))
    const body = mockCreateRecord.mock.calls[0][1] as Record<string, any>
    expect(body.ontology_ref).toEqual({ kind: 'ontology', id: 'FOO:1', namespace: 'FOO', label: 'Test term A' })
    expect('uri' in body.ontology_ref).toBe(false) // ABSENT, never undefined

    // uri arm — a candidate that carries one
    cleanup()
    mockResolve.mockResolvedValue({ candidates: [withUri] })
    await extractOnly()
    const rows2 = await searchAndReturnRows()
    fireEvent.click(rows2[0]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(2))
    const body2 = mockCreateRecord.mock.calls[1][1] as Record<string, any>
    expect(body2.ontology_ref).toEqual({ kind: 'ontology', id: 'BAR:42', namespace: 'BAR', label: 'Test term B', uri: 'https://example.org/terms/BAR_42' })
    expect('uri' in body2.ontology_ref).toBe(true)
  })

  it('(c) three candidates → nothing selected (no autopick, ghost-first without guessing); no POST until a row is clicked', async () => {
    mockResolve.mockResolvedValue({ candidates: [noUri, withUri, third] })
    await extractOnly()
    const rows = await searchAndReturnRows()
    expect(rows.length).toBe(3)
    expect(screen.queryByTestId('lab-labware-ontology-anchor')).toBeNull() // nothing chosen
    fireEvent.click(screen.getByTestId('lab-labware-save-button')) // save before any click
    await waitFor(() => expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument())
    expect(mockCreateRecord).not.toHaveBeenCalled()
    // ONE explicit row click changes the outcome: save POSTs with that anchor
    fireEvent.click(rows[1]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(1))
    expect((mockCreateRecord.mock.calls[0][1] as Record<string, any>).ontology_ref.id).toBe('BAR:42')
  })

  it('(d) negative: ontology_ref.id is the clicked candidate CURIE — no name-derived value, no 6th key', async () => {
    mockResolve.mockResolvedValue({ candidates: [withUri] })
    await extractOnly()
    const rows = await searchAndReturnRows()
    fireEvent.click(rows[0]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(1))
    const ref = (mockCreateRecord.mock.calls[0][1] as Record<string, any>).ontology_ref
    // The clicked candidate's CURIE — never a slug of the typed name 'Test Plate'
    expect(ref.id).toBe('BAR:42')
    expect(ref.id.toLowerCase()).not.toContain('test-plate')
    // Exactly the schema-declared keys (additionalProperties:false)
    expect(Object.keys(ref).sort()).toEqual(['id', 'kind', 'label', 'namespace', 'uri'])
    expect(ref).not.toHaveProperty('source')
    expect(ref).not.toHaveProperty('score')
  })
})
