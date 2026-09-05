/**
 * GraphQueryService factory — builds the graph query stack from AppContext.
 *
 * Assembles a GraphEdgeIndex from the current record store snapshot + the
 * JSON-LD index's record refs + relationship records + event-graph projections,
 * then binds a GraphQueryEngine/CollectionService/GraphValidation on top. Used
 * by both the HTTP handlers and the lab.* MCP tools so the two clients run the
 * same query engine over the same graph (spec §1.1 one-query-engine, two
 * clients).
 */

import { GraphEdgeIndex } from './GraphEdgeIndex.js';
import { GraphProjector } from './GraphProjector.js';
import { GraphQueryEngine } from './GraphQueryEngine.js';
import { CollectionService } from './CollectionService.js';
import { GraphValidation } from './GraphValidation.js';
import { NLPlanner } from './NLPlanner.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import type { ResolveSpineLike } from './GraphQueryEngine.js';
import type { JsonLdIndex } from '../jsonld-index/index.js';
import type { RecordStore } from '../store/index.js';
import type { AppConfig } from '../config/types.js';
import { extractKind } from '../types/RecordEnvelope.js';

/** The subset of AppContext the graph query stack depends on. */
export interface GraphQueryContext {
  store: RecordStore;
  jsonLdIndex: Pick<JsonLdIndex, 'getRefs'>;
  appConfig?: AppConfig | undefined;
}

export interface GraphQueryService {
  engine: GraphQueryEngine;
  collections: CollectionService;
  validation: GraphValidation;
  planner: NLPlanner;
  /** Rebuild the underlying graph index from the current store state. */
  rebuild(): Promise<void>;
  stats(): { nodes: number; edges: number };
}

export async function createGraphQueryService(ctx: GraphQueryContext): Promise<GraphQueryService> {
  const index = GraphEdgeIndex.inMemory();
  const engine = new GraphQueryEngine({
    index,
    store: ctx.store,
    ...buildResolveSpine(ctx),
  });
  const collections = new CollectionService();
  const planner = new NLPlanner();

  const rebuild = async (): Promise<void> => {
    await buildIndexFromContext(index, ctx);
  };

  const validation = new GraphValidation({
    knownVerbs: () => knownVerbs(),
    fieldResolvable: () => true, // dotted expansion handled by the engine
    scopeExists: async (scope) => {
      try {
        return await ctx.store.exists(scope.id);
      } catch {
        return false;
      }
    },
  });

  await rebuild();
  return { engine, collections, validation, planner, rebuild, stats: () => index.stats() };
}

async function buildIndexFromContext(index: GraphEdgeIndex, ctx: GraphQueryContext): Promise<void> {
  const records = await ctx.store.list();
  const projector = new GraphProjector();

  const recSummaries: Array<{ recordId: string; kind: string; label: string }> = [];
  const eventGraphRecords: Array<{ recordId: string; projected: ReturnType<GraphProjector['project']> }> = [];
  const relationshipEdges: Array<{ sourceId: string; targetId: string; verb: string }> = [];

  for (const env of records) {
    const recordId = env.recordId;
    const payload = env.payload as Record<string, unknown> | undefined;
    const kind = env.meta?.kind ?? (payload ? extractKind(payload) : undefined) ?? 'record';
    const label =
      (typeof payload?.title === 'string' && payload.title) ||
      (typeof payload?.name === 'string' && payload.name) ||
      recordId;

    recSummaries.push({ recordId, kind, label });

    if (kind === 'relationship' && payload) {
      const { sourceId, targetId, verb } = payload as {
        sourceId?: string;
        targetId?: string;
        verb?: string;
      };
      if (sourceId && targetId && verb) {
        relationshipEdges.push({ sourceId, targetId, verb });
      }
    } else if (kind === 'event-graph' && payload) {
      const projected = projector.project({
        recordId,
        events: (payload.events as ProjectableEventArg[]) ?? [],
      });
      eventGraphRecords.push({ recordId, projected });
    }
  }

  // Record refs from the JSON-LD index (outgoing).
  const allIds = recSummaries.map((r) => r.recordId);
  const refs = ctx.jsonLdIndex.getRefs(allIds);

  index.build({
    records: recSummaries,
    refs,
    relationshipEdges,
    eventGraphProjections: eventGraphRecords,
  });
}

interface ProjectableEventArg {
  eventId?: string;
  event_type: string;
  details?: Record<string, unknown>;
}

function buildResolveSpine(ctx: GraphQueryContext): { resolveSpine: ResolveSpineLike } {
  const spine = createResolveSpineFromContext(ctx);
  return {
    resolveSpine: {
      resolve: (term, opts) => spine.resolve(term as string, opts as Parameters<ResolveSpineLike['resolve']>[1]),
    },
  };
}

function knownVerbs(): string[] {
  // A lightweight union of the verbs present in the index. GraphEdgeIndex does
  // not expose a verb list directly, so we derive it from a representative
  // scan of the edges table via `stats`/out — but for validation purposes a
  // stable known set mirrors the projected + relationship vocabularies used
  // across the codebase.
  return ['treated_with', 'measured_at', 'refers_to', 'uses', 'performed_by', 'derived_from', 'contains', 'supports', 'contradicts'];
}