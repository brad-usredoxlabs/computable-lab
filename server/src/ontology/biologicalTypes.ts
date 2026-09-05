/**
 * BiologicalTypes — declarative biological-type registry (phase B).
 *
 * The single source of "what do I ask for this organism?" — which invariant to
 * record (cells/well, worms/well, CFU/mL, OD600), which fields the add-material
 * form renders, and how the seed count is verified later. Data lives in
 * schema/registry/biological-types/biological-types.yaml; this module only
 * loads + interprets it (no hardcoded TS rules — repo rule #1).
 *
 * Lookup precedence (all case-insensitive substring on labels / CURIE prefixes):
 *   1. exact label/curie match against a type's `match` basket
 *   2. coarse material.domain match (cell_line / organism)
 *   3. the `default` generic count+volume rule (inclusiveness floor)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { localTermIdForLabel } from '../materials/termId.js';

export type BiologicalMeasureKey = 'count' | 'volume' | 'counterDensity' | 'od600' | 'cfu';
export type BiologicalMeasurePrimary = 'count' | 'cfu' | 'od600' | 'mass';

const MEASURE_KEYS = new Set<BiologicalMeasureKey>(['count', 'volume', 'counterDensity', 'od600', 'cfu']);
const ENTITY_KEYS = new Set<string>(['count', 'volume', 'counterDensity', 'od600', 'cfu']);
const DOMAINS = new Set<string>(['cell_line', 'chemical', 'media', 'reagent', 'organism', 'sample', 'other']);
const TERM_KINDS = new Set<string>(['material', 'vendor', 'labware', 'instrument', 'verb', 'kit', 'organism', 'condition', 'other']);

export interface BiologicalTypeField {
  key: BiologicalMeasureKey;
  label: string;
  required: boolean;
}

export interface BiologicalTypeMeasures {
  primary: BiologicalMeasurePrimary;
  units: string[];
  concentrationBasis: string;
  alternative?: string[];
}

export interface BiologicalTypeVerification {
  method?: string;
  readModality?: string;
}

/** A declared organism or cell-line (identity vocabulary). */
export interface BiologicalOrganismSeed {
  label: string;
  id: string; // deterministic TERM-<slug>-<hash>
  aliases: string[];
  curie?: string;
  domain?: string;
}

/** A declared organism strain (species→strain spine). */
export interface BiologicalStrainSeed {
  label: string;
  id: string;
  strain: string;
  species: string; // organism seed label
  aliases: string[];
}

/** A declared culture condition (kind: condition). */
export interface BiologicalConditionSeed {
  label: string;
  id: string;
  aliases: string[];
}

export interface BiologicalTypeMatch {
  labels: string[];
  curies: string[];
}

export interface BiologicalTypeRule {
  id: string;
  label: string;
  domains: string[];
  termKinds: string[];
  match: BiologicalTypeMatch;
  measures: BiologicalTypeMeasures;
  verification?: BiologicalTypeVerification;
  fields: BiologicalTypeField[];
}

export interface BiologicalTypesRegistryDocument {
  version: number;
  title?: string;
  description?: string;
  default: BiologicalTypeRule;
  types: Record<string, BiologicalTypeRule>;
  organisms: BiologicalOrganismSeed[];
  strains: BiologicalStrainSeed[];
  conditions: BiologicalConditionSeed[];
}

export interface BiologicalTypeLookupInput {
  /** coarse material.domain (cell_line | organism | ...) */
  domain?: string;
  /** resolved biological type label (term preferredLabel / alias) */
  label?: string;
  /** resolved biological type CURIE (e.g. NCBITaxon:6239) */
  curie?: string;
}

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, context: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)) {
    throw new Error(`${context} must be an array of strings`);
  }
  return value.map((entry) => entry.trim());
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, context);
}

function normalizeField(id: string, index: number, raw: unknown): BiologicalTypeField {
  const obj = asObject(raw, `type ${id} field ${index}`);
  const key = requiredString(obj.key, `type ${id} field ${index}.key`);
  if (!MEASURE_KEYS.has(key as BiologicalMeasureKey)) {
    throw new Error(`type ${id} field ${index} has invalid key: ${key}`);
  }
  return {
    key: key as BiologicalMeasureKey,
    label: requiredString(obj.label, `type ${id} field ${index}.label`),
    required: obj.required === true,
  };
}

