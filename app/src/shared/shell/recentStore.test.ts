import { describe, it, expect, beforeEach } from 'vitest'
import { recordView, loadRecentItems, groupRecentByType } from './recentStore'

function seed() {
  recordView({ recordId: 'A', kind: 'run', title: 'Run A', entityType: 'run' })
  recordView({ recordId: 'B', kind: 'run', title: 'Run B', entityType: 'run' })
  recordView({ recordId: 'C', kind: 'material', title: 'Mat C', entityType: 'lab' })
}

describe('recentStore', () => {
  beforeEach(() => localStorage.clear())

  it('stores newest first', () => {
    seed()
    const items = loadRecentItems()
    expect(items[0].recordId).toBe('C') // C recorded last
    expect(items.map((i) => i.recordId)).toEqual(['C', 'B', 'A'])
  })

  it('dedupes by recordId and bumps to front', () => {
    seed()
    recordView({ recordId: 'A', kind: 'run', title: 'Run A', entityType: 'run' })
    const items = loadRecentItems()
    expect(items[0].recordId).toBe('A')
    expect(items.filter((i) => i.recordId === 'A')).toHaveLength(1)
  })

  it('caps per type at LIMIT', () => {
    for (let i = 0; i < 15; i++) {
      recordView({ recordId: `P${i}`, kind: 'run', title: `P${i}`, entityType: 'run' })
    }
    const runs = loadRecentItems().filter((i) => i.entityType === 'run')
    expect(runs.length).toBe(10)
  })

  it('groups by type preserving order', () => {
    seed()
    const grouped = groupRecentByType(loadRecentItems())
    expect(grouped['run'].map((i) => i.recordId)).toEqual(['B', 'A'])
    expect(grouped['lab'].map((i) => i.recordId)).toEqual(['C'])
  })
})
