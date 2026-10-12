/**
 * QMS-3 contract tests: signature plumbing in the frontend API client.
 *
 * Spec: .hermes/plans/2026-10-03_qms-3-client-signature-plumbing-spec.md
 * Server truth: server/src/api/handlers/SignatureHandlers.ts (POST /signatures),
 * server/src/api/handlers/RecordHandlers.ts (PUT /records/:id body-top-level
 * signatureRefs), QMS-1 decisions doc §(d).
 *
 * fetch is mocked module-globally (style: shared/taptab/slashMenu/resolvers.test.ts).
 * Every call is recorded so the password-containment test can sweep ALL traffic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiClient,
  isReauthFailure,
  type SignatureResult,
} from './client'
import { ApiError } from './errors'

const PASSWORD = 'correct horse battery staple'
const SIG_OK = {
  success: true as const,
  signatureId: 'SIG-0A1B2C3D4E5F6789',
  subject: { recordId: 'DOC-DEMO-SOP', gitCommit: 'ae4c20ea1b2c3d4e5f60718293a4b5c6d7e8f901' },
}

const fetchSpy = vi.fn()

/** Every fetch call recorded as { url, init } with the ORIGINAL string body. */
function calls(): Array<{ url: string; init: RequestInit }> {
  return fetchSpy.mock.calls.map(([url, init]) => ({
    url: String(url),
    init: (init ?? {}) as RequestInit,
  }))
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The server's ACTUAL wire error shape (live-probed 2026-10-03 against :3001):
 *  `{ error, message }` with NO `code` field. `errors.ts` fromResponse() reads
 *  `body.code` for the code, so on the wire the code degrades to HTTP_<status>. */
function wireError(status: number, error: string, message: string) {
  return jsonResponse(status, { error, message })
}

describe('apiClient.createSignature', () => {
  it('POSTs /signatures with the exact server body shape and returns the typed success payload', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, SIG_OK))

    const result: SignatureResult = await apiClient.createSignature({
      action: 'approved',
      subjectRecordId: 'DOC-DEMO-SOP',
      lifecycleId: 'document-controlled-signing',
      targetState: 'approved',
      statement: 'I approve this SOP',
      password: PASSWORD,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toMatch(/\/signatures$/)
    expect((init as RequestInit).method).toBe('POST')

    const body = JSON.parse(String((init as RequestInit).body))
    expect(body).toEqual({
      subject: {
        recordId: 'DOC-DEMO-SOP',
        lifecycleId: 'document-controlled-signing',
        targetState: 'approved',
      },
      action: 'approved',
      statement: 'I approve this SOP',
      password: PASSWORD,
    })
    // The signer identity ALWAYS comes from the session user — the body must
    // never carry a signer/user id field.
    expect(body.signedBy).toBeUndefined()
    expect(body.signer).toBeUndefined()
    expect(body.userId).toBeUndefined()
    expect(body.subject.signedBy).toBeUndefined()

    expect(result).toEqual(SIG_OK)
  })

  it('returns the primary shape with revisionRef + contentHash (legacy gitCommit kept as optional)', async () => {
    const primaryResult: SignatureResult = {
      success: true,
      signatureId: 'SIG-9F8E7D6C5B4A3210',
      subject: {
        recordId: 'DOC-DEMO-SOP',
        revisionRef: { kind: 'record', type: 'record-revision', id: 'rev-003' },
        contentHash: 'sha256:a1b2c3d4e5f6',
      },
    }
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, primaryResult))

    const result: SignatureResult = await apiClient.createSignature({
      action: 'approved',
      subjectRecordId: 'DOC-DEMO-SOP',
      lifecycleId: 'document-controlled-signing',
      targetState: 'approved',
      statement: 'I approve this SOP',
      password: PASSWORD,
    })

    expect(result).toEqual(primaryResult)
    expect(result.subject.revisionRef).toEqual({ kind: 'record', type: 'record-revision', id: 'rev-003' })
    expect(result.subject.contentHash).toBe('sha256:a1b2c3d4e5f6')
    expect(result.subject.gitCommit).toBeUndefined()
  })

  it('omits optional keys (lifecycleId/targetState/statement) when absent', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, SIG_OK))

    await apiClient.createSignature({
      action: 'approved',
      subjectRecordId: 'DOC-DEMO-SOP',
      password: PASSWORD,
    })

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body))
    expect(body.subject).toEqual({ recordId: 'DOC-DEMO-SOP' })
    expect('statement' in body).toBe(false)
  })

  it('surfaces the server error contract as ApiError without catching it', async () => {
    // Real server wire shape (live-probed 2026-10-03): { error, message } with
    // NO `code` field — errors.ts fromResponse() puts the error token into the
    // ApiError message ("REAUTH_FAILED: Re-authentication failed") and leaves
    // code as HTTP_403. The client must NOT catch/convert it.
    fetchSpy.mockResolvedValueOnce(
      wireError(403, 'REAUTH_FAILED', 'Re-authentication failed'),
    )

    const err = await apiClient
      .createSignature({ action: 'approved', subjectRecordId: 'DOC-X', password: PASSWORD })
      .catch((e: unknown) => e)

    expect(ApiError.isApiError(err)).toBe(true)
    const apiErr = err as ApiError
    expect(apiErr.status).toBe(403)
    expect(apiErr.code).toBe('HTTP_403') // wire reality, not invented
    expect(apiErr.message).toContain('REAUTH_FAILED')
    expect(isReauthFailure(err)).toBe(true)
  })
})

