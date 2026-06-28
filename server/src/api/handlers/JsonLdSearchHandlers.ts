/**
 * JSON-LD search handlers.
 *
 * Endpoints:
 * - POST /api/search/jsonld          → run a query against the index
 * - POST /api/search/jsonld/reindex  → drop the index and rebuild from
 *                                      store.list() (admin operation)
 * - POST /api/search/projects        → full-text search grouped by study
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JsonLdIndex, JsonLdQuery } from '../../jsonld-index/index.js';
import type { JsonLdProjector } from '../../jsonld/JsonLdProjector.js';
import type { RecordStore } from '../../store/index.js';
import { extractKind } from '../../types/RecordEnvelope.js';

const MAX_LIMIT = 500;

export class JsonLdSearchHandlers {
  constructor(
    private readonly index: JsonLdIndex,
    private readonly projector: JsonLdProjector,
    private readonly store: RecordStore,
  ) {}

  async search(
    request: FastifyRequest<{ Body: JsonLdQuery }>,
    reply: FastifyReply,
  ) {
    const body = request.body;
    if (body !== null && typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be a JSON object' });
    }
    const query: JsonLdQuery = body ?? {};
    try {
      const result = this.index.query(query);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err, query }, 'JSON-LD search failed');
      return reply.status(500).send({ error: 'Search failed' });
    }
  }

  /**
   * Drop the index and rebuild from the authoritative record store. Cheap
   * enough on appliance-scale corpora (under a second for the current 166
   * records); reserved for admin tooling and the bootstrap path.
   */
  async reindex(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      const start = Date.now();
      this.index.clear();
      const records = await this.store.list();
      for (const env of records) {
        this.index.upsert(this.projector.project(env));
      }
      const ms = Date.now() - start;
      return reply.send({
        ok: true,
        count: this.index.size(),
        elapsedMs: ms,
      });
    } catch (err) {
      request.log.error({ err }, 'JSON-LD reindex failed');
      return reply.status(500).send({ error: 'Reindex failed' });
    }
  }

  /**
   * Search for projects (studies) by full-text search.
   *
   * Groups hits by study, resolves hierarchical paths
   * (Study → Experiment → Run → Component), and returns
   * distinct studies with their match context.
   */
  async searchProjects(
    request: FastifyRequest<{ Body: { q: string; limit?: number } }>,
    reply: FastifyReply,
  ) {
    const body = request.body;
    if (body === null || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be a JSON object' });
    }
    const q = (body.q ?? '').trim().slice(0, 500);
    if (!q) {
      return reply.status(400).send({ error: 'Query string "q" is required' });
    }
    const limit = Math.min(Math.max(body.limit ?? 50, 1), MAX_LIMIT);

    try {
      // 1. Query the index for all matching records
      const searchResult = this.index.query({ q, limit });

      // 2. Fetch refs for hits and their parents so we can trace hierarchy
      // through Run -> Experiment -> Study even when only the leaf matched.
      const hitRecordIds = searchResult.hits.map((h) => h.recordId);
      const allRecords = new Map<string, { recordId: string; kind: string; label: string }>();
      const refsByRecord = new Map<string, Array<{ recordId: string; kind?: string }>>();

      // First, build a label map from the search hits themselves
      for (const hit of searchResult.hits) {
        allRecords.set(hit.recordId, {
          recordId: hit.recordId,
          kind: hit.kind,
          label: hit.label,
        });
      }

      const fetchRecords = async (ids: string[]) => {
        const idsToFetch = ids.filter((id) => !allRecords.has(id));
        if (idsToFetch.length === 0) return;
        const fetchPromises = idsToFetch.map(async (id) => {
          const env = await this.store.get(id);
          if (env) {
            const payload = env.payload as Record<string, unknown>;
            const label = (typeof payload.title === 'string' ? payload.title :
                           typeof payload.name === 'string' ? payload.name :
                           id) as string;
            const kind = env.meta?.kind ?? extractKind(env.payload) ?? 'unknown';
            return { recordId: id, kind, label };
          }
          return null;
        });
        const results = await Promise.all(fetchPromises);
        for (const r of results) {
          if (r) allRecords.set(r.recordId, r);
        }
      };

      // Walk parent refs a few levels deep. Study hierarchies are shallow, but
      // four hops covers leaf records that point at run -> experiment -> study
      // with room for one intermediate wrapper.
      let frontier = new Set(hitRecordIds);
      const expanded = new Set<string>();
      for (let depth = 0; depth < 4 && frontier.size > 0; depth += 1) {
        const ids = [...frontier].filter((id) => !expanded.has(id));
        if (ids.length === 0) break;
        for (const id of ids) expanded.add(id);

        const refs = this.index.getRefs(ids);
        const next = new Set<string>();
        for (const [recordId, recordRefs] of refs.entries()) {
          refsByRecord.set(recordId, recordRefs);
          for (const ref of recordRefs) next.add(ref.recordId);
        }

        await fetchRecords([...next]);
        frontier = next;
      }

      // 5. For each hit, trace back to study and build hierarchical path
      interface MatchInfo {
        recordId: string;
        kind: string;
        label: string;
        path: string;
        snippet?: string | undefined;
      }

      interface StudyEntry {
        studyId: string;
        title: string;
        matches: MatchInfo[];
      }

      const studies = new Map<string, StudyEntry>();

      for (const hit of searchResult.hits) {
        // Trace the hierarchy for this hit
        const { studyId, pathParts } = this.resolveHierarchy(
          hit.recordId,
          hit.kind,
          hit.label,
          refsByRecord,
          allRecords,
        );

        if (!studyId) continue;

        // Get or create study entry
        let studyEntry = studies.get(studyId);
        if (!studyEntry) {
          const studyRecord = allRecords.get(studyId);
          studyEntry = {
            studyId,
            title: studyRecord?.label ?? studyId,
            matches: [],
          };
          studies.set(studyId, studyEntry);
        }

        // Build path string: e.g., "Experiment > Run > Component"
        const pathStr = pathParts.map((p) => p.label).join(' → ');

        studyEntry.matches.push({
          recordId: hit.recordId,
          kind: hit.kind,
          label: hit.label,
          path: pathStr,
          snippet: hit.snippet,
        });
      }

      // Sort studies by match count descending, then by title
      const studyList = [...studies.values()].sort((a, b) => {
        const countDiff = b.matches.length - a.matches.length;
        if (countDiff !== 0) return countDiff;
        return a.title.localeCompare(b.title);
      });

      return reply.send({
        studies: studyList,
        total: searchResult.hits.length,
      });
    } catch (err) {
      request.log.error({ err, q }, 'Search projects failed');
      return reply.status(500).send({ error: 'Search projects failed' });
    }
  }

  /**
   * Resolve the hierarchy for a given record, tracing back to its study.
   * Returns { studyId, pathParts } where pathParts contains the hierarchy
   * from study down to the hit record.
   */
  private resolveHierarchy(
    recordId: string,
    _kind: string,
    label: string,
    refsByRecord: Map<string, Array<{ recordId: string; kind?: string }>>,
    allRecords: Map<string, { recordId: string; kind: string; label: string }>,
  ): { studyId: string | null; pathParts: { label: string }[] } {
    const pathParts: { label: string }[] = [];
    let currentId = recordId;

    // Build path from the hit upward
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);

      const record = allRecords.get(currentId);
      if (!record) {
        pathParts.unshift({ label });
        break;
      }

      pathParts.unshift({ label: record.label });

      // If this is a study, we're done
      if (record.kind === 'study') {
        return { studyId: currentId, pathParts };
      }

      // If this is an experiment, look for studyId in its refs
      if (record.kind === 'experiment') {
        const refs = refsByRecord.get(currentId) ?? [];
        const studyRef = refs.find(
          (r) => r.kind === 'study' || allRecords.get(r.recordId)?.kind === 'study',
        );
        if (studyRef) {
          pathParts.unshift({ label: allRecords.get(studyRef.recordId)?.label ?? studyRef.recordId });
          return { studyId: studyRef.recordId, pathParts };
        }
        break;
      }

      // If this is a run, look for experimentId in its refs
      if (record.kind === 'run') {
        const refs = refsByRecord.get(currentId) ?? [];
        const expRef = refs.find(
          (r) => r.kind === 'experiment' || allRecords.get(r.recordId)?.kind === 'experiment',
        );
        if (expRef) {
          currentId = expRef.recordId;
          continue;
        }
        const studyRef = refs.find(
          (r) => r.kind === 'study' || allRecords.get(r.recordId)?.kind === 'study',
        );
        if (studyRef) {
          pathParts.unshift({ label: allRecords.get(studyRef.recordId)?.label ?? studyRef.recordId });
          return { studyId: studyRef.recordId, pathParts };
        }
        break;
      }

      // For other kinds (material, component, etc.), look for runId or experimentId
      const refs = refsByRecord.get(currentId) ?? [];

      // First try to find a run
      const runRef = refs.find(
        (r) => r.kind === 'run' || allRecords.get(r.recordId)?.kind === 'run',
      );
      if (runRef) {
        currentId = runRef.recordId;
        continue;
      }

      // Then try to find an experiment
      const expRef = refs.find(
        (r) => r.kind === 'experiment' || allRecords.get(r.recordId)?.kind === 'experiment',
      );
      if (expRef) {
        currentId = expRef.recordId;
        continue;
      }

      // Try to find a study directly
      const studyRef = refs.find(
        (r) => r.kind === 'study' || allRecords.get(r.recordId)?.kind === 'study',
      );
      if (studyRef) {
        pathParts.unshift({ label: allRecords.get(studyRef.recordId)?.label ?? studyRef.recordId });
        return { studyId: studyRef.recordId, pathParts };
      }

      break;
    }

    // If we still haven't found a study, check facets for studyId
    // (some records might have studyId in their facets rather than refs)
    return { studyId: null, pathParts };
  }
}

export function createJsonLdSearchHandlers(
  index: JsonLdIndex,
  projector: JsonLdProjector,
  store: RecordStore,
): JsonLdSearchHandlers {
  return new JsonLdSearchHandlers(index, projector, store);
}
