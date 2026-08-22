/**
 * normalizeScientistIntent — fold a scientist-intent wire document into the
 * inputs the deterministic compiler already consumes:
 *
 *   • Geometric macros (serial_dilution, media_swap_duplicate_columns,
 *     source_wells_to_duplicate_target_columns, repeat_rows) become
 *     `ProtocolPatternIntent`s, which the existing
 *     `expand_protocol_intent_patterns` pass unrolls into primitive events.
 *
 *   • Every other action (biology verbs + centrifugation) becomes a
 *     `candidateEvents` entry `{ verb, ...params }` that the existing
 *     `expand_biology_verbs` pass lowers through the ~25 registered verb
 *     expanders (seed, incubate, read, wash, harvest, aliquot, spin, ...).
 *
 *   • Symbolic noun labels (source, target, labware) are carried forward as
 *     SYMBOLS (never resolved IDs / deck slots) so the existing
 *     resolve_labware / resolve_references / assurance loop binds them.
 *
 * The output object is shaped exactly like the `ai_precompile` pass output,
 * so the scientist-intent pipeline can seed `state.outputs['ai_precompile']`
 * and reuse the entire downstream deterministic stack unchanged.
 */
import type { ProtocolIntent, ProtocolPatternIntent } from '../protocolIntent/ProtocolIntent.js';
import type { ScientistIntent } from './types.js';

export interface ScientistIntentNormalized {
  protocolIntent?: ProtocolIntent;
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
}

/** Actions already covered by the geometric-macro pattern expanders. */
const PATTERN_ACTIONS = new Set(['serial_dilution', 'media_swap_duplicate_columns', 'source_wells_to_duplicate_target_columns', 'repeat_rows']);

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function toPattern(
  action: Record<string, unknown>,
  kind: string,
  index: number,
): ProtocolPatternIntent {
  const id = `pattern-${index}`;
  const params: Record<string, unknown> = {};
  for (const key of ['factor', 'points', 'replicates', 'volumeUl', 'cycles', 'temperatureC', 'rpm'] as const) {
    const v = action[key];
    if (typeof v === 'number') params[key] = v;
  }
  if (typeof action.ratio === 'string') params['ratio'] = action.ratio;
  if (typeof action.volume !== 'undefined') params['volume'] = action.volume;
  if (action.params && typeof action.params === 'object') {
    for (const [k, v] of Object.entries(action.params as Record<string, unknown>)) {
      params[k] = v;
    }
  }
  if (typeof action.targetHint === 'string') params['targetHint'] = action.targetHint;
  if (typeof action.labwareHint === 'string') params['labwareHint'] = action.labwareHint;
  return {
    id,
    kind: kind as ProtocolPatternIntent['kind'],
    ...(firstString(action, ['source', 'sourceHint']) ? { sourceLabware: firstString(action, ['source', 'sourceHint']) } : {}),
    ...(firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) ? { targetLabware: firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) } : {}),
    ...(Array.isArray(action.sourceWells) ? { sourceWells: action.sourceWells as string[] } : {}),
    ...(Array.isArray(action.targetWells) ? { targetWells: action.targetWells as string[] } : {}),
    ...(Object.keys(params).length > 0 ? { params } : {}),
  } as unknown as ProtocolPatternIntent;
}

function serialDilutionPattern(action: Record<string, unknown>, index: number): ProtocolPatternIntent {
  const params: Record<string, unknown> = {};
  if (typeof action.factor === 'number') params['factor'] = action.factor;
  if (typeof action.points === 'number') params['points'] = action.points;
  if (typeof action.replicates === 'number') params['replicates'] = action.replicates;
  if (typeof action.volumeUl === 'number') params['volumeUl'] = action.volumeUl;
  if (typeof action.volume === 'number') params['volumeUl'] = action.volume;
  if (typeof action.ratio === 'string') params['ratio'] = action.ratio;
  if (typeof action.temperatureC === 'number') params['temperatureC'] = action.temperatureC;
  if (typeof action.target === 'string') params['targetHint'] = action.target;
  if (typeof action.source === 'string') params['sourceHint'] = action.source;
  return {
    id: `pattern-${index}`,
    kind: 'serial_dilution',
    ...(firstString(action, ['source', 'sourceHint']) ? { sourceLabware: firstString(action, ['source', 'sourceHint']) } : {}),
    ...(firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) ? { targetLabware: firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) } : {}),
    ...(Array.isArray(action.targetWells) ? { targetWells: action.targetWells as string[] } : {}),
    params,
  } as ProtocolPatternIntent;
}

