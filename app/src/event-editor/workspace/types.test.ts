/**
 * Tests for the new entity-type tab kinds and entityTabType helper.
 */

import { describe, it, expect } from 'vitest'
import {
  entityTabType,
  projectTabId,
  runTabId,
  claimTabId,
  labEntityTabId,
} from './types'

describe('entityTabType', () => {
  it('returns "project" for project tabs', () => {
    expect(entityTabType({ id: 'p1', kind: 'project', studyId: 'STU-1', title: 'P' })).toBe('project')
  })

  it('returns "run" for run tabs', () => {
    expect(entityTabType({ id: 'r1', kind: 'run', runId: 'RUN-1', title: 'R' })).toBe('run')
  })

  it('returns "run" for deck tabs', () => {
    expect(entityTabType({ id: 'd1', kind: 'deck', eventGraphId: 'eg-1', title: 'D' })).toBe('run')
  })

  it('returns "run" for execution tabs', () => {
    expect(entityTabType({ id: 'e1', kind: 'execution', eventGraphId: 'eg-1', runId: 'RUN-1', title: 'E' })).toBe('run')
  })

  it('returns "claim" for claim tabs', () => {
    expect(entityTabType({ id: 'c1', kind: 'claim', claimId: 'CLM-1', title: 'C' })).toBe('claim')
  })

  it('returns "lab" for lab-entity tabs', () => {
    expect(entityTabType({
      id: 'l1',
      kind: 'lab-entity',
      schemaId: 's',
      recordId: 'M-1',
      entityType: 'material',
      title: 'M',
    })).toBe('lab')
  })

  it('returns "lab" for record-edit tabs', () => {
    expect(entityTabType({ id: 're1', kind: 'record-edit', recordId: 'R-1', title: 'RE' })).toBe('lab')
  })

  it('returns null for pdf tabs', () => {
    expect(entityTabType({ id: 'pdf1', kind: 'pdf', artifactId: 'a1', title: 'P' })).toBe(null)
  })

  it('returns null for document tabs', () => {
    expect(entityTabType({ id: 'doc1', kind: 'document', artifactId: 'a1', title: 'D' })).toBe(null)
  })

  it('returns null for project-details tabs', () => {
    expect(entityTabType({ id: 'pd1', kind: 'project-details', title: 'PD' })).toBe(null)
  })

  it('returns null for record-create tabs', () => {
    expect(entityTabType({ id: 'rc1', kind: 'record-create', nodeType: 'run', title: 'RC' })).toBe(null)
  })
})

describe('tab ID helpers', () => {
  it('projectTabId produces stable id', () => {
    expect(projectTabId('STU-1')).toBe('project:STU-1')
  })

  it('runTabId produces stable id', () => {
    expect(runTabId('RUN-1')).toBe('run:RUN-1')
  })

  it('claimTabId produces stable id', () => {
    expect(claimTabId('CLM-1')).toBe('claim:CLM-1')
  })

  it('labEntityTabId produces stable id', () => {
    expect(labEntityTabId('MAT-1')).toBe('lab:MAT-1')
  })
})
