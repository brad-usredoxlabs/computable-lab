import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody, ExtractionDraft, ExtractionDraftCandidate } from '../../extract/ExtractionDraftBuilder.js';
import type { RecordStore } from '../../store/types.js';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import type { AjvValidator } from '../../validation/AjvValidator.js';
import type { MetricsSnapshot } from '../../extract/ExtractionMetrics.js';
import { promoteCandidate as promoteCandidateLogic, type PromoteCandidateArgs } from '../../extract/CandidatePromoter.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { extractPdfText } from '../../extract/PdfTextAdapter.js';

type ExtractBody = {
  target_kind?: unknown;
  text?: unknown;
  source?: unknown;
  hint?: unknown;
};

export interface ExtractHandlers {
  extract(
    request: FastifyRequest<{ Body: ExtractBody }>,
    reply: FastifyReply,
  ): Promise<ExtractionDraftBody | ApiError>;
  upload(
    request: FastifyRequest<{ Body: UploadBody }>,
    reply: FastifyReply,
  ): Promise<{ recordId: string } | ApiError>;
  promoteCandidate(
    request: FastifyRequest<{ Params: { id: string; i: string } }>,
    reply: FastifyReply,
  ): Promise<{ success: boolean; recordId?: string; promotionId?: string; error?: string } | ApiError>;
  rejectCandidate(
    request: FastifyRequest<{ Params: { id: string; i: string } }>,
    reply: FastifyReply,
  ): Promise<{ success: boolean; recordId?: string; error?: string } | ApiError>;
  getMetrics(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<MetricsSnapshot | ApiError>;
}

type UploadBody = {
  target_kind?: unknown;
  fileName?: unknown;
  contentBase64?: unknown;
};

export function createExtractHandlers(
  runner: ExtractionRunnerService,
  store: RecordStore,
  schemaRegistry: SchemaRegistry,
  validator: AjvValidator,
  metrics?: { snapshot: () => MetricsSnapshot },
): ExtractHandlers {
  return {
    async extract(request, reply) {
      const body = request.body ?? {};
      const target_kind = typeof body.target_kind === 'string' ? body.target_kind.trim() : '';
      const text = typeof body.text === 'string' ? body.text : '';
      if (!target_kind || !text) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'target_kind and text are required' };
      }
      const source = isValidSource(body.source)
        ? body.source
        : { kind: 'freetext' as const, id: `ad-hoc-${new Date().toISOString()}` };
      const args: RunExtractionServiceArgs = buildArgs(target_kind, text, source, body.hint);
      return runner.run(args);
    },

    async upload(request, reply) {
      const body = request.body ?? {};
      const target_kind = typeof body.target_kind === 'string' ? body.target_kind.trim() : 'protocol';
      const fileName = typeof body.fileName === 'string' ? body.fileName : 'upload.pdf';
      const b64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : '';

      if (!b64) {
        reply.code(400);
        return { error: 'NO_CONTENT', message: 'contentBase64 required' };
      }

      const buffer = Buffer.from(b64, 'base64');
      const pdf = await extractPdfText(buffer);

      if (pdf.diagnostics.some(d => d.severity === 'error')) {
        reply.code(422);
        return { error: 'PDF_PARSE_FAILED', message: pdf.diagnostics[0].message };
      }

      const draftBody = await runner.run({
        target_kind,
        text: pdf.text,
        source: { kind: 'file' as const, id: `upload-${Date.now()}`, locator: fileName },
        fileName,
      });

      // Persist the draft so it shows up in the list
      const envelope: RecordEnvelope = {
        recordId: draftBody.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
        payload: draftBody as unknown as Record<string, unknown>,
      };
      await store.create({
        envelope,
        message: `Persist extraction-draft ${draftBody.recordId} from upload ${fileName}`,
        skipLint: true,
      });

      return { recordId: draftBody.recordId };
    },