function normalizeMeasures(id: string, raw: unknown): BiologicalTypeMeasures {
  const obj = asObject(raw, `type ${id}.measures`);
  const primary = requiredString(obj.primary, `type ${id}.measures.primary`);
  if (!ENTITY_KEYS.has(primary) && !['mass'].includes(primary)) {
    throw new Error(`type ${id}.measures.primary invalid: ${primary}`);
  }
  const units = stringArray(obj.units, `type ${id}.measures.units`);
  if (units.length === 0) {
    throw new Error(`type ${id}.measures.units must be non-empty`);
  }
  const concentrationBasis = requiredString(obj.concentrationBasis, `type ${id}.measures.concentrationBasis`);
  const alternative = stringArray(obj.alternative, `type ${id}.measures.alternative`);
  return {
    primary: primary as BiologicalMeasurePrimary,
    units,
    concentrationBasis,
    ...(alternative.length > 0 ? { alternative } : {}),
  };
}

function normalizeVerification(raw: unknown): BiologicalTypeVerification | undefined {
  if (raw === undefined) return undefined;
  const obj = asObject(raw, 'verification');
  const method = optionalString(obj.method, 'verification.method');
  const readModality = optionalString(obj.readModality, 'verification.readModality');
  // Declarative honesty: a verification mechanism is only as good as HOW it is
  // read. If a type declares a verification, it MUST declare the read modality
  // (data, not a TS guess). Fail loudly rather than silently default.
  if (method && !readModality) {
    throw new Error('verification.method declared without verification.readModality (declare it in the registry)');
  }
  const out: BiologicalTypeVerification = {};
  if (method) out.method = method;
  if (readModality) out.readModality = readModality;
  return out;
}

function normalizeSeedVocab<T extends { label: string; id: string; aliases: string[] }>(
  rawArr: unknown,
  key: string,
  map: (obj: Record<string, unknown>, label: string) => Record<string, unknown>,
): T[] {
  if (rawArr === undefined) return [];
  if (!Array.isArray(rawArr)) throw new Error(`biological types registry ${key} must be an array`);
  return rawArr.map((raw, i) => {
    const obj = asObject(raw, `${key}[${i}]`);
    const label = requiredString(obj.label, `${key}[${i}].label`);
    const id = localTermIdForLabel(label);
    const aliases = stringArray(obj.aliases, `${key}[${i}].aliases`);
    return { label, id, aliases, ...map(obj, label) } as T;
  });
}

function normalizeOrganisms(raw: unknown): BiologicalOrganismSeed[] {
  return normalizeSeedVocab<BiologicalOrganismSeed>(raw, 'organisms', (obj, label) => {
    const curie = optionalString(obj.curie, `organisms (${label}).curie`);
    const domain = optionalString(obj.domain, `organisms (${label}).domain`);
    return {
      ...(curie ? { curie } : {}),
      ...(domain ? { domain } : {}),
    };
  });
}

function normalizeStrains(raw: unknown): BiologicalStrainSeed[] {
  return normalizeSeedVocab<BiologicalStrainSeed>(raw, 'strains', (obj, label) => ({
    strain: requiredString(obj.strain, `strains (${label}).strain`),
    species: requiredString(obj.species, `strains (${label}).species`),
  }));
}

function normalizeConditions(raw: unknown): BiologicalConditionSeed[] {
  return normalizeSeedVocab<BiologicalConditionSeed>(raw, 'conditions', () => ({}));
}

function normalizeType(id: string, raw: unknown, isDefault: boolean): BiologicalTypeRule {
  const obj = asObject(raw, `type ${id}`);
  const domains = stringArray(obj.domains, `type ${id}.domains`);
  for (const d of domains) {
    if (!DOMAINS.has(d)) throw new Error(`type ${id} has invalid domain: ${d}`);
  }
  const termKinds = stringArray(obj.termKinds, `type ${id}.termKinds`);
  for (const k of termKinds) {
    if (!TERM_KINDS.has(k)) throw new Error(`type ${id} has invalid termKind: ${k}`);
  }
  const matchObj = isDefault ? {} : asObject(obj.match, `type ${id}.match`);
  const labels = isDefault ? [] : stringArray(matchObj.labels, `type ${id}.match.labels`);
  const curies = isDefault ? [] : stringArray(matchObj.curies, `type ${id}.match.curies`);
  const measures = normalizeMeasures(id, obj.measures ?? { primary: 'count', units: [], concentrationBasis: '' });
  // measures must have been filled; for default we still require primary count/basis.
  if (!Array.isArray(obj.fields) || obj.fields.length === 0) {
    throw new Error(`type ${id}.fields must be a non-empty array`);
  }
  const fields = obj.fields.map((field, index) => normalizeField(id, index, field));
  const verification = normalizeVerification(obj.verification);
  return {
    id,
    label: requiredString(obj.label, `type ${id}.label`),
    domains,
    termKinds,
    match: { labels, curies },
    measures,
    ...(verification ? { verification } : {}),
    fields,
  };
}

