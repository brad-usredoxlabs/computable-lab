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
  /**
   * QMS8-C (D4): this kind's DOMAIN `status` field is retired — its vocabulary
   * duplicates the lifecycle's own states, so governed records carry the state
   * and the status key is stripped. Declared per kind in the coverage DATA:
   * kinds whose status is an ORTHOGONAL domain vocabulary (person's
   * contractor/suspended, training-record's passed/failed, calibration-record's
   * pass/fail — all live admissibility consumers) declare nothing here and are
   * never stripped. Absent -> false.
   */
  stripDomainStatus: boolean;
}

/**
 * QMS7-4 (ruling B) archive-guard data block: kinds whose payloads may still
 * point at a terminal-state covered record (evidence kinds, not operational
 * assignments). DATA — the handler never names a kind.
 */
export interface ArchiveGuardData {
  exemptKinds: string[];
}

/**
 * QMS8-C (D4 tail): the QMS7-4 OQ2 `MigrationData` block (stateByDomainStatus +
 * default) is RETIRED with its data. A leg no valid record can exercise is dead
 * code: post-retirement a covered create cannot carry a domain status (the
 * schema refuses it) and every governed record already carries its own state.
 * The runner resolves an ungoverned record ONLY from the coverage entry's
 * declared defaultState and reports — never maps, never guesses — anything the
 * declared data cannot decide.
 */

/**
 * QMS8-C (A1-3) lifecycle-declared migration instructions. The covered-kind
 * `migration:` block above can only speak for kinds the coverage file lists;
 * lifecycle-GOVERNED kinds (material/term/material-spec — their lifecycleId is
 * declared per-schema, never in `kinds:`) need their own declared instruction.
 * DATA, keyed by LIFECYCLE (the file names no kind here): the runner obeys the
 * flag and never infers one in TS.
 */
export interface LifecycleMigrationInstruction {
  lifecycleId: string;
  /** Stamp `state := status` for records of this lifecycle that carry a domain
   *  status and no lifecycle state (the enums are 1:1 — an identity, which is
   *  why this is a stamp and not a mapping). */
  stampStateFromDomainStatus: boolean;
}

export interface KindLifecycleRegistryData {
  registryVersion: number;
  lifecycleId: string;
  defaultState: string;
  kinds: Array<{ kind: string; stripDomainStatus?: unknown }>;
  archiveGuard?: { exemptKinds?: unknown };
  migration?: { stateByDomainStatus?: unknown; default?: unknown };
  lifecycleMigrations?: Array<{ lifecycleId?: unknown; stampStateFromDomainStatus?: unknown }>;
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
// Optional QMS7-4 block parsers (absent → undefined; malformed → fail load)
// ============================================================================

function parseArchiveGuard(raw: KindLifecycleRegistryData['archiveGuard']): ArchiveGuardData | undefined {
  if (raw === undefined) return undefined;
  const exempt = raw.exemptKinds;
  if (!Array.isArray(exempt) || exempt.length === 0 || exempt.some(k => typeof k !== 'string' || k.length === 0)) {
    throw new Error('Registry-kind coverage archiveGuard.exemptKinds must be a non-empty list of kind names');
  }
  return { exemptKinds: exempt as string[] };
}

function parseMigration(raw: KindLifecycleRegistryData['migration']): undefined {
  // QMS8-C (D5): the whole `migration:` block is retired. A file that still
  // declares it fails the load — the retired instruction must not survive as
  // inert data a future reader might trust (bait #3: partial deletion throws;
  // here the whole block is gone, so any presence is a stale declaration).
  if (raw !== undefined) {
    throw new Error('Registry-kind coverage `migration:` block is retired (QMS8-C D5): the status->state map is dead data — delete the whole block');
  }
  return undefined;
}

/**
 * QMS8-C (A1-3): parse the lifecycle-scoped migration instructions. Absent ->
 * undefined (the runner runs no lifecycle leg, every pre-QMS8-C path identical).
 * Present-but-malformed -> fail the load. A referenced lifecycle must actually
 * be loaded — the loader checks the data against declared facts and holds no
 * policy of its own.
 */
function parseLifecycleMigrations(
  raw: KindLifecycleRegistryData['lifecycleMigrations'],
  lifecycle: LifecycleCoverageSource,
): LifecycleMigrationInstruction[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error('Registry-kind coverage lifecycleMigrations must be a list of { lifecycleId, stampStateFromDomainStatus }');
  }
  const instructions: LifecycleMigrationInstruction[] = [];
  for (const entry of raw) {
    const lifecycleId = typeof entry?.lifecycleId === 'string' && entry.lifecycleId.length > 0 ? entry.lifecycleId : undefined;
    if (lifecycleId === undefined) {
      throw new Error('Registry-kind coverage lifecycleMigrations entry is missing its lifecycleId');
    }
    if (!lifecycle.isLoaded(lifecycleId)) {
      throw new Error(`Registry-kind coverage lifecycleMigrations references a lifecycle that is not loaded: ${lifecycleId}`);
    }
    if (typeof entry.stampStateFromDomainStatus !== 'boolean') {
      throw new Error(`Registry-kind coverage lifecycleMigrations entry for "${lifecycleId}" must declare stampStateFromDomainStatus as a boolean`);
    }
    instructions.push({ lifecycleId, stampStateFromDomainStatus: entry.stampStateFromDomainStatus });
  }
  return instructions;
}

