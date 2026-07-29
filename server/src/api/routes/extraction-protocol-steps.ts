/**
 * Extraction Protocol Steps API Routes
 *
 * Endpoints for fetching protocol steps from extraction-draft records.
 * Returns steps in the shape ProtocolTabPanel expects so the execution
 * UI can display AI-extracted protocol candidates without extra client-side
 * conversion.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A step extracted by the AI from a protocol document. */
interface AiProtocolCandidateStepSummary {
  stepNumber?: number;
  title?: string;
  text: string;
  materials?: string[];
  labware?: string[];
  equipment?: string[];
  notes?: string[];
  confidence?: number;
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived';
}

/** A protocol step in the format ProtocolTabPanel expects. */
interface ProtocolStep {
  stepId: string;
  ordinal: number;
  label: string;
  description: string;
  visible: boolean;
  settings: Setting[];
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived' | undefined;
}

interface Setting {
  settingId: string;
  label: string;
  defaultValue: string;
}

/** GET /api/extractions/:extractionId/protocol-steps response */
interface ProtocolStepsResponse {
  steps: ProtocolStep[];
}

/** Error response */
interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an AiProtocolCandidateStepSummary into the ProtocolStep shape
 * that ProtocolTabPanel consumes. Mirrors the frontend `toProtocolStep()`
 * so the API can serve pre-mapped steps when called directly.
 */
function toProtocolStep(
  step: AiProtocolCandidateStepSummary,
  index: number,
): ProtocolStep {
  return {
    stepId: `step-${step.stepNumber ?? index}`,
    ordinal: step.stepNumber ?? index + 1,
    label: step.title ?? `Step ${step.stepNumber ?? index + 1}`,
    description: step.text,
    visible: true,
    settings: [
      ...(step.materials ?? []).map((m, i) => ({
        settingId: `mat-${m}-${i}`,
        label: `Material ${i + 1}`,
        defaultValue: m,
      })),
      ...(step.labware ?? []).map((l, i) => ({
        settingId: `lab-${l}-${i}`,
        label: `Labware ${i + 1}`,
        defaultValue: l,
      })),
      ...(step.equipment ?? []).map((e, i) => ({
        settingId: `eq-${e}-${i}`,
        label: `Equipment ${i + 1}`,
        defaultValue: e,
      })),
    ].filter(Boolean),
    uncertainty: step.uncertainty,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Register extraction protocol steps routes.
 *
 * GET /api/extractions/:extractionId/protocol-steps
 *   Fetch the extraction-draft, pull the first protocol candidate's draft,
 *   and return its steps mapped to the ProtocolTabPanel format.
 */
export function registerExtractionProtocolStepsRoutes(
  _fastify: FastifyInstance,
  ctx: AppContext,
) {
  const fastify = _fastify;

  // ========================================================================
  // GET /api/extractions/:extractionId/protocol-steps
  // ========================================================================
  fastify.get<
    { Params: { extractionId: string } },
    ProtocolStepsResponse | ErrorResponse
  >('/extractions/:extractionId/protocol-steps', async (
    request: FastifyRequest<{ Params: { extractionId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const extractionId = request.params.extractionId;

      // 1. Fetch the extraction-draft record
      const record = await ctx.store.get(extractionId);
      if (!record) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Extraction draft '${extractionId}' not found`,
        };
      }

      const payload = record.payload as Record<string, unknown>;
      if (payload.kind !== 'extraction-draft') {
        reply.status(400);
        return {
          error: 'NOT_AN_EXTRACTION_DRAFT',
          message: `Record '${extractionId}' is not an extraction-draft`,
        };
      }

      // 2. Extract the protocol candidate from candidates[0].draft
      const candidates = (payload.candidates as
        | Array<{ target_kind?: string; draft?: Record<string, unknown> }>
        | undefined
      ) ?? [];

      if (candidates.length === 0) {
        reply.status(404);
        return {
          error: 'NO_CANDIDATES',
          message: `Extraction draft '${extractionId}' has no candidates`,
        };
      }

      const candidate = candidates[0] as {
        target_kind?: string;
        draft?: Record<string, unknown>;
      } | undefined;
      if (!candidate || !candidate.draft) {
        reply.status(404);
        return {
          error: 'NO_DRAFT',
          message: `Candidate 0 in extraction draft '${extractionId}' has no draft`,
        };
      }

      const draft = candidate.draft as Record<string, unknown>;

      // 3. Map the steps to the ProtocolTabPanel format
      const rawSteps = (draft.steps as AiProtocolCandidateStepSummary[]) ?? [];
      const steps: ProtocolStep[] = rawSteps.map((s, i) => toProtocolStep(s, i));

      return { steps };
    } catch (error) {
      console.error('Error fetching extraction protocol steps:', error);
      reply.status(500);
      return {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch protocol steps',
      };
    }
  });
}
