/**
 * SpecSheetFieldMaps — Loader for spec-sheet field maps.
 *
 * Reads schema/ingestion/spec-sheet.*.yaml files once (module-level cache),
 * keyed by each file's target `recordKind`. No field names in this module;
 * all strings live only in the YAML data files.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface FieldMapping {
  targetField: string;
  source: string;
  transform?: string;
  unit?: string;
  required?: boolean;
}

export interface SpecSheetFieldMap {
  recordKind: string;
  fieldMappings: FieldMapping[];
}

/** Module-level cache: recordKind → field map */
let cache: Map<string, SpecSheetFieldMap> | null = null;

/**
 * Load all spec-sheet YAML files from schema/ingestion/spec-sheet.*.yaml.
 * Returns a map keyed by recordKind.
 */
async function loadFieldMaps(): Promise<Map<string, SpecSheetFieldMap>> {
  const schemaDir = join(__dirname, '../../../schema/ingestion');
  const entries = await readdir(schemaDir);
  const results = new Map<string, SpecSheetFieldMap>();

  for (const filename of entries) {
    if (!filename.startsWith('spec-sheet.') || !filename.endsWith('.yaml')) continue;
    const filePath = join(schemaDir, filename);
    const raw = await readFile(filePath, 'utf-8');
    const doc = parseYaml(raw) as { targets?: Array<{ recordKind?: string; fieldMappings?: FieldMapping[] }> };

    if (!doc.targets || doc.targets.length === 0) continue;
    const target = doc.targets[0];
    if (!target) continue;
    if (!target.recordKind) continue;

    results.set(target.recordKind, {
      recordKind: target.recordKind,
      fieldMappings: target.fieldMappings ?? [],
    });
  }

  return results;
}

/**
 * Reload the cache from disk. Call this in tests after swapping data, or to
 * pick up new spec-sheet files without restarting.
 */
export async function reload(): Promise<void> {
  cache = await loadFieldMaps();
}

/**
 * Get the field map for a given record kind.
 * Throws naming the type when no map exists.
 */
export async function getSpecSheetFieldMap(recordKind: string): Promise<SpecSheetFieldMap> {
  if (!cache) {
    cache = await loadFieldMaps();
  }
  const map = cache.get(recordKind);
  if (!map) {
    throw new Error(`[spec-sheet] no field map for record type "${recordKind}"`);
  }
  return map;
}

/**
 * List all known record kinds that have a spec-sheet field map.
 */
export async function listSpecSheetFieldMaps(): Promise<string[]> {
  if (!cache) {
    cache = await loadFieldMaps();
  }
  return [...cache.keys()];
}
