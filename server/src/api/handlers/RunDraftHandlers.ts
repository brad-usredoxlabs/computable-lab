/**
 * Run-centered draft/accept handlers.
 *
 * Implements the draft/accept lifecycle for each workflow domain:
 * event-graph, meaning, readouts, results, and evidence.
 *
 * Draft endpoints call the AI agent with run-scoped context and return
 * structured proposals without saving. Accept endpoints validate and
 * save records via RecordStore.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import type { AgentOrchestrator, AgentEvent, EditorContext } from '../../ai/types.js';
import type { AiSurface } from '../../ai/systemPrompt.js';
import type { RunContextAssembler } from '../../ai/RunContextAssembler.js';
import { DOMAIN_TOOL_SUBSETS, type DraftDomain } from '../../ai/ToolBridge.js';
import type { LintEngine } from '../../lint/LintEngine.js';
import type { AjvValidator } from '../../validation/AjvValidator.js';

// ---------------------------------------------------------------------------
// Request body shapes
// ---------------------------------------------------------------------------

interface DraftBody {
  prompt: string;
  editorContext?: Record<string, unknown>;
}

interface EventGraphAcceptBody {
  events: Array<Record<string, unknown>>;
  resolutions?: Record<string, string>;
}

interface MeaningAcceptBody {
  changes: Array<{
    changeType: string;
    record: Record<string, unknown>;
    recordId?: string;
    schemaId?: string;
  }>;
}

interface ResultsCreateBody {
  fileName?: string;
  fileRef?: string;
  suggestedParser?: string;
  measurementContextId?: string;
}

interface ResultsApproveBody {
  mappings: Record<string, unknown>;
}

interface EvidenceDraftBody {
  prompt: string;
  measurementContextFilter?: string;
  literatureSourceIds?: string[];
}

interface EvidenceAcceptBody {
  records: Array<{
    kind: 'claim' | 'assertion' | 'evidence';
    recordId: string;
    schemaId: string;
    record: Record<string, unknown>;
  }>;
}

interface InterpretResultsBody {
  measurementContextIds?: string[];
}

interface AssembleEvidenceBody {
  measurementContextIds?: string[];
  includeWellGrouping?: boolean;
}

interface DraftAssertionsBody {
  evidenceIds?: string[];
  checkContradictions?: boolean;
}

interface CheckContradictionsBody {
  statement: string;
  scope?: string;
}

// ---------------------------------------------------------------------------
// Handler interface
// ---------------------------------------------------------------------------

export interface RunDraftHandlers {
  // Event Graph
  draftEventGraph(
    request: FastifyRequest<{ Params: { id: string }; Body: DraftBody }>,
    reply: FastifyReply,
  ): Promise<void | unknown | ApiError>;
  acceptEventGraph(
    request: FastifyRequest<{ Params: { id: string }; Body: EventGraphAcceptBody }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;

  // Meaning
  getMeaning(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
  draftMeaning(
    request: FastifyRequest<{ Params: { id: string }; Body: DraftBody }>,
    reply: FastifyReply,
  ): Promise<void | unknown | ApiError>;
  acceptMeaning(
    request: FastifyRequest<{ Params: { id: string }; Body: MeaningAcceptBody }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;

  // Readouts
  getReadouts(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;

  // Results
  createResults(
    request: FastifyRequest<{ Params: { id: string }; Body: ResultsCreateBody }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
  getResults(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
  approveResults(
    request: FastifyRequest<{ Params: { id: string; jobId: string }; Body: ResultsApproveBody }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;

  // Evidence
  draftEvidence(
    request: FastifyRequest<{ Params: { id: string }; Body: EvidenceDraftBody }>,
    reply: FastifyReply,
  ): Promise<void | unknown | ApiError>;
  acceptEvidence(
    request: FastifyRequest<{ Params: { id: string }; Body: EvidenceAcceptBody }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;

  // Result-to-Evidence Pipeline
  interpretResults(
    request: FastifyRequest<{ Params: { id: string }; Body: InterpretResultsBody }>,
    reply: FastifyReply,
  ): Promise<void | unknown | ApiError>;
  assembleEvidence(
    request: FastifyRequest<{ Params: { id: string }; Body: AssembleEvidenceBody }>,
    reply: FastifyReply,
  ): Promise<void | unknown | ApiError>;
  draftAssertions(
    request: FastifyRequest<{ Params: { id: string }; Body: DraftAssertionsBody }>,
    reply: FastifyReply,
  ): Promise<void | unknown | ApiError>;
  checkContradictions(
    request: FastifyRequest<{ Params: { id: string }; Body: CheckContradictionsBody }>,
    reply: FastifyReply,
  ): Promise<unknown | ApiError>;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface RunDraftHandlersOptions {
  store: RecordStore;
  contextAssembler: RunContextAssembler;
  validator: AjvValidator;
  lintEngine: LintEngine;
  getOrchestrator: () => AgentOrchestrator | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function notFoundReply(reply: FastifyReply, runId: string) {
  reply.status(404);
  return { error: 'NOT_FOUND', message: `Run not found: ${runId}` };
}

function aiUnavailableReply(reply: FastifyReply) {
  reply.status(503);
  return { error: 'AI_UNAVAILABLE', message: 'AI agent is not available. Check AI configuration.' };
}

function badRequestReply(reply: FastifyReply, message: string) {
  reply.status(400);
  return { error: 'INVALID_REQUEST', message };
}

/** Build a minimal EditorContext from run context for the orchestrator. */
function buildMinimalEditorContext(runId: string, contextData: Record<string, unknown>): EditorContext {
  return {
    labwares: [],
    eventSummary: '',
    vocabPackId: 'general',
    availableVerbs: [],
    runId,
    ...contextData,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRunDraftHandlers(options: RunDraftHandlersOptions): RunDraftHandlers {
  const { store, contextAssembler, getOrchestrator } = options;

  /** Run the AI orchestrator with run-scoped context and domain-specific surface + tool subset. */
  async function runDraftAgent(
    runId: string,
    prompt: string,
    domainContext: Record<string, unknown>,
    surface: AiSurface = 'run-workspace',
    domain?: DraftDomain,
    onEvent?: (event: AgentEvent) => void,
  ) {
    const orchestrator = getOrchestrator();
    if (!orchestrator) return null;

    const editorContext = buildMinimalEditorContext(runId, domainContext);

    return orchestrator.run({
      prompt,
      context: editorContext,
      surface,
      ...(domain ? { toolFilter: DOMAIN_TOOL_SUBSETS[domain] } : {}),
      ...(onEvent ? { onEvent } : {}),
    });
  }

  /** Begin an SSE response and return a sendEvent helper. */
  function beginSSE(request: FastifyRequest, reply: FastifyReply): (event: AgentEvent) => void {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    });
    return (event: AgentEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
  }

  return {
    // =====================================================================
    // Event Graph Draft/Accept
    // =====================================================================

    async draftEventGraph(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        return badRequestReply(reply, 'prompt is required');
      }

      const context = await contextAssembler.assembleEventGraphContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Drafting event graph...' });
        const result = await runDraftAgent(
          runId,
          body.prompt,
          context as unknown as Record<string, unknown>,
          'run-workspace:plan',
          'event-graph',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Event graph draft failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },

    async acceptEventGraph(request, reply) {
      const { id: runId } = request.params;
      const { events } = request.body;

      if (!Array.isArray(events) || events.length === 0) {
        return badRequestReply(reply, 'events array is required and must not be empty');
      }

      // Load the run and its event graph
      const context = await contextAssembler.assembleEventGraphContext(runId);
      if (!context) return notFoundReply(reply, runId);
      if (!context.eventGraph) {
        return badRequestReply(reply, 'Run has no event graph to append events to');
      }

      // Load the full event graph record
      const eventGraphEnvelope = await store.get(context.eventGraph.recordId) as RecordEnvelope | null;
      if (!eventGraphEnvelope) {
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: 'Event graph record not found' };
      }

      // Append events to the existing event graph
      const payload = eventGraphEnvelope.payload as Record<string, unknown>;
      const existingEvents = Array.isArray(payload.events) ? payload.events : [];
      const updatedPayload = {
        ...payload,
        events: [...existingEvents, ...events],
      };

      // Save the updated record via store
      try {
        const result = await store.update({
          envelope: {
            recordId: eventGraphEnvelope.recordId,
            schemaId: eventGraphEnvelope.schemaId,
            payload: updatedPayload,
          },
          message: `Accept ${events.length} drafted events for run ${runId}`,
        });

        if (!result.success) {
          reply.status(422);
          return {
            error: 'VALIDATION_FAILED',
            message: result.error ?? 'Event graph update failed validation',
            validation: result.validation,
            lint: result.lint,
          };
        }

        return {
          recordId: eventGraphEnvelope.recordId,
          eventCount: (updatedPayload.events as unknown[]).length,
          envelope: result.envelope,
        };
      } catch (err) {
        request.log.error(err, 'Event graph accept failed');
        reply.status(500);
        return { error: 'SAVE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    // =====================================================================
    // Meaning (Biological Context)
    // =====================================================================

    async getMeaning(request, reply) {
      const { id: runId } = request.params;

      const context = await contextAssembler.assembleMeaningContext(runId);
      if (!context) return notFoundReply(reply, runId);

      return context;
    },

    async draftMeaning(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        return badRequestReply(reply, 'prompt is required');
      }

      const context = await contextAssembler.assembleMeaningContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Drafting meaning...' });
        const result = await runDraftAgent(
          runId,
          body.prompt,
          context as unknown as Record<string, unknown>,
          'run-workspace:biology',
          'meaning',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Meaning draft failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },

    async acceptMeaning(request, reply) {
      const { id: runId } = request.params;
      const { changes } = request.body;

      if (!Array.isArray(changes) || changes.length === 0) {
        return badRequestReply(reply, 'changes array is required and must not be empty');
      }

      // Verify run exists
      const context = await contextAssembler.assembleMeaningContext(runId);
      if (!context) return notFoundReply(reply, runId);

      const createdIds: string[] = [];
      const updatedIds: string[] = [];

      try {
        for (const change of changes) {
          const record = change.record;
          if (!record || typeof record !== 'object') continue;

          const recordId = change.recordId ?? (record.recordId as string | undefined);
          const schemaId = change.schemaId ?? (record.schemaId as string | undefined);

          if (change.changeType.startsWith('create_') && recordId && schemaId) {
            const result = await store.create({
              envelope: { recordId, schemaId, payload: record },
              message: `Accept meaning change (${change.changeType}) for run ${runId}`,
            });
            if (result.success && result.envelope) {
              createdIds.push(result.envelope.recordId);
            }
          } else if (change.changeType.startsWith('update_') && recordId && schemaId) {
            const result = await store.update({
              envelope: { recordId, schemaId, payload: record },
              message: `Accept meaning update (${change.changeType}) for run ${runId}`,
            });
            if (result.success && result.envelope) {
              updatedIds.push(result.envelope.recordId);
            }
          }
        }

        return { createdIds, updatedIds };
      } catch (err) {
        request.log.error(err, 'Meaning accept failed');
        reply.status(500);
        return { error: 'SAVE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    // =====================================================================
    // Readouts
    // =====================================================================

    async getReadouts(request, reply) {
      const { id: runId } = request.params;

      const context = await contextAssembler.assembleReadoutsContext(runId);
      if (!context) return notFoundReply(reply, runId);

      return context;
    },

    // =====================================================================
    // Results
    // =====================================================================

    async createResults(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      // Verify run exists
      const context = await contextAssembler.assembleResultsContext(runId);
      if (!context) return notFoundReply(reply, runId);

      // Create an ingestion job scoped to this run
      const jobId = `ingest-${runId}-${Date.now().toString(36)}`;
      const payload = {
        kind: 'ingestion-job',
        id: jobId,
        runId,
        status: 'pending',
        ...(body.fileName ? { fileName: body.fileName } : {}),
        ...(body.fileRef ? { fileRef: body.fileRef } : {}),
        ...(body.suggestedParser ? { suggestedParser: body.suggestedParser } : {}),
        ...(body.measurementContextId ? { measurementContextId: body.measurementContextId } : {}),
        createdAt: new Date().toISOString(),
      };

      try {
        const result = await store.create({
          envelope: {
            recordId: jobId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/ingestion-job.schema.yaml',
            payload,
          },
          message: `Create ingestion job for run ${runId}`,
          skipValidation: true,
          skipLint: true,
        });

        return {
          jobId,
          recordId: result.envelope?.recordId ?? jobId,
          status: 'pending',
        };
      } catch (err) {
        request.log.error(err, 'Results create failed');
        reply.status(500);
        return { error: 'SAVE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async getResults(request, reply) {
      const { id: runId } = request.params;

      const context = await contextAssembler.assembleResultsContext(runId);
      if (!context) return notFoundReply(reply, runId);

      return context;
    },

    async approveResults(request, reply) {
      const { id: runId, jobId } = request.params;
      const { mappings } = request.body;

      // Verify run exists
      const context = await contextAssembler.assembleResultsContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!mappings || typeof mappings !== 'object') {
        return badRequestReply(reply, 'mappings object is required');
      }

      // Load the job record
      const jobEnvelope = await store.get(jobId) as RecordEnvelope | null;
      if (!jobEnvelope) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Ingestion job not found: ${jobId}` };
      }

      // Update job status and save approved mappings
      try {
        const updatedPayload = {
          ...(jobEnvelope.payload as Record<string, unknown>),
          status: 'approved',
          approvedMappings: mappings,
          approvedAt: new Date().toISOString(),
        };

        const result = await store.update({
          envelope: {
            recordId: jobEnvelope.recordId,
            schemaId: jobEnvelope.schemaId,
            payload: updatedPayload,
          },
          message: `Approve ingestion job ${jobId} for run ${runId}`,
          skipValidation: true,
          skipLint: true,
        });

        return { jobId, status: 'approved', runId, success: result.success };
      } catch (err) {
        request.log.error(err, 'Results approve failed');
        reply.status(500);
        return { error: 'SAVE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    // =====================================================================
    // Evidence Draft/Accept
    // =====================================================================

    async draftEvidence(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        return badRequestReply(reply, 'prompt is required');
      }

      const context = await contextAssembler.assembleEvidenceContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Drafting evidence...' });
        const domainContext: Record<string, unknown> = {
          ...(context as unknown as Record<string, unknown>),
          ...(body.measurementContextFilter ? { measurementContextFilter: body.measurementContextFilter } : {}),
          ...(body.literatureSourceIds ? { literatureSourceIds: body.literatureSourceIds } : {}),
        };

        const result = await runDraftAgent(
          runId,
          body.prompt,
          domainContext,
          'run-workspace:claims',
          'evidence',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Evidence draft failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },

    async acceptEvidence(request, reply) {
      const { id: runId } = request.params;
      const { records } = request.body;

      if (!Array.isArray(records) || records.length === 0) {
        return badRequestReply(reply, 'records array is required and must not be empty');
      }

      // Verify run exists
      const context = await contextAssembler.assembleEvidenceContext(runId);
      if (!context) return notFoundReply(reply, runId);

      const createdIds: string[] = [];

      try {
        for (const entry of records) {
          if (!entry.record || typeof entry.record !== 'object') continue;
          if (!['claim', 'assertion', 'evidence'].includes(entry.kind)) continue;
          if (!entry.recordId || !entry.schemaId) continue;

          const result = await store.create({
            envelope: {
              recordId: entry.recordId,
              schemaId: entry.schemaId,
              payload: entry.record,
            },
            message: `Accept ${entry.kind} record for run ${runId}`,
          });

          if (result.success && result.envelope) {
            createdIds.push(result.envelope.recordId);
          }
        }

        return { createdIds, runId };
      } catch (err) {
        request.log.error(err, 'Evidence accept failed');
        reply.status(500);
        return { error: 'SAVE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    // =====================================================================
    // Result Interpretation (B1)
    // =====================================================================

    async interpretResults(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      const context = await contextAssembler.assembleResultsContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Interpreting results...' });

        const prompt = body.measurementContextIds?.length
          ? `Interpret the results for measurement contexts: ${body.measurementContextIds.join(', ')}. For each context, provide: key findings, statistical summaries (means, ranges, outlier flags), comparisons between treatment and control groups if well roles are assigned, and QC flags (missing data, unexpected values, high variance). Group the interpretation by measurement context.`
          : 'Interpret all results for this run. For each measurement context, provide: key findings, statistical summaries (means, ranges, outlier flags), comparisons between treatment and control groups if well roles are assigned, and QC flags (missing data, unexpected values, high variance). Group the interpretation by measurement context.';

        const domainContext: Record<string, unknown> = {
          ...(context as unknown as Record<string, unknown>),
          ...(body.measurementContextIds ? { measurementContextFilter: body.measurementContextIds } : {}),
        };

        const result = await runDraftAgent(
          runId,
          prompt,
          domainContext,
          'run-workspace:results' as AiSurface,
          'evidence',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Result interpretation failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },

    // =====================================================================
    // Evidence Assembly (B2)
    // =====================================================================

    async assembleEvidence(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      const context = await contextAssembler.assembleEvidenceContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Assembling evidence from results...' });

        const contextFilters: string[] = [];
        if (body.measurementContextIds?.length) {
          contextFilters.push(`Focus on measurement contexts: ${body.measurementContextIds.join(', ')}.`);
        }
        if (body.includeWellGrouping) {
          contextFilters.push('Group evidence by well groups where applicable.');
        }

        const prompt = `Assemble evidence records from the measurements in this run. For each proposed evidence record, include: evidenceType "experimental", sourceRunId "${runId}", measurementContextId, wellGroupId (if applicable), a human-readable summary of what the evidence shows, and a confidence score. ${contextFilters.join(' ')} Return structured evidence proposals.`;

        const domainContext: Record<string, unknown> = {
          ...(context as unknown as Record<string, unknown>),
          ...(body.measurementContextIds ? { measurementContextFilter: body.measurementContextIds } : {}),
          ...(body.includeWellGrouping !== undefined ? { includeWellGrouping: body.includeWellGrouping } : {}),
        };

        const result = await runDraftAgent(
          runId,
          prompt,
          domainContext,
          'run-workspace:claims',
          'evidence',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Evidence assembly failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },

    // =====================================================================
    // Assertion Drafting (B3)
    // =====================================================================

    async draftAssertions(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      const context = await contextAssembler.assembleEvidenceContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Drafting assertions from evidence...' });

        const evidenceFilter = body.evidenceIds?.length
          ? `Focus on evidence records: ${body.evidenceIds.join(', ')}.`
          : 'Consider all available evidence for this run.';
        const contradictionInstructions = body.checkContradictions !== false
          ? 'Check for contradictions against existing assertions in the same study, claims in the knowledge graph, and literature-derived claims. Report any contradictions with type (same_study, knowledge_graph, literature), severity, and conflicting statement.'
          : '';

        const prompt = `Draft assertion records from the evidence in this run. ${evidenceFilter} For each proposed assertion, include: statement (the scientific claim), scope (what it applies to), evidenceIds (supporting evidence), confidence score, unresolvedQuestions, and contradictions. ${contradictionInstructions} Return structured assertion proposals.`;

        const domainContext: Record<string, unknown> = {
          ...(context as unknown as Record<string, unknown>),
          ...(body.evidenceIds ? { evidenceFilter: body.evidenceIds } : {}),
          checkContradictions: body.checkContradictions !== false,
        };

        const result = await runDraftAgent(
          runId,
          prompt,
          domainContext,
          'run-workspace:claims',
          'evidence',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Assertion drafting failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },

    // =====================================================================
    // Contradiction Check (B4)
    // =====================================================================

    async checkContradictions(request, reply) {
      const { id: runId } = request.params;
      const body = request.body;

      if (!body.statement || typeof body.statement !== 'string' || body.statement.trim().length === 0) {
        return badRequestReply(reply, 'statement is required');
      }

      const context = await contextAssembler.assembleEvidenceContext(runId);
      if (!context) return notFoundReply(reply, runId);

      if (!getOrchestrator()) return aiUnavailableReply(reply);

      const sendEvent = beginSSE(request, reply);
      try {
        sendEvent({ type: 'status', message: 'Checking for contradictions...' });

        const scopeClause = body.scope ? ` within the scope of "${body.scope}"` : '';
        const prompt = `Check the following assertion for contradictions${scopeClause}: "${body.statement}". Compare against: (1) existing assertions in this run's study/experiment, (2) existing claims in the knowledge graph, (3) literature-derived claims. For each contradiction found, report: type (same_study, knowledge_graph, or literature), the conflicting recordId and statement, and a severity level (low, medium, high). Return structured contradiction results.`;

        const domainContext: Record<string, unknown> = {
          ...(context as unknown as Record<string, unknown>),
          targetStatement: body.statement,
          ...(body.scope ? { targetScope: body.scope } : {}),
        };

        const result = await runDraftAgent(
          runId,
          prompt,
          domainContext,
          'run-workspace:claims',
          'evidence',
          sendEvent,
        );
        sendEvent({ type: 'done', result: result! });
      } catch (err) {
        request.log.error(err, 'Contradiction check failed');
        sendEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
      return;
    },
  };
}
