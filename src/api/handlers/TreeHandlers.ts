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

/**
 * Create tree handlers bound to an IndexManager and RecordStore.
 */
export function createTreeHandlers(
  indexManager: IndexManager,
  recordStore: RecordStore
) {
  return {
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
