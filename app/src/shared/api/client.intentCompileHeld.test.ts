/**
 * W2-8 A5 fix (C leg, client.ts part) — intentCompileFromPrompt must EXPOSE
 * the held 422 bundle instead of discarding it.
 *
 * The server deliberately HOLDS {error:'NEEDS_CLARIFICATION', outcome,
 * clarifications, localMacro, terminalArtifacts} on the 422 (OQ4(a): "held so
 * the client folds answers into the parseable macro"). request() throws on any
 * non-2xx and ApiError carries no parsed body, so the method must narrow-catch
 * THIS route only and return the bundle as a discriminated result. Every other
 * method's throw behavior stays byte-identical.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { ApiError } from './errors'

const fetchSpy = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

/** The gate's EXACT captured 422 wire body (A5c trail step 18, trimmed). */
const HELD_422_BODY = {
  error: 'NEEDS_CLARIFICATION',
  outcome: 'needs-clarification',
  clarifications: [
    { label: 'sample (gate 2025)', reason: 'unknown-noun' },
    { label: 'Lysis Solution', reason: 'unknown-noun' },
  ],
  localMacro: {
    kind: 'scientist-intent',
    version: 1,
    intentId: 'lyse-run',
    actions: [{ action: 'lyse', target: 'sample' }],
    unresolved: [{ label: 'Lysis Solution', reason: 'unknown-noun' }],
  },
  terminalArtifacts: { events: [] },
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient.intentCompileFromPrompt — held 422 bundle (W2-8 A5 C leg)', () => {
  it('422 WITH a held macro resolves to the discriminated held bundle (never throws)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(422, HELD_422_BODY))

    const res = await apiClient.intentCompileFromPrompt({
      protocolText: '1. Lyse the sample (gate 2025)\n\n2. Lyse (variant a)\n\n3. Lyse (variant b)',
      sourceProtocolId: 'CAN-protocol-1791692042751',
      answers: { 'lysis-method': 'bead-beater', lysis_variant: 'variant_a' },
    })

    expect(res).toMatchObject({
      held: true,
      error: 'NEEDS_CLARIFICATION',
      outcome: 'needs-clarification',
    })
    const held = res as Extract<typeof res, { held: true }>
    expect(held.localMacro).toMatchObject({ intentId: 'lyse-run' })
    expect(Array.isArray(held.localMacro.actions)).toBe(true)
    expect(held.terminalArtifacts).toBeDefined()
    expect(held.clarifications).toHaveLength(2)
    expect(held.clarifications![0]).toMatchObject({ label: 'sample (gate 2025)', reason: 'unknown-noun' })
  })

  it('422 WITHOUT a held macro keeps the throw path (ApiError, message NEEDS_CLARIFICATION)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(422, {
      error: 'NEEDS_CLARIFICATION',
      outcome: 'needs-clarification',
      clarifications: [{ label: 'x', reason: 'unknown-noun' }],
      terminalArtifacts: { events: [] },
    }))

    await expect(apiClient.intentCompileFromPrompt({
      protocolText: 'no macro here',
      answers: { a: 'b' },
    })).rejects.toThrow(ApiError)
  })

  it('2xx success shape is unchanged (ask arm + compiled arm)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { needsAnswers: true, axes: [] }))
    const ask = await apiClient.intentCompileFromPrompt({ protocolText: 'ask' })
    expect(ask).toMatchObject({ needsAnswers: true })

    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      outcome: 'complete',
      terminalArtifacts: { events: [] },
      localMacro: { intentId: 'ok' },
      axes: {},
    }))
    const done = await apiClient.intentCompileFromPrompt({ protocolText: 'go', answers: { a: 'b' } })
    expect(done).toMatchObject({ outcome: 'complete', localMacro: { intentId: 'ok' } })
    expect((done as { held?: boolean }).held).toBeUndefined()
  })

  it('other methods keep throwing on 422 (throw behavior byte-identical)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(422, { error: 'VALIDATION_FAILED', message: 'nope' }))
    await expect(apiClient.intentAccept({
      sourceProtocolId: 'prt-1',
      localMacro: { intentId: 'x' },
    })).rejects.toThrow(ApiError)
  })
})
