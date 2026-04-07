import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { RecordStore } from '../../store/types.js';
import { ArtifactBlobStore } from '../../ingestion/ArtifactBlobStore.js';
import { createIngestionService } from '../../ingestion/IngestionService.js';
import type {
  CreateIngestionArtifactInput,
  CreateIngestionJobInput,
  IngestionJobDetail,
  IngestionPublishResult,
  IngestionJobSummary,
} from '../../ingestion/types.js';

type ArtifactBody = {
  sourceUrl?: unknown;
  fileName?: unknown;
  mediaType?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
  note?: unknown;
  contentBase64?: unknown;
};

type CreateJobBody = {
  name?: unknown;
  sourceKind?: unknown;
  adapterKind?: unknown;
  ontologyPreferences?: unknown;
  submittedBy?: unknown;
  source?: ArtifactBody | undefined;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
  return items.length > 0 ? items : undefined;
}

function parseArtifactInput(body: ArtifactBody | undefined): CreateIngestionArtifactInput {
  return {
    ...(stringValue(body?.sourceUrl) ? { sourceUrl: stringValue(body?.sourceUrl) } : {}),
    ...(stringValue(body?.fileName) ? { fileName: stringValue(body?.fileName) } : {}),
    ...(stringValue(body?.mediaType) ? { mediaType: stringValue(body?.mediaType) } : {}),
    ...(typeof numberValue(body?.sizeBytes) === 'number' ? { sizeBytes: numberValue(body?.sizeBytes) } : {}),
    ...(stringValue(body?.sha256) ? { sha256: stringValue(body?.sha256) } : {}),
    ...(stringValue(body?.note) ? { note: stringValue(body?.note) } : {}),
    ...(stringValue(body?.contentBase64) ? { contentBase64: stringValue(body?.contentBase64) } : {}),
  };
}

export interface IngestionHandlers {
  listJobs(request: FastifyRequest, reply: FastifyReply): Promise<{ items: IngestionJobSummary[]; total: number }>;
  getJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<IngestionJobDetail | ApiError>;
  createJob(request: FastifyRequest<{ Body: CreateJobBody }>, reply: FastifyReply): Promise<IngestionJobDetail | ApiError>;
  addArtifact(request: FastifyRequest<{ Params: { id: string }; Body: ArtifactBody }>, reply: FastifyReply): Promise<{ success: true; artifact: unknown } | ApiError>;
  runJob(request: FastifyRequest<{ Params: { id: string }; Body: { source?: ArtifactBody } }>, reply: FastifyReply): Promise<IngestionJobDetail | ApiError>;
  approveBundle(request: FastifyRequest<{ Params: { id: string; bundleId: string } }>, reply: FastifyReply): Promise<IngestionJobDetail | ApiError>;
  publishBundle(request: FastifyRequest<{ Params: { id: string; bundleId: string } }>, reply: FastifyReply): Promise<{ detail: IngestionJobDetail; publishResult: IngestionPublishResult } | ApiError>;
}

export function createIngestionHandlers(store: RecordStore, blobStore: ArtifactBlobStore): IngestionHandlers {
  const service = createIngestionService(store, blobStore);

  return {
    async listJobs() {
      const items = await service.listJobs();
      return { items, total: items.length };
    },

    async getJob(request, reply) {
      const detail = await service.getJob(request.params.id);
      if (!detail) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Ingestion job not found: ${request.params.id}` };
      }
      return detail;
    },

    async createJob(request, reply) {
      const sourceKind = stringValue(request.body?.sourceKind);
      if (!sourceKind) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'sourceKind is required' };
      }
      const source = parseArtifactInput(request.body?.source);
      if (!source.sourceUrl && !source.fileName) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'source.sourceUrl or source.fileName is required' };
      }

      try {
        return await service.createJob({
          sourceKind: sourceKind as CreateIngestionJobInput['sourceKind'],
          ...(stringValue(request.body?.name) ? { name: stringValue(request.body?.name) } : {}),
          ...(stringValue(request.body?.adapterKind) ? { adapterKind: stringValue(request.body?.adapterKind) } : {}),
          ...(stringArrayValue(request.body?.ontologyPreferences) ? { ontologyPreferences: stringArrayValue(request.body?.ontologyPreferences) } : {}),
          ...(stringValue(request.body?.submittedBy) ? { submittedBy: stringValue(request.body?.submittedBy) } : {}),
          source,
        });
      } catch (err) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async addArtifact(request, reply) {
      const input = parseArtifactInput(request.body);
      if (!input.sourceUrl && !input.fileName) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'sourceUrl or fileName is required' };
      }

      try {
        const artifact = await service.addArtifact(request.params.id, input);
        return { success: true, artifact };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 400);
        return { error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST', message };
      }
    },

    async runJob(request, reply) {
      try {
        return await service.runJob(request.params.id, parseArtifactInput(request.body?.source));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 400);
        return { error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST', message };
      }
    },

    async approveBundle(request, reply) {
      try {
        return await service.approveBundle(request.params.id, request.params.bundleId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 400);
        return { error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST', message };
      }
    },

    async publishBundle(request, reply) {
      try {
        return await service.publishBundle(request.params.id, request.params.bundleId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 400);
        return { error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST', message };
      }
    },
  };
}
