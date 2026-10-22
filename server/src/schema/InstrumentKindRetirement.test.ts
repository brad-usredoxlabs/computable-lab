/**
 * INSTR-COLLAPSE-2 C3 — the instrument KIND retirement pin (RED-first).
 *
 * The approved ruling (Brad 2026-10-21T19:15, executed by the promoted spec
 * .hermes/plans/2026-10-22_instr-collapse-2-kind-deletion-spec.md) deletes the
 * `instrument` RECORD KIND outright. COLLAPSE-1 already shipped the acquisition-
 * context contract as declared data and retargeted every ref to equipment, so
 * deletion is now legal. This suite is the test-pinned record of that deletion:
 * committed RED at the pre-deletion tree, GREEN after C3.
 *
 * Assertions (spec C3 RED (a)-(e)):
 *  (a) record.schema.yaml's oneOf carries no $ref to instrument.schema.yaml,
 *      and the loaded schema set has no schema declaring kind: instrument.
 *  (b) the REAL Ajv pipeline accepts NO kind-const schema for a minimal
 *      instrument-kind payload (the kind has no branch to validate against) —
 *      asserted through the real registry, not a text grep. The equipment kind
 *      is the live control: the same harness ACCEPTS it.
 *  (c) the REAL registry-kind coverage file no longer covers 'instrument'.
 *  (d) the REAL OWN-LAB seed file has no `- kind: instrument` rule and still
 *      validates (same read pattern as OwnershipPolicySchema.test.ts).
 *  (e) schema/lab/instrument.{schema,lint,ui}.yaml do not exist.
 *
 * KEEP boundaries this suite also pins so the deletion's edge is visible
 * (spec P3 / blessed-keep list): instrument-definition is a DIFFERENT kind and
 * survives; instrument-log keeps its KIND NAME and instrumentRef property;
 * schema/registry/instruments/ survives.
 *
 * NOTE on the record union: record.schema.yaml itself cannot be COMPILED by
 * Ajv on this trunk (pre-existing debt — schema/studies/run-timeline.schema.yaml
 * refs ../datatypes/plate-event.schema.yaml, which resolves to an id no schema
 * declares). That debt is out of this item's scope; the assertions below read
 * the union's DECLARED oneOf list and validate through each kind's own schema,
 * which is how the server actually validates records (per-record schemaId).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js';
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js';
import { collectKnownKinds, loadKindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js';

// vitest cwd = server/; resolve the repo root the way the sibling contract
// suites do (OwnershipPolicySchema.test.ts REPO_ROOT).
const REPO_ROOT = resolve(process.cwd(), '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schema');

const RECORD_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/record.schema.yaml';
const OWNERSHIP_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';
const SEED_PATH = join(
  REPO_ROOT,
  'records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml',
);

const INSTRUMENT_TRIPLET = [
  'schema/lab/instrument.schema.yaml',
  'schema/lab/instrument.lint.yaml',
  'schema/lab/instrument.ui.yaml',
] as const;

function kindConstOf(schema: unknown): string | undefined {
  const k = (schema as { properties?: { kind?: { const?: unknown } } }).properties?.kind?.const;
  return typeof k === 'string' ? k : undefined;
}

describe('INSTR-COLLAPSE-2 C3: the instrument record kind is deleted', () => {
  let entries: Awaited<ReturnType<typeof loadAllSchemas>>['entries'];
  let registry: ReturnType<typeof createSchemaRegistry>;
  let validator: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    // A broken schema tree would mask every assertion below.
    expect(loaded.errors).toEqual([]);
    entries = loaded.entries;
    registry = createSchemaRegistry();
    registry.addSchemas(entries);
    validator = createValidator({ strict: false });
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  // (a) ------------------------------------------------------------------
  it('record.schema.yaml declares no oneOf branch for the instrument kind', () => {
    const recordSchema = registry.getById(RECORD_SCHEMA_ID)?.schema as
      | { oneOf?: Array<Record<string, unknown>> }
      | undefined;
    expect(recordSchema).toBeDefined();
    const refs = (recordSchema!.oneOf ?? []).map((branch) => String(branch.$ref ?? ''));
    expect(
      refs.filter((ref) => /(^|\/)instrument\.schema\.yaml$/.test(ref)),
      'record.schema.yaml oneOf must not reference instrument.schema.yaml',
    ).toEqual([]);
    // The sibling kinds the ruling blesses stay in the union: deletion stopped
    // at the right line (instrument-definition is a DIFFERENT kind).
    expect(refs.some((ref) => /instrument-definition\.schema\.yaml$/.test(ref))).toBe(true);
    expect(refs.some((ref) => /instrument-log\.schema\.yaml$/.test(ref))).toBe(true);
  });

  it('no loaded schema declares kind: instrument (instrument-definition/log keep theirs)', () => {
    const kindConsts = entries
      .map((entry) => kindConstOf(entry.schema))
      .filter((k): k is string => k !== undefined);
    expect(kindConsts.filter((k) => k === 'instrument')).toEqual([]);
    expect(kindConsts).toContain('instrument-definition');
    expect(kindConsts).toContain('instrument-log');
    expect(kindConsts).toContain('equipment');
  });

  // (b) ------------------------------------------------------------------
  it('the real Ajv pipeline accepts NO kind schema for a minimal instrument-kind payload', () => {
    // Required fields only (kind/id/name — the retired schema's own `required`
    // list), id shaped for the retired pattern. After deletion NO kind-const
    // schema in the real registry accepts it: the kind has no branch at all.
    const payload = { kind: 'instrument', id: 'INSTR-RETIRE-TEST', name: 'retirement probe' };
    const accepted: string[] = [];
    for (const entry of registry.getAll()) {
      if (kindConstOf(entry.schema) === undefined) continue;
      let valid = false;
      try {
        valid = validator.validate(payload, entry.id).valid;
      } catch {
        // A schema that cannot compile (pre-existing dangling-ref debt, e.g.
        // run-timeline's plate-event ref) is NOT an acceptance either.
        valid = false;
      }
      if (valid) accepted.push(entry.id);
    }
    expect(accepted, `instrument payload must not validate against any kind schema; accepted by: ${accepted.join(', ')}`).toEqual([]);

    // Control: the same harness ACCEPTS the equipment kind, proving the harness
    // is live and the rejection above is kind-specific. (QMS8-C retired the
    // equipment `status` field, so the control carries none.)
    const control = { kind: 'equipment', id: 'EQP-RETIRE-CONTROL', name: 'retirement control' };
    const controlAccepted: string[] = [];
    for (const entry of registry.getAll()) {
      if (kindConstOf(entry.schema) !== 'equipment') continue;
      if (validator.validate(control, entry.id).valid) controlAccepted.push(entry.id);
    }
    expect(controlAccepted.length).toBe(1);
  });

  // (c) ------------------------------------------------------------------
  it('the real registry-kind coverage file no longer covers instrument', () => {
    const engine = new LifecycleEngine();
    expect(loadLifecyclesFromDir(join(SCHEMA_DIR, 'core/lifecycles'), engine)).toBeGreaterThanOrEqual(2);
    const coverage = loadKindLifecycleRegistry(
      join(SCHEMA_DIR, 'registry/registry-kinds.registry.yaml'),
      { lifecycle: engine, knownKinds: collectKnownKinds(entries) },
    );
    const covered = [...coverage.kinds()];
    expect(covered).not.toContain('instrument');
    // The remaining covered kinds keep their coverage (retirement, not shrinkage).
    expect(covered.sort()).toEqual([
      'calibration-record',
      'competency-authorization',
      'equipment',
      'equipment-class',
      'person',
      'training-record',
    ]);
    // QMS8-C D4's declared stripDomainStatus survives for the kinds that keep it;
    // 'instrument' is simply gone from the declared list.
    expect(coverage.kindsRetiringDomainStatus().sort()).toEqual(['equipment']);
  });

  // (d) ------------------------------------------------------------------
  it('the real OWN-LAB seed file has no instrument kindRule and still validates', async () => {
    const raw = parse(await readFile(SEED_PATH, 'utf8')) as Record<string, unknown>;
    const kindRules = (raw.kindRules ?? []) as Array<Record<string, unknown>>;
    expect(kindRules.filter((rule) => rule.kind === 'instrument')).toEqual([]);
    // The equipment rule the instrument rule used to sit beside survives.
    expect(kindRules.some((rule) => rule.kind === 'equipment')).toBe(true);

    // Same read+validate pattern as OwnershipPolicySchema.test.ts: the REAL
    // file, the REAL Ajv pipeline, one rule fewer.
    const ownRegistry = createSchemaRegistry();
    ownRegistry.addSchemas(entries.filter((e) =>
      e.id.endsWith('/common.schema.yaml') || e.id.endsWith('/ownership-policy.schema.yaml'),
    ));
    const ownValidator = createValidator({ strict: false });
    for (const id of ownRegistry.getTopologicalOrder()) {
      const entry = ownRegistry.getById(id);
      if (entry) ownValidator.addSchema(entry.schema, entry.id);
    }
    const { $schema: _schema, ...payload } = raw;
    const result = ownValidator.validate(payload, OWNERSHIP_SCHEMA_ID);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  // (e) ------------------------------------------------------------------
  it('the instrument schema/lint/ui triplet no longer exists on disk', () => {
    for (const rel of INSTRUMENT_TRIPLET) {
      expect(existsSync(join(REPO_ROOT, rel)), `${rel} must be deleted`).toBe(false);
    }
  });

  // KEEP pins (blessed-keep list; a reviewer demanding these deletions is
  // over-collapse — spec bait #5).
  it('KEEP: instrument-log keeps its kind name + instrumentRef property, and schema/registry/instruments/ survives', () => {
    expect(existsSync(join(REPO_ROOT, 'schema/lab/instrument-log.schema.yaml'))).toBe(true);
    const logEntry = entries.find((e) => e.id.endsWith('instrument-log.schema.yaml'));
    expect(logEntry).toBeDefined();
    expect(kindConstOf(logEntry!.schema)).toBe('instrument-log');
    const logRaw = JSON.stringify(logEntry!.schema);
    expect(logRaw).toContain('instrumentRef');
    expect(existsSync(join(REPO_ROOT, 'schema/registry/instruments'))).toBe(true);
  });
});
