import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../server.js';
import type { ApiError } from '../types.js';
import type { RecordEnvelope, RecordStore, StoreResult } from '../../store/types.js';
import { getInstrumentRegistry, type InstrumentDefinition } from '../../registry/InstrumentRegistry.js';
import { getReadoutDefinitionRegistry, type ReadoutDefinition } from '../../registry/ReadoutDefinitionRegistry.js';
import { getAssayDefinitionRegistry, type AssayDefinition } from '../../registry/AssayDefinitionRegistry.js';
import { getMeasurementPanelRegistry } from '../../registry/MeasurementPanelRegistry.js';

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

type RoleFamily = 'sample' | 'control' | 'calibration';

type MeasurementContextBody = {
  name?: string;
  sourceRef?: RefShape;
  instrumentRef?: RefShape;
  assayDefRef?: RefShape;
  readoutDefRefs?: RefShape[];
  timepoint?: string;
  seriesId?: string;
  notes?: string;
  tags?: string[];
};

type WellGroupBody = {
  name?: string;
  sourceRef?: RefShape;
  wellIds?: string[];
  notes?: string;
  tags?: string[];
};

type WellRoleAssignmentBody = {
  measurementContextRef?: RefShape;
  subjectRefs?: RefShape[];
  roleFamily?: RoleFamily;
  roleType?: string;
  readoutDefRef?: RefShape;
  targetRef?: RefShape;
  expectedBehavior?: string;
  calibration?: {
    standardLevel?: string;
    nominalValue?: number;
    nominalUnit?: string;
  };
  notes?: string;
};

const SCHEMA_IDS = {
  instrumentDefinition: 'https://computable-lab.com/schema/computable-lab/instrument-definition.schema.yaml',
  readoutDefinition: 'https://computable-lab.com/schema/computable-lab/readout-definition.schema.yaml',
  assayDefinition: 'https://computable-lab.com/schema/computable-lab/assay-definition.schema.yaml',
  measurementContext: 'https://computable-lab.com/schema/computable-lab/measurement-context.schema.yaml',
  wellRoleAssignment: 'https://computable-lab.com/schema/computable-lab/well-role-assignment.schema.yaml',
  wellGroup: 'https://computable-lab.com/schema/computable-lab/well-group.schema.yaml',
  context: 'computable-lab/context',
  claim: 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
  assertion: 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml',
  evidence: 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml',
} as const;