    async promoteCandidate(request, reply) {
      const { id, i } = request.params;
      
      // Validate id format (XDR-* prefix)
      if (!/^XDR-[A-Za-z0-9_-]+$/.test(id)) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'Invalid extraction-draft id format (must be XDR-*)' };
      }

      // Validate index is numeric
      const candidateIndex = parseInt(i, 10);
      if (isNaN(candidateIndex) || candidateIndex < 0) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'Invalid candidate index (must be a non-negative integer)' };
      }

      // Get the extraction-draft record
      const draftEnvelope = await store.get(id);
      if (!draftEnvelope) {
        reply.code(404);
        return { error: 'NOT_FOUND', message: 'Extraction draft not found' };
      }

      const draft = draftEnvelope.payload as ExtractionDraft;
      
      // Check if candidate exists
      if (candidateIndex >= draft.candidates.length) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: `Candidate index ${candidateIndex} out of range (0-${draft.candidates.length - 1})` };
      }

      const candidate = draft.candidates[candidateIndex] as ExtractionDraftCandidate;
      
      // Check if candidate is already promoted or rejected
      if (candidate.status === 'promoted') {
        reply.code(409);
        return { error: 'CONFLICT', message: 'Candidate already promoted' };
      }
      if (candidate.status === 'rejected') {
        reply.code(409);
        return { error: 'CONFLICT', message: 'Candidate already rejected' };
      }

      // Build target record id
      const targetRecordId = `CAN-${candidate.target_kind}-${Date.now()}`;
      const promotionRecordId = `XPR-${targetRecordId}-v1`;

      // Build schema id map by extracting kind from schema properties
      const targetSchemaIdByKind = new Map<string, string>();
      for (const schema of schemaRegistry.getAll()) {
        if (!schema.schema.$id) continue;
        
        // Try to extract kind from schema properties
        let kind: string | undefined;
        const props = schema.schema.properties as Record<string, unknown> | undefined;
        if (props?.kind) {
          const kindDef = props.kind as Record<string, unknown>;
          if (typeof kindDef.const === 'string') {
            kind = kindDef.const;
          } else if (Array.isArray(kindDef.enum)) {
            // If kind is an enum, use the first value
            kind = kindDef.enum[0] as string;
          }
        }
        
        if (kind) {
          targetSchemaIdByKind.set(kind, schema.schema.$id);
        }
      }

      // Build candidate path for promotion record
      const candidatePath = `candidates[${candidateIndex}]`;

      // Prepare promotion args
      const promoteArgs: PromoteCandidateArgs = {
        candidate: {
          ...candidate,
          draft: candidate.draft as Record<string, unknown>,
        },
        draftRecordId: id,
        candidatePath,
        sourceArtifactRef: draft.source_artifact,
        targetRecordId,
        promotionRecordId,
        targetSchemaIdByKind,
        validator: {
          validate: (draftData: unknown, schemaId: string) => {
            const result = validator.validate(draftData, schemaId);
            return result.valid ? { ok: true } : { ok: false, errors: result.errors?.map(e => e.message) ?? [] };
          },
        },
      };

      // Run promotion
      const outcome = promoteCandidateLogic(promoteArgs);

      if (!outcome.ok) {
        if (outcome.validation_errors && outcome.validation_errors.length > 0) {
          reply.code(422);
          return { 
            error: 'VALIDATION_ERROR', 
            message: outcome.reason,
            details: { validation_errors: outcome.validation_errors }
          };
        }
        reply.code(400);
        return { error: 'PROMOTION_FAILED', message: outcome.reason };
      }

      // Persist the canonical record
      const canonicalEnvelope: RecordEnvelope = {
        recordId: targetRecordId,
        schemaId: targetSchemaIdByKind.get(candidate.target_kind) ?? '',
        payload: outcome.record,
      };

      const createResult = await store.create({
        envelope: canonicalEnvelope,
        message: `Promoted candidate ${candidateIndex} from extraction-draft ${id}`,
      });

      if (!createResult.success) {
        reply.code(500);
        return { error: 'STORE_ERROR', message: 'Failed to persist canonical record' };
      }

      // Persist the extraction-promotion audit record
      const promotionEnvelope: RecordEnvelope = {
        recordId: promotionRecordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-promotion.schema.yaml',
        payload: outcome.promotion,
      };

      const promotionResult = await store.create({
        envelope: promotionEnvelope,
        message: `Created extraction-promotion for candidate ${candidateIndex} from draft ${id}`,
      });

      if (!promotionResult.success) {
        reply.code(500);
        return { error: 'STORE_ERROR', message: 'Failed to persist promotion record' };
      }

      // Update the draft status
      const updatedCandidates = [...draft.candidates];
      updatedCandidates[candidateIndex] = { ...candidate, status: 'promoted' as const };
      
      let newStatus: 'pending_review' | 'partially_promoted' | 'promoted' = 'pending_review';
      const promotedCount = updatedCandidates.filter(c => c.status === 'promoted').length;
      if (promotedCount === draft.candidates.length) {
        newStatus = 'promoted';
      } else if (promotedCount > 0) {
        newStatus = 'partially_promoted';
      }

      const updatedDraft: ExtractionDraft = {
        ...draft,
        candidates: updatedCandidates,
        status: newStatus,
      };

      const updateResult = await store.update({
        envelope: {
          ...draftEnvelope,
          payload: updatedDraft,
        },
        message: `Updated extraction-draft status to ${newStatus} after promoting candidate ${candidateIndex}`,
      });

      if (!updateResult.success) {
        reply.code(500);
        return { error: 'STORE_ERROR', message: 'Failed to update extraction draft' };
      }

      return { success: true, recordId: targetRecordId, promotionId: promotionRecordId };
    },

    async rejectCandidate(request, reply) {
      const { id, i } = request.params;
      
      // Validate id format (XDR-* prefix)
      if (!/^XDR-[A-Za-z0-9_-]+$/.test(id)) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'Invalid extraction-draft id format (must be XDR-*)' };
      }

      // Validate index is numeric
      const candidateIndex = parseInt(i, 10);
      if (isNaN(candidateIndex) || candidateIndex < 0) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'Invalid candidate index (must be a non-negative integer)' };
      }

      // Get the extraction-draft record
      const draftEnvelope = await store.get(id);
      if (!draftEnvelope) {
        reply.code(404);
        return { error: 'NOT_FOUND', message: 'Extraction draft not found' };
      }

      const draft = draftEnvelope.payload as ExtractionDraft;
      
      // Check if candidate exists
      if (candidateIndex >= draft.candidates.length) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: `Candidate index ${candidateIndex} out of range (0-${draft.candidates.length - 1})` };
      }

      const candidate = draft.candidates[candidateIndex] as ExtractionDraftCandidate;
      
      // Check if candidate is already promoted or rejected
      if (candidate.status === 'rejected') {
        reply.code(409);
        return { error: 'CONFLICT', message: 'Candidate already rejected' };
      }
      if (candidate.status === 'promoted') {
        reply.code(409);
        return { error: 'CONFLICT', message: 'Candidate already promoted' };
      }

      // Update the draft to mark candidate as rejected
      const updatedCandidates = [...draft.candidates];
      updatedCandidates[candidateIndex] = { ...candidate, status: 'rejected' as const };
      
      // Status remains pending_review unless all candidates are rejected
      const rejectedCount = updatedCandidates.filter(c => c.status === 'rejected').length;
      const newStatus: 'pending_review' | 'rejected' = rejectedCount === draft.candidates.length ? 'rejected' : 'pending_review';

      const updatedDraft: ExtractionDraft = {
        ...draft,
        candidates: updatedCandidates,
        status: newStatus,
      };

      const updateResult = await store.update({
        envelope: {
          ...draftEnvelope,
          payload: updatedDraft,
        },
        message: `Updated extraction-draft to reject candidate ${candidateIndex}`,
      });

      if (!updateResult.success) {
        reply.code(500);
        return { error: 'STORE_ERROR', message: 'Failed to update extraction draft' };
      }

      return { success: true };
    },

    async getMetrics(_request, reply) {
      if (!metrics) {
        reply.code(503);
        return { error: 'METRICS_UNAVAILABLE', message: 'Metrics collector not configured' };
      }
      return metrics.snapshot();
    },
  };
}

function buildArgs(
  target_kind: string,
  text: string,
  source: RunExtractionServiceArgs['source'],
  hint?: unknown
): RunExtractionServiceArgs {
  if (hint != null && typeof hint === 'object' && !Array.isArray(hint)) {
    const hintObj = hint as Record<string, unknown>;
    return { target_kind, text, source, hint: hintObj };
  }
  return { target_kind, text, source };
}

function isValidSource(v: unknown): v is RunExtractionServiceArgs['source'] {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (s.kind === 'file' || s.kind === 'publication' || s.kind === 'freetext')
    && typeof s.id === 'string';
}
