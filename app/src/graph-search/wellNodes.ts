/**
 * Well-node helpers — parse projected `well:<record>:<labware>:<label>` node
 * ids into per-plate grids the Find UI can render (spec §10 plate view).
 *
 * A well node id is `well:<recordId>:<labwareId>:<wellLabel>` (see the server
 * GraphProjector). This module groups those into plates keyed by record+labware
 * and maps each well label to a grid coordinate. Labels may be 96-well form
 * (A1..H12) or 384-well (A1..P24).
 */

import type { GraphNode } from '../shared/api/graphSearchClient'

export interface PlateOfWells {
  key: string
  recordId: string
  labwareId: string
  /** well label → node id */
  wells: Record<string, string>
  /** 1-based grid dims for the largest label seen */
  rows: string[]
  cols: number[]
}

/** True if this node is a projected `well` node. */
export function isWellNode(node: GraphNode): boolean {
  return node.type === 'well'
}

/** Group well nodes by their owning record+labware. */
export function groupByPlate(nodes: GraphNode[]): PlateOfWells[] {
  const plates = new Map<string, PlateOfWells>()
  for (const node of nodes) {
    if (node.type !== 'well') continue
    const parts = node.id.split(':')
    // well:<record>:<labware>:<label>
    const recordId = parts[1] ?? '(unknown)'
    const labwareId = parts[2] ?? '(plate)'
    const label = parts[3] ?? node.label
    const key = `${recordId}::${labwareId}`
    let plate = plates.get(key)
    if (!plate) {
      plate = { key, recordId, labwareId, wells: {}, rows: [], cols: [] }
      plates.set(key, plate)
    }
    plate.wells[label] = node.id
  }
  // Derive grid dims from the labels.
  for (const plate of plates.values()) {
    const labels = Object.keys(plate.wells)
    const rows = new Set<string>()
    const cols = new Set<number>()
    for (const label of labels) {
      const { row, col } = parseWellLabel(label)
      if (row !== null) rows.add(row)
      if (col !== null) cols.add(col)
    }
    plate.rows = sortedRows([...rows])
    const maxCol = cols.size > 0 ? Math.max(...cols) : 0
    plate.cols = Array.from({ length: maxCol }, (_, i) => i + 1)
  }
  return [...plates.values()]
}

export function parseWellLabel(label: string): { row: string | null; col: number | null } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(label.trim())
  if (!m) return { row: null, col: null }
  return { row: m[1]!.toUpperCase(), col: parseInt(m[2]!, 10) }
}

function sortedRows(rows: string[]): string[] {
  return [...rows].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** Well label coordinate for a grid render. */
export function wellCoordinate(label: string): { row: string; col: number } {
  const { row, col } = parseWellLabel(label)
  return { row: row ?? '?', col: col ?? 0 }
}