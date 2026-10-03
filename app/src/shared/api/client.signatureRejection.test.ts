import { describe, expect, it } from 'vitest'
import { isSignatureRejection } from './client'
import { ApiError } from './errors'

/** Server wire shape (RecordHandlers.ts:747,750,753): { error: TOKEN, message } — NO `code`.
 * fromResponse() builds ApiError with:
 *   message = `${errorCode}: ${errorText}`  →  "STALE_SIGNATURE: The document changed after signing."
 *   code    = `HTTP_${response.status}`      →  "HTTP_409"
 */
const wire = (status: number, token: string, message: string) =>
  new ApiError({
    status,
    code: `HTTP_${status}`,
    message: `${token}: ${message}`,
  })

describe('isSignatureRejection', () => {
  it('matches the no-code wire shape for each token', () => {
    expect(isSignatureRejection(wire(409, 'STALE_SIGNATURE', 'The document changed after signing.'))).toBe(true)
    expect(isSignatureRejection(wire(409, 'SIGNED_CONTENT_CHANGED', 'Save content edits before signing.'))).toBe(true)
    expect(isSignatureRejection(wire(422, 'SIGNATURE_TARGET_MISMATCH', 'The signature is for a different transition.'))).toBe(true)
  })

  it('can filter to one token', () => {
    const e = wire(409, 'STALE_SIGNATURE', 'x')
    expect(isSignatureRejection(e, 'STALE_SIGNATURE')).toBe(true)
    expect(isSignatureRejection(e, 'SIGNED_CONTENT_CHANGED')).toBe(false)
  })

  it('does not swallow unrelated failures', () => {
    expect(isSignatureRejection(new Error('STALE_SIGNATURE'))).toBe(false)
    expect(isSignatureRejection(wire(409, 'CONFLICT', 'nope'))).toBe(false)
  })
})
