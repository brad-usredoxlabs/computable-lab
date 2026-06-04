/**
 * Auto-bind ontology-CURIE material mentions to local material records.
 *
 * The AI dock's slash menu (Phase 1d) and the inline ontology copilot
 * (Phase 1e) insert material mentions whose `id` is an ontology CURIE
 * (e.g. `[[material:CHEBI:5001|fenofibrate]]`). Downstream code — the
 * compiler, the deck ghost renderer, the persist flow — all assume a
 * material's `recordId` is a real workspace record (e.g. `MAT-…`), so a raw
 * CURIE id silently fails to ghost.
 *
 * This module intercepts those mentions ONCE inside `runChatbotCompile`. It
 * rewrites a CURIE to an existing local material when one already carries that
 * class ref or matching name. New terms can either be minted immediately
 * (legacy/default behavior) or left draft-only so acceptance of the final graph
 * is the point where local vocabulary is created.
 *
 * Dedup order: existing material whose class[] already carries the CURIE →
 * existing material with the same name (Phase 1f modal parity) → draft-only or
 * mint a new concept material, depending on caller policy.
 */

import type { PromptMention } from '../promptMentions.js';
import type { RecordStore } from '../../store/types.js';
import { createRecord, token, SCHEMA_IDS } from '../../api/handlers/MaterialLifecycleHandlers.js';

export interface OntologyMentionBinding {
  /** The CURIE that triggered the bind. */
  curie: string;
  /** The local recordId now used by the rewritten mention. */
  recordId: string;
  /** True when a new material was minted; false when an existing one was reused. */
  minted: boolean;
  /** Why this bound: classified by this CURIE, or matched by name. */
  via: 'class-ref' | 'name';
  /** Human-readable label for log/note rendering. */
  label: string;
  /** Lifecycle governing a newly-proposed local vocabulary/material record. */
  lifecycleId?: 'lab-vocabulary-control';
  /** Current local vocabulary/material lifecycle state. */
  state?: 'proposed' | 'in_review' | 'active' | 'rejected' | 'deprecated';
  /** True when this binding needs human or policy review before active use. */
  requiresReview?: boolean;
  /** True when the CURIE remains draft-only and was not written to local records. */
  draftOnly?: boolean;
}

