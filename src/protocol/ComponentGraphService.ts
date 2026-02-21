import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

const GRAPH_COMPONENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/graph-component.schema.yaml';
const GRAPH_COMPONENT_VERSION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/graph-component-version.schema.yaml';
const GRAPH_COMPONENT_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/graph-component-instance.schema.yaml';

type ComponentState = 'draft' | 'published' | 'deprecated';
type InstanceStatus = 'unbound' | 'partial' | 'bound' | 'stale';

type Ref = {
  kind: 'record';
  id: string;
  type: string;
};

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function hasAnyBindings(bindings: Record<string, unknown> | undefined): boolean {
  if (!bindings) return false;
  const labware = Array.isArray(bindings['labware']) ? bindings['labware'] : [];
  const materials = Array.isArray(bindings['materials']) ? bindings['materials'] : [];
  const instruments = Array.isArray(bindings['instruments']) ? bindings['instruments'] : [];
  const parameters = Array.isArray(bindings['parameters']) ? bindings['parameters'] : [];
  return labware.length + materials.length + instruments.length + parameters.length > 0;
}

function normalizeRef(input: unknown, type: string): Ref {
  if (input === null || typeof input !== 'object') {
    throw new ComponentGraphError('BAD_REQUEST', 'ref must be an object', 400);
  }
  const obj = input as Record<string, unknown>;
  if (obj['kind'] !== 'record') {
    throw new ComponentGraphError('BAD_REQUEST', 'ref.kind must be "record"', 400);
  }
  if (typeof obj['id'] !== 'string' || obj['id'].trim().length === 0) {
    throw new ComponentGraphError('BAD_REQUEST', 'ref.id is required', 400);
  }
  return { kind: 'record', id: obj['id'].trim(), type };
}

