import { createHash } from 'node:crypto';
import type { Context } from '../types/context.js';

export type PromotionTarget =
  | 'material-spec'
  | 'material-instance'
  | 'aliquot'
  | 'plate-layout-template'
  | 'assay-definition'
  | 'context-snapshot';

export interface ContextSnapshot {
  kind: 'context-snapshot';
  id: string;
  source_context_ref: { kind: 'record'; id: string; type: string };
  source_event_graph_ref?: { kind: 'record'; id: string; type: string };
  content_hash: string;
  completeness_at_promotion: 'complete' | 'partial';
  snapshot: Record<string, unknown>;
  promoted_at: string;
  version: 1;
}

export interface ContextPromotion {
  kind: 'context-promotion';
  recordId: string;
  output_kind: PromotionTarget;
  source_context_refs: Array<{ kind: 'record'; id: string; type: string }>;
  source_event_graph_ref?: { kind: 'record'; id: string; type: string };
  output_ref: { kind: 'record'; id: string; type: string };
  source_content_hash: string;
  version: 1;
  promoted_at: string;
  selection?: Record<string, unknown>;
  method?: string;
}

export interface PromotionResult {
  snapshot: ContextSnapshot;
  promotion: ContextPromotion;
  source_content_hash: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function computeSourceContentHash(context: Context): string {
  const canon = canonicalize(context);
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 8);
}

export class PromotionCompiler {
  promote(source: Context, kind: PromotionTarget, options: {
    selection?: Record<string, unknown>;
    method?: string;
  } = {}): PromotionResult {
    const completeness =
      (source as unknown as { completeness?: 'complete' | 'partial' }).completeness ?? 'complete';

    if (kind !== 'context-snapshot' && completeness !== 'complete') {
      throw new Error(`cannot promote partial context to ${kind}`);
    }

    const content_hash = computeSourceContentHash(source);
    const now = new Date().toISOString();

    const snapshot: ContextSnapshot = {
      kind: 'context-snapshot',
      id: `CTX-SNAP-${randomSuffix()}`,
      source_context_ref: { kind: 'record', id: source.id, type: 'context' },
      ...(source.event_graph_ref
        ? {
            source_event_graph_ref: {
              kind: 'record',
              id: source.event_graph_ref.id,
              type: 'event_graph',
            },
          }
        : {}),
      content_hash,
      completeness_at_promotion: completeness,
      snapshot: canonicalize(source) as Record<string, unknown>,
      promoted_at: now,
      version: 1,
    };

    const outputId = kind === 'context-snapshot'
      ? snapshot.id
      : `${kind.toUpperCase().replace(/-/g, '_')}-${randomSuffix()}`;

    const promotion: ContextPromotion = {
      kind: 'context-promotion',
      recordId: `PROM-${randomSuffix()}`,
      output_kind: kind,
      source_context_refs: [{ kind: 'record', id: source.id, type: 'context' }],
      ...(source.event_graph_ref
        ? { source_event_graph_ref: { kind: 'record', id: source.event_graph_ref.id, type: 'event_graph' } }
        : {}),
      output_ref: { kind: 'record', id: outputId, type: kind },
      source_content_hash: content_hash,
      version: 1,
      promoted_at: now,
      ...(options.selection ? { selection: options.selection } : {}),
      ...(options.method ? { method: options.method } : {}),
    };

    return { snapshot, promotion, source_content_hash: content_hash };
  }
}

export type SourceDriftResult =
  | { drifted: false; previous_hash: string; current_hash: string }
  | { drifted: true; reason: string; previous_hash: string; current_hash: string };

export function detectSourceDrift(
  promotion: Pick<ContextPromotion, 'source_content_hash' | 'selection'>,
  currentContext: Context
): SourceDriftResult {
  const previous_hash = promotion.source_content_hash;
  const current_hash = computeSourceContentHash(currentContext);

  if (previous_hash === current_hash) {
    return { drifted: false, previous_hash, current_hash };
  }

  return {
    drifted: true,
    reason: 'context content hash changed since promotion',
    previous_hash,
    current_hash,
  };
}
