import { randomUUID } from 'node:crypto';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { slugify } from '../compiler/material/MaterialCompiler.js';

const LOCAL_PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';
const PLANNED_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';
const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

export interface ProtocolContextQuery {
  studyId?: string;
  experimentId?: string;
  runId?: string;
}

export interface ProtocolContextResponse {
  projectTemplates: RecordEnvelope[];
  experimentProtocols: RecordEnvelope[];
  runMethods: RecordEnvelope[];
  promotableRunMethods: RecordEnvelope[];
  availableProtocols: RecordEnvelope[];
}

export interface UseProtocolInRunOptions {
  protocolId: string;
  runId: string;
  studyId?: string;
  experimentId?: string;
  title?: string;
  replace?: boolean;
}

export interface UseProtocolInRunResult {
  plannedRunId: string;
  methodEventGraphId: string;
  runId: string;
}

export interface SpecializeForExperimentOptions {
  protocolId: string;
  studyId: string;
  experimentId: string;
  title?: string;
}

export interface PromoteRunMethodOptions {
  runId?: string;
  plannedRunId?: string;
  eventGraphId?: string;
  studyId?: string;
  title?: string;
}

export class ProtocolContextError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function linksOf(record: RecordEnvelope | null | undefined): Record<string, unknown> {
  return asObject(asObject(record?.payload).links);
}

