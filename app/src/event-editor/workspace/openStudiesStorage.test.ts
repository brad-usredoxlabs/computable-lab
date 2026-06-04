/**
 * Tests for the open-studies localStorage helper.
 *
 * Asserts the per-user browser-session contract:
 *  - opening a study is idempotent (no duplicates)
 *  - opening preserves order; closed studies disappear
 *  - reorder accepts a desired-order list and drops missing ids
 *  - read tolerates missing/corrupt JSON without throwing
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearOpenStudies,
  closeStudy,
  listOpenStudies,
  openStudy,
  OPEN_STUDIES_STORAGE_KEY,
  reorderOpenStudies,
  setOpenStudyTitle,
} from './openStudiesStorage'

beforeEach(() => {
  // Each test starts from a clean slate so order/content assertions are
  // deterministic across the suite.
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('openStudiesStorage', () => {
  it('starts empty', () => {
    expect(listOpenStudies()).toEqual([])
  })

  it('opens a study with a title', () => {
    const list = openStudy('STU-000001', 'Hepatocyte study')
    expect(list).toHaveLength(1)
    expect(list[0].studyId).toBe('STU-000001')
    expect(list[0].title).toBe('Hepatocyte study')
    expect(typeof list[0].openedAt).toBe('string')
  })

  it('opening an already-open study is idempotent', () => {
    openStudy('STU-000001', 'First')
    const list = openStudy('STU-000001', 'First')
    expect(list).toHaveLength(1)
  })

  it('opening an already-open study with a new title updates the title in place', () => {
    openStudy('STU-000001', 'Old')
    const list = openStudy('STU-000001', 'New')
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('New')
  })

  it('preserves insertion order across multiple opens', () => {
    openStudy('STU-A')
    openStudy('STU-B')
    openStudy('STU-C')
    expect(listOpenStudies().map((e) => e.studyId)).toEqual([
      'STU-A',
      'STU-B',
      'STU-C',
    ])
  })

  it('closes a study, removing only the matched id', () => {
    openStudy('STU-A')
    openStudy('STU-B')
    openStudy('STU-C')
    const list = closeStudy('STU-B')
    expect(list.map((e) => e.studyId)).toEqual(['STU-A', 'STU-C'])
  })

  it('closing an unknown id is a no-op', () => {
    openStudy('STU-A')
    const list = closeStudy('STU-Z')
    expect(list).toHaveLength(1)
  })

  it('reorder accepts the desired order and drops missing ids', () => {
    openStudy('STU-A')
    openStudy('STU-B')
    openStudy('STU-C')
    const list = reorderOpenStudies(['STU-C', 'STU-A'])
    // STU-B drops out because it wasn't included.
    expect(list.map((e) => e.studyId)).toEqual(['STU-C', 'STU-A'])
  })

  it('setOpenStudyTitle is a no-op for unknown ids', () => {
    openStudy('STU-A')
    const list = setOpenStudyTitle('STU-Z', 'New')
    expect(list).toHaveLength(1)
    expect(list[0].studyId).toBe('STU-A')
  })

  it('clearOpenStudies wipes everything', () => {
    openStudy('STU-A')
    openStudy('STU-B')
    clearOpenStudies()
    expect(listOpenStudies()).toEqual([])
  })

  it('list tolerates corrupt JSON in localStorage', () => {
    window.localStorage.setItem(OPEN_STUDIES_STORAGE_KEY, '{not valid json')
    expect(listOpenStudies()).toEqual([])
  })

  it('list tolerates non-array JSON in localStorage', () => {
    window.localStorage.setItem(
      OPEN_STUDIES_STORAGE_KEY,
      JSON.stringify({ studyId: 'STU-A' }),
    )
    expect(listOpenStudies()).toEqual([])
  })

  it('list silently drops malformed entries inside the array', () => {
    window.localStorage.setItem(
      OPEN_STUDIES_STORAGE_KEY,
      JSON.stringify([
        { studyId: 'STU-A', openedAt: '2026-01-01T00:00:00Z' },
        { not: 'a study' },
        { studyId: 'STU-B' /* missing openedAt */ },
        { studyId: 'STU-C', openedAt: '2026-01-02T00:00:00Z', title: 'C' },
      ]),
    )
    const list = listOpenStudies()
    expect(list.map((e) => e.studyId)).toEqual(['STU-A', 'STU-C'])
  })
})
