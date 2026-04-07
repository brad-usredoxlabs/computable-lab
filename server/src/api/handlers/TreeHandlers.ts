/**
 * TreeHandlers — HTTP handlers for tree navigation and filing operations.
 * 
 * These handlers provide endpoints for:
 * - Getting the study/experiment/run hierarchy
 * - Getting records for a specific run
 * - Getting inbox records
 * - Filing records from inbox into runs
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IndexManager } from '../../index/IndexManager.js';
import type { RecordStore } from '../../store/types.js';
import type { StudyTreeNode, IndexEntry } from '../../index/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { PlatformRegistry } from '../../platform-registry/PlatformRegistry.js';
import {
  buildSeedEventsFromSnapshot,
  materializeTemplate as materializeTemplateService,
  searchTemplates as searchTemplatesService,
  type TemplateLabwareBinding,
  type TemplateOutputArtifact,
  type TemplateSearchResult,
} from '../../protocol/TemplateMaterializationService.js';

/**
 * Response types for tree endpoints.
 */
export interface StudyTreeResponse {
  studies: StudyTreeNode[];
}

export interface RecordsListResponse {
  records: IndexEntry[];
  total: number;
}

export interface FileRecordResponse {
  success: boolean;
  newPath?: string;
  error?: string;
}

export interface RebuildIndexResponse {
  success: boolean;
  count: number;
  generatedAt: string;
}

export interface RunMethodSummaryResponse {
  runId: string;
  hasMethod: boolean;
  methodEventGraphId?: string;
  methodPlatform?: string;
  methodVocabId?: 'liquid-handling/v1' | 'animal-handling/v1';
  methodTemplateId?: string;
  templateInputResolutions: TemplateInputResolution[];
  runOutputs: RunOutputState[];
}

export interface TemplateSearchResponse {
  items: TemplateSearchResult[];
  total: number;
}

export interface MaterializeTemplateResponse {
  templateId: string;
  title: string;
  experimentTypes: string[];
  outputs: Array<{
    outputId: string;
    label: string;
    kind: 'plate-snapshot';
    sourceLabwareId: string;
  }>;
  snapshot: SavedTemplateSnapshot;
  appliedBindings: TemplateLabwareBinding[];
}

export type TemplateInputResolution =
  | {
      templateLabwareId: string;
      slotLabel: string;
      kind: 'existing-snapshot';
      status: 'resolved';
      snapshotId: string;
    }
  | {
      templateLabwareId: string;
      slotLabel: string;
      kind: 'upstream-run';
      status: 'planned' | 'run_created' | 'resolved';
      upstreamTemplateId: string;
      upstreamOutputId?: string;
      upstreamRunId?: string;
      producedSnapshotId?: string;
    };

export type RunOutputState = {
  outputId: string;
  label: string;
  sourceLabwareId: string;
  status: 'declared' | 'produced';
  snapshotId?: string;
};

export interface CreateRunFromTemplateResponse {
  success: boolean;
  runId: string;
  methodEventGraphId: string;
  templateInputResolutions: TemplateInputResolution[];
  runOutputs: RunOutputState[];
}

type DeckPlacement = {
  slotId: string;
  labwareId?: string;
  moduleId?: string;
};

type SavedTemplateSnapshot = {
  sourceEventGraphId?: string | null;
  experimentTypes?: string[];
  outputArtifacts?: Array<{
    outputId: string;
    label: string;
    kind: 'plate-snapshot';
    sourceLabwareId: string;
  }>;
  events?: unknown[];
  labwares?: unknown[];
  deck?: {
    platform?: string;
    variant?: string;
    placements?: DeckPlacement[];
  };
  closure?: {
    labwareIds?: string[];
    eventIds?: string[];
  };
};

