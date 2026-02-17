/**
 * PredicateRegistry — Typed loader and accessor for the predicate registry.
 *
 * Loads predicates.registry.yaml and provides:
 *   - Typed access to predicate entries
 *   - Lookup by ID and family
 *   - Compact markdown formatter for AI prompt injection
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

// ============================================================================
// Types
// ============================================================================

export interface PredicateEntry {
  id: string;
  label: string;
  namespace: string;
  family: string;
  subject_kinds: string[];
  object_kinds: string[];
  description?: string;
}

export interface PredicateFamily {
  name: string;
  description: string;
}

export interface PredicateRegistryData {
  registryVersion: number;
  families: PredicateFamily[];
  predicates: PredicateEntry[];
}

// ============================================================================
// Registry class
// ============================================================================

export class PredicateRegistry {
  private readonly byId: Map<string, PredicateEntry>;
  private readonly byFamily: Map<string, PredicateEntry[]>;
  private readonly families: PredicateFamily[];
  private readonly entries: PredicateEntry[];

  constructor(data: PredicateRegistryData) {
    this.families = data.families;
    this.entries = data.predicates;
    this.byId = new Map();
    this.byFamily = new Map();

    for (const entry of data.predicates) {
      if (this.byId.has(entry.id)) {
        throw new Error(`Duplicate predicate ID in registry: ${entry.id}`);
      }
      this.byId.set(entry.id, entry);

      const familyList = this.byFamily.get(entry.family);
      if (familyList) {
        familyList.push(entry);
      } else {
        this.byFamily.set(entry.family, [entry]);
      }
    }
  }

  /** All predicate entries. */
  getAll(): PredicateEntry[] {
    return this.entries;
  }

  /** Lookup a single predicate by CURIE id. */
  getById(id: string): PredicateEntry | undefined {
    return this.byId.get(id);
  }

  /** All predicates in a given family. */
  getByFamily(family: string): PredicateEntry[] {
    return this.byFamily.get(family) ?? [];
  }

  /** All registered predicate IDs. */
  getAllIds(): string[] {
    return this.entries.map(e => e.id);
  }

  /** Number of predicates in the registry. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Format the registry as compact markdown for AI prompt injection.
   *
   * Groups predicates by family with one line per predicate:
   *   `RO:0002406` — directly activates (protein/gene/chemical → protein/gene/pathway)
   */
  formatForPrompt(): string {
    const sections: string[] = [];

    for (const family of this.families) {
      const predicates = this.getByFamily(family.name);
      if (predicates.length === 0) continue;

      const lines = predicates.map(p => {
        const subj = p.subject_kinds.join('/');
        const obj = p.object_kinds.join('/');
        return `  \`${p.id}\` — ${p.label} (${subj} → ${obj})`;
      });

      sections.push(`**${family.name}**\n${lines.join('\n')}`);
    }

    return sections.join('\n\n');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Load predicate registry from a YAML file on disk.
 */
export function loadPredicateRegistry(filePath: string): PredicateRegistry {
  const content = readFileSync(filePath, 'utf-8');
  const data = parseYaml(content) as PredicateRegistryData;

  if (!data || !Array.isArray(data.predicates)) {
    throw new Error(`Invalid predicate registry: ${filePath}`);
  }

  return new PredicateRegistry(data);
}
