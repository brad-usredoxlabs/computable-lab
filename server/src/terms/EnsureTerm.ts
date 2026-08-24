/**
 * EnsureTerm — canonical-term minting.
 *
 * The single write gate that turns a free-text label into (or reuses) a
 * canonical `term` record. This is the deterministic identity spine: the same
 * normalized label ALWAYS maps to the SAME TERM-<slug>-<hash> id (idempotent),
 * and distinct spelling variants ("F praus"/"FPRAUS"/"f praaus") that carry the
 * same normalized alias resolve to ONE term — the resolve spine's tier-0 term
 * provider reads the same aliases to rank those variants first.
 *
 * Cross-record alias-uniqueness is enforced HERE (dedup by normalized alias
 * before mint) rather than in the scalar lint DSL, which cannot express a
 * store-wide duplicate-aliases rule.
 */

import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { localTermIdForLabel } from '../materials/termId.js';
import { normalizeAlias } from './alias.js';

export const TERM_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/term.schema.yaml';

export type TermKind =
  | 'material'
  | 'labware'
  | 'instrument'
  | 'verb'
  | 'kit'
  | 'organism'
  | 'condition'
  | 'other';

export interface TermLinkout {
  kind: 'ontology' | 'vendor' | 'action' | 'external';
  namespace?: string;
  curie?: string;
  uri?: string;
  vendor?: string;
  catalog_number?: string;
  grade?: string;
  verb?: string;
  exact?: string;
  url?: string;
  label?: string;
}

export interface EnsureTermOptions {
  /** Source of this request (ai_mention/compiler/human/import/ui). */
  source?: 'ai_mention' | 'compiler' | 'human' | 'import' | 'ui';
  /** Optional additional aliases to attach (spelling variants the author used). */
  aliases?: string[];
  linkouts?: TermLinkout[];
  domain?: string;
}

function asPayload(env: RecordEnvelope | null): Record<string, unknown> | null {
  return env?.payload && typeof env.payload === 'object' && !Array.isArray(env.payload)
    ? (env.payload as Record<string, unknown>)
    : null;
}

function payloadKinds(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const out: string[] = [];
  if (typeof payload.alias === 'string') out.push(payload.alias);
  if (Array.isArray(payload.aliases)) {
    for (const a of payload.aliases) {
      if (typeof a === 'string' && a) out.push(a);
    }
  }
  if (typeof payload.preferredLabel === 'string' && payload.preferredLabel) {
    out.push(payload.preferredLabel);
  }
  if (typeof payload.name === 'string' && payload.name) out.push(payload.name);
  return out;
}

/**
 * Ensure a canonical term exists for a label + (optional) spelling aliases.
 * Returns the existing term when one already carries that normalized alias,
 * otherwise mints a deterministic TERM-<slug>-<hash> record.
 */
export async function ensureTermForLabel(
  store: RecordStore,
  label: string,
  kind: TermKind,
  options: EnsureTermOptions = {},
): Promise<RecordEnvelope> {
  const trimmedLabel = (label ?? '').trim();
  if (!trimmedLabel) {
    throw new Error('ensureTermForLabel: label must be non-empty');
  }

  // Collect all candidate spellings: preferredLabel + any aliases, deduped by key.
  const spelled = [trimmedLabel, ...(options.aliases ?? [])]
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  const normalizedKeys = new Set(spelled.map(normalizeAlias));

  // Dedup by normalized alias across the existing term set (the F-praus fix).
  // term records carry a TermKind in payload.kind (material/organism/...), so
  // filter by SCHEMA, not by kind.
  const existing = await store.list({ schemaId: TERM_SCHEMA_ID });
  for (const env of existing) {
    const payload = asPayload(env);
    const payloadSpelled = payloadKinds(payload);
    const hits = payloadSpelled.some((s) => normalizedKeys.has(normalizeAlias(s)));
    if (hits) return env;
  }

  // No existing term — mint a deterministic id from the preferred label.
  const recordId = localTermIdForLabel(trimmedLabel);
  const alreadyMinted = await store.get(recordId);
  if (alreadyMinted) return alreadyMinted;

  const payload: Record<string, unknown> = {
    kind,
    id: recordId,
    preferredLabel: trimmedLabel,
    aliases: Array.from(new Set(
      spelled.filter((a) => normalizeAlias(a) !== normalizeAlias(trimmedLabel)),
    )),
    status: 'proposed',
    lifecycleId: 'lab-vocabulary-control',
  };
  if (options.domain) payload.domain = options.domain;
  if (options.linkouts && options.linkouts.length > 0) payload.linkouts = options.linkouts;

  const created = await store.create({
    envelope: { recordId, schemaId: TERM_SCHEMA_ID, payload, meta: { kind: 'term' } },
    message: `Mint canonical term "${trimmedLabel}" as ${recordId}`,
  });

  if (!created.success) {
    const afterFailure = await store.get(recordId);
    if (afterFailure) return afterFailure;
    throw new Error(
      created.error
        ? `Failed to mint canonical term ${recordId}: ${created.error}`
        : `Failed to mint canonical term ${recordId}`,
    );
  }
  return created.envelope as RecordEnvelope;
}