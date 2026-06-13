/**
 * Background KV-context warmer ("compiled contexts").
 *
 * When the event graph changes (Accept, debounced edits), this manager sends
 * a 1-token chat completion containing the stable prompt prefix to
 * llama-server so the prefix lands in the server's prompt cache while the
 * GPU is otherwise idle. The user's next draft request then only pays
 * prefill for its suffix (history + volatile editor state + prompt).
 *
 * With slot persistence enabled (server started with --slot-save-path), each
 * successful warm is also saved to NVMe and restored at boot, so compiled
 * contexts survive llama-server restarts.
 *
 * Every failure path here is swallowed and logged: warming is an
 * optimization and must never affect the interactive request path.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

import type { CompletionRequest, InferenceClient } from '../types.js';
import type { LlamaCacheClient } from './LlamaCacheClient.js';
import type { InferenceActivityTracker } from './InferenceActivityTracker.js';

export interface WarmupSettings {
  enabled: boolean;
  /** Quiet period after the last graph mutation before a warm fires. */
  debounceMs: number;
  /** Persist warmed contexts via the llama.cpp /slots API. */
  slotPersistence: boolean;
  /** Server slot pinned for warms when slotPersistence is on. */
  warmSlotId: number;
  /** Max persisted compiled contexts in the manifest. */
  maxLibraryEntries: number;
  /** Path of the JSON manifest tracking persisted contexts. */
  manifestPath: string;
}

/** The template-relevant prefix of a request: messages plus tool surface. */
export type WarmPrefix = Pick<CompletionRequest, 'messages' | 'tools' | 'tool_choice'>;

export interface WarmTarget {
  /** Stable identity for debouncing/dedup, e.g. `run:RUN-123`. */
  key: string;
  /**
   * Build the request prefix to warm — [system, ...history] AND the tool
   * definitions (the chat template renders tools into the prompt, so they are
   * prefix-relevant). Called lazily at fire time so the freshest graph state
   * is rendered.
   */
  buildPrefix(): Promise<WarmPrefix> | WarmPrefix;
}

export interface WarmupStats {
  warms: number;
  skippedUnchanged: number;
  deferrals: number;
  failures: number;
  lastWarm?: { key: string; promptTokens?: number; cachedTokens?: number; ms?: number };
}

/**
 * Per-key warm lifecycle, exposed so the UI can show a prefill indicator.
 *   disabled — warming is off (no indicator)
 *   idle     — key never warmed this process
 *   pending  — debounce window open or deferred behind interactive traffic
 *   warming  — prefill request in flight on the GPU
 *   warmed   — prefix is in the KV cache (token counts from the last warm)
 *   failed   — last attempt errored or gave up deferring
 */
export type WarmKeyState = 'disabled' | 'idle' | 'pending' | 'warming' | 'warmed' | 'failed';

export interface WarmKeyStatus {
  state: WarmKeyState;
  promptTokens?: number;
  cachedTokens?: number;
  ms?: number;
  warmedAt?: string;
}

interface ManifestEntry {
  key: string;
  promptHash: string;
  filename: string;
  tokenCount?: number;
  savedAt: string;
  /**
   * The full warmed prefix. Needed at boot: the server's cache_key→slot
   * binding is in-memory, so after restoring the slot file we re-send this
   * prefix (pinned to the warm slot) to re-bind the key. The restored KV
   * makes that re-bind near-free; if the restore failed it degrades to a
   * full re-prefill on the idle GPU.
   */
  prefix?: WarmPrefix;
}

export interface PromptWarmupManager {
  /** Debounced warm request; safe to call from any request handler. */
  requestWarm(target: WarmTarget): void;
  /** Immediate warm (boot path); resolves when done. Never throws. */
  warmNow(target: WarmTarget): Promise<void>;
  /** Restore persisted compiled contexts after a server restart. */
  restoreLibraryAtBoot(): Promise<void>;
  /** Lifecycle of one cache key — drives the UI's prefill indicator. */
  status(key: string): WarmKeyStatus;
  stats(): WarmupStats;
}

interface Deps {
  /** RAW client (not activity-tracked) — warms must not defer themselves. */
  inferenceClient: InferenceClient;
  cacheClient?: LlamaCacheClient | undefined;
  tracker: InferenceActivityTracker;
  model: string;
  settings: WarmupSettings;
  log?: (level: 'info' | 'warn', message: string) => void;
}

