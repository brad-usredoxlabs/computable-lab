/**
 * Generic RegistryLoader — YAML discovery + zod validation + in-memory cache.
 *
 * Discovers *.yaml / *.yml files in a directory, parses each via the repo's
 * existing `yaml` parser, validates against a zod schema, and caches results
 * in memory.  Invalid files produce a thrown error with the file path + zod
 * error details.
 *
 * This is infrastructure only — concrete registry kinds (stamp-pattern,
 * protocol-spec, assay-spec, compound-class) are wired in later specs.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ZodType } from 'zod';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RegistryLoaderOptions<Spec> {
  /** Human-readable kind name used in error messages. */
  kind: string;
  /** Absolute path to the directory containing registry YAML files. */
  directory: string;
  /** Zod schema used to validate each parsed entry. */
  schema: ZodType<Spec>;
  /**
   * Optional filter for filenames.  Defaults to accepting `.yaml` and `.yml`.
   */
  fileFilter?: (filename: string) => boolean;
}

export interface RegistryLoader<Spec extends { id: string }> {
  /** Return all loaded entries sorted by `id`. */
  list(): Spec[];
  /** Look up a single entry by its `id`. */
  get(id: string): Spec | undefined;
  /**
   * Look up a single entry by a declared alias, by EXACT string equality.
   * Searches `platform_aliases[].alias` and `legacy_labware_types[]` (both
   * optional on the Spec). Returns `undefined` when nothing claims the key and
   * THROWS when more than one entry claims it — the resolver refuses to guess.
   */
  getByAlias(alias: string): Spec | undefined;
  /** Discard the in-memory cache so the next `list()`/`get()` re-reads disk. */
  reload(): void;
}

// ---------------------------------------------------------------------------
// Alias resolution (shared by both factories)
// ---------------------------------------------------------------------------

/**
 * Alias keys declared by a spec: `platform_aliases[].alias` plus
 * `legacy_labware_types[]`. Both fields are optional, so they are read
 * defensively rather than assumed present.
 */
function declaredAliasKeys(spec: unknown): string[] {
  if (!spec || typeof spec !== 'object') return [];
  const record = spec as Record<string, unknown>;
  const keys: string[] = [];

  const platformAliases = record.platform_aliases;
  if (Array.isArray(platformAliases)) {
    for (const entry of platformAliases) {
      if (!entry || typeof entry !== 'object') continue;
      const alias = (entry as Record<string, unknown>).alias;
      if (typeof alias === 'string') keys.push(alias);
    }
  }

  const legacyKeys = record.legacy_labware_types;
  if (Array.isArray(legacyKeys)) {
    for (const key of legacyKeys) {
      if (typeof key === 'string') keys.push(key);
    }
  }

  return keys;
}

/**
 * Exact-match alias resolution over both declared key sources. Refuses
 * ambiguity: if more than one entry claims the key, throw an error naming the
 * alias and every competing entry id instead of returning the first hit.
 */
