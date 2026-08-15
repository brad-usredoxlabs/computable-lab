/**
 * ProtocolPromotionHandlers - Handle promotion of execution runs to protocols
 * 
 * This module provides:
 * - POST /api/protocols/promote-from-run: Generate a protocol draft from an execution run
 * - AI-assisted correction of deviations
 * - Protocol creation with derivedFrom linkage
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import { ExecutionRunService } from '../../execution/ExecutionRunService.js';
import { ExecutionEvidenceService } from '../../execution/ExecutionEvidenceService.js';
import { ExecutionTimelineService } from '../../execution/ExecutionTimelineService.js';
import { createProtocolFromExecutionTrace, type ProtocolDraft } from '../services/ProtocolBuilderService.js';

export interface ProtocolPromotionHandlers {
  /**
   * POST /api/protocols/promote-from-run
   * Generate a protocol draft from an execution run with AI-assisted correction
   */
  promoteFromRun(
    request: FastifyRequest<{
      Body: {
        runId: string;
        protocolName?: string;
        protocolDescription?: string;
        version?: string;
        corrections?: Array<{
          eventId: string;
          originalValue: string;
          correctedValue: string;
          note?: string;
        }>;
      };
    }>,
    reply: FastifyReply,
  ): Promise<{
    success: boolean;
    draft?: {
      protocolName: string;
      protocolDescription?: string;
      version: string;
      steps: Array<{
        eventId: string;
        originalAction: string;
        correctedAction?: string;
        deviationNote?: string;
      }>;
      deviations: Array<{
        eventId: string;
        deviationType: string;
        expectedValue?: string;
        actualValue?: string;
        severity?: string;
        correctionApplied: boolean;
      }>;
      runSummary: {
        runId: string;
        totalSteps: number;
        completedSteps: number;
        deviatedSteps: number;
        duration?: string;
      };
    };
    error?: string;
  } | ApiError>;

  /**
   * POST /api/protocols/create-from-draft
   * Create a protocol record from a draft
   */
  createProtocolFromDraft(
    request: FastifyRequest<{
      Body: {
        draft: ProtocolDraft;
        derivedFromRunId: string;
        studyId?: string;
        projectId?: string;
      };
    }>,
    reply: FastifyReply,
  ): Promise<{
    success: boolean;
    protocolId?: string;
    protocolRecord?: unknown;
    error?: string;
  } | ApiError>;
}

export function createProtocolPromotionHandlers(ctx: AppContext): ProtocolPromotionHandlers {
  const executionRunService = new ExecutionRunService(ctx);
  const evidenceService = new ExecutionEvidenceService(ctx);
  const timelineService = new ExecutionTimelineService(ctx, executionRunService, evidenceService);

  return {
    async promoteFromRun(request, reply) {
      try {
        const { runId, protocolName, protocolDescription, version = '1.0.0', corrections = [] } = request.body;

        // Validate run exists
        const run = await ctx.store.get(runId);
        if (!run) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Execution run not found: ${runId}` };
        }

        // Get execution state and evidence
        const timeline = await timelineService.getTimeline(runId);
        const evidence = await evidenceService.listExecutionEvidence(runId);

        // Get event graph for the run
        const eventGraphResult = await executionRunService.getMaterializedEventGraph(runId);
        if (!eventGraphResult) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `No event graph found for run: ${runId}` };
        }

        const eventGraph = eventGraphResult.record as any;
        const events = eventGraph.events || [];

        // Build step information from events
        const steps = events.map((event: any) => ({
          eventId: event.eventId,
          originalAction: event.action || event.description || 'Unknown action',
          correctedAction: corrections.find((c: any) => c.eventId === event.eventId)?.correctedValue,
          deviationNote: corrections.find((c: any) => c.eventId === event.eventId)?.note,
        }));

        // Build deviation information
        const deviations = (evidence as any).deviations || [];
        const deviationList = deviations.map((dev: any) => ({
          eventId: dev.eventId || dev.details?.eventId,
          deviationType: dev.deviationType || 'operator',
          expectedValue: dev.expectedValue,
          actualValue: dev.actualValue,
          severity: dev.severity || 'info',
          correctionApplied: corrections.some((c: any) => c.eventId === (dev.eventId || dev.details?.eventId)),
        }));

        // Generate AI-assisted protocol draft
        const draft = await createProtocolFromExecutionTrace({
          events,
          deviations: deviationList,
          corrections,
          protocolName: protocolName || `Protocol from run ${runId}`,
          protocolDescription: protocolDescription || `Protocol derived from execution run ${runId}`,
          version,
        });

        // Calculate run summary
        const completedSteps = steps.filter((s: any) => s.correctedAction || !deviationList.some((d: any) => d.eventId === s.eventId)).length;
        const deviatedSteps = deviationList.length;

        const result = {
          success: true,
          draft: {
            ...draft,
            runSummary: {
              runId,
              totalSteps: events.length,
              completedSteps,
              deviatedSteps,
              duration: (timeline as any)?.duration,
            },
            deviations: deviationList,
          },
        };

        return result;
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async createProtocolFromDraft(request, reply) {
      try {
        const { draft, derivedFromRunId, studyId, projectId } = request.body;

        // Validate run exists
        const run = await ctx.store.get(derivedFromRunId);
        if (!run) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Execution run not found: ${derivedFromRunId}` };
        }

        // Create protocol record with evolvedFrom field
        const protocolRecord: any = {
          kind: 'protocol',
          recordId: `PRT-${Date.now()}`, // Generate unique ID
          title: draft.protocolName || `Protocol from run ${derivedFromRunId}`,
          ...(draft.protocolDescription && { description: draft.protocolDescription }),
          version: draft.version || '1.0.0',
          state: 'draft',
          evolvedFrom: [
            {
              sourceType: 'run',
              sourceRef: {
                kind: 'record',
                type: 'execution-run',
                id: derivedFromRunId,
              },
              reason: 'Adapted from execution run with AI-assisted corrections',
              evolvedAt: new Date().toISOString(),
            },
          ],
          steps: draft.steps?.map((step: any, index: number) => ({
            stepId: `step-${index + 1}`,
            action: step.correctedAction || step.originalAction,
            ...(step.deviationNote && { description: step.deviationNote }),
            ordinal: index + 1,
          })) || [],
        };

        if (studyId) {
          protocolRecord.links = { studyId };
        }
        if (projectId) {
          protocolRecord.links = { ...protocolRecord.links, projectId };
        }

        // Create the protocol record
        const result = await ctx.store.create({
          envelope: {
            recordId: protocolRecord.recordId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
            payload: protocolRecord,
            meta: {
              createdAt: new Date().toISOString(),
              createdBy: 'system',
            },
          },
          message: `Create protocol from execution run ${derivedFromRunId}`,
        });

        if (!result.envelope?.recordId) {
          reply.status(500);
          return {
            error: 'INTERNAL_ERROR',
            message: 'Failed to create protocol record',
          };
        }

        return {
          success: true,
          protocolId: result.envelope.recordId,
          protocolRecord,
        };
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
