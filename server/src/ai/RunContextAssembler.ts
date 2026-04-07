/**
 * RunContextAssembler — loads run-scoped records and assembles
 * structured context objects for the AI agent orchestrator.
 *
 * Each domain method returns a context object suitable for inclusion
 * in an AI system prompt. The assembler delegates record loading to
 * the RecordStore and filters records to those relevant to the run.
 */

import type { RecordStore, RecordEnvelope } from '../store/types.js';

// ---------------------------------------------------------------------------
// Internal payload shapes (mirror RunWorkspaceService conventions)
// ---------------------------------------------------------------------------

type RefShape = { kind?: string; id?: string; type?: string; label?: string };

type RunPayload = {
  kind: 'run';
  recordId: string;
  title?: string;
  status: string;
  experimentId: string;
  studyId?: string;
  methodEventGraphId?: string;
  methodPlatform?: string;
  methodVocabId?: string;
};

type EventGraphPayload = {
  id?: string;
  name?: string;
  labwares?: Array<{ labwareId?: string; name?: string; labwareType?: string; addressing?: unknown }>;
  events?: Array<Record<string, unknown>>;
};

type MeasurementContextPayload = {
  id: string;
  name: string;
  source_ref?: RefShape;
  instrument_ref?: RefShape;
  assay_def_ref?: RefShape;
  readout_def_refs?: RefShape[];
  timepoint?: string;
  series_id?: string;
  notes?: string;
  tags?: string[];
};

type WellGroupPayload = {
  id: string;
  name: string;
  source_ref?: RefShape;
  well_ids?: string[];
  notes?: string;
  tags?: string[];
};

type WellRoleAssignmentPayload = {
  id: string;
  measurement_context_ref?: RefShape;
  subject_refs?: RefShape[];
  role_family?: string;
  role_type?: string;
  readout_def_ref?: RefShape;
  target_ref?: RefShape;
  expected_behavior?: string;
  notes?: string;
};

type MeasurementPayload = {
  recordId?: string;
  title?: string;
  eventGraphRef?: RefShape;
  measurementContextRef?: RefShape;
  readEventRef?: string;
  data?: unknown[];
};

type ClaimPayload = { id?: string; statement?: string; keywords?: string[] };
type AssertionPayload = { id?: string; claim_ref?: RefShape; evidence_refs?: RefShape[]; statement?: string };
type EvidencePayload = { id?: string; supports?: RefShape[]; title?: string };

// ---------------------------------------------------------------------------
// Context shapes returned by each assembler method
// ---------------------------------------------------------------------------

export interface EventGraphContext {
  runId: string;
  run: { recordId: string; title?: string; status: string; experimentId: string };
  eventGraph: {
    recordId: string;
    name?: string;
    labwares: Array<{ labwareId?: string; name?: string; labwareType?: string; addressing?: unknown }>;
    events: Array<Record<string, unknown>>;
    eventCount: number;
  } | null;
}

export interface MeaningContext {
  runId: string;
  run: { recordId: string; title?: string; status: string };
  wellGroups: Array<{
    recordId: string;
    name: string;
    wellIds: string[];
    sourceRefId?: string;
  }>;
  wellRoleAssignments: Array<{
    recordId: string;
    measurementContextId?: string;
    roleFamily?: string;
    roleType?: string;
    expectedBehavior?: string;
    subjectCount: number;
  }>;
  measurementContextNames: Array<{ recordId: string; name: string }>;
}

export interface ReadoutsContext {
  runId: string;
  measurementContexts: Array<{
    recordId: string;
    name: string;
    instrumentRef?: RefShape;
    assayRef?: RefShape;
    readoutDefs: RefShape[];
    timepoint?: string;
    measurementCount: number;
  }>;
}

export interface ResultsContext {
  runId: string;
  measurements: Array<{
    recordId: string;
    title?: string;
    measurementContextId?: string;
    rowCount: number;
  }>;
  ingestionJobs: Array<Record<string, unknown>>;
}

