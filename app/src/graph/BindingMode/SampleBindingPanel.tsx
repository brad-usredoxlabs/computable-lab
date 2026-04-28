import { useState, useCallback } from 'react'
import { apiClient } from '../../shared/api/client'
import { parseCsv } from '../../lib/csvParser'

export interface SampleBindingPanelProps {
  plannedRunId: string
  sampleCount: number
  currentSampleMap?: Array<{ wellId: string; sampleLabel: string }>
  onChange: () => void
}

interface ParsedRow {
  wellId: string
  sampleLabel: string
}

const WELL_ORDER = [
  'A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12',
  'B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12',
  'C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11','C12',
  'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12',
  'E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12',
  'H1','H2','H3','H4','H5','H6','H7','H8','H9','H10','H11','H12',
]

function lastWellLabel(count: number): string {
  const idx = Math.min(count - 1, WELL_ORDER.length - 1)
  return WELL_ORDER[idx]
}

export function SampleBindingPanel({
  plannedRunId,
  sampleCount,
  currentSampleMap,
  onChange,
}: SampleBindingPanelProps) {
  const [mode, setMode] = useState<'implicit' | 'csv'>('implicit')
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([])
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const [applying, setApplying] = useState(false)

  const isImplicit = mode === 'implicit'

  const handleImplicitApply = useCallback(async () => {
    setApplying(true)
    try {
      await apiClient.setPlannedRunSampleMap(plannedRunId, { mode: 'implicit' })
      onChange()
    } finally {
      setApplying(false)
    }
  }, [plannedRunId, onChange])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        const parsed = parseCsv(text)
        const errors: string[] = [...parsed.errors]
        const rows: ParsedRow[] = []

        // Validate headers
        const headerLower = parsed.headers.map((h) => h.toLowerCase())
        const wellIdIdx = headerLower.indexOf('well_id')
        const sampleLabelIdx = headerLower.indexOf('sample_label')

        if (wellIdIdx === -1) {
          errors.push('Missing required column: well_id')
        }
        if (sampleLabelIdx === -1) {
          errors.push('Missing required column: sample_label')
        }

        if (wellIdIdx === -1 || sampleLabelIdx === -1) {
          setCsvRows([])
          setCsvErrors(errors)
          return
        }

        // Parse data rows
        for (let i = 0; i < parsed.rows.length; i++) {
          const row = parsed.rows[i]
          const wellId = (row[parsed.headers[wellIdIdx]] ?? '').trim()
          const sampleLabel = (row[parsed.headers[sampleLabelIdx]] ?? '').trim()

          if (!wellId) {
            errors.push(`Row ${i + 2}: missing well_id`)
          } else if (!sampleLabel) {
            errors.push(`Row ${i + 2}: missing sample_label`)
          } else {
            rows.push({ wellId, sampleLabel })
          }
        }

        setCsvRows(rows)
        setCsvErrors(errors)
      }
      reader.readAsText(file)
      // Reset file input so same file can be re-selected
      e.target.value = ''
    },
    [],
  )

  const handleCsvSave = useCallback(async () => {
    if (csvErrors.length > 0) return
    setApplying(true)
    try {
      await apiClient.setPlannedRunSampleMap(plannedRunId, {
        mode: 'csv',
        entries: csvRows,
      })
      onChange()
    } finally {
      setApplying(false)
    }
  }, [plannedRunId, csvRows, csvErrors, onChange])

  return (
    <div className="sample-binding-panel" data-testid="sample-binding-panel">
      <h3 className="sample-binding-panel__title">Sample Binding</h3>

      {/* Mode toggle */}
      <div className="sample-binding-panel__mode" data-testid="sample-binding-mode-toggle">
        <label>
          <input
            type="radio"
            name="sample-binding-mode"
            value="implicit"
            checked={isImplicit}
            onChange={() => setMode('implicit')}
          />
          {' '}Implicit (well order)
        </label>
        <label>
          <input
            type="radio"
            name="sample-binding-mode"
            value="csv"
            checked={!isImplicit}
            onChange={() => setMode('csv')}
          />
          {' '}Upload CSV
        </label>
      </div>

      {/* Implicit mode */}
      {isImplicit && (
        <div className="sample-binding-panel__implicit" data-testid="sample-binding-implicit-confirmation">
          <p>
            {sampleCount} samples will be bound by well order (A1 = sample 1, ..., {lastWellLabel(sampleCount)} = sample {sampleCount})
          </p>
          <button
            className="sample-binding-panel__btn"
            disabled={applying}
            onClick={handleImplicitApply}
          >
            {applying ? 'Applying...' : 'Apply implicit binding'}
          </button>
        </div>
      )}

      {/* CSV mode */}
      {!isImplicit && (
        <div className="sample-binding-panel__csv" data-testid="sample-binding-csv-mode">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            data-testid="sample-binding-file-picker"
          />

          {csvErrors.length > 0 && (
            <div className="sample-binding-panel__errors" data-testid="sample-binding-errors">
              {csvErrors.map((err, i) => (
                <div key={i} className="sample-binding-panel__error">{err}</div>
              ))}
            </div>
          )}

          {csvRows.length > 0 && (
            <div>
              <table className="sample-binding-panel__table" data-testid="sample-binding-csv-preview">
                <thead>
                  <tr>
                    <th>well_id</th>
                    <th>sample_label</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td>{r.wellId}</td>
                      <td>{r.sampleLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 10 && (
                <div className="sample-binding-panel__row-count">
                  Showing first 10 of {csvRows.length} rows
                </div>
              )}
            </div>
          )}

          <button
            className="sample-binding-panel__btn"
            disabled={csvErrors.length > 0 || csvRows.length === 0 || applying}
            onClick={handleCsvSave}
          >
            {applying ? 'Saving...' : 'Save sample map'}
          </button>
        </div>
      )}
    </div>
  )
}
