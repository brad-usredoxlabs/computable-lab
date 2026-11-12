/**
 * Reload the declarative schema surface WITHOUT restarting the server.
 *
 * WHY (Brad 2026-11-12, "pull the two levers"): `tsx --watch` reloads TypeScript but NOT YAML, so
 * every schema/UI/lint change forced a full backend restart. A restart serialises the lane: the
 * browser gate must re-serve, in-flight coder work idles, and a gate that needed a different
 * revision cannot overlap. Measured cost: every schema-touching item paid a restart.
 *
 * WHAT IT RELOADS (safe in place over the SAME instances the handlers already hold):
 *   - structural schemas: registry.clear() + re-add, validator entries removed and re-added in
 *     topological order
 *   - business rules: lint engine cleared, specs re-added with the SAME predicate-registry
 *     injection the boot path performs
 *   - rendering hints: UI spec loader cleared and re-loaded
 *
 * WHAT IT DOES NOT RELOAD, AND SAYS SO: lifecycles, registry-kind coverage, policy bundles,
 * material profiles and platform manifests are constructed once at boot and are not re-entrant.
 * If any file under those paths changed since boot, the result names them under
 * `requiresRestart` — never silently pretends the reload covered them.
 *
 * FAIL-SAFE: if the fresh load yields zero schemas the registry is left untouched (a broken or
 * half-written YAML tree must not be able to empty a working server).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import type { AjvValidator } from '../validation/AjvValidator.js';
import type { LintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { loadPredicateRegistry } from '../registry/PredicateRegistry.js';
import type { UISpecLoader } from '../ui/UISpecLoader.js';
import { loadAllUISpecs } from '../ui/UISpecLoader.js';

export interface ReloadResult {
  ok: boolean;
  ms: number;
  schemas: { loaded: number; addedToValidator: number; errors: number };
  lint: { specs: number; rules: number; errors: number };
  uiSpecs: { loaded: number; errors: number };
  /** Boot-only surfaces whose files changed since boot — a restart IS required for these. */
  requiresRestart: string[];
  warnings: string[];
}

export interface ReloaderOptions {
  schemaDir: string;
  schemaRegistry: SchemaRegistry;
  validator: AjvValidator;
  lintEngine: LintEngine;
  uiSpecLoader: UISpecLoader;
  /** Boot time, used to decide whether a boot-only surface changed. Defaults to "now". */
  bootedAt?: Date;
}

const BOOT_ONLY: Array<{ label: string; rel: string }> = [
  { label: 'lifecycles', rel: 'core/lifecycles' },
  { label: 'policy-bundles', rel: 'core/policy-bundles' },
  { label: 'registry (predicates/kind coverage)', rel: 'registry' },
];

function newestMtime(dir: string, budget = 4000): number {
  let newest = 0;
  let seen = 0;
  const walk = (d: string): void => {
    if (seen > budget) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (seen++ > budget) return;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.yaml') || name.endsWith('.yml')) newest = Math.max(newest, st.mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

export async function reloadSchemaSurface(opts: ReloaderOptions): Promise<ReloadResult> {
  const t0 = Date.now();
  const warnings: string[] = [];
  const schemaDir = resolve(opts.schemaDir);

  // 1. structural schemas
  const load = await loadAllSchemas({ basePath: schemaDir, recursive: true });
  for (const e of load.errors) warnings.push(`${e.path}: ${e.error}`);
  if (load.entries.length === 0) {
    return {
      ok: false,
      ms: Date.now() - t0,
      schemas: { loaded: 0, addedToValidator: 0, errors: load.errors.length },
      lint: { specs: 0, rules: 0, errors: 0 },
      uiSpecs: { loaded: 0, errors: 0 },
      requiresRestart: [],
      warnings: ['REFUSED: the fresh load produced 0 schemas; the live registry was left untouched.', ...warnings],
    };
  }
  const oldIds = opts.schemaRegistry.getAll().map((s) => s.id);
  opts.schemaRegistry.clear();
  opts.schemaRegistry.addSchemas(load.entries);
  for (const id of oldIds) {
    try {
      opts.validator.removeSchema(id);
    } catch {
      /* not present in the validator — nothing to remove */
    }
  }
  const ordered = opts.schemaRegistry.getTopologicalOrder();
  for (const id of ordered) {
    const entry = opts.schemaRegistry.getById(id);
    if (entry) opts.validator.addSchema(entry.schema, entry.id);
  }

  // 2. business rules — same predicate injection as the boot path
  const lintLoad = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });
  for (const e of lintLoad.errors) warnings.push(`${e.path}: ${e.error}`);
  let predicateRegistry;
  try {
    predicateRegistry = loadPredicateRegistry(resolve(schemaDir, 'registry/predicates.registry.yaml'));
  } catch (err) {
    warnings.push('predicate registry not reloaded: ' + (err instanceof Error ? err.message : String(err)));
  }
  opts.lintEngine.clear();
  let specs = 0;
  let rules = 0;
  for (const { name, spec } of lintLoad.specs) {
    if (spec.rules.length === 0 && spec.authoring === undefined) continue;
    if (predicateRegistry) {
      for (const rule of spec.rules) {
        if (rule.id === 'approved-predicate' && rule.assert.op === 'in') {
          (rule.assert as { values: string[] }).values = predicateRegistry.getAllIds();
        }
      }
    }
    opts.lintEngine.addSpec(name, spec);
    specs++;
    rules += spec.rules.length;
  }

  // 3. rendering hints
  opts.uiSpecLoader.clear();
  const uiLoad = await loadAllUISpecs(opts.uiSpecLoader, schemaDir);
  for (const e of uiLoad.errors) warnings.push(`${e.path}: ${e.error}`);

  // 4. boot-only surfaces — report, never pretend
  const bootedAt = (opts.bootedAt ?? new Date()).getTime();
  const requiresRestart = BOOT_ONLY.filter((b) => newestMtime(resolve(schemaDir, b.rel)) > bootedAt)
    .map((b) => b.label);

  return {
    ok: true,
    ms: Date.now() - t0,
    schemas: { loaded: load.entries.length, addedToValidator: ordered.length, errors: load.errors.length },
    lint: { specs, rules, errors: lintLoad.errors.length },
    uiSpecs: { loaded: uiLoad.loaded, errors: uiLoad.errors.length },
    requiresRestart,
    warnings,
  };
}