export interface EvidenceContext {
  runId: string;
  run: { recordId: string; title?: string; status: string };
  claims: Array<{ recordId: string; statement?: string }>;
  assertions: Array<{ recordId: string; statement?: string; claimRefId?: string }>;
  evidence: Array<{ recordId: string; title?: string }>;
  measurementSummary: Array<{ recordId: string; title?: string; measurementContextId?: string; rowCount: number }>;
  wellRoleCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function listLabwareIds(eventGraph: RecordEnvelope<EventGraphPayload> | null): string[] {
  if (!eventGraph?.payload || !Array.isArray(eventGraph.payload.labwares)) return [];
  return eventGraph.payload.labwares
    .map((entry) => (typeof entry?.labwareId === 'string' ? entry.labwareId : null))
    .filter((value): value is string => Boolean(value));
}

function matchesRun(
  sourceRefId: string | undefined,
  runId: string,
  eventGraphId: string | undefined,
  labwareIds: Set<string>,
): boolean {
  if (!sourceRefId) return false;
  return sourceRefId === runId || sourceRefId === eventGraphId || labwareIds.has(sourceRefId);
}

// ---------------------------------------------------------------------------
// RunContextAssembler
// ---------------------------------------------------------------------------

export class RunContextAssembler {
  constructor(private readonly store: RecordStore) {}

  /** Load core run + event graph, returning null if the run doesn't exist. */
  private async loadRunCore(runId: string) {
    const runEnvelope = await this.store.get(runId);
    if (!runEnvelope) return null;

    const runPayload = asObject(runEnvelope.payload) as RunPayload | null;
    if (!runPayload || runPayload.kind !== 'run') return null;

    const eventGraphId = typeof runPayload.methodEventGraphId === 'string' ? runPayload.methodEventGraphId : undefined;
    const eventGraphEnvelope = eventGraphId
      ? (await this.store.get(eventGraphId)) as RecordEnvelope<EventGraphPayload> | null
      : null;
    const labwareIds = new Set(listLabwareIds(eventGraphEnvelope));

    return { runEnvelope: runEnvelope as RecordEnvelope<RunPayload>, runPayload, eventGraphId, eventGraphEnvelope, labwareIds };
  }

  /** Load measurement contexts filtered to this run. */
  private async loadMeasurementContexts(runId: string, eventGraphId: string | undefined, labwareIds: Set<string>) {
    const all = (await this.store.list({ kind: 'measurement-context', limit: 1000 })) as Array<RecordEnvelope<MeasurementContextPayload>>;
    return all.filter((envelope) => matchesRun(envelope.payload.source_ref?.id, runId, eventGraphId, labwareIds));
  }

  /** Load measurements filtered to this run's event graph. */
  private async loadMeasurements(eventGraphId: string | undefined) {
    if (!eventGraphId) return [];
    const all = (await this.store.list({ kind: 'measurement', limit: 5000 })) as Array<RecordEnvelope<MeasurementPayload>>;
    return all.filter((envelope) => envelope.payload.eventGraphRef?.id === eventGraphId);
  }

  // =========================================================================
  // Public assembler methods
  // =========================================================================

  async assembleEventGraphContext(runId: string): Promise<EventGraphContext | null> {
    const core = await this.loadRunCore(runId);
    if (!core) return null;

    const { runPayload, eventGraphEnvelope } = core;
    const events = eventGraphEnvelope?.payload.events ?? [];

    return {
      runId,
      run: {
        recordId: core.runEnvelope.recordId,
        ...(typeof runPayload.title === 'string' ? { title: runPayload.title } : {}),
        status: runPayload.status,
        experimentId: runPayload.experimentId,
      },
      eventGraph: eventGraphEnvelope
        ? {
            recordId: eventGraphEnvelope.recordId,
            ...(typeof eventGraphEnvelope.payload.name === 'string' ? { name: eventGraphEnvelope.payload.name } : {}),
            labwares: Array.isArray(eventGraphEnvelope.payload.labwares) ? eventGraphEnvelope.payload.labwares : [],
            events,
            eventCount: events.length,
          }
        : null,
    };
  }

