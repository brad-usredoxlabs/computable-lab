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
import type { SurfaceId } from '../surfaceContext/SurfaceContext.js';

export interface SurfaceSpec {
  id: SurfaceId;
  label: string;
  path: string;
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
  const id = requiredString(obj.id, `surfaces[${index}].id`);
  if (id && !['project', 'run-plan', 'run-design', 'run-execute', 'results', 'analysis', 'knowledge', 'find'].includes(id)) {
    throw new Error(`surfaces[${index}].id invalid: ${id}`);
  }
  const aiRole = obj.aiRole;
  const spec: SurfaceSpec = {
    id: id as SurfaceId,
    label: requiredString(obj.label, `surfaces[${index}].label`),
    path: requiredString(obj.path, `surfaces[${index}].path`),
    objectTypes: stringArray(obj.objectTypes, `surfaces[${index}].objectTypes`),
    selectableKinds: stringArray(obj.selectableKinds, `surfaces[${index}].selectableKinds`),
  };
  if (typeof aiRole === 'string' && aiRole.trim().length > 0) {
    spec.aiRole = aiRole.trim();
  }
  return spec;
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
  return new SurfacesRegistry(normalize(parsed));
}

export function loadDefaultSurfacesRegistry(schemaDir: string): SurfacesRegistry {
  return loadSurfacesRegistry(resolve(schemaDir, 'registry/surfaces/surfaces.yaml'));
}