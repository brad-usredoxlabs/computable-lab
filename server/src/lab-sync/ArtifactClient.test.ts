/**
 * ArtifactClient tests — fake fetchImpl captures RequestInfo/init and records
 * the call sequence (same harness style as LabSyncClient.test.ts).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  ArtifactClient,
  artifactSha256,
  CHUNK_BYTES,
  MAX_ARTIFACT_BYTES,
} from './ArtifactClient.js'

const TOKEN = 'sekrit-token-9f3a'
const BASE = 'http://127.0.0.1:8787'
const ENDPOINT = `${BASE}/api/lab-sync/artifacts`

type FetchCall = { url: string; init: RequestInit }

function makeFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const merged = init ?? {}
    calls.push({ url, init: merged })
    return responder(url, merged)
  })
  return { fn: fn as unknown as typeof globalThis.fetch, calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function headersOf(init: RequestInit): Record<string, string> {
  const h = init.headers
  if (!h) throw new Error('no headers set')
  if (Array.isArray(h)) return Object.fromEntries(h)
  if (h instanceof Headers) return Object.fromEntries(h.entries())
  return { ...h }
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  expect(typeof init.body).toBe('string')
  return JSON.parse(init.body as string) as Record<string, unknown>
}

function actionOf(call: FetchCall): string {
  return String(bodyOf(call.init).action)
}

function actions(calls: FetchCall[]): string[] {
  return calls.map(actionOf)
}

/** Decoded chunk payloads, in call order: {offset, bytes}. */
function chunkPayloads(calls: FetchCall[]): Array<{ offset: number; bytes: Buffer }> {
  return calls
    .filter((c) => actionOf(c) === 'chunk')
    .map((c) => {
      const b = bodyOf(c.init)
      return {
        offset: Number(b.offset),
        bytes: Buffer.from(String(b.data_base64), 'base64'),
      }
    })
}

const ok = (): Response => json({ ok: true })

const SHA_A = 'a'.repeat(64)

function makeClient(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
  base: string = BASE,
) {
  const { fn, calls } = makeFetch(responder)
  return { client: new ArtifactClient({ baseUrl: base, token: TOKEN, fetchImpl: fn }), calls }
}

describe('constants', () => {
  it('exposes the protocol caps', () => {
    expect(MAX_ARTIFACT_BYTES).toBe(100 * 1024 * 1024)
    expect(CHUNK_BYTES).toBe(1024 * 1024)
  })
})