  async assembleMeaningContext(runId: string): Promise<MeaningContext | null> {
    const core = await this.loadRunCore(runId);
    if (!core) return null;

    const { runPayload, eventGraphId, labwareIds } = core;

    const [wellGroupEnvelopes, roleAssignmentEnvelopes, measurementContextEnvelopes] = await Promise.all([
      this.store.list({ kind: 'well-group', limit: 1000 }) as Promise<Array<RecordEnvelope<WellGroupPayload>>>,
      this.store.list({ kind: 'well-role-assignment', limit: 5000 }) as Promise<Array<RecordEnvelope<WellRoleAssignmentPayload>>>,
      this.store.list({ kind: 'measurement-context', limit: 1000 }) as Promise<Array<RecordEnvelope<MeasurementContextPayload>>>,
    ]);

    const wellGroups = wellGroupEnvelopes.filter((e) =>
      matchesRun(e.payload.source_ref?.id, runId, eventGraphId, labwareIds),
    );

    const measurementContexts = measurementContextEnvelopes.filter((e) =>
      matchesRun(e.payload.source_ref?.id, runId, eventGraphId, labwareIds),
    );
    const contextIdSet = new Set(measurementContexts.map((c) => c.recordId));

    const roleAssignments = roleAssignmentEnvelopes.filter((e) => {
      const contextRefId = e.payload.measurement_context_ref?.id;
      return contextRefId && contextIdSet.has(contextRefId);
    });

    return {
      runId,
      run: {
        recordId: core.runEnvelope.recordId,
        ...(typeof runPayload.title === 'string' ? { title: runPayload.title } : {}),
        status: runPayload.status,
      },
      wellGroups: wellGroups.map((g) => ({
        recordId: g.recordId,
        name: g.payload.name,
        wellIds: g.payload.well_ids ?? [],
        ...(g.payload.source_ref?.id ? { sourceRefId: g.payload.source_ref.id } : {}),
      })),
      wellRoleAssignments: roleAssignments.map((a) => ({
        recordId: a.recordId,
        ...(a.payload.measurement_context_ref?.id ? { measurementContextId: a.payload.measurement_context_ref.id } : {}),
        ...(typeof a.payload.role_family === 'string' ? { roleFamily: a.payload.role_family } : {}),
        ...(typeof a.payload.role_type === 'string' ? { roleType: a.payload.role_type } : {}),
        ...(typeof a.payload.expected_behavior === 'string' ? { expectedBehavior: a.payload.expected_behavior } : {}),
        subjectCount: a.payload.subject_refs?.length ?? 0,
      })),
      measurementContextNames: measurementContexts.map((c) => ({ recordId: c.recordId, name: c.payload.name })),
    };
  }

  async assembleReadoutsContext(runId: string): Promise<ReadoutsContext | null> {
    const core = await this.loadRunCore(runId);
    if (!core) return null;

    const { eventGraphId, labwareIds } = core;
    const measurementContexts = await this.loadMeasurementContexts(runId, eventGraphId, labwareIds);
    const measurements = await this.loadMeasurements(eventGraphId);

    return {
      runId,
      measurementContexts: measurementContexts.map((c) => {
        const linkedCount = measurements.filter((m) => m.payload.measurementContextRef?.id === c.recordId).length;
        return {
          recordId: c.recordId,
          name: c.payload.name,
          ...(c.payload.instrument_ref ? { instrumentRef: c.payload.instrument_ref } : {}),
          ...(c.payload.assay_def_ref ? { assayRef: c.payload.assay_def_ref } : {}),
          readoutDefs: c.payload.readout_def_refs ?? [],
          ...(typeof c.payload.timepoint === 'string' ? { timepoint: c.payload.timepoint } : {}),
          measurementCount: linkedCount,
        };
      }),
    };
  }

