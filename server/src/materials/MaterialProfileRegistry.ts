import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export type MaterialProfileLayer = 'concept' | 'formulation' | 'instance';
export type MaterialProfileControl =
  | 'app-owned'
  | 'free-text'
  | 'ontology-ref'
  | 'local-material-required'
  | 'record-ref';

export interface MaterialProfileField {
  path: string;
  label: string;
  widget: string;
  layer: MaterialProfileLayer;
  required: boolean;
  control: MaterialProfileControl;
  default?: unknown;
  ontologies: string[];
}

export interface MaterialProfileAppliesWhen {
  domain?: string[];
  formulation_kind?: string[];
}

/**
 * Per-TYPE clarification overrides. The same layer owes different things in
 * different domains: a chemical is dosed (concentration + volume), a cell line is
 * counted (a count, and volume is legitimately zero once the medium is
 * aspirated). Declared here so code never decides it.
 */
export type MaterialClarificationOverride = Partial<
  Record<ClarificationLayerId, Partial<MaterialClarificationLayer>>
>;

export interface MaterialProfile {
  id: string;
  label: string;
  applies_when: MaterialProfileAppliesWhen;
  layers: MaterialProfileLayer[];
  fields: MaterialProfileField[];
  quick_add: string[];
  clarification?: MaterialClarificationOverride;
}

/** The ref-layer ids the material gate/AI use, end to end (one vocabulary). */
export type ClarificationLayerId =
  | 'material'
  | 'material-spec'
  | 'material-instance'
  | 'aliquot'
  | 'vendor-product';

/**
 * Declarative policy for ONE layer of a material clarification: how to say it to
 * the biologist, which add_material details field an answer is written into, and
 * what the add still owes once that layer is chosen.
 *
 * This is data on purpose: the layers are a provenance hierarchy, and code must
 * not decide in TS what "a prepared solution still needs a volume" means.
 */
export interface MaterialClarificationLayer {
  /** The layer in the biologist's words ("the prepared solution"). */
  label: string;
  /** Canonical add_material details field for a pick at this layer. */
  field: string;
  /** Question template; `{label}` is replaced with the material's name. */
  question: string;
  /** details keys still owed after this layer is chosen ('[]' = well-formed). */
  requires: string[];
}

export interface MaterialClarificationPolicy {
  layers: Partial<Record<ClarificationLayerId, MaterialClarificationLayer>>;
}

export interface MaterialProfileRegistryDocument {
  version: number;
  title?: string;
  description?: string;
  clarification?: MaterialClarificationPolicy;
  profiles: MaterialProfile[];
}

export interface MaterialProfileLookupInput {
  domain?: string;
  formulationKind?: string;
}

const VALID_CONTROLS = new Set<MaterialProfileControl>([
  'app-owned',
  'free-text',
  'ontology-ref',
  'local-material-required',
  'record-ref',
]);
const VALID_LAYERS = new Set<MaterialProfileLayer>(['concept', 'formulation', 'instance']);

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

function normalizeField(profileId: string, index: number, raw: unknown): MaterialProfileField {
  const obj = asObject(raw, `profile ${profileId} field ${index}`);
  const layer = requiredString(obj.layer, `profile ${profileId} field ${index}.layer`);
  if (!VALID_LAYERS.has(layer as MaterialProfileLayer)) {
    throw new Error(`profile ${profileId} field ${index} has invalid layer: ${layer}`);
  }
  const control = requiredString(obj.control, `profile ${profileId} field ${index}.control`);
  if (!VALID_CONTROLS.has(control as MaterialProfileControl)) {
    throw new Error(`profile ${profileId} field ${index} has invalid control: ${control}`);
  }
  return {
    path: requiredString(obj.path, `profile ${profileId} field ${index}.path`),
    label: requiredString(obj.label, `profile ${profileId} field ${index}.label`),
    widget: requiredString(obj.widget, `profile ${profileId} field ${index}.widget`),
    layer: layer as MaterialProfileLayer,
    required: obj.required === true,
    control: control as MaterialProfileControl,
    ...(obj.default !== undefined ? { default: obj.default } : {}),
    ontologies: stringArray(obj.ontologies, `profile ${profileId} field ${index}.ontologies`),
  };
}