function toCandidateEvent(action: Record<string, unknown>): { verb: string; [key: string]: unknown } {
  const verb = (action.action as string) ?? 'unknown';
  const event: { verb: string; [key: string]: unknown } = { verb };

  // symbolic labware labels — deterministics resolve these later
  const source = firstString(action, ['source', 'sourceHint']);
  const target = firstString(action, ['target', 'targetHint']);
  const labware = firstString(action, ['labware', 'labwareHint']);
  if (source) event.source_labware = source;
  if (target) {
    event.destination_labware = target;
    event.target_labware_id = target;
  }
  if (labware) {
    event.labware = labware;
    event.labware_id = labware;
  }

  // standardized param keys the verb expanders read
  const mappings: Array<[string, string[]]> = [
    ['material', ['material', 'source_name']],
    ['volume_uL', ['volumeUl']],
    ['volume', ['volume']],
    ['cycles', ['cycles']],
    ['duration', ['duration']],
    ['temperature', ['temperatureC']],
    ['rpm', ['rpm']],
    ['mode', ['mode']],
    ['wavelength', ['wavelength']],
    ['instrument', ['instrument']],
    ['assayId', ['assayId']],
    ['readout', ['readout']],
    ['factor', ['factor']],
    ['points', ['points']],
    ['replicates', ['replicates']],
    ['source_wells', ['sourceWells']],
    ['wells', ['targetWells', 'wells']],
  ];
  for (const [eventKey, sciKeys] of mappings) {
    const v = firstValue(action, sciKeys);
    if (v !== undefined) event[eventKey] = v;
  }

  // carry open params through (verb expanders may read extra fields)
  if (action.params && typeof action.params === 'object') {
    for (const [k, v] of Object.entries(action.params as Record<string, unknown>)) {
      if (event[k] === undefined) event[k] = v;
    }
  }

  return event;
}

export function normalizeScientistIntent(intent: ScientistIntent): ScientistIntentNormalized {
  const patterns: ProtocolPatternIntent[] = [];
  const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
  const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
  // every distinct symbolic noun label becomes a candidate labware resource so
  // ProtocolIntent validation + resolve_labware can bind it downstream.
  const symbolicLabels = new Map<string, string>(); // label -> role hint

  intent.actions.forEach((action, index) => {
    const rec = action as unknown as Record<string, unknown>;
    const verb = String(rec.action ?? '');

    const source = firstString(rec, ['source', 'sourceHint']);
    const target = firstString(rec, ['target', 'targetHint']);
    const labware = firstString(rec, ['labware', 'labwareHint']);

    if (source && !PATTERN_ACTIONS.has(verb)) updateSymbol(symbolicLabels, source, 'source');
    if (target) updateSymbol(symbolicLabels, target, verb === 'harvest' || verb === 'passage' || verb === 'transfer' ? 'target' : 'target');
    if (labware) updateSymbol(symbolicLabels, labware, 'labware');

    if (PATTERN_ACTIONS.has(verb)) {
      const pattern = verb === 'serial_dilution'
        ? serialDilutionPattern(rec, index)
        : toPattern(rec, verb, index);
      if (pattern.sourceLabware) updateSymbol(symbolicLabels, pattern.sourceLabware, 'source');
      if (pattern.targetLabware) updateSymbol(symbolicLabels, pattern.targetLabware, 'target');
      patterns.push(pattern);
    } else {
      candidateEvents.push(toCandidateEvent(rec));
    }
  });

  const labwareInstances = Array.from(symbolicLabels.entries()).map(([label, role]) => ({
    // id === the symbolic label so pattern/op refs (which carry the raw symbol)
    // resolve against validation's labware id-index. resolve_labware uses the
    // hint to bind a real labware-instance record.
    id: label,
    labwareHint: label,
    ...(role === 'source' ? { role: 'source' as const } : {}),
    ...(role === 'target' || role === 'destination' ? { role: 'target' as const } : {}),
    resolutionStatus: 'candidate' as const,
  }));

  for (const fact of intent.unresolved) {
    unresolvedRefs.push({
      kind: 'unresolved_symbol',
      label: fact.label,
      reason: fact.reason,
    });
  }

  const protocolIntent: ProtocolIntent | undefined = patterns.length > 0 || labwareInstances.length > 0
    ? {
        kind: 'protocol_intent',
        version: '0.1.0',
        intentId: intent.intentId,
        ...(intent.sourcePrompt ? { sourcePrompt: intent.sourcePrompt } : {}),
        steps: [],
        resources: {
          labwareInstances,
          materialDefinitions: [],
          materialFormulations: [],
          materialAliquots: [],
          pipettes: [],
          tips: [],
          waste: [],
        },
        operations: [],
        patterns,
        assumptions: [],
        unresolved: intent.unresolved.map((fact) => ({
          id: `unresolved-${fact.label}`,
          kind: 'operation' as const,
          label: fact.label,
          reason: fact.reason,
          blocksLowering: false,
        })),
      }
    : undefined;

  return {
    ...(protocolIntent ? { protocolIntent } : {}),
    candidateEvents,
    unresolvedRefs,
  };
}

function updateSymbol(map: Map<string, string>, label: string, roleHint: string): void {
  const existing = map.get(label);
  map.set(label, existing ?? roleHint);
}