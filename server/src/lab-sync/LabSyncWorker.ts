/**
 * LabSyncWorker — the CL-side sync loop (specs/lab-sync-api.md §7).
 *
 * Control flow mirrors scripts/fake-lab.mjs: long-poll loop, dedupe by
 * event_id, ack-after-durable-commit, immediate reconnect on empty response.
 *
 * Durability contract (spec §2 ack semantics):
 *   events received -> translate -> RecordStore create/update (each write
 *   commits to the embedded git repo) -> ack the whole page's max cursor ->
 *   persist local cursor. A crash before ack re-pulls; event_id dedupe
 *   absorbs the replay. The website ack is monotonic — double-ack is a no-op.
 *
 * Lifecycle/lease pattern follows ExecutionPoller: interval timer, restore
 * on boot, pollOnce() exposed for tests/admin. The worker is inert unless
 * config.labSync.enabled && token non-empty (never fabricate config —
 * principles §9).
 */

import { dirname } from 'node:path'
import type { AppContext } from '../server.js'
import { LabSyncClient } from './LabSyncClient.js'
import { CursorStore } from './cursor.js'
import type { InboundTranslator } from './translate/inbound.js'
import { loadMapping } from './translate/mapping.js'
import type { LabSyncMapping } from './translate/mapping.js'
import type { LabSyncConfig } from '../config/types.js'
import type { ProcessedEvent } from './types.js'

export interface LabSyncWorkerOptions {
  /** Override mapping file path (tests). Default: <APP_BASE_PATH>/config/lab-sync/mapping.yaml */
  mappingPath?: string
  /** Test seam: inject a fetch implementation into the HTTP client. */
  fetchImpl?: typeof globalThis.fetch
  /** Override cursor file path (tests). */
  cursorFile?: string
}

export interface LabSyncStatus {
  enabled: boolean
  running: boolean
  baseUrl?: string
  cursor: number
  ackedAt?: string
  lastPollAt?: string
  lastPollSummary?: Record<string, unknown>
  lastError?: string
  errorStreak: number
}

export interface PollSummary {
  fetched: number
  applied: number
  duplicated: number
  unknownType: number
  ignoredStale: number
  errors: Array<{ eventId: string; error: string }>
  ackedCursor?: number
}

export function isLabSyncConfigured(cfg: LabSyncConfig | undefined): boolean {
  return Boolean(cfg?.enabled === true && typeof cfg.token === 'string' && cfg.token.trim().length > 0 && cfg.baseUrl)
}

export class LabSyncWorker {
  private readonly ctx: AppContext
  private readonly config: LabSyncConfig
  private readonly options: LabSyncWorkerOptions
  private readonly cursorStore: CursorStore
  private readonly client: LabSyncClient
  private translator: InboundTranslator | null = null
  private mapping: LabSyncMapping | null = null
  private timer: NodeJS.Timeout | null = null
  private inFlight: Promise<PollSummary> | null = null
  private looping = false
  private errorStreak = 0
  private lastError: string | undefined
  private lastPollAt: string | undefined
  private lastPollSummary: PollSummary | undefined

  constructor(ctx: AppContext, config: LabSyncConfig, options: LabSyncWorkerOptions = {}) {
    this.ctx = ctx
    this.config = config
    this.options = options
    // Cursor is machinery state -> var/ (not git records). See cursor.ts.
    const dataDir = ctx.dataDir || process.cwd()
    this.cursorStore = new CursorStore(options.cursorFile ?? `${dataDir}/var/lab-sync/cursor.json`)
    this.client = new LabSyncClient({
      baseUrl: config.baseUrl!,
      token: config.token!,
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    })
  }

  /** Lazy load mapping + translator so boot stays cheap and mapping edits are picked up on restart. */
  private async ensureTranslator(): Promise<InboundTranslator> {
    if (this.translator) return this.translator
    // mapping.yaml sits beside config.yaml (monorepo root / APP_BASE_PATH).
    const baseDir = this.ctx.configPath ? dirname(this.ctx.configPath) : process.cwd()
    const mappingPath = this.options.mappingPath ?? `${baseDir}/config/lab-sync/mapping.yaml`
    this.mapping = await loadMapping(mappingPath)
    // Dynamic import avoided: explicit dependency keeps tsc honest.
    const { InboundTranslator: Translator } = await import('./translate/inbound.js')
    this.translator = new Translator({
      store: this.ctx.store,
      mapping: this.mapping,
      now: () => new Date(),
    })
    return this.translator
  }

