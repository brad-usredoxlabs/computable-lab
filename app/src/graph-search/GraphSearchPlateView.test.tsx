/**
 * Unit tests for the graph-search well-node helpers and plate view.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { groupByPlate, parseWellLabel } from './wellNodes'
import { GraphSearchPlateView } from './GraphSearchPlateView'
import type { GraphNode } from '../shared/api/graphSearchClient'

function wellNode(id: string, label: string): GraphNode {
  return { id, type: 'well', label }
}

describe('wellNodes', () => {
  it('groups wells by owning record+labware', () => {
    const nodes = [
      wellNode('well:EVG-1:plate1:A1', 'A1'),
      wellNode('well:EVG-1:plate1:A2', 'A2'),
      wellNode('well:EVG-1:plate2:B1', 'B1'),
    ]
    const plates = groupByPlate(nodes)
    expect(plates).toHaveLength(2)
    const p1 = plates.find((p) => p.labwareId === 'plate1')!
    expect(p1.recordId).toBe('EVG-1')
    expect(Object.keys(p1.wells)).toEqual(expect.arrayContaining(['A1', 'A2']))
  })

  it('derives grid rows/cols from the well labels', () => {
    const nodes = [
      wellNode('well:EVG-1:plate1:A1', 'A1'),
      wellNode('well:EVG-1:plate1:C3', 'C3'),
    ]
    const [plate] = groupByPlate(nodes)
    expect(plate.rows).toEqual(['A', 'C'])
    expect(plate.cols).toEqual([1, 2, 3])
  })

  it('parses well labels into row letters and numeric columns', () => {
    expect(parseWellLabel('A1')).toEqual({ row: 'A', col: 1 })
    expect(parseWellLabel('H12')).toEqual({ row: 'H', col: 12 })
    expect(parseWellLabel('junk')).toEqual({ row: null, col: null })
  })
})

describe('GraphSearchPlateView', () => {
  it('renders a plate with hit wells highlighted and toggles selection on click', () => {
    const nodes = [
      wellNode('well:EVG-1:plate1:A1', 'A1'),
      wellNode('well:EVG-1:plate1:B2', 'B2'),
    ]
    const [plate] = groupByPlate(nodes)
    const selected = new Set(['well:EVG-1:plate1:A1'])
    let toggled: string | null = null
    render(
      <GraphSearchPlateView
        plates={[plate]}
        selectedIds={selected}
        onToggle={(id) => { toggled = id }}
      />,
    )
    const hitCells = screen.getAllByTestId('graph-search-plate').length
    expect(hitCells).toBe(1)
    // A1 cell is a hit and selected; B2 is a hit but not selected.
    const a1 = screen.getByTitle('A1')
    expect(a1.getAttribute('data-hit')).toBe('true')
    expect(a1.getAttribute('data-selected')).toBe('true')
    const b2 = screen.getByTitle('B2')
    expect(b2.getAttribute('data-hit')).toBe('true')
    expect(b2.getAttribute('data-selected')).toBe('false')
    // Clicking a hit well toggles.
    a1.click()
    expect(toggled).toBe('well:EVG-1:plate1:A1')
  })
})