function payloadString(record: RecordEnvelope | null | undefined, key: string): string | undefined {
  const value = asObject(record?.payload)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function linkString(record: RecordEnvelope | null | undefined, key: string): string | undefined {
  const value = linksOf(record)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function recordKind(record: RecordEnvelope): string | undefined {
  return payloadString(record, 'kind');
}

function recordTitle(record: RecordEnvelope | null | undefined): string | undefined {
  return payloadString(record, 'title') ?? payloadString(record, 'name');
}

function refFor(recordId: string, type: string, label?: string): Record<string, unknown> {
  return { kind: 'record', id: recordId, type, ...(label ? { label } : {}) };
}

function refId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  const object = asObject(value);
  return typeof object.id === 'string' && object.id.length > 0 ? object.id : undefined;
}

function uniqueById(records: RecordEnvelope[]): RecordEnvelope[] {
  const seen = new Set<string>();
  const result: RecordEnvelope[] = [];
  for (const record of records) {
    if (seen.has(record.recordId)) continue;
    seen.add(record.recordId);
    result.push(record);
  }
  return result;
}

function makeId(prefix: string, title: string): string {
  return `${prefix}${slugify(title).slice(0, 48)}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export class ProtocolContextService {
  constructor(private store: RecordStore) {}

  async getContext(query: ProtocolContextQuery): Promise<ProtocolContextResponse> {
    const [protocols, localProtocols, plannedRuns, eventGraphs] = await Promise.all([
      this.store.list({ kind: 'protocol' }),
      this.store.list({ kind: 'local-protocol' }),
      this.store.list({ kind: 'planned-run' }),
      this.store.list({ kind: 'event-graph' }),
    ]);

    const projectTemplates = query.studyId
      ? uniqueById([
          ...protocols.filter((record) => linkString(record, 'studyId') === query.studyId && !linkString(record, 'experimentId') && !linkString(record, 'runId')),
          ...localProtocols.filter((record) => linkString(record, 'studyId') === query.studyId && !linkString(record, 'experimentId') && !linkString(record, 'runId')),
        ])
      : [];

    const experimentProtocols = query.experimentId
      ? localProtocols.filter((record) => {
          if (linkString(record, 'experimentId') !== query.experimentId) return false;
          return !query.studyId || linkString(record, 'studyId') === query.studyId;
        })
      : query.studyId
        ? localProtocols.filter((record) => linkString(record, 'studyId') === query.studyId && Boolean(linkString(record, 'experimentId')))
        : [];

    const runPlannedMethods = query.runId
      ? plannedRuns.filter((record) => linkString(record, 'runId') === query.runId)
      : [];
    const runEventGraphMethods = query.runId
      ? eventGraphs.filter((record) => linkString(record, 'runId') === query.runId)
      : [];
    const runMethods = uniqueById([...runPlannedMethods, ...runEventGraphMethods]);
    const promotableRunMethods = runMethods.filter((record) => ['planned-run', 'event-graph'].includes(recordKind(record) ?? ''));

    return {
      projectTemplates,
      experimentProtocols,
      runMethods,
      promotableRunMethods,
      availableProtocols: uniqueById([...runMethods, ...experimentProtocols, ...projectTemplates]),
    };
  }

  async useProtocolInRun(options: UseProtocolInRunOptions): Promise<UseProtocolInRunResult> {
    const protocol = await this.store.get(options.protocolId);
    if (!protocol) throw new ProtocolContextError(404, 'NOT_FOUND', `Protocol not found: ${options.protocolId}`);
    const kind = recordKind(protocol);
    if (kind !== 'protocol' && kind !== 'local-protocol') {
      throw new ProtocolContextError(400, 'BAD_PROTOCOL', `Record ${options.protocolId} is not a protocol or local-protocol.`);
    }

    const run = await this.store.get(options.runId);
    if (!run) throw new ProtocolContextError(404, 'NOT_FOUND', `Run not found: ${options.runId}`);
    const runPayload = asObject(run.payload);
    if (runPayload.kind !== 'run') throw new ProtocolContextError(400, 'BAD_RUN', `Record ${options.runId} is not a run.`);
    if (typeof runPayload.methodEventGraphId === 'string' && runPayload.methodEventGraphId.length > 0 && !options.replace) {
      throw new ProtocolContextError(409, 'METHOD_ALREADY_ATTACHED', `Run ${options.runId} already has an attached method.`);
    }

    const studyId = options.studyId ?? linkString(protocol, 'studyId') ?? payloadString(run, 'studyId') ?? linkString(run, 'studyId');
    const experimentId = options.experimentId ?? linkString(protocol, 'experimentId') ?? payloadString(run, 'experimentId') ?? linkString(run, 'experimentId');
    const protocolTitle = recordTitle(protocol) ?? options.protocolId;
    const plannedRunTitle = options.title ?? `Plan: ${protocolTitle}`;
    const plannedRunId = makeId('PLR-', plannedRunTitle);
    const methodEventGraphId = makeId('EVG-', `${protocolTitle} Method`);
    const now = new Date().toISOString();
    const protocolRef = refFor(options.protocolId, kind, protocolTitle);
    const links = {
      ...(studyId ? { studyId } : {}),
      ...(experimentId ? { experimentId } : {}),
      runId: options.runId,
    };

    const plannedRunPayload = {
      kind: 'planned-run',
      recordId: plannedRunId,
      title: plannedRunTitle,
      protocolLayer: 'lab',
      sourceType: kind,
      sourceRef: protocolRef,
      ...(kind === 'protocol' ? { protocolRef } : {}),
      ...(kind === 'local-protocol' ? { localProtocolRef: protocolRef } : {}),
      links,
      methodEventGraphId,
      state: 'draft',
      bindings: {
        labware: [],
        materials: [],
        contexts: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    const eventGraphPayload = {
      kind: 'event-graph',
      id: methodEventGraphId,
      name: `${protocolTitle} Method`,
      events: [],
      labwares: [],
      status: 'filed',
      links,
      methodContext: {
        runId: options.runId,
        vocabId: 'liquid-handling/v1',
        platform: 'manual',
        deckVariant: 'default',
        locked: false,
        plannedRunRef: refFor(plannedRunId, 'planned-run', plannedRunTitle),
        ...(kind === 'protocol' ? { protocolRef } : {}),
        ...(kind === 'local-protocol' ? { localProtocolRef: protocolRef } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };

    const plannedRunEnvelope: RecordEnvelope = {
      recordId: plannedRunId,
      schemaId: PLANNED_RUN_SCHEMA_ID,
      payload: plannedRunPayload,
      meta: { createdAt: now, updatedAt: now },
    };
    const eventGraphEnvelope: RecordEnvelope = {
      recordId: methodEventGraphId,
      schemaId: EVENT_GRAPH_SCHEMA_ID,
      payload: eventGraphPayload,
      meta: { createdAt: now, updatedAt: now },
    };

    const plannedCreate = await this.store.create({ envelope: plannedRunEnvelope, message: `Use ${options.protocolId} in run ${options.runId}` });
    if (!plannedCreate.success) throw new ProtocolContextError(422, 'CREATE_FAILED', plannedCreate.error ?? 'Failed to create planned-run.');
    const eventGraphCreate = await this.store.create({ envelope: eventGraphEnvelope, message: `Create method graph for ${plannedRunId}` });
    if (!eventGraphCreate.success) throw new ProtocolContextError(422, 'CREATE_FAILED', eventGraphCreate.error ?? 'Failed to create method event graph.');

    const updatedRunPayload = {
      ...runPayload,
      methodEventGraphId,
      plannedRunRef: refFor(plannedRunId, 'planned-run', plannedRunTitle),
      ...(kind === 'local-protocol' ? { localProtocolRef: protocolRef } : {}),
      methodPlatform: 'manual',
      methodVocabId: 'liquid-handling/v1',
      methodAttachedAt: now,
      updatedAt: now,
    };
    const runUpdate = await this.store.update({
      envelope: {
        ...run,
        payload: updatedRunPayload,
        meta: { ...run.meta, updatedAt: now },
      },
      message: `Attach ${plannedRunId} to ${options.runId}`,
    });
    if (!runUpdate.success) throw new ProtocolContextError(422, 'UPDATE_FAILED', runUpdate.error ?? 'Failed to attach protocol to run.');

    return { plannedRunId, methodEventGraphId, runId: options.runId };
  }

  async specializeForExperiment(options: SpecializeForExperimentOptions): Promise<RecordEnvelope> {
    if (!options.studyId) throw new ProtocolContextError(400, 'BAD_REQUEST', 'studyId is required.');
    if (!options.experimentId) throw new ProtocolContextError(400, 'BAD_REQUEST', 'experimentId is required.');
    const source = await this.store.get(options.protocolId);
    if (!source) throw new ProtocolContextError(404, 'NOT_FOUND', `Protocol not found: ${options.protocolId}`);
    const kind = recordKind(source);
    if (kind !== 'protocol' && kind !== 'local-protocol') {
      throw new ProtocolContextError(400, 'BAD_PROTOCOL', `Record ${options.protocolId} is not a protocol or local-protocol.`);
    }
    const sourcePayload = asObject(source.payload);
    const title = options.title ?? `${recordTitle(source) ?? options.protocolId} experiment method`;
    const recordId = makeId('LPR-', title);
    const inheritedRef = kind === 'local-protocol'
      ? asObject(sourcePayload.inherits_from)
      : refFor(options.protocolId, 'protocol', recordTitle(source));
    const now = new Date().toISOString();
    const payload = {
      kind: 'local-protocol',
      protocolLayer: 'lab',
      recordId,
      title,
      inherits_from: Object.keys(inheritedRef).length > 0 ? inheritedRef : refFor(options.protocolId, kind, recordTitle(source)),
      status: 'draft',
      links: {
        studyId: options.studyId,
        experimentId: options.experimentId,
      },
      ...(typeof sourcePayload.overview === 'string' ? { overview: sourcePayload.overview } : {}),
      ...(typeof sourcePayload.purpose === 'string' ? { purpose: sourcePayload.purpose } : {}),
      ...(typeof sourcePayload.notes === 'string' ? { notes: sourcePayload.notes } : {}),
      overrides: {},
      createdAt: now,
      updatedAt: now,
    };
    const envelope: RecordEnvelope = { recordId, schemaId: LOCAL_PROTOCOL_SCHEMA_ID, payload, meta: { createdAt: now, updatedAt: now } };
    const created = await this.store.create({ envelope, message: `Specialize ${options.protocolId} for ${options.experimentId}` });
    if (!created.success || !created.envelope) throw new ProtocolContextError(422, 'CREATE_FAILED', created.error ?? 'Failed to create local-protocol.');
    return created.envelope;
  }

  async promoteRunMethod(options: PromoteRunMethodOptions): Promise<RecordEnvelope> {
    const run = options.runId ? await this.store.get(options.runId) : null;
    const plannedRunId = options.plannedRunId ?? refId(asObject(run?.payload).plannedRunRef);
    const plannedRun = plannedRunId ? await this.store.get(plannedRunId) : null;
    const eventGraphId = options.eventGraphId ?? payloadString(run, 'methodEventGraphId') ?? payloadString(plannedRun, 'methodEventGraphId');
    const eventGraph = eventGraphId ? await this.store.get(eventGraphId) : null;

    if (!run && !plannedRun && !eventGraph) {
      throw new ProtocolContextError(400, 'BAD_REQUEST', 'Provide runId, plannedRunId, or eventGraphId for promotion.');
    }

    const studyId = options.studyId
      ?? payloadString(run, 'studyId')
      ?? linkString(run, 'studyId')
      ?? linkString(plannedRun, 'studyId')
      ?? linkString(eventGraph, 'studyId');
    if (!studyId) throw new ProtocolContextError(400, 'BAD_REQUEST', 'studyId is required or must be available from the run method.');

    let inheritedRef: Record<string, unknown> | undefined;
    const plannedPayload = asObject(plannedRun?.payload);
    const localProtocolId = refId(plannedPayload.localProtocolRef) ?? refId(asObject(run?.payload).localProtocolRef);
    if (localProtocolId) {
      const localProtocol = await this.store.get(localProtocolId);
      inheritedRef = asObject(asObject(localProtocol?.payload).inherits_from);
    }
    if (!inheritedRef || Object.keys(inheritedRef).length === 0) {
      const sourceRef = asObject(plannedPayload.sourceRef);
      if (typeof sourceRef.id === 'string' && typeof sourceRef.type === 'string') inheritedRef = sourceRef;
    }
    if (!inheritedRef || Object.keys(inheritedRef).length === 0) {
      const methodContext = asObject(asObject(eventGraph?.payload).methodContext);
      inheritedRef = asObject(methodContext.protocolRef);
      if (Object.keys(inheritedRef).length === 0) inheritedRef = asObject(methodContext.localProtocolRef);
    }
    if (!inheritedRef || Object.keys(inheritedRef).length === 0) {
      if (eventGraphId) inheritedRef = refFor(eventGraphId, 'event-graph', recordTitle(eventGraph));
      else if (plannedRunId) inheritedRef = refFor(plannedRunId, 'planned-run', recordTitle(plannedRun));
    }

    const baseTitle = options.title
      ?? `${recordTitle(run) ?? recordTitle(plannedRun) ?? recordTitle(eventGraph) ?? 'Promoted method'} template`;
    const recordId = makeId('LPR-', baseTitle);
    const now = new Date().toISOString();
    const payload = {
      kind: 'local-protocol',
      protocolLayer: 'lab',
      recordId,
      title: baseTitle,
      inherits_from: inheritedRef,
      status: 'draft',
      links: { studyId },
      notes: [
        options.runId ? `Promoted from run ${options.runId}.` : undefined,
        plannedRunId ? `Planned-run ${plannedRunId}.` : undefined,
        eventGraphId ? `Method event graph ${eventGraphId}.` : undefined,
      ].filter(Boolean).join(' '),
      overrides: {},
      createdAt: now,
      updatedAt: now,
    };
    const envelope: RecordEnvelope = { recordId, schemaId: LOCAL_PROTOCOL_SCHEMA_ID, payload, meta: { createdAt: now, updatedAt: now } };
    const created = await this.store.create({ envelope, message: `Promote run method to project template ${recordId}` });
    if (!created.success || !created.envelope) throw new ProtocolContextError(422, 'CREATE_FAILED', created.error ?? 'Failed to create project template.');
    return created.envelope;
  }
}
