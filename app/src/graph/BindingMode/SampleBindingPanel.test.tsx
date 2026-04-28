import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, type RenderResult } from '@testing-library/react'
import { SampleBindingPanel } from './SampleBindingPanel'
import { apiClient } from '../../shared/api/client'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    setPlannedRunSampleMap: vi.fn(),
  },
}))

const mockOnChange = vi.fn()

function renderPanel(props: Partial<React.ComponentProps<typeof SampleBindingPanel>> = {}): RenderResult {
  return render(
    <SampleBindingPanel
      plannedRunId="PLR-000001"
      sampleCount={96}
      onChange={mockOnChange}
      {...props}
    />,
  )
}

describe('SampleBindingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.setPlannedRunSampleMap).mockReset()
    vi.mocked(apiClient.setPlannedRunSampleMap).mockResolvedValue({
      success: true,
      mode: 'implicit',
      entryCount: 0,
    })
  })

  it('renders with implicit mode as default and shows confirmation text', () => {
    const { container } = renderPanel({ sampleCount: 24 })

    expect(container.querySelector('[data-testid="sample-binding-panel"]')).toBeInTheDocument()
    const confirmation = container.querySelector('[data-testid="sample-binding-implicit-confirmation"]')
    expect(confirmation?.textContent).toContain('24 samples will be bound by well order')
    expect(confirmation?.textContent).toContain('A1 = sample 1')
    expect(confirmation?.textContent).toContain('B12 = sample 24')
    expect(confirmation?.querySelector('button')).toBeInTheDocument()
  })

  it('shows correct last well for 96 samples', () => {
    const { container } = renderPanel({ sampleCount: 96 })
    const confirmation = container.querySelector('[data-testid="sample-binding-implicit-confirmation"]')
    expect(confirmation?.textContent).toContain('H12 = sample 96')
  })

  it('shows correct last well for 1 sample', () => {
    const { container } = renderPanel({ sampleCount: 1 })
    const confirmation = container.querySelector('[data-testid="sample-binding-implicit-confirmation"]')
    expect(confirmation?.textContent).toContain('A1 = sample 1')
  })

  it('toggling to CSV mode shows file picker', () => {
    const { container } = renderPanel()

    // Toggle to CSV mode using the radio button with value csv
    const radios = container.querySelectorAll('input[type="radio"]')
    const csvRadio = Array.from(radios).find((r) => r.value === 'csv')
    expect(csvRadio).toBeTruthy()
    fireEvent.click(csvRadio!)

    expect(container.querySelector('[data-testid="sample-binding-csv-mode"]')).toBeInTheDocument()
    expect(container.querySelector('[data-testid="sample-binding-file-picker"]')).toBeInTheDocument()
  })

  it('CSV mode parses fixture file and shows preview', async () => {
    const { container } = renderPanel()

    // Toggle to CSV mode
    const radios = container.querySelectorAll('input[type="radio"]')
    const csvRadio = Array.from(radios).find((r) => r.value === 'csv')
    fireEvent.click(csvRadio!)

    // Create a CSV file
    const csvContent = 'well_id,sample_label\nA1,patient-001\nA2,patient-002'
    const file = new File([csvContent], 'samples.csv', { type: 'text/csv' })

    const input = container.querySelector('[data-testid="sample-binding-file-picker"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sample-binding-csv-preview"]')).toBeInTheDocument()
    })

    // Check preview rows
    const rows = container.querySelectorAll('table[data-testid="sample-binding-csv-preview"] tbody tr')
    expect(rows.length).toBe(2)
    expect(container.querySelector('[data-testid="sample-binding-csv-preview"]')?.textContent).toContain('patient-001')
    expect(container.querySelector('[data-testid="sample-binding-csv-preview"]')?.textContent).toContain('patient-002')
  })

  it('invalid CSV (missing well_id column) surfaces error', async () => {
    const { container } = renderPanel()

    // Toggle to CSV mode
    const radios = container.querySelectorAll('input[type="radio"]')
    const csvRadio = Array.from(radios).find((r) => r.value === 'csv')
    fireEvent.click(csvRadio!)

    // Create an invalid CSV file
    const csvContent = 'well_name,sample_label\nA1,patient-001'
    const file = new File([csvContent], 'samples.csv', { type: 'text/csv' })

    const input = container.querySelector('[data-testid="sample-binding-file-picker"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sample-binding-errors"]')).toBeInTheDocument()
    })

    expect(container.querySelector('[data-testid="sample-binding-errors"]')?.textContent).toContain('Missing required column: well_id')
  })

  it('Save button is disabled when CSV has errors', async () => {
    const { container } = renderPanel()

    // Toggle to CSV mode
    const radios = container.querySelectorAll('input[type="radio"]')
    const csvRadio = Array.from(radios).find((r) => r.value === 'csv')
    fireEvent.click(csvRadio!)

    // Create an invalid CSV file
    const csvContent = 'well_name,sample_label\nA1,patient-001'
    const file = new File([csvContent], 'samples.csv', { type: 'text/csv' })

    const input = container.querySelector('[data-testid="sample-binding-file-picker"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sample-binding-errors"]')).toBeInTheDocument()
    })

    const saveBtn = container.querySelector('[data-testid="sample-binding-csv-mode"] button')
    expect(saveBtn).toBeDisabled()
  })

  it('clicking Save in CSV mode calls apiClient.setPlannedRunSampleMap with mode csv', async () => {
    const { container } = renderPanel()

    // Toggle to CSV mode
    const radios = container.querySelectorAll('input[type="radio"]')
    const csvRadio = Array.from(radios).find((r) => r.value === 'csv')
    fireEvent.click(csvRadio!)

    // Create a valid CSV file
    const csvContent = 'well_id,sample_label\nA1,patient-001\nA2,patient-002'
    const file = new File([csvContent], 'samples.csv', { type: 'text/csv' })

    const input = container.querySelector('[data-testid="sample-binding-file-picker"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sample-binding-csv-preview"]')).toBeInTheDocument()
    })

    // Save button should be enabled
    const csvMode = container.querySelector('[data-testid="sample-binding-csv-mode"]')
    const saveBtn = csvMode?.querySelector('button')
    expect(saveBtn).not.toBeDisabled()

    // Click save
    fireEvent.click(saveBtn!)

    await waitFor(() => {
      expect(apiClient.setPlannedRunSampleMap).toHaveBeenCalledWith('PLR-000001', {
        mode: 'csv',
        entries: [
          { wellId: 'A1', sampleLabel: 'patient-001' },
          { wellId: 'A2', sampleLabel: 'patient-002' },
        ],
      })
    })
  })

  it('clicking Apply implicit binding calls apiClient.setPlannedRunSampleMap with mode implicit', async () => {
    const { container } = renderPanel({ sampleCount: 48 })

    const implicitPanel = container.querySelector('[data-testid="sample-binding-implicit-confirmation"]')
    const applyBtn = implicitPanel?.querySelector('button')
    expect(applyBtn).toBeTruthy()
    fireEvent.click(applyBtn!)

    await waitFor(() => {
      expect(apiClient.setPlannedRunSampleMap).toHaveBeenCalledWith('PLR-000001', {
        mode: 'implicit',
      })
    })
  })

  it('shows "Showing first 10 of N rows" when more than 10 rows', async () => {
    const { container } = renderPanel()

    // Toggle to CSV mode
    const radios = container.querySelectorAll('input[type="radio"]')
    const csvRadio = Array.from(radios).find((r) => r.value === 'csv')
    fireEvent.click(csvRadio!)

    // Create a CSV with 15 rows
    const lines = ['well_id,sample_label']
    for (let i = 1; i <= 15; i++) {
      lines.push(`A${i},sample-${String(i).padStart(3, '0')}`)
    }
    const csvContent = lines.join('\n')
    const file = new File([csvContent], 'samples.csv', { type: 'text/csv' })

    const input = container.querySelector('[data-testid="sample-binding-file-picker"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sample-binding-csv-mode"]')?.textContent).toContain('Showing first 10 of 15 rows')
    })
  })
})
