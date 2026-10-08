/**
 * claimProjectLink — the project→claim link written on accept.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRecordMock = vi.fn()
const updateRecordMock = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    updateRecord: (...args: unknown[]) => updateRecordMock(...args),
  },
}))

import { linkClaimsToProject, mergeClaimRelationships } from './claimProjectLink'

beforeEach(() => {
  getRecordMock.mockReset()
  updateRecordMock.mockReset()
})

describe('mergeClaimRelationships', () => {
  it('appends investigates relationships for claims not already linked', () => {
    const { claimRelationships, added } = mergeClaimRelationships([], ['CLM-1', 'CLM-2'])
    expect(claimRelationships).toEqual([
      { verb: 'investigates', claimId: 'CLM-1' },
      { verb: 'investigates', claimId: 'CLM-2' },
    ])
    expect(added).toEqual(['CLM-1', 'CLM-2'])
  })

  it('never duplicates an existing link and preserves human-authored verbs', () => {
    const existing = [{ verb: 'assumes', claimId: 'CLM-1' }]
    const { claimRelationships, added } = mergeClaimRelationships(existing, ['CLM-1', 'CLM-2'])
    expect(claimRelationships).toEqual([
      { verb: 'assumes', claimId: 'CLM-1' },
      { verb: 'investigates', claimId: 'CLM-2' },
    ])
    expect(added).toEqual(['CLM-2'])
  })

  it('tolerates a missing/garbage existing value and blank ids', () => {
    expect(mergeClaimRelationships(undefined, ['', '  ']).added).toEqual([])
    expect(mergeClaimRelationships('nonsense', ['CLM-9']).added).toEqual(['CLM-9'])
  })
})

describe('linkClaimsToProject', () => {
  it('writes the merged claimRelationships back onto the study', async () => {
    getRecordMock.mockResolvedValue({
      recordId: 'STU-1',
      payload: { kind: 'study', id: 'STU-1', title: 'PPARa_ROS_project' },
    })
    updateRecordMock.mockResolvedValue({ recordId: 'STU-1' })

    const result = await linkClaimsToProject('STU-1', ['CLM-clofibrate-ppara-agonist-b3c4'])

    expect(result.linked).toEqual(['CLM-clofibrate-ppara-agonist-b3c4'])
    expect(updateRecordMock).toHaveBeenCalledTimes(1)
    const [studyId, payload] = updateRecordMock.mock.calls[0]!
    expect(studyId).toBe('STU-1')
    expect(payload).toMatchObject({
      kind: 'study',
      id: 'STU-1',
      title: 'PPARa_ROS_project',
      claimRelationships: [{ verb: 'investigates', claimId: 'CLM-clofibrate-ppara-agonist-b3c4' }],
    })
  })

  it('does not write when every claim is already linked', async () => {
    getRecordMock.mockResolvedValue({
      recordId: 'STU-1',
      payload: { kind: 'study', id: 'STU-1', claimRelationships: [{ verb: 'investigates', claimId: 'CLM-1' }] },
    })

    const result = await linkClaimsToProject('STU-1', ['CLM-1'])

    expect(result.linked).toEqual([])
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('is a no-op without a study id or claim ids', async () => {
    expect(await linkClaimsToProject('', ['CLM-1'])).toEqual({ linked: [] })
    expect(await linkClaimsToProject('STU-1', [])).toEqual({ linked: [] })
    expect(getRecordMock).not.toHaveBeenCalled()
  })
})
