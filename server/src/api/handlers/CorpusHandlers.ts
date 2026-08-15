/**
 * CorpusHandlers — the server bridge between the SPA and the cl-appliance
 * Corpus Service (THE MOAT).
 *
 * The browser cannot reach the corpus service directly (127.0.0.1:8790 on the
 * appliance), so the SPA posts to /api/corpus/entries and this handler forwards
 * the anonymized (prompt → confirmed graph) entry to the moat. Everything is
 * best-effort: the POST never throws to the client — on failure it returns
 * `{ ok:false, error }` and on a disabled corpus `{ ok:false, error:'corpus.disabled' }`.
 *
 * Config is resolved live per-request so flipping corpus.enabled in config or
 * env (CLA_CORPUS_ENABLED / CLA_CORPUS_URL) takes effect without a restart.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/types.js';
import {
  postCorpusEntry,
  resolveCorpusConfig,
  type CorpusEntryInput,
} from '../../corpus/CorpusClient.js';

export interface CorpusHandlersOptions {
  /** Static config snapshot. Prefer `getAppConfig` so settings changes take effect live. */
  appConfig?: AppConfig;
  /** Live config accessor; called per-request. */
  getAppConfig?: () => AppConfig | undefined;
}

/**
 * The body the SPA sends. Superset of CorpusEntryInput; the handler forwards
 * it through to postCorpusEntry (which builds + anonymizes the moat body).
 */
export type SaveCorpusEntryBody = CorpusEntryInput;

export interface SaveCorpusEntryResult {
  ok: boolean;
  entryId?: string;
  deduped?: boolean;
  error?: string;
}

export function createCorpusHandlers(options: CorpusHandlersOptions = {}) {
  const getAppConfig = options.getAppConfig ?? (() => options.appConfig);

  async function saveCorpusEntry(
    request: FastifyRequest<{ Body?: SaveCorpusEntryBody }>,
    _reply: FastifyReply,
  ): Promise<SaveCorpusEntryResult> {
    const body = request.body as SaveCorpusEntryBody | undefined;
    if (!body) {
      return { ok: false, error: 'corpus.empty-body' };
    }
    const config = resolveCorpusConfig(getAppConfig()?.corpus);
    // Force the accepted-graph-only guard at the bridge too: never accept a
    // preview ghost. The client controls the payload, but we re-assert the
    // source so a stray 'event-editor preview' never poisons the moat.
    if (body.source !== 'protocol-loop' && body.source !== 'event-editor') {
      return { ok: false, error: `corpus.bad-source:${String(body.source ?? '(none)')}` };
    }
    return postCorpusEntry(body, config);
  }

  return { saveCorpusEntry };
}

export type CorpusHandlers = ReturnType<typeof createCorpusHandlers>;