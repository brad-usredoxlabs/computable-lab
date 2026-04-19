import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { extractAddMaterialVolume, normalizeRef, resolveAddMaterialRef } from '../materials/AddMaterialSupport.js';
import { defaultCanonicalVerbForStepKind } from '../workflow/verbs/protocolVerbRegistry.js';
import { runPromotionCompile } from '../compiler/pipeline/PromotionCompileRunner.js';

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

// Use an absolute path that works both in development and test environments
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// From server/src/protocol/ProtocolExtractionService.ts, go up to server/, then to root, then to schema/
const PROMOTION_COMPILE_PIPELINE_PATH = join(__dirname, '../../../schema/registry/compile-pipelines/promotion-compile.yaml');

type EventGraphEvent = {
  eventId?: unknown;
  event_type?: unknown;
  t_offset?: unknown;
  details?: unknown;
  notes?: unknown;
};

type EventGraphLabware = {
  labwareId?: unknown;
  labwareType?: unknown;
};

type EventGraphPayload = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  events?: unknown;
  labwares?: unknown;
};

type ProtocolRoleSet = {
  labwareRoles: Array<{ roleId: string; description?: string; expectedLabwareKinds?: string[] }>;
  materialRoles: Array<{ roleId: string; description?: string; allowedMaterialIds?: string[] }>;
  instrumentRoles: Array<{ roleId: string; description?: string; allowedInstrumentIds?: string[] }>;
};

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function toIdToken(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed.replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function wellSelectorFromList(wells: unknown): { kind: 'all' } | { kind: 'explicit'; wells: string[] } {
  const values = asStringArray(wells);
  if (values.length === 0) return { kind: 'all' };
  return { kind: 'explicit', wells: values };
}

export class ProtocolExtractionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Extraction draft candidate for protocol extraction.
 */
export interface ProtocolExtractionCandidate {
  target_kind: 'protocol';
  draft: Record<string, unknown>;
  confidence: number;
  evidence_span?: string;
  uncertainty?: 'low' | 'medium' | 'high' | 'unresolved' | 'inferred';
}

/**
 * Extraction draft record for protocol extraction.
 */
export interface ProtocolExtractionDraft {
  kind: 'extraction-draft';
  recordId: string;
  source_artifact: {
    kind: 'file' | 'publication' | 'freetext';
    id: string;
    locator?: string;
  };
  candidates: ProtocolExtractionCandidate[];
  status: 'pending_review' | 'partially_promoted' | 'rejected' | 'promoted';
  notes?: string;
  diagnostics?: Array<{
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    details?: Record<string, unknown>;
    pass_id?: string;
  }>;
  extractor_profile?: string;
}

export class ProtocolExtractionService {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private async nextProtocolId(): Promise<string> {
    const protocols = await this.ctx.store.list({ kind: 'protocol' });
    let max = 0;
    for (const protocol of protocols) {
      const n = parseSuffixNumber(protocol.recordId, 'PRT');
      if (n !== null && n > max) max = n;
    }
    return `PRT-${String(max + 1).padStart(6, '0')}`;
  }

  private async nextExtractionDraftId(): Promise<string> {
    const drafts = await this.ctx.store.list({ kind: 'extraction-draft' });
    let max = 0;
    for (const draft of drafts) {
      const n = parseSuffixNumber(draft.recordId, 'XDR');
      if (n !== null && n > max) max = n;
    }
    return `XDR-${String(max + 1).padStart(6, '0')}`;
  }

  private buildLabwareRoles(payload: EventGraphPayload): {
    roleByLabwareId: Map<string, string>;
    roles: ProtocolRoleSet['labwareRoles'];
  } {
    const roleByLabwareId = new Map<string, string>();
    const roles: ProtocolRoleSet['labwareRoles'] = [];
    const seen = new Set<string>();
    const labwares = Array.isArray(payload.labwares) ? (payload.labwares as EventGraphLabware[]) : [];

    for (const labware of labwares) {
      if (typeof labware.labwareId !== 'string' || labware.labwareId.trim().length === 0) continue;
      const labwareId = labware.labwareId.trim();
      const token = toIdToken(labwareId);
      let roleId = `labware_${token}`;
      let i = 2;
      while (seen.has(roleId)) {
        roleId = `labware_${token}_${i}`;
        i += 1;
      }
      seen.add(roleId);
      roleByLabwareId.set(labwareId, roleId);
      const expectedKinds = typeof labware.labwareType === 'string' && labware.labwareType.trim().length > 0
        ? [labware.labwareType.trim()]
        : undefined;
      roles.push({
        roleId,
        description: `Bound from event graph labware ${labwareId}`,
        ...(expectedKinds ? { expectedLabwareKinds: expectedKinds } : {}),
      });
    }
    return { roleByLabwareId, roles };
  }

  /**
   * Build a protocol body from an event graph payload.
   * This is the core logic that was previously in saveFromEventGraph.
   */
  private buildProtocolBody(payload: EventGraphPayload, sourceEnvelope: RecordEnvelope, input: { title?: string; tags?: string[] }): {
    protocolBody: Record<string, unknown>;
    recordId: string;
  } {
    const recordId = this.nextProtocolId();
    const eventGraphName = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name.trim() : sourceEnvelope.recordId;
    const protocolTitle = typeof input.title === 'string' && input.title.trim().length > 0
      ? input.title.trim()
      : `${eventGraphName} Protocol`;

    const { roleByLabwareId, roles: labwareRoles } = this.buildLabwareRoles(payload);
    const materialRoleById = new Map<string, string>();
    const materialRoles: ProtocolRoleSet['materialRoles'] = [];
    const instrumentRoles: ProtocolRoleSet['instrumentRoles'] = [];

    const ensureLabwareRole = (refInput: unknown): string => {
      const ref = normalizeRef(refInput, 'labware');
      if (!ref) return 'labware_unknown';
      const key = ref.id;
      const existing = roleByLabwareId.get(key);
      if (existing) return existing;
      const roleId = `labware_${toIdToken(key)}`;
      if (!labwareRoles.some((r) => r.roleId === roleId)) {
        labwareRoles.push({
          roleId,
          description: `Inferred labware role for ${key}`,
        });
      }
      roleByLabwareId.set(key, roleId);
      return roleId;
    };

    const ensureMaterialRole = (refInput: unknown): { materialRole: string; materialId?: string } => {
      const ref = normalizeRef(refInput, 'material');
      if (!ref) return { materialRole: 'material_unknown' };
      const key = ref.id;
      const existing = materialRoleById.get(key);
      if (existing) return { materialRole: existing, materialId: key };
      const roleId = `material_${toIdToken(key)}`;
      materialRoleById.set(key, roleId);
      materialRoles.push({
        roleId,
        description: `Inferred material role for ${key}`,
        allowedMaterialIds: [key],
      });
      return { materialRole: roleId, materialId: key };
    };

    const ensurePrimaryInstrumentRole = (): string => {
      const roleId = 'instrument_primary';
      if (!instrumentRoles.some((r) => r.roleId === roleId)) {
        instrumentRoles.push({
          roleId,
          description: 'Primary instrument role inferred from read events',
        });
      }
      return roleId;
    };

    const steps = (payload.events as EventGraphEvent[]).map((event, idx) => {
      const eventType = typeof event.event_type === 'string' ? event.event_type : 'other';
      const details = (event.details && typeof event.details === 'object') ? (event.details as Record<string, unknown>) : {};
      const stepId = typeof event.eventId === 'string' && event.eventId.trim().length > 0
        ? event.eventId.trim()
        : `step_${String(idx + 1).padStart(3, '0')}`;
      const plannedOffset = typeof event.t_offset === 'string' && event.t_offset.trim().length > 0 ? event.t_offset.trim() : undefined;
      const notes = typeof event.notes === 'string' && event.notes.trim().length > 0 ? event.notes.trim() : undefined;

      if (eventType === 'add_material') {
        const targetRole = ensureLabwareRole(details['labwareInstanceId']);
        const material = ensureMaterialRole(resolveAddMaterialRef(details));
        const volume = extractAddMaterialVolume(details);
        return {
          stepId,
          kind: 'add_material',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('add_material') },
          target: { labwareRole: targetRole },
          wells: wellSelectorFromList(details['wells']),
          material: {
            materialRole: material.materialRole,
            ...(material.materialId ? { materialId: material.materialId } : {}),
          },
          volume_uL: volume?.unit === 'mL'
            ? volume.value * 1000
            : volume?.unit === 'uL'
              ? volume.value
              : typeof details['volume_uL'] === 'number'
                ? details['volume_uL']
                : 0.1,
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'transfer') {
        const source = (details['source'] && typeof details['source'] === 'object') ? details['source'] as Record<string, unknown> : {};
        const target = (details['target'] && typeof details['target'] === 'object') ? details['target'] as Record<string, unknown> : {};
        return {
          stepId,
          kind: 'transfer',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('transfer') },
          source: {
            labwareRole: ensureLabwareRole(source['labwareInstanceId']),
            wells: wellSelectorFromList(source['wells']),
          },
          target: {
            labwareRole: ensureLabwareRole(target['labwareInstanceId']),
            wells: wellSelectorFromList(target['wells']),
          },
          volume_uL: typeof details['volume_uL'] === 'number' ? details['volume_uL'] : 0.1,
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'mix') {
        return {
          stepId,
          kind: 'mix',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('mix') },
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          wells: wellSelectorFromList(details['wells']),
          ...(typeof details['cycles'] === 'number' ? { cycles: details['cycles'] } : {}),
          ...(typeof details['volume_uL'] === 'number' ? { volume_uL: details['volume_uL'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'wash') {
        return {
          stepId,
          kind: 'wash',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('wash') },
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          wells: wellSelectorFromList(details['wells']),
          cycles: typeof details['cycles'] === 'number' ? details['cycles'] : 1,
          ...(typeof details['washVolume_uL'] === 'number' ? { washVolume_uL: details['washVolume_uL'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'incubate') {
        return {
          stepId,
          kind: 'incubate',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('incubate') },
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          duration_min: typeof details['duration_min'] === 'number' ? details['duration_min'] : 0.1,
          ...(Array.isArray(details['wells']) ? { wells: wellSelectorFromList(details['wells']) } : {}),
          ...(typeof details['temperature_C'] === 'number' ? { temperature_C: details['temperature_C'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'read') {
        const modality = typeof details['modality'] === 'string' ? details['modality'] : 'other';
        return {
          stepId,
          kind: 'read',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('read') },
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          modality,
          ...(Array.isArray(details['wells']) ? { wells: wellSelectorFromList(details['wells']) } : {}),
          ...(Array.isArray(details['channels']) ? { channels: asStringArray(details['channels']) } : {}),
          instrumentRole: ensurePrimaryInstrumentRole(),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'harvest') {
        const from = (details['from'] && typeof details['from'] === 'object') ? details['from'] as Record<string, unknown> : {};
        return {
          stepId,
          kind: 'harvest',
          semanticVerb: { canonical: defaultCanonicalVerbForStepKind('harvest') },
          source: { labwareRole: ensureLabwareRole(from['labwareInstanceId']) },
          wells: wellSelectorFromList(from['wells']),
          ...(typeof details['volume_uL'] === 'number' ? { volume_uL: details['volume_uL'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      return {
        stepId,
        kind: 'other',
        semanticVerb: { canonical: defaultCanonicalVerbForStepKind('other') },
        description: notes ?? `Autogenerated from unsupported event type: ${eventType}`,
        ...(plannedOffset ? { plannedOffset } : {}),
      };
    });

    const sourceTags = asStringArray(payload.tags);
    const inputTags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim()) : [];
    const mergedTags = Array.from(new Set([...sourceTags, ...inputTags, 'autogenerated', 'source:event-graph']));

    const protocolBody: Record<string, unknown> = {
      protocolLayer: 'universal',
      kind: 'protocol',
      recordId,
      title: protocolTitle,
      description: typeof payload.description === 'string' && payload.description.trim().length > 0
        ? payload.description.trim()
        : `Autogenerated from event graph ${sourceEnvelope.recordId}`,
      state: 'draft',
      tags: mergedTags,
      steps,
      roles: {
        ...(labwareRoles.length > 0 ? { labwareRoles } : {}),
        ...(materialRoles.length > 0 ? { materialRoles } : {}),
        ...(instrumentRoles.length > 0 ? { instrumentRoles } : {}),
      },
    };

    return { protocolBody, recordId };
  }

  /**
   * Extract a protocol from an event graph and persist it as an extraction-draft.
   * 
   * This method builds an extraction-draft containing a single candidate with
   * target_kind='protocol'. The draft is persisted and its recordId is returned.
   * 
   * @param input - Extraction input with event graph id and optional metadata
   * @returns The recordId of the created extraction-draft
   */
  async extractDraftFromEventGraph(input: {
    eventGraphId: string;
    title?: string;
    tags?: string[];
  }): Promise<{ recordId: string; draft: ProtocolExtractionDraft }> {
    if (typeof input.eventGraphId !== 'string' || input.eventGraphId.trim().length === 0) {
      throw new ProtocolExtractionError('BAD_REQUEST', 'eventGraphId is required', 400);
    }

    const sourceEnvelope = await this.ctx.store.get(input.eventGraphId.trim());
    if (!sourceEnvelope) {
      throw new ProtocolExtractionError('NOT_FOUND', `Event graph not found: ${input.eventGraphId}`, 404);
    }

    const payload = sourceEnvelope.payload as EventGraphPayload;
    if (!Array.isArray(payload.events)) {
      throw new ProtocolExtractionError('BAD_REQUEST', `Source record ${input.eventGraphId} does not contain an events array`, 400);
    }

    // Build the protocol body (same logic as before, but don't persist it)
    const { protocolBody, recordId: protocolRecordId } = this.buildProtocolBody(payload, sourceEnvelope, input);

    // Generate extraction-draft recordId
    const draftRecordId = await this.nextExtractionDraftId();

    // Build the extraction-draft with a single candidate
    const candidate: ProtocolExtractionCandidate = {
      target_kind: 'protocol',
      draft: protocolBody,
      confidence: 0.95, // High confidence for event-graph to protocol extraction
    };

    const extractionDraft: ProtocolExtractionDraft = {
      kind: 'extraction-draft',
      recordId: draftRecordId,
      source_artifact: {
        kind: 'file',
        id: sourceEnvelope.recordId,
      },
      candidates: [candidate],
      status: 'pending_review',
    };

    // Persist the extraction-draft
    const draftEnvelope: RecordEnvelope = {
      recordId: draftRecordId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
      payload: extractionDraft,
    };

    const createResult = await this.ctx.store.create({
      envelope: draftEnvelope,
      message: `Create extraction-draft ${draftRecordId} from event graph ${sourceEnvelope.recordId}`,
    });

    if (!createResult.success || !createResult.envelope) {
      if (createResult.validation && !createResult.validation.valid) {
        const validationErrors = createResult.validation.errors?.map(e => `${e.path}: ${e.message}`).join('; ') ?? 'unknown validation error';
        throw new ProtocolExtractionError('VALIDATION_ERROR', `Extraction-draft validation failed: ${validationErrors}`, 422);
      }
      if (createResult.lint && !createResult.lint.valid) {
        const lintErrors = createResult.lint.errors?.map(e => `${e.path}: ${e.message}`).join('; ') ?? 'unknown lint error';
        throw new ProtocolExtractionError('LINT_ERROR', `Extraction-draft lint failed: ${lintErrors}`, 422);
      }
      throw new ProtocolExtractionError('CREATE_FAILED', createResult.error ?? 'Failed to create extraction-draft', 400);
    }

    return {
      recordId: draftRecordId,
      draft: extractionDraft,
    };
  }

  /**
   * Promote an extraction-draft candidate to a canonical protocol record.
   * 
   * This method:
   * 1. Loads the extraction-draft
   * 2. Selects the specified candidate
   * 3. Runs the promotion-compile pipeline
   * 4. Persists the canonical protocol and extraction-promotion audit record
   * 5. Updates the draft status to 'promoted' or 'partially_promoted'
   * 
   * @param draftId - The recordId of the extraction-draft
   * @param candidateIndex - Index of the candidate to promote (0-based)
   * @returns The recordId of the created canonical protocol and audit record
   */
  async promoteDraft(draftId: string, candidateIndex: number): Promise<{
    canonicalRecordId: string;
    auditRecordId: string;
    draftStatus: 'promoted' | 'partially_promoted';
  }> {
    // Load the extraction-draft
    const draftEnvelope = await this.ctx.store.get(draftId);
    if (!draftEnvelope) {
      throw new ProtocolExtractionError('NOT_FOUND', `Extraction-draft not found: ${draftId}`, 404);
    }

    const draft = draftEnvelope.payload as ProtocolExtractionDraft;
    if (draft.kind !== 'extraction-draft') {
      throw new ProtocolExtractionError('BAD_REQUEST', `Record ${draftId} is not an extraction-draft`, 400);
    }

    // Select the candidate
    if (candidateIndex < 0 || candidateIndex >= draft.candidates.length) {
      throw new ProtocolExtractionError('BAD_REQUEST', `Candidate index ${candidateIndex} out of range for draft ${draftId}`, 400);
    }

    const candidate = draft.candidates[candidateIndex];
    if (candidate.target_kind !== 'protocol') {
      throw new ProtocolExtractionError('BAD_REQUEST', `Candidate ${candidateIndex} has target_kind '${candidate.target_kind}', expected 'protocol'`, 400);
    }

    // Run the promotion-compile pipeline
    const promotionResult = await runPromotionCompile({
      pipelinePath: PROMOTION_COMPILE_PIPELINE_PATH,
      candidate: {
        target_kind: candidate.target_kind,
        draft: candidate.draft,
        confidence: candidate.confidence,
      },
      source_draft_id: draftId,
    });

    if (!promotionResult.ok) {
      const errorMessages = promotionResult.diagnostics
        .filter(d => d.severity === 'error')
        .map(d => d.message);
      throw new ProtocolExtractionError(
        'PROMOTION_FAILED',
        `Promotion failed: ${errorMessages.join('; ')}`,
        400,
      );
    }

    // Extract the canonical and audit records from the promotion result
    const canonicalRecord = promotionResult.canonicalRecord as Record<string, unknown> | undefined;
    const auditRecord = promotionResult.auditRecord as Record<string, unknown> | undefined;

    console.log('Promotion result:', {
      ok: promotionResult.ok,
      canonicalRecord,
      auditRecord,
      diagnostics: promotionResult.diagnostics,
      passStatuses: promotionResult.passStatuses,
    });

    if (!canonicalRecord || !auditRecord) {
      throw new ProtocolExtractionError(
        'PROMOTION_FAILED',
        `Promotion did not produce canonical or audit record. canonicalRecord: ${!!canonicalRecord}, auditRecord: ${!!auditRecord}`,
        500,
      );
    }

    // Persist the canonical protocol record
    const canonicalEnvelope: RecordEnvelope = {
      recordId: canonicalRecord.recordId as string,
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: canonicalRecord,
    };

    const canonicalCreateResult = await this.ctx.store.create({
      envelope: canonicalEnvelope,
      message: `Create canonical protocol ${canonicalRecord.recordId} from extraction-draft ${draftId}`,
    });

    if (!canonicalCreateResult.success || !canonicalCreateResult.envelope) {
      throw new ProtocolExtractionError(
        'CREATE_FAILED',
        canonicalCreateResult.error ?? 'Failed to create canonical protocol',
        400,
      );
    }

    // Persist the extraction-promotion audit record
    const auditEnvelope: RecordEnvelope = {
      recordId: auditRecord.recordId as string,
      schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-promotion.schema.yaml',
      payload: auditRecord,
    };

    const auditCreateResult = await this.ctx.store.create({
      envelope: auditEnvelope,
      message: `Create extraction-promotion audit ${auditRecord.recordId} for draft ${draftId}`,
    });

    if (!auditCreateResult.success || !auditCreateResult.envelope) {
      throw new ProtocolExtractionError(
        'CREATE_FAILED',
        auditCreateResult.error ?? 'Failed to create extraction-promotion audit',
        400,
      );
    }

    // Update the draft status
    const newStatus: 'promoted' | 'partially_promoted' = 
      candidateIndex === draft.candidates.length - 1 ? 'promoted' : 'partially_promoted';

    const updateResult = await this.ctx.store.update({
      recordId: draftId,
      patch: {
        status: newStatus,
        promoted_at: new Date().toISOString(),
        promoted_canonical_id: canonicalRecord.recordId,
      },
      message: `Update extraction-draft ${draftId} status to ${newStatus}`,
    });

    if (!updateResult.success) {
      // Log warning but don't throw - the canonical and audit records were created
      console.warn(`Failed to update draft status: ${updateResult.error}`);
    }

    return {
      canonicalRecordId: canonicalRecord.recordId as string,
      auditRecordId: auditRecord.recordId as string,
      draftStatus: newStatus,
    };
  }

  /**
   * Legacy method: Save an event graph as a protocol record.
   * 
   * @deprecated Use extractDraftFromEventGraph + promoteDraft instead.
   * This method is kept for backward compatibility but internally uses the new two-step flow.
   */
  async saveFromEventGraph(input: {
    eventGraphId: string;
    title?: string;
    tags?: string[];
  }): Promise<{ recordId: string; envelope: RecordEnvelope }> {
    // Step 1: Extract draft
    const { recordId: draftId } = await this.extractDraftFromEventGraph(input);

    // Step 2: Promote the first candidate
    const { canonicalRecordId } = await this.promoteDraft(draftId, 0);

    // Load and return the canonical protocol
    const canonicalEnvelope = await this.ctx.store.get(canonicalRecordId);
    if (!canonicalEnvelope) {
      throw new ProtocolExtractionError('NOT_FOUND', `Canonical protocol not found: ${canonicalRecordId}`, 404);
    }

    return {
      recordId: canonicalRecordId,
      envelope: canonicalEnvelope,
    };
  }
}
