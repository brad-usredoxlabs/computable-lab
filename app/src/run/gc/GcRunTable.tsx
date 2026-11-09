/**
 * GC-12 (deliverable B) — GcRunTable: the READABLE FULL-COLUMN run table.
 *
 * "Full-column" (bait #9) means the table renders EVERY column the entry
 * payload actually carries — including the `*Uninterpreted` / `uninterpreted`
 * honesty arms — never dropping unknown columns to look tidy. The column set
 * is DATA-DRIVEN from `entryDisplayColumns` (the model's projection of the
 * payload keys): there is NO per-column whitelist in this chrome. What the
 * record carries, the table shows; the honesty arms survive because they ARE
 * payload keys.
 *
 * Presentational: no fetch, no config, no writes. The container (GcRunSheetSection)
 * owns the probe + the per-row actions; this component renders rows + cells.
 *
 * Testids (shared with the section test + the V1 receipt):
 *   - the table:            data-testid="gc-run-table"
 *   - a row:                data-testid={`gc-row-<entryRecordId>`}
 *   - a cell:               data-testid={`gc-cell-<entryRecordId>-<columnKey>`}
 */
import type { EntryPayload } from './gcRunSheetModel'
import { entryDisplayColumns } from './gcRunSheetModel'

export interface GcRunTableEntry {
  recordId: string
  payload: EntryPayload
}

export function GcRunTable({ entries }: { entries: GcRunTableEntry[] }) {
  // The column set is the UNION of every entry's projected columns, in first-
  // appearance order (data-driven — a column appears if ANY row carries it, so
  // a sheet with heterogeneous entries still shows the full union).
  const columns: string[] = []
  const seen = new Set<string>()
  const perEntry: Array<{ entry: GcRunTableEntry; cells: Map<string, string> }> = []
  for (const entry of entries) {
    const cellMap = new Map<string, string>()
    for (const col of entryDisplayColumns(entry.payload)) {
      cellMap.set(col.key, col.text)
      if (!seen.has(col.key)) {
        seen.add(col.key)
        columns.push(col.key)
      }
    }
    perEntry.push({ entry, cells: cellMap })
  }

  return (
    <div data-testid="gc-run-table" className="gc-run-table">
      <table>
        <thead>
          <tr>
            <th scope="col">entry</th>
            {columns.map((col) => (
              <th key={col} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {perEntry.map(({ entry, cells }) => (
            <tr key={entry.recordId} data-testid={`gc-row-${entry.recordId}`}>
              <th scope="row">{entry.recordId}</th>
              {columns.map((col) => (
                <td key={col} data-testid={`gc-cell-${entry.recordId}-${col}`}>
                  {cells.get(col) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
