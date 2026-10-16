/**
 * KindLifecycleRegistry — Typed loader and accessor for the registry-kind
 * lifecycle coverage file (schema/registry/registry-kinds.registry.yaml).
 *
 * The coverage file is DATA: it declares which plain registry kinds receive
 * the minimal operational lifecycle (QMS7-3, ruling B) and what creates are
 * stamped with. NO kind names live in TypeScript — the create handler asks
 * `entryFor(kind)` and obeys the answer (or does nothing when undeclared).
 *
 * Structure mirrors PredicateRegistry (schema/registry/predicates.registry.yaml
 * + server/src/registry/PredicateRegistry.ts): a versioned YAML data file, a
 * typed class with accessors, and a load-from-disk factory that THROWS on
 * malformed content — an unknown lifecycleId, a defaultState that is not a
 * declared state of that lifecycle, an unknown kind, or a duplicate kind entry
 * all fail the load. server.ts wraps the load in the predicate-registry
 * try/catch (OQ4: warn+continue), so a bad deploy degrades loudly to the
 * no-stamp behavior rather than silently half-applying coverage.
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { LifecycleSpec } from '../lifecycle/types.js';
import type { SchemaEntry } from '../schema/types.js';

// ============================================================================
// Types
// ============================================================================

export interface KindLifecycleEntry {
  kind: string;
  lifecycleId: string;
  defaultState: string;
}

export interface KindLifecycleRegistryData {
  registryVersion: number;
  lifecycleId: string;
  defaultState: string;
  kinds: Array<{ kind: string }>;
}

/**
 * Minimal lifecycle accessor the loader needs. LifecycleEngine satisfies it
 * (isLoaded + specFor); keeping the shape minimal means the loader holds no
 * policy of its own — it only checks the coverage data against declared facts.
 */
export interface LifecycleCoverageSource {
  isLoaded(lifecycleId: string): boolean;
  specFor(lifecycleId: string): LifecycleSpec | undefined;
}

export interface KindLifecycleRegistryDeps {
  lifecycle: LifecycleCoverageSource;
  /** Record kinds known to the schema registry (data-derived, see collectKnownKinds). */
  knownKinds: Set<string>;
}

// ============================================================================
// Registry class
// ============================================================================

export class KindLifecycleRegistry {
  private readonly byKind: Map<string, KindLifecycleEntry>;
  private readonly entries: KindLifecycleEntry[];
  private readonly lifecycleId: string;
  private readonly defaultState: string;

  constructor(data: KindLifecycleRegistryData, deps: KindLifecycleRegistryDeps) {
    if (!data || typeof data.lifecycleId !== 'string' || data.lifecycleId.length === 0 || !Array.isArray(data.kinds)) {
      throw new Error('Invalid registry-kind coverage file: registryVersion/lifecycleId/kinds missing');
    }

    // The referenced lifecycle must actually be loaded (lifecycleId not on disk → fail the load).
    if (!deps.lifecycle.isLoaded(data.lifecycleId)) {
      throw new Error(`Registry-kind coverage references a lifecycle that is not loaded: ${data.lifecycleId}`);
    }
    const spec = deps.lifecycle.specFor(data.lifecycleId);
    if (!spec) {
      throw new Error(`Registry-kind coverage lifecycle has no spec: ${data.lifecycleId}`);
    }

    // defaultState must be a declared state of that lifecycle AND its initial state.
    const stateIds = spec.states.map(s => s.id);
    if (typeof data.defaultState !== 'string' || !stateIds.includes(data.defaultState)) {
      throw new Error(
        `Registry-kind coverage defaultState "${data.defaultState}" is not a declared state of the ${data.lifecycleId} lifecycle`,
      );
    }
    const initial = spec.states.find(s => s.initial === true);
    if (initial && initial.id !== data.defaultState) {
      throw new Error(
        `Registry-kind coverage defaultState "${data.defaultState}" must be the initial state "${initial.id}" of the ${data.lifecycleId} lifecycle`,
      );
    }

    this.lifecycleId = data.lifecycleId;
    this.defaultState = data.defaultState;
    this.byKind = new Map();
    this.entries = [];

    for (const raw of data.kinds) {
      const kind = typeof raw?.kind === 'string' && raw.kind.length > 0 ? raw.kind : undefined;
      if (kind === undefined) {
        throw new Error('Registry-kind coverage entry is missing its kind');
      }
      if (this.byKind.has(kind)) {
        throw new Error(`Duplicate kind in registry-kind coverage: ${kind}`);
      }
      if (!deps.knownKinds.has(kind)) {
        throw new Error(`Unknown kind in registry-kind coverage: ${kind}`);
      }
      const entry: KindLifecycleEntry = { kind, lifecycleId: this.lifecycleId, defaultState: this.defaultState };
      this.byKind.set(kind, entry);
      this.entries.push(entry);
    }
  }

  /** Coverage entry for a payload kind; undefined for every undeclared kind. */
  entryFor(kind: string): KindLifecycleEntry | undefined {
    return this.byKind.get(kind);
  }

  /** All covered kinds, in file order. */
  kinds(): string[] {
    return this.entries.map(e => e.kind);
  }

  get lifecycle(): string {
    return this.lifecycleId;
  }

  get size(): number {
    return this.entries.length;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Load registry-kind lifecycle coverage from a YAML file on disk.
 * Throws on malformed coverage (see class docs).
 */
export function loadKindLifecycleRegistry(filePath: string, deps: KindLifecycleRegistryDeps): KindLifecycleRegistry {
  const content = readFileSync(filePath, 'utf-8');
  const data = parseYaml(content) as KindLifecycleRegistryData;
  return new KindLifecycleRegistry(data, deps);
}

/**
 * Derive the set of known record kinds from loaded schema entries: the `const`
 * value of each schema's `properties.kind`. Data-derived — no kind names in TS.
 */
export function collectKnownKinds(entries: SchemaEntry[]): Set<string> {
  const kinds = new Set<string>();
  for (const entry of entries) {
    const kindConst = (entry.schema as { properties?: { kind?: { const?: unknown } } }).properties?.kind?.const;
    if (typeof kindConst === 'string' && kindConst.length > 0) {
      kinds.add(kindConst);
    }
  }
  return kinds;
}
