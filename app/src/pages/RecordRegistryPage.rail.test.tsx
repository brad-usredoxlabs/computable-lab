/**
 * REG-6 — registry record surface has NO side rail; provenance docks at the
 * BOTTOM of the record content.
 *
 * Pins (spec 2026-10-19_reg-6-retire-registry-rail-spec.md):
 *  - a saved record's provenance card renders inside .registry-provenance-footer
 *    as a SIBLING AFTER .registry-editor-body — never inside a rail;
 *  - the registry DocumentShell renders NO .document-shell__rail element and
 *    NO role=separator resizer at all;
 *  - a create draft renders NO .provenance element and the footer wrapper is
 *    empty (zero height — an empty grey strip is the defect REG-6 kills);
 *  - the footer wrapper carries no chrome of its own (token-only CSS: no
 *    border/background on the wrapper; visual separation lives on .provenance).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import RecordRegistryPage from './RecordRegistryPage'

// ---------------------------------------------------------------------------
// Mocks — same shape as RecordRegistryPage.test.tsx (own file, own mocks)
// ---------------------------------------------------------------------------

const mocked = vi.hoisted(() => ({
  mockListRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
  mockGetRecordEditorProjection: vi.fn().mockResolvedValue({
    schemaId: 'test-schema',
    recordId: 'rec-1',
    title: 'Test Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
    diagnostics: [],
  }),
  mockGetEditorDraftProjection: vi.fn().mockResolvedValue({
    schemaId: 'test-schema',
    recordId: '',
    title: 'New Record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
    slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
    diagnostics: [],
  }),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: mocked.mockListRecordsByKind,
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    getRecordEditorProjection: mocked.mockGetRecordEditorProjection,
    getEditorDraftProjection: mocked.mockGetEditorDraftProjection,
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn(),
    createDraftCopy: vi.fn(),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    getSchemas: vi.fn().mockResolvedValue([]),
    getLifecycleTerminalStates: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn(),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: ({
    placeholder,
    onSelect,
  }: {
    kinds: string[]
    schemaId: string
    placeholder?: string
    onSelect: (record: { recordId: string; schemaId: string; payload: Record<string, unknown>; isNew: boolean }) => void
    disabled?: boolean
  }) => (
    <div data-testid="record-search-combobox">
      <input data-testid="search-input" placeholder={placeholder} />
      <button
        data-testid="search-local-btn"
        onClick={() =>
          onSelect({
            recordId: 'rec-1',
            schemaId: 'test-schema',
            payload: { name: 'Test Record', kind: 'person', schemaId: 'test-schema' },
            isNew: false,
          })
        }
      >
        Search Local
      </button>
      <button
        data-testid="search-new-btn"
        onClick={() =>
          onSelect({
            recordId: '',
            schemaId: 'test-schema',
            payload: { name: 'New Record', schemaId: 'test-schema' },
            isNew: true,
          })
        }
      >
        New Record
      </button>
    </div>
  ),
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: ({ recordId }: { recordId: string }) => (
    <div data-testid="related-records-card">
      <span>Related records for {recordId}</span>
    </div>
  ),
}))

vi.mock('../editor/taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: ({
    blocks,
    slots,
    data,
    onUpdate,
  }: {
    blocks: Array<{ id: string; kind: string }>
    slots: Array<{ id: string; path: string; label: string; widget: string }>
    data: Record<string, unknown>
    disabled?: boolean
    onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
  }) => {
    onUpdate?.(data, Object.keys(data).length > 0)
    return (
      <div data-testid="projection-taptab-editor">
        <span data-testid="blocks-count">{blocks.length}</span>
        <span data-testid="slots-count">{slots.length}</span>
      </div>
    )
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cssPath = resolve(process.cwd(), 'src/pages/RecordRegistryPage.css')
const provenanceCssPath = resolve(process.cwd(), 'src/components/registry/RecordProvenanceCard.css')

/** Select the saved record from the list rows — the row path carries the
 * envelope meta (createdBy/createdAt) through to the provenance card; the
 * combobox mock's onSelect does not. */
