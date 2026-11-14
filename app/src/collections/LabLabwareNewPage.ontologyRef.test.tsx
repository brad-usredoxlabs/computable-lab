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
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { LabLabwareNewPage } from './LabLabwareNewPage'
import * as clientModule from '../shared/api/client'

const resolve = vi.fn()

// Same seam as LabMaterialNewPage.test.tsx: the resolve spine + the local-DB
// reads useMaterialSearch fires per keystroke are stubbed; the real client otherwise.
vi.mock('../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      ...(actual as Record<string, unknown>).apiClient as object,
      resolve: (...args: unknown[]) => resolve(...args),
      searchMaterials: vi.fn().mockResolvedValue({ items: [] }),
      getFormulationsSummary: vi.fn().mockResolvedValue([]),
    },
  }
})
vi.mock('../shared/lib/integrationFlags', () => ({
  exaVendorEnabled: () => Promise.resolve(false),
  noteExaUnavailable: () => undefined,
}))

const mockExtract = vi.fn()
const mockCreateRecord = vi.fn()
const mockGetSchema = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(clientModule, 'apiClient', 'get').mockReturnValue({
    ...clientModule.apiClient,
    extractSpecSheetProposals: mockExtract,
    getSchema: mockGetSchema,
    createRecord: mockCreateRecord,
  } as any)
})
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

// Proposals fixture in the same shape as LabLabwareNewPage.test.tsx:64-67, sized
// so the payload passes the schema's required fields.
const PROPOSALS = [
  { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
  { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
  { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
  { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL', specId: 's4' },
]
// Root shape mirroring schema/workflow/labware-definition.schema.yaml (root + nested required).
const SCHEMA = {
  required: ['kind', 'recordId', 'type', 'id', 'display_name', 'topology', 'capacity'],
  properties: {
    topology: { required: ['addressing'], properties: { addressing: { type: 'string' }, rows: { type: 'integer' }, columns: { type: 'integer' } } },
    capacity: { required: ['max_well_volume_uL'], properties: { max_well_volume_uL: { type: 'number' } } },
  },
}

// Fictitious fixture candidates (no real LWO id, no real namespace literal): the
// ontology comes from the resolve spine at runtime, the fixtures only shape it.
const noUri = { curie: 'FOO:1', label: 'Test term A', namespace: 'FOO', tier: 2 as const, level: 'concept' as const, score: 10, source: 'local-obo' as const }
const withUri = { curie: 'BAR:42', label: 'Test term B', namespace: 'BAR', tier: 3 as const, level: 'concept' as const, score: 8, source: 'oak' as const, uri: 'https://example.org/terms/BAR_42' }

async function extractAndSearch() {
  mockExtract.mockResolvedValueOnce({ configured: true, proposals: PROPOSALS })
  mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: SCHEMA })
  renderPage()
  fireEvent.change(screen.getByTestId('lab-labware-url-input'), { target: { value: 'https://example.com/sheet' } })
  fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
  await waitFor(() => expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument())
  fireEvent.change(screen.getByTestId('lab-labware-ontology-search-input'), { target: { value: 'test term' } })
  fireEvent.click(screen.getByTestId('lab-labware-ontology-search-button'))
  return screen.findAllByTestId('lab-labware-ontology-candidate')
}

describe('LabLabwareNewPage ontology anchor (L2-P1-CREATE-DOOR-1 u3anchor)', () => {
  it('(a) proposals present, NO anchor picked → named refusal naming the ontology anchor, createRecord ZERO times', async () => {
    resolve.mockResolvedValue({ candidates: [noUri] })
    await extractAndSearch()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument())
    expect(screen.getByTestId('lab-labware-error').textContent).toContain('ontology anchor')
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  it('(b) clicked row → captured POST body carries ontology_ref deep-equal to {kind,id,namespace,label[,uri]}', async () => {
    resolve.mockResolvedValue({ candidates: [noUri, withUri] })
    await extractAndSearch()
    fireEvent.click(screen.getAllByTestId('lab-labware-ontology-candidate')[0]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(1))
    const body = mockCreateRecord.mock.calls[0][1] as Record<string, any>
    expect(body.ontology_ref).toEqual({ kind: 'ontology', id: 'FOO:1', namespace: 'FOO', label: 'Test term A' })
    expect('uri' in body.ontology_ref).toBe(false) // ABSENT, never undefined
    // uri arm — a candidate that carries one
    cleanup()
    resolve.mockResolvedValue({ candidates: [withUri] })
    await extractAndSearch()
    fireEvent.click(screen.getAllByTestId('lab-labware-ontology-candidate')[0]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(2))
    const body2 = mockCreateRecord.mock.calls[1][1] as Record<string, any>
    expect(body2.ontology_ref).toEqual({ kind: 'ontology', id: 'BAR:42', namespace: 'BAR', label: 'Test term B', uri: 'https://example.org/terms/BAR_42' })
    expect('uri' in body2.ontology_ref).toBe(true)
  })

  it('(c) three candidates → nothing selected (no autopick, ghost-first without guessing); no POST until a row is clicked', async () => {
    const third = { curie: 'BAZ:9', label: 'Test term C', namespace: 'BAZ', tier: 2 as const, level: 'concept' as const, score: 5, source: 'ols4' as const }
    resolve.mockResolvedValue({ candidates: [noUri, withUri, third] })
    const rows = await extractAndSearch()
    expect(rows.length).toBe(3)
    expect(screen.queryByTestId('lab-labware-ontology-anchor')).toBeNull() // nothing chosen
    fireEvent.click(screen.getByTestId('lab-labware-save-button')) // save before any click
    await waitFor(() => expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument())
    expect(mockCreateRecord).not.toHaveBeenCalled()
    // ONE explicit row click changes the outcome: save POSTs with that anchor
    fireEvent.click(rows[1]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(1))
    const body = mockCreateRecord.mock.calls[0][1] as Record<string, any>
    expect(body.ontology_ref.id).toBe('BAR:42')
  })

  it('(d) negative: ontology_ref.id is the clicked candidate\'s CURIE — no name-derived value, no 6th key', async () => {
    resolve.mockResolvedValue({ candidates: [withUri] })
    await extractAndSearch()
    fireEvent.click(screen.getAllByTestId('lab-labware-ontology-candidate')[0]!)
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => expect(mockCreateRecord).toHaveBeenCalledTimes(1))
    const ref = (mockCreateRecord.mock.calls[0][1] as Record<string, any>).ontology_ref
    // The clicked candidate's CURIE — never a slug of the typed name 'Test Plate'
    expect(ref.id).toBe('BAR:42')
    expect(ref.id.toLowerCase()).not.toContain('test-plate')
    // Exactly the schema-declared keys (additionalProperties:false): no source/score/tier/level
    expect(Object.keys(ref).sort()).toEqual(['id', 'kind', 'label', 'namespace', 'uri'])
    expect(ref).not.toHaveProperty('source')
    expect(ref).not.toHaveProperty('score')
  })
})
