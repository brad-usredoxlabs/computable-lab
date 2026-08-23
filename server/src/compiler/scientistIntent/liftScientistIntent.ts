/**
 * liftScientistIntent — pre-validation normalization of a scientist-intent
 * document emitted by a SMALL language model.
 *
 * A 2.6B-class model reads a vendor protocol and, despite a closed tool-schema
 * enum, naturally reaches for ecosystem verbs (`aspirate`, `dispense`,
 * `centrifuge`, `dry`, `repeat_cycle`). This lift maps those to the canonical
 * closed vocabulary BEFORE schema validation, and normalizes loose parameters
 * (string-typed numbers, alias duration keys, stray `ratio`/`label` noise) into
 * the schema's supported shape.
 *
 * Controlled-vocabulary rule (#7): the *final* document the compiler consumes is
 * always the canonical set. The model's natural language is bridged here via a
 * declarative alias table — NOT hardcoded branch logic.
 */
import type { ScientistIntentActionKind } from './types.js';

/** Canonical action names the schema/compiler accept. */
export const CANONICAL_ACTIONS: readonly ScientistIntentActionKind[] = [
  'seed', 'incubate', 'mix', 'resuspend', 'dilute', 'shake', 'count', 'read',
  'add_material', 'create_container', 'transfer', 'stain', 'fix', 'permeabilize',
  'block', 'quench', 'label', 'transfect', 'aliquot', 'wash', 'elute', 'harvest',
  'passage', 'freeze', 'thaw', 'spin', 'pellet', 'serial_dilution',
  'media_swap_duplicate_columns', 'source_wells_to_duplicate_target_columns',
  'repeat_rows',
];

/**
 * Natural-verb → canonical-action alias table. Small models read vendor protocol
 * prose and use ecosystem verbs; map them to the closed vocabulary. Declarative.
 */
export const ACTION_SYNONYMS: Record<string, ScientistIntentActionKind> = {
  // aspirate / discard → a transfer that carries the waste target
  aspirate: 'transfer',
  aspirate_discard: 'transfer',
  discard: 'transfer',
  dispense: 'transfer',
  elute: 'transfer',
  add: 'add_material',
  // lysis / bead-beating edge cases
  lyse: 'mix',
  lysate: 'transfer',
  dissolve: 'mix',
  resuspend_lysate: 'mix',
  t: 'transfer',
  // pellet / centrifuge / spin
  pellet: 'spin',
  pelletize: 'spin',
  centrifuge: 'spin',
  cent: 'spin',
  // repeat / cycle
  repeat_cycle: 'mix',
  repeat: 'repeat_rows',
  // thermal / state
  dry: 'incubate',
  air_dry: 'incubate',
  heat: 'incubate',
  rehydrate: 'incubate',
  freeze: 'freeze',
  thaw: 'thaw',
  // misc natural
  stain: 'stain',
  fix: 'fix',
  block: 'block',
  wash_step: 'wash',
};

/** Allowed per-action parameter keys in the canonical schema. */
const ALLOWED_PARAM_KEYS = new Set<string>([
  'source', 'sourceHint', 'sourceWells', 'source_name',
  'target', 'targetHint', 'targetWells',
  'labware', 'labwareHint',
  'factor', 'points', 'replicates', 'ratio',
  'volume', 'volumeUl', 'cycles', 'duration', 'temperatureC', 'rpm',
  'mode', 'wavelength', 'instrument', 'assayId', 'readout', 'material',
  'params',
]);

/** Coerce a string that is purely numeric to a Number (e.g. "550" → 550). */
export function coerceNumeric(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

/** Pick the canonical action for a raw action name (else keep the raw). */
export function canonicalActionName(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const trimmed = raw.trim().toLowerCase();
  return ACTION_SYNONYMS[trimmed] ?? trimmed;
}

/** Are the given actions all present in the canonical closed set? */
export function canonicalSet(): Set<string> {
  return new Set<string>(CANONICAL_ACTIONS);
}

/** Lift one action: canonicalize the verb + coerce/whitelist params. */
export function liftAction(raw: Record<string, unknown>): Record<string, unknown> {
  const actionName = canonicalActionName(
    typeof raw.action === 'string' ? raw.action : typeof raw.verb === 'string' ? raw.verb : undefined,
  );
  const out: Record<string, unknown> = { action: actionName };

  // Duration may arrive via a variety of aliases from the model.
  const durationAliases = [
    raw.duration, raw.durationMin, raw.durationMinutes, raw.timeMin, raw.time,
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '').find(() => true);

  // Copy known params, coercing numeric strings for purely-numeric fields.
  for (const key of ALLOWED_PARAM_KEYS) {
    if (key === 'params') continue;
    let v = raw[key];
    if (key === 'duration' && durationAliases !== undefined) v = durationAliases;
    if (v === undefined || v === null) continue;
    if (['volume', 'volumeUl', 'cycles', 'factor', 'points', 'replicates', 'temperatureC', 'rpm'].includes(key)) {
      v = coerceNumeric(v);
    }
    // Only keep `ratio` when it is a genuine dilution-ratio shape (N:N or N:1); a
    // small model often emits noise here (">=4000 xg", "1:3") that the macro
    // expanders cannot use — strip clearly-invalid values.
    if (key === 'ratio' && typeof v === 'string') {
      const ratioMatch = /^\s*\d+\s*:\s*\d+\s*$/.test(v);
      if (!ratioMatch) continue;
    }
    out[key] = v;
  }

  // A numeric `volume` also fills volumeUl when absent (the serializer carries both).
  if (out['volume'] !== undefined && out['volumeUl'] === undefined
    && typeof out['volume'] === 'number') {
    out['volumeUl'] = out['volume'];
  }

  return out;
}

/**
 * Lift a whole scientist-intent document (a tool-call `arguments` object):
 * canonicalize each action and drop/normalize non-schema noise so it passes
 * strict Ajv validation and the deterministic compiler using only the closed
 * vocabulary.
 */
export function liftScientistIntent(raw: unknown): Record<string, unknown> {
  const doc = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};
  const actionsSrc = Array.isArray(doc.actions)
    ? doc.actions as Array<Record<string, unknown>>
    : [];

  return {
    ...(typeof doc.intentId === 'string' ? { intentId: doc.intentId } : {}),
    ...(typeof doc.sourcePrompt === 'string' ? { sourcePrompt: doc.sourcePrompt } : {}),
    actions: actionsSrc.map(liftAction),
    ...(Array.isArray(doc.unresolved) ? { unresolved: doc.unresolved } : {}),
  };
}