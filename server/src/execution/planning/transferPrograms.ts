const OPERATION_TEMPLATE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/operation-template.schema.yaml';

type RefShape = {
  kind?: string;
  id: string;
  type?: string;
  label?: string;
};

type QuantityShape = {
  value: number;
  unit: string;
};

type DeadVolumeShape = {
  value: number;
  unit: 'uL' | 'mL' | '%';
};

type MixHintShape = {
  enabled?: boolean;
  cycles?: number;
  volume?: QuantityShape;
};

export type TransferExecutionHints = {
  tip_policy?: 'inherit' | 'new_tip_each_transfer' | 'new_tip_each_source' | 'reuse_within_batch';
  aspirate_height_mm?: number;
  dispense_height_mm?: number;
  air_gap?: {
    value: number;
    unit: 'uL' | 'mL';
  };
  pre_mix?: MixHintShape;
  post_mix?: MixHintShape;
  touch_tip_after_aspirate?: boolean;
  touch_tip_after_dispense?: boolean;
  blowout?: boolean;
};

export type OperationTemplateRecord = {
  kind: 'operation-template';
  id: string;
  name: string;
  version?: number;
  category: string;
  scope: 'well' | 'plate' | 'program';
  description?: string;
  visibility?: 'personal' | 'team';
  status?: 'active' | 'deprecated';
  base_event_type: 'transfer' | 'multi_dispense' | 'add_material' | 'wash' | 'incubate' | 'read';
  semantic_defaults?: {
    transfer_mode?: 'transfer' | 'multi_dispense';
    volume?: QuantityShape;
    dead_volume?: DeadVolumeShape;
    discard_to_waste?: boolean;
  };
  execution_defaults?: TransferExecutionHints;
  tags?: string[];
};

export type TransferVignetteProgram = {
  kind: 'transfer_vignette';
  template_ref?: RefShape;
  params?: {
    sourceLabwareId?: string;
    targetLabwareId?: string;
    sourceWells?: string[];
    targetWells?: string[];
    volume?: QuantityShape;
    transferMode?: 'transfer' | 'multi_dispense';
    deadVolume?: DeadVolumeShape;
    discardToWaste?: boolean;
    inputs?: unknown[];
  };
  execution_hints?: TransferExecutionHints;
};

export type EventGraphEvent = {
  eventId?: string;
  event_type?: string;
  t_offset?: string;
  at?: string;
  notes?: string;
  details?: Record<string, unknown>;
};

export type EventGraphPayload = {
  id?: string;
  events?: EventGraphEvent[];
  labwares?: Array<Record<string, unknown>>;
};

export type ResolvedTransferProgram = {
  eventId: string;
  eventType: 'transfer' | 'multi_dispense';
  sourceLabwareId?: string;
  targetLabwareId?: string;
  sourceWells: string[];
  targetWells: string[];
  volume?: QuantityShape;
  deadVolume?: DeadVolumeShape;
  discardToWaste?: boolean;
  inputs?: unknown[];
  executionHints?: TransferExecutionHints;
  templateRef?: RefShape;
  templateStatus?: 'active' | 'deprecated';
};

export type CompatibilityReportEntry = {
  eventId: string;
  sourceStepRef: string;
  eventType: string;
  templateId?: string;
  templateName?: string;
  honoredHints: string[];
  droppedHints: string[];
  compatibilityNotes: string[];
};

export type TransferOperation = {
  sourceStepRef: string;
  eventType: 'transfer' | 'multi_dispense' | 'add_material';
  volume_uL: number;
  sourceLabwareId?: string;
  targetLabwareId?: string;
  sourceWell?: string;
  targetWell?: string;
  executionHints?: TransferExecutionHints;
  templateRef?: RefShape;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function quantityValue(value: unknown): QuantityShape | undefined {
  if (!isRecord(value)) return undefined;
  const amount = numberValue(value.value);
  const unit = stringValue(value.unit);
  if (amount === undefined || !unit) return undefined;
  return { value: amount, unit };
}

function deadVolumeValue(value: unknown): DeadVolumeShape | undefined {
  if (!isRecord(value)) return undefined;
  const amount = numberValue(value.value);
  const unit = value.unit;
  if (amount === undefined || (unit !== 'uL' && unit !== 'mL' && unit !== '%')) return undefined;
  return { value: amount, unit };
}

function mixHintValue(value: unknown): MixHintShape | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled;
  if (typeof value.cycles === 'number') result.cycles = value.cycles;
  const volume = quantityValue(value.volume);
  if (volume) result.volume = volume;
  return Object.keys(result).length > 0 ? result as MixHintShape : undefined;
}

