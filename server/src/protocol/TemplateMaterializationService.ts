import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

export type DeckPlacement = {
  slotId: string;
  labwareId?: string;
  moduleId?: string;
};

export type SavedTemplateSnapshot = {
  version?: string;
  sourceEventGraphId?: string | null;
  playbackPosition?: number;
  anchorLabwareId?: string;
  closure?: { labwareIds?: string[]; eventIds?: string[] };
  experimentTypes?: string[];
  outputArtifacts?: TemplateOutputArtifact[];
  events?: Array<Record<string, unknown>>;
  labwares?: Array<Record<string, unknown>>;
  deck?: {
    platform?: string;
    variant?: string;
    placements?: DeckPlacement[];
  };
};

export type TemplateOutputArtifact = {
  outputId: string;
  label: string;
  kind: 'plate-snapshot';
  sourceLabwareId: string;
};

export type TemplateLabwareBinding =
  | {
      templateLabwareId: string;
      kind: 'plate-snapshot';
      snapshotId: string;
    }
  | {
      templateLabwareId: string;
      kind: 'protocol-template';
      templateId: string;
      outputId?: string;
      resolvedSnapshotId?: string;
    };

export interface TemplateSearchResult {
  templateId: string;
  title: string;
  description?: string;
  state?: string;
  sourceEventGraphId?: string;
  version?: string;
  experimentTypes: string[];
  deck?: {
    platform?: string;
    variant?: string;
    placementCount: number;
  };
  bindableLabwares: Array<{
    labwareId: string;
    name: string;
    labwareType: string;
  }>;
  outputs: TemplateOutputArtifact[];
  materials: string[];
  semanticKeywords: string[];
}

