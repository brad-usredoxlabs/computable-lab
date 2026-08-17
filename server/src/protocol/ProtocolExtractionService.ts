import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { extractAddMaterialVolume, normalizeRef, resolveAddMaterialRef } from '../materials/AddMaterialSupport.js';
import { defaultCanonicalVerbForStepKind } from '../workflow/verbs/protocolVerbRegistry.js';
import { runPromotionCompile } from '../compiler/pipeline/PromotionCompileRunner.js';
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProtocolCandidate, ProtocolStepCandidate, ExtractedCandidateItem } from '../ingestion/vendor-protocol/types.js';
import { extractVendorProtocolCandidateFromInput } from '../ingestion/vendor-protocol/VendorProtocolCandidateService.js';
import { deriveBranchAxes } from '../ingestion/vendor-protocol/deriveBranchAxes.js';

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

// Use an absolute path that works both in development and test environments
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// From server/src/protocol/ProtocolExtractionService.ts, go up to server/, then to root, then to schema/
const PROMOTION_COMPILE_PIPELINE_PATH = join(__dirname, '../../../schema/registry/compile-pipelines/promotion-compile.yaml');

/**
 * Sanitize a document ID into a filesystem-safe filename.
 * Mirrors safeFileName from VendorProtocolCandidateService.
 */
function safeFileName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'vendor-protocol-candidate';
}

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

/**
 * Map an extracted concentration quantity to the concentration-first
 * `working_concentration` datatype shape ({ value, unit, basis }). Returns null
 * when the extraction has no usable value+unit, or the unit is not in the
 * concentration schema enum — so the caller falls back to legacy `volume_uL`.
 */
function toWorkingConcentration(conc: { raw?: string; value?: number; unit?: string } | null | undefined): Record<string, unknown> | null {
  if (!conc) return null;
  if (typeof conc.value !== 'number' || !Number.isFinite(conc.value) || conc.value <= 0) return null;
  const unit = typeof conc.unit === 'string' ? conc.unit.trim() : '';
  if (!unit) return null;
  const basis = inferConcentrationBasisRaw(unit);
  if (!basis) return null;
  return { value: conc.value, unit: normalizeConcentrationUnit(unit), basis };
}

/**
 * Map a concentration unit to its schema basis (molar / mass_per_volume /
 * activity_per_volume / count_per_volume / volume_fraction / mass_fraction).
 * Mirrors the concentration datatype's unit→basis table without calling into the
 * materials module (kept local to the extraction service).
 */
function inferConcentrationBasisRaw(unit: string): string | null {
  const u = unit.replace('μ', 'u').replace('µ', 'u').trim();
  if (/^u?M$/i.test(u) || /^(m|u|n|p|f)M$/i.test(u)) return 'molar';
  if (/^(g\/L|mg\/mL|ug\/mL|ng\/mL)$/i.test(u)) return 'mass_per_volume';
  if (/^U\/(mL|uL)$/i.test(u)) return 'activity_per_volume';
  if (/^cells\/(mL|uL)$/i.test(u)) return 'count_per_volume';
  if (/^% v\/v$/i.test(u)) return 'volume_fraction';
  if (/^% w\/v$/i.test(u)) return 'mass_fraction';
  return null;
}

