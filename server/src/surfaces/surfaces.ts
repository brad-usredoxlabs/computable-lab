/**
 * Surfaces — declarative work-surface registry (phase 2, Task 2.2).
 *
 * Every navigable work surface is DECLARED in schema/registry/surfaces
 * (surfaces.yaml), never hardcoded (repo rule #1). This module only loads +
 * interprets it. `getSurface`/`list` drive the SurfaceContext goal: the AI and
 * corpus both ground "where am I" on this registry.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { SurfaceId } from '../surfaceContext/SurfaceContext.js';

export interface SurfaceSpec {
  id: SurfaceId;
  label: string;
  path: string;
  /**
   * `:token` in `path` → the objectType that fills it. PRESENCE makes the
   * surface deep-linkable (see app/src/shared/surfaces/surfaceRoute.ts); a
   * surface without params is an AI-context surface reached through its
   * collection route.
   */
  params?: Record<string, string>;
  objectTypes: string[];
  selectableKinds: string[];
  aiRole?: string;
}

export interface SurfacesDocument {
  version: number;
  title?: string;
  description?: string;
  surfaces: SurfaceSpec[];
}

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function stringArray(value: unknown, context: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)) {
    throw new Error(`${context} must be an array of strings`);
  }
  return value.map((entry) => entry.trim());
}

function normalizeSurface(raw: unknown, index: number): SurfaceSpec {
  const obj = asObject(raw, `surfaces[${index}]`);
  // Membership + shape are enforced by Ajv against
  // schema/registry/surfaces/surfaces.schema.yaml (see assertValidRegistry).
  // There is deliberately NO id allow-list in TypeScript (repo rule #1/#3).
  const id = requiredString(obj.id, `surfaces[${index}].id`);
  const aiRole = obj.aiRole;
  const spec: SurfaceSpec = {
    id: id as SurfaceId,
    label: requiredString(obj.label, `surfaces[${index}].label`),
    path: requiredString(obj.path, `surfaces[${index}].path`),
    objectTypes: stringArray(obj.objectTypes, `surfaces[${index}].objectTypes`),
    selectableKinds: stringArray(obj.selectableKinds, `surfaces[${index}].selectableKinds`),
  };
  if (obj.params !== undefined) {
    const params = asObject(obj.params, `surfaces[${index}].params`);
    const entries = Object.entries(params);
    for (const [token, objectType] of entries) {
      if (!token.trim() || typeof objectType !== 'string' || !objectType.trim()) {
        throw new Error(`surfaces[${index}].params must map a non-empty token → objectType`);
      }
    }
    // Every `:token` in path must be bound, or a route built from this surface
    // would contain an unfilled placeholder.
    const tokens = [...spec.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]);
    const bound = entries.map(([token]) => token).sort();
    if (JSON.stringify([...tokens].sort()) !== JSON.stringify(bound)) {
      throw new Error(
        `surfaces[${index}].params must bind exactly the path tokens [${tokens.join(', ')}] (got [${bound.join(', ')}])`,
      );
    }
    spec.params = Object.fromEntries(entries.map(([token, objectType]) => [token.trim(), (objectType as string).trim()]));
  }
  if (typeof aiRole === 'string' && aiRole.trim().length > 0) {
    spec.aiRole = aiRole.trim();
  }
  return spec;
}

/**
 * Validate the registry document with Ajv against
 * schema/registry/surfaces/surfaces.schema.yaml — the single validation
 * authority (repo rule #3).
 *
 * The schema's `uniqueIds: [id]` rule is implemented below because JSON Schema
 * has no built-in unique-by-field keyword; the declaration stays in the schema
 * so the rule is visible where registry authors look.
 */
function assertValidRegistry(schemaDir: string, doc: unknown): void {
  // Duplicates first, so the most actionable error wins (Ajv's enum error would
  // otherwise mask a copy-paste id).
  const surfaces = (doc as { surfaces?: Array<{ id?: unknown }> }).surfaces ?? [];
  const seen = new Set<unknown>();
  for (const surface of surfaces) {
    if (seen.has(surface.id)) {
      throw new Error(`surfaces registry invalid: duplicate surface id "${String(surface.id)}"`);
    }
    seen.add(surface.id);
  }
  const schemaPath = resolve(schemaDir, 'registry/surfaces/surfaces.schema.yaml');
  const schema = parse(readFileSync(schemaPath, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  if (!ajv.validate(schema, doc)) {
    throw new Error(`surfaces registry invalid: ${ajv.errorsText()}`);
  }
}

function normalize(v: unknown): SurfacesDocument {
  const obj = asObject(v, 'surfaces registry');
  if (obj.version !== 1) throw new Error('surfaces registry version must be 1');
  if (!Array.isArray(obj.surfaces)) throw new Error('surfaces registry must have a surfaces array');
  return {
    version: 1,
    ...(typeof obj.title === 'string' ? { title: obj.title } : {}),
    ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
    surfaces: obj.surfaces.map((s, i) => normalizeSurface(s, i)),
  };
}

export class SurfacesRegistry {
  constructor(private readonly doc: SurfacesDocument) {}

  list(): SurfaceSpec[] {
    return structuredClone(this.doc.surfaces);
  }

  get(id: string): SurfaceSpec | null {
    const found = this.doc.surfaces.find((s) => s.id === id);
    return found ? structuredClone(found) : null;
  }
}

export function loadSurfacesRegistry(path: string): SurfacesRegistry {
  const parsed = parse(readFileSync(path, 'utf8')) as unknown;
  // The sibling schema lives at <schemaDir>/registry/surfaces/…; derive it from
  // the registry path so no caller has to pass the schema dir twice.
  assertValidRegistry(resolve(path, '..', '..', '..'), parsed);
  return new SurfacesRegistry(normalize(parsed));
}

export function loadDefaultSurfacesRegistry(schemaDir: string): SurfacesRegistry {
  return loadSurfacesRegistry(resolve(schemaDir, 'registry/surfaces/surfaces.yaml'));
}