function resolveByAlias<Spec extends { id: string }>(
  specs: Spec[],
  alias: string,
  kind: string,
): Spec | undefined {
  const matches = specs.filter((spec) =>
    declaredAliasKeys(spec).some((key) => key === alias),
  );
  if (matches.length > 1) {
    const ids = matches.map((spec) => spec.id).sort();
    throw new Error(
      `[registry:${kind}] ambiguous alias "${alias}" claimed by ${ids.length} entries: ${ids.join(', ')}`,
    );
  }
  return matches[0];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Aggregate loader — flattens { source, terms[] } YAML files
// ---------------------------------------------------------------------------

export interface AggregateRegistryLoader<Spec extends { id: string }>
  extends RegistryLoader<Spec> {
  /** Return all entries whose `source` field matches the given value. */
  getBySource(source: string): Spec[];
}

export interface AggregateRegistryLoaderOptions<Spec> {
  /** Human-readable kind name used in error messages. */
  kind: string;
  /** Absolute path to the directory containing aggregate YAML files. */
  directory: string;
  /** Zod schema used to validate each parsed entry. */
  schema: ZodType<Spec>;
  /**
   * Optional filter for filenames.  Defaults to accepting `.yaml` and `.yml`.
   */
  fileFilter?: (filename: string) => boolean;
}

export function createAggregateRegistryLoader<Spec extends { id: string }>(
  opts: AggregateRegistryLoaderOptions<Spec>,
): AggregateRegistryLoader<Spec> {
  let cache: Spec[] | null = null;

  const filter =
    opts.fileFilter ??
    ((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'));

  function load(): Spec[] {
    const entries = readdirSync(opts.directory);
    const files = entries.filter(filter);
    const specs: Spec[] = [];

    for (const file of files) {
      const filePath = join(opts.directory, file);
      const text = readFileSync(filePath, 'utf8');

      let parsed: unknown;
      try {
        parsed = parseYaml(text);
      } catch (err) {
        throw new Error(
          `[registry:${opts.kind}] YAML parse failed for ${filePath}: ${err instanceof Error ? err.message : err}`,
        );
      }

      // Validate aggregate shape: { source: string, terms: unknown[] }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('source' in parsed) ||
        !('terms' in parsed) ||
        !Array.isArray((parsed as Record<string, unknown>).terms)
      ) {
        throw new Error(
          `[registry:${opts.kind}] expected aggregate shape { source, terms[] } in ${filePath}`,
        );
      }

      const terms = (parsed as { terms: unknown[] }).terms;

      for (let i = 0; i < terms.length; i++) {
        const result = opts.schema.safeParse(terms[i]);
        if (!result.success) {
          throw new Error(
            `[registry:${opts.kind}] [${filePath}:${i}] schema validation failed: ${result.error.message}`,
          );
        }
        specs.push(result.data);
      }
    }

    specs.sort((a, b) => a.id.localeCompare(b.id));
    return specs;
  }

  function ensureLoaded(): Spec[] {
    if (cache === null) {
      cache = load();
    }
    return cache;
  }

  return {
    list: () => ensureLoaded().slice(),
    get: (id: string) => ensureLoaded().find((s) => s.id === id),
    getByAlias: (alias: string) =>
      resolveByAlias(ensureLoaded(), alias, opts.kind),
    reload: () => {
      cache = null;
    },
    getBySource: (source: string) =>
      ensureLoaded().filter((s) => (s as { source?: string }).source === source),
  };
}

export function createRegistryLoader<Spec extends { id: string }>(
  opts: RegistryLoaderOptions<Spec>,
): RegistryLoader<Spec> {
  let cache: Spec[] | null = null;

  const filter =
    opts.fileFilter ??
    ((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'));

  function load(): Spec[] {
    const entries = readdirSync(opts.directory);
    const files = entries.filter(filter);
    const specs: Spec[] = [];

    for (const file of files) {
      const filePath = join(opts.directory, file);
      const text = readFileSync(filePath, 'utf8');

      let parsed: unknown;
      try {
        parsed = parseYaml(text);
      } catch (err) {
        throw new Error(
          `[registry:${opts.kind}] YAML parse failed for ${filePath}: ${err instanceof Error ? err.message : err}`,
        );
      }

      const result = opts.schema.safeParse(parsed);
      if (!result.success) {
        throw new Error(
          `[registry:${opts.kind}] schema validation failed for ${filePath}: ${result.error.message}`,
        );
      }

      specs.push(result.data);
    }

    specs.sort((a, b) => a.id.localeCompare(b.id));
    return specs;
  }

  function ensureLoaded(): Spec[] {
    if (cache === null) {
      cache = load();
    }
    return cache;
  }

  return {
    list: () => ensureLoaded().slice(),
    get: (id: string) => ensureLoaded().find((s) => s.id === id),
    getByAlias: (alias: string) =>
      resolveByAlias(ensureLoaded(), alias, opts.kind),
    reload: () => {
      cache = null;
    },
  };
}