/** Normalize the default rule (no match basket, required count+volume). */
function normalizeDefault(raw: unknown): BiologicalTypeRule {
  const rule = normalizeType('default', raw, true);
  const hasCount = rule.fields.some((f) => f.key === 'count' && f.required);
  const hasVolume = rule.fields.some((f) => f.key === 'volume' && f.required);
  if (!hasCount || !hasVolume) {
    throw new Error('default biological type must require count + volume');
  }
  return rule;
}

function normalize(v: unknown): BiologicalTypesRegistryDocument {
  const obj = asObject(v, 'biological types registry');
  if (obj.version !== 1) throw new Error('biological types registry version must be 1');
  const defaultRule = normalizeDefault(obj.default ?? {});
  const typesObj = asObject(obj.types ?? {}, 'biological types registry types');
  const types: Record<string, BiologicalTypeRule> = {};
  for (const [id, raw] of Object.entries(typesObj)) {
    types[id] = normalizeType(id, raw, false);
  }
  return {
    version: 1,
    ...(typeof obj.title === 'string' ? { title: obj.title } : {}),
    ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
    default: defaultRule,
    types,
    organisms: normalizeOrganisms(obj.organisms),
    strains: normalizeStrains(obj.strains),
    conditions: normalizeConditions(obj.conditions),
  };
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export class BiologicalTypesRegistry {
  constructor(private readonly doc: BiologicalTypesRegistryDocument) {}

  list(): BiologicalTypeRule[] {
    return [structuredClone(this.doc.default), ...Object.values(this.doc.types).map((t) => structuredClone(t))];
  }

  get(typeId: string): BiologicalTypeRule | null {
    const found = this.doc.types[typeId];
    return found ? structuredClone(found) : null;
  }

  defaultRule(): BiologicalTypeRule {
    return structuredClone(this.doc.default);
  }

  organisms(): BiologicalOrganismSeed[] {
    return structuredClone(this.doc.organisms);
  }

  strains(): BiologicalStrainSeed[] {
    return structuredClone(this.doc.strains);
  }

  conditions(): BiologicalConditionSeed[] {
    return structuredClone(this.doc.conditions);
  }

  /**
   * Resolve the measure rule for a biological selection. Per D4, the coarse
   * domain gates biological-vs-chemical; the SPECIFIC organism/type term picks
   * the rule, and an unknown biological type falls back to the generic default
   * (count + final volume). Precedence:
   *   1. label/curie match against a type's match basket
   *   2. domain === 'cell_line' → the cell-line rule (all cell lines count+volume)
   *   3. generic default
   */
  lookup(input: BiologicalTypeLookupInput): BiologicalTypeRule {
    const label = norm(input.label);
    const curie = norm(input.curie);
    const domain = norm(input.domain);
    const all = [...Object.values(this.doc.types)];
    if (label || curie) {
      for (const rule of all) {
        const labelHit = label && rule.match.labels.some((l) => norm(l).includes(label) || label.includes(norm(l)));
        const curieHit = curie && rule.match.curies.some((c) => norm(c).includes(curie) || curie.includes(norm(c)));
        if (labelHit || curieHit) return structuredClone(rule);
      }
    }
    if (domain === 'cell_line') {
      const cellLine = all.find((rule) => rule.domains.includes('cell_line'));
      if (cellLine) return structuredClone(cellLine);
    }
    return structuredClone(this.doc.default);
  }

  toJSON(): BiologicalTypesRegistryDocument {
    return structuredClone(this.doc);
  }
}

export function loadBiologicalTypesRegistry(path: string): BiologicalTypesRegistry {
  const parsed = parse(readFileSync(path, 'utf8')) as unknown;
  return new BiologicalTypesRegistry(normalize(parsed));
}

export function loadDefaultBiologicalTypesRegistry(schemaDir: string): BiologicalTypesRegistry {
  return loadBiologicalTypesRegistry(resolve(schemaDir, 'registry/biological-types/biological-types.yaml'));
}

/** Coarse gate: is this material domain a biological/count-based type? */
export function isBiologicalDomain(domain: string | undefined): boolean {
  return domain === 'cell_line' || domain === 'organism';
}