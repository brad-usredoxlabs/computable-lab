/**
 * scientistIntent — portable, closed-vocabulary scientist intent.
 *
 * This is the SMALL-LLM output contract. It deliberately uses high-level
 * biology verbs/patterns with natural-language or numeric parameters and
 * SYMBOLIC resource labels (source, target, labware). It is the ancestor,
 * NOT the descendant, of ProtocolIntent: a normalizer folds it into a
 * ProtocolIntent + candidateEvents that the deterministic compiler already
 * knows how to expand.
 */

export type ScientistIntentActionKind =
  // simple biology verbs
  | 'seed'
  | 'incubate'
  | 'mix'
  | 'resuspend'
  | 'dilute'
  | 'shake'
  | 'count'
  | 'read'
  | 'add_material'
  | 'create_container'
  | 'transfer'
  | 'stain'
  | 'fix'
  | 'permeabilize'
  | 'block'
  | 'quench'
  | 'label'
  | 'transfect'
  // compound
  | 'aliquot'
  | 'wash'
  | 'elute'
  | 'harvest'
  | 'passage'
  | 'freeze'
  | 'thaw'
  // centrifugation
  | 'spin'
  | 'pellet'
  // geometric pattern macros
  | 'serial_dilution'
  | 'media_swap_duplicate_columns'
  | 'source_wells_to_duplicate_target_columns'
  | 'repeat_rows';

export interface ScientistIntentActionValue {
  schema?: unknown;
  action: ScientistIntentActionKind;
  // symbolic noun labels (never resolved ids)
  source?: string;
  sourceHint?: string;
  sourceWells?: string[];
  target?: string;
  targetHint?: string;
  targetWells?: string[];
  labware?: string;
  labwareHint?: string;
  // expected-domain slots (SPINE-1 declaration ONLY): free-text domain tags
  // naming which KIND of thing the argument is expected to be. Nothing consumes
  // them until SPINE-2's vocabulary YAML declares per-verb per-argument domains
  // and SPINE-3's resolution engine evaluates them. No ontology-term validation
  // fires here (that would be a second policy home before the vocabulary exists).
  expectedSourceDomain?: string;
  expectedTargetDomain?: string;
  expectedLabwareDomain?: string;
  // auth
  source_name?: string;
  // quantities / parameters
  factor?: number;
  points?: number;
  replicates?: number;
  ratio?: string;
  volume?: { value?: number; unit?: string } | string | number;
  volumeUl?: number;
  cycles?: number;
  duration?: string;
  temperatureC?: number;
  rpm?: number;
  material?: string;
  mode?: string;
  wavelength?: string;
  instrument?: string;
  assayId?: string;
  readout?: string;
  params?: Record<string, unknown>;
}

/**
 * Argument-location identity (SPINE-1 contract extension): WHERE in the
 * document a clarification bites — which action (by index and/or canonical
 * verb) and which argument of it ('source' | 'target' | 'labware' | a param
 * name). All members optional; `action` is constrained to the same 31-verb
 * union the schema's $defs/actionVerb references — the verb enum is the
 * fabrication gate at the contract layer.
 */
export interface ScientistIntentActionLocation {
  actionIndex?: number;
  action?: ScientistIntentActionKind;
  argument?: string;
}

export interface ScientistIntentUnresolvedFact {
  label: string;
  reason: string;
  candidates?: Array<{ label: string; confidence?: number }>;
  actionLocation?: ScientistIntentActionLocation;
}

export interface ScientistIntent {
  kind: 'scientist-intent';
  version: string;
  intentId: string;
  sourcePrompt?: string;
  actions: ScientistIntentActionValue[];
  unresolved: ScientistIntentUnresolvedFact[];
}

export const SCIENTIST_INTENT_KIND = 'scientist-intent' as const;
export const SCIENTIST_INTENT_VERSION = '0.1.0' as const;

export function createEmptyScientistIntent(init: {
  intentId?: string;
  sourcePrompt?: string;
} = {}): ScientistIntent {
  return {
    kind: SCIENTIST_INTENT_KIND,
    version: SCIENTIST_INTENT_VERSION,
    intentId: init.intentId ?? 'scientist-intent',
    ...(init.sourcePrompt !== undefined ? { sourcePrompt: init.sourcePrompt } : {}),
    actions: [],
    unresolved: [],
  };
}

export function isScientistIntent(value: unknown): value is ScientistIntent {
  const obj = value as ScientistIntent | undefined;
  return !!obj
    && obj.kind === SCIENTIST_INTENT_KIND
    && obj.version === SCIENTIST_INTENT_VERSION
    && typeof obj.intentId === 'string'
    && Array.isArray(obj.actions);
}