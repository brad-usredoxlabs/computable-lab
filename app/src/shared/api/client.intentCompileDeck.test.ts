/**
 * SH-QB-1 (OQ1, ADOPTED) — the client method leg: `apiClient.intentCompile`
 * gains ONE additive optional second parameter (the editor's deck plate
 * summaries, the exact DeckLabwareSummary mirror) and emits the
 * `deckLabwares` body key ONLY when it is provided.
 *
 * Pinned here (fetch-spy idiom from client.intentCompileHeld.test.ts):
 *  - no deck argument  ⇒ body keys are exactly {intent} (the key is ABSENT,
 *    never `undefined` — exactOptionalPropertyTypes discipline; every other
 *    caller of the route, including the goldens replay, stays byte-identical);
 *  - with a deck       ⇒ the plate summaries ride verbatim;
 *  - an empty deck array ⇒ no key (an empty deck carries no context);
 *  - the intent string is posted UNTOUCHED (the client is render + POST only);
 *  - the response type carries the forwarded `outcome` + `clarifications`
 *    (the loud-failure channel the handler now forwards).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'

const fetchSpy = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

const YAML = 'intentId: deck-leg\nactions:\n  - action: add_material\n    labware: plate1\n    volumeUl: 100\n'

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient.intentCompile — additive deckLabwares leg (SH-QB-1 OQ1)', () => {
  it('no deck argument: the body is EXACTLY {intent} — the deckLabwares key is absent, never undefined', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { outcome: 'complete', terminalArtifacts: { events: [] } }))

    await apiClient.intentCompile(YAML)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = bodyOf(fetchSpy.mock.calls[0]!)
    expect(Object.keys(body).sort()).toEqual(['intent'])
    expect(body.intent).toBe(YAML)
  })

  it('with deck plates: the summaries ride verbatim beside the untouched YAML', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { outcome: 'complete', terminalArtifacts: { events: [] } }))

    await apiClient.intentCompile(YAML, [
      { labwareId: 'lw-deck-plate-1', labwareType: 'plate_96', name: 'plate1' },
    ])

    const body = bodyOf(fetchSpy.mock.calls[0]!)
    expect(Object.keys(body).sort()).toEqual(['deckLabwares', 'intent'])
    expect(body.intent).toBe(YAML)
    expect(body.deckLabwares).toEqual([
      { labwareId: 'lw-deck-plate-1', labwareType: 'plate_96', name: 'plate1' },
    ])
  })

  it('an EMPTY deck array sends NO deckLabwares key (an empty deck carries no context)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { outcome: 'complete', terminalArtifacts: { events: [] } }))

    await apiClient.intentCompile(YAML, [])

    const body = bodyOf(fetchSpy.mock.calls[0]!)
    expect(Object.keys(body).sort()).toEqual(['intent'])
  })

  it('the forwarded loud-failure channel is readable: outcome + clarifications on the resolved body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      outcome: 'needs-clarification',
      terminalArtifacts: { events: [], gaps: [] },
      clarifications: [{ label: 'plate1', reason: 'unknown-noun' }],
    }))

    const res = await apiClient.intentCompile(YAML, [{ labwareId: 'lw-1', name: 'plate1' }])

    expect(res.outcome).toBe('needs-clarification')
    expect(res.clarifications).toHaveLength(1)
    expect(res.clarifications![0]).toMatchObject({ label: 'plate1', reason: 'unknown-noun' })
  })
})
