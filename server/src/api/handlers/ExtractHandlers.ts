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
import type { AuditEventService } from '../../governance/AuditEventService.js';
import type { StoreResult } from '../../store/types.js';
import type { SemanticPassRunner } from '../../ingestion/vendor-protocol/SemanticFamilyPass.js';

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
    request: FastifyRequest<{ Params: { id: string; i: string }; Body: PromoteBody }>,
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
  /**
   * W2-6 (OQ1 ruling (ii), P3): POST /extraction/vendor-candidates/:recordId/semantic-draft
   * — wiring-only: param parse -> semantic pass service -> code->status map.
   * NO policy logic here; the response is {recordId: XDR-...} + diagnostics
   * and NEVER a literal-protocol payload or legacy draft-service output (A5).
   */
  semanticDraft(
    request: FastifyRequest<{ Params: { recordId: string } }>,
    reply: FastifyReply,
  ): Promise<{ recordId: string; diagnostics: unknown } | ApiError>;
}

type UploadBody = {
  target_kind?: unknown;
  fileName?: unknown;
  contentBase64?: unknown;
};

type PromoteBody = {
  /** Long-form human-readable protocol text to persist on the promoted canonical record. */
  humanStepsText?: unknown;
};

export function createExtractHandlers(
  runner: ExtractionRunnerService,
  store: RecordStore,
  schemaRegistry: SchemaRegistry,
  validator: AjvValidator,
  metrics?: { snapshot: () => MetricsSnapshot },
  auditService?: AuditEventService,
  semanticPass?: SemanticPassRunner,
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
        return { error: 'PDF_PARSE_FAILED', message: pdf.diagnostics[0]?.message ?? 'PDF parse error' };
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

      // If the source artifact is a record (e.g. a vendor-pdf, which the
      // draft references with kind:'file' + the VPDF-* id), lift its title so
      // the promoted protocol carries a meaningful name instead of a generic
      // extractor draft title ("Quick Reference"). Missing/non-record sources
      // simply yield no sourceTitle → the extractor draft title is unchanged.
      let sourceTitle: string | undefined;
      const sourceArtifactId = draft.source_artifact?.id;
      if (sourceArtifactId) {
        try {
          const srcEnv = await store.get(sourceArtifactId);
          const srcTitle = (srcEnv?.payload as Record<string, unknown> | undefined)?.title;
          if (typeof srcTitle === 'string' && srcTitle.trim()) {
            sourceTitle = srcTitle.trim();
          }
        } catch {
          // Source record unreadable — fall through with no title override.
        }
      }

      // Prepare promotion args
      const bodyHumanStepsText =
        typeof request.body?.humanStepsText === 'string' && request.body.humanStepsText.trim().length > 0
          ? request.body.humanStepsText
          : undefined;
      const promoteArgs: PromoteCandidateArgs = {
        candidate: {
          ...candidate,
          draft: {
            ...(candidate.draft as Record<string, unknown>),
            // Persist the long-form human text on the promoted record when supplied.
            ...(bodyHumanStepsText !== undefined ? { humanStepsText: bodyHumanStepsText } : {}),
          },
        },
        draftRecordId: id,
        candidatePath,
        sourceArtifactRef: draft.source_artifact,
        ...(sourceTitle !== undefined ? { sourceTitle } : {}),
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
        // W2-5 §3.3a: a promoted protocol born non-draft while declaring a
        // lifecycle is refused with the stable code, nothing persisted.
        if (outcome.code === 'PROMOTION_CONTROLLED_ESCALATION') {
          reply.code(422);
          return { error: 'PROMOTION_CONTROLLED_ESCALATION', message: outcome.reason };
        }
        if (outcome.validation_errors && outcome.validation_errors.length > 0) {
          reply.code(422);
          return { 
            error: 'VALIDATION_ERROR', 
            message: outcome.reason,
            details: { validation_errors: outcome.validation_errors }
          };
        }
        reply.code(400);
        // W2-5 §2.1: the ambiguity guard's refusal now names its stable twin
        // code (xdr-promote-blocked-by-unresolved) machine-readably.
        return {
          error: 'PROMOTION_FAILED',
          message: outcome.reason,
          ...(outcome.code !== undefined ? { details: { code: outcome.code } } : {}),
        };
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
        // W2-5 §3.3b — honest errors: a rule rejection (lint/validation
        // findings from the store write wall, RecordStoreImpl.ts:492-504)
        // answers 422 with the actionable machine-readable findings body;
        // 500 STORE_ERROR is reserved for transport failures. Today this
        // swallowed result.lint/result.validation behind a 500.
        const blocked = storeRejectionBody(createResult);
        if (blocked) {
          reply.code(422);
          return blocked;
        }
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
        const blocked = storeRejectionBody(promotionResult);
        if (blocked) {
          reply.code(422);
          return blocked;
        }
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
        const blocked = storeRejectionBody(updateResult);
        if (blocked) {
          reply.code(422);
          return blocked;
        }
        reply.code(500);
        return { error: 'STORE_ERROR', message: 'Failed to update extraction draft' };
      }

      // W2-5 §3.3c — audit the promotion itself (same best-effort service as
      // the lifecycle-transition audit at RecordHandlers.ts:977-995;
      // AuditEventService never fails the business operation). Action name
      // obeys audit-event.schema.yaml:36 (`^[a-z][a-z0-9_]*$`).
      if (auditService) {
        await auditService.append({
          actor: 'system',
          action: 'candidate_promoted',
          subjectType: 'extraction-draft',
          subjectId: id,
          data: {
            candidate_path: candidatePath,
            output_record_id: targetRecordId,
            promotion_record_id: promotionRecordId,
          },
        });
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
        // W2-5 §3.3b: 422 + findings for rule rejections; 5xx only for
        // transport errors (same discipline as the promote half).
        const blocked = storeRejectionBody(updateResult);
        if (blocked) {
          reply.code(422);
          return blocked;
        }
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

    async semanticDraft(request, reply) {
      // Wiring-only (spec §2.3): param parse -> service -> code->status map.
      if (!semanticPass) {
        reply.code(503);
        return { error: 'SEMANTIC_PASS_UNAVAILABLE', message: 'Semantic pass is not configured (no ai.inference endpoint)' };
      }
      const { recordId } = request.params;
      if (!recordId || !/^CAN-[A-Za-z0-9_-]+$/.test(recordId)) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'Invalid vendor-candidate record id (must be CAN-*)' };
      }
      const result = await semanticPass({ candidateRecordId: recordId });
      if (result.ok) {
        // A5: the route ends at the XDR record id + diagnostics — never a
        // literal-protocol payload, never the legacy draft route's output.
        return { recordId: result.recordId, diagnostics: result.diagnostics };
      }
      const status = result.error === 'SEMANTIC_PASS_NO_CANDIDATE' ? 404
        : result.error === 'SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL' ? 400
        : result.error === 'SEMANTIC_PASS_STEP_COVERAGE' ? 422
        : 502;
      reply.code(status);
      return {
        error: result.error,
        message: result.message,
        ...(result.details !== undefined ? { details: result.details } : {}),
      } as ApiError;
    },
  };
}