  async assembleResultsContext(runId: string): Promise<ResultsContext | null> {
    const core = await this.loadRunCore(runId);
    if (!core) return null;

    const { eventGraphId } = core;
    const measurements = await this.loadMeasurements(eventGraphId);

    return {
      runId,
      measurements: measurements.map((m) => {
        const payload = asObject(m.payload) ?? {};
        const rows = Array.isArray(payload.data) ? payload.data : [];
        return {
          recordId: m.recordId,
          ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
          ...(m.payload.measurementContextRef?.id ? { measurementContextId: m.payload.measurementContextRef.id } : {}),
          rowCount: rows.length,
        };
      }),
      ingestionJobs: [], // Ingestion jobs can be loaded from the ingestion subsystem if needed
    };
  }

  async assembleEvidenceContext(runId: string): Promise<EvidenceContext | null> {
    const core = await this.loadRunCore(runId);
    if (!core) return null;

    const { runPayload, eventGraphId, labwareIds } = core;

    const [claimEnvelopes, assertionEnvelopes, evidenceEnvelopes, measurements, roleAssignments] = await Promise.all([
      this.store.list({ kind: 'claim', limit: 5000 }) as Promise<Array<RecordEnvelope<ClaimPayload>>>,
      this.store.list({ kind: 'assertion', limit: 5000 }) as Promise<Array<RecordEnvelope<AssertionPayload>>>,
      this.store.list({ kind: 'evidence', limit: 5000 }) as Promise<Array<RecordEnvelope<EvidencePayload>>>,
      this.loadMeasurements(eventGraphId),
      this.store.list({ kind: 'well-role-assignment', limit: 5000 }) as Promise<Array<RecordEnvelope<WellRoleAssignmentPayload>>>,
    ]);

    // Filter measurement contexts for this run
    const measurementContexts = await this.loadMeasurementContexts(runId, eventGraphId, labwareIds);
    const contextIdSet = new Set(measurementContexts.map((c) => c.recordId));
    const runRoleAssignments = roleAssignments.filter((e) => {
      const contextRefId = e.payload.measurement_context_ref?.id;
      return contextRefId && contextIdSet.has(contextRefId);
    });

    // Filter assertions that reference evidence, then find linked claims
    const assertionIds = new Set(assertionEnvelopes.map((a) => a.recordId));
    const evidence = evidenceEnvelopes.filter((e) =>
      (e.payload.supports ?? []).some((ref) => ref.id && assertionIds.has(ref.id)),
    );
    const claimIds = new Set(assertionEnvelopes.map((a) => a.payload.claim_ref?.id).filter((v): v is string => Boolean(v)));
    const claims = claimEnvelopes.filter((c) => claimIds.has(c.recordId));

    return {
      runId,
      run: {
        recordId: core.runEnvelope.recordId,
        ...(typeof runPayload.title === 'string' ? { title: runPayload.title } : {}),
        status: runPayload.status,
      },
      claims: claims.map((c) => ({
        recordId: c.recordId,
        ...(typeof c.payload.statement === 'string' ? { statement: c.payload.statement } : {}),
      })),
      assertions: assertionEnvelopes.map((a) => ({
        recordId: a.recordId,
        ...(typeof a.payload.statement === 'string' ? { statement: a.payload.statement } : {}),
        ...(a.payload.claim_ref?.id ? { claimRefId: a.payload.claim_ref.id } : {}),
      })),
      evidence: evidence.map((e) => ({
        recordId: e.recordId,
        ...(typeof e.payload.title === 'string' ? { title: e.payload.title } : {}),
      })),
      measurementSummary: measurements.map((m) => {
        const payload = asObject(m.payload) ?? {};
        const rows = Array.isArray(payload.data) ? payload.data : [];
        return {
          recordId: m.recordId,
          ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
          ...(m.payload.measurementContextRef?.id ? { measurementContextId: m.payload.measurementContextRef.id } : {}),
          rowCount: rows.length,
        };
      }),
      wellRoleCount: runRoleAssignments.length,
    };
  }
}
