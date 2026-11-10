// @vitest-environment node
/**
 * Pin the predicate that classifies the server's 400 refusal for
 * non-planned-run records (PlannedRunHandlers.ts:444-449).
 *
 * The wire shape: status 400, code is `HTTP_400` (degraded from absent
 * `body.code`), message carries the `NOT_A_PLANNED_RUN` token.
 */
import { describe, it, expect } from 'vitest'
import { ApiError, isPlannedRunKindRefusal } from './errors'

describe('isPlannedRunKindRefusal — classifies the NOT_A_PLANNED_RUN refusal', () => {
  it('returns true for the real wire shape (400 + HTTP_400 code + token in message)', () => {
    const err = new ApiError({
      status: 400,
      code: 'HTTP_400',
      message: "NOT_A_PLANNED_RUN: Record 'RUN-x' is not a planned-run",
    })
    expect(isPlannedRunKindRefusal(err)).toBe(true)
  })

  it('returns true when the token is in the code field (code leg)', () => {
    const err = new ApiError({
      status: 400,
      code: 'NOT_A_PLANNED_RUN',
      message: 'Record is not a planned-run',
    })
    expect(isPlannedRunKindRefusal(err)).toBe(true)
  })

  it('returns false for the same message token with status 500', () => {
    const err = new ApiError({
      status: 500,
      code: 'HTTP_500',
      message: "NOT_A_PLANNED_RUN: Record 'RUN-x' is not a planned-run",
    })
    expect(isPlannedRunKindRefusal(err)).toBe(false)
  })

  it('returns false for a 400 whose message token is NO_PROTOCOL_ATTACHED', () => {
    const err = new ApiError({
      status: 400,
      code: 'HTTP_400',
      message: 'NO_PROTOCOL_ATTACHED: no protocol',
    })
    expect(isPlannedRunKindRefusal(err)).toBe(false)
  })

  it('returns false for a plain Error', () => {
    const err = new Error('NOT_A_PLANNED_RUN')
    expect(isPlannedRunKindRefusal(err)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPlannedRunKindRefusal(null)).toBe(false)
  })
})
