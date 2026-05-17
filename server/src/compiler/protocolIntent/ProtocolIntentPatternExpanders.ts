import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { Pass, PassDiagnostic, PassResult } from '../pipeline/types.js';
import type { ProtocolIntentStatePlan } from './ProtocolIntentStatePlanner.js';
import type { ProtocolPatternIntent } from './ProtocolIntent.js';
import type { ProtocolIntentValidationOutput } from './ProtocolIntentValidation.js';

export interface ProtocolIntentPatternExpansionOutput {
  events: PlateEventPrimitive[];
}

const DEFAULT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const DEFAULT_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function compact<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function numberParam(params: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = params?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringParam(params: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function arrayParam<T>(params: Record<string, unknown> | undefined, keys: string[]): T[] | undefined {
  for (const key of keys) {
    const value = params?.[key];
    if (Array.isArray(value)) return value as T[];
  }
  return undefined;
}

function normalizeRows(pattern: ProtocolPatternIntent): string[] {
  const raw = pattern.rows ?? arrayParam<string>(pattern.params, ['rows', 'targetRows']);
  if (!raw || raw.length === 0) return DEFAULT_ROWS;
  return raw.map((row) => String(row).toUpperCase());
}

function normalizeColumns(pattern: ProtocolPatternIntent): number[] {
  const raw = pattern.targetColumns ?? arrayParam<number>(pattern.params, ['targetColumns', 'columns']);
  if (!raw || raw.length === 0) return DEFAULT_COLUMNS;
  return raw.map(Number).filter((value) => Number.isInteger(value) && value > 0);
}

function well(row: string, column: number | string): string {
  return `${row.toUpperCase()}${column}`;
}

function targetWellsForColumns(rows: string[], columns: number[]): string[] {
  return columns.flatMap((column) => rows.map((row) => well(row, column)));
}

function eventId(pattern: ProtocolPatternIntent, suffix: string, index: number): string {
  return `evt-protocol-intent-${pattern.id}-${suffix}-${index}`;
}

interface ProtocolIntentTransferEventArgs {
  pattern: ProtocolPatternIntent;
  index: number;
  suffix: string;
  sourceLabware?: string | undefined;
  destinationLabware?: string | undefined;
  sourceWell?: string | undefined;
  destinationWell?: string | undefined;
  destinationWells?: string[] | undefined;
  volumeUl?: number | undefined;
  sourceMaterialRef?: string | undefined;
  waste?: string | undefined;
  extra?: Record<string, unknown> | undefined;
}

function transferEvent(args: ProtocolIntentTransferEventArgs): PlateEventPrimitive {
  return {
    eventId: eventId(args.pattern, args.suffix, args.index),
    event_type: 'transfer',
    details: compact<Record<string, unknown>>({
      source_labware: args.sourceLabware,
      destination_labware: args.destinationLabware,
      source_well: args.sourceWell,
      well: args.destinationWell,
      wells: args.destinationWells,
      volumeUl: args.volumeUl,
      volume: args.volumeUl === undefined ? undefined : { value: args.volumeUl, unit: 'uL' },
      source_material_ref: args.sourceMaterialRef,
      waste: args.waste,
      protocolIntentPatternId: args.pattern.id,
      protocolIntentPatternKind: args.pattern.kind,
      ...args.extra,
    }),
    ...(args.destinationLabware ? { labwareId: args.destinationLabware } : {}),
  };
}

interface ProtocolIntentMixEventArgs {
  pattern: ProtocolPatternIntent;
  index: number;
  labware?: string | undefined;
  well?: string | undefined;
  wells?: string[] | undefined;
  cycles?: number | undefined;
  volumeUl?: number | undefined;
  extra?: Record<string, unknown> | undefined;
}

function mixEvent(args: ProtocolIntentMixEventArgs): PlateEventPrimitive {
  return {
    eventId: eventId(args.pattern, 'mix', args.index),
    event_type: 'mix',
    details: compact<Record<string, unknown>>({
      labware: args.labware,
      well: args.well,
      wells: args.wells,
      cycles: args.cycles,
      volumeUl: args.volumeUl,
      protocolIntentPatternId: args.pattern.id,
      protocolIntentPatternKind: args.pattern.kind,
      ...args.extra,
    }),
    ...(args.labware ? { labwareId: args.labware } : {}),
  };
}

function expandSourceWellsToDuplicateTargetColumns(pattern: ProtocolPatternIntent): PlateEventPrimitive[] {
  const sourceLabware = pattern.sourceLabware;
  const targetLabware = pattern.targetLabware;
  const sourceWells = pattern.sourceWells ?? arrayParam<string>(pattern.params, ['sourceWells']) ?? [];
  const columnPairs = pattern.targetColumnPairs ?? arrayParam<number[]>(pattern.params, ['targetColumnPairs']) ?? [];
  const rows = normalizeRows(pattern);
  const volumeUl = numberParam(pattern.params, ['volumeUl', 'transferVolumeUl', 'replacementVolumeUl']);
  const events: PlateEventPrimitive[] = [];

  sourceWells.forEach((sourceWell, index) => {
    const columns = columnPairs[index] ?? [];
    const targetWells = targetWellsForColumns(rows, columns);
    targetWells.forEach((targetWell, targetIndex) => {
      events.push(transferEvent({
        pattern,
        index: events.length,
        suffix: 'source-to-columns',
        sourceLabware,
        destinationLabware: targetLabware,
        sourceWell,
        destinationWell: targetWell,
        volumeUl,
        extra: { sourceIndex: index, targetIndex },
      }));
    });
  });

  return events;
}

function expandMediaSwapDuplicateColumns(pattern: ProtocolPatternIntent): PlateEventPrimitive[] {
  const sourceLabware = pattern.sourceLabware;
  const targetLabware = pattern.targetLabware;
  const sourceWells = pattern.sourceWells ?? arrayParam<string>(pattern.params, ['sourceWells']) ?? [];
  const columnPairs = pattern.targetColumnPairs ?? arrayParam<number[]>(pattern.params, ['targetColumnPairs']) ?? [];
  const rows = normalizeRows(pattern);
  const waste = stringParam(pattern.params, ['waste', 'wasteLabware']) ?? 'default_waste';
  const removeVolumeUl = numberParam(pattern.params, ['removeVolumeUl', 'mediaVolumeUl', 'volumeUl']);
  const replacementVolumeUl = numberParam(pattern.params, ['replacementVolumeUl', 'mediaVolumeUl', 'volumeUl']);
  const events: PlateEventPrimitive[] = [];

  sourceWells.forEach((sourceWell, index) => {
    const targetWells = targetWellsForColumns(rows, columnPairs[index] ?? []);
    for (const targetWell of targetWells) {
      events.push(transferEvent({
        pattern,
        index: events.length,
        suffix: 'remove-media',
        sourceLabware: targetLabware,
        destinationLabware: waste,
        sourceWell: targetWell,
        volumeUl: removeVolumeUl,
        waste,
        extra: { phase: 'remove_media' },
      }));
      events.push(transferEvent({
        pattern,
        index: events.length,
        suffix: 'replace-media',
        sourceLabware,
        destinationLabware: targetLabware,
        sourceWell,
        destinationWell: targetWell,
        volumeUl: replacementVolumeUl,
        extra: { phase: 'replace_media' },
      }));
    }
  });

  return events;
}

function expandSerialDilution(pattern: ProtocolPatternIntent): PlateEventPrimitive[] {
  const targetLabware = pattern.targetLabware;
  const waste = stringParam(pattern.params, ['waste', 'wasteLabware']) ?? 'default_waste';
  const rows = normalizeRows(pattern);
  const targetColumn = stringParam(pattern.params, ['targetColumn', 'column']) ?? String(pattern.targetColumns?.[0] ?? 1);
  const transferVolumeUl = numberParam(pattern.params, ['transferVolumeUl', 'volumeUl']);
  const finalAspirateToWasteUl = numberParam(pattern.params, ['finalAspirateToWasteUl', 'discardVolumeUl']);
  const mix = pattern.params?.mix as Record<string, unknown> | undefined;
  const mixCycles = numberParam(mix, ['cycles']);
  const mixVolumeUl = numberParam(mix, ['volumeUl']);
  const events: PlateEventPrimitive[] = [];

  rows.forEach((row, index) => {
    const currentWell = well(row, targetColumn);
    events.push(mixEvent({
      pattern,
      index: events.length,
      labware: targetLabware,
      well: currentWell,
      cycles: mixCycles,
      volumeUl: mixVolumeUl,
      extra: { serialDilutionRatio: pattern.ratio, serialDilutionIndex: index },
    }));

    const nextRow = rows[index + 1];
    if (nextRow) {
      events.push(transferEvent({
        pattern,
        index: events.length,
        suffix: 'serial-transfer',
        sourceLabware: targetLabware,
        destinationLabware: targetLabware,
        sourceWell: currentWell,
        destinationWell: well(nextRow, targetColumn),
        volumeUl: transferVolumeUl,
        extra: { serialDilutionRatio: pattern.ratio, serialDilutionIndex: index },
      }));
    } else if (finalAspirateToWasteUl !== undefined) {
      events.push(transferEvent({
        pattern,
        index: events.length,
        suffix: 'serial-final-waste',
        sourceLabware: targetLabware,
        destinationLabware: waste,
        sourceWell: currentWell,
        volumeUl: finalAspirateToWasteUl,
        waste,
        extra: { serialDilutionRatio: pattern.ratio, phase: 'final_discard' },
      }));
    }
  });

  return events;
}

function expandRepeatRows(pattern: ProtocolPatternIntent): PlateEventPrimitive[] {
  const targetLabware = pattern.targetLabware;
  const sourceLabware = pattern.sourceLabware;
  const rows = normalizeRows(pattern);
  const columns = normalizeColumns(pattern);
  const sourceWell = stringParam(pattern.params, ['sourceWell']);
  const sourceMaterialRef = stringParam(pattern.params, ['materialRef', 'sourceMaterialRef']);
  const volumeUl = numberParam(pattern.params, ['volumeUl', 'transferVolumeUl']);
  const mix = pattern.params?.mix as Record<string, unknown> | undefined;
  const mixCycles = numberParam(mix, ['cycles']);
  const mixVolumeUl = numberParam(mix, ['volumeUl']);
  const operation = pattern.operation ?? stringParam(pattern.params, ['operation']);
  const events: PlateEventPrimitive[] = [];

  for (const row of rows) {
    const wells = columns.map((column) => well(row, column));
    events.push(transferEvent({
      pattern,
      index: events.length,
      suffix: 'repeat-row-transfer',
      sourceLabware,
      destinationLabware: targetLabware,
      sourceWell,
      destinationWells: wells,
      volumeUl,
      sourceMaterialRef,
      extra: { repeatedRow: row, operation },
    }));
    if (mix || operation?.includes('mix')) {
      events.push(mixEvent({
        pattern,
        index: events.length,
        labware: targetLabware,
        wells,
        cycles: mixCycles,
        volumeUl: mixVolumeUl,
        extra: { repeatedRow: row, operation },
      }));
    }
  }

  return events;
}

export function expandProtocolIntentPattern(pattern: ProtocolPatternIntent): PlateEventPrimitive[] {
  switch (pattern.kind) {
    case 'source_wells_to_duplicate_target_columns':
      return expandSourceWellsToDuplicateTargetColumns(pattern);
    case 'media_swap_duplicate_columns':
      return expandMediaSwapDuplicateColumns(pattern);
    case 'serial_dilution':
      return expandSerialDilution(pattern);
    case 'repeat_rows':
      return expandRepeatRows(pattern);
    case 'serial_dilution_setup':
    case 'reservoir_loading_table':
    case 'unknown':
    default:
      return [];
  }
}

export function createExpandProtocolIntentPatternsPass(): Pass {
  return {
    id: 'expand_protocol_intent_patterns',
    family: 'expand' as const,
    run({ state }): PassResult {
      const plan = (
        state.outputs.get('protocol_intent_state_plan') as
          { protocolIntentStatePlan?: ProtocolIntentStatePlan } | undefined
      )?.protocolIntentStatePlan;
      if (!plan) {
        return { ok: true, output: { events: [] } satisfies ProtocolIntentPatternExpansionOutput };
      }

      const events: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];
      const validation = state.outputs.get('validate_protocol_intent') as
        { blockers?: ProtocolIntentValidationOutput['blockers'] } | undefined;
      const validationBlockers = validation?.blockers ?? [];
      if (validationBlockers.length > 0) {
        for (const blocker of validationBlockers) {
          diagnostics.push({
            severity: blocker.severity,
            code: 'protocol_intent_validation_blocker',
            message: blocker.message,
            pass_id: 'expand_protocol_intent_patterns',
            details: {
              code: blocker.code,
              ...(blocker.path ? { path: blocker.path } : {}),
              ...(blocker.details ?? {}),
            },
          });
        }
        return {
          ok: true,
          output: { events } satisfies ProtocolIntentPatternExpansionOutput,
          diagnostics,
        };
      }
      for (const pattern of plan.patternsPendingExpansion) {
        const expanded = expandProtocolIntentPattern(pattern);
        if (expanded.length === 0 && !['serial_dilution_setup', 'reservoir_loading_table'].includes(pattern.kind)) {
          diagnostics.push({
            severity: 'warning',
            code: 'protocol_intent_pattern_not_expanded',
            message: `ProtocolIntent pattern '${pattern.kind}' did not emit events.`,
            pass_id: 'expand_protocol_intent_patterns',
            details: { patternId: pattern.id, kind: pattern.kind },
          });
        }
        events.push(...expanded);
      }

      return {
        ok: true,
        output: { events } satisfies ProtocolIntentPatternExpansionOutput,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}
