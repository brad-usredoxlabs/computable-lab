/**
 * VerbActionMapRegistry — single-file YAML reader for verb→ontology mappings.
 *
 * Loads `schema/registry/verb-action-map.yaml` once at construction, validates
 * with Zod, and exposes a singleton accessor with `lookup(verb)`, `list()`, and
 * `findVerbForToken(token)`.
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
  synonyms: z.array(z.string()).optional(),
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

  /**
   * Find a verb mapping by token (canonical verb name or synonym).
   * Case-insensitive matching. Returns the first match or undefined.
   */
  findVerbForToken(token: string): { verb: string; exact_id?: string; obi_id?: string; source: 'canonical' | 'synonym' } | undefined {
    const lower = token.toLowerCase();
    for (const entry of this.mappings) {
      if (entry.verb.toLowerCase() === lower) {
        return {
          verb: entry.verb,
          ...(entry.exact_id !== undefined && { exact_id: entry.exact_id }),
          ...(entry.obi_id !== undefined && { obi_id: entry.obi_id }),
          source: 'canonical' as const,
        };
      }
      if (entry.synonyms?.some((s) => s.toLowerCase() === lower)) {
        return {
          verb: entry.verb,
          ...(entry.exact_id !== undefined && { exact_id: entry.exact_id }),
          ...(entry.obi_id !== undefined && { obi_id: entry.obi_id }),
          source: 'synonym' as const,
        };
      }
    }
    return undefined;
  }
}