export interface BindOntologyMentionsResult {
  mentions: PromptMention[];
  /**
   * The prompt text with any rewritten CURIE ids substituted in-place inside
   * `[[material:…|label]]` tokens. Returned even when no rewrites occurred so
   * callers can unconditionally use this as the effective prompt. Undefined
   * when the caller did not provide a prompt.
   */
  prompt?: string;
  bindings: OntologyMentionBinding[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteMentionIdsInPrompt(
  prompt: string,
  rewrites: Map<string, string>,
): string {
  let out = prompt;
  for (const [from, to] of rewrites) {
    const re = new RegExp(`\\[\\[material:${escapeRegex(from)}\\|`, 'g');
    out = out.replace(re, `[[material:${to}|`);
  }
  return out;
}

/**
 * Conservative CURIE shape: uppercase prefix followed by `:`. Excludes local
 * record-id prefixes (MAT-, MINST-, ALQ-, VP-, LW-, LBW-) which contain a `-`
 * not `:`, but stay defensive in case any callers send them.
 */
const LOCAL_ID_PREFIXES = /^(MAT|MINST|ALQ|VP|LW|LBW|FORM|FRM|PRT|LPR)-/;
export function looksLikeOntologyCurie(id: string): boolean {
  if (!id) return false;
  if (LOCAL_ID_PREFIXES.test(id)) return false;
  return /^[A-Z][A-Z0-9_]*:/.test(id);
}

/**
 * Heuristic mapping from ontology namespace → material.domain. Honest about
 * its limits; default 'other' so a material always validates.
 */
export function inferDomainFromNamespace(ns: string): string {
  switch (ns.toUpperCase()) {
    case 'CHEBI':
      return 'chemical';
    case 'CL':
    case 'CLO':
      return 'cell_line';
    case 'NCBITAXON':
      return 'organism';
    case 'PR':
      return 'reagent';
    default:
      return 'other';
  }
}

function asPayload(env: { payload: unknown }): Record<string, unknown> | null {
  return env.payload && typeof env.payload === 'object' && !Array.isArray(env.payload)
    ? (env.payload as Record<string, unknown>)
    : null;
}

function classCuries(payload: Record<string, unknown> | null): string[] {
  if (!payload || !Array.isArray(payload.class)) return [];
  const out: string[] = [];
  for (const entry of payload.class) {
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      if (e.kind === 'ontology' && typeof e.id === 'string' && e.id) out.push(e.id);
    }
  }
  return out;
}

function payloadName(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  const n = payload.name;
  return typeof n === 'string' ? n.trim() : '';
}

/**
 * Rewrite CURIE-bearing material mentions to existing local recordIds when
 * possible. When `persistNew` is false, unknown CURIEs remain draft-only;
 * otherwise they are minted as proposed concept materials.
 */
export async function bindOntologyMentions(
  mentions: PromptMention[],
  deps: { store: RecordStore; prompt?: string; persistNew?: boolean },
): Promise<BindOntologyMentionsResult> {
  const out: PromptMention[] = new Array(mentions.length);
  const bindings: OntologyMentionBinding[] = [];
  // Track id rewrites so we can also substitute them into the prompt text —
  // the precompile re-parses the prompt and uses its mentions, not the array
  // we return, so a mentions-only rewrite isn't enough.
  const promptRewrites = new Map<string, string>();

  // Cache: CURIE → recordId for this call so multiple mentions of the same
  // term don't re-scan/re-mint. Idempotent across the batch.
  const resolvedThisCall = new Map<string, string>();

  // One scan up-front for the existing material set; we'll search it both by
  // class[] CURIE and by name. New mints we make during this call are added
  // to a parallel list so the very next mention can dedup against them.
  let materials = await deps.store.list({ kind: 'material' });

  for (let i = 0; i < mentions.length; i++) {
    const m = mentions[i]!;
    if (m.type !== 'material' || !m.id || !looksLikeOntologyCurie(m.id)) {
      out[i] = m;
      continue;
    }

    const curie = m.id;
    const label = (m.label ?? '').trim() || curie;

    const cached = resolvedThisCall.get(curie);
    if (cached) {
      out[i] = { ...m, id: cached };
      continue;
    }

    // 1) existing material classified by this CURIE
    const classMatch = materials.find((env) => classCuries(asPayload(env)).includes(curie));
    if (classMatch) {
      resolvedThisCall.set(curie, classMatch.recordId);
      promptRewrites.set(curie, classMatch.recordId);
      bindings.push({ curie, recordId: classMatch.recordId, minted: false, via: 'class-ref', label });
      out[i] = { ...m, id: classMatch.recordId };
      continue;
    }

    // 2) existing material with the same name (Phase 1f modal dedup parity)
    const needle = label.toLowerCase();
    const nameMatch = needle
      ? materials.find((env) => payloadName(asPayload(env)).toLowerCase() === needle)
      : undefined;
    if (nameMatch) {
      resolvedThisCall.set(curie, nameMatch.recordId);
      promptRewrites.set(curie, nameMatch.recordId);
      bindings.push({ curie, recordId: nameMatch.recordId, minted: false, via: 'name', label });
      out[i] = { ...m, id: nameMatch.recordId };
      continue;
    }

    if (deps.persistNew === false) {
      bindings.push({ curie, recordId: curie, minted: false, via: 'class-ref', label, draftOnly: true });
      out[i] = m;
      continue;
    }

    // 3) mint a new concept material with class[] grounding ref
    const recordId = token('MAT');
    const namespace = curie.split(':')[0] ?? '';
    const payload: Record<string, unknown> = {
      kind: 'material',
      id: recordId,
      name: label,
      domain: inferDomainFromNamespace(namespace),
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
      provenance: {
        source: 'ai_mention',
        sourceCurie: curie,
        sourceLabel: label,
        createdBy: 'compiler',
        createdAt: new Date().toISOString(),
        note: 'Created as a proposed local vocabulary record from an ontology-grounded prompt mention.',
      },
      class: [{ kind: 'ontology', id: curie, namespace, label }],
    };
    const created = await createRecord(
      deps.store,
      recordId,
      SCHEMA_IDS.material,
      payload,
      `Auto-bind from AI mention: ${curie}`,
    );
    if (!created) {
      // Couldn't write — leave the CURIE in place (no worse than today).
      out[i] = m;
      continue;
    }
    materials = [...materials, created];
    resolvedThisCall.set(curie, recordId);
    promptRewrites.set(curie, recordId);
    bindings.push({
      curie,
      recordId,
      minted: true,
      via: 'class-ref',
      label,
      lifecycleId: 'lab-vocabulary-control',
      state: 'proposed',
      requiresReview: true,
    });
    out[i] = { ...m, id: recordId };
  }

  const result: BindOntologyMentionsResult = { mentions: out, bindings };
  if (typeof deps.prompt === 'string') {
    result.prompt = promptRewrites.size > 0
      ? rewriteMentionIdsInPrompt(deps.prompt, promptRewrites)
      : deps.prompt;
  }
  return result;
}
