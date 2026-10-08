/**
 * parseScientistIntent — validate a scientist-intent YAML document against the
 * JSON schema (Ajv sole authority, repo rule #3) and return a typed
 * ScientistIntent. Throws a structured error when the document is invalid.
 */
import { parse as parseYaml } from 'yaml';
import { join } from 'node:path';
import { createValidator, type AjvValidator } from '../../validation/AjvValidator.js';
import { readFileSync } from 'node:fs';
import {
  defaultScientistIntentVocabulary,
  type ScientistIntentVocabulary,
} from './vocabulary.js';
import type {
  ScientistIntent,
  ScientistIntentActionKind,
  ScientistIntentActionLocation,
  ScientistIntentActionValue,
} from './types.js';

export const SCIENTIST_INTENT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/scientist-intent.schema.yaml';

/**
 * Validator cache keyed per vocabulary instance (SPINE-2 5.1): the production
 * default vocabulary is a cached singleton, so production keeps ONE validator
 * (unchanged behavior); fixture-vocabulary tests inject their own vocabulary
 * and get a FRESH validator with the fixture's enum injected (bait 2 — a test
 * must never patch schema text against the shared cache).
 */
const validatorCache = new Map<ScientistIntentVocabulary, AjvValidator>();

function getValidator(vocabulary: ScientistIntentVocabulary): AjvValidator {
  const cached = validatorCache.get(vocabulary);
  if (cached) return cached;
  const validator = createValidator({ strict: false });
  const schemaText = readFileSync(
    join(process.cwd(), 'schema', 'workflow', 'scientist-intent.schema.yaml'),
    'utf-8',
  );
  const schema = parseYaml(schemaText) as Record<string, unknown>;
  // MACHINE INJECTION (precedent: server.ts approved-predicate registry
  // injection): the vocabulary's verb enum replaces the wire schema's
  // $defs/actionVerb enum BEFORE addSchema, so the fabrication gate follows
  // the YAML authority — the on-disk enum stays the human-readable mirror,
  // equality gated by scientist-intent-vocabulary.mirror-drift.
  const defs = schema.$defs as Record<string, unknown>;
  (defs.actionVerb as Record<string, unknown>).enum = vocabulary.toolActionEnum();
  validator.addSchema(schema as Parameters<AjvValidator['addSchema']>[0], SCIENTIST_INTENT_SCHEMA_ID);
  validatorCache.set(vocabulary, validator);
  return validator;
}

export class ScientistIntentValidationError extends Error {
  readonly errors: unknown[];
  constructor(message: string, errors: unknown[]) {
    super(message);
    this.name = 'ScientistIntentValidationError';
    this.errors = errors;
  }
}

/**
 * BLOCKED-DELETION NOTE (SPINE-2 l2t1145, escalated to orchestrator): this
 * literal verb set is the copy SPINE-2 4/7 mandates deleting (derive from the
 * vocabulary YAML), but SPINE-1's frozen verb-inventory contract test
 * regex-extracts THIS literal form and its pin may not be edited without
 * orchestrator adjudication. The Ajv fabrication gate is now vocabulary-driven
 * via the $defs/actionVerb enum injection in getValidator(); this literal is
 * retained ONLY for the pinned preserveActionLocation defense layer below.
 */
const KNOWN_ACTIONS: ReadonlySet<string> = new Set<ScientistIntentActionKind>([
  'seed', 'incubate', 'mix', 'resuspend', 'dilute', 'shake', 'count', 'read',
  'add_material', 'create_container', 'transfer', 'stain', 'fix', 'permeabilize',
  'block', 'quench', 'label', 'transfect', 'aliquot', 'wash', 'elute', 'harvest',
  'passage', 'freeze', 'thaw', 'spin', 'pellet', 'serial_dilution',
  'media_swap_duplicate_columns', 'source_wells_to_duplicate_target_columns',
  'repeat_rows',
]);

