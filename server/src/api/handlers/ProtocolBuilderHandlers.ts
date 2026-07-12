/**
 * REST handler for POST /api/protocol-builder/extract and POST /api/protocol-builder/redraft.
 *
 * extract: accepts plain text, returns a structured protocol candidate summary.
 * redraft: accepts previous draft + user remarks, returns an updated draft via AI.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '../types.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import { extractVendorProtocolCandidateFromInput } from '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js';
import type { ProtocolCandidate } from '../../ingestion/vendor-protocol/types.js';

/**
 * Request body for the extract endpoint.
 */
interface ExtractProtocolBody {
  text: string;
  documentId?: string;
  vendor?: string;
}

/**
 * Response shape — mirrors AiProtocolCandidateSummary from the frontend types.
 */
interface AiProtocolCandidateSummary {
  kind: 'vendor-protocol-candidate';
  title: string;
  scope?: string;
  materials?: Array<{ label: string; role?: string; confidence?: number }>;
  labware?: Array<{ label: string; role?: string }>;
  equipment?: Array<{ label: string }>;
  steps?: Array<{
    stepNumber?: number;
    text: string;
    materials?: string[];
    labware?: string[];
    equipment?: string[];
    notes?: string[];
    confidence?: number;
  }>;
  diagnostics?: Array<{
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
  }>;
}

interface ProtocolBuilderExtractResponse {
  candidate: AiProtocolCandidateSummary;
  source: {
    inputKind: 'text';
    fileName: string;
    sha256: string;
  };
  document: {
    pageCount: number;
    sectionCount: number;
    tableCount: number;
  };
}

/**
 * Request body for the redraft endpoint.
 */
interface RedraftRequest {
  sourceText: string;
  candidate: Record<string, unknown>;
  previousDraft?: { events: unknown[] };
  remarks: string;
}

/**
 * Response shape for the redraft endpoint.
 */
interface RedraftResponse {
  success: true;
  events: unknown[];
  revisionNumber: number;
  diagnostics: Array<{
    severity: 'info' | 'warning' | 'error';
    code: string;
    message: string;
  }>;
}

export interface ProtocolBuilderHandlers {
  extractProtocol(
    request: FastifyRequest<{ Body: ExtractProtocolBody }>,
    reply: FastifyReply,
  ): Promise<ProtocolBuilderExtractResponse | ApiError>;
  redraft(
    request: FastifyRequest<{ Body: RedraftRequest }>,
    reply: FastifyReply,
  ): Promise<RedraftResponse | ApiError>;
}

/**
 * Map a ProtocolCandidate to AiProtocolCandidateSummary.
 * Mirrors buildProtocolExtractedEvent in AIHandlers.ts.
 */
function mapCandidate(candidate: ProtocolCandidate): AiProtocolCandidateSummary {
  return {
    kind: 'vendor-protocol-candidate' as const,
    title: candidate.title,
    ...(candidate.scope ? { scope: candidate.scope } : {}),
    materials: candidate.materials.map((m) => {
      const entry: { label: string; role?: string; confidence?: number } = { label: m.label };
      if (m.role) entry.role = m.role;
      if (m.confidence != null) entry.confidence = m.confidence;
      return entry;
    }),
    labware: candidate.labware.map((l) => {
      const entry: { label: string; role?: string } = { label: l.label };
      if (l.role) entry.role = l.role;
      return entry;
    }),
    equipment: candidate.equipment.map((e) => ({
      label: e.label,
    })),
    steps: candidate.steps.map((s) => {
      const step: {
        stepNumber?: number;
        text: string;
        materials?: string[];
        labware?: string[];
        equipment?: string[];
        notes?: string[];
        confidence?: number;
      } = {
        ...(s.stepNumber ? { stepNumber: s.stepNumber } : {}),
        text: s.sourceText,
      };
      if (s.materials.length) step.materials = s.materials;
      if (s.labware.length) step.labware = s.labware;
      if (s.equipment.length) step.equipment = s.equipment;
      if (s.notes.length) step.notes = s.notes;
      if (s.confidence) step.confidence = s.confidence;
      return step;
    }),
    diagnostics: candidate.diagnostics.map((d) => ({
      code: d.code,
      severity: d.severity,
      message: d.message,
    })),
  };
}

