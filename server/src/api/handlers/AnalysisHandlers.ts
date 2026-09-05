/**
 * AnalysisHandlers — HTTP bridge for analysis record CRUD + run execution.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import {
  AnalysisService,
  AnalysisServiceError,
  type CreateRevisionInput,
  type CreateRunInput,
} from '../../analysis/analysisService.js';
import { AnalysisRunner } from '../../analysis/analysisRunner.js';
import { AnalysisAuthoringService, AnalysisAuthoringError } from '../../analysis/analysisAuthoring.js';
import { promoteArtifact } from '../../analysis/artifactPromotion.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import { resolveAiProfile } from '../../config/types.js';

export function createAnalysisHandlers(ctx: AppContext) {
  const service = new AnalysisService(ctx);

  function error(reply: FastifyReply, err: unknown, defaultStatus = 500) {
    if (err instanceof AnalysisServiceError) {
      reply.status(err.statusCode);
      return { error: err.code, message: err.message };
    }
    reply.status(defaultStatus);
    return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
  }

  return {
    async createRevision(
      request: FastifyRequest<{ Body: CreateRevisionInput }>,
      reply: FastifyReply,
    ) {
      try {
        const { recordId, payload } = await service.createRevision(request.body);
        reply.status(201);
        return { success: true, recordId, revision: payload };
      } catch (err) {
        return error(reply, err);
      }
    },

    async getRevision(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      const env = await service.getRevision(request.params.id);
      if (!env) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `revision not found: ${request.params.id}` };
      }
      return { record: env };
    },

    async listRevisions(_req: FastifyRequest): Promise<{ revisions: import('../../types/RecordEnvelope.js').RecordEnvelope[]; total: number }> {
      const revisions = await service.list('analysis-revision');
      return { revisions, total: revisions.length };
    },

    async createRun(
      request: FastifyRequest<{ Body: CreateRunInput }>,
      reply: FastifyReply,
    ) {
      try {
        const { recordId, payload } = await service.createRun(request.body);
        reply.status(201);
        return { success: true, recordId, run: payload };
      } catch (err) {
        return error(reply, err);
      }
    },

    async getRun(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      const env = await service.getRun(request.params.id);
      if (!env) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `run not found: ${request.params.id}` };
      }
      return { record: env };
    },

    async listRuns(_req: FastifyRequest): Promise<{ runs: import('../../types/RecordEnvelope.js').RecordEnvelope[]; total: number }> {
      const runs = await service.list('analysis-run');
      return { runs, total: runs.length };
    },

    async draftRevision(
      request: FastifyRequest<{
        Body: {
          prompt: string;
          inputs?: Array<{ name: string; dataKind: string; label?: string }>;
          createRevision?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) {
      const body = request.body;
      const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'prompt is required' };
      }
      // Build the inference client from the active AI config (reuse the
      // ProtocolHandlers pattern). No AI configured → 409.
      const ai = ctx.appConfig?.ai;
      if (!ai) {
        reply.status(409);
        return { error: 'AI_UNCONFIGURED', message: 'No AI config available for method authoring.' };
      }
      const profile = resolveAiProfile(ai);
      if (!profile?.inference?.baseUrl || !profile?.inference?.model) {
        reply.status(409);
        return { error: 'AI_UNCONFIGURED', message: 'AI inference baseUrl/model not configured.' };
      }
      const authoring = new AnalysisAuthoringService({
        inferenceClient: createInferenceClient(profile.inference),
        inferenceConfig: profile.inference,
      });
      try {
        const result = await authoring.draftMethod({
          prompt,
          inputs: body?.inputs ?? [],
        });
        if (!result.ok || !result.draft) {
          reply.status(422);
          return {
            error: 'DRAFT_FAILED',
            message: `Could not produce a valid method after ${result.attempts} attempts.`,
            details: result.errors,
          };
        }
        // Optionally persist the draft as a real revision.
        let revision: { recordId: string; payload: Record<string, unknown> } | undefined;
        if (body?.createRevision === true) {
          revision = await service.createRevision({
            title: result.draft.title,
            entryScript: result.draft.entryScript,
            sdkVersion: '0.1.0',
            ...(result.draft.methodNotes ? { methodNotes: result.draft.methodNotes } : {}),
            ...(result.draft.inputs.length > 0 ? { inputs: result.draft.inputs } : {}),
            ...(result.draft.parameterSchema ? { parameterSchema: result.draft.parameterSchema } : {}),
          });
        }
        reply.status(revision ? 201 : 200);
        return {
          success: true,
          attempts: result.attempts,
          draft: result.draft,
          ...(revision ? { recordId: revision.recordId, revision: revision.payload } : {}),
        };
      } catch (err) {
        if (err instanceof AnalysisServiceError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        if (err instanceof AnalysisAuthoringError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async executeRun(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      const runner = new AnalysisRunner(ctx);
      try {
        const result = await runner.executeRun(request.params.id);
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof AnalysisServiceError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async promoteArtifactHandler(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) {
      try {
        const result = await promoteArtifact(ctx, request.params.id);
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof AnalysisServiceError) {
          reply.status(err.statusCode);
          return { error: err.code, message: err.message };
        }
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export type AnalysisHandlers = ReturnType<typeof createAnalysisHandlers>;