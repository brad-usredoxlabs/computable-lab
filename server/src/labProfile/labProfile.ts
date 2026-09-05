/**
 * LabProfile — declarative lab identity registry (phase 1, Task 1.1).
 *
 * "THIS lab" — the single declarative identity the AI resident context and
 * corpus training ground on: the namespace the user edits in Settings, the
 * local ontology CURIE prefix, and refs into the existing registries
 * (instruments / protocols / reagents). Data lives in
 * schema/registry/lab-profile/lab-profile.yaml; this module only loads +
 * interprets it (no hardcoded TS rules — repo rule #1).
 *
 * The YAML `namespace` block mirrors the repository namespace the user edits
 * in Settings. The live repo config (config.yaml → repositories[].namespace)
 * is authoritative: mergeNamespace() makes config win over the registry
 * default, deterministically.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface LabRef {
  kind: 'record';
  id: string;
  type: string;
}

export interface LabRefEntry {
  label: string;
  ref: LabRef;
}

export interface LabNamespace {
  baseUri: string;
  prefix: string;
}

export interface LabProfileBody {
  label: string;
  namespace: LabNamespace;
  ontologyNamespace: string;
  instruments: LabRefEntry[];
  protocols: LabRefEntry[];
  reagents: LabRefEntry[];
}

export interface LabProfile {
  version: number;
  title?: string;
  description?: string;
  profile: LabProfileBody;
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

function normalizeRef(raw: unknown, context: string): LabRef {
  const obj = asObject(raw, context);
  const kind = requiredString(obj.kind, `${context}.kind`);
  if (kind !== 'record') {
    throw new Error(`${context}.kind must be 'record'`);
  }
  return {
    kind: 'record',
    id: requiredString(obj.id, `${context}.id`),
    type: requiredString(obj.type, `${context}.type`),
  };
}

function normalizeRefEntries(raw: unknown, context: string): LabRefEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`${context} must be an array`);
  return raw.map((entry, i) => {
    const obj = asObject(entry, `${context}[${i}]`);
    return {
      label: requiredString(obj.label, `${context}[${i}].label`),
      ref: normalizeRef(obj.ref, `${context}[${i}].ref`),
    };
  });
}

function normalizeNamespace(raw: unknown, context: string): LabNamespace {
  const obj = asObject(raw, context);
  return {
    baseUri: requiredString(obj.baseUri, `${context}.baseUri`),
    prefix: requiredString(obj.prefix, `${context}.prefix`),
  };
}

function normalize(v: unknown): LabProfile {
  const obj = asObject(v, 'lab profile registry');
  if (obj.version !== 1) throw new Error('lab profile registry version must be 1');
  const profileObj = asObject(obj.profile, 'profile');
  const namespace = normalizeNamespace(profileObj.namespace, 'profile.namespace');
  const profile: LabProfileBody = {
    label: requiredString(profileObj.label, 'profile.label'),
    namespace,
    ontologyNamespace: requiredString(profileObj.ontologyNamespace, 'profile.ontologyNamespace'),
    instruments: normalizeRefEntries(profileObj.instruments, 'profile.instruments'),
    protocols: normalizeRefEntries(profileObj.protocols, 'profile.protocols'),
    reagents: normalizeRefEntries(profileObj.reagents, 'profile.reagents'),
  };
  return {
    version: 1,
    ...(typeof obj.title === 'string' ? { title: obj.title } : {}),
    ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
    profile,
  };
}

/**
 * Prefer the live repository namespace (Settings-edited, config.yaml) over the
 * registry default. Pure: never mutates the input profile; returns a new copy.
 * Pass `null`/undefined repoNamespace to keep the registry value.
 */
export function mergeNamespace(
  profile: LabProfile,
  repoNamespace: { baseUri: string; prefix: string } | null | undefined,
): LabProfile {
  const merged = structuredClone(profile);
  if (repoNamespace && typeof repoNamespace.baseUri === 'string' && typeof repoNamespace.prefix === 'string') {
    merged.profile.namespace = {
      baseUri: repoNamespace.baseUri,
      prefix: repoNamespace.prefix,
    };
  }
  return merged;
}

export function loadLabProfile(path: string): LabProfile {
  const parsed = parse(readFileSync(path, 'utf8')) as unknown;
  return normalize(parsed);
}

export function loadDefaultLabProfile(schemaDir: string): LabProfile {
  return loadLabProfile(resolve(schemaDir, 'registry/lab-profile/lab-profile.yaml'));
}