export class ComponentGraphError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ComponentGraphService {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private async nextRecordId(prefix: string, kind: string): Promise<string> {
    const records = await this.ctx.store.list({ kind });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, prefix);
      if (n !== null && n > max) max = n;
    }
    return `${prefix}-${String(max + 1).padStart(6, '0')}`;
  }

  async createDraft(input: {
    recordId?: string;
    title: string;
    description?: string;
    roles?: Record<string, unknown>;
    compatibility?: Record<string, unknown>;
    template: Record<string, unknown>;
    tags?: string[];
    notes?: string;
  }): Promise<RecordEnvelope> {
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new ComponentGraphError('BAD_REQUEST', 'title is required', 400);
    }
    if (input.template === null || typeof input.template !== 'object') {
      throw new ComponentGraphError('BAD_REQUEST', 'template is required', 400);
    }

    const recordId = input.recordId?.trim() || await this.nextRecordId('GCP', 'graph-component');
    const payload: Record<string, unknown> = {
      kind: 'graph-component',
      recordId,
      title: input.title.trim(),
      state: 'draft',
      template: input.template,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.roles ? { roles: input.roles } : {}),
      ...(input.compatibility ? { compatibility: input.compatibility } : {}),
      ...(input.tags ? { tags: Array.from(new Set(input.tags.filter((t) => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()))) } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };

    const envelope: RecordEnvelope = {
      recordId,
      schemaId: GRAPH_COMPONENT_SCHEMA_ID,
      payload,
    };
    const created = await this.ctx.store.create({
      envelope,
      message: `Create graph component ${recordId}`,
    });
    if (!created.success || !created.envelope) {
      throw new ComponentGraphError('CREATE_FAILED', created.error ?? 'Failed to create component', 400);
    }
    return created.envelope;
  }

  async updateDraft(componentId: string, patch: {
    title?: string;
    description?: string;
    roles?: Record<string, unknown>;
    compatibility?: Record<string, unknown>;
    template?: Record<string, unknown>;
    tags?: string[];
    notes?: string;
    state?: ComponentState;
  }): Promise<RecordEnvelope> {
    const existing = await this.ctx.store.get(componentId);
    if (!existing) {
      throw new ComponentGraphError('NOT_FOUND', `Component not found: ${componentId}`, 404);
    }
    const payload = { ...(existing.payload as Record<string, unknown>) };
    if (patch.title !== undefined) payload['title'] = patch.title;
    if (patch.description !== undefined) payload['description'] = patch.description;
    if (patch.roles !== undefined) payload['roles'] = patch.roles;
    if (patch.compatibility !== undefined) payload['compatibility'] = patch.compatibility;
    if (patch.template !== undefined) payload['template'] = patch.template;
    if (patch.tags !== undefined) payload['tags'] = patch.tags;
    if (patch.notes !== undefined) payload['notes'] = patch.notes;
    if (patch.state !== undefined) payload['state'] = patch.state;

    const updated = await this.ctx.store.update({
      envelope: { ...existing, payload },
      message: `Update graph component ${componentId}`,
    });
    if (!updated.success || !updated.envelope) {
      throw new ComponentGraphError('UPDATE_FAILED', updated.error ?? 'Failed to update component', 400);
    }
    return updated.envelope;
  }

  async publish(componentId: string, input?: { version?: string; notes?: string }): Promise<{ component: RecordEnvelope; version: RecordEnvelope }> {
    const component = await this.ctx.store.get(componentId);
    if (!component) {
      throw new ComponentGraphError('NOT_FOUND', `Component not found: ${componentId}`, 404);
    }
    const versionRecordId = await this.nextRecordId('GCV', 'graph-component-version');
    const version = input?.version?.trim() || `1.0.${versionRecordId.slice(-2)}`;
    const componentPayload = component.payload as Record<string, unknown>;
    const versionPayload: Record<string, unknown> = {
      kind: 'graph-component-version',
      recordId: versionRecordId,
      componentRef: {
        kind: 'record',
        id: component.recordId,
        type: 'graph-component',
      },
      version,
      publishedAt: new Date().toISOString(),
      snapshot: componentPayload,
      ...(input?.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };
    const versionEnvelope: RecordEnvelope = {
      recordId: versionRecordId,
      schemaId: GRAPH_COMPONENT_VERSION_SCHEMA_ID,
      payload: versionPayload,
    };
    const createdVersion = await this.ctx.store.create({
      envelope: versionEnvelope,
      message: `Publish graph component version ${versionRecordId} from ${component.recordId}`,
    });
    if (!createdVersion.success || !createdVersion.envelope) {
      throw new ComponentGraphError('CREATE_FAILED', createdVersion.error ?? 'Failed to publish component version', 400);
    }

    const nextComponentPayload: Record<string, unknown> = {
      ...componentPayload,
      state: 'published',
      latestVersionRef: {
        kind: 'record',
        id: versionRecordId,
        type: 'graph-component-version',
      },
    };
    const updatedComponent = await this.ctx.store.update({
      envelope: { ...component, payload: nextComponentPayload },
      message: `Set latest version ${versionRecordId} on ${component.recordId}`,
    });
    if (!updatedComponent.success || !updatedComponent.envelope) {
      throw new ComponentGraphError('UPDATE_FAILED', updatedComponent.error ?? 'Failed to update component after publish', 400);
    }
    return {
      component: updatedComponent.envelope,
      version: createdVersion.envelope,
    };
  }

  async get(componentId: string): Promise<RecordEnvelope> {
    const component = await this.ctx.store.get(componentId);
    if (!component) {
      throw new ComponentGraphError('NOT_FOUND', `Component not found: ${componentId}`, 404);
    }
    return component;
  }

  async list(input?: { state?: ComponentState; limit?: number; offset?: number }): Promise<RecordEnvelope[]> {
    const records = await this.ctx.store.list({
      kind: 'graph-component',
      ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      ...(input?.offset !== undefined ? { offset: input.offset } : {}),
    });
    if (!input?.state) return records;
    return records.filter((envelope) => {
      const payload = envelope.payload as Record<string, unknown>;
      return payload['state'] === input.state;
    });
  }

  async instantiate(componentId: string, input: {
    sourceRef?: unknown;
    componentVersionRef?: unknown;
    bindings?: Record<string, unknown>;
    renderMode?: 'collapsed' | 'expanded';
    notes?: string;
  }): Promise<RecordEnvelope> {
    const component = await this.get(componentId);
    const componentPayload = component.payload as Record<string, unknown>;
    const latestVersionRef = componentPayload['latestVersionRef'];
    const versionRef = input.componentVersionRef !== undefined
      ? normalizeRef(input.componentVersionRef, 'graph-component-version')
      : (latestVersionRef ? normalizeRef(latestVersionRef, 'graph-component-version') : null);
    if (!versionRef) {
      throw new ComponentGraphError('BAD_REQUEST', `Component ${componentId} has no published version`, 400);
    }
    const versionRecord = await this.ctx.store.get(versionRef.id);
    if (!versionRecord) {
      throw new ComponentGraphError('NOT_FOUND', `Component version not found: ${versionRef.id}`, 404);
    }

    const instanceRecordId = await this.nextRecordId('GCI', 'graph-component-instance');
    const status: InstanceStatus = hasAnyBindings(input.bindings) ? 'partial' : 'unbound';
    const payload: Record<string, unknown> = {
      kind: 'graph-component-instance',
      recordId: instanceRecordId,
      componentRef: {
        kind: 'record',
        id: component.recordId,
        type: 'graph-component',
      },
      componentVersionRef: {
        kind: 'record',
        id: versionRecord.recordId,
        type: 'graph-component-version',
      },
      status,
      ...(input.sourceRef ? { sourceRef: normalizeRef(input.sourceRef, 'event_graph') } : {}),
      ...(input.bindings ? { bindings: input.bindings } : {}),
      render: { mode: input.renderMode ?? 'collapsed' },
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    };
    const envelope: RecordEnvelope = {
      recordId: instanceRecordId,
      schemaId: GRAPH_COMPONENT_INSTANCE_SCHEMA_ID,
      payload,
    };
    const created = await this.ctx.store.create({
      envelope,
      message: `Instantiate graph component ${componentId} as ${instanceRecordId}`,
    });
    if (!created.success || !created.envelope) {
      throw new ComponentGraphError('CREATE_FAILED', created.error ?? 'Failed to create component instance', 400);
    }
    return created.envelope;
  }

  async instanceStatus(instanceId: string): Promise<{
    instance: RecordEnvelope;
    stale: boolean;
    latestVersionRef?: Ref;
  }> {
    const instance = await this.ctx.store.get(instanceId);
    if (!instance) {
      throw new ComponentGraphError('NOT_FOUND', `Instance not found: ${instanceId}`, 404);
    }
    const payload = instance.payload as Record<string, unknown>;
    const componentRef = normalizeRef(payload['componentRef'], 'graph-component');
    const versionRef = normalizeRef(payload['componentVersionRef'], 'graph-component-version');
    const component = await this.ctx.store.get(componentRef.id);
    if (!component) {
      throw new ComponentGraphError('NOT_FOUND', `Component not found for instance: ${componentRef.id}`, 404);
    }
    const componentPayload = component.payload as Record<string, unknown>;
    const latest = componentPayload['latestVersionRef'] ? normalizeRef(componentPayload['latestVersionRef'], 'graph-component-version') : undefined;
    const stale = latest ? latest.id !== versionRef.id : false;
    return {
      instance,
      stale,
      ...(latest ? { latestVersionRef: latest } : {}),
    };
  }

  async upgradeInstance(instanceId: string): Promise<RecordEnvelope> {
    const status = await this.instanceStatus(instanceId);
    if (!status.latestVersionRef) {
      throw new ComponentGraphError('BAD_REQUEST', 'Component has no latest version reference', 400);
    }
    if (!status.stale) {
      return status.instance;
    }
    const payload = status.instance.payload as Record<string, unknown>;
    const hasBindings = hasAnyBindings(payload['bindings'] as Record<string, unknown> | undefined);
    const nextPayload: Record<string, unknown> = {
      ...payload,
      componentVersionRef: {
        kind: 'record',
        id: status.latestVersionRef.id,
        type: 'graph-component-version',
      },
      status: hasBindings ? 'partial' : 'unbound',
    };
    const updated = await this.ctx.store.update({
      envelope: { ...status.instance, payload: nextPayload },
      message: `Upgrade instance ${instanceId} to latest component version ${status.latestVersionRef.id}`,
    });
    if (!updated.success || !updated.envelope) {
      throw new ComponentGraphError('UPDATE_FAILED', updated.error ?? 'Failed to upgrade instance', 400);
    }
    return updated.envelope;
  }

  async suggestFromEventGraph(input: { eventGraphId: string; minOccurrences?: number }): Promise<{
    eventGraphId: string;
    minOccurrences: number;
    suggestions: Array<{
      signature: string;
      eventType: string;
      count: number;
      eventIds: string[];
      labwareIds: string[];
    }>;
  }> {
    const minOccurrences = input.minOccurrences ?? 2;
    const record = await this.ctx.store.get(input.eventGraphId);
    if (!record) {
      throw new ComponentGraphError('NOT_FOUND', `Event graph not found: ${input.eventGraphId}`, 404);
    }
    const payload = record.payload as Record<string, unknown>;
    const events = Array.isArray(payload['events']) ? payload['events'] as Array<Record<string, unknown>> : [];
    const buckets = new Map<string, { eventType: string; count: number; eventIds: string[]; labwareIds: Set<string> }>();
    for (const event of events) {
      const eventType = typeof event['event_type'] === 'string' ? event['event_type'] : 'other';
      const details = event['details'] && typeof event['details'] === 'object' ? event['details'] as Record<string, unknown> : {};
      const labwareId = typeof details['labwareId'] === 'string'
        ? details['labwareId']
        : (typeof details['source_labwareId'] === 'string' ? details['source_labwareId'] : '');
      const signature = `${eventType}::${labwareId || 'any'}`;
      const entry = buckets.get(signature) ?? { eventType, count: 0, eventIds: [], labwareIds: new Set<string>() };
      entry.count += 1;
      if (typeof event['eventId'] === 'string') entry.eventIds.push(event['eventId']);
      if (labwareId) entry.labwareIds.add(labwareId);
      buckets.set(signature, entry);
    }
    const suggestions = Array.from(buckets.entries())
      .filter(([, entry]) => entry.count >= minOccurrences)
      .map(([signature, entry]) => ({
        signature,
        eventType: entry.eventType,
        count: entry.count,
        eventIds: entry.eventIds,
        labwareIds: Array.from(entry.labwareIds),
      }))
      .sort((a, b) => b.count - a.count);
    return {
      eventGraphId: input.eventGraphId,
      minOccurrences,
      suggestions,
    };
  }
}
