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
import type { ScientistIntent, ScientistIntentActionKind, ScientistIntentActionLocation } from './types.js';
import { defaultScientistIntentVocabulary, type ScientistIntentVocabulary } from './vocabulary.js';

/** SPINE-7 fix1/D1: stable reason code for a schema-valid SCALAR well-label
 *  that the lowering chain has NO consumer for (the source-well family: no
 *  shipped pass maps a source-side label to addresses — the only role consumer
 *  is `details.role` at ChatbotCompilePasses.ts:2391). Dropping it silently is
 *  silent data loss; the producer emits this structured clarification instead
 *  and the compile runner bars atomically (422 needs-clarification arm). */
export const UNREALIZED_WELL_LABEL_REASON = 'unrealized-well-label' as const;

export interface NormalizeOptions {
  /** SPINE-7 fix1/D4: the vocabulary instance the compile threads into
   *  resolve_nouns. Wells-arg detection MUST use the SAME instance the engine
   *  reads — never the default singleton behind an injected vocab. */
  vocabulary?: ScientistIntentVocabulary;
}

export interface ScientistIntentNormalized {
  protocolIntent?: ProtocolIntent;
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
  /** SPINE-7 fix1/D1 (additive): structured clarifications the producer emits
   *  when a schema-valid scalar well-label has no lowering consumer. The
   *  compile runner bars atomically on them (422 arm, never 500). */
  clarifications?: Array<{
    label: string;
    reason: typeof UNREALIZED_WELL_LABEL_REASON;
    actionLocation: ScientistIntentActionLocation;
  }>;
}

/** Actions covered by the geometric-macro pattern expanders — DERIVED from the
 *  vocabulary YAML's declared class field (Q3 ruling; no hand-maintained set). */
const PATTERN_ACTIONS: ReadonlySet<string> = defaultScientistIntentVocabulary().patterns();

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

/** Names WHICH key supplied the first present value (SPINE-7 needs the source
 *  key to tell a declared wells argument from a raw candidate param). */
function firstKeyed(record: Record<string, unknown>, keys: string[]): { key: string; value: unknown } | undefined {
  for (const key of keys) {
    if (record[key] !== undefined) return { key, value: record[key] };
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

function toCandidateEvent(
  action: Record<string, unknown>,
  actionIndex: number,
  vocabulary: ScientistIntentVocabulary,
  unrealized: Array<{ label: string; reason: typeof UNREALIZED_WELL_LABEL_REASON; actionLocation: ScientistIntentActionLocation }>,
): { verb: string; [key: string]: unknown } {
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
  // SPINE-7 role-carrying lowering (scientist-intent chain ONLY): which
  // argument names are DECLARED wells contracts comes from the vocabulary
  // (data), never a verb/field table. SPINE-7 fix1/D4: the SAME vocabulary
  // instance the compile threads into resolve_nouns (never the singleton
  // behind an injected vocab).
  const wellsLabelArgs = new Set(
    vocabulary
      .argContracts(verb)
      .filter((contract) => contract.kind === 'wells')
      .map((contract) => contract.name),
  );
  for (const [eventKey, sciKeys] of mappings) {
    const found = firstKeyed(action, sciKeys);
    if (found === undefined) continue;
    // A SCALAR on a declared kind:wells argument is a symbolic well LABEL, not
    // an address array. The well-position family ('wells') carries the label as
    // candidate `wellRole` — a producer key written ONLY on this chain (the
    // chatbot chain's candidates never carry it, so chatbot lowering stays
    // byte-identical). The transfer/aliquot expanders lower wellRole into event
    // details.role — the exact key the resolve_roles authoritative seam
    // (ChatbotCompilePasses.ts :2391/:2410) looks up in the resolve_nouns
    // slot's resolvedByLabel (keyed by the engine-bound LABEL), so the emitted
    // wells EQUAL the engine binding's addresses. Array forms pass through
    // verbatim.
    if (typeof found.value === 'string' && found.value.trim() && wellsLabelArgs.has(found.key)) {
      if (eventKey === 'wells') {
        event.wellRole = found.value.trim();
        continue;
      }
      // SPINE-7 fix1/D1 (orchestrator fallback (b), chosen because symmetric
      // realization is impossible under this item's constraints): the source
      // family has NO role consumer — the resolve_roles seam resolves exactly
      // ONE role per event (details.role -> details.well, a DESTINATION-side
      // coordinate; ChatbotCompilePasses.ts :2391-2454). Realizing a source-side
      // label would need a new source-role consumer in ChatbotCompilePasses.ts
      // (untouchable per the fix brief) or a new (verb,arg)->role-key TS table
      // (new hardcoded policy — forbidden). Silently dropping a schema-valid
      // scalar the engine already bound is silent data loss, so the producer
      // emits a structured clarification instead: the compile runner bars
      // atomically on it (422 needs-clarification arm, never 500).
      unrealized.push({
        label: found.value.trim(),
        reason: UNREALIZED_WELL_LABEL_REASON,
        // Candidate-chain verbs are non-pattern wire verbs — all members of the
        // schema's 31-verb union (ScientistIntentActionKind); the parse layer
        // already enforced that enum before this point.
        actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument: found.key },
      });
      continue;
    }
    event[eventKey] = found.value;
  }

  // carry open params through (verb expanders may read extra fields)
  if (action.params && typeof action.params === 'object') {
    for (const [k, v] of Object.entries(action.params as Record<string, unknown>)) {
      if (event[k] === undefined) event[k] = v;
    }
  }

  return event;
}

export function normalizeScientistIntent(
  intent: ScientistIntent,
  options?: NormalizeOptions,
): ScientistIntentNormalized {
  const vocabulary = options?.vocabulary ?? defaultScientistIntentVocabulary();
  const patterns: ProtocolPatternIntent[] = [];
  const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
  const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
  // SPINE-7 fix1/D1: scalar well-labels the lowering chain cannot realize
  // (see toCandidateEvent) — surfaced as structured clarifications, never
  // silently dropped.
  const unrealized: Array<{ label: string; reason: typeof UNREALIZED_WELL_LABEL_REASON; actionLocation: ScientistIntentActionLocation }> = [];
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
      candidateEvents.push(toCandidateEvent(rec, index, vocabulary, unrealized));
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
    ...(unrealized.length > 0 ? { clarifications: unrealized } : {}),
  };
}

function updateSymbol(map: Map<string, string>, label: string, roleHint: string): void {
  const existing = map.get(label);
  map.set(label, existing ?? roleHint);
}