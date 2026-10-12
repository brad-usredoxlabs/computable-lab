/**
 * OwnershipPolicySchema — the OWN-4 schema contract test (plan §T4).
 *
 * Pins the OWN-1 schema trio and the OWN-3 seed with the real Ajv pipeline:
 * the seeded OWN-LAB-DEFAULT document validates, and a schema-malformed
 * document is rejected. Harness mirrors server.ts:363-374 / DerivationSchemas
 * (loadSchemasFromContent -> registry.addSchemas -> topological addSchema ->
 * createValidator({ strict: false })).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'identity/ownership-policy.schema.yaml',
] as const;

// Flat $id contract (anchor 7): NO /identity/ segment — mirrors
// schema/identity/ownership-policy.schema.yaml:2, like access-policy.schema.yaml.
const OWNERSHIP_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';

// vitest cwd = server/ (vitest.config.ts include src/**/*.test.ts);
// server/records does NOT exist, so resolve the seed from the repo root.
const REPO_ROOT = resolve(process.cwd(), '..');
const SEED_PATH = join(
  REPO_ROOT,
  'records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml',
);

describe('ownership-policy schema contract', () => {
  let registry: ReturnType<typeof createSchemaRegistry>;
  let validator: ReturnType<typeof createValidator>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(REPO_ROOT, 'schema');
    const contents = new Map<string, string>();
    for (const path of SCHEMA_PATHS) {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    }

    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);

    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema, entry.id);
      }
    }
  });

  it('registry exposes ownership-policy under its flat $id', () => {
    expect(registry.has(OWNERSHIP_SCHEMA_ID)).toBe(true);
    const entry = registry.getById(OWNERSHIP_SCHEMA_ID);
    expect(entry).toBeDefined();
    expect(entry!.schema.properties?.kind?.const).toBe('ownership-policy');
  });

  it('accepts the seeded lab document (real file on disk, $schema stripped like the parser)', async () => {
    // Reads the REAL seed file — the seed's truth is the file, never an inline copy.
    const raw = parse(await readFile(SEED_PATH, 'utf8')) as Record<string, unknown>;
    // RecordParser.ts:113 strips $schema before validation; recordId stays.
    const { $schema: _schema, ...payload } = raw;
    const result = validator.validate(payload, OWNERSHIP_SCHEMA_ID);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('rejects a kindRule entry missing `kind` (schema-shape rejection)', () => {
    // Boundary: fallback SAFETY (e.g. an unsafe public fallback) is enforced by
    // the lint rule `ownership-policy-fallback-must-be-safe` (LintEngine), NOT
    // by Ajv — validator.validate runs no lint. Ajv only enforces shape here:
    // ownership-policy.schema.yaml:49-53 requires `kind` on every kindRules item.
    const payload = {
      kind: 'ownership-policy',
      recordId: 'OWN-SHAPE-BAD',
      title: 'Shape-bad policy',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      // schema-LEGAL fallback (owner: creator, visibility: private) — the ONLY
      // defect is kindRules[0] omitting the required `kind`.
      fallback: {
        owner: 'creator',
        visibility: 'private',
        filedTo: 'none',
        editRoles: ['owner'],
        shareTargets: ['user'],
      },
      kindRules: [
        {
          owner: 'creator',
          visibility: 'private',
          filedTo: 'none',
          editRoles: ['owner'],
          shareTargets: ['user'],
        },
      ],
    };

    const result = validator.validate(payload, OWNERSHIP_SCHEMA_ID);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const requiredError = result.errors.find(
      (e) => e.keyword === 'required' && e.params?.missingProperty === 'kind',
    );
    expect(requiredError, JSON.stringify(result.errors)).toBeDefined();
  });
});
