import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { planHeadingTitle, BindingModeEditor } from './BindingModeEditor'
import { apiClient } from '../../shared/api/client'

vi.mock('../../shared/hooks/usePlatformRegistry', () => ({
  usePlatformRegistry: () => ({ platforms: [], loading: false }),
}))
vi.mock('../labware/DeckVisualizationPanel', () => ({ DeckVisualizationPanel: () => <div /> }))
vi.mock('./DeckPickerSelect', () => ({ DeckPickerSelect: () => <div /> }))
vi.mock('./SampleBindingPanel', () => ({ SampleBindingPanel: () => <div /> }))
vi.mock('./RoleBindingPanel', () => ({ RoleBindingPanel: () => <div /> }))
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecordWithUI: vi.fn(),
    listRecordsByKind: vi.fn(),
    compileRunPlan: vi.fn(),
    updatePlannedRunBindings: vi.fn(),
  },
}))

const stutteringTitle = 'Plan: 2026-09-06 Run template'

describe('planHeadingTitle', () => {
  it('strips a leading "Plan: " prefix so the heading does not stutter', () => {
    expect(planHeadingTitle(stutteringTitle)).toBe('2026-09-06 Run template')
  })

  it('is case- and space-insensitive on the prefix only', () => {
    expect(planHeadingTitle('plan:2026-09-06 Run template')).toBe('2026-09-06 Run template')
  })

  it('leaves a title that merely contains "Plan" untouched', () => {
    expect(planHeadingTitle('Test Protocol Plan')).toBe('Test Protocol Plan')
  })

  it('never reduces a title to empty — falls back to the original', () => {
    expect(planHeadingTitle('Plan:')).toBe('Plan:')
    expect(planHeadingTitle('Plan:   ')).toBe('Plan:   ')
  })
})

describe('bindings page heading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.getRecordWithUI).mockResolvedValue({
      record: {
        recordId: 'PLR-TEST-HEADING',
        schemaId: 'planned-run',
        meta: { kind: 'planned-run' },
        payload: { kind: 'planned-run', state: 'draft', title: stutteringTitle },
      },
      uiSpec: null,
      schema: null,
    } as never)
    vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [], total: 0 } as never)
    vi.mocked(apiClient.compileRunPlan).mockResolvedValue({ status: 'ready', diagnostics: [] } as never)
  })
  afterEach(() => cleanup())

  it('renders a single "Plan:" prefix when the record title already begins with it', async () => {
    render(
      <MemoryRouter initialEntries={['/runs/PLR-TEST-HEADING/bindings']}>
        <Routes>
          <Route path="/runs/:runId/bindings" element={<BindingModeEditor plannedRunId="PLR-TEST-HEADING" />} />
        </Routes>
      </MemoryRouter>,
    )

    const heading = await screen.findByRole('heading', { level: 2 })
    await waitFor(() => expect(heading).toHaveTextContent(/^Plan: 2026-09-06 Run template$/))
    expect(heading.textContent).not.toContain('Plan: Plan:')
  })
})
