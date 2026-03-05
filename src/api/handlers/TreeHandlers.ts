/**
 * TreeHandlers — HTTP handlers for tree navigation and filing operations.
 * 
 * These handlers provide endpoints for:
 * - Getting the study/experiment/run hierarchy
 * - Getting records for a specific run
 * - Getting inbox records
 * - Filing records from inbox into runs
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IndexManager } from '../../index/IndexManager.js';
import type { RecordStore } from '../../store/types.js';
import type { StudyTreeNode, IndexEntry } from '../../index/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';

/**
 * Response types for tree endpoints.
 */
export interface StudyTreeResponse {
  studies: StudyTreeNode[];
}

export interface RecordsListResponse {
  records: IndexEntry[];
  total: number;
}

export interface FileRecordResponse {
  success: boolean;
  newPath?: string;
  error?: string;
}

export interface RebuildIndexResponse {
  success: boolean;
  count: number;
  generatedAt: string;
}

export interface RunMethodSummaryResponse {
  runId: string;
  hasMethod: boolean;
  methodEventGraphId?: string;
  methodPlatform?: 'manual' | 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
  methodVocabId?: 'liquid-handling/v1' | 'animal-handling/v1';
  methodTemplateId?: string;
}

type DeckPlacement = {
  slotId: string;
  labwareId?: string;
  moduleId?: string;
};

type SavedTemplateSnapshot = {
  sourceEventGraphId?: string | null;
  events?: unknown[];
  labwares?: unknown[];
  deck?: {
    platform?: 'manual' | 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
    variant?: string;
    placements?: DeckPlacement[];
  };
  closure?: {
    labwareIds?: string[];
    eventIds?: string[];
  };
};

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parseSavedTemplateSnapshot(template: unknown): SavedTemplateSnapshot {
  const obj = toObject(template);
  if (!obj) return {};
  const insertionHints = toObject(obj['insertionHints']);
  if (insertionHints) return insertionHints as SavedTemplateSnapshot;
  return obj as SavedTemplateSnapshot;
}

function eventGraphIdFromRecordId(prefix: string = 'EVG'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function allowedPlatformsForVocab(vocabId: 'liquid-handling/v1' | 'animal-handling/v1'): Array<'manual' | 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex'> {
  if (vocabId === 'animal-handling/v1') return ['manual'];
  return ['manual', 'integra_assist', 'opentrons_ot2', 'opentrons_flex'];
}

/**
 * Create tree handlers bound to an IndexManager and RecordStore.
 */
