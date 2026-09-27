/**
 * LabSyncClient — HTTP client for the test-your-food.com Lab-Sync endpoints
 * (specs/lab-sync-api.md §1–§2, website side).
 *
 * Outbound code depends on IngestTransport; this class satisfies it structurally.
 *
 * Hard boundary: the token comes ONLY from options — no baked-in default.
 * Network/abort errors propagate untouched; the worker owns retry policy.
 */
import type {
  AckResult,
  EventsPage,
  IngestResult,
  IngestTransport,
  LabSyncWireEvent,
} from './types.js'

export interface LabSyncClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof globalThis.fetch
  /** Default 70_000: long-poll holds up to 60s server-side + slack. */
  timeoutMs?: number
}

/** Max body characters included in error messages (excerpt, never the token). */
const BODY_EXCERPT_LIMIT = 200

export class LabSyncClient implements IngestTransport {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly timeoutMs: number

  constructor(opts: LabSyncClientOptions) {
    // Trim trailing slash so path joins never double-slash.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
    this.timeoutMs = opts.timeoutMs ?? 70_000
  }

  /**
   * GET /lab-sync/events?cursor=N&wait=S. `wait` (0–60s) is forwarded as-is;
   * the server clamps. Omitted wait = server default 0.
   */
  async events(cursor: number, wait?: number): Promise<EventsPage> {
    const params = new URLSearchParams({ cursor: String(cursor) })
    if (wait !== undefined) params.set('wait', String(wait))
    const body = await this.request<{ ok?: boolean; events?: unknown; cursor?: unknown }>(
      'GET',
      `/lab-sync/events?${params.toString()}`,
    )
    // Ambiguity choice: ok:false is always an error, even on 2xx.
    this.assertOk(body, 'events')
    return {
      // Passthrough: empty stream returns cursor == requested cursor; defend
      // only against a missing field, never re-derive the cursor.
      events: (body.events as LabSyncWireEvent[] | undefined) ?? [],
      cursor: typeof body.cursor === 'number' ? body.cursor : cursor,
    }
  }

  /** POST /lab-sync/ack {cursor}. Monotonic server-side; safe to re-ack. */
  async ack(cursor: number): Promise<AckResult> {
    const body = await this.request<{ ok?: boolean; acked_cursor?: unknown }>(
      'POST',
      '/lab-sync/ack',
      { cursor },
    )
    // ok:false without acked_cursor (e.g. {"ok":false}) is an error, not a
    // silent AckResult with a fabricated number.
    this.assertOk(body, 'ack')
    if (typeof body.acked_cursor !== 'number') {
      throw new Error(`lab-sync ack: ok:true response missing acked_cursor: ${JSON.stringify(body)}`)
    }
    return { ok: true, acked_cursor: body.acked_cursor }
  }

  /**
   * POST /lab-sync/ingest {events}. Batch must be 1..100 per spec — enforced
   * here by rejecting empty batches before hitting the network (upper bound is
   * the caller's batching responsibility).
   */
  async ingest(events: LabSyncWireEvent[]): Promise<IngestResult> {
    if (events.length === 0) {
      throw new Error('lab-sync ingest: empty batch — spec allows 1..100 events per request')
    }
    const body = await this.request<{ ok?: boolean; applied?: unknown; duplicated?: unknown; unknown?: unknown }>(
      'POST',
      '/lab-sync/ingest',
      { events },
    )
    this.assertOk(body, 'ingest')
    return {
      ok: true,
      // Defensive normalization: ok:true with missing arrays -> [].
      applied: (body.applied as string[] | undefined) ?? [],
      duplicated: (body.duplicated as string[] | undefined) ?? [],
      unknown: (body.unknown as string[] | undefined) ?? [],
    }
  }

  // --- internals -------------------------------------------------------

  private async request<T>(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        'X-LAB-TOKEN': this.token,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    }
    if (payload !== undefined) init.body = JSON.stringify(payload)

    // Network/timeout errors intentionally propagate to the worker.
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init)

    const text = await res.text()
    let parsed: unknown = undefined
    try {
      parsed = text ? JSON.parse(text) : undefined
    } catch {
      // Non-JSON body: fall through to error path with the raw excerpt.
    }

    if (!res.ok) {
      // Excerpt only; the request token never appears in response bodies,
      // and we never interpolate request headers into messages.
      const excerpt = text.slice(0, BODY_EXCERPT_LIMIT)
      throw new Error(`lab-sync ${method} ${path} failed: HTTP ${res.status} ${excerpt}`)
    }

    return (parsed ?? {}) as T
  }

  private assertOk(body: { ok?: boolean }, endpoint: string): void {
    if (body.ok === false) {
      throw new Error(`lab-sync ${endpoint}: server returned ok:false: ${JSON.stringify(body).slice(0, BODY_EXCERPT_LIMIT)}`)
    }
  }
}