describe('ArtifactClient.init', () => {
  it("POSTs {action:'init', id, sample_id, size, sha256} (snake wire keys) to /api/lab-sync/artifacts with X-LAB-TOKEN", async () => {
    // Trailing slash on baseUrl must not double-slash the path.
    const { client, calls } = makeClient(ok, `${BASE}/`)

    await client.init({ id: 'art_001', sampleId: 'smp_042', size: 1234, sha256: SHA_A })

    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe(ENDPOINT)
    expect(calls[0].init.method).toBe('POST')
    expect(headersOf(calls[0].init)['X-LAB-TOKEN']).toBe(TOKEN)
    // Exact body shape: camelCase option fields map explicitly to snake wire keys.
    expect(bodyOf(calls[0].init)).toEqual({
      action: 'init',
      id: 'art_001',
      sample_id: 'smp_042',
      size: 1234,
      sha256: SHA_A,
    })
  })

  it('throws an excerpted error on non-2xx and never leaks the token, even when the server echoes config containing it', async () => {
    const { client, calls } = makeClient(() =>
      json({ error: 'bad config', echoed: { lab_token: TOKEN, baseUrl: BASE } }, 400),
    )

    const err = await client
      .init({ id: 'art_001', sampleId: 'smp_042', size: 1, sha256: SHA_A })
      .catch((e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/HTTP 400/)
    expect((err as Error).message).not.toContain(TOKEN)
    expect(calls.length).toBe(1)
  })

  it('rejects ok:false on a 2xx response', async () => {
    const { client } = makeClient(() => json({ ok: false, error: 'reservation limit reached' }))
    await expect(
      client.init({ id: 'art_001', sampleId: 'smp_042', size: 1, sha256: SHA_A }),
    ).rejects.toThrow(/ok:false/)
  })

  it('rejects an invalid artifact id before any fetch', async () => {
    const { client, calls } = makeClient(ok)
    await expect(
      client.init({ id: 'bad id!', sampleId: 'smp_042', size: 1, sha256: SHA_A }),
    ).rejects.toThrow(/invalid artifact id/)
    expect(calls.length).toBe(0)
  })

  it('rejects a size above the 100 MiB cap before any fetch', async () => {
    const { client, calls } = makeClient(ok)
    await expect(
      client.init({
        id: 'art_001',
        sampleId: 'smp_042',
        size: MAX_ARTIFACT_BYTES + 1,
        sha256: SHA_A,
      }),
    ).rejects.toThrow(/100 MiB/)
    expect(calls.length).toBe(0)
  })

  it('rejects a malformed sha256 before any fetch', async () => {
    const { client, calls } = makeClient(ok)
    for (const sha of ['ZZ' + 'a'.repeat(62), 'a'.repeat(63), 'ABCDEF' + '0'.repeat(58)]) {
      await expect(
        client.init({ id: 'art_001', sampleId: 'smp_042', size: 1, sha256: sha }),
      ).rejects.toThrow(/sha256/)
    }
    expect(calls.length).toBe(0)
  })
})

describe('ArtifactClient.chunk', () => {
  it('rejects bytes over the 1 MiB decoded cap before any fetch', async () => {
    const { client, calls } = makeClient(ok)
    await expect(
      client.chunk('art_001', 0, Buffer.alloc(CHUNK_BYTES + 1)),
    ).rejects.toThrow(/1 MiB/)
    expect(calls.length).toBe(0)
  })

  it('sends base64 data at the requested offset (exactly 1 MiB is allowed)', async () => {
    const bytes = Buffer.alloc(CHUNK_BYTES, 0x5a)
    const { client, calls } = makeClient(ok)

    await client.chunk('art_001', 1048576, bytes)

    const [payload] = chunkPayloads(calls)
    expect(payload.offset).toBe(1048576)
    expect(payload.bytes.equals(bytes)).toBe(true)
    expect(headersOf(calls[0].init)['X-LAB-TOKEN']).toBe(TOKEN)
  })
})

describe('ArtifactClient.status', () => {
  it('returns the numeric durable offset', async () => {
    const { client, calls } = makeClient(() => json({ ok: true, offset: 512 }))
    await expect(client.status('art_001')).resolves.toBe(512)
    expect(bodyOf(calls[0].init)).toEqual({ action: 'status', id: 'art_001' })
  })

  it('throws when the response is ok:true without a numeric offset', async () => {
    const { client } = makeClient(() => json({ ok: true }))
    await expect(client.status('art_001')).rejects.toThrow(/offset/)
  })
})

describe('ArtifactClient.complete', () => {
  it('throws with a bounded body excerpt on HTTP 500', async () => {
    const huge = 'kaboom-'.repeat(500) // 3500 chars — far past the excerpt cap
    const { client, calls } = makeClient(() =>
      new Response(huge, { status: 500, headers: { 'content-type': 'text/plain' } }),
    )

    const err = await client.complete('art_001').catch((e: unknown) => e as Error)
    expect((err as Error).message).toMatch(/HTTP 500/)
    expect((err as Error).message).toContain('kaboom')
    // Bounded excerpt (BODY_EXCERPT_LIMIT = 200 + message framing slack).
    expect((err as Error).message.length).toBeLessThan(350)
    expect(calls.length).toBe(1)
  })
})

describe('ArtifactClient.uploadFile', () => {
  const size = 2.5 * 1024 * 1024 // 2621440 bytes -> chunks at 0, 1MiB, 2MiB
  const bytes = Buffer.alloc(size)
  for (let i = 0; i < size; i += 1) bytes[i] = i % 251

  it('happy path: init once, chunks at 0/1048576/2097152 (third 524288 bytes), complete once, in order', async () => {
    const { client, calls } = makeClient(ok)

    await client.uploadFile('art_001', bytes)

    expect(actions(calls)).toEqual(['init', 'chunk', 'chunk', 'chunk', 'complete'])
    const payloads = chunkPayloads(calls)
    expect(payloads.map((p) => p.offset)).toEqual([0, 1048576, 2097152])
    expect(payloads[2].bytes.length).toBe(524288)
    // The reassembled stream equals the original bytes exactly.
    expect(Buffer.concat(payloads.map((p) => p.bytes)).equals(bytes)).toBe(true)
    // Every call carries the auth header.
    for (const call of calls) expect(headersOf(call.init)['X-LAB-TOKEN']).toBe(TOKEN)
  })

  it('computes sha256 client-side and puts it in the init payload', async () => {
    const { client, calls } = makeClient(ok)

    await client.uploadFile('art_001', bytes)

    const expected = createHash('sha256').update(bytes).digest('hex')
    expect(artifactSha256(bytes)).toBe(expected)
    const initBody = bodyOf(calls[0].init)
    expect(initBody.sha256).toBe(expected)
    expect(initBody.size).toBe(size)
    expect(initBody.action).toBe('init')
  })

  it('retries a failed chunk (max 3 attempts per chunk) and still completes', async () => {
    let firstChunkFailed = false
    const { client, calls } = makeClient((_url, init) => {
      const body = bodyOf(init)
      if (body.action === 'chunk' && !firstChunkFailed) {
        firstChunkFailed = true
        throw new Error('ECONNRESET simulated')
      }
      return ok()
    })

    await client.uploadFile('art_001', bytes)

    // 1 failed + 3 successful chunk calls; last action is complete.
    expect(actions(calls).filter((a) => a === 'chunk').length).toBe(4)
    expect(actions(calls).at(-1)).toBe('complete')
    // Last attempt per offset is the accepted one; reassembled == original.
    const byOffset = new Map<number, Buffer>()
    for (const p of chunkPayloads(calls)) byOffset.set(p.offset, p.bytes)
    const ordered = [...byOffset.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])
    expect(Buffer.concat(ordered).equals(bytes)).toBe(true)
  })

  it('gives up after 3 attempts on a persistently rejected chunk', async () => {
    const { client, calls } = makeClient((_url, init) => {
      if (bodyOf(init).action === 'chunk') throw new Error('ECONNRESET simulated')
      return ok()
    })

    await expect(client.uploadFile('art_001', bytes)).rejects.toThrow(/ECONNRESET/)
    expect(actions(calls).filter((a) => a === 'chunk').length).toBe(3)
    expect(actions(calls)).not.toContain('complete')
  })

  it('recovers from HTTP 409 offset_mismatch by re-querying status and resuming at the durable offset', async () => {
    let mismatchServed = false
    // Simulated durable server state: accepted bytes after the resume point.
    const serverTail: Buffer[] = []
    const { client, calls } = makeClient((_url, init) => {
      const body = bodyOf(init)
      if (body.action === 'chunk') {
        const offset = Number(body.offset)
        const data = Buffer.from(String(body.data_base64), 'base64')
        if (!mismatchServed && offset === 1048576) {
          mismatchServed = true
          return json({ error: 'offset_mismatch', expected: 512 }, 409)
        }
        // Only post-resume chunks are durably appended (pre-mismatch writes
        // were lost — that is what expected:512 reports).
        if (mismatchServed) serverTail.push(data)
        return ok()
      }
      if (body.action === 'status') return json({ ok: true, offset: 512 })
      return ok()
    })

    await client.uploadFile('art_001', bytes)

    const acts = actions(calls)
    expect(acts).toEqual(['init', 'chunk', 'chunk', 'status', 'chunk', 'chunk', 'chunk', 'complete'])
    // The durable prefix (0..512) plus everything accepted after resume must
    // reassemble to the original byte stream, with every offset contiguous.
    const reassembled = Buffer.concat([bytes.subarray(0, 512), ...serverTail])
    expect(reassembled.equals(bytes)).toBe(true)
    let cursor = 512
    const statusIdx = calls.findIndex((c) => actionOf(c) === 'status')
    const resumedChunks = calls
      .slice(statusIdx)
      .filter((c) => actionOf(c) === 'chunk')
      .map((c) => {
        const b = bodyOf(c.init)
        return { offset: Number(b.offset), bytes: Buffer.from(String(b.data_base64), 'base64') }
      })
    for (const p of resumedChunks) {
      expect(p.offset).toBe(cursor)
      cursor += p.bytes.length
    }
    expect(cursor).toBe(size)
  })

  it('rejects oversize artifacts and invalid ids before any fetch', async () => {
    const { client, calls } = makeClient(ok)
    await expect(
      client.uploadFile('art_001', Buffer.alloc(MAX_ARTIFACT_BYTES + 1)),
    ).rejects.toThrow(/100 MiB/)
    await expect(client.uploadFile('bad id!', bytes)).rejects.toThrow(/invalid artifact id/)
    expect(calls.length).toBe(0)
  })
})