export interface MaterializedTemplateResult {
  templateId: string;
  title: string;
  experimentTypes: string[];
  outputs: TemplateOutputArtifact[];
  snapshot: SavedTemplateSnapshot;
  appliedBindings: TemplateLabwareBinding[];
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function parseSavedTemplateSnapshot(template: unknown): SavedTemplateSnapshot {
  const obj = toObject(template);
  if (!obj) return {};
  const insertionHints = toObject(obj['insertionHints']);
  if (insertionHints) return insertionHints as SavedTemplateSnapshot;
  return obj as SavedTemplateSnapshot;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeRecordId(payload: Record<string, unknown>, envelope: RecordEnvelope): string {
  return toString(payload['recordId']) || toString(payload['id']) || envelope.recordId;
}

function getTemplatePayload(envelope: RecordEnvelope): Record<string, unknown> | null {
  const payload = toObject(envelope.payload);
  if (!payload) return null;
  const template = toObject(payload['template']);
  return template;
}

function getTemplateLabel(envelope: RecordEnvelope): string {
  const payload = toObject(envelope.payload);
  return toString(payload?.['title']) || envelope.recordId;
}

function getTemplateSnapshot(envelope: RecordEnvelope): SavedTemplateSnapshot {
  return parseSavedTemplateSnapshot(getTemplatePayload(envelope));
}

function getBindableLabwares(snapshot: SavedTemplateSnapshot): Array<{ labwareId: string; name: string; labwareType: string }> {
  const labwares = Array.isArray(snapshot.labwares) ? snapshot.labwares : [];
  return labwares
    .map((labware) => toObject(labware))
    .filter((labware): labware is Record<string, unknown> => Boolean(labware && toString(labware['labwareId'])))
    .map((labware) => ({
      labwareId: toString(labware['labwareId']) || '',
      name: toString(labware['name']) || (toString(labware['labwareId']) || 'Labware'),
      labwareType: toString(labware['labwareType']) || 'unknown',
    }));
}

function getExperimentTypes(snapshot: SavedTemplateSnapshot): string[] {
  return Array.isArray(snapshot.experimentTypes)
    ? snapshot.experimentTypes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
}

function getOutputArtifacts(snapshot: SavedTemplateSnapshot): TemplateOutputArtifact[] {
  const outputs = Array.isArray(snapshot.outputArtifacts) ? snapshot.outputArtifacts : [];
  return outputs
    .map((output) => toObject(output))
    .filter((output): output is Record<string, unknown> => Boolean(output))
    .map((output) => ({
      outputId: toString(output['outputId']) || '',
      label: toString(output['label']) || '',
      kind: 'plate-snapshot' as const,
      sourceLabwareId: toString(output['sourceLabwareId']) || '',
    }))
    .filter((output) => output.outputId.length > 0 && output.label.length > 0 && output.sourceLabwareId.length > 0);
}

function addKeyword(target: Set<string>, value: unknown) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  target.add(trimmed);
}

function extractMaterialLabelsFromEvents(events: Array<Record<string, unknown>>): string[] {
  const labels = new Set<string>();
  for (const event of events) {
    if (toString(event['event_type']) !== 'add_material') continue;
    const details = toObject(event['details']);
    if (!details) continue;
    const refs = [details['material_spec_ref'], details['aliquot_ref'], details['material_ref']];
    for (const ref of refs) {
      if (typeof ref === 'string') {
        addKeyword(labels, ref);
        break;
      }
      const obj = toObject(ref);
      if (!obj) continue;
      addKeyword(labels, obj['label']);
      addKeyword(labels, obj['id']);
      break;
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b));
}

function matchAllTerms(haystack: string[], query?: string): boolean {
  if (!query || query.trim().length === 0) return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const joined = haystack.join(' \n ').toLowerCase();
  return terms.every((term) => joined.includes(term));
}

function buildContextLookup(contexts: RecordEnvelope[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const context of contexts) {
    const payload = toObject(context.payload);
    if (!payload) continue;
    const eventGraphRef = toObject(payload['event_graph_ref']);
    const eventGraphId = toString(eventGraphRef?.['id']);
    if (!eventGraphId) continue;
    const contextId = normalizeRecordId(payload, context);
    const existing = map.get(eventGraphId) || [];
    existing.push(contextId);
    map.set(eventGraphId, existing);
  }
  return map;
}

function extractSemanticKeywordsForTemplate(
  sourceEventGraphId: string | undefined,
  contextsByEventGraph: Map<string, string[]>,
  assertions: RecordEnvelope[],
  claimsById: Map<string, RecordEnvelope>
): string[] {
  if (!sourceEventGraphId) return [];
  const contextIds = new Set(contextsByEventGraph.get(sourceEventGraphId) || []);
  if (contextIds.size === 0) return [];
  const keywords = new Set<string>();
  for (const assertion of assertions) {
    const payload = toObject(assertion.payload);
    if (!payload) continue;
    const scope = toObject(payload['scope']);
    const controlContext = toString(toObject(scope?.['control_context'])?.['id']);
    const treatedContext = toString(toObject(scope?.['treated_context'])?.['id']);
    if (!controlContext && !treatedContext) continue;
    if (controlContext && !contextIds.has(controlContext) && treatedContext && !contextIds.has(treatedContext)) {
      continue;
    }
    addKeyword(keywords, payload['statement']);
    const outcome = toObject(payload['outcome']);
    addKeyword(keywords, outcome?.['measure']);
    const target = toObject(outcome?.['target']);
    addKeyword(keywords, target?.['label']);
    addKeyword(keywords, target?.['id']);
    addKeyword(keywords, outcome?.['direction']);

    const claimRef = toObject(payload['claim_ref']);
    const claimId = toString(claimRef?.['id']);
    if (!claimId) continue;
    const claim = claimsById.get(claimId);
    const claimPayload = toObject(claim?.payload);
    if (!claimPayload) continue;
    addKeyword(keywords, claimPayload['statement']);
    const subject = toObject(claimPayload['subject']);
    const predicate = toObject(claimPayload['predicate']);
    const object = toObject(claimPayload['object']);
    addKeyword(keywords, subject?.['label']);
    addKeyword(keywords, subject?.['id']);
    addKeyword(keywords, predicate?.['label']);
    addKeyword(keywords, predicate?.['id']);
    addKeyword(keywords, object?.['label']);
    addKeyword(keywords, object?.['id']);
  }
  return Array.from(keywords).sort((a, b) => a.localeCompare(b));
}

function createSeedEvent(input: {
  labwareId: string;
  well: string;
  materialRef: Record<string, unknown> | string;
  volume?: Record<string, unknown>;
  concentration?: Record<string, unknown>;
  count?: number;
  snapshotTitle: string;
  snapshotId: string;
  contextId: string;
  index: number;
}): Record<string, unknown> {
  return {
    eventId: `evt-seed-${Date.now().toString(36)}-${input.index.toString(36)}`,
    event_type: 'add_material',
    at: new Date().toISOString(),
    t_offset: 'PT0S',
    notes: `Seeded from plate snapshot ${input.snapshotTitle} (${input.snapshotId}) context ${input.contextId}.`,
    details: {
      labwareId: input.labwareId,
      wells: [input.well],
      material_ref: input.materialRef,
      ...(input.volume ? { volume: input.volume } : {}),
      ...(input.concentration ? { concentration: input.concentration } : {}),
      ...(typeof input.count === 'number' ? { count: input.count } : {}),
      note: `Seeded from snapshot ${input.snapshotTitle}`,
      metadata: {
        kind: 'seed_from_snapshot',
        snapshotId: input.snapshotId,
        contextId: input.contextId,
      },
    },
  };
}

export async function buildSeedEventsFromSnapshot(
  store: RecordStore,
  binding: Extract<TemplateLabwareBinding, { kind: 'plate-snapshot' }>,
  labwareName?: string
): Promise<{ events: Array<Record<string, unknown>>; labelSuffix: string }> {
  const snapshotEnvelope = await store.get(binding.snapshotId);
  if (!snapshotEnvelope) {
    throw new Error(`Plate snapshot not found: ${binding.snapshotId}`);
  }
  const snapshotPayload = toObject(snapshotEnvelope.payload);
  if (!snapshotPayload || toString(snapshotPayload['kind']) !== 'plate-snapshot') {
    throw new Error(`Record ${binding.snapshotId} is not a plate snapshot.`);
  }
  const wells = Array.isArray(snapshotPayload['wells']) ? snapshotPayload['wells'] : [];
  const snapshotTitle = toString(snapshotPayload['title']) || binding.snapshotId;
  const events: Array<Record<string, unknown>> = [];
  let eventIndex = 0;

  for (const entry of wells) {
    const mapping = toObject(entry);
    if (!mapping) continue;
    const well = toString(mapping['well']);
    const contextRef = toObject(mapping['context_ref']);
    const contextId = toString(contextRef?.['id']);
    if (!well || !contextId) continue;
    const contextEnvelope = await store.get(contextId);
    if (!contextEnvelope) continue;
    const contextPayload = toObject(contextEnvelope.payload);
    const contents = Array.isArray(contextPayload?.['contents']) ? contextPayload['contents'] : [];
    for (const content of contents) {
      const contentObj = toObject(content);
      if (!contentObj) continue;
      const materialRef = contentObj['material_ref'];
      const materialRefObject = toObject(materialRef);
      if (!(typeof materialRef === 'string' || materialRefObject)) continue;
      const volume = toObject(contentObj['volume']) || undefined;
      const concentration = toObject(contentObj['concentration']) || undefined;
      const count = typeof contentObj['count'] === 'number' ? contentObj['count'] : undefined;
      events.push(createSeedEvent({
        labwareId: binding.templateLabwareId,
        well,
        materialRef: typeof materialRef === 'string' ? materialRef : deepClone(materialRefObject as Record<string, unknown>),
        snapshotTitle,
        snapshotId: binding.snapshotId,
        contextId,
        index: eventIndex,
        ...(volume ? { volume } : {}),
        ...(concentration ? { concentration } : {}),
        ...(typeof count === 'number' ? { count } : {}),
      }));
      eventIndex += 1;
    }
  }

  return {
    events,
    labelSuffix: `${labwareName || binding.templateLabwareId} <- ${snapshotTitle}`,
  };
}

export async function searchTemplates(
  store: RecordStore,
  params: {
    q?: string;
    platform?: string;
    deckVariant?: string;
    experimentType?: string;
    semantic?: string;
    material?: string;
    limit?: number;
  }
): Promise<TemplateSearchResult[]> {
  const [components, contexts, assertions, claims] = await Promise.all([
    store.list({ kind: 'graph-component', limit: 10000 }),
    store.list({ kind: 'context', limit: 10000 }).catch(() => []),
    store.list({ kind: 'assertion', limit: 10000 }).catch(() => []),
    store.list({ kind: 'claim', limit: 10000 }).catch(() => []),
  ]);

  const contextsByEventGraph = buildContextLookup(contexts);
  const claimsById = new Map<string, RecordEnvelope>();
  for (const claim of claims) {
    const payload = toObject(claim.payload);
    if (!payload) continue;
    claimsById.set(normalizeRecordId(payload, claim), claim);
  }

  const results = components.reduce<TemplateSearchResult[]>((acc, component) => {
      const payload = toObject(component.payload);
      const template = getTemplatePayload(component);
      if (!payload || !template) return acc;
      const snapshot = parseSavedTemplateSnapshot(template);
      const title = toString(payload['title']) || component.recordId;
      const description = toString(payload['description']);
      const materials = extractMaterialLabelsFromEvents((snapshot.events || []).filter((event): event is Record<string, unknown> => Boolean(toObject(event))));
      const sourceEventGraphId = toString(snapshot.sourceEventGraphId) || undefined;
      const outputArtifacts = getOutputArtifacts(snapshot);
      const experimentTypes = getExperimentTypes(snapshot);
      const semanticKeywords = [
        ...extractSemanticKeywordsForTemplate(sourceEventGraphId, contextsByEventGraph, assertions, claimsById),
        ...outputArtifacts.map((output) => output.label),
        ...experimentTypes,
      ];
      const version = toString(snapshot.version);
      const platform = toString(snapshot.deck?.platform);
      const variant = toString(snapshot.deck?.variant);
      const state = toString(payload['state']);
      const result: TemplateSearchResult = {
        templateId: component.recordId,
        title,
        ...(description ? { description } : {}),
        ...(state ? { state } : {}),
        ...(sourceEventGraphId ? { sourceEventGraphId } : {}),
        ...(version ? { version } : {}),
        experimentTypes,
        ...(snapshot.deck ? { deck: {
          ...(platform ? { platform } : {}),
          ...(variant ? { variant } : {}),
          placementCount: Array.isArray(snapshot.deck?.placements) ? snapshot.deck?.placements.length : 0,
        } } : {}),
        bindableLabwares: getBindableLabwares(snapshot),
        outputs: outputArtifacts,
        materials,
        semanticKeywords,
      };
      acc.push(result);
      return acc;
    }, [])
    .filter((item) => (!params.platform || item.deck?.platform === params.platform))
    .filter((item) => (!params.deckVariant || item.deck?.variant === params.deckVariant))
    .filter((item) => (!params.experimentType || item.experimentTypes.includes(params.experimentType)))
    .filter((item) => matchAllTerms([item.title, item.description || '', ...item.materials, ...item.semanticKeywords, ...item.experimentTypes], params.q))
    .filter((item) => matchAllTerms(item.materials, params.material))
    .filter((item) => matchAllTerms(item.semanticKeywords, params.semantic));

  const scored = results
    .map((item) => {
      let score = 0;
      const q = params.q?.toLowerCase().trim();
      if (q) {
        if (item.title.toLowerCase().includes(q)) score += 20;
        if (item.materials.some((material) => material.toLowerCase().includes(q))) score += 12;
        if (item.semanticKeywords.some((keyword) => keyword.toLowerCase().includes(q))) score += 8;
        if (item.experimentTypes.some((type) => type.toLowerCase().includes(q))) score += 6;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  return scored.slice(0, limit).map(({ item }) => item);
}

export async function materializeTemplate(
  store: RecordStore,
  templateId: string,
  bindings: TemplateLabwareBinding[] = []
): Promise<MaterializedTemplateResult> {
  const templateEnvelope = await store.get(templateId);
  if (!templateEnvelope) {
    throw new Error(`Template not found: ${templateId}`);
  }
  const payload = toObject(templateEnvelope.payload);
  const template = getTemplatePayload(templateEnvelope);
  if (!payload || !template) {
    throw new Error(`Template ${templateId} does not include template payload.`);
  }
  const parsedSnapshot = parseSavedTemplateSnapshot(template);
  const experimentTypes = getExperimentTypes(parsedSnapshot);
  const outputs = getOutputArtifacts(parsedSnapshot);
  const snapshot: SavedTemplateSnapshot = {
    ...parsedSnapshot,
    events: deepClone((parsedSnapshot.events || []).filter((event): event is Record<string, unknown> => Boolean(toObject(event)))),
    labwares: deepClone((parsedSnapshot.labwares || []).filter((labware): labware is Record<string, unknown> => Boolean(toObject(labware)))),
    ...(parsedSnapshot.deck ? { deck: deepClone(parsedSnapshot.deck) } : {}),
  };

  const labwareMap = new Map<string, Record<string, unknown>>();
  for (const labware of snapshot.labwares || []) {
    const labwareId = toString(toObject(labware)?.['labwareId']);
    if (!labwareId) continue;
    labwareMap.set(labwareId, labware);
  }

  const seedEvents: Array<Record<string, unknown>> = [];
  const appliedBindings: TemplateLabwareBinding[] = [];
  for (const binding of bindings) {
    const targetLabware = labwareMap.get(binding.templateLabwareId);
    if (!targetLabware) {
      throw new Error(`Template labware ${binding.templateLabwareId} is not part of template ${templateId}.`);
    }
    if (binding.kind === 'plate-snapshot') {
      const seeded = await buildSeedEventsFromSnapshot(store, binding, toString(targetLabware['name']));
      seedEvents.push(...seeded.events);
      targetLabware['name'] = seeded.labelSuffix;
      targetLabware['notes'] = `Seeded from plate snapshot ${binding.snapshotId}.`;
      appliedBindings.push(binding);
      continue;
    }

    if (binding.resolvedSnapshotId) {
      const seeded = await buildSeedEventsFromSnapshot(
        store,
        { templateLabwareId: binding.templateLabwareId, kind: 'plate-snapshot', snapshotId: binding.resolvedSnapshotId },
        toString(targetLabware['name'])
      );
      seedEvents.push(...seeded.events);
    }

    const upstreamTemplate = await store.get(binding.templateId);
    if (!upstreamTemplate) {
      throw new Error(`Protocol template not found: ${binding.templateId}`);
    }
    const upstreamSnapshot = getTemplateSnapshot(upstreamTemplate);
    const upstreamOutputs = getOutputArtifacts(upstreamSnapshot);
    const outputLabel = binding.outputId
      ? upstreamOutputs.find((output) => output.outputId === binding.outputId)?.label || binding.outputId
      : undefined;
    targetLabware['notes'] = `Bound to upstream protocol template ${getTemplateLabel(upstreamTemplate)} (${binding.templateId})${outputLabel ? ` output ${outputLabel}` : ''}${binding.resolvedSnapshotId ? ` via snapshot ${binding.resolvedSnapshotId}` : ''}.`;
    appliedBindings.push(binding);
  }

  snapshot.events = [...seedEvents, ...(snapshot.events || [])];

  return {
    templateId,
    title: toString(payload['title']) || templateId,
    experimentTypes,
    outputs,
    snapshot,
    appliedBindings,
  };
}
