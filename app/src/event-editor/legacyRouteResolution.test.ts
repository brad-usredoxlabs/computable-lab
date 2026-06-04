/**
 * legacyRouteResolution tests — verify the chain that turns a legacy
 * /event-editor route into a target /project/:studyId redirect.
 *
 *  - event-graph with direct links.studyId → that study
 *  - event-graph without studyId but with links.runId → resolve run → study
 *  - event-graph with no resolvable parent → STU-scratch
 *  - run with studyId → that study
 *  - run without studyId → STU-scratch
 *  - getRecord throwing falls through to STU-scratch (no dead-end)
 *  - no-params route → STU-scratch with a fresh deck tab
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getRecordMock = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: { getRecord: (...args: unknown[]) => getRecordMock(...args) },
}))

import {
  resolveLegacyEventGraphRoute,
  resolveLegacyNoParamsRoute,
  resolveLegacyRunRoute,
  SCRATCH_STUDY_ID,
} from './legacyRouteResolution'

beforeEach(() => {
  getRecordMock.mockReset()
})

afterEach(() => {
  getRecordMock.mockReset()
})

describe('resolveLegacyEventGraphRoute', () => {
  it('uses links.studyId when present', async () => {
    getRecordMock.mockResolvedValueOnce({
      recordId: 'EVG-1',
      payload: { name: 'Buffer prep', links: { studyId: 'STU-000001' } },
    })
    const route = await resolveLegacyEventGraphRoute('EVG-1')
    expect(route.studyId).toBe('STU-000001')
    expect(route.openTab?.eventGraphId).toBe('EVG-1')
    expect(route.openTab?.title).toBe('Buffer prep')
  })

  it('walks through links.runId when studyId is absent', async () => {
    getRecordMock
      .mockResolvedValueOnce({
        recordId: 'EVG-1',
        payload: { name: 'g', links: { runId: 'RUN-1' } },
      })
      .mockResolvedValueOnce({
        recordId: 'RUN-1',
        payload: { studyId: 'STU-000002' },
      })
    const route = await resolveLegacyEventGraphRoute('EVG-1')
    expect(route.studyId).toBe('STU-000002')
  })

  it('falls back to STU-scratch when neither path resolves', async () => {
    getRecordMock.mockResolvedValueOnce({
      recordId: 'EVG-1',
      payload: { name: 'orphan' },
    })
    const route = await resolveLegacyEventGraphRoute('EVG-1')
    expect(route.studyId).toBe(SCRATCH_STUDY_ID)
    // The deck tab is still offered so the user can save under scratch.
    expect(route.openTab?.eventGraphId).toBe('EVG-1')
  })

  it('falls back to STU-scratch when getRecord throws', async () => {
    getRecordMock.mockRejectedValueOnce(new Error('404'))
    const route = await resolveLegacyEventGraphRoute('EVG-1')
    expect(route.studyId).toBe(SCRATCH_STUDY_ID)
    expect(route.openTab?.eventGraphId).toBe('EVG-1')
  })

  it('ignores malformed studyId on the graph payload', async () => {
    getRecordMock.mockResolvedValueOnce({
      recordId: 'EVG-1',
      payload: { links: { studyId: '../etc/passwd' } },
    })
    const route = await resolveLegacyEventGraphRoute('EVG-1')
    expect(route.studyId).toBe(SCRATCH_STUDY_ID)
  })
})

describe('resolveLegacyRunRoute', () => {
  it('uses run.studyId when present', async () => {
    getRecordMock.mockResolvedValueOnce({
      recordId: 'RUN-1',
      payload: { studyId: 'STU-000003' },
    })
    const route = await resolveLegacyRunRoute('RUN-1')
    expect(route.studyId).toBe('STU-000003')
    expect(route.openTab).toBeNull()
  })

  it('falls back to scratch when run has no studyId', async () => {
    getRecordMock.mockResolvedValueOnce({
      recordId: 'RUN-1',
      payload: {},
    })
    const route = await resolveLegacyRunRoute('RUN-1')
    expect(route.studyId).toBe(SCRATCH_STUDY_ID)
  })

  it('falls back to scratch when getRecord throws', async () => {
    getRecordMock.mockRejectedValueOnce(new Error('boom'))
    const route = await resolveLegacyRunRoute('RUN-1')
    expect(route.studyId).toBe(SCRATCH_STUDY_ID)
  })
})

describe('resolveLegacyNoParamsRoute', () => {
  it('lands on scratch with a fresh deck tab (no resolution needed)', () => {
    const route = resolveLegacyNoParamsRoute()
    expect(route.studyId).toBe(SCRATCH_STUDY_ID)
    expect(route.openTab?.kind).toBe('deck')
    expect(route.openTab?.eventGraphId).toBe('')
  })
})
