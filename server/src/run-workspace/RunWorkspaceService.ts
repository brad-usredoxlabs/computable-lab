import type { RecordEnvelope, RecordStore } from '../store/types.js';

type RefShape = {
  kind?: string;
  id?: string;
  type?: string;
  label?: string;
};

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
  labwares?: Array<{ labwareId?: string; name?: string; labwareType?: string }>;
  events?: Array<{ event_type?: string }>;
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
};

type EvidencePayload = {
  id?: string;
  supports?: RefShape[];
};

type AssertionPayload = {
  id?: string;
  claim_ref?: RefShape;
  evidence_refs?: RefShape[];
  statement?: string;
};

type ClaimPayload = {
  id?: string;
  statement?: string;
  keywords?: string[];
};

type AnalysisBundleStatus = 'accepted' | 'rejected' | 'draft';

type AnalysisBundleRef = {
  id: string;
  type?: string;
  label?: string;
};

export interface RunAnalysisBundle {
  generatedAt: string;
  run: {
    recordId: string;
    title?: string;
    status: string;
    experimentId: string;
    studyId?: string;
    methodEventGraphId?: string;
    methodPlatform?: string;
    methodVocabId?: string;
  };
  eventGraph: {
    recordId: string;
    name?: string;
    labwares: Array<{ labwareId?: string; name?: string; labwareType?: string }>;
    readEvents: Array<{ eventId: string; instrument?: string; assayRef?: string; labwareId?: string }>;
  } | null;
  biology: {
    wellGroups: Array<{
      recordId: string;
      name: string;
      sourceRefId?: string;
      wellIds: string[];
      notes?: string;
      tags?: string[];
    }>;
    assignments: Array<{
      recordId: string;
      measurementContextId?: string;
      roleFamily?: string;
      roleType?: string;
      expectedBehavior?: string;
      readoutDefRef?: AnalysisBundleRef;
      targetRef?: AnalysisBundleRef;
      subjects: Array<{
        id: string;
        labwareId?: string;
        wellId?: string;
        label?: string;
      }>;
      notes?: string;
    }>;
  };
  readouts: {
    contexts: Array<{
      recordId: string;
      name: string;
      sourceRefId?: string;
      instrument?: AnalysisBundleRef;
      assay?: AnalysisBundleRef;
      readouts: AnalysisBundleRef[];
      readEventIds: string[];
      qcControlIds: string[];
      timepoint?: string;
      seriesId?: string;
      notes?: string;
      measurementCount: number;
      linkedMeasurementIds: string[];
    }>;
  };
  measurements: Array<{
    recordId: string;
    title?: string;
    measurementContextId?: string;
    readEventRef?: string;
    eventGraphRef?: string;
    labwareInstanceId?: string;
    metrics: string[];
    channels: string[];
    rowCount: number;
    data: unknown[];
  }>;
  claims: {
    bundleCounts: Record<AnalysisBundleStatus, number>;
    bundles: Array<{
      bundleId: string;
      status: AnalysisBundleStatus;
      claim: {
        recordId: string;
        statement?: string;
      } | null;
      assertions: Array<{
        recordId: string;
        statement?: string;
        confidence?: unknown;
      }>;
      evidence: Array<{
        recordId: string;
        title?: string;
        quality?: unknown;
      }>;
    }>;
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRef(value: unknown): RefShape | null {
  const objectValue = asObject(value);
  if (!objectValue || typeof objectValue.id !== 'string') return null;
  return {
    ...(typeof objectValue.kind === 'string' ? { kind: objectValue.kind } : {}),
    id: objectValue.id,
    ...(typeof objectValue.type === 'string' ? { type: objectValue.type } : {}),
    ...(typeof objectValue.label === 'string' ? { label: objectValue.label } : {}),
  };
}

function listLabwareIds(eventGraph: RecordEnvelope<EventGraphPayload> | null): string[] {
  if (!eventGraph?.payload || !Array.isArray(eventGraph.payload.labwares)) return [];
  return eventGraph.payload.labwares
    .map((entry) => (typeof entry?.labwareId === 'string' ? entry.labwareId : null))
    .filter((value): value is string => Boolean(value));
}

function measurementContextMatchesRun(
  payload: MeasurementContextPayload,
  runId: string,
  eventGraphId: string | undefined,
  labwareIds: Set<string>,
): boolean {
  const sourceRefId = payload.source_ref?.id;
  if (!sourceRefId) return false;
  return sourceRefId === runId || sourceRefId === eventGraphId || labwareIds.has(sourceRefId);
}

function wellGroupMatchesRun(
  payload: WellGroupPayload,
  runId: string,
  eventGraphId: string | undefined,
  labwareIds: Set<string>,
): boolean {
  const sourceRefId = payload.source_ref?.id;
  if (!sourceRefId) return false;
  return sourceRefId === runId || sourceRefId === eventGraphId || labwareIds.has(sourceRefId);
}

function measurementMatchesRun(payload: MeasurementPayload, eventGraphId: string | undefined): boolean {
  const graphRefId = payload.eventGraphRef?.id;
  return Boolean(eventGraphId && graphRefId === eventGraphId);
}

function evidenceMatchesAssertions(payload: EvidencePayload, assertionIds: Set<string>): boolean {
  return (payload.supports ?? []).some((ref) => Boolean(ref.id && assertionIds.has(ref.id)));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function refSummary(ref?: RefShape): AnalysisBundleRef | undefined {
  if (!ref?.id) return undefined;
  return {
    id: ref.id,
    ...(typeof ref.type === 'string' ? { type: ref.type } : {}),
    ...(typeof ref.label === 'string' ? { label: ref.label } : {}),
  };
}

function splitWellRef(subjectId: string): { labwareId?: string; wellId?: string } {
  const [labwareId, wellId] = subjectId.split('#');
  return {
    ...(labwareId ? { labwareId } : {}),
    ...(wellId ? { wellId } : {}),
  };
}

function reviewStatusFromPayload(payload: unknown): AnalysisBundleStatus {
  const keywords = asStringArray(asObject(payload)?.keywords);
  if (keywords.includes('review:accepted')) return 'accepted';
  if (keywords.includes('review:rejected')) return 'rejected';
  return 'draft';
}

export type AiContextTab = 'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims';

export interface RunAiContextResponse {
  runId: string;
  tab: AiContextTab;
  run: {
    recordId: string;
    title?: string;
    status: string;
    experimentId: string;
    studyId?: string;
    methodEventGraphId?: string;
  };
  eventGraph: {
    recordId: string;
    name?: string;
    eventCount: number;
    labwareCount: number;
    readEventCount: number;
  } | null;
  counts: {
    measurementContexts: number;
    wellGroups: number;
    roleAssignments: number;
    measurements: number;
    claims: number;
    evidence: number;
    assertions: number;
  };
  tabContext: Record<string, unknown>;
}

export interface RunWorkspaceResponse {
  run: RecordEnvelope<RunPayload>;
  eventGraph: RecordEnvelope<EventGraphPayload> | null;
  measurementContexts: Array<RecordEnvelope<MeasurementContextPayload>>;
  wellGroups: Array<RecordEnvelope<WellGroupPayload>>;
  wellRoleAssignmentsByContext: Record<string, Array<RecordEnvelope<WellRoleAssignmentPayload>>>;
  measurements: Array<RecordEnvelope<MeasurementPayload>>;
  claims: Array<RecordEnvelope<ClaimPayload>>;
  evidence: Array<RecordEnvelope<EvidencePayload>>;
  assertions: Array<RecordEnvelope<AssertionPayload>>;
}

export class RunWorkspaceService {
  constructor(private readonly store: RecordStore) {}

  async getRunWorkspace(runId: string): Promise<RunWorkspaceResponse | null> {
    const runEnvelope = await this.store.get(runId);
    if (!runEnvelope) return null;

    const runPayload = asObject(runEnvelope.payload) as RunPayload | null;
    if (!runPayload || runPayload.kind !== 'run') return null;

    const eventGraphId = typeof runPayload.methodEventGraphId === 'string' ? runPayload.methodEventGraphId : undefined;
    const eventGraphEnvelope = eventGraphId ? await this.store.get(eventGraphId) as RecordEnvelope<EventGraphPayload> | null : null;
    const labwareIds = new Set(listLabwareIds(eventGraphEnvelope));

    const [
      measurementContextEnvelopes,
      wellGroupEnvelopes,
      roleAssignmentEnvelopes,
      measurementEnvelopes,
      claimEnvelopes,
      assertionEnvelopes,
      evidenceEnvelopes,
    ] = await Promise.all([
      this.store.list({ kind: 'measurement-context', limit: 1000 }) as Promise<Array<RecordEnvelope<MeasurementContextPayload>>>,
      this.store.list({ kind: 'well-group', limit: 1000 }) as Promise<Array<RecordEnvelope<WellGroupPayload>>>,
      this.store.list({ kind: 'well-role-assignment', limit: 5000 }) as Promise<Array<RecordEnvelope<WellRoleAssignmentPayload>>>,
      this.store.list({ kind: 'measurement', limit: 5000 }) as Promise<Array<RecordEnvelope<MeasurementPayload>>>,
      this.store.list({ kind: 'claim', limit: 5000 }) as Promise<Array<RecordEnvelope<ClaimPayload>>>,
      this.store.list({ kind: 'assertion', limit: 5000 }) as Promise<Array<RecordEnvelope<AssertionPayload>>>,
      this.store.list({ kind: 'evidence', limit: 5000 }) as Promise<Array<RecordEnvelope<EvidencePayload>>>,
    ]);

    const measurementContexts = measurementContextEnvelopes.filter((envelope) =>
      measurementContextMatchesRun(envelope.payload, runId, eventGraphId, labwareIds),
    );
    const contextIdSet = new Set(measurementContexts.map((context) => context.recordId));

    const wellGroups = wellGroupEnvelopes.filter((envelope) =>
      wellGroupMatchesRun(envelope.payload, runId, eventGraphId, labwareIds),
    );

    const wellRoleAssignmentsByContext = roleAssignmentEnvelopes.reduce<Record<string, Array<RecordEnvelope<WellRoleAssignmentPayload>>>>((acc, envelope) => {
      const contextRef = asRef(envelope.payload.measurement_context_ref);
      if (!contextRef?.id || !contextIdSet.has(contextRef.id)) return acc;
      const contextAssignments = acc[contextRef.id] ?? [];
      contextAssignments.push(envelope);
      acc[contextRef.id] = contextAssignments;
      return acc;
    }, {});

    const measurements = measurementEnvelopes.filter((envelope) => measurementMatchesRun(envelope.payload, eventGraphId));
    const measurementContextRefIds = new Set(measurements.map((item) => item.payload.measurementContextRef?.id).filter((value): value is string => Boolean(value)));

    const assertions = assertionEnvelopes.filter((envelope) =>
      (envelope.payload.evidence_refs ?? []).some((ref) => typeof ref?.id === 'string')
      || typeof envelope.payload.statement === 'string'
      || Boolean(envelope.payload.claim_ref?.id),
    );
    const claimIds = new Set(assertions.map((item) => item.payload.claim_ref?.id).filter((value): value is string => Boolean(value)));
    const claims = claimEnvelopes.filter((envelope) => claimIds.has(envelope.recordId));
    const assertionIds = new Set(assertions.map((item) => item.recordId));
    const evidence = evidenceEnvelopes.filter((envelope) => evidenceMatchesAssertions(envelope.payload, assertionIds));

    return {
      run: runEnvelope as RecordEnvelope<RunPayload>,
      eventGraph: eventGraphEnvelope,
      measurementContexts: measurementContexts.map((context) => ({
        ...context,
        payload: {
          ...context.payload,
          measurement_count: measurements.filter((measurement) => measurement.payload.measurementContextRef?.id === context.recordId).length,
          linked_measurement_ids: measurements
            .filter((measurement) => measurement.payload.measurementContextRef?.id === context.recordId)
            .map((measurement) => measurement.recordId),
        } as MeasurementContextPayload & { measurement_count: number; linked_measurement_ids: string[] },
      })),
      wellGroups,
      wellRoleAssignmentsByContext,
      measurements: measurements.filter((measurement) => {
        const contextRefId = measurement.payload.measurementContextRef?.id;
        return !contextRefId || measurementContextRefIds.has(contextRefId);
      }),
      claims,
      evidence,
      assertions,
    };
  }

  async getRunAnalysisBundle(runId: string): Promise<RunAnalysisBundle | null> {
    const workspace = await this.getRunWorkspace(runId);
    if (!workspace) return null;

    const runPayload = workspace.run.payload;
    const allAssignments = Object.values(workspace.wellRoleAssignmentsByContext).flat();

    const evidenceByAssertionId = new Map<string, Array<RecordEnvelope<EvidencePayload>>>();
    for (const evidence of workspace.evidence as Array<RecordEnvelope<EvidencePayload>>) {
      for (const support of evidence.payload.supports ?? []) {
        if (!support.id) continue;
        const current = evidenceByAssertionId.get(support.id) ?? [];
        current.push(evidence);
        evidenceByAssertionId.set(support.id, current);
      }
    }

    const claimById = new Map(workspace.claims.map((claim) => [claim.recordId, claim as RecordEnvelope<ClaimPayload>]));
    const bundles = new Map<string, RunAnalysisBundle['claims']['bundles'][number]>();

    for (const assertion of workspace.assertions as Array<RecordEnvelope<AssertionPayload>>) {
      const claimId = assertion.payload.claim_ref?.id || `orphan:${assertion.recordId}`;
      const bundleId = claimId;
      const current = bundles.get(bundleId) ?? {
        bundleId,
        status: 'draft' as AnalysisBundleStatus,
        claim: null,
        assertions: [],
        evidence: [],
      };
      current.assertions.push({
        recordId: assertion.recordId,
        ...(typeof assertion.payload.statement === 'string' ? { statement: assertion.payload.statement } : {}),
        ...(Object.prototype.hasOwnProperty.call(assertion.payload, 'confidence') ? { confidence: (assertion.payload as Record<string, unknown>).confidence } : {}),
      });
      const linkedEvidence = evidenceByAssertionId.get(assertion.recordId) ?? [];
      current.evidence.push(...linkedEvidence.map((evidence) => ({
        recordId: evidence.recordId,
        ...(typeof (evidence.payload as Record<string, unknown>).title === 'string' ? { title: String((evidence.payload as Record<string, unknown>).title) } : {}),
        ...(Object.prototype.hasOwnProperty.call(evidence.payload, 'quality') ? { quality: (evidence.payload as Record<string, unknown>).quality } : {}),
      })));
      bundles.set(bundleId, current);
    }

    for (const [bundleId, bundle] of bundles.entries()) {
      const claim = claimById.get(bundleId) ?? null;
      bundle.claim = claim
        ? {
            recordId: claim.recordId,
            ...(typeof claim.payload.statement === 'string' ? { statement: claim.payload.statement } : {}),
          }
        : null;
      const statuses: AnalysisBundleStatus[] = [
        ...(claim ? [reviewStatusFromPayload(claim.payload)] : []),
        ...bundle.assertions.map((assertion) => {
          const record = workspace.assertions.find((item) => item.recordId === assertion.recordId);
          return reviewStatusFromPayload(record?.payload);
        }),
        ...bundle.evidence.map((evidence) => {
          const record = workspace.evidence.find((item) => item.recordId === evidence.recordId);
          return reviewStatusFromPayload(record?.payload);
        }),
      ];
      bundle.status = statuses.includes('rejected')
        ? 'rejected'
        : statuses.length > 0 && statuses.every((status) => status === 'accepted')
          ? 'accepted'
          : 'draft';
      bundles.set(bundleId, bundle);
    }

    const bundleList = Array.from(bundles.values());
    const bundleCounts = bundleList.reduce<Record<AnalysisBundleStatus, number>>(
      (acc, bundle) => {
        acc[bundle.status] += 1;
        return acc;
      },
      { accepted: 0, rejected: 0, draft: 0 },
    );

    return {
      generatedAt: new Date().toISOString(),
      run: {
        recordId: workspace.run.recordId,
        ...(typeof runPayload.title === 'string' ? { title: runPayload.title } : {}),
        status: runPayload.status,
        experimentId: runPayload.experimentId,
        ...(typeof runPayload.studyId === 'string' ? { studyId: runPayload.studyId } : {}),
        ...(typeof runPayload.methodEventGraphId === 'string' ? { methodEventGraphId: runPayload.methodEventGraphId } : {}),
        ...(typeof runPayload.methodPlatform === 'string' ? { methodPlatform: runPayload.methodPlatform } : {}),
        ...(typeof runPayload.methodVocabId === 'string' ? { methodVocabId: runPayload.methodVocabId } : {}),
      },
      eventGraph: workspace.eventGraph
        ? {
            recordId: workspace.eventGraph.recordId,
            ...(typeof workspace.eventGraph.payload.name === 'string' ? { name: workspace.eventGraph.payload.name } : {}),
            labwares: Array.isArray(workspace.eventGraph.payload.labwares) ? workspace.eventGraph.payload.labwares : [],
            readEvents: Array.isArray(workspace.eventGraph.payload.events)
              ? workspace.eventGraph.payload.events
                  .filter((event) => event?.event_type === 'read')
                  .map((event, index) => {
                    const details = asObject((event as Record<string, unknown>).details);
                    return {
                      eventId: typeof (event as Record<string, unknown>).eventId === 'string'
                        ? String((event as Record<string, unknown>).eventId)
                        : `read-${index + 1}`,
                      ...(typeof details?.instrument === 'string' ? { instrument: details.instrument } : {}),
                      ...(typeof details?.assay_ref === 'string' ? { assayRef: details.assay_ref } : {}),
                      ...(typeof details?.labwareId === 'string' ? { labwareId: details.labwareId } : {}),
                    };
                  })
              : [],
          }
        : null,
      biology: {
        wellGroups: workspace.wellGroups.map((group) => ({
          recordId: group.recordId,
          name: group.payload.name,
          ...(group.payload.source_ref?.id ? { sourceRefId: group.payload.source_ref.id } : {}),
          wellIds: group.payload.well_ids ?? [],
          ...(typeof group.payload.notes === 'string' ? { notes: group.payload.notes } : {}),
          ...(Array.isArray(group.payload.tags) ? { tags: group.payload.tags } : {}),
        })),
        assignments: allAssignments.map((assignment) => {
          const readoutDefRef = refSummary(assignment.payload.readout_def_ref);
          const targetRef = refSummary(assignment.payload.target_ref);
          return {
            recordId: assignment.recordId,
            ...(assignment.payload.measurement_context_ref?.id ? { measurementContextId: assignment.payload.measurement_context_ref.id } : {}),
            ...(typeof assignment.payload.role_family === 'string' ? { roleFamily: assignment.payload.role_family } : {}),
            ...(typeof assignment.payload.role_type === 'string' ? { roleType: assignment.payload.role_type } : {}),
            ...(typeof assignment.payload.expected_behavior === 'string' ? { expectedBehavior: assignment.payload.expected_behavior } : {}),
            ...(readoutDefRef ? { readoutDefRef } : {}),
            ...(targetRef ? { targetRef } : {}),
            subjects: (assignment.payload.subject_refs ?? []).map((subject) => ({
              id: subject.id || '',
              ...splitWellRef(subject.id || ''),
              ...(typeof subject.label === 'string' ? { label: subject.label } : {}),
            })),
            ...(typeof assignment.payload.notes === 'string' ? { notes: assignment.payload.notes } : {}),
          };
        }),
      },
      readouts: {
        contexts: workspace.measurementContexts.map((context) => {
          const instrument = refSummary(context.payload.instrument_ref);
          const assay = refSummary(context.payload.assay_def_ref);
          return {
            recordId: context.recordId,
            name: context.payload.name,
            ...(context.payload.source_ref?.id ? { sourceRefId: context.payload.source_ref.id } : {}),
            ...(instrument ? { instrument } : {}),
            ...(assay ? { assay } : {}),
            readouts: (context.payload.readout_def_refs ?? []).map((readout) => ({
              id: readout.id || '',
              ...(typeof readout.type === 'string' ? { type: readout.type } : {}),
              ...(typeof readout.label === 'string' ? { label: readout.label } : {}),
            })),
            readEventIds: asStringArray(context.payload.tags).filter((tag) => tag.startsWith('read_event:')).map((tag) => tag.slice('read_event:'.length)),
            qcControlIds: asStringArray(context.payload.tags).filter((tag) => tag.startsWith('qc:')).map((tag) => tag.slice('qc:'.length)),
            ...(typeof context.payload.timepoint === 'string' ? { timepoint: context.payload.timepoint } : {}),
            ...(typeof context.payload.series_id === 'string' ? { seriesId: context.payload.series_id } : {}),
            ...(typeof context.payload.notes === 'string' ? { notes: context.payload.notes } : {}),
            measurementCount: typeof (context.payload as MeasurementContextPayload & { measurement_count?: number }).measurement_count === 'number'
              ? (context.payload as MeasurementContextPayload & { measurement_count?: number }).measurement_count || 0
              : 0,
            linkedMeasurementIds: Array.isArray((context.payload as MeasurementContextPayload & { linked_measurement_ids?: string[] }).linked_measurement_ids)
              ? (context.payload as MeasurementContextPayload & { linked_measurement_ids?: string[] }).linked_measurement_ids || []
              : [],
          };
        }),
      },
      measurements: workspace.measurements.map((measurement) => {
        const payload = asObject(measurement.payload) ?? {};
        const rows = Array.isArray(payload.data) ? payload.data : [];
        const metrics = Array.from(new Set(rows.map((row) => typeof asObject(row)?.metric === 'string' ? String(asObject(row)?.metric) : null).filter((value): value is string => Boolean(value))));
        const channels = Array.from(new Set(rows.map((row) => typeof asObject(row)?.channelId === 'string' ? String(asObject(row)?.channelId) : null).filter((value): value is string => Boolean(value))));
        const labwareInstanceRef = asRef(payload.labwareInstanceRef);
        return {
          recordId: measurement.recordId,
          ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
          ...(measurement.payload.measurementContextRef?.id ? { measurementContextId: measurement.payload.measurementContextRef.id } : {}),
          ...(typeof measurement.payload.readEventRef === 'string' ? { readEventRef: measurement.payload.readEventRef } : {}),
          ...(measurement.payload.eventGraphRef?.id ? { eventGraphRef: measurement.payload.eventGraphRef.id } : {}),
          ...(labwareInstanceRef?.id ? { labwareInstanceId: labwareInstanceRef.id } : {}),
          metrics,
          channels,
          rowCount: rows.length,
          data: rows,
        };
      }),
      claims: {
        bundleCounts,
        bundles: bundleList,
      },
    };
  }

  async getRunAiContext(runId: string, tab: AiContextTab): Promise<RunAiContextResponse | null> {
    const workspace = await this.getRunWorkspace(runId);
    if (!workspace) return null;

    const runPayload = workspace.run.payload;
    const allAssignments = Object.values(workspace.wellRoleAssignmentsByContext).flat();
    const events = workspace.eventGraph?.payload.events ?? [];

    const base: Omit<RunAiContextResponse, 'tabContext'> = {
      runId: workspace.run.recordId,
      tab,
      run: {
        recordId: workspace.run.recordId,
        ...(typeof runPayload.title === 'string' ? { title: runPayload.title } : {}),
        status: runPayload.status,
        experimentId: runPayload.experimentId,
        ...(typeof runPayload.studyId === 'string' ? { studyId: runPayload.studyId } : {}),
        ...(typeof runPayload.methodEventGraphId === 'string' ? { methodEventGraphId: runPayload.methodEventGraphId } : {}),
      },
      eventGraph: workspace.eventGraph
        ? {
            recordId: workspace.eventGraph.recordId,
            ...(typeof workspace.eventGraph.payload.name === 'string' ? { name: workspace.eventGraph.payload.name } : {}),
            eventCount: events.length,
            labwareCount: workspace.eventGraph.payload.labwares?.length ?? 0,
            readEventCount: events.filter((event) => event?.event_type === 'read').length,
          }
        : null,
      counts: {
        measurementContexts: workspace.measurementContexts.length,
        wellGroups: workspace.wellGroups.length,
        roleAssignments: allAssignments.length,
        measurements: workspace.measurements.length,
        claims: workspace.claims.length,
        evidence: workspace.evidence.length,
        assertions: workspace.assertions.length,
      },
    };

    let tabContext: Record<string, unknown> = {};

    switch (tab) {
      case 'overview':
        tabContext = {
          emphasis: 'run metadata, study/experiment linkage, overall status',
          status: runPayload.status,
          experimentId: runPayload.experimentId,
          studyId: runPayload.studyId,
          eventCount: events.length,
          measurementCount: workspace.measurements.length,
          claimCount: workspace.claims.length,
        };
        break;

      case 'plan':
        tabContext = {
          emphasis: 'event graph structure, labware layout, planned events',
          eventGraph: workspace.eventGraph
            ? {
                name: workspace.eventGraph.payload.name,
                labwares: workspace.eventGraph.payload.labwares,
                eventCount: events.length,
              }
            : null,
        };
        break;

      case 'biology':
        tabContext = {
          emphasis: 'well role assignments, biological context records, cell/media/compound information',
          wellGroups: workspace.wellGroups.map((group) => ({
            recordId: group.recordId,
            name: group.payload.name,
            wellCount: group.payload.well_ids?.length ?? 0,
          })),
          assignmentCount: allAssignments.length,
          assignmentsByContext: Object.fromEntries(
            Object.entries(workspace.wellRoleAssignmentsByContext).map(([contextId, assignments]) => [
              contextId,
              assignments.map((assignment) => ({
                recordId: assignment.recordId,
                roleFamily: assignment.payload.role_family,
                roleType: assignment.payload.role_type,
                subjectCount: assignment.payload.subject_refs?.length ?? 0,
              })),
            ]),
          ),
        };
        break;

      case 'readouts':
        tabContext = {
          emphasis: 'measurement contexts, instruments, channels, assay definitions',
          contexts: workspace.measurementContexts.map((context) => ({
            recordId: context.recordId,
            name: context.payload.name,
            instrument: context.payload.instrument_ref,
            assay: context.payload.assay_def_ref,
            readoutDefs: context.payload.readout_def_refs,
            timepoint: context.payload.timepoint,
          })),
        };
        break;

      case 'results':
        tabContext = {
          emphasis: 'measurements, parsed data, QC expectations',
          measurements: workspace.measurements.map((measurement) => {
            const payload = asObject(measurement.payload) ?? {};
            const rows = Array.isArray(payload.data) ? payload.data : [];
            return {
              recordId: measurement.recordId,
              title: payload.title,
              measurementContextId: measurement.payload.measurementContextRef?.id,
              rowCount: rows.length,
            };
          }),
        };
        break;

      case 'claims':
        tabContext = {
          emphasis: 'evidence records, assertions, claim records, literature links',
          claims: workspace.claims.map((claim) => ({
            recordId: claim.recordId,
            statement: claim.payload.statement,
          })),
          assertions: workspace.assertions.map((assertion) => ({
            recordId: assertion.recordId,
            statement: assertion.payload.statement,
            claimRef: assertion.payload.claim_ref?.id,
          })),
          evidenceCount: workspace.evidence.length,
        };
        break;
    }

    return { ...base, tabContext };
  }
}