type PromoteRunOutputBody = {
  snapshotId?: string;
  sourceContextIds?: string[];
  title?: string;
  tags?: string[];
  sourceEventGraphRef?: {
    kind: 'record' | 'ontology';
    id: string;
    type?: string;
    namespace?: string;
    label?: string;
    uri?: string;
  };
  labwareRef?: {
    kind: 'record' | 'ontology';
    id: string;
    type?: string;
    namespace?: string;
    label?: string;
    uri?: string;
  };
  wellMappings?: Array<{
    well: string;
    contextId: string;
    role?: string;
  }>;
};

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function eventGraphIdFromRecordId(prefix: string = 'EVG'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function parseSavedTemplateSnapshot(template: unknown): SavedTemplateSnapshot {
  const obj = toObject(template);
  if (!obj) return {};
  const insertionHints = toObject(obj['insertionHints']);
  if (insertionHints) return insertionHints as SavedTemplateSnapshot;
  return obj as SavedTemplateSnapshot;
}

function getTemplatePayload(envelope: RecordEnvelope): Record<string, unknown> | null {
  const payload = toObject(envelope.payload);
  if (!payload) return null;
  return toObject(payload['template']);
}

function getTemplateSnapshot(envelope: RecordEnvelope): SavedTemplateSnapshot {
  return parseSavedTemplateSnapshot(getTemplatePayload(envelope));
}

function getTemplateOutputArtifacts(snapshot: SavedTemplateSnapshot): TemplateOutputArtifact[] {
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

function getTemplateBindableLabwareLabels(snapshot: SavedTemplateSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  const labwares = Array.isArray(snapshot.labwares) ? snapshot.labwares : [];
  for (const labware of labwares) {
    const obj = toObject(labware);
    const labwareId = toString(obj?.['labwareId']);
    if (!labwareId) continue;
    map.set(labwareId, toString(obj?.['name']) || labwareId);
  }
  return map;
}

function parseTemplateInputResolutions(value: unknown): TemplateInputResolution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .reduce<TemplateInputResolution[]>((acc, entry) => {
      const templateLabwareId = toString(entry['templateLabwareId']);
      const slotLabel = toString(entry['slotLabel']);
      const kind = toString(entry['kind']);
      const status = toString(entry['status']);
      if (!templateLabwareId || !slotLabel || !kind || !status) return acc;
      if (kind === 'existing-snapshot') {
        const snapshotId = toString(entry['snapshotId']) || toString(entry['producedSnapshotId']);
        if (!snapshotId) return acc;
        acc.push({
          templateLabwareId,
          slotLabel,
          kind: 'existing-snapshot' as const,
          status: 'resolved' as const,
          snapshotId,
        });
        return acc;
      }
      if (kind === 'upstream-run') {
        const upstreamTemplateId = toString(entry['upstreamTemplateId']);
        if (!upstreamTemplateId) return acc;
        const upstreamOutputId = toString(entry['upstreamOutputId']);
        const upstreamRunId = toString(entry['upstreamRunId']);
        const producedSnapshotId = toString(entry['producedSnapshotId']);
        acc.push({
          templateLabwareId,
          slotLabel,
          kind: 'upstream-run' as const,
          status: status === 'run_created' || status === 'resolved' ? status : 'planned',
          upstreamTemplateId,
          ...(upstreamOutputId ? { upstreamOutputId } : {}),
          ...(upstreamRunId ? { upstreamRunId } : {}),
          ...(producedSnapshotId ? { producedSnapshotId } : {}),
        });
        return acc;
      }
      return acc;
    }, []);
}

function parseRunOutputs(value: unknown): RunOutputState[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .reduce<RunOutputState[]>((acc, entry) => {
      const outputId = toString(entry['outputId']);
      const label = toString(entry['label']);
      const sourceLabwareId = toString(entry['sourceLabwareId']);
      const status = toString(entry['status']);
      if (!outputId || !label || !sourceLabwareId || !status) return acc;
      if (status !== 'declared' && status !== 'produced') return acc;
      const snapshotId = toString(entry['snapshotId']);
      acc.push({
        outputId,
        label,
        sourceLabwareId,
        status,
        ...(snapshotId ? { snapshotId } : {}),
      });
      return acc;
    }, []);
}

function buildTemplateBindingsFromInputResolutions(inputResolutions: TemplateInputResolution[]): TemplateLabwareBinding[] {
  return inputResolutions.reduce<TemplateLabwareBinding[]>((acc, resolution) => {
    if (resolution.kind === 'existing-snapshot') {
      acc.push({
        templateLabwareId: resolution.templateLabwareId,
        kind: 'plate-snapshot' as const,
        snapshotId: resolution.snapshotId,
      });
      return acc;
    }
    acc.push({
      templateLabwareId: resolution.templateLabwareId,
      kind: 'protocol-template' as const,
      templateId: resolution.upstreamTemplateId,
      ...(resolution.upstreamOutputId ? { outputId: resolution.upstreamOutputId } : {}),
      ...(resolution.producedSnapshotId ? { resolvedSnapshotId: resolution.producedSnapshotId } : {}),
    });
    return acc;
  }, []);
}

function buildTemplateInputResolutions(
  snapshot: SavedTemplateSnapshot,
  inputResolutions?: TemplateInputResolution[],
): TemplateInputResolution[] {
  const labels = getTemplateBindableLabwareLabels(snapshot);
  const provided = inputResolutions ?? [];
  return provided
    .filter((resolution) => labels.has(resolution.templateLabwareId))
    .map((resolution) => ({
      ...resolution,
      slotLabel: labels.get(resolution.templateLabwareId) || resolution.slotLabel,
    }));
}

function buildRunOutputs(snapshot: SavedTemplateSnapshot): RunOutputState[] {
  return getTemplateOutputArtifacts(snapshot).map((output) => ({
    outputId: output.outputId,
    label: output.label,
    sourceLabwareId: output.sourceLabwareId,
    status: 'declared' as const,
  }));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Create tree handlers bound to an IndexManager and RecordStore.
 */
export function createTreeHandlers(
  indexManager: IndexManager,
  recordStore: RecordStore,
  platformRegistry: PlatformRegistry
) {
  async function updateRunIndex(recordId: string, payload: Record<string, unknown>): Promise<void> {
    const runEntry = await indexManager.getByRecordId(recordId);
    if (!runEntry) return;
    await indexManager.updateEntry({
      ...runEntry,
      ...(typeof payload.updatedAt === 'string' ? { updatedAt: payload.updatedAt } : {}),
      ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
    });
  }

  async function attachTemplateInternal(input: {
    runId: string;
    templateId?: string;
    replace: boolean;
    vocabId: 'liquid-handling/v1' | 'animal-handling/v1';
    platform: string;
    deckVariant: string;
    templateBindings?: TemplateLabwareBinding[];
    inputResolutions?: TemplateInputResolution[];
  }): Promise<
    | {
        success: true;
        runRecord: RecordEnvelope;
        methodEventGraphId: string;
        replaced: boolean;
        templateInputResolutions: TemplateInputResolution[];
        runOutputs: RunOutputState[];
      }
    | {
        success: false;
        status: number;
        error: string;
        message: string;
        existingMethodEventGraphId?: string;
      }
  > {
    const runRecord = await recordStore.get(input.runId);
    if (!runRecord) {
      return { success: false, status: 404, error: 'NOT_FOUND', message: `Run not found: ${input.runId}` };
    }
    const runPayload = (runRecord.payload ?? {}) as Record<string, unknown>;
    const existingMethod = typeof runPayload['methodEventGraphId'] === 'string' ? runPayload['methodEventGraphId'] : undefined;
    if (existingMethod && !input.replace) {
      return {
        success: false,
        status: 409,
        error: 'METHOD_ALREADY_ATTACHED',
        message: `Run ${input.runId} already has an attached method.`,
        existingMethodEventGraphId: existingMethod,
      };
    }

    let events: unknown[] = [];
    let labwares: unknown[] = [];
    let placements: Array<{ slotId: string; labwareId?: string; moduleId?: string }> = [];
    let templateInputResolutions: TemplateInputResolution[] = [];
    let runOutputs: RunOutputState[] = [];
    let templateBindings = Array.isArray(input.templateBindings) ? input.templateBindings : [];

    if (input.templateId && input.templateId.trim().length > 0) {
      let materialized: MaterializeTemplateResponse;
      try {
        const snapshotEnvelope = await recordStore.get(input.templateId);
        if (!snapshotEnvelope) {
          return { success: false, status: 404, error: 'NOT_FOUND', message: `Template not found: ${input.templateId}` };
        }
        const snapshot = getTemplateSnapshot(snapshotEnvelope);
        templateInputResolutions = buildTemplateInputResolutions(snapshot, input.inputResolutions);
        runOutputs = buildRunOutputs(snapshot);
        if (templateBindings.length === 0 && templateInputResolutions.length > 0) {
          templateBindings = buildTemplateBindingsFromInputResolutions(templateInputResolutions);
        }
        materialized = await materializeTemplateService(recordStore, input.templateId, templateBindings);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          status: message.includes('not found') ? 404 : 422,
          error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_TEMPLATE',
          message,
        };
      }
      events = Array.isArray(materialized.snapshot.events) ? materialized.snapshot.events : [];
      labwares = Array.isArray(materialized.snapshot.labwares) ? materialized.snapshot.labwares : [];
      if (events.length === 0 || labwares.length === 0) {
        return {
          success: false,
          status: 422,
          error: 'BAD_TEMPLATE',
          message: `Template ${input.templateId} is missing snapshot events or labwares.`,
        };
      }
      placements = Array.isArray(materialized.snapshot.deck?.placements)
        ? materialized.snapshot.deck.placements
            .map((p) => toObject(p))
            .filter((p): p is Record<string, unknown> => Boolean(p))
            .map((p) => ({
              slotId: typeof p['slotId'] === 'string' ? p['slotId'] : '',
              ...(typeof p['labwareId'] === 'string' ? { labwareId: p['labwareId'] } : {}),
              ...(typeof p['moduleId'] === 'string' ? { moduleId: p['moduleId'] } : {}),
            }))
            .filter((p) => p.slotId.length > 0)
        : [];
    }

    const methodEventGraphId = eventGraphIdFromRecordId();
    const now = new Date().toISOString();
    const linksObj = toObject(runPayload['links']);
    const runStudyId = typeof linksObj?.['studyId'] === 'string'
      ? linksObj.studyId
      : (typeof runPayload['studyId'] === 'string' ? runPayload['studyId'] : undefined);
    const runExperimentId = typeof linksObj?.['experimentId'] === 'string'
      ? linksObj.experimentId
      : (typeof runPayload['experimentId'] === 'string' ? runPayload['experimentId'] : undefined);
    const eventGraphPayload = {
      id: methodEventGraphId,
      name: `${(runPayload['title'] as string | undefined) || input.runId} Method`,
      events,
      labwares,
      status: 'filed',
      links: {
        ...(runStudyId ? { studyId: runStudyId } : {}),
        ...(runExperimentId ? { experimentId: runExperimentId } : {}),
        runId: input.runId,
      },
      methodContext: {
        runId: input.runId,
        ...(input.templateId ? { sourceTemplateId: input.templateId } : {}),
        vocabId: input.vocabId,
        platform: input.platform,
        deckVariant: input.deckVariant,
        locked: true,
        ...(templateBindings.length > 0 ? { templateBindings } : {}),
      },
      deckLayout: {
        placements,
        labwareOrientations: {},
      },
      createdAt: now,
      updatedAt: now,
    };
    const eventGraphEnvelope = createEnvelope(
      eventGraphPayload,
      'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
      { createdAt: now, updatedAt: now }
    );
    if (!eventGraphEnvelope) {
      return { success: false, status: 500, error: 'CREATE_FAILED', message: 'Failed to create event-graph envelope' };
    }
    const created = await recordStore.create({
      envelope: eventGraphEnvelope,
      message: `Attach template ${input.templateId} to run ${input.runId}`,
    });
    if (!created.success) {
      return { success: false, status: 500, error: 'CREATE_FAILED', message: created.error || 'Failed to create method event graph' };
    }

    const updatedRunPayload: Record<string, unknown> = {
      ...runPayload,
      methodEventGraphId,
      methodPlatform: input.platform,
      methodVocabId: input.vocabId,
      methodAttachedAt: now,
      updatedAt: now,
      ...(templateInputResolutions.length > 0 ? { templateInputResolutions } : {}),
      ...(runOutputs.length > 0 ? { runOutputs } : {}),
    };
    if (input.templateId) {
      updatedRunPayload['methodTemplateRef'] = { kind: 'record', id: input.templateId, type: 'graph-component' };
    } else {
      delete updatedRunPayload['methodTemplateRef'];
    }
    const runUpdate = await recordStore.update({
      envelope: {
        ...runRecord,
        payload: updatedRunPayload,
        meta: {
          ...runRecord.meta,
          updatedAt: now,
        },
      },
      message: `${input.replace ? 'Replace' : 'Attach'} method ${input.templateId ? `template ${input.templateId}` : 'blank'} on run ${input.runId}`,
    });
    if (!runUpdate.success) {
      return { success: false, status: 500, error: 'UPDATE_FAILED', message: runUpdate.error || 'Failed to update run method metadata' };
    }
    await updateRunIndex(input.runId, updatedRunPayload);
    return {
      success: true,
      runRecord: runUpdate.envelope || runRecord,
      methodEventGraphId,
      replaced: Boolean(existingMethod && input.replace),
      templateInputResolutions,
      runOutputs,
    };
  }

  async function applySnapshotResolutionToMethod(input: {
    runId: string;
    templateLabwareId: string;
    snapshotId: string;
    upstreamTemplateId?: string;
    upstreamOutputId?: string;
  }): Promise<void> {
    const runRecord = await recordStore.get(input.runId);
    if (!runRecord) return;
    const runPayload = (runRecord.payload ?? {}) as Record<string, unknown>;
    const methodEventGraphId = toString(runPayload['methodEventGraphId']);
    if (!methodEventGraphId) return;
    const methodRecord = await recordStore.get(methodEventGraphId);
    if (!methodRecord) return;
    const methodPayload = clone((methodRecord.payload ?? {}) as Record<string, unknown>);
    const methodContext = toObject(methodPayload['methodContext']) || {};
    const existingBindings = Array.isArray(methodContext['templateBindings']) ? methodContext['templateBindings'].map((entry) => clone(entry)) : [];
    const nextBindings = existingBindings.filter((entry) => {
      const obj = toObject(entry);
      return !(
        toString(obj?.['kind']) === 'plate-snapshot'
        && toString(obj?.['templateLabwareId']) === input.templateLabwareId
      );
    });
    let updatedBinding = false;
    for (const entry of nextBindings) {
      const obj = toObject(entry);
      if (!obj) continue;
      if (toString(obj['templateLabwareId']) !== input.templateLabwareId) continue;
      if (toString(obj['kind']) === 'protocol-template') {
        obj['resolvedSnapshotId'] = input.snapshotId;
        updatedBinding = true;
      }
    }
    if (!updatedBinding) {
      nextBindings.push({
        templateLabwareId: input.templateLabwareId,
        kind: 'plate-snapshot',
        snapshotId: input.snapshotId,
      });
    }
    const seeded = await buildSeedEventsFromSnapshot(
      recordStore,
      { templateLabwareId: input.templateLabwareId, kind: 'plate-snapshot', snapshotId: input.snapshotId },
      input.templateLabwareId,
    );
    const existingEvents = Array.isArray(methodPayload['events']) ? methodPayload['events'] : [];
    const filteredEvents = existingEvents.filter((event) => {
      const obj = toObject(event);
      const details = toObject(obj?.['details']);
      const metadata = toObject(details?.['metadata']);
      return !(
        toString(metadata?.['kind']) === 'seed_from_snapshot'
        && toString(details?.['labwareId']) === input.templateLabwareId
      );
    });
    methodPayload['events'] = [...seeded.events, ...filteredEvents];
    methodPayload['methodContext'] = {
      ...methodContext,
      templateBindings: nextBindings,
    };
    const now = new Date().toISOString();
    methodPayload['updatedAt'] = now;
    await recordStore.update({
      envelope: {
        ...methodRecord,
        payload: methodPayload,
        meta: {
          ...methodRecord.meta,
          updatedAt: now,
        },
      },
      message: `Resolve protocol input ${input.templateLabwareId} to snapshot ${input.snapshotId}`,
    });
  }

  async function resolveDownstreamRunsFromOutput(input: {
    upstreamRunId: string;
    upstreamOutputId: string;
    snapshotId: string;
  }): Promise<void> {
    const runs = await recordStore.list({
      schemaId: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
      limit: 10000,
    });
    for (const runRecord of runs) {
      const payload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const resolutions = parseTemplateInputResolutions(payload['templateInputResolutions']);
      let changed = false;
      const nextResolutions = resolutions.map((resolution) => {
        if (resolution.kind !== 'upstream-run') return resolution;
        if (resolution.upstreamRunId !== input.upstreamRunId) return resolution;
        if ((resolution.upstreamOutputId || '') !== input.upstreamOutputId) return resolution;
        changed = true;
        return {
          ...resolution,
          status: 'resolved' as const,
          producedSnapshotId: input.snapshotId,
        };
      });
      if (!changed) continue;
      const now = new Date().toISOString();
      const nextPayload = {
        ...payload,
        templateInputResolutions: nextResolutions,
        updatedAt: now,
      };
      const updated = await recordStore.update({
        envelope: {
          ...runRecord,
          payload: nextPayload,
          meta: {
            ...runRecord.meta,
            updatedAt: now,
          },
        },
        message: `Resolve downstream input from upstream run ${input.upstreamRunId} output ${input.upstreamOutputId}`,
      });
      if (updated.success) {
        await updateRunIndex(runRecord.recordId, nextPayload);
        for (const resolution of nextResolutions) {
          if (
            resolution.kind === 'upstream-run'
            && resolution.upstreamRunId === input.upstreamRunId
            && (resolution.upstreamOutputId || '') === input.upstreamOutputId
            && resolution.producedSnapshotId === input.snapshotId
          ) {
            await applySnapshotResolutionToMethod({
              runId: runRecord.recordId,
              templateLabwareId: resolution.templateLabwareId,
              snapshotId: input.snapshotId,
              ...(resolution.upstreamTemplateId ? { upstreamTemplateId: resolution.upstreamTemplateId } : {}),
              ...(resolution.upstreamOutputId ? { upstreamOutputId: resolution.upstreamOutputId } : {}),
            });
          }
        }
      }
    }
  }

  async function createRunFromTemplateInternal(input: {
    experimentId: string;
    studyId?: string;
    title?: string;
    shortSlug?: string;
    templateId: string;
    vocabId: 'liquid-handling/v1' | 'animal-handling/v1';
    platform: string;
    deckVariant: string;
    inputResolutions?: TemplateInputResolution[];
  }): Promise<
    | { success: true; runId: string; methodEventGraphId: string; templateInputResolutions: TemplateInputResolution[]; runOutputs: RunOutputState[] }
    | { success: false; status: number; error: string; message: string }
  > {
    const runId = generateId('RUN');
    const now = new Date().toISOString();
    let studyId = input.studyId;
    if (!studyId) {
      const experimentEntry = await indexManager.getByRecordId(input.experimentId);
      studyId = experimentEntry?.links?.studyId;
    }
    const runPayload: Record<string, unknown> = {
      kind: 'run',
      recordId: runId,
      title: input.title || `${input.templateId} Run`,
      shortSlug: input.shortSlug || (input.title || input.templateId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30),
      experimentId: input.experimentId,
      ...(studyId ? { studyId } : {}),
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    };
    const envelope = createEnvelope(
      runPayload,
      'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
      { createdAt: now, updatedAt: now }
    );
    if (!envelope) {
      return { success: false, status: 500, error: 'CREATE_FAILED', message: 'Failed to create run envelope' };
    }
    const created = await recordStore.create({
      envelope,
      message: `Create run ${runId} from template ${input.templateId}`,
    });
    if (!created.success) {
      return { success: false, status: 500, error: 'CREATE_FAILED', message: created.error || 'Failed to create run' };
    }
    const attached = await attachTemplateInternal({
      runId,
      replace: false,
      vocabId: input.vocabId,
      platform: input.platform,
      deckVariant: input.deckVariant,
      ...(input.templateId ? { templateId: input.templateId } : {}),
      ...(input.inputResolutions ? { inputResolutions: input.inputResolutions } : {}),
    });
    if (!attached.success) {
      return { success: false, status: attached.status, error: attached.error, message: attached.message };
    }
    return {
      success: true,
      runId,
      methodEventGraphId: attached.methodEventGraphId,
      templateInputResolutions: attached.templateInputResolutions,
      runOutputs: attached.runOutputs,
    };
  }

  return {
    /**
     * GET /runs/:id/method
     * Returns active method attachment summary for a run.
     */
    async getRunMethod(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<RunMethodSummaryResponse | { error: string; message: string }> {
      const runRecord = await recordStore.get(request.params.id);
      if (!runRecord) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Run not found: ${request.params.id}`,
        };
      }
      const payload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const methodEventGraphId = typeof payload['methodEventGraphId'] === 'string' ? payload['methodEventGraphId'] : undefined;
      const methodPlatformRaw = payload['methodPlatform'];
      const methodPlatform = typeof methodPlatformRaw === 'string' && platformRegistry.hasPlatform(methodPlatformRaw)
        ? methodPlatformRaw
        : undefined;
      const methodTemplate = toObject(payload['methodTemplateRef']);
      const methodTemplateId = typeof methodTemplate?.['id'] === 'string' ? methodTemplate.id : undefined;
      const methodVocabRaw = payload['methodVocabId'];
      const methodVocabId = methodVocabRaw === 'liquid-handling/v1' || methodVocabRaw === 'animal-handling/v1'
        ? methodVocabRaw
        : undefined;
      const templateInputResolutions = parseTemplateInputResolutions(payload['templateInputResolutions']);
      const runOutputs = parseRunOutputs(payload['runOutputs']);
      return {
        runId: request.params.id,
        hasMethod: Boolean(methodEventGraphId),
        ...(methodEventGraphId ? { methodEventGraphId } : {}),
        ...(methodPlatform ? { methodPlatform } : {}),
        ...(methodVocabId ? { methodVocabId } : {}),
        ...(methodTemplateId ? { methodTemplateId } : {}),
        templateInputResolutions,
        runOutputs,
      };
    },

    /**
     * POST /runs/:id/method/attach-template
     * Materialize template into run-attached method event graph.
     */
    async attachTemplateToRunMethod(
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          templateId?: string;
          replace?: boolean;
          vocabId?: 'liquid-handling/v1' | 'animal-handling/v1';
          platform?: string;
          deckVariant?: string;
          bindings?: TemplateLabwareBinding[];
          inputResolutions?: TemplateInputResolution[];
        };
      }>,
      reply: FastifyReply
    ): Promise<
      | {
        success: boolean;
        runId: string;
        methodEventGraphId: string;
        replaced: boolean;
      }
      | { error: string; message: string; existingMethodEventGraphId?: string }
    > {
      const runId = request.params.id;
      const templateId = request.body?.templateId;
      const replace = request.body?.replace === true;
      const vocabId = request.body?.vocabId ?? 'liquid-handling/v1';
      const platform = request.body?.platform ?? 'manual';
      if (vocabId !== 'liquid-handling/v1' && vocabId !== 'animal-handling/v1') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'vocabId must be one of: liquid-handling/v1, animal-handling/v1' };
      }

      const platformManifest = platformRegistry.getPlatform(platform);
      if (!platformManifest) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `Unknown platform "${platform}"` };
      }
      if (!platformRegistry.isPlatformAllowedForVocab(platform, vocabId)) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `platform "${platform}" is not allowed for vocabulary "${vocabId}"` };
      }
      const deckVariant = request.body?.deckVariant ?? platformManifest.defaultVariant;
      if (!platformRegistry.getVariant(platform, deckVariant)) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `deckVariant "${deckVariant}" is not valid for platform "${platform}"` };
      }

      const result = await attachTemplateInternal({
        runId,
        replace,
        vocabId,
        platform,
        deckVariant,
        ...(templateId ? { templateId } : {}),
        ...(Array.isArray(request.body?.bindings) ? { templateBindings: request.body.bindings } : {}),
        ...(Array.isArray(request.body?.inputResolutions) ? { inputResolutions: request.body.inputResolutions } : {}),
      });
      if (!result.success) {
        reply.status(result.status);
        return {
          error: result.error,
          message: result.message,
          ...(result.existingMethodEventGraphId ? { existingMethodEventGraphId: result.existingMethodEventGraphId } : {}),
        };
      }
      return {
        success: true,
        runId,
        methodEventGraphId: result.methodEventGraphId,
        replaced: result.replaced,
      };
    },

    async createRunFromTemplate(
      request: FastifyRequest<{
        Body: {
          experimentId?: string;
          studyId?: string;
          title?: string;
          shortSlug?: string;
          templateId?: string;
          vocabId?: 'liquid-handling/v1' | 'animal-handling/v1';
          platform?: string;
          deckVariant?: string;
          inputResolutions?: TemplateInputResolution[];
        };
      }>,
      reply: FastifyReply
    ): Promise<CreateRunFromTemplateResponse | { error: string; message: string }> {
      const experimentId = toString(request.body?.experimentId);
      const templateId = toString(request.body?.templateId);
      const title = toString(request.body?.title) || `${templateId || 'Template'} Run`;
      if (!experimentId || !templateId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'experimentId and templateId are required.' };
      }
      const vocabId = request.body?.vocabId ?? 'liquid-handling/v1';
      const platform = request.body?.platform ?? 'manual';
      if (vocabId !== 'liquid-handling/v1' && vocabId !== 'animal-handling/v1') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'vocabId must be one of: liquid-handling/v1, animal-handling/v1' };
      }
      const platformManifest = platformRegistry.getPlatform(platform);
      if (!platformManifest) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `Unknown platform "${platform}"` };
      }
      const deckVariant = request.body?.deckVariant ?? platformManifest.defaultVariant;
      if (!platformRegistry.getVariant(platform, deckVariant)) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `deckVariant "${deckVariant}" is not valid for platform "${platform}"` };
      }
      const createRunArgs: {
        experimentId: string;
        studyId?: string;
        title?: string;
        shortSlug?: string;
        templateId: string;
        vocabId: 'liquid-handling/v1' | 'animal-handling/v1';
        platform: string;
        deckVariant: string;
        inputResolutions?: TemplateInputResolution[];
      } = {
        experimentId,
        title,
        shortSlug: toString(request.body?.shortSlug) || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30),
        templateId,
        vocabId,
        platform,
        deckVariant,
        inputResolutions: Array.isArray(request.body?.inputResolutions) ? request.body.inputResolutions : [],
      };
      const requestedStudyId = toString(request.body?.studyId);
      if (requestedStudyId) createRunArgs.studyId = requestedStudyId;
      const created = await createRunFromTemplateInternal(createRunArgs);
      if (!created.success) {
        reply.status(created.status);
        return { error: created.error, message: created.message };
      }
      return {
        success: true,
        runId: created.runId,
        methodEventGraphId: created.methodEventGraphId,
        templateInputResolutions: created.templateInputResolutions,
        runOutputs: created.runOutputs,
      };
    },

    async createUpstreamRunForInput(
      request: FastifyRequest<{
        Params: { id: string; templateLabwareId: string };
        Body: { title?: string };
      }>,
      reply: FastifyReply
    ): Promise<CreateRunFromTemplateResponse | { error: string; message: string }> {
      const runRecord = await recordStore.get(request.params.id);
      if (!runRecord) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${request.params.id}` };
      }
      const runPayload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const resolutions = parseTemplateInputResolutions(runPayload['templateInputResolutions']);
      const resolution = resolutions.find(
        (entry): entry is Extract<TemplateInputResolution, { kind: 'upstream-run' }> =>
          entry.templateLabwareId === request.params.templateLabwareId && entry.kind === 'upstream-run'
      );
      if (!resolution) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Protocol input not found: ${request.params.templateLabwareId}` };
      }
      const experimentId = toString(runPayload['experimentId']);
      if (!experimentId) {
        reply.status(422);
        return { error: 'INVALID_RUN', message: `Run ${request.params.id} is missing experimentId.` };
      }
      const upstreamRunArgs: {
        experimentId: string;
        studyId?: string;
        title?: string;
        templateId: string;
        vocabId: 'liquid-handling/v1' | 'animal-handling/v1';
        platform: string;
        deckVariant: string;
        inputResolutions?: TemplateInputResolution[];
      } = {
        experimentId,
        title: toString(request.body?.title) || `${resolution.slotLabel} Source Run`,
        templateId: resolution.upstreamTemplateId,
        vocabId: 'liquid-handling/v1',
        platform: toString(runPayload['methodPlatform']) || 'manual',
        deckVariant: platformRegistry.getPlatform(toString(runPayload['methodPlatform']) || 'manual')?.defaultVariant || 'manual',
        inputResolutions: [],
      };
      const currentStudyId = toString(runPayload['studyId']);
      if (currentStudyId) upstreamRunArgs.studyId = currentStudyId;
      const created = await createRunFromTemplateInternal(upstreamRunArgs);
      if (!created.success) {
        reply.status(created.status);
        return { error: created.error, message: created.message };
      }
      const nextResolutions = resolutions.map((entry) => (
        entry.templateLabwareId === request.params.templateLabwareId && entry.kind === 'upstream-run'
          ? { ...entry, upstreamRunId: created.runId, status: 'run_created' as const }
          : entry
      ));
      const now = new Date().toISOString();
      const nextPayload = {
        ...runPayload,
        templateInputResolutions: nextResolutions,
        updatedAt: now,
      };
      const updated = await recordStore.update({
        envelope: {
          ...runRecord,
          payload: nextPayload,
          meta: {
            ...runRecord.meta,
            updatedAt: now,
          },
        },
        message: `Create upstream run for input ${request.params.templateLabwareId} on run ${request.params.id}`,
      });
      if (!updated.success) {
        reply.status(500);
        return { error: 'UPDATE_FAILED', message: updated.error || 'Failed to update downstream run' };
      }
      await updateRunIndex(request.params.id, nextPayload);
      return created;
    },

    async useExistingPlateForInput(
      request: FastifyRequest<{
        Params: { id: string; templateLabwareId: string };
        Body: { snapshotId?: string };
      }>,
      reply: FastifyReply
    ): Promise<{ success: boolean; templateInputResolutions: TemplateInputResolution[] } | { error: string; message: string }> {
      const snapshotId = toString(request.body?.snapshotId);
      if (!snapshotId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'snapshotId is required.' };
      }
      const runRecord = await recordStore.get(request.params.id);
      if (!runRecord) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${request.params.id}` };
      }
      const runPayload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const resolutions = parseTemplateInputResolutions(runPayload['templateInputResolutions']);
      const nextResolutions = resolutions.map((entry) => (
        entry.templateLabwareId === request.params.templateLabwareId
          ? {
              templateLabwareId: entry.templateLabwareId,
              slotLabel: entry.slotLabel,
              kind: 'existing-snapshot' as const,
              status: 'resolved' as const,
              snapshotId,
            }
          : entry
      ));
      const now = new Date().toISOString();
      const nextPayload = {
        ...runPayload,
        templateInputResolutions: nextResolutions,
        updatedAt: now,
      };
      const updated = await recordStore.update({
        envelope: {
          ...runRecord,
          payload: nextPayload,
          meta: {
            ...runRecord.meta,
            updatedAt: now,
          },
        },
        message: `Resolve input ${request.params.templateLabwareId} to existing plate ${snapshotId}`,
      });
      if (!updated.success) {
        reply.status(500);
        return { error: 'UPDATE_FAILED', message: updated.error || 'Failed to update run input resolution' };
      }
      await updateRunIndex(request.params.id, nextPayload);
      await applySnapshotResolutionToMethod({
        runId: request.params.id,
        templateLabwareId: request.params.templateLabwareId,
        snapshotId,
      });
      return {
        success: true,
        templateInputResolutions: nextResolutions,
      };
    },

    async promoteRunOutput(
      request: FastifyRequest<{
        Params: { id: string; outputId: string };
        Body: PromoteRunOutputBody;
      }>,
      reply: FastifyReply
    ): Promise<{ success: boolean; snapshotId: string; runOutputs: RunOutputState[] } | { error: string; message: string }> {
      const runRecord = await recordStore.get(request.params.id);
      if (!runRecord) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${request.params.id}` };
      }
      const runPayload = (runRecord.payload ?? {}) as Record<string, unknown>;
      const runOutputs = parseRunOutputs(runPayload['runOutputs']);
      const output = runOutputs.find((entry) => entry.outputId === request.params.outputId);
      if (!output) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run output not found: ${request.params.outputId}` };
      }
      const providedSnapshotId = toString(request.body?.snapshotId);
      let outputRecordId = providedSnapshotId || '';
      if (!outputRecordId) {
        const sourceContextIds = Array.isArray(request.body?.sourceContextIds) ? request.body.sourceContextIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : [];
        const labwareRef = request.body?.labwareRef;
        const wellMappings = Array.isArray(request.body?.wellMappings) ? request.body.wellMappings : [];
        if (sourceContextIds.length === 0 || !labwareRef || wellMappings.length === 0) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'snapshotId or full promotion payload is required.' };
        }
        const promotionRecordId = generateId('CPR');
        outputRecordId = generateId('PSN');
        const outputPayload = {
          kind: 'plate-snapshot',
          recordId: outputRecordId,
          title: toString(request.body?.title) || output.label,
          labware_ref: labwareRef,
          source_event_graph_ref: request.body?.sourceEventGraphRef,
          wells: wellMappings.map((w) => ({
            well: w.well,
            context_ref: {
              kind: 'record',
              id: w.contextId,
              type: 'context',
              label: w.contextId,
            },
            ...(w.role ? { role: w.role } : {}),
          })),
          ...(Array.isArray(request.body?.tags) && request.body.tags.length > 0 ? { tags: request.body.tags } : {}),
        };
        const outputCreate = await recordStore.create({
          envelope: {
            recordId: outputRecordId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/plate-snapshot.schema.yaml',
            payload: outputPayload,
          },
          message: `Promote run output ${request.params.outputId} on run ${request.params.id}`,
        });
        if (!outputCreate.success) {
          reply.status(400);
          return { error: 'CREATE_FAILED', message: outputCreate.error || 'Failed to create plate snapshot' };
        }
        const promotionCreate = await recordStore.create({
          envelope: {
            recordId: promotionRecordId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/context-promotion.schema.yaml',
            payload: {
              kind: 'context-promotion',
              recordId: promotionRecordId,
              title: `Promotion of run output ${request.params.outputId}`,
              source_context_refs: sourceContextIds.map((id) => ({ kind: 'record', id, type: 'context', label: id })),
              output_kind: 'plate-snapshot',
              output_ref: { kind: 'record', id: outputRecordId, type: 'plate-snapshot', label: outputRecordId },
              ...(request.body?.sourceEventGraphRef ? { source_event_graph_ref: request.body.sourceEventGraphRef } : {}),
              method: 'run-output-promotion',
              tags: ['run_output', `run:${request.params.id}`, `output:${request.params.outputId}`],
            },
          },
          message: `Record run output promotion provenance ${promotionRecordId}`,
        });
        if (!promotionCreate.success) {
          reply.status(400);
          return { error: 'CREATE_FAILED', message: promotionCreate.error || 'Failed to create promotion record' };
        }
      }
      const nextRunOutputs = runOutputs.map((entry) => (
        entry.outputId === request.params.outputId
          ? { ...entry, status: 'produced' as const, snapshotId: outputRecordId }
          : entry
      ));
      const now = new Date().toISOString();
      const nextPayload = {
        ...runPayload,
        runOutputs: nextRunOutputs,
        updatedAt: now,
      };
      const updated = await recordStore.update({
        envelope: {
          ...runRecord,
          payload: nextPayload,
          meta: {
            ...runRecord.meta,
            updatedAt: now,
          },
        },
        message: `Mark run output ${request.params.outputId} produced on run ${request.params.id}`,
      });
      if (!updated.success) {
        reply.status(500);
        return { error: 'UPDATE_FAILED', message: updated.error || 'Failed to update run outputs' };
      }
      await updateRunIndex(request.params.id, nextPayload);
      await resolveDownstreamRunsFromOutput({
        upstreamRunId: request.params.id,
        upstreamOutputId: request.params.outputId,
        snapshotId: outputRecordId,
      });
      return {
        success: true,
        snapshotId: outputRecordId,
        runOutputs: nextRunOutputs,
      };
    },

    /**
     * GET /tree/studies
     * Get the study hierarchy tree.
     */
    async getStudies(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<StudyTreeResponse> {
      const studies = await indexManager.getStudyTree();
      return { studies };
    },

    async searchTemplates(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          platform?: string;
          deckVariant?: string;
          experimentType?: string;
          semantic?: string;
          material?: string;
          limit?: string;
        };
      }>,
      _reply: FastifyReply
    ): Promise<TemplateSearchResponse> {
      const items = await searchTemplatesService(recordStore, {
        ...(typeof request.query.q === 'string' ? { q: request.query.q } : {}),
        ...(typeof request.query.platform === 'string' ? { platform: request.query.platform } : {}),
        ...(typeof request.query.deckVariant === 'string' ? { deckVariant: request.query.deckVariant } : {}),
        ...(typeof request.query.experimentType === 'string' ? { experimentType: request.query.experimentType } : {}),
        ...(typeof request.query.semantic === 'string' ? { semantic: request.query.semantic } : {}),
        ...(typeof request.query.material === 'string' ? { material: request.query.material } : {}),
        ...(typeof request.query.limit === 'string' ? { limit: Number(request.query.limit) } : {}),
      });
      return {
        items,
        total: items.length,
      };
    },

    async materializeTemplate(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { bindings?: TemplateLabwareBinding[] };
      }>,
      reply: FastifyReply
    ): Promise<MaterializeTemplateResponse | { error: string; message: string }> {
      try {
        const result = await materializeTemplateService(
          recordStore,
          request.params.id,
          Array.isArray(request.body?.bindings) ? request.body.bindings : []
        );
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 422);
        return {
          error: message.includes('not found') ? 'NOT_FOUND' : 'BAD_TEMPLATE',
          message,
        };
      }
    },
    
    /**
     * GET /tree/records?runId=xxx
     * Get records linked to a specific run.
     */
    async getRecordsForRun(
      request: FastifyRequest<{ Querystring: { runId?: string } }>,
      reply: FastifyReply
    ): Promise<RecordsListResponse | { error: string; message: string }> {
      const { runId } = request.query;
      
      if (!runId) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'runId query parameter is required',
        };
      }
      
      const records = await indexManager.getByRunId(runId);
      return {
        records,
        total: records.length,
      };
    },
    
    /**
     * GET /tree/inbox
     * Get records in the inbox (status = inbox).
     */
    async getInbox(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<RecordsListResponse> {
      const records = await indexManager.getInbox();
      return {
        records,
        total: records.length,
      };
    },
    
    /**
     * POST /records/:id/file
     * File a record from inbox into a run.
     * Updates links and status, may move file.
     */
    async fileRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { runId: string };
      }>,
      reply: FastifyReply
    ): Promise<FileRecordResponse> {
      const { id: recordId } = request.params;
      const { runId } = request.body;
      
      if (!runId) {
        reply.status(400);
        return {
          success: false,
          error: 'runId is required in request body',
        };
      }
      
      try {
        // Get the record
        const record = await recordStore.get(recordId);
        if (!record) {
          reply.status(404);
          return {
            success: false,
            error: `Record not found: ${recordId}`,
          };
        }
        
        // Get the run to find studyId and experimentId
        const runEntry = await indexManager.getByRecordId(runId);
        if (!runEntry) {
          reply.status(404);
          return {
            success: false,
            error: `Run not found: ${runId}`,
          };
        }
        
        // Update the record with links
        const payload = record.payload as Record<string, unknown>;
        const updatedPayload = {
          ...payload,
          links: {
            studyId: runEntry.links?.studyId,
            experimentId: runEntry.links?.experimentId,
            runId: runId,
          },
          status: 'filed',
        };
        
        // Update in store
        const result = await recordStore.update({
          envelope: {
            ...record,
            payload: updatedPayload,
          },
          message: `File ${recordId} into run ${runId}`,
        });
        
        if (!result.success) {
          reply.status(500);
          return {
            success: false,
            error: result.error || 'Failed to update record',
          };
        }
        
        // Update the index entry
        const currentEntry = await indexManager.getByRecordId(recordId);
        if (currentEntry) {
          await indexManager.updateEntry({
            ...currentEntry,
            status: 'filed',
            links: {
              ...(runEntry.links?.studyId ? { studyId: runEntry.links.studyId } : {}),
              ...(runEntry.links?.experimentId ? { experimentId: runEntry.links.experimentId } : {}),
              runId: runId,
            },
          });
        }
        
        const newPath = result.envelope?.meta?.path;
        return {
          success: true,
          ...(newPath ? { newPath } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply.status(500);
        return {
          success: false,
          error: `Failed to file record: ${message}`,
        };
      }
    },
    
    /**
     * POST /index/rebuild
     * Manually rebuild the record index.
     */
    async rebuildIndex(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<RebuildIndexResponse> {
      const result = await indexManager.rebuild();
      return {
        success: true,
        count: result.entries.length,
        generatedAt: result.generatedAt,
      };
    },
    
    /**
     * GET /tree/search?q=xxx&limit=50
     * Full-text search records by query string.
     * Searches across recordId, title, kind, and path.
     * Results are sorted by relevance.
     */
    async searchRecords(
      request: FastifyRequest<{ Querystring: { q?: string; kind?: string; limit?: string } }>,
      _reply: FastifyReply
    ): Promise<RecordsListResponse> {
      const { q, kind, limit } = request.query;
      
      // If no query, return empty (or optionally filter by kind)
      if (!q || q.trim().length === 0) {
        if (kind) {
          const records = await indexManager.query({ kind });
          return { records, total: records.length };
        }
        return { records: [], total: 0 };
      }
      
      const limitNum = limit ? parseInt(limit, 10) : 50;
      
      // Use full-text search
      let records = await indexManager.search(q, limitNum);
      
      // Filter by kind if specified
      if (kind) {
        records = records.filter(r => r.kind === kind);
      }
      
      return {
        records,
        total: records.length,
      };
    },
  };
}

export type TreeHandlers = ReturnType<typeof createTreeHandlers>;