  /**
   * One full cycle: pull -> translate each event (durable commit per record
   * write happens inside RecordStore) -> ack -> persist cursor.
   */
  async pollOnce(): Promise<PollSummary> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.pollOnceInner().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async pollOnceInner(): Promise<PollSummary> {
    const translator = await this.ensureTranslator()
    const state = await this.cursorStore.load()
    const wait = this.config.longPollWaitSeconds ?? 30
    const page = await this.client.events(state.cursor, wait)
    this.lastPollAt = new Date().toISOString()

    const summary: PollSummary = {
      fetched: page.events.length,
      applied: 0,
      duplicated: 0,
      unknownType: 0,
      ignoredStale: 0,
      errors: [],
    }

    for (const event of page.events) {
      let result: ProcessedEvent
      try {
        result = await translator.process(event)
      } catch (err) {
        // Translation failure: do NOT ack past an event we could not durably
        // record. Stop the page here; retry from the same cursor next poll.
        summary.errors.push({ eventId: event.event_id, error: err instanceof Error ? err.message : String(err) })
        break
      }
      switch (result.status) {
        case 'applied': summary.applied++; break
        case 'duplicated': summary.duplicated++; break
        case 'unknown_type': summary.unknownType++; break
        case 'ignored_stale': summary.ignoredStale++; break
      }
    }

    // Ack only when the whole page was durably handled. If a mid-page error
    // occurred, only ack the contiguous prefix — computed via the translator's
    // own durable mirror records: every event BEFORE the failing one has a
    // lab-sync-event mirror. Simplest defensible rule: ack only a fully
    // successful page; the failing event's earlier siblings get re-pulled and
    // dedupe handles them. (logged choice: prefix-ack tracking would need the
    // translator to report per-index; dedupe makes full-page retry cheap.)
    if (summary.errors.length === 0 && page.events.length > 0) {
      const maxCursor = Math.max(...page.events.map(e => e.cursor ?? 0))
      if (maxCursor > state.cursor) {
        const ack = await this.client.ack(maxCursor)
        await this.cursorStore.save(ack.acked_cursor ?? maxCursor, new Date().toISOString())
        summary.ackedCursor = ack.acked_cursor ?? maxCursor
      }
    } else if (page.events.length === 0 && page.cursor > state.cursor) {
      // Server-side cursor advance with no events (should not happen per spec;
      // spec says client must not jump ahead — never advance on empty).
      this.lastError = `server returned cursor ${page.cursor} beyond local ${state.cursor} with no events; ignoring`
    }

    if (summary.errors.length > 0) {
      this.errorStreak++
      this.lastError = summary.errors.map(e => `${e.eventId}: ${e.error}`).join('; ')
    } else {
      this.errorStreak = 0
      this.lastError = undefined
    }
    this.lastPollSummary = summary
    return summary
  }

  /** Push CL->website pending outbound events (spec §3 batch, retry-safe). */
  async pushOutbound(): Promise<{ pushed: string[]; failed: string[] }> {
    const { OutboundPusher } = await import('./outbound/push.js')
    const pusher = new OutboundPusher({ store: this.ctx.store, transport: this.client })
    return pusher.pushPending()
  }

  async start(): Promise<void> {
    if (this.timer) return
    this.looping = true
    const intervalMs = Math.max(5, this.config.pollSeconds ?? 30) * 1000
    const tick = () => {
      if (!this.looping) return
      void this.cycle()
    }
    // Fire immediately, then on interval.
    void this.cycle()
    this.timer = setInterval(tick, intervalMs)
    this.timer.unref?.()
  }

  private async cycle(): Promise<void> {
    while (this.looping) {
      try {
        await this.pollOnce()
        await this.pushOutbound().catch(() => undefined)
        return
      } catch (err) {
        this.errorStreak++
        this.lastError = err instanceof Error ? err.message : String(err)
        // Immediate reconnect per spec §7, bounded by the interval timer.
        return
      }
    }
  }

  async stop(): Promise<void> {
    this.looping = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.inFlight) await this.inFlight.catch(() => undefined)
  }

  async status(): Promise<LabSyncStatus> {
    const cursorState = await this.cursorStore.load()
    return {
      enabled: isLabSyncConfigured(this.config),
      running: this.timer !== null,
      ...(this.config.baseUrl !== undefined ? { baseUrl: this.config.baseUrl } : {}),
      cursor: cursorState.cursor,
      ...(cursorState.ackedAt !== undefined ? { ackedAt: cursorState.ackedAt } : {}),
      ...(this.lastPollAt !== undefined ? { lastPollAt: this.lastPollAt } : {}),
      ...(this.lastPollSummary !== undefined ? { lastPollSummary: this.lastPollSummary as unknown as Record<string, unknown> } : {}),
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
      errorStreak: this.errorStreak,
    }
  }
}