export function createProtocolBuilderHandlers(
  workspaceRoot: string,
  inferenceConfig?: { baseUrl: string; model: string; temperature?: number },
): ProtocolBuilderHandlers {
  const inferenceClient = inferenceConfig?.baseUrl
    ? createInferenceClient(inferenceConfig)
    : null;

  return {
    async extractProtocol(request, reply) {
      const { text, documentId, vendor } = request.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        reply.status(400);
        return {
          error: 'MISSING_TEXT',
          message: 'text is required and must be a non-empty string',
        };
      }

      try {
        const result = await extractVendorProtocolCandidateFromInput({
          workspaceRoot,
          text: text.trim(),
          fileName: 'pasted-text.txt',
          ...(documentId ? { documentId } : {}),
          ...(vendor ? { vendor } : {}),
          persist: false,
        });

        return {
          candidate: mapCandidate(result.candidate),
          source: {
            inputKind: 'text' as const,
            fileName: result.source.fileName,
            sha256: result.source.sha256,
          },
          document: {
            pageCount: result.document.pageCount,
            sectionCount: result.document.sectionCount,
            tableCount: result.document.tableCount,
          },
        };
      } catch (err) {
        request.log.error(err, 'Protocol extraction failed');
        reply.status(500);
        return {
          error: 'EXTRACTION_ERROR',
          message: `Protocol extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async redraft(request, reply) {
      const body = request.body;
      const { sourceText, candidate, previousDraft, remarks } = body;

      if (!remarks?.trim()) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'Remarks are required for redraft',
        };
      }

      if (!inferenceClient) {
        reply.status(503);
        return {
          success: true,
          events: [],
          revisionNumber: 0,
          diagnostics: [
            {
              severity: 'error',
              code: 'AI_UNAVAILABLE',
              message: 'AI inference is not configured',
            },
          ],
        };
      }

      const prompt = [
        'You are revising a protocol event graph draft based on user feedback.',
        '',
        'User remarks:',
        remarks,
        '',
        'Source protocol candidate:',
        JSON.stringify(candidate, null, 2),
        '',
        'Source text:',
        sourceText?.slice(0, 10000) ?? '(none)',
        '',
        'Previous draft events:',
        previousDraft?.events
          ? JSON.stringify(previousDraft.events, null, 2)
          : 'No previous draft.',
        '',
        'Return a JSON array of revised events. Each event should have: event_id, event_type, source, target, volume_ul, details.',
      ].join('\n');

      try {
        const result = await inferenceClient.complete({
          model: inferenceConfig!.model,
          messages: [{ role: 'user' as const, content: prompt }],
          max_tokens: 4096,
          temperature: inferenceConfig?.temperature ?? 0.1,
        });

        const text = result.choices?.[0]?.message?.content ?? '';
        let events: unknown[] = [];
        const diagnostics: Array<{
          severity: 'info' | 'warning' | 'error';
          code: string;
          message: string;
        }> = [];

        try {
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            events = JSON.parse(jsonMatch[0]);
            diagnostics.push({
              severity: 'info',
              code: 'REDRAFT_SUCCESS',
              message: `Generated ${Array.isArray(events) ? events.length : 0} events`,
            });
          } else {
            const parsed = JSON.parse(text);
            events = parsed.events ?? parsed;
            diagnostics.push({
              severity: 'info',
              code: 'REDRAFT_SUCCESS',
              message: `Generated ${Array.isArray(events) ? events.length : 0} events`,
            });
          }
        } catch {
          diagnostics.push({
            severity: 'warning',
            code: 'PARSE_FAILED',
            message: 'Could not parse AI response as JSON events',
          });
        }

        const revisionNumber = previousDraft?.events ? 2 : 1;

        return { success: true, events, revisionNumber, diagnostics };
      } catch (err) {
        request.log.error(err, 'Redraft failed');
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
