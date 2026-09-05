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
import { LABWARE_CONFIGS } from '../types/labware'

export interface PlateOfWells {
  key: string
  recordId: string
  labwareId: string
  /** well label → node id */
  wells: Record<string, string>
  /** 1-based grid dims for the largest label seen */
  rows: string[]
  cols: number[]
  /** linear addressing for reservoirs/tubes; when set the plate renders as a single strip */
  linearLabels?: string[]
  /** resolved labware type (from the projected node) */
  labwareType?: string
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
    const labwareType = typeof node.properties?.labwareType === 'string' ? node.properties.labwareType : undefined
    const key = `${recordId}::${labwareId}`
    let plate = plates.get(key)
    if (!plate) {
      plate = {
        key,
        recordId,
        labwareId,
        wells: {},
        rows: [],
        cols: [],
        ...(labwareType ? { labwareType } : {}),
      }
      plates.set(key, plate)
    }
    plate.wells[label] = node.id
  }
  // Derive the frame: prefer the labware's declared addressing; fall back to
  // the matched labels (so old event-graphs lacking labwareType still render).
  for (const plate of plates.values()) {
    applyFrame(plate)
  }
  return [...plates.values()]
}

/**
 * Resolve rows/cols (or linearLabels) for a plate from its labwareType's
 * declared addressing when available, else from the matched well labels.
 */
function applyFrame(plate: PlateOfWells): void {
  const config = plate.labwareType ? LABWARE_CONFIGS[plate.labwareType as keyof typeof LABWARE_CONFIGS] : undefined
  const addressing = config?.addressing
  if (addressing?.type === 'grid' && addressing.rowLabels && addressing.columnLabels) {
    // Full declared frame — the real plate, not just the touched wells.
    plate.rows = [...addressing.rowLabels]
    plate.cols = addressing.columnLabels.map((c) => parseInt(String(c), 10))
    plate.linearLabels = undefined
    return
  }
  if ((addressing?.type === 'linear' || addressing?.type === 'single') && addressing.linearLabels) {
    plate.rows = []
    plate.cols = []
    plate.linearLabels = [...addressing.linearLabels]
    return
  }
  // Fallback: derive from matched labels (unknown/missing labwareType).
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
  plate.linearLabels = undefined
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