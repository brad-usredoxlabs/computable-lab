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

import type { ChatMessage, InferenceClient } from '../types.js';
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

export interface WarmTarget {
  /** Stable identity for debouncing/dedup, e.g. `run:RUN-123`. */
  key: string;
  /**
   * Build the message prefix to warm — [system, ...history]. Called lazily at
   * fire time so the freshest graph state is rendered.
   */
  buildMessages(): Promise<ChatMessage[]> | ChatMessage[];
}

export interface WarmupStats {
  warms: number;
  skippedUnchanged: number;
  deferrals: number;
  failures: number;
  lastWarm?: { key: string; promptTokens?: number; cachedTokens?: number; ms?: number };
}

interface ManifestEntry {
  key: string;
  promptHash: string;
  filename: string;
  tokenCount?: number;
  savedAt: string;
}

export interface PromptWarmupManager {
  /** Debounced warm request; safe to call from any request handler. */
  requestWarm(target: WarmTarget): void;
  /** Immediate warm (boot path); resolves when done. Never throws. */
  warmNow(target: WarmTarget): Promise<void>;
  /** Restore persisted compiled contexts after a server restart. */
  restoreLibraryAtBoot(): Promise<void>;
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
  const stats: WarmupStats = { warms: 0, skippedUnchanged: 0, deferrals: 0, failures: 0 };

  function hashMessages(messages: ChatMessage[]): string {
    return createHash('sha256').update(model).update(JSON.stringify(messages)).digest('hex');
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

  async function persistWarmedSlot(key: string, promptHash: string, tokenCount?: number): Promise<void> {
    if (!settings.slotPersistence || !cacheClient) return;
    const filename = `ctx-${promptHash.slice(0, 24)}.bin`;
    await cacheClient.saveSlot(settings.warmSlotId, filename);
    const entries = (await readManifest()).filter((e) => e.key !== key);
    const entry: ManifestEntry = { key, promptHash, filename, savedAt: new Date().toISOString() };
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
        return;
      }
      const timer = setTimeout(() => {
        void executeWarm(target, deferrals + 1);
      }, DEFER_RETRY_MS);
      timer.unref?.();
      return;
    }

    inFlightKeys.add(key);
    try {
      const messages = await target.buildMessages();
      const promptHash = hashMessages(messages);
      if (lastWarmedHash.get(key) === promptHash) {
        stats.skippedUnchanged += 1;
        return;
      }

      const t0 = Date.now();
      const response = await inferenceClient.complete({
        model,
        messages,
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
        await persistWarmedSlot(key, promptHash, timings.prompt_n);
      } catch (err) {
        log('warn', `[warm ${key}] slot save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      stats.failures += 1;
      log('warn', `[warm ${key}] failed: ${err instanceof Error ? err.message : String(err)}`);
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
        const entries = await readManifest();
        for (const entry of entries) {
          try {
            const result = await cacheClient.restoreSlot(settings.warmSlotId, entry.filename);
            lastWarmedHash.set(entry.key, entry.promptHash);
            log('info', `[warm ${entry.key}] restored ${entry.filename} (${result.n_restored ?? '?'} tokens)`);
          } catch (err) {
            log('warn', `[warm ${entry.key}] restore failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        log('warn', `[warm] boot restore failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    stats: () => ({ ...stats }),
  };
}