/**
 * W2-5 §3.3b — translate a store write-wall rejection into the actionable
 * machine-readable body. When a store.create/update carries lint or
 * validation findings (the write wall at RecordStoreImpl.ts:492-504 /
 * :694-701), the promote/reject handlers answer 422 with the rule ids +
 * paths instead of swallowing them behind a 500 STORE_ERROR. Returns null
 * when the failure carries no findings (a transport error → 500).
 */
function storeRejectionBody(result: StoreResult): {
  error: 'PROMOTION_LINT_BLOCKED';
  message: string;
  details: { lint_findings: Array<{ rule_id: string; severity: string; message: string; paths: string[] }> };
} | null {
  const lint = result.lint;
  if (lint && !lint.valid && lint.violations.length > 0) {
    return {
      error: 'PROMOTION_LINT_BLOCKED',
      message: result.error ?? 'Promotion refused by lint rules',
      details: {
        lint_findings: lint.violations.map(v => ({
          rule_id: v.ruleId,
          severity: v.severity,
          message: v.message,
          paths: v.path !== undefined ? [v.path] : [],
        })),
      },
    };
  }
  const validation = result.validation;
  if (validation && !validation.valid) {
    return {
      error: 'PROMOTION_LINT_BLOCKED',
      message: result.error ?? 'Promotion refused by schema validation',
      details: {
        lint_findings: (validation.errors ?? []).map(e => ({
          rule_id: 'schema-validation',
          severity: 'error',
          message: e.message,
          paths: e.path !== undefined ? [e.path] : [],
        })),
      },
    };
  }
  return null;
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