function normalizeDocument(value: unknown, vocabulary: ScientistIntentVocabulary): ScientistIntent {
  const obj = value as Record<string, unknown>;
  const actions = (Array.isArray(obj.actions) ? obj.actions : []) as Array<
    Record<string, unknown>
  >;
  const unresolvedBase = Array.isArray(obj.unresolved) ? obj.unresolved : [];
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: typeof obj.intentId === 'string' && obj.intentId.trim()
      ? obj.intentId
      : 'scientist-intent',
    ...(typeof obj.sourcePrompt === 'string' ? { sourcePrompt: obj.sourcePrompt } : {}),
    actions: actions.flatMap((a) => {
      const actionName = a.action as ScientistIntentActionKind;
      if (!vocabulary.has(actionName)) return [];
      const clean: Record<string, unknown> = { action: actionName };
      for (const key of [
        'source', 'sourceHint', 'target', 'targetHint', 'labware', 'labwareHint',
        'source_name', 'material', 'mode', 'wavelength', 'instrument', 'readout',
        'ratio', 'duration',
        // SPINE-1 expected-domain slots (declaration only; nothing consumes them yet)
        'expectedSourceDomain', 'expectedTargetDomain', 'expectedLabwareDomain',
      ] as const) {
        if (typeof a[key] === 'string' && (a[key] as string).trim()) clean[key] = a[key];
      }
      for (const key of ['sourceWells', 'targetWells'] as const) {
        if (Array.isArray(a[key])) clean[key] = a[key];
      }
      for (const key of [
        'factor', 'points', 'replicates', 'volumeUl', 'cycles', 'temperatureC', 'rpm',
      ] as const) {
        if (typeof a[key] === 'number' && Number.isFinite(a[key])) clean[key] = a[key];
      }
      if (a.volume !== undefined) clean.volume = a.volume;
      if (a.params && typeof a.params === 'object') clean.params = a.params;
      return [clean as unknown as ScientistIntentActionValue];
    }),
    unresolved: unresolvedBase.flatMap((u) => {
      const rec = u as Record<string, unknown>;
      if (typeof rec.label !== 'string' || typeof rec.reason !== 'string') return [];
      const candidates = Array.isArray(rec.candidates)
        ? rec.candidates.flatMap((c) => {
            const cr = c as Record<string, unknown>;
            return typeof cr.label === 'string'
              ? [{ label: cr.label, ...(typeof cr.confidence === 'number' ? { confidence: cr.confidence } : {}) }]
              : [];
          })
        : [];
      // SPINE-1: preserve argument-location identity on the PARSED document
      // (parse-level contract). The normalizeScientistIntent unresolvedRefs
      // boundary stays {kind,label,reason} — SPINE-3 widens it.
      const actionLocation = preserveActionLocation(rec.actionLocation);
      return [{
        label: rec.label,
        reason: rec.reason,
        ...(candidates.length > 0 ? { candidates } : {}),
        ...(actionLocation ? { actionLocation } : {}),
      }];
    }),
  };
}

/**
 * Carry actionLocation through normalizeDocument member-by-member (defense in
 * depth behind the schema), preserving ONLY well-typed members and omitting the
 * whole object when nothing survives. exactOptionalPropertyTypes: conditional
 * spread, never `x: undefined`.
 */
function preserveActionLocation(value: unknown): ScientistIntentActionLocation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const loc = value as Record<string, unknown>;
  const preserved: ScientistIntentActionLocation = {
    ...(typeof loc.actionIndex === 'number' && Number.isInteger(loc.actionIndex) ? { actionIndex: loc.actionIndex } : {}),
    ...(typeof loc.action === 'string' && loc.action.trim() && KNOWN_ACTIONS.has(loc.action as ScientistIntentActionKind)
      ? { action: loc.action as ScientistIntentActionKind }
      : {}),
    ...(typeof loc.argument === 'string' && loc.argument.trim() ? { argument: loc.argument } : {}),
  };
  return Object.keys(preserved).length > 0 ? preserved : undefined;
}

/**
 * Parse & validate a scientist-intent YAML document.
 * @throws ScientistIntentValidationError when the document violates the schema.
 */
export interface ParseScientistIntentOptions {
  /** Vocabulary override (fixture injection). Production callers omit it and
   *  get the shipped vocabulary singleton. */
  vocabulary?: ScientistIntentVocabulary;
}

export function parseScientistIntent(
  yamlText: string,
  opts?: ParseScientistIntentOptions,
): ScientistIntent {
  const vocabulary = opts?.vocabulary ?? defaultScientistIntentVocabulary();
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch (error) {
    throw new ScientistIntentValidationError(
      `scientist-intent YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      [error],
    );
  }
  if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
    throw new ScientistIntentValidationError(
      'scientist-intent document must be a YAML object',
      [parsed],
    );
  }

  const result = getValidator(vocabulary).validate(parsed, SCIENTIST_INTENT_SCHEMA_ID);
  if (!result.valid) {
    throw new ScientistIntentValidationError(
      `scientist-intent failed schema validation: ${result.errors.length} error(s)`,
      result.errors,
    );
  }

  return normalizeDocument(parsed, vocabulary) as ScientistIntent;
}