describe('isReauthFailure', () => {
  async function errorFrom(status: number, body: unknown): Promise<unknown> {
    fetchSpy.mockResolvedValueOnce(jsonResponse(status, body))
    return apiClient
      .createSignature({ action: 'approved', subjectRecordId: 'DOC-X', password: PASSWORD })
      .catch((e: unknown) => e)
  }

  it('is true exactly for 403 REAUTH_FAILED', async () => {
    const err = await errorFrom(403, { error: 'REAUTH_FAILED', message: 'Re-authentication failed' })
    expect(isReauthFailure(err)).toBe(true)
  })

  it('is true for the spec-named shape: ApiError with code === REAUTH_FAILED', () => {
    // Covers the predicate's primary branch directly (a code-carrying error),
    // independent of the wire's current { error, message } shape.
    const err = new ApiError({ status: 403, code: 'REAUTH_FAILED', message: 'Re-authentication failed' })
    expect(isReauthFailure(err)).toBe(true)
  })

  it('is false for a 422 LIFECYCLE_TRANSITION_DENIED (plain denial, distinct reason)', async () => {
    const err = await errorFrom(422, {
      success: false,
      error: 'LIFECYCLE_TRANSITION_DENIED',
      message: 'Transition denied: signature required',
    })
    expect(ApiError.isApiError(err)).toBe(true)
    expect((err as ApiError).status).toBe(422)
    expect(isReauthFailure(err)).toBe(false)
  })

  it('is false for a 401 UNAUTHENTICATED (distinct reason)', async () => {
    const err = await errorFrom(401, {
      error: 'UNAUTHENTICATED',
      message: 'A signed-in user is required to sign',
    })
    expect((err as ApiError).status).toBe(401)
    expect(isReauthFailure(err)).toBe(false)
  })

  it('is false for non-ApiError values', () => {
    expect(isReauthFailure(null)).toBe(false)
    expect(isReauthFailure(new Error('boom'))).toBe(false)
    expect(isReauthFailure('REAUTH_FAILED')).toBe(false)
  })
})

