/**
 * VerbActionMapRegistry — single-file YAML reader for verb→ontology mappings.
 *
 * Loads `schema/registry/verb-action-map.yaml` once at construction, validates
 * with Zod, and exposes a singleton accessor with `lookup(verb)` and `list()`.
 *
 * This is NOT an aggregate-file registry — it reads exactly one YAML document.
 */

import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const VerbMappingSchema = z.object({
  verb: z.string(),
  exact_id: z.string().optional(),
  obi_id: z.string().optional(),
  notes: z.string().optional(),
});

export type VerbMapping = z.infer<typeof VerbMappingSchema>;

export const VerbActionMapSchema = z.object({
  kind: z.literal('verb-action-map'),
  mappings: z.array(VerbMappingSchema),
});

export type VerbActionMap = z.infer<typeof VerbActionMapSchema>;

// ---------------------------------------------------------------------------
// Singleton loader
// ---------------------------------------------------------------------------

const YAML_PATH = resolve(__dirname, '../../../schema/registry/verb-action-map.yaml');

let _cached: VerbActionMap | null = null;

/**
 * Parse and validate the verb-action-map YAML file.
 */
function loadVerbActionMap(): VerbActionMap {
  const raw = readFileSync(YAML_PATH, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  const validated = VerbActionMapSchema.parse(parsed);
  return validated;
}

/**
 * Return the singleton verb-action-map registry.
 */
export function getVerbActionMap(): VerbActionMapRegistry {
  if (!_cached) {
    _cached = loadVerbActionMap();
  }
  return new VerbActionMapRegistry(_cached);
}

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

/**
 * In-memory registry of verb→ontology mappings.
 */
export class VerbActionMapRegistry {
  private readonly mappings: VerbMapping[];
  private readonly verbIndex: Map<string, VerbMapping>;

  constructor(map: VerbActionMap) {
    this.mappings = map.mappings;
    this.verbIndex = new Map(map.mappings.map((m) => [m.verb, m]));
  }

  /**
   * Look up a mapping by verb name (case-sensitive).
   * Returns undefined if the verb is not found.
   */
  lookup(verb: string): VerbMapping | undefined {
    return this.verbIndex.get(verb);
  }

  /**
   * Return all mappings.
   */
  list(): VerbMapping[] {
    return this.mappings;
  }

  /**
   * Return the number of mappings.
   */
  size(): number {
    return this.mappings.length;
  }
}
