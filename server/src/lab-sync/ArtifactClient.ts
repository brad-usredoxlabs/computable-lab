/**
 * ArtifactClient — resumable chunked upload client for the
 * test-your-food.com POST /api/lab-sync/artifacts protocol (customer-handoff
 * spec, website side).
 *
 * Wire bodies are discriminated by 'action' (init | status | chunk | complete)
 * and use snake_case keys; the TypeScript surface stays camelCase with
 * explicit mapping at the boundary (same discipline as translate/inbound.ts).
 *
 * Hard boundary: the token comes ONLY from options — no baked-in default.
 * Error messages carry a bounded response-body excerpt and never the token.
 */
import { createHash } from 'node:crypto'

export interface ArtifactClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof globalThis.fetch
}

/** Website cap: max 100 MiB per artifact. */
export const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024

/** Website cap: max 1 MiB of decoded data per chunk call. */
export const CHUNK_BYTES = 1024 * 1024

/** Attempts per chunk before giving up (retry of matching bytes is safe). */
const CHUNK_ATTEMPTS = 3

/** Max body characters included in error messages (excerpt, never the token). */
const BODY_EXCERPT_LIMIT = 200

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/

/**
 * Upload-specific failure. `status` is the HTTP status (when the server
 * answered); `offsetMismatch` carries the server's durable `expected` offset
 * from an HTTP 409 offset_mismatch so uploadFile can resume from it.
 */
export class ArtifactUploadError extends Error {
  readonly status?: number
  readonly offsetMismatch?: number

  constructor(message: string, detail?: { status?: number; offsetMismatch?: number }) {
    super(message)
    this.name = 'ArtifactUploadError'
    if (detail?.status !== undefined) this.status = detail.status
    if (detail?.offsetMismatch !== undefined) this.offsetMismatch = detail.offsetMismatch
  }
}