function token(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function refValue(value: unknown): RefShape | undefined {
  if (!isObject(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  const kind = value.kind === 'ontology' ? 'ontology' : 'record';
  const type = stringValue(value.type);
  const label = stringValue(value.label);
  const namespace = stringValue(value.namespace);
  const uri = stringValue(value.uri);
  return {
    kind,
    id,
    ...(type ? { type } : {}),
    ...(label ? { label } : {}),
    ...(namespace ? { namespace } : {}),
    ...(uri ? { uri } : {}),
  };
}

function refList(value: unknown): RefShape[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => refValue(entry)).filter((entry): entry is RefShape => Boolean(entry));
}

function dedupeStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function payloadOf(envelope: RecordEnvelope | null): Record<string, unknown> | null {
  return envelope && isObject(envelope.payload) ? envelope.payload : null;
}

function toRef(id: string, type: string, label?: string): RefShape {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function ontologyRef(id: string, label: string, namespace = 'computable-lab'): RefShape {
  return { kind: 'ontology', id, namespace, label };
}

async function createRecord(store: RecordStore, recordId: string, schemaId: string, payload: Record<string, unknown>, message: string): Promise<StoreResult> {
  return store.create({
    envelope: { recordId, schemaId, payload },
    message,
  });
}

function filterDefinitions<T extends { instrument_type?: string }>(items: T[], instrumentType?: string): T[] {
  const normalized = stringValue(instrumentType);
  return normalized ? items.filter((item) => item.instrument_type === normalized) : items;
}

function friendlyNameFromContext(body: MeasurementContextBody): string {
  const assay = body.assayDefRef?.label ?? body.assayDefRef?.id;
  const instrument = body.instrumentRef?.label ?? body.instrumentRef?.id;
  const timepoint = stringValue(body.timepoint);
  return [assay, instrument, timepoint].filter(Boolean).join(' · ') || 'Measurement Context';
}

function roleAssignmentsForContext(assignments: RecordEnvelope[], measurementContextRef: string): RecordEnvelope[] {
  return assignments.filter((envelope) => {
    const payload = payloadOf(envelope);
    const ref = payload ? refValue(payload.measurement_context_ref) : undefined;
    return ref?.id === measurementContextRef;
  });
}

function roleLabel(roleType: string): string {
  return roleType.replace(/_/g, ' ');
}

function defaultClaimObject(roleType: string, targetRef?: RefShape, assayRef?: RefShape): RefShape {
  return targetRef ?? assayRef ?? ontologyRef(`computable-lab:${roleType}`, roleLabel(roleType));
}

function generatedContextScopeField(roleFamily: RoleFamily): 'control_context' | 'treated_context' {
  return roleFamily === 'control' ? 'control_context' : 'treated_context';
}

// ---------------------------------------------------------------------------
// Seeded definitions sourced from YAML registries
// ---------------------------------------------------------------------------

type SeededDef = { schemaId: string; payload: Record<string, unknown> };

function buildSeededDefinitions(): SeededDef[] {
  const definitions: SeededDef[] = [];

  // Readout definitions from registry
  for (const readout of getReadoutDefinitionRegistry().list()) {
    definitions.push({
      schemaId: SCHEMA_IDS.readoutDefinition,
      payload: {
        kind: 'readout-definition',
        id: readout.id,
        name: readout.name,
        instrument_type: readout.instrument_type,
        mode: readout.mode,
        ...(readout.channel_label ? { channel_label: readout.channel_label } : {}),
        ...(readout.excitation_nm !== undefined ? { excitation_nm: readout.excitation_nm } : {}),
        ...(readout.emission_nm !== undefined ? { emission_nm: readout.emission_nm } : {}),
        ...(readout.units ? { units: readout.units } : {}),
        ...(readout.proxy_ref ? { proxy_ref: readout.proxy_ref } : {}),
        ...(readout.target_ref ? { target_ref: readout.target_ref } : {}),
        ...(readout.tags?.length ? { tags: readout.tags } : {}),
      },
    });
  }

  // Instrument definitions from registry
  for (const instrument of getInstrumentRegistry().list()) {
    definitions.push({
      schemaId: SCHEMA_IDS.instrumentDefinition,
      payload: {
        kind: 'instrument-definition',
        id: instrument.id,
        name: instrument.name,
        vendor: instrument.vendor,
        model: instrument.model,
        instrument_type: instrument.instrument_type,
        supported_readout_def_refs: instrument.supported_readout_def_refs,
        ...(instrument.tags?.length ? { tags: instrument.tags } : {}),
      },
    });
  }

  // Assay definitions from registry
  for (const assay of getAssayDefinitionRegistry().list()) {
    definitions.push({
      schemaId: SCHEMA_IDS.assayDefinition,
      payload: {
        kind: 'assay-definition',
        id: assay.id,
        name: assay.name,
        assay_type: assay.assay_type,
        instrument_type: assay.instrument_type,
        readout_def_refs: assay.readout_def_refs,
        ...(assay.target_refs?.length ? { target_refs: assay.target_refs } : {}),
        ...(assay.panel_targets?.length ? { panel_targets: assay.panel_targets } : {}),
        ...(assay.expected_role_types?.length ? { expected_role_types: assay.expected_role_types } : {}),
        ...(assay.notes ? { notes: assay.notes } : {}),
        ...(assay.tags?.length ? { tags: assay.tags } : {}),
      },
    });
  }

  // Measurement panels from registry
  for (const panel of getMeasurementPanelRegistry().list()) {
    definitions.push({
      schemaId: SCHEMA_IDS.assayDefinition,
      payload: {
        kind: 'measurement-panel',
        id: panel.id,
        name: panel.name,
        readout_refs: panel.readout_refs,
        ...(panel.notes ? { notes: panel.notes } : {}),
      },
    });
  }

  return definitions;
}

const SEEDED_DEFINITIONS: readonly SeededDef[] = buildSeededDefinitions();

async function ensureSeedDefinitions(store: RecordStore): Promise<void> {
  for (const definition of SEEDED_DEFINITIONS) {
    const payload = definition.payload as Record<string, unknown> & { id: string; name: string };
    if (await store.exists(payload.id)) continue;
    await store.create({
      envelope: {
        recordId: payload.id,
        schemaId: definition.schemaId,
        payload: {
          ...definition.payload,
          title: payload.name,
        },
      },
      message: `Seed semantics definition ${payload.id}`,
    });
  }
}

async function listDefinitionPayloads(store: RecordStore, kind: string): Promise<Record<string, unknown>[]> {
  const envelopes = await store.list({ kind });
  return envelopes.map((envelope) => payloadOf(envelope)).filter((payload): payload is Record<string, unknown> => Boolean(payload));
}

async function generateKnowledgeRecords(
  store: RecordStore,
  args: {
    measurementContext: Record<string, unknown>;
    measurementContextRef: RefShape;
    subjectRefs: RefShape[];
    roleFamily: RoleFamily;
    roleType: string;
    readoutDefRef?: RefShape | undefined;
    targetRef?: RefShape | undefined;
    expectedBehavior?: string | undefined;
    notes?: string | undefined;
    assignmentId: string;
  },
): Promise<{ contextRef: RefShape; claimRef: RefShape; assertionRef: RefShape; evidenceRef: RefShape; generatedIds: string[] }> {
  const measurementContextName = stringValue(args.measurementContext.name) ?? args.measurementContextRef.label ?? args.measurementContextRef.id;
  const assayRef = refValue(args.measurementContext.assay_def_ref);
  const contextId = token('CTX');
  const claimId = token('CLM');
  const assertionId = token('ASN');
  const evidenceId = token('EVD');
  const roleDisplay = roleLabel(args.roleType);
  const sourceWellLabels = args.subjectRefs.map((ref) => ref.label ?? ref.id).join(', ');
  const subjectLabel = args.readoutDefRef?.label ?? measurementContextName;
  const claimObject = defaultClaimObject(args.roleType, args.targetRef, assayRef);
  const generatedContextRef = toRef(contextId, 'context', `${roleDisplay} wells in ${measurementContextName}`);
  const claimRef = toRef(claimId, 'claim');
  const assertionRef = toRef(assertionId, 'assertion');
  const evidenceRef = toRef(evidenceId, 'evidence');

  const contextPayload: Record<string, unknown> = {
    id: contextId,
    subject_ref: args.measurementContextRef,
    properties: {
      role_family: args.roleFamily,
      role_type: args.roleType,
      well_ids: args.subjectRefs.map((ref) => ref.label ?? ref.id),
      subject_refs: args.subjectRefs,
      measurement_context_ref: args.measurementContextRef,
      assignment_id: args.assignmentId,
    },
    ...(args.notes ? { notes: args.notes } : {}),
    tags: ['measurement-role-assignment'],
  };

  const claimPayload: Record<string, unknown> = {
    kind: 'claim',
    id: claimId,
    statement: `${subjectLabel} is used for ${roleDisplay}`,
    subject: args.readoutDefRef ?? args.measurementContextRef,
    predicate: ontologyRef('computable-lab:has-role', 'has role'),
    object: claimObject,
    title: `${subjectLabel} has role ${roleDisplay}`,
  };

  const directionMap: Record<string, string> = {
    increase: 'increased',
    decrease: 'decreased',
    present: 'unknown',
    absent: 'unknown',
    stable: 'no_change',
    range: 'mixed',
    none: 'unknown',
  };

  const assertionPayload: Record<string, unknown> = {
    kind: 'assertion',
    id: assertionId,
    claim_ref: claimRef,
    statement: `${sourceWellLabels} are assigned as ${roleDisplay} in ${measurementContextName}`,
    scope: {
      [generatedContextScopeField(args.roleFamily)]: generatedContextRef,
    },
    ...(args.targetRef || args.expectedBehavior ? {
      outcome: {
        ...(args.targetRef ? { target: args.targetRef } : {}),
        ...(args.expectedBehavior ? { direction: directionMap[args.expectedBehavior] ?? 'unknown' } : {}),
      },
    } : {}),
    evidence_refs: [evidenceRef],
    confidence: 3,
  };

  const evidencePayload: Record<string, unknown> = {
    kind: 'evidence',
    id: evidenceId,
    supports: [assertionRef],
    sources: [
      {
        type: 'context',
        ref: generatedContextRef,
      },
      {
        type: 'context',
        ref: args.measurementContextRef,
      },
    ],
    quality: {
      origin: 'measurement-role-assignment',
      assignment_id: args.assignmentId,
    },
  };

  const writes = [
    await createRecord(store, contextId, SCHEMA_IDS.context, contextPayload, `Create generated context ${contextId}`),
    await createRecord(store, claimId, SCHEMA_IDS.claim, claimPayload, `Create generated claim ${claimId}`),
    await createRecord(store, assertionId, SCHEMA_IDS.assertion, assertionPayload, `Create generated assertion ${assertionId}`),
    await createRecord(store, evidenceId, SCHEMA_IDS.evidence, evidencePayload, `Create generated evidence ${evidenceId}`),
  ];
  const failed = writes.find((result) => !result.success);
  if (failed) {
    throw new Error(failed.error ?? 'Failed to generate knowledge records');
  }

  return {
    contextRef: generatedContextRef,
    claimRef,
    assertionRef,
    evidenceRef,
    generatedIds: [contextId, claimId, assertionId, evidenceId],
  };
}

export function createSemanticsHandlers(ctx: AppContext) {
  return {
    async listInstruments(
      request: FastifyRequest<{ Querystring: { instrumentType?: string } }>,
    ): Promise<{ items: InstrumentDefinition[] }> {
      await ensureSeedDefinitions(ctx.store);
      const items = (await listDefinitionPayloads(ctx.store, 'instrument-definition')) as InstrumentDefinition[];
      return { items: filterDefinitions(items, request.query.instrumentType) };
    },

    async listReadouts(
      request: FastifyRequest<{ Querystring: { instrumentType?: string } }>,
    ): Promise<{ items: ReadoutDefinition[] }> {
      await ensureSeedDefinitions(ctx.store);
      const items = (await listDefinitionPayloads(ctx.store, 'readout-definition')) as ReadoutDefinition[];
      return { items: filterDefinitions(items, request.query.instrumentType) };
    },

    async listAssays(
      request: FastifyRequest<{ Querystring: { instrumentType?: string } }>,
    ): Promise<{ items: AssayDefinition[] }> {
      await ensureSeedDefinitions(ctx.store);
      const items = (await listDefinitionPayloads(ctx.store, 'assay-definition')) as AssayDefinition[];
      return { items: filterDefinitions(items, request.query.instrumentType) };
    },

    async listMeasurementContexts(
      request: FastifyRequest<{ Querystring: { sourceRef?: string } }>,
      reply: FastifyReply,
    ): Promise<{ items: Array<Record<string, unknown>> } | ApiError> {
      await ensureSeedDefinitions(ctx.store);
      const sourceRef = stringValue(request.query.sourceRef);
      if (!sourceRef) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'sourceRef is required' };
      }
      const [contextEnvelopes, measurementEnvelopes] = await Promise.all([
        ctx.store.list({ kind: 'measurement-context' }),
        ctx.store.list({ kind: 'measurement' }),
      ]);
      const counts = new Map<string, { count: number; measurementIds: string[] }>();
      for (const envelope of measurementEnvelopes) {
        const payload = payloadOf(envelope);
        const contextRef = payload ? refValue(payload.measurementContextRef) : undefined;
        if (!contextRef) continue;
        const current = counts.get(contextRef.id) ?? { count: 0, measurementIds: [] };
        current.count += 1;
        current.measurementIds.push(envelope.recordId);
        counts.set(contextRef.id, current);
      }
      const items = contextEnvelopes
        .map((envelope) => payloadOf(envelope))
        .filter((payload): payload is Record<string, unknown> => Boolean(payload))
        .filter((payload) => refValue(payload.source_ref)?.id === sourceRef)
        .map((payload) => {
          const linked = counts.get(stringValue(payload.id) ?? '');
          return {
            ...payload,
            measurement_count: linked?.count ?? 0,
            linked_measurement_ids: linked?.measurementIds ?? [],
          };
        });
      return { items };
    },

    async createMeasurementContext(
      request: FastifyRequest<{ Body: MeasurementContextBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; measurementContextId: string } | ApiError> {
      await ensureSeedDefinitions(ctx.store);
      const sourceRef = refValue(request.body.sourceRef);
      const instrumentRef = refValue(request.body.instrumentRef);
      const readoutDefRefs = refList(request.body.readoutDefRefs);
      const assayDefRef = refValue(request.body.assayDefRef);
      if (!sourceRef || !instrumentRef || readoutDefRefs.length === 0) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'sourceRef, instrumentRef, and at least one readoutDefRef are required',
        };
      }
      const recordId = token('MCTX');
      const payload: Record<string, unknown> = {
        kind: 'measurement-context',
        id: recordId,
        name: stringValue(request.body.name) ?? friendlyNameFromContext(request.body),
        title: stringValue(request.body.name) ?? friendlyNameFromContext(request.body),
        source_ref: sourceRef,
        instrument_ref: instrumentRef,
        readout_def_refs: readoutDefRefs,
        ...(assayDefRef ? { assay_def_ref: assayDefRef } : {}),
        ...(stringValue(request.body.timepoint) ? { timepoint: stringValue(request.body.timepoint) } : {}),
        ...(stringValue(request.body.seriesId) ? { series_id: stringValue(request.body.seriesId) } : {}),
        ...(stringValue(request.body.notes) ? { notes: stringValue(request.body.notes) } : {}),
        ...(dedupeStrings(request.body.tags) ? { tags: dedupeStrings(request.body.tags) } : {}),
      };
      const result = await createRecord(ctx.store, recordId, SCHEMA_IDS.measurementContext, payload, `Create measurement context ${recordId}`);
      if (!result.success) {
        reply.status(400);
        return { error: 'CREATE_FAILED', message: result.error ?? 'Unable to create measurement context' };
      }
      reply.status(201);
      return { success: true, measurementContextId: recordId };
    },

    async listWellGroups(
      request: FastifyRequest<{ Querystring: { sourceRef?: string } }>,
      reply: FastifyReply,
    ): Promise<{ items: Array<Record<string, unknown>> } | ApiError> {
      const sourceRef = stringValue(request.query.sourceRef);
      if (!sourceRef) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'sourceRef is required' };
      }
      const items = (await ctx.store.list({ kind: 'well-group' }))
        .map((envelope) => payloadOf(envelope))
        .filter((payload): payload is Record<string, unknown> => Boolean(payload))
        .filter((payload) => refValue(payload.source_ref)?.id === sourceRef);
      return { items };
    },

    async createWellGroup(
      request: FastifyRequest<{ Body: WellGroupBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; wellGroupId: string } | ApiError> {
      const sourceRef = refValue(request.body.sourceRef);
      const wellIds = dedupeStrings(request.body.wellIds);
      if (!sourceRef || !wellIds || wellIds.length === 0) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'sourceRef and at least one wellId are required' };
      }
      const recordId = token('WG');
      const payload: Record<string, unknown> = {
        kind: 'well-group',
        id: recordId,
        name: stringValue(request.body.name) ?? `Well Group ${recordId}`,
        title: stringValue(request.body.name) ?? `Well Group ${recordId}`,
        source_ref: sourceRef,
        well_ids: wellIds,
        ...(stringValue(request.body.notes) ? { notes: stringValue(request.body.notes) } : {}),
        ...(dedupeStrings(request.body.tags) ? { tags: dedupeStrings(request.body.tags) } : {}),
      };
      const result = await createRecord(ctx.store, recordId, SCHEMA_IDS.wellGroup, payload, `Create well group ${recordId}`);
      if (!result.success) {
        reply.status(400);
        return { error: 'CREATE_FAILED', message: result.error ?? 'Unable to create well group' };
      }
      reply.status(201);
      return { success: true, wellGroupId: recordId };
    },

    async listWellRoleAssignments(
      request: FastifyRequest<{ Querystring: { measurementContextRef?: string } }>,
      reply: FastifyReply,
    ): Promise<{ items: Array<Record<string, unknown>> } | ApiError> {
      const measurementContextRef = stringValue(request.query.measurementContextRef);
      if (!measurementContextRef) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'measurementContextRef is required' };
      }
      const envelopes = await ctx.store.list({ kind: 'well-role-assignment' });
      const items = roleAssignmentsForContext(envelopes, measurementContextRef)
        .map((envelope) => payloadOf(envelope))
        .filter((payload): payload is Record<string, unknown> => Boolean(payload));
      return { items };
    },

    async createWellRoleAssignment(
      request: FastifyRequest<{ Body: WellRoleAssignmentBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; assignmentId: string; generatedRecordIds: string[] } | ApiError> {
      await ensureSeedDefinitions(ctx.store);
      const measurementContextRef = refValue(request.body.measurementContextRef);
      const subjectRefs = refList(request.body.subjectRefs);
      const roleFamily = request.body.roleFamily;
      const roleType = stringValue(request.body.roleType);
      const readoutDefRef = refValue(request.body.readoutDefRef);
      const targetRef = refValue(request.body.targetRef);
      const expectedBehavior = stringValue(request.body.expectedBehavior);
      if (!measurementContextRef || subjectRefs.length === 0 || !roleFamily || !roleType) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'measurementContextRef, subjectRefs, roleFamily, and roleType are required',
        };
      }
      const measurementContextEnvelope = await ctx.store.get(measurementContextRef.id);
      const measurementContext = payloadOf(measurementContextEnvelope);
      if (!measurementContext) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Measurement context not found: ${measurementContextRef.id}` };
      }

      const recordId = token('WRA');
      let generated;
      try {
        generated = await generateKnowledgeRecords(ctx.store, {
          measurementContext,
          measurementContextRef,
          subjectRefs,
          roleFamily,
          roleType,
          readoutDefRef,
          targetRef,
          expectedBehavior,
          notes: stringValue(request.body.notes),
          assignmentId: recordId,
        });
      } catch (err) {
        reply.status(400);
        return { error: 'CREATE_FAILED', message: err instanceof Error ? err.message : 'Failed to generate knowledge records' };
      }

      const calibration = isObject(request.body.calibration)
        ? {
            ...(stringValue(request.body.calibration.standardLevel) ? { standard_level: stringValue(request.body.calibration.standardLevel) } : {}),
            ...(numberValue(request.body.calibration.nominalValue) !== undefined ? { nominal_value: numberValue(request.body.calibration.nominalValue) } : {}),
            ...(stringValue(request.body.calibration.nominalUnit) ? { nominal_unit: stringValue(request.body.calibration.nominalUnit) } : {}),
          }
        : undefined;

      const payload: Record<string, unknown> = {
        kind: 'well-role-assignment',
        id: recordId,
        title: `${roleLabel(roleType)} assignment`,
        measurement_context_ref: measurementContextRef,
        subject_refs: subjectRefs,
        role_family: roleFamily,
        role_type: roleType,
        ...(readoutDefRef ? { readout_def_ref: readoutDefRef } : {}),
        ...(targetRef ? { target_ref: targetRef } : {}),
        ...(expectedBehavior ? { expected_behavior: expectedBehavior } : {}),
        ...(calibration && Object.keys(calibration).length > 0 ? { calibration } : {}),
        generated_context_ref: generated.contextRef,
        generated_claim_ref: generated.claimRef,
        generated_assertion_ref: generated.assertionRef,
        generated_evidence_ref: generated.evidenceRef,
        ...(stringValue(request.body.notes) ? { notes: stringValue(request.body.notes) } : {}),
      };
      const result = await createRecord(ctx.store, recordId, SCHEMA_IDS.wellRoleAssignment, payload, `Create well role assignment ${recordId}`);
      if (!result.success) {
        reply.status(400);
        return { error: 'CREATE_FAILED', message: result.error ?? 'Unable to create well role assignment' };
      }
      reply.status(201);
      return { success: true, assignmentId: recordId, generatedRecordIds: generated.generatedIds };
    },
  };
}

export type SemanticsHandlers = ReturnType<typeof createSemanticsHandlers>;