async function selectSavedRecord() {
  fireEvent.click(await screen.findByText('Test Record'))
  await screen.findByTestId('projection-taptab-editor')
  // The provenance card only renders when meta carries provenance fields.
  await screen.findByTestId('record-provenance')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecordRegistryPage — REG-6 bottom-docked provenance, no side rail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.mockListRecordsByKind.mockResolvedValue({
      records: [
        {
          recordId: 'rec-1',
          title: 'Test Record',
          kind: 'person',
          payload: { name: 'Test Record', kind: 'person', schemaId: 'test-schema' },
          meta: {
            createdBy: 'USR-BRAD',
            createdAt: '2026-10-03T15:10:21.437Z',
            contentSha: 'dd544a153b87cbb4c6d663876aa9360f15152176',
            path: 'records/person/rec-1__test.yaml',
          },
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('provenance docks at the BOTTOM: footer is a sibling AFTER the editor body, not in a rail', async () => {
    const { container } = render(<RecordRegistryPage />)
    await selectSavedRecord()

    const body = container.querySelector('.registry-editor-body')
    const footer = container.querySelector('.registry-provenance-footer')
    const provenance = container.querySelector('.provenance')

    expect(body).not.toBeNull()
    expect(footer).not.toBeNull()
    expect(provenance).not.toBeNull()

    // SIBLING, not nested: the footer is NOT inside the editor body.
    expect(footer!.contains(body!)).toBe(false)
    expect(body!.contains(footer!)).toBe(false)
    // DOM ORDER: the footer comes AFTER the editor body.
    // eslint-disable-next-line no-bitwise
    expect(
      (body!.compareDocumentPosition(footer!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true)
    // Same parent (both children of the DocumentShell column).
    expect(footer!.parentElement).toBe(body!.parentElement)

    // The provenance card lives in the footer, NOT inside any rail.
    expect(footer!.contains(provenance!)).toBe(true)
    expect(provenance!.closest('.document-shell__rail')).toBeNull()
    expect(provenance!.closest('.registry-rail')).toBeNull()

    // RelatedRecordsCard moved with it (same guard, same footer).
    const related = container.querySelector('[data-testid="related-records-card"]')
    expect(related).not.toBeNull()
    expect(footer!.contains(related!)).toBe(true)
  })

  it('the registry DocumentShell renders NO rail and NO role=separator resizer', async () => {
    const { container } = render(<RecordRegistryPage />)
    await selectSavedRecord()

    expect(container.querySelector('.document-shell')).not.toBeNull()
    expect(container.querySelector('.document-shell__rail')).toBeNull()
    expect(container.querySelector('.document-shell__rail-resizer')).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('create draft: no provenance element and the footer wrapper renders nothing visible', async () => {
    const { container } = render(<RecordRegistryPage />)

    fireEvent.click(screen.getByTestId('search-new-btn'))
    await screen.findByTestId('projection-taptab-editor')

    // REG-4 pin: the card returns null for a create draft.
    expect(container.querySelector('.provenance')).toBeNull()
    expect(screen.queryByTestId('record-provenance')).toBeNull()
    expect(screen.queryByTestId('related-records-card')).toBeNull()

    // The wrapper exists but is EMPTY — zero height, no chrome of its own.
    const footer = container.querySelector('.registry-provenance-footer')
    expect(footer).not.toBeNull()
    expect(footer!.childElementCount).toBe(0)
    expect(footer!.textContent).toBe('')

    // No rail chrome on the create surface either.
    expect(container.querySelector('.document-shell__rail')).toBeNull()
    expect(container.querySelector('.document-shell__rail-resizer')).toBeNull()
  })

  it('CSS pins: footer wrapper is chrome-free; visual separation lives on .provenance', () => {
    const css = readFileSync(cssPath, 'utf8')
    const provenanceCss = readFileSync(provenanceCssPath, 'utf8')

    // The dead rail class is retired from the surface stylesheet.
    expect(css).not.toContain('.registry-rail')

    // The footer exists and is token-only flex layout — NO border/background
    // chrome on the wrapper (an empty wrapper must collapse to zero height).
    const footerRule = css.match(/\.registry-provenance-footer\s*\{[^}]*\}/)
    expect(footerRule, 'missing .registry-provenance-footer rule').not.toBeNull()
    expect(footerRule![0]).toContain('flex')
    expect(footerRule![0]).not.toMatch(/border/)
    expect(footerRule![0]).not.toMatch(/background/)

    // Visual separation moved onto the card itself.
    expect(provenanceCss).toMatch(/\.provenance\s*\{[^}]*border-top:\s*1px solid var\(--cl-border\)/)
    expect(provenanceCss).toMatch(/\.provenance\s*\{[^}]*padding-top/)
  })
})