function normalizeAppliesWhen(profileId: string, raw: unknown): MaterialProfileAppliesWhen {
  const obj = asObject(raw, `profile ${profileId}.applies_when`);
  const domain = stringArray(obj.domain, `profile ${profileId}.applies_when.domain`);
  const formulationKind = stringArray(obj.formulation_kind, `profile ${profileId}.applies_when.formulation_kind`);
  if (domain.length === 0 && formulationKind.length === 0) {
    throw new Error(`profile ${profileId}.applies_when must define domain or formulation_kind`);
  }
  return {
    ...(domain.length > 0 ? { domain } : {}),
    ...(formulationKind.length > 0 ? { formulation_kind: formulationKind } : {}),
  };
}

function normalizeProfile(id: string, raw: unknown): MaterialProfile {
  const obj = asObject(raw, `profile ${id}`);
  const layers = stringArray(obj.layers, `profile ${id}.layers`);
  for (const layer of layers) {
    if (!VALID_LAYERS.has(layer as MaterialProfileLayer)) {
      throw new Error(`profile ${id} has invalid layer: ${layer}`);
    }
  }
  if (!Array.isArray(obj.fields) || obj.fields.length === 0) {
    throw new Error(`profile ${id}.fields must be a non-empty array`);
  }
  const fields = obj.fields.map((field, index) => normalizeField(id, index, field));
  const layerSet = new Set(layers);
  for (const field of fields) {
    if (!layerSet.has(field.layer)) {
      throw new Error(`profile ${id} field ${field.path} uses layer ${field.layer} not declared in layers`);
    }
  }
  const clarification = obj.clarification === undefined ? undefined : normalizeClarificationOverride(obj.clarification, id);
  const quickAdd = stringArray(obj.quick_add, `profile ${id}.quick_add`);
  const fieldPaths = new Set(fields.map((field) => field.path));
  for (const path of quickAdd) {
    if (!fieldPaths.has(path)) {
      throw new Error(`profile ${id}.quick_add references unknown field ${path}`);
    }
  }
  return {
    id,
    label: requiredString(obj.label, `profile ${id}.label`),
    applies_when: normalizeAppliesWhen(id, obj.applies_when),
    layers: layers as MaterialProfileLayer[],
    fields,
    quick_add: quickAdd,
    ...(clarification ? { clarification } : {}),
  };
}

export class MaterialProfileRegistry {
  private readonly clarification: MaterialClarificationPolicy;

  private readonly profilesById: Map<string, MaterialProfile>;

  constructor(private readonly doc: MaterialProfileRegistryDocument) {
    this.profilesById = new Map(doc.profiles.map((profile) => [profile.id, profile]));
    this.clarification = doc.clarification ?? { layers: {} };
  }

  /** The declared clarification policy (empty when the registry declares none). */
  clarificationPolicy(): MaterialClarificationPolicy {
    return structuredClone(this.clarification);
  }

  /** The policy for one layer, or null when the registry does not declare it. */
  clarificationForLayer(layer: ClarificationLayerId, profileId?: string): MaterialClarificationLayer | null {
    const override = profileId ? this.profilesById.get(profileId)?.clarification?.[layer] : undefined;
    const base = this.clarification.layers[layer];
    if (!base && !override) return null;
    return structuredClone({ ...(base ?? { label: '', field: '', question: '', requires: [] }), ...(override ?? {}) });
  }

  /**
   * The requirements for a layer IN A TYPE. A cell line's concept layer owes a
   * count; a chemical's owes a concentration and a volume. Overrides are data
   * (the profile's own `clarification:` block); this only resolves them.
   */
  requirementsForLayerInProfile(layer: ClarificationLayerId, profileId?: string): string[] | null {
    const resolved = this.clarificationForLayer(layer, profileId);
    return resolved ? [...resolved.requires] : null;
  }

  /**
   * The profile that governs a domain (e.g. 'cell_line'), or null when the
   * registry does not declare one.
   */
  profileForDomain(domain: string | undefined): MaterialProfile | null {
    const wanted = domain?.trim();
    if (!wanted) return null;
    const found = this.list().find((profile) => profile.applies_when.domain?.includes(wanted));
    return found ?? null;
  }

  /**
   * The `requires` list for a layer — what the add still owes after a pick.
   * Unknown layers return null so the caller can fall back rather than guess.
   */
  requirementsForLayer(layer: ClarificationLayerId, profileId?: string): string[] | null {
    return this.requirementsForLayerInProfile(layer, profileId);
  }