const DEFER_RETRY_MS = 1000;
const MAX_DEFER_RETRIES = 30;

export function createPromptWarmupManager(deps: Deps): PromptWarmupManager {
  const { inferenceClient, cacheClient, tracker, model, settings } = deps;
  const log = deps.log ?? ((level, message) => console[level === 'warn' ? 'warn' : 'log'](message));

  const timers = new Map<string, NodeJS.Timeout>();
  const lastWarmedHash = new Map<string, string>();
  const inFlightKeys = new Set<string>();
  const supersededKeys = new Map<string, WarmTarget>();
  const keyStatus = new Map<string, WarmKeyStatus>();
  const stats: WarmupStats = { warms: 0, skippedUnchanged: 0, deferrals: 0, failures: 0 };

  function setStatus(key: string, status: WarmKeyStatus): void {
    keyStatus.set(key, status);
  }

  function markWarmed(key: string, timings: { prompt_n?: number; cache_n?: number }, ms?: number): void {
    setStatus(key, {
      state: 'warmed',
      ...(timings.prompt_n != null ? { promptTokens: timings.prompt_n } : {}),
      ...(timings.cache_n != null ? { cachedTokens: timings.cache_n } : {}),
      ...(ms != null ? { ms } : {}),
      warmedAt: new Date().toISOString(),
    });
  }

  function hashPrefix(prefix: WarmPrefix): string {
    return createHash('sha256').update(model).update(JSON.stringify(prefix)).digest('hex');
  }

  async function readManifest(): Promise<ManifestEntry[]> {
    try {
      const raw = await fs.readFile(settings.manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as ManifestEntry[]) : [];
    } catch {
      return [];
    }
  }

  async function writeManifest(entries: ManifestEntry[]): Promise<void> {
    await fs.mkdir(dirname(settings.manifestPath), { recursive: true });
    await fs.writeFile(settings.manifestPath, JSON.stringify(entries, null, 2), 'utf8');
  }

  async function persistWarmedSlot(
    key: string,
    promptHash: string,
    prefix: WarmPrefix,
    tokenCount?: number,
  ): Promise<void> {
    if (!settings.slotPersistence || !cacheClient) return;
    const filename = `ctx-${promptHash.slice(0, 24)}.bin`;
    await cacheClient.saveSlot(settings.warmSlotId, filename);
    const entries = (await readManifest()).filter((e) => e.key !== key);
    const entry: ManifestEntry = { key, promptHash, filename, savedAt: new Date().toISOString(), prefix };
    if (tokenCount != null) entry.tokenCount = tokenCount;
    entries.unshift(entry);
    await writeManifest(entries.slice(0, settings.maxLibraryEntries));
    log('info', `[warm ${key}] saved compiled context ${filename}`);
  }

  async function executeWarm(target: WarmTarget, deferrals = 0): Promise<void> {
    const { key } = target;
    if (inFlightKeys.has(key)) {
      supersededKeys.set(key, target);
      return;
    }

    if (tracker.inFlight() > 0) {
      stats.deferrals += 1;
      if (deferrals >= MAX_DEFER_RETRIES) {
        log('warn', `[warm ${key}] gave up after ${deferrals} deferrals (interactive traffic)`);
        setStatus(key, { state: 'failed' });
        return;
      }
      setStatus(key, { state: 'pending' });
      const timer = setTimeout(() => {
        void executeWarm(target, deferrals + 1);
      }, DEFER_RETRY_MS);
      timer.unref?.();
      return;
    }

    inFlightKeys.add(key);
    // Carry the previous warm's numbers through the transition so a
    // skipped-unchanged pass can report them again.
    const prior = keyStatus.get(key);
    setStatus(key, { ...(prior?.state === 'warmed' ? prior : {}), state: 'warming' });
    try {
      const prefix = await target.buildPrefix();
      const promptHash = hashPrefix(prefix);
      if (lastWarmedHash.get(key) === promptHash) {
        stats.skippedUnchanged += 1;
        // Already in cache under this exact hash — keep the previous warm's
        // numbers when we have them, otherwise just report warmed.
        const previous = keyStatus.get(key);
        if (previous?.promptTokens != null || previous?.warmedAt) {
          setStatus(key, { ...previous, state: 'warmed' });
        } else {
          markWarmed(key, {});
        }
        return;
      }

      const t0 = Date.now();
      const response = await inferenceClient.complete({
        model,
        ...prefix,
        max_tokens: 1,
        temperature: 0,
        cache_prompt: true,
        // Bind this context's identity to the slot that processes the warm;
        // the real request carries the same cache_key and gets routed back to
        // it (in-slot KV reuse, no dependence on LRU/similarity selection).
        cache_key: key,
        ...(settings.slotPersistence ? { id_slot: settings.warmSlotId } : {}),
      });
      const ms = Date.now() - t0;
      const timings = response.timings ?? {};
      lastWarmedHash.set(key, promptHash);
      markWarmed(key, timings, ms);
      stats.warms += 1;
      stats.lastWarm = { key };
      if (timings.prompt_n != null) stats.lastWarm.promptTokens = timings.prompt_n;
      if (timings.cache_n != null) stats.lastWarm.cachedTokens = timings.cache_n;
      stats.lastWarm.ms = ms;
      log(
        'info',
        `[warm ${key}] prefilled ${timings.prompt_n ?? '?'} tokens ` +
          `(${timings.cache_n ?? '?'} cached) in ${ms}ms`,
      );

      try {
        await persistWarmedSlot(key, promptHash, prefix, timings.prompt_n);
      } catch (err) {
        log('warn', `[warm ${key}] slot save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      stats.failures += 1;
      setStatus(key, { state: 'failed' });
      // Include the top of the stack: "undefined.map" style errors from a
      // prefix builder are unfindable from the message alone.
      const detail =
        err instanceof Error && err.stack
          ? err.stack.split('\n').slice(0, 4).join(' | ')
          : String(err);
      log('warn', `[warm ${key}] failed: ${detail}`);
    } finally {
      inFlightKeys.delete(key);
      const superseded = supersededKeys.get(key);
      if (superseded) {
        supersededKeys.delete(key);
        void executeWarm(superseded);
      }
    }
  }

  return {
    requestWarm(target: WarmTarget): void {
      if (!settings.enabled) return;
      const existing = timers.get(target.key);
      if (existing) clearTimeout(existing);
      // Don't demote a live 'warming' — the in-flight pass will pick up the
      // superseding target in its finally block.
      if (keyStatus.get(target.key)?.state !== 'warming') {
        setStatus(target.key, { state: 'pending' });
      }
      const timer = setTimeout(() => {
        timers.delete(target.key);
        void executeWarm(target);
      }, settings.debounceMs);
      timer.unref?.();
      timers.set(target.key, timer);
    },

    async warmNow(target: WarmTarget): Promise<void> {
      if (!settings.enabled) return;
      await executeWarm(target);
    },

    async restoreLibraryAtBoot(): Promise<void> {
      if (!settings.enabled || !settings.slotPersistence || !cacheClient) return;
      try {
        if (!(await cacheClient.isAvailable())) {
          log('warn', '[warm] slot persistence configured but llama-server has no --slot-save-path; skipping restore');
          return;
        }
        // Re-prefill the newest compiled context from its stored prefix
        // rather than /slots-restoring the KV file: measured on the
        // TurboQuant fork, file-restored state serves exact continuations
        // but cannot be truncated at a divergence point — the first real
        // (diverging) request silently re-prefills everything anyway. A
        // fresh prefill on the idle GPU at boot (~45s for 37k tokens) yields
        // normal, truncatable KV plus the in-memory cache_key binding. The
        // .bin files remain on disk for exact-match restore flows.
        const entries = await readManifest();
        const newest = entries[0];
        if (!newest?.prefix) return;
        const t0 = Date.now();
        const response = await inferenceClient.complete({
          model,
          ...newest.prefix,
          max_tokens: 1,
          temperature: 0,
          cache_prompt: true,
          cache_key: newest.key,
        });
        const timings = response.timings ?? {};
        lastWarmedHash.set(newest.key, newest.promptHash);
        markWarmed(newest.key, timings, Date.now() - t0);
        log(
          'info',
          `[warm ${newest.key}] re-prefilled after boot: ${timings.prompt_n ?? '?'} tokens ` +
            `(${timings.cache_n ?? '?'} cached) in ${Date.now() - t0}ms`,
        );
      } catch (err) {
        log('warn', `[warm] boot restore failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    status(key: string): WarmKeyStatus {
      if (!settings.enabled) return { state: 'disabled' };
      return keyStatus.get(key) ?? { state: 'idle' };
    },

    stats: () => ({ ...stats }),
  };
}