function executionHintsValue(value: unknown): TransferExecutionHints | undefined {
  if (!isRecord(value)) return undefined;
  const aspirateHeight = numberValue(value.aspirate_height_mm);
  const dispenseHeight = numberValue(value.dispense_height_mm);
  const preMix = mixHintValue(value.pre_mix);
  const postMix = mixHintValue(value.post_mix);
  const result: TransferExecutionHints = {
    ...(value.tip_policy === 'inherit'
      || value.tip_policy === 'new_tip_each_transfer'
      || value.tip_policy === 'new_tip_each_source'
      || value.tip_policy === 'reuse_within_batch'
      ? { tip_policy: value.tip_policy }
      : {}),
    ...(aspirateHeight !== undefined ? { aspirate_height_mm: aspirateHeight } : {}),
    ...(dispenseHeight !== undefined ? { dispense_height_mm: dispenseHeight } : {}),
    ...(isRecord(value.air_gap)
      && numberValue(value.air_gap.value) !== undefined
      && (value.air_gap.unit === 'uL' || value.air_gap.unit === 'mL')
      ? { air_gap: { value: numberValue(value.air_gap.value)!, unit: value.air_gap.unit } }
      : {}),
    ...(preMix ? { pre_mix: preMix } : {}),
    ...(postMix ? { post_mix: postMix } : {}),
    ...(typeof value.touch_tip_after_aspirate === 'boolean' ? { touch_tip_after_aspirate: value.touch_tip_after_aspirate } : {}),
    ...(typeof value.touch_tip_after_dispense === 'boolean' ? { touch_tip_after_dispense: value.touch_tip_after_dispense } : {}),
    ...(typeof value.blowout === 'boolean' ? { blowout: value.blowout } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function refValue(value: unknown): RefShape | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  const result: Record<string, unknown> = { id };
  const kind = stringValue(value.kind);
  const type = stringValue(value.type);
  const label = stringValue(value.label);
  if (kind) result.kind = kind;
  if (type) result.type = type;
  if (label) result.label = label;
  return result as RefShape;
}

export function parseOperationTemplatePayload(payload: unknown, fallbackId?: string): OperationTemplateRecord | null {
  if (!isRecord(payload) || payload.kind !== 'operation-template') return null;
  const id = stringValue(payload.id) ?? fallbackId;
  const name = stringValue(payload.name) ?? id;
  const scope = payload.scope === 'well' || payload.scope === 'plate' || payload.scope === 'program' ? payload.scope : undefined;
  const baseEventType = payload.base_event_type === 'transfer'
    || payload.base_event_type === 'multi_dispense'
    || payload.base_event_type === 'add_material'
    || payload.base_event_type === 'wash'
    || payload.base_event_type === 'incubate'
    || payload.base_event_type === 'read'
    ? payload.base_event_type
    : undefined;
  if (!id || !name || !scope || !baseEventType) return null;
  const description = stringValue(payload.description);
  const version = numberValue(payload.version);
  const semanticTransferMode = isRecord(payload.semantic_defaults)
    && (payload.semantic_defaults.transfer_mode === 'transfer' || payload.semantic_defaults.transfer_mode === 'multi_dispense')
    ? payload.semantic_defaults.transfer_mode
    : undefined;
  const semanticVolume = isRecord(payload.semantic_defaults) ? quantityValue(payload.semantic_defaults.volume) : undefined;
  const semanticDeadVolume = isRecord(payload.semantic_defaults) ? deadVolumeValue(payload.semantic_defaults.dead_volume) : undefined;
  const semanticDefaults: OperationTemplateRecord['semantic_defaults'] | null = isRecord(payload.semantic_defaults)
    ? {
        ...(semanticTransferMode ? { transfer_mode: semanticTransferMode } : {}),
        ...(semanticVolume ? { volume: semanticVolume } : {}),
        ...(semanticDeadVolume ? { dead_volume: semanticDeadVolume } : {}),
        ...(typeof payload.semantic_defaults.discard_to_waste === 'boolean'
          ? { discard_to_waste: payload.semantic_defaults.discard_to_waste }
          : {}),
      }
    : null;
  const executionDefaults = executionHintsValue(payload.execution_defaults);
  return {
    kind: 'operation-template',
    id,
    name,
    ...(version !== undefined ? { version } : {}),
    category: stringValue(payload.category) ?? 'custom',
    scope,
    ...(description ? { description } : {}),
    ...(payload.visibility === 'personal' || payload.visibility === 'team' ? { visibility: payload.visibility } : {}),
    ...(payload.status === 'active' || payload.status === 'deprecated' ? { status: payload.status } : {}),
    base_event_type: baseEventType,
    ...(semanticDefaults && Object.keys(semanticDefaults).length > 0 ? { semantic_defaults: semanticDefaults } : {}),
    ...(executionDefaults ? { execution_defaults: executionDefaults } : {}),
    ...(Array.isArray(payload.tags)
      ? { tags: payload.tags.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) }
      : {}),
  };
}

export function isTransferVignetteProgram(value: unknown): value is TransferVignetteProgram {
  return isRecord(value) && value.kind === 'transfer_vignette';
}

export function resolveTransferVignetteProgram(
  eventId: string,
  program: TransferVignetteProgram,
  template?: OperationTemplateRecord | null,
): ResolvedTransferProgram {
  const params = isRecord(program.params) ? program.params : {};
  const transferMode = params.transferMode === 'multi_dispense'
    ? 'multi_dispense'
    : params.transferMode === 'transfer'
      ? 'transfer'
      : template?.semantic_defaults?.transfer_mode === 'multi_dispense'
        ? 'multi_dispense'
        : template?.base_event_type === 'multi_dispense'
          ? 'multi_dispense'
          : 'transfer';
  const resolvedVolume = quantityValue(params.volume) ?? template?.semantic_defaults?.volume;
  const resolvedDeadVolume = deadVolumeValue(params.deadVolume) ?? template?.semantic_defaults?.dead_volume;
  const resolvedHints = executionHintsValue(program.execution_hints) ?? template?.execution_defaults;
  const sourceLabwareId = stringValue(params.sourceLabwareId);
  const targetLabwareId = stringValue(params.targetLabwareId);
  const templateRef = program.template_ref
    ? program.template_ref
    : template
      ? { kind: 'record', id: template.id, type: 'operation-template', label: template.name }
      : undefined;
  return {
    eventId,
    eventType: transferMode,
    ...(sourceLabwareId ? { sourceLabwareId } : {}),
    ...(targetLabwareId ? { targetLabwareId } : {}),
    sourceWells: stringArray(params.sourceWells),
    targetWells: stringArray(params.targetWells),
    ...(resolvedVolume ? { volume: resolvedVolume } : {}),
    ...(resolvedDeadVolume ? { deadVolume: resolvedDeadVolume } : {}),
    ...(typeof params.discardToWaste === 'boolean'
      ? { discardToWaste: params.discardToWaste }
      : typeof template?.semantic_defaults?.discard_to_waste === 'boolean'
        ? { discardToWaste: template.semantic_defaults.discard_to_waste }
        : {}),
    ...(Array.isArray(params.inputs) ? { inputs: params.inputs } : {}),
    ...(resolvedHints ? { executionHints: resolvedHints } : {}),
    ...(templateRef ? { templateRef } : {}),
    ...(template?.status ? { templateStatus: template.status } : {}),
  };
}

export function materializeTransferVignetteEvent(
  event: EventGraphEvent,
  resolved: ResolvedTransferProgram,
): EventGraphEvent {
  const firstSourceWell = resolved.sourceWells[0];
  const firstTargetWell = resolved.targetWells[0];
  const details: Record<string, unknown> = {
    ...(resolved.sourceLabwareId ? { source_labwareId: resolved.sourceLabwareId } : {}),
    ...(resolved.targetLabwareId ? { dest_labwareId: resolved.targetLabwareId } : {}),
    source_wells: resolved.sourceWells,
    dest_wells: resolved.targetWells,
    ...(resolved.sourceLabwareId ? { source: { labwareInstanceId: resolved.sourceLabwareId, wells: resolved.sourceWells } } : {}),
    ...(resolved.targetLabwareId ? { target: { labwareInstanceId: resolved.targetLabwareId, wells: resolved.targetWells } } : {}),
    ...(firstSourceWell ? { sourceWell: firstSourceWell } : {}),
    ...(firstTargetWell ? { targetWell: firstTargetWell } : {}),
    ...(resolved.volume ? { volume: resolved.volume } : {}),
    ...(resolved.volume?.unit === 'uL' ? { volume_uL: resolved.volume.value } : {}),
    ...(resolved.deadVolume ? { dead_volume: resolved.deadVolume } : {}),
    ...(resolved.discardToWaste ? { discard_to_waste: true } : {}),
    ...(resolved.inputs?.length ? { inputs: resolved.inputs } : {}),
    ...(resolved.executionHints ? { execution_hints: resolved.executionHints } : {}),
    transfer_program: {
      kind: 'transfer_vignette',
      ...(resolved.templateRef ? { template_ref: resolved.templateRef } : {}),
      ...(resolved.templateStatus ? { template_status: resolved.templateStatus } : {}),
    },
  };
  return {
    ...event,
    event_type: resolved.eventType,
    details,
  };
}

export function extractTransferOperations(events: EventGraphEvent[]): TransferOperation[] {
  const operations: TransferOperation[] = [];
  for (const event of events) {
    const eventType = event.event_type;
    const eventId = stringValue(event.eventId) ?? 'event';
    const details = isRecord(event.details) ? event.details : {};
    if (eventType === 'add_material') {
      const wells = stringArray(details.wells);
      const volume = quantityValue(details.volume);
      const fallbackVolume = numberValue(details.volume_uL)
        ?? numberValue(details.volume_ul)
        ?? (volume?.unit === 'uL' ? volume.value : undefined);
      for (const well of wells) {
        const targetLabwareId = stringValue(details.labwareId) ?? stringValue(details.labwareInstanceId);
        operations.push({
          sourceStepRef: eventId,
          eventType: 'add_material',
          volume_uL: fallbackVolume ?? 0,
          ...(targetLabwareId ? { targetLabwareId } : {}),
          targetWell: well,
        });
      }
      continue;
    }
    if (eventType !== 'transfer' && eventType !== 'multi_dispense') continue;
    const source = isRecord(details.source) ? details.source : {};
    const target = isRecord(details.target) ? details.target : {};
    const mapping = Array.isArray(details.mapping)
      ? details.mapping.filter(isRecord).map((entry) => ({
          sourceWell: stringValue(entry.source_well),
          targetWell: stringValue(entry.target_well),
          volume_uL: numberValue(entry.volume_uL),
        })).filter((entry): entry is { sourceWell: string; targetWell: string; volume_uL: number | undefined } => Boolean(entry.sourceWell && entry.targetWell))
      : [];
    const sourceWells = stringArray(details.source_wells).length > 0 ? stringArray(details.source_wells) : stringArray(source.wells);
    const targetWells = stringArray(details.dest_wells).length > 0 ? stringArray(details.dest_wells) : stringArray(target.wells);
    const sourceLabwareId = stringValue(details.source_labwareId) ?? stringValue(source.labwareInstanceId);
    const targetLabwareId = stringValue(details.dest_labwareId) ?? stringValue(target.labwareInstanceId);
    const volume = numberValue(details.volume_uL)
      ?? numberValue(details.volume_ul)
      ?? (quantityValue(details.volume)?.unit === 'uL' ? quantityValue(details.volume)?.value : undefined)
      ?? 0;
    const executionHints = executionHintsValue(details.execution_hints);
    const templateRef = isRecord(details.transfer_program) ? refValue(details.transfer_program.template_ref) : undefined;
    if (mapping.length > 0) {
      for (const entry of mapping) {
        operations.push({
          sourceStepRef: eventId,
          eventType,
          volume_uL: entry.volume_uL ?? volume,
          ...(sourceLabwareId ? { sourceLabwareId } : {}),
          ...(targetLabwareId ? { targetLabwareId } : {}),
          sourceWell: entry.sourceWell,
          targetWell: entry.targetWell,
          ...(executionHints ? { executionHints } : {}),
          ...(templateRef ? { templateRef } : {}),
        });
      }
      continue;
    }
    const pairCount = eventType === 'multi_dispense'
      ? targetWells.length
      : sourceWells.length === targetWells.length
        ? targetWells.length
        : sourceWells.length === 1
          ? targetWells.length
          : Math.min(sourceWells.length, targetWells.length);
    for (let index = 0; index < pairCount; index += 1) {
      const sourceWell = sourceWells.length === 1 ? sourceWells[0] : sourceWells[index];
      const targetWell = targetWells[index];
      if (!sourceWell) continue;
      if (!targetWell && !Boolean(details.discard_to_waste)) continue;
      operations.push({
        sourceStepRef: eventId,
        eventType,
        volume_uL: volume,
        ...(sourceLabwareId ? { sourceLabwareId } : {}),
        ...(targetLabwareId ? { targetLabwareId } : {}),
        ...(sourceWell ? { sourceWell } : {}),
        ...(targetWell ? { targetWell } : {}),
        ...(executionHints ? { executionHints } : {}),
        ...(templateRef ? { templateRef } : {}),
      });
    }
  }
  return operations;
}

export function hintKeys(hints: TransferExecutionHints | undefined): string[] {
  if (!hints) return [];
  return [
    ...(hints.tip_policy ? ['tip_policy'] : []),
    ...(hints.aspirate_height_mm !== undefined ? ['aspirate_height_mm'] : []),
    ...(hints.dispense_height_mm !== undefined ? ['dispense_height_mm'] : []),
    ...(hints.air_gap ? ['air_gap'] : []),
    ...(hints.pre_mix?.enabled !== false && hints.pre_mix ? ['pre_mix'] : []),
    ...(hints.post_mix?.enabled !== false && hints.post_mix ? ['post_mix'] : []),
    ...(hints.touch_tip_after_aspirate ? ['touch_tip_after_aspirate'] : []),
    ...(hints.touch_tip_after_dispense ? ['touch_tip_after_dispense'] : []),
    ...(hints.blowout ? ['blowout'] : []),
  ];
}

export function buildCompatibilityEntry(input: {
  event: EventGraphEvent;
  honoredHints: string[];
  droppedHints: string[];
  compatibilityNotes?: string[];
}): CompatibilityReportEntry {
  const details = isRecord(input.event.details) ? input.event.details : {};
  const transferProgram = isRecord(details.transfer_program) ? details.transfer_program : {};
  const templateRef = refValue(transferProgram.template_ref);
  return {
    eventId: stringValue(input.event.eventId) ?? 'event',
    sourceStepRef: stringValue(input.event.eventId) ?? 'event',
    eventType: stringValue(input.event.event_type) ?? 'other',
    ...(templateRef?.id ? { templateId: templateRef.id } : {}),
    ...(templateRef?.label ? { templateName: templateRef.label } : {}),
    honoredHints: input.honoredHints,
    droppedHints: input.droppedHints,
    compatibilityNotes: input.compatibilityNotes ?? [],
  };
}

export async function resolveEventGraphOperationTemplates(
  eventGraph: EventGraphPayload,
  loadTemplate: (templateId: string) => Promise<OperationTemplateRecord | null>,
): Promise<{ eventGraph: EventGraphPayload; reports: CompatibilityReportEntry[] }> {
  const nextEvents: EventGraphEvent[] = [];
  const reports: CompatibilityReportEntry[] = [];
  for (const rawEvent of eventGraph.events ?? []) {
    const event = { ...rawEvent };
    const details = isRecord(event.details) ? event.details : undefined;
    const program = details && isTransferVignetteProgram(details.program) ? details.program : undefined;
    const eventId = stringValue(event.eventId) ?? `event-${nextEvents.length + 1}`;
    if (!program) {
      nextEvents.push(event);
      continue;
    }
    const templateId = program.template_ref?.id;
    const template = templateId ? await loadTemplate(templateId) : null;
    const resolved = resolveTransferVignetteProgram(eventId, program, template);
    const materialized = materializeTransferVignetteEvent(event, resolved);
    nextEvents.push(materialized);
    reports.push(buildCompatibilityEntry({
      event: materialized,
      honoredHints: [],
      droppedHints: [],
      compatibilityNotes: [
        ...(templateId && !template ? [`Template ${templateId} could not be resolved; using embedded program defaults.`] : []),
        ...(template?.status === 'deprecated' ? [`Template ${template.id} is deprecated.`] : []),
      ],
    }));
  }
  return {
    eventGraph: {
      ...eventGraph,
      events: nextEvents,
    },
    reports,
  };
}

export { OPERATION_TEMPLATE_SCHEMA_ID };
