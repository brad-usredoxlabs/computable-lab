/**
 * L2-P1B-PRODUCT-IDENTITY-1 u1 — /lab/labware/new save-control render contract.
 *
 * The gate observation: with nothing extracted and no manual rows, the save
 * button was HIDDEN ("no save control at all"), so a person could not even see
 * that nothing was declared. The fix: the save control renders in EVERY state —
 * disabled with a visible one-line reason when nothing is declared — never
 * inventing a default payload.
 *
 * Two arms, both on a fresh page (no extraction, no manual rows):
 *   (a) the control is PRESENT and DISABLED, with a visible reason;
 *   (b) declaring one geometry field ENABLES the same control.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { LabLabwareNewPage } from './LabLabwareNewPage'

const { mockExtract, mockCreateRecord, mockGetSchema, mockResolve } = vi.hoisted(() => ({
  mockExtract: vi.fn(),
  mockCreateRecord: vi.fn(),
  mockGetSchema: vi.fn(),
  mockResolve: vi.fn(),
}))

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

afterEach(() => {
  cleanup()
})

const ANCHOR_CANDIDATE = { curie: 'FOO:1', label: 'Test term A', namespace: 'FOO', tier: 2 as const, level: 'concept' as const, score: 10, source: 'local-obo' as const }

beforeEach(() => {
  vi.resetAllMocks()
  mockResolve.mockResolvedValue({ candidates: [ANCHOR_CANDIDATE] })
})

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/lab/labware/new']}>
      <Routes>
        <Route
          path="/lab/labware/new"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <LabLabwareNewPage />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
        <Route path="/lab/labware" element={<div data-testid="labware-category" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LabLabwareNewPage save control (L2-P1B-PRODUCT-IDENTITY-1)', () => {
  it('renders the save control PRESENT + DISABLED with a visible reason when nothing is declared', async () => {
    renderPage()
    // Fresh page: no spec-sheet extraction, no manual geometry rows.
    const saveButton = screen.getByTestId('lab-labware-save-button') as HTMLButtonElement
    // Present (was hidden before the fix) and disabled.
    expect(saveButton).toBeDefined()
    expect(saveButton).toBeDisabled()
    // Visible one-line reason for why it is disabled.
    const reason = screen.getByTestId('lab-labware-save-disabled-reason')
    expect(reason).toBeDefined()
    expect(reason.textContent!.trim().length).toBeGreaterThan(0)
    // Disabling must not hide the control: it stays in the document.
    expect(screen.getByTestId('lab-labware-save-button')).toBeInTheDocument()
  })

  it('enables the save control once a geometry field is declared (same control, no second one)', async () => {
    renderPage()
    const saveButton = screen.getByTestId('lab-labware-save-button') as HTMLButtonElement
    expect(saveButton).toBeDisabled()
    // Declare one non-empty geometry field — a row now exists.
    fireEvent.change(screen.getByTestId('lab-labware-geometry-rows') as HTMLInputElement, { target: { value: '8' } })
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-save-button')).not.toBeDisabled()
    })
    // The SAME control is now enabled — no duplicate save affordance.
    expect(screen.getAllByTestId('lab-labware-save-button')).toHaveLength(1)
  })
})