export function createTreeHandlers(
  indexManager: IndexManager,
  recordStore: RecordStore
) {
  return {
    /**
     * GET /runs/:id/method
     * Returns active method attachment summary for a run.
     */
    async getRunMethod(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<RunMethodSummaryResponse | { error: string; message: string }> {
      const runRecord = await recordStore.get(request.params.id);
      if (!runRecord) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Run not found: ${request.params.id}`,
        };
      }
      const payload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const methodEventGraphId = typeof payload['methodEventGraphId'] === 'string' ? payload['methodEventGraphId'] : undefined;
      const methodPlatformRaw = payload['methodPlatform'];
      const methodPlatform = methodPlatformRaw === 'manual'
        || methodPlatformRaw === 'integra_assist'
        || methodPlatformRaw === 'opentrons_ot2'
        || methodPlatformRaw === 'opentrons_flex'
        ? methodPlatformRaw
        : undefined;
      const methodTemplate = toObject(payload['methodTemplateRef']);
      const methodTemplateId = typeof methodTemplate?.['id'] === 'string' ? methodTemplate.id : undefined;
      const methodVocabRaw = payload['methodVocabId'];
      const methodVocabId = methodVocabRaw === 'liquid-handling/v1' || methodVocabRaw === 'animal-handling/v1'
        ? methodVocabRaw
        : undefined;
      return {
        runId: request.params.id,
        hasMethod: Boolean(methodEventGraphId),
        ...(methodEventGraphId ? { methodEventGraphId } : {}),
        ...(methodPlatform ? { methodPlatform } : {}),
        ...(methodVocabId ? { methodVocabId } : {}),
        ...(methodTemplateId ? { methodTemplateId } : {}),
      };
    },

    /**
     * POST /runs/:id/method/attach-template
     * Materialize template into run-attached method event graph.
     */
    async attachTemplateToRunMethod(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          templateId?: string;
          replace?: boolean;
          vocabId?: 'liquid-handling/v1' | 'animal-handling/v1';
          platform?: 'manual' | 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';
          deckVariant?: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<
      | {
        success: boolean;
        runId: string;
        methodEventGraphId: string;
        replaced: boolean;
      }
      | { error: string; message: string; existingMethodEventGraphId?: string }
    > {
      const runId = request.params.id;
      const templateId = request.body?.templateId;
      const replace = request.body?.replace === true;
      const vocabId = request.body?.vocabId ?? 'liquid-handling/v1';
      const platform = request.body?.platform ?? 'manual';
      const deckVariant = request.body?.deckVariant
        ?? (platform === 'integra_assist'
          ? 'assist_plus_3pos'
          : platform === 'opentrons_flex'
            ? 'ot3_standard'
            : platform === 'opentrons_ot2'
              ? 'ot2_standard'
              : 'manual_collapsed');

      if (vocabId !== 'liquid-handling/v1' && vocabId !== 'animal-handling/v1') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'vocabId must be one of: liquid-handling/v1, animal-handling/v1' };
      }

      if (platform !== 'manual' && platform !== 'integra_assist' && platform !== 'opentrons_ot2' && platform !== 'opentrons_flex') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'platform must be one of: manual, integra_assist, opentrons_ot2, opentrons_flex' };
      }
      const allowedPlatforms = allowedPlatformsForVocab(vocabId);
      if (!allowedPlatforms.includes(platform)) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `platform "${platform}" is not allowed for vocabulary "${vocabId}"` };
      }

      const runRecord = await recordStore.get(runId);
      if (!runRecord) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${runId}` };
      }
      const runPayload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const existingMethod = typeof runPayload['methodEventGraphId'] === 'string' ? runPayload['methodEventGraphId'] : undefined;
      if (existingMethod && !replace) {
        reply.status(409);
        return {
          error: 'METHOD_ALREADY_ATTACHED',
          message: `Run ${runId} already has an attached method.`,
          existingMethodEventGraphId: existingMethod,
        };
      }

      let events: unknown[] = [];
      let labwares: unknown[] = [];
      let placements: Array<{ slotId: string; labwareId?: string; moduleId?: string }> = [];
      if (templateId && templateId.trim().length > 0) {
        const templateRecord = await recordStore.get(templateId);
        if (!templateRecord) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Template not found: ${templateId}` };
        }
        const templatePayload = (templateRecord.payload ?? {}) as Record<string, unknown>;
        const template = toObject(templatePayload['template']);
        if (!template) {
          reply.status(422);
          return { error: 'BAD_TEMPLATE', message: `Template ${templateId} does not include template payload.` };
        }
        const snapshot = parseSavedTemplateSnapshot(template);
        events = Array.isArray(snapshot.events) ? snapshot.events : [];
        labwares = Array.isArray(snapshot.labwares) ? snapshot.labwares : [];
        if (events.length === 0 || labwares.length === 0) {
          reply.status(422);
          return { error: 'BAD_TEMPLATE', message: `Template ${templateId} is missing snapshot events or labwares.` };
        }
        placements = Array.isArray(snapshot.deck?.placements)
          ? snapshot.deck.placements
              .map((p) => toObject(p))
              .filter((p): p is Record<string, unknown> => Boolean(p))
              .map((p) => ({
                slotId: typeof p['slotId'] === 'string' ? p['slotId'] : '',
                ...(typeof p['labwareId'] === 'string' ? { labwareId: p['labwareId'] } : {}),
                ...(typeof p['moduleId'] === 'string' ? { moduleId: p['moduleId'] } : {}),
              }))
              .filter((p) => p.slotId.length > 0)
          : [];
      }

      const methodEventGraphId = eventGraphIdFromRecordId();
      const now = new Date().toISOString();
      const linksObj = toObject(runPayload['links']);
      const runStudyId = typeof linksObj?.['studyId'] === 'string'
        ? linksObj.studyId
        : (typeof runPayload['studyId'] === 'string' ? runPayload['studyId'] : undefined);
      const runExperimentId = typeof linksObj?.['experimentId'] === 'string'
        ? linksObj.experimentId
        : (typeof runPayload['experimentId'] === 'string' ? runPayload['experimentId'] : undefined);
      const eventGraphPayload = {
        id: methodEventGraphId,
        name: `${(runPayload['title'] as string | undefined) || runId} Method`,
        events,
        labwares,
        status: 'filed',
        links: {
          ...(runStudyId ? { studyId: runStudyId } : {}),
          ...(runExperimentId ? { experimentId: runExperimentId } : {}),
          runId,
        },
        methodContext: {
          runId,
          ...(templateId ? { sourceTemplateId: templateId } : {}),
          vocabId,
          platform,
          deckVariant,
          locked: true,
        },
        deckLayout: {
          placements,
          labwareOrientations: {},
        },
        createdAt: now,
        updatedAt: now,
      };
      const eventGraphEnvelope = createEnvelope(
        eventGraphPayload,
        'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        { createdAt: now, updatedAt: now }
      );
      if (!eventGraphEnvelope) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: 'Failed to create event-graph envelope' };
      }
      const created = await recordStore.create({
        envelope: eventGraphEnvelope,
        message: `Attach template ${templateId} to run ${runId}`,
      });
      if (!created.success) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: created.error || 'Failed to create method event graph' };
      }

      const updatedRunPayload: Record<string, unknown> = {
        ...runPayload,
        methodEventGraphId,
        methodPlatform: platform,
        methodVocabId: vocabId,
        methodAttachedAt: now,
        updatedAt: now,
      };
      if (templateId) {
        updatedRunPayload['methodTemplateRef'] = { kind: 'record', id: templateId, type: 'graph-component' };
      } else {
        delete updatedRunPayload['methodTemplateRef'];
      }
      const runUpdate = await recordStore.update({
        envelope: {
          ...runRecord,
          payload: updatedRunPayload,
          meta: {
            ...runRecord.meta,
            updatedAt: now,
          },
        },
        message: `${replace ? 'Replace' : 'Attach'} method ${templateId ? `template ${templateId}` : 'blank'} on run ${runId}`,
      });
      if (!runUpdate.success) {
        reply.status(500);
        return { error: 'UPDATE_FAILED', message: runUpdate.error || 'Failed to update run method metadata' };
      }

      const runEntry = await indexManager.getByRecordId(runId);
      if (runEntry) {
        await indexManager.updateEntry({
          ...runEntry,
          ...(typeof updatedRunPayload.updatedAt === 'string' ? { updatedAt: updatedRunPayload.updatedAt } : {}),
          ...(typeof runPayload['title'] === 'string' ? { title: runPayload['title'] } : {}),
        });
      }

      return {
        success: true,
        runId,
        methodEventGraphId,
        replaced: Boolean(existingMethod && replace),
      };
    },

    /**
     * GET /tree/studies
     * Get the study hierarchy tree.
     */
    async getStudies(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<StudyTreeResponse> {
      const studies = await indexManager.getStudyTree();
      return { studies };
    },
    
    /**
     * GET /tree/records?runId=xxx
     * Get records linked to a specific run.
     */
    async getRecordsForRun(
      request: FastifyRequest<{ Querystring: { runId?: string } }>,
      reply: FastifyReply
    ): Promise<RecordsListResponse | { error: string; message: string }> {
      const { runId } = request.query;
      
      if (!runId) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'runId query parameter is required',
        };
      }
      
      const records = await indexManager.getByRunId(runId);
      return {
        records,
        total: records.length,
      };
    },
    
    /**
     * GET /tree/inbox
     * Get records in the inbox (status = inbox).
     */
    async getInbox(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<RecordsListResponse> {
      const records = await indexManager.getInbox();
      return {
        records,
        total: records.length,
      };
    },
    
    /**
     * POST /records/:id/file
     * File a record from inbox into a run.
     * Updates links and status, may move file.
     */
    async fileRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { runId: string };
      }>,
      reply: FastifyReply
    ): Promise<FileRecordResponse> {
      const { id: recordId } = request.params;
      const { runId } = request.body;
      
      if (!runId) {
        reply.status(400);
        return {
          success: false,
          error: 'runId is required in request body',
        };
      }
      
      try {
        // Get the record
        const record = await recordStore.get(recordId);
        if (!record) {
          reply.status(404);
          return {
            success: false,
            error: `Record not found: ${recordId}`,
          };
        }
        
        // Get the run to find studyId and experimentId
        const runEntry = await indexManager.getByRecordId(runId);
        if (!runEntry) {
          reply.status(404);
          return {
            success: false,
            error: `Run not found: ${runId}`,
          };
        }
        
        // Update the record with links
        const payload = record.payload as Record<string, unknown>;
        const updatedPayload = {
          ...payload,
          links: {
            studyId: runEntry.links?.studyId,
            experimentId: runEntry.links?.experimentId,
            runId: runId,
          },
          status: 'filed',
        };
        
        // Update in store
        const result = await recordStore.update({
          envelope: {
            ...record,
            payload: updatedPayload,
          },
          message: `File ${recordId} into run ${runId}`,
        });
        
        if (!result.success) {
          reply.status(500);
          return {
            success: false,
            error: result.error || 'Failed to update record',
          };
        }
        
        // Update the index entry
        const currentEntry = await indexManager.getByRecordId(recordId);
        if (currentEntry) {
          await indexManager.updateEntry({
            ...currentEntry,
            status: 'filed',
            links: {
              ...(runEntry.links?.studyId ? { studyId: runEntry.links.studyId } : {}),
              ...(runEntry.links?.experimentId ? { experimentId: runEntry.links.experimentId } : {}),
              runId: runId,
            },
          });
        }
        
        const newPath = result.envelope?.meta?.path;
        return {
          success: true,
          ...(newPath ? { newPath } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply.status(500);
        return {
          success: false,
          error: `Failed to file record: ${message}`,
        };
      }
    },
    
    /**
     * POST /index/rebuild
     * Manually rebuild the record index.
     */
    async rebuildIndex(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<RebuildIndexResponse> {
      const result = await indexManager.rebuild();
      return {
        success: true,
        count: result.entries.length,
        generatedAt: result.generatedAt,
      };
    },
    
    /**
     * GET /tree/search?q=xxx&limit=50
     * Full-text search records by query string.
     * Searches across recordId, title, kind, and path.
     * Results are sorted by relevance.
     */
    async searchRecords(
      request: FastifyRequest<{ Querystring: { q?: string; kind?: string; limit?: string } }>,
      _reply: FastifyReply
    ): Promise<RecordsListResponse> {
      const { q, kind, limit } = request.query;
      
      // If no query, return empty (or optionally filter by kind)
      if (!q || q.trim().length === 0) {
        if (kind) {
          const records = await indexManager.query({ kind });
          return { records, total: records.length };
        }
        return { records: [], total: 0 };
      }
      
      const limitNum = limit ? parseInt(limit, 10) : 50;
      
      // Use full-text search
      let records = await indexManager.search(q, limitNum);
      
      // Filter by kind if specified
      if (kind) {
        records = records.filter(r => r.kind === kind);
      }
      
      return {
        records,
        total: records.length,
      };
    },
  };
}

export type TreeHandlers = ReturnType<typeof createTreeHandlers>;