describe('apiClient.updateRecord signatureRefs channel', () => {
  const payload = { recordId: 'DOC-DEMO-SOP', kind: 'controlled-document', state: 'approved' }

  it('puts signatureRefs at the BODY TOP LEVEL, never inside payload', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { success: true }))

    await apiClient.updateRecord('DOC-DEMO-SOP', payload, { signatureRefs: ['SIG-1'] })

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toMatch(/\/records\/DOC-DEMO-SOP$/)
    expect((init as RequestInit).method).toBe('PUT')

    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.signatureRefs).toEqual(['SIG-1'])
    expect(body.payload).toEqual(payload)
    // NOT inside the payload — that is the server's read position (RecordHandlers.ts:637-639).
    expect(body.payload.signatureRefs).toBeUndefined()
  })

  it('merges message/expectedSha at top level and keeps every absent key out of the body', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { success: true }))

    await apiClient.updateRecord('DOC-DEMO-SOP', payload, {
      signatureRefs: ['SIG-1'],
      message: 'approve',
      expectedSha: 'ae4c20e',
    })
    const withOpts = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body))
    expect(Object.keys(withOpts).sort()).toEqual(['expectedSha', 'message', 'payload', 'signatureRefs'])

    // Two-arg call (all existing callers): body byte-identical to before QMS-3 —
    // no signatureRefs key at all.
    await apiClient.updateRecord('DOC-DEMO-SOP', payload)
    const twoArg = JSON.parse(String(fetchSpy.mock.calls[1]![1]!.body))
    expect(twoArg).toEqual({ payload })
    expect('signatureRefs' in twoArg).toBe(false)
    expect('message' in twoArg).toBe(false)
    expect('expectedSha' in twoArg).toBe(false)
  })
})

describe('password containment', () => {
  it('the password appears ONLY in the /signatures request body — never in a PUT, URL, or error', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(200, SIG_OK)) // POST /signatures
      .mockResolvedValueOnce(jsonResponse(200, { success: true })) // PUT /records
      .mockResolvedValueOnce(
        // 403 reauth failure whose message must not echo the password
        jsonResponse(403, { error: 'REAUTH_FAILED', message: 'Re-authentication failed' }),
      )

    await apiClient.createSignature({ action: 'approved', subjectRecordId: 'DOC-X', password: PASSWORD })
    await apiClient.updateRecord('DOC-X', { recordId: 'DOC-X' }, { signatureRefs: [SIG_OK.signatureId] })
    const err = await apiClient
      .createSignature({ action: 'approved', subjectRecordId: 'DOC-X', password: PASSWORD })
      .catch((e: unknown) => e)

    const sweep = (v: unknown): string =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')

    for (const c of calls()) {
      if (c.url.includes('/signatures')) {
        expect(c.init.body ? String(c.init.body) : '').toContain(PASSWORD)
      } else {
        // PUT body, URL, and every header must be password-free.
        expect(c.url).not.toContain(PASSWORD)
        expect(c.init.body ? String(c.init.body) : '').not.toContain(PASSWORD)
        expect(sweep(c.init.headers)).not.toContain(PASSWORD)
      }
    }

    // The thrown error carries no password in message/details (or any field).
    expect(ApiError.isApiError(err)).toBe(true)
    const apiErr = err as ApiError
    expect(apiErr.message).not.toContain(PASSWORD)
    expect(sweep(apiErr.details)).not.toContain(PASSWORD)
    expect(sweep({ validation: apiErr.validation, lint: apiErr.lint })).not.toContain(PASSWORD)
  })
})

describe('apiClient.getValidTransitions guard metadata', () => {
  it('passes the QMS-1A `requires` object through unchanged (pass-through, no runtime change)', async () => {
    const requires = {
      signatureRequired: true,
      signatureAction: 'approved',
      differentPersonThan: 'author',
    }
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        lifecycleId: 'document-controlled-signing',
        state: 'in_review',
        transitions: [
          {
            event: 'approve',
            targetState: 'approved',
            label: 'Approve',
            role: 'reviewer',
            allowed: false,
            requires,
          },
          {
            event: 'reject',
            targetState: 'draft',
            label: 'Reject',
            role: 'reviewer',
            allowed: true,
          },
        ],
      }),
    )

    const result = await apiClient.getValidTransitions('DOC-X', 'document-controlled-signing')

    expect(result.transitions).toHaveLength(2)
    expect(result.transitions[0]!.requires).toEqual(requires)
    expect(result.transitions[0]!.requires).toBe(result.transitions[0]!.requires) // identity preserved (no re-mapping)
    expect(result.transitions[1]!.requires).toBeUndefined()
  })
})
