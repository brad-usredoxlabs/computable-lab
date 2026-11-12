/**
 * labwareType -> ontology-class binding — the only reader of the ontology repo's
 * shipped bindings file (clause O4). config/ontology-bindings.yaml names the data
 * file, the source id (also the per-entry field holding the class CURIE) and the
 * map key; CURIEs come from that data file, never from TS. A missing file is a
 * NAMED error unless `strict: false`, which answers null and reports the path.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../../../../config/ontology-bindings.yaml', import.meta.url),
);

type LabwareTypeBindingConfig = { version: string; path: string; source_id: string; map_key: string };

export interface LabwareTypeBinding {
  labwareType: string;
  /** CURIE exactly as the data file writes it, or null when the data says null. */
  lwoClass: string | null;
  note?: string;
}

export interface LabwareTypeBindingReport {
  configPath: string;
  bindingsPath: string;
  sourceId: string;
  mapKey: string;
  entries: LabwareTypeBinding[];
  /** One named entry per failed load; empty on success. */
  failures: Array<{ path: string; error: string }>;
}

export interface LabwareTypeBindingOptions {
  configPath?: string;
  /** Overrides the registry's data path (negative cases, alternate snapshots). */
  bindingsPath?: string;
  /** Default true: throw a named error instead of returning an empty map. */
  strict?: boolean;
}

const reportCache = new Map<string, LabwareTypeBindingReport>();

const named = (what: string, err: unknown): Error => {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`ontology bindings ${what}: ${message}`);
};

function readConfig(configPath: string): LabwareTypeBindingConfig {
  let doc: unknown;
  try {
    doc = parseYaml(readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw named(`config "${configPath}"`, err);
  }
  const record = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  for (const key of ['version', 'path', 'source_id', 'map_key'] as const) {
    if (typeof record[key] !== 'string' || (record[key] as string).length === 0) {
      throw new Error(`ontology bindings config "${configPath}": missing "${key}"`);
    }
  }
  return record as unknown as LabwareTypeBindingConfig;
}

function buildReport(configPath: string, config: LabwareTypeBindingConfig, bindingsPath: string): LabwareTypeBindingReport {
  let doc: unknown;
  try {
    doc = parseYaml(readFileSync(bindingsPath, 'utf8'));
  } catch (err) {
    throw named(`"${bindingsPath}"`, err);
  }
  const map = ((doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>)[config.map_key];
  if (!map || typeof map !== 'object') {
    throw new Error(`ontology bindings "${bindingsPath}": no "${config.map_key}" map`);
  }
  const entries = Object.entries(map as Record<string, unknown>).map(([labwareType, row]) => {
    const entry = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const raw = entry[config.source_id];
    const note = typeof entry.note === 'string' ? entry.note.trim() : undefined;
    return {
      labwareType,
      lwoClass: typeof raw === 'string' && raw.length > 0 ? raw : null,
      ...(note ? { note } : {}),
    };
  });
  return { configPath, bindingsPath, sourceId: config.source_id, mapKey: config.map_key, entries, failures: [] };
}

/** Read config + bindings; a report with per-key entries and named failures. */
export function loadLabwareTypeBindings(
  options: LabwareTypeBindingOptions = {},
): LabwareTypeBindingReport {
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  let bindingsPath = options.bindingsPath ?? '';
  try {
    const config = readConfig(configPath);
    bindingsPath = options.bindingsPath ?? config.path;
    const cacheKey = `${configPath}\u0000${bindingsPath}`;
    const cached = reportCache.get(cacheKey);
    if (cached) return cached;
    const report = buildReport(configPath, config, bindingsPath);
    reportCache.set(cacheKey, report);
    return report;
  } catch (err) {
    if (options.strict ?? true) throw err instanceof Error ? err : new Error(String(err));
    const namedPath = bindingsPath || configPath;
    return {
      configPath, bindingsPath: namedPath, sourceId: '', mapKey: '', entries: [],
      failures: [{ path: namedPath, error: err instanceof Error ? err.message : String(err) }],
    };
  }
}

/** Exact-match lookup; unknown types answer null (never a fuzzy near-key). */
export function lookupLabwareClass(
  labwareType: string,
  options: LabwareTypeBindingOptions = {},
): LabwareTypeBinding | null {
  const key = labwareType.trim();
  const { entries } = loadLabwareTypeBindings(options);
  return entries.find((entry) => entry.labwareType === key) ?? null;
}