function normalizeConcentrationUnit(unit: string): string {
  return unit.replace('μ', 'u').replace('µ', 'u');
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
  private async buildProtocolBody(payload: EventGraphPayload, sourceEnvelope: RecordEnvelope, input: { title?: string; tags?: string[] }): Promise<{
    protocolBody: Record<string, unknown>;
    recordId: string;
  }> {
    const recordId = await this.nextProtocolId();
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
    const { protocolBody } = await this.buildProtocolBody(payload, sourceEnvelope, input);

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
        const validationErrors = createResult.validation.errors?.map((e: { path: string; message: string }) => `${e.path}: ${e.message}`).join('; ') ?? 'unknown validation error';
        throw new ProtocolExtractionError('VALIDATION_ERROR', `Extraction-draft validation failed: ${validationErrors}`, 422);
      }
      if (createResult.lint && !createResult.lint.valid) {
        const lintErrors = createResult.lint.violations?.map((v: { path?: string; message: string }) => `${v.path ?? '/'}: ${v.message}`).join('; ') ?? 'unknown lint error';
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
    if (!candidate) {
      throw new ProtocolExtractionError('BAD_REQUEST', `Candidate at index ${candidateIndex} not found for draft ${draftId}`, 400);
    }
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

    // Update the draft payload with new status
    const updatedDraft: ProtocolExtractionDraft = {
      ...draft,
      status: newStatus,
      notes: draft.notes ? `${draft.notes}\n\nPromoted at ${new Date().toISOString()}: ${canonicalRecord.recordId}` : `Promoted at ${new Date().toISOString()}: ${canonicalRecord.recordId}`,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...draftEnvelope,
      payload: updatedDraft,
    };

    const updateResult = await this.ctx.store.update({
      envelope: updatedEnvelope,
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

  // ---------------------------------------------------------------------------
  // Vendor-PDF → extraction-draft bridge
  // ---------------------------------------------------------------------------

  /**
   * Create an extraction-draft from a first-class vendor-pdf record.
   *
   * Loads the vendor-pdf, obtains its ProtocolCandidate (either from the
   * persisted candidate JSON artifact or by re-extracting from extractedText),
   * maps the candidate into a universal-protocol-shaped draft, and persists
   * an extraction-draft so the existing review/promote flow can complete it.
   *
   * @param input - vendor-pdf id, optional regenerate flag, and optional title
   * @returns The recordId and draft of the created extraction-draft
   */
  async createDraftFromVendorPdf(input: {
    vendorPdfId: string;
    regenerate?: boolean;
    title?: string;
  }): Promise<{ recordId: string; draft: ProtocolExtractionDraft }> {
    if (typeof input.vendorPdfId !== 'string' || input.vendorPdfId.trim().length === 0) {
      throw new ProtocolExtractionError('BAD_REQUEST', 'vendorPdfId is required', 400);
    }

    const vendorPdfId = input.vendorPdfId.trim();

    // 1. Load the vendor-pdf record
    const vendorPdfEnvelope = await this.ctx.store.get(vendorPdfId);
    if (!vendorPdfEnvelope) {
      throw new ProtocolExtractionError('NOT_FOUND', `Vendor PDF not found: ${vendorPdfId}`, 404);
    }

    const vendorPdfPayload = vendorPdfEnvelope.payload as Record<string, unknown>;

    // 2. Determine documentId
    const vpcRef = vendorPdfPayload.vendorProtocolCandidateRef as { kind?: string; type?: string; id?: string } | undefined;
    const documentId = typeof vpcRef?.id === 'string' && vpcRef.id.trim().length > 0
      ? vpcRef.id.trim()
      : vendorPdfId;

    // 3. Resolve workspaceRoot
    const workspaceRoot = this.ctx.workspaceRoot;

    // 4. Obtain a ProtocolCandidate
    let candidate: ProtocolCandidate;

    if (input.regenerate === true) {
      // Always re-extract from the vendor-pdf's extractedText
      const extractedTextArr = vendorPdfPayload.extractedText as Array<{ text?: string }> | undefined;
      const joinedText = extractedTextArr
        ? extractedTextArr.map(p => typeof p.text === 'string' ? p.text : '').join('\n\n')
        : '';
      if (!joinedText) {
        throw new ProtocolExtractionError('BAD_REQUEST', `Vendor PDF ${vendorPdfId} has no extractedText to re-extract from`, 400);
      }
      const extractionResult = await extractVendorProtocolCandidateFromInput({
        workspaceRoot,
        text: joinedText,
        documentId,
        fileName: typeof vendorPdfPayload.title === 'string' ? vendorPdfPayload.title : vendorPdfId,
        persist: true,
      });
      candidate = extractionResult.candidate;
    } else {
      // Try to load the candidate from the persisted JSON artifact
      const candidatePath = join(workspaceRoot, 'artifacts', 'foundry', 'protocol-candidates', `${safeFileName(documentId)}.json`);
      try {
        await access(candidatePath);
        const raw = await readFile(candidatePath, 'utf-8');
        candidate = JSON.parse(raw);
      } catch {
        // File not found — fall back to re-extracting from extractedText
        const extractedTextArr = vendorPdfPayload.extractedText as Array<{ text?: string }> | undefined;
        const joinedText = extractedTextArr
          ? extractedTextArr.map(p => typeof p.text === 'string' ? p.text : '').join('\n\n')
          : '';
        if (!joinedText) {
          throw new ProtocolExtractionError('BAD_REQUEST', `Vendor PDF ${vendorPdfId} has no extractedText and no cached candidate`, 400);
        }
        const extractionResult = await extractVendorProtocolCandidateFromInput({
          workspaceRoot,
          text: joinedText,
          documentId,
          fileName: typeof vendorPdfPayload.title === 'string' ? vendorPdfPayload.title : vendorPdfId,
          persist: true,
        });
        candidate = extractionResult.candidate;
      }
    }

    // 5. Mint the canonical protocol recordId that this draft will become on promote.
    //    protocol.schema.yaml requires top-level `recordId` (the promote path validates
    //    the candidate.draft against the real schema), so the vendor mapper MUST emit it.
    const protocolRecordId = await this.nextProtocolId();

    // 6. Build the universal-protocol-shaped draft
    const draftBody = this.buildProtocolBodyFromCandidate(candidate, {
      title: input.title ?? undefined,
      vendorPdfId,
      recordId: protocolRecordId,
    });

    // 7. Generate extraction-draft recordId
    const draftRecordId = await this.nextExtractionDraftId();

    // 8. Build and persist the extraction-draft
    const protocolCandidate: ProtocolExtractionCandidate = {
      target_kind: 'protocol',
      draft: draftBody,
      confidence: 0.7,
    };

    const extractionDraft: ProtocolExtractionDraft = {
      kind: 'extraction-draft',
      recordId: draftRecordId,
      source_artifact: {
        kind: 'file',
        id: vendorPdfId,
      },
      candidates: [protocolCandidate],
      status: 'pending_review',
    };

    const draftEnvelope: RecordEnvelope = {
      recordId: draftRecordId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
      payload: extractionDraft,
    };

    const createResult = await this.ctx.store.create({
      envelope: draftEnvelope,
      message: `Create extraction-draft ${draftRecordId} from vendor-pdf ${vendorPdfId}`,
    });

    if (!createResult.success || !createResult.envelope) {
      if (createResult.validation && !createResult.validation.valid) {
        const validationErrors = createResult.validation.errors?.map((e: { path: string; message: string }) => `${e.path}: ${e.message}`).join('; ') ?? 'unknown validation error';
        throw new ProtocolExtractionError('VALIDATION_ERROR', `Extraction-draft validation failed: ${validationErrors}`, 422);
      }
      throw new ProtocolExtractionError('CREATE_FAILED', createResult.error ?? 'Failed to create extraction-draft', 400);
    }

    return {
      recordId: draftRecordId,
      draft: extractionDraft,
    };
  }

  /**
   * Map a ProtocolCandidate into a universal-protocol-shaped draft body.
   *
   * Maps candidate action kinds → protocol step kinds:
   *   add → add_material
   *   transfer → transfer
   *   mix → mix
   *   incubate → incubate
   *   aspirate/discard/centrifuge/magnetize/dry/elute/seal/repeat/other → other
   *
   * Populates roles from candidate materials/labware/equipment lists.
   */
  private buildProtocolBodyFromCandidate(
    pc: ProtocolCandidate,
    opts: { title: string | undefined; vendorPdfId: string; recordId: string },
  ): Record<string, unknown> {
    // --- Roles ---
    const seenRoleIds = new Set<string>();
    const ensureRoleId = (prefix: string, label: string): string => {
      const token = toIdToken(label);
      let roleId = `${prefix}_${token}`;
      let i = 2;
      while (seenRoleIds.has(roleId)) {
        roleId = `${prefix}_${token}_${i}`;
        i += 1;
      }
      seenRoleIds.add(roleId);
      return roleId;
    };

    const materialRoles: Array<{ roleId: string; description?: string; allowedMaterialIds?: string[] }> = pc.materials.map((m: ExtractedCandidateItem) => {
      const roleId = ensureRoleId('material', m.label);
      return { roleId, description: m.sourceText };
    });

    const labwareRoles: Array<{ roleId: string; description?: string; expectedLabwareKinds?: string[] }> = pc.labware.map((l: ExtractedCandidateItem) => {
      const roleId = ensureRoleId('labware', l.label);
      return { roleId, description: l.sourceText };
    });

    const instrumentRoles: Array<{ roleId: string; description?: string; allowedInstrumentIds?: string[] }> = pc.equipment.map((e: ExtractedCandidateItem) => {
      const roleId = ensureRoleId('instrument', e.label);
      return { roleId, description: e.sourceText };
    });

    // Build a label→roleId map for lookups
    const materialLabelToRole = new Map<string, string>();
    for (const m of pc.materials) {
      const roleId = ensureRoleId('material', m.label);
      materialLabelToRole.set(m.label, roleId);
    }
    // Re-compute (roles above already created them; this is for the map)
    const labwareLabelToRole = new Map<string, string>();
    for (const l of pc.labware) {
      const roleId = ensureRoleId('labware', l.label);
      labwareLabelToRole.set(l.label, roleId);
    }
    const equipmentLabelToRole = new Map<string, string>();
    for (const e of pc.equipment) {
      const roleId = ensureRoleId('instrument', e.label);
      equipmentLabelToRole.set(e.label, roleId);
    }

    // --- Steps ---
    const steps: Record<string, unknown>[] = pc.steps.map((step: ProtocolStepCandidate, idx: number) => {
      const stepId = `step-${String(idx + 1).padStart(3, '0')}`;
      const ordinal = step.stepNumber > 0 ? step.stepNumber : idx + 1;
      const label = step.substep || step.sourceText || `Step ${ordinal}`;
      const notes = step.notes.length > 0 ? step.notes.join('; ') : undefined;

      // Determine the dominant action kind from the step's actions
      const action = step.actions.length > 0 ? step.actions[0] : null;
      const actionKind = (action ? action.actionKind : 'other') as string;

      const protocolStep = this.mapActionToProtocolStep({
        actionKind,
        step,
        stepId,
        ordinal,
        label,
        notes,
        materialLabelToRole,
        labwareLabelToRole,
        equipmentLabelToRole,
      });

      return protocolStep;
    });

    // Fallback: if there are no steps, produce a single placeholder step
    if (steps.length === 0) {
      steps.push({
        stepId: 'step-001',
        ordinal: 1,
        label: 'Protocol steps not detected',
        kind: 'other',
        description: 'No actionable steps were extracted from the vendor protocol.',
      });
    }

    // --- Protocol body ---
    const protocolTitle = opts.title
      ? opts.title.trim()
      : (pc.title?.trim() ? pc.title.trim() : `Vendor Protocol ${opts.vendorPdfId}`);

    const rolesObj: Record<string, unknown> = {};
    if (labwareRoles.length > 0) rolesObj.labwareRoles = labwareRoles;
    if (materialRoles.length > 0) rolesObj.materialRoles = materialRoles;
    if (instrumentRoles.length > 0) rolesObj.instrumentRoles = instrumentRoles;

    const draftBody: Record<string, unknown> = {
      protocolLayer: 'universal',
      kind: 'protocol',
      recordId: opts.recordId,
      title: protocolTitle,
      state: 'draft',
      steps,
      roles: rolesObj,
      tags: ['autogenerated', 'source:vendor'],
      source: {
        type: 'vendor',
        ref: {
          kind: 'record',
          type: 'vendor-pdf',
          id: opts.vendorPdfId,
        },
      },
    };

    if (pc.scope) {
      draftBody.description = pc.scope;
    }

    // Task 3 — condition-first localization template: lift the vendor step
    // branches[] (the lettered if/then/else sub-options) into declarative
    // branch_axes so the branches become executable step selections instead of
    // being dropped at protocol build. No-op for candidates without branchy
    // steps (branches [] → deriveBranchAxes returns []), keeping existing
    // outputs byte-identical. stepIds are aligned to the mapper's index-based
    // `step-NNN` ids above.
    const branchAxes = deriveBranchAxes(
      pc.steps.map((s, idx) => ({
        stepId: `step-${String(idx + 1).padStart(3, '0')}`,
        branches: s.branches,
      })),
    );
    if (branchAxes.length > 0) {
      draftBody.branch_axes = branchAxes;
    }

    return draftBody;
  }

  /**
   * Map a ProtocolActionCandidate's actionKind to a protocol step.
   */
  private mapActionToProtocolStep(params: {
    actionKind: string;
    step: ProtocolStepCandidate;
    stepId: string;
    ordinal: number;
    label: string;
    notes: string | undefined;
    materialLabelToRole: Map<string, string>;
    labwareLabelToRole: Map<string, string>;
    equipmentLabelToRole: Map<string, string>;
  }): Record<string, unknown> {
    const { actionKind, step, stepId, ordinal, label, notes, materialLabelToRole, labwareLabelToRole, equipmentLabelToRole: _eltr } = params;
    void _eltr; // reserved for future instrument role resolution
    const action = step.actions[0] ?? null;

    // Resolve target labware role
    const targetLabel = action?.target ?? step.labware[0] ?? null;
    const targetRole = targetLabel ? (labwareLabelToRole.get(targetLabel) ?? 'labware_default') : 'labware_default';
    const sourceLabel = action?.source ?? null;
    const sourceRole = sourceLabel ? (labwareLabelToRole.get(sourceLabel) ?? 'labware_source') : 'labware_source';

    // Material role lookup
    const materialLabel = action?.material ?? step.materials[0] ?? null;
    const materialRole = materialLabel ? (materialLabelToRole.get(materialLabel) ?? 'material_unknown') : 'material_unknown';

    // Extract scalar quantities
    const volume = action?.volume ?? step.conditions?.volumes?.[0] ?? null;
    const concentration = action?.concentration ?? null;
    const duration = action?.duration ?? step.conditions?.durations?.[0] ?? null;
    const temperature = action?.temperature ?? step.conditions?.temperatures?.[0] ?? null;

    const volumeUl = typeof volume?.value === 'number' ? volume.value : undefined;
    const durationMin = typeof duration?.value === 'number' ? duration.value : undefined;
    const temperatureC = typeof temperature?.value === 'number' ? temperature.value : undefined;
    // Concentration-first: when the source gives a final working concentration
    // (e.g. "10 nM"), emit `working_concentration` (reusing the concentration
    // datatype) instead of baking an absolute volume, so the recipe is stock-
    // and scale-invariant. Only usable when both value + a known unit present.
    const workingConcentration = toWorkingConcentration(concentration);

    // Base fields every step gets
    const base: Record<string, unknown> = {
      stepId,
      ordinal,
      label,
    };
    if (notes) base.notes = notes;

    const canonicalVerb = defaultCanonicalVerbForStepKind.bind(null);

    switch (actionKind) {
      case 'add':
        return {
          ...base,
          kind: 'add_material',
          semanticVerb: { canonical: canonicalVerb('add_material') },
          target: { labwareRole: targetRole },
          wells: { kind: 'all' },
          material: { materialRole },
          // Concentration-first: use working_concentration when the source gave a
          // final concentration; only then fall back to legacy volume_uL.
          ...(workingConcentration ? { working_concentration: workingConcentration } : { volume_uL: volumeUl ?? 0.1 }),
        };

      case 'transfer':
        return {
          ...base,
          kind: 'transfer',
          semanticVerb: { canonical: canonicalVerb('transfer') },
          source: { labwareRole: sourceRole, wells: { kind: 'all' } },
          target: { labwareRole: targetRole, wells: { kind: 'all' } },
          volume_uL: volumeUl ?? 0.1,
        };

      case 'mix':
        return {
          ...base,
          kind: 'mix',
          semanticVerb: { canonical: canonicalVerb('mix') },
          target: { labwareRole: targetRole },
          wells: { kind: 'all' },
          ...(volumeUl ? { volume_uL: volumeUl } : {}),
        };

      case 'incubate':
        return {
          ...base,
          kind: 'incubate',
          semanticVerb: { canonical: canonicalVerb('incubate') },
          target: { labwareRole: targetRole },
          duration_min: durationMin ?? 0.1,
          ...(temperatureC ? { temperature_C: temperatureC } : {}),
        };

      // Everything else → kind: 'other' with a description
      default:
        return {
          ...base,
          kind: 'other',
          semanticVerb: { canonical: canonicalVerb('other') },
          description: step.sourceText || `Vendor action: ${actionKind}`,
          ...(volumeUl ? { volume_uL: volumeUl } : {}),
          ...(durationMin ? { duration_min: durationMin } : {}),
          ...(temperatureC ? { temperature_C: temperatureC } : {}),
        };
    }
  }
}