  list(): MaterialProfile[] {
    return [...this.profilesById.values()].map((profile) => structuredClone(profile));
  }

  get(profileId: string): MaterialProfile | null {
    const profile = this.profilesById.get(profileId);
    return profile ? structuredClone(profile) : null;
  }

  lookup(input: MaterialProfileLookupInput): MaterialProfile {
    const domain = input.domain?.trim();
    const formulationKind = input.formulationKind?.trim();
    const exact = this.list().find((profile) => {
      const applies = profile.applies_when;
      const domainOk = !applies.domain || (domain ? applies.domain.includes(domain) : false);
      const formulationOk = !applies.formulation_kind || (formulationKind ? applies.formulation_kind.includes(formulationKind) : false);
      return domainOk && formulationOk;
    });
    if (exact) return exact;
    if (domain) {
      const domainOnly = this.list().find((profile) => profile.applies_when.domain?.includes(domain));
      if (domainOnly) return domainOnly;
    }
    return this.get('other') ?? this.list()[0]!;
  }

  toJSON(): MaterialProfileRegistryDocument {
    return structuredClone(this.doc);
  }
}

function normalizeClarificationLayer(
  layerId: string,
  raw: unknown,
): MaterialClarificationLayer {
  const obj = asObject(raw, `clarification.layers.${layerId}`);
  return {
    label: requiredString(obj.label, `clarification.layers.${layerId}.label`),
    field: requiredString(obj.field, `clarification.layers.${layerId}.field`),
    question: requiredString(obj.question, `clarification.layers.${layerId}.question`),
    requires: stringArray(obj.requires, `clarification.layers.${layerId}.requires`),
  };
}

function normalizeClarificationOverride(raw: unknown, profileId: string): MaterialClarificationOverride {
  const obj = asObject(raw, `profile ${profileId}.clarification`);
  const out: MaterialClarificationOverride = {};
  for (const [layerId, entry] of Object.entries(obj)) {
    const layer = asObject(entry, `profile ${profileId}.clarification.${layerId}`);
    out[layerId as ClarificationLayerId] = {
      ...(layer.label === undefined ? {} : { label: requiredString(layer.label, `profile ${profileId}.clarification.${layerId}.label`) }),
      ...(layer.field === undefined ? {} : { field: requiredString(layer.field, `profile ${profileId}.clarification.${layerId}.field`) }),
      ...(layer.question === undefined ? {} : { question: requiredString(layer.question, `profile ${profileId}.clarification.${layerId}.question`) }),
      requires: stringArray(layer.requires, `profile ${profileId}.clarification.${layerId}.requires`),
    };
  }
  return out;
}

function normalizeClarification(raw: unknown): MaterialClarificationPolicy {
  if (raw === undefined) return { layers: {} };
  const obj = asObject(raw, 'clarification');
  const layersObj = asObject(obj.layers, 'clarification.layers');
  const layers: Partial<Record<ClarificationLayerId, MaterialClarificationLayer>> = {};
  for (const [layerId, entry] of Object.entries(layersObj)) {
    const normalized = layerId.trim() as ClarificationLayerId;
    layers[normalized] = normalizeClarificationLayer(layerId, entry);
  }
  return { layers };
}

export function loadMaterialProfileRegistry(path: string): MaterialProfileRegistry {
  const parsed = parse(readFileSync(path, 'utf8')) as unknown;
  const obj = asObject(parsed, 'material profile registry');
  if (obj.version !== 1) throw new Error('material profile registry version must be 1');
  const profilesObj = asObject(obj.profiles, 'material profile registry profiles');
  const profiles = Object.entries(profilesObj).map(([id, profile]) => normalizeProfile(id, profile));
  const ids = new Set(profiles.map((profile) => profile.id));
  for (const expected of ['chemical', 'cell_line', 'media_composition', 'single_active_formulation', 'sample', 'other']) {
    if (!ids.has(expected)) throw new Error(`material profile registry missing v1 profile: ${expected}`);
  }
  return new MaterialProfileRegistry({
    version: 1,
    ...(typeof obj.title === 'string' ? { title: obj.title } : {}),
    ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
    clarification: normalizeClarification(obj.clarification),
    profiles,
  });
}

export function loadDefaultMaterialProfileRegistry(schemaDir: string): MaterialProfileRegistry {
  return loadMaterialProfileRegistry(resolve(schemaDir, 'lab/material-profile.registry.yaml'));
}
