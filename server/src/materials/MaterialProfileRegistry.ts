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

export interface MaterialProfile {
  id: string;
  label: string;
  applies_when: MaterialProfileAppliesWhen;
  layers: MaterialProfileLayer[];
  fields: MaterialProfileField[];
  quick_add: string[];
}

export interface MaterialProfileRegistryDocument {
  version: number;
  title?: string;
  description?: string;
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
  };
}

export class MaterialProfileRegistry {
  private readonly profilesById: Map<string, MaterialProfile>;

  constructor(private readonly doc: MaterialProfileRegistryDocument) {
    this.profilesById = new Map(doc.profiles.map((profile) => [profile.id, profile]));
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
    profiles,
  });
}

export function loadDefaultMaterialProfileRegistry(schemaDir: string): MaterialProfileRegistry {
  return loadMaterialProfileRegistry(resolve(schemaDir, 'lab/material-profile.registry.yaml'));
}