// ============================================================================
// Registry class
// ============================================================================

export class KindLifecycleRegistry {
  private readonly byKind: Map<string, KindLifecycleEntry>;
  private readonly entries: KindLifecycleEntry[];
  private readonly lifecycleId: string;
  private readonly defaultState: string;
  private readonly archiveGuardData: ArchiveGuardData | undefined;
  private readonly lifecycleMigrationData: LifecycleMigrationInstruction[] | undefined;

  constructor(data: KindLifecycleRegistryData, deps: KindLifecycleRegistryDeps) {
    if (!data || typeof data.lifecycleId !== 'string' || data.lifecycleId.length === 0 || !Array.isArray(data.kinds)) {
      throw new Error('Invalid registry-kind coverage file: lifecycleId/kinds missing');
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
    // A coverage-target lifecycle with NO declared initial state is malformed data:
    // the equality check is NOT conditional on an initial state existing (QMS7-3
    // adversarial review DEFECT 1 — the silent arm is closed).
    const stateIds = spec.states.map(s => s.id);
    if (typeof data.defaultState !== 'string' || !stateIds.includes(data.defaultState)) {
      throw new Error(
        `Registry-kind coverage defaultState "${data.defaultState}" is not a declared state of the ${data.lifecycleId} lifecycle`,
      );
    }
    const initial = spec.states.find(s => s.initial === true);
    if (!initial) {
      throw new Error(
        `Registry-kind coverage lifecycle ${data.lifecycleId} declares no initial state; defaultState "${data.defaultState}" must be the initial state`,
      );
    }
    if (initial.id !== data.defaultState) {
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
      // QMS8-C (D4): the retirement flag is per-kind DATA. Present-but-not-a-
      // boolean fails the load (same discipline as every other block); absent
      // means the kind's domain status is NOT retired.
      if (raw.stripDomainStatus !== undefined && typeof raw.stripDomainStatus !== 'boolean') {
        throw new Error(`Registry-kind coverage kind "${kind}" declares stripDomainStatus as a non-boolean: it must be true or false`);
      }
      const entry: KindLifecycleEntry = {
        kind,
        lifecycleId: this.lifecycleId,
        defaultState: this.defaultState,
        stripDomainStatus: raw.stripDomainStatus === true,
      };
      this.byKind.set(kind, entry);
      this.entries.push(entry);
    }

    // QMS7-4 optional data blocks. Absent → undefined (the guard consumers skip
    // entirely, so every pre-QMS7-4 path stays identical). Present-but-malformed
    // → fail the load, same discipline as above. QMS8-C (D5): the `migration:`
    // block is retired — its mere presence now fails the load.
    this.archiveGuardData = parseArchiveGuard(data.archiveGuard);
    parseMigration(data.migration);
    this.lifecycleMigrationData = parseLifecycleMigrations(data.lifecycleMigrations, deps.lifecycle);
  }

  /**
   * QMS7-4 archive-guard data (ruling B): the exempt kinds come from the
   * coverage file, never from TS. Undefined when the file declares no guard
   * block — the handler then applies no archive guard at all.
   */
  get archiveGuard(): ArchiveGuardData | undefined {
    return this.archiveGuardData;
  }

  /**
   * QMS8-C (A1-3) lifecycle-scoped migration instructions (DATA, keyed by
   * lifecycle — never a kind name). Undefined when the file declares no
   * lifecycleMigrations block: the runner then runs no lifecycle leg.
   */
  get lifecycleMigrations(): LifecycleMigrationInstruction[] | undefined {
    return this.lifecycleMigrationData;
  }

  /** Coverage entry for a payload kind; undefined for every undeclared kind. */
  entryFor(kind: string): KindLifecycleEntry | undefined {
    return this.byKind.get(kind);
  }

  /** All covered kinds, in file order. */
  kinds(): string[] {
    return this.entries.map(e => e.kind);
  }

  /**
   * QMS8-C (D4): the covered kinds whose DOMAIN status the coverage DATA
   * declares retired. A plain read-only report of declared facts — the runner
   * never names a kind, it obeys this answer. Empty when no kind declares it.
   */
  kindsRetiringDomainStatus(): string[] {
    return this.entries.filter(e => e.stripDomainStatus).map(e => e.kind);
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