/** Canonical sha256 hex used for the init reservation and complete check. */
export function artifactSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export class ArtifactClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(opts: ArtifactClientOptions) {
    // Trim trailing slash so path joins never double-slash.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
  }

  /**
   * {action:'init'} creates an immutable upload reservation. Retrying an
   * identical init is safe (server returns 200 again).
   */
  async init(a: { id: string; sampleId: string; size: number; sha256: string }): Promise<void> {
    assertArtifactId(a.id)
    if (a.size > MAX_ARTIFACT_BYTES) {
      throw new Error(
        `artifact init: size ${a.size} exceeds the ${MAX_ARTIFACT_BYTES} byte (100 MiB) artifact cap`,
      )
    }
    if (!SHA256_PATTERN.test(a.sha256)) {
      throw new Error(`artifact init: sha256 must be 64 lowercase hex chars, got "${a.sha256}"`)
    }
    // Explicit camelCase -> snake_case wire mapping (no spread of option fields).
    await this.request('init', {
      action: 'init',
      id: a.id,
      sample_id: a.sampleId,
      size: a.size,
      sha256: a.sha256,
    })
  }

  /** {action:'status'} -> the server's durable byte offset. */
  async status(id: string): Promise<number> {
    assertArtifactId(id)
    const body = await this.request('status', { action: 'status', id })
    if (typeof body.offset !== 'number') {
      throw new Error(
        `artifact status: ok:true response missing numeric offset: ${excerpt(body)}`,
      )
    }
    return body.offset
  }

  /**
   * {action:'chunk'} appends decoded bytes at `offset`. A mismatched offset
   * surfaces as an ArtifactUploadError with status 409 and offsetMismatch set.
   */
  async chunk(id: string, offset: number, bytes: Buffer): Promise<void> {
    assertArtifactId(id)
    if (bytes.length > CHUNK_BYTES) {
      throw new Error(
        `artifact chunk: ${bytes.length} bytes exceeds the ${CHUNK_BYTES} byte (1 MiB) decoded chunk cap`,
      )
    }
    await this.request('chunk', {
      action: 'chunk',
      id,
      offset,
      data_base64: bytes.toString('base64'),
    })
  }

  /** {action:'complete'} — server validates exact size + sha256. */
  async complete(id: string): Promise<void> {
    assertArtifactId(id)
    await this.request('complete', { action: 'complete', id })
  }

  /**
   * Full resumable upload: validate -> hash -> init -> CHUNK_BYTES slices
   * from offset 0. Each chunk gets up to CHUNK_ATTEMPTS attempts; a 409
   * offset_mismatch re-queries status and resumes at the durable offset;
   * finish with complete().
   */
  async uploadFile(id: string, bytes: Buffer): Promise<void> {
    assertArtifactId(id)
    if (bytes.length > MAX_ARTIFACT_BYTES) {
      throw new Error(
        `artifact upload: ${bytes.length} bytes exceeds the ${MAX_ARTIFACT_BYTES} byte (100 MiB) artifact cap`,
      )
    }
    const sha256 = artifactSha256(bytes)
    // sample_id is part of the reservation wire contract; uploadFile has no
    // sample context, so it reserves with an empty sample binding. Callers
    // that know the sample pass it through init() directly.
    await this.init({ id, sampleId: '', size: bytes.length, sha256 })

    let offset = 0
    while (offset < bytes.length) {
      let attempts = 0
      for (;;) {
        // Re-slice every attempt: a 409 resume moves the cursor, so the
        // payload must always start at the current durable offset.
        const slice = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length))
        attempts += 1
        try {
          await this.chunk(id, offset, Buffer.from(slice))
          offset += slice.length
          break
        } catch (err) {
          if (err instanceof ArtifactUploadError && err.offsetMismatch !== undefined) {
            // Server rejected our offset: re-query the durable offset via
            // status and resume there (fresh answer beats the 409's expected).
            offset = await this.status(id)
            attempts = 0
            continue
          }
          if (attempts >= CHUNK_ATTEMPTS) throw err
          // Retry the same chunk: re-sending matching bytes is safe per spec.
        }
      }
    }
    await this.complete(id)
  }

  // --- internals -------------------------------------------------------

  private async request(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'X-LAB-TOKEN': this.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }

    // Network errors intentionally propagate to the caller (retry policy in
    // uploadFile / the worker).
    const res = await this.fetchImpl(`${this.baseUrl}/api/lab-sync/artifacts`, init)

    const text = await res.text()
    let parsed: Record<string, unknown> | undefined
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : undefined
    } catch {
      // Non-JSON body: fall through to the error path with the raw excerpt.
    }

    if (!res.ok) {
      // Excerpt only; we never interpolate request headers into messages, so
      // even a server body echoing config cannot smuggle our token outward
      // through this error path... unless the echo contains the token value
      // itself — scrub defensively.
      const excerptText = scrubToken(text.slice(0, BODY_EXCERPT_LIMIT), this.token)
      if (res.status === 409 && parsed?.error === 'offset_mismatch' && typeof parsed.expected === 'number') {
        throw new ArtifactUploadError(
          `artifact ${action} failed: HTTP 409 offset_mismatch expected=${parsed.expected}`,
          { status: 409, offsetMismatch: parsed.expected },
        )
      }
      throw new ArtifactUploadError(`artifact ${action} failed: HTTP ${res.status} ${excerptText}`, {
        status: res.status,
      })
    }

    const body = parsed ?? {}
    if (body.ok === false) {
      throw new ArtifactUploadError(
        `artifact ${action}: server returned ok:false: ${excerpt(body, this.token)}`,
      )
    }
    return body
  }
}

// --- helpers ---------------------------------------------------------

function assertArtifactId(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `invalid artifact id "${id}": must match [A-Za-z0-9_-]{1,64}`,
    )
  }
}

/** Bounded, token-scrubbed body excerpt for error messages. */
function excerpt(value: unknown, token?: string): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  return scrubToken(text.slice(0, BODY_EXCERPT_LIMIT), token ?? '')
}

/** Defense-in-depth: a server-echoed config body must never leak our token. */
function scrubToken(text: string, token: string): string {
  if (!token) return text
  // Slice before replacing so an injected replacement can't forge the marker.
  return text.split(token).join('[redacted]').slice(0, BODY_EXCERPT_LIMIT + 32)
}
