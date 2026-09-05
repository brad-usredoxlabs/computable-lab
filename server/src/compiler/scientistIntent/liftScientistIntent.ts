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

/** Small models write volume as volume_ul (snake) instead of volumeUl. */
const PARAM_ALIASES: Record<string, string> = {
  volume_ul: 'volumeUl',
  volume_ml: 'volume',
  time_min: 'duration',
  durationMin: 'duration',
  durationMinutes: 'duration',
  timeMin: 'duration',
  time: 'duration',
  temp_c: 'temperatureC',
  temperature: 'temperatureC',
  rpm_value: 'rpm',
  cycles_count: 'cycles',
};

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
export function liftAction(rawArg: Record<string, unknown>): Record<string, unknown> {
  let raw = rawArg;
  // Small models sometimes nest params under a `parameters` object (OpenAI-style
  // tool output) instead of flattening them onto the action. Flatten first so
  // the canonical lift sees volumeUl / temperatureC / material etc.
  if (raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)) {
    raw = { ...raw, ...(raw.parameters as Record<string, unknown>) };
  }

  // Key-as-action shape: the model writes actions as a map keyed by the verb
  // (`- add_material:\n    material: "..."`) instead of `action:`. Detect the
  // single verb-key and treat its value as the params.
  let actionName: string | undefined;
  if (typeof raw.action === 'string' && raw.action.trim()) {
    actionName = canonicalActionName(raw.action);
  } else if (typeof raw.verb === 'string' && raw.verb.trim()) {
    actionName = canonicalActionName(raw.verb);
  } else {
    const verbKey = Object.keys(raw).find((k) => {
      if (k === 'action' || k === 'verb' || k === 'params' || k === 'unresolved') return false;
      const v = raw[k];
      return (typeof v === 'object' && !Array.isArray(v)) || (typeof v === 'string' && v.trim().length > 0);
    });
    if (verbKey && (ACTION_SYNONYMS[verbKey.toLowerCase()] || CANONICAL_ACTIONS.includes(verbKey as ScientistIntentActionKind))) {
      actionName = canonicalActionName(verbKey);
      const verbValue = raw[verbKey];
      if (verbValue && typeof verbValue === 'object' && !Array.isArray(verbValue)) {
        raw = { ...raw, ...(verbValue as Record<string, unknown>) };
      }
    } else {
      actionName = canonicalActionName(verbKey);
    }
  }
  const canonical = actionName ?? 'unknown';
  const out: Record<string, unknown> = { action: canonical };

  // Duration may arrive via a variety of aliases from the model.
  const durationAliases = [
    raw.duration, raw.durationMin, raw.durationMinutes, raw.timeMin, raw.time,
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '').find(() => true);

  // Copy known params (canonical + aliased snake-case keys), coercing numeric
  // strings for purely-numeric fields. Skip anything the schema forbids.
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    const canonicalKey = PARAM_ALIASES[key] ?? key;
    if (canonicalKey === 'params' || canonicalKey === 'parameters') continue;
    if (!ALLOWED_PARAM_KEYS.has(canonicalKey)) continue;
    if (canonicalKey === 'action' || canonicalKey === 'verb') continue;
    let v: unknown = value;
    if (canonicalKey === 'duration' && durationAliases !== undefined) v = durationAliases;
    if (['volume', 'volumeUl', 'cycles', 'factor', 'points', 'replicates', 'temperatureC', 'rpm'].includes(canonicalKey)) {
      v = coerceNumeric(v);
    }
    // Strip clearly-invalid `ratio` noise (">=4000 xg", unbounded text).
    if (canonicalKey === 'ratio' && typeof v === 'string' && !/^\s*\d+\s*:\s*\d+\s*$/.test(v)) continue;
    out[canonicalKey] = v;
  }

  // A numeric `volume` also fills volumeUl when absent (compiler reads volumeUl
  // for most verbs; the serializer carries both).
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
  // `actions` may arrive as an ARRAY (tool-call arguments, or plain-text list)
  // OR as a verb-keyed MAP (plain-text small-model emission: `add_material:
  // {material, volumeUl}` or `add_material: [ {..}, {..} ]`). Normalize both to
  // a flat array of `{ verb-name: params }` objects (one per emitted instance).
  const rawActions = doc.actions;
  let actionsSrc: Array<Record<string, unknown>>;
  if (Array.isArray(rawActions)) {
    actionsSrc = rawActions as Array<Record<string, unknown>>;
  } else if (rawActions && typeof rawActions === 'object') {
    actionsSrc = [];
    for (const [verbKey, val] of Object.entries(rawActions as Record<string, unknown>)) {
      if (val === undefined || val === null) continue;
      // Single param map, or an array of param maps (one per emitted instance).
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            actionsSrc.push({ [verbKey]: item });
          }
        }
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        actionsSrc.push({ [verbKey]: val });
      } else {
        // scalar param value — still lift it (e.g. `repeat_rows: 96`)
        actionsSrc.push({ [verbKey]: val });
      }
    }
  } else {
    actionsSrc = [];
  }

  return {
    ...(typeof doc.intentId === 'string' ? { intentId: doc.intentId } : {}),
    ...(typeof doc.sourcePrompt === 'string' ? { sourcePrompt: doc.sourcePrompt } : {}),
    actions: actionsSrc.map(liftAction),
    ...(Array.isArray(doc.unresolved) ? { unresolved: doc.unresolved } : {}),
  };
}