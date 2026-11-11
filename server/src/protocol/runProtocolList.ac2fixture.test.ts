// L2-PROTOCOL-LOCAL-BIND-1 ac2seed — fixture pin: seed planned-run references prt-seed-biological-transfer
//
// Two legs:
//   (a) store-leg: store list({ kind: 'planned-run' }) surfaces PLR-SEEDLOCALBIND from seed dir
//   (b) pure-leg:  parse YAML → validate against planned-run schema → protocolIdsOf yields expected id
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { resolveSeedRecordsDir } from '../index/seedRecordsDir.js';
import { protocolIdsOf } from './runProtocolList.js';

const PLANNED_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';
const RECORD_ID = 'PLR-SEEDLOCALBIND';
const PROTOCOL_ID = 'prt-seed-biological-transfer';

// Load the planned-run schema plus its dependencies for the pure leg
async function loadPlannedRunSchema() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const p of [
    'core/common.schema.yaml',
    'core/datatypes/ref.schema.yaml',
    'workflow/planned-run.schema.yaml',
  ]) {
    contents.set(p, await readFile(join(schemaRoot, p), 'utf8'));
  }
  const result = loadSchemasFromContent(contents);
  if (result.errors.length > 0) {
    throw new Error(`Schema load errors: ${JSON.stringify(result.errors)}`);
  }
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) {
    validator.addSchema(entry.schema, entry.id);
  }
  return validator;
}

describe('ac2seed — seed planned-run pin for LOCALBIND gate', () => {
  // (a) store-leg: the store's seed scan surfaces our planned-run
  it('store-leg: list({ kind: "planned-run" }) contains PLR-SEEDLOCALBIND from seed dir', async () => {
    const seedDir = resolveSeedRecordsDir(dirname(fileURLToPath(import.meta.url)));
    expect(seedDir, 'seedDir must be resolvable').not.toBe(null);

    // Create a minimal repo for the store
    const repoRoot = join(tmpdir(), `clg-ac2seed-${randomUUID().slice(0, 8)}`);
    await mkdir(join(repoRoot, 'records'), { recursive: true });
    const repo = createLocalRepoAdapter({ basePath: repoRoot });

    // Validator: accept the planned-run schema (so the store can list without validation errors)
    const validator = new AjvValidator();

    const store = createRecordStore(repo, validator, new LintEngine(), { seedDir: seedDir || undefined });
    const envelopes = await store.list({ kind: 'planned-run' });

    const ids = envelopes.map((e) => e.recordId);
    expect(ids).toContain(RECORD_ID);
  });

  // (b) pure-leg: parse YAML, validate, assert protocolIdsOf
  it('pure-leg: YAML parses, validates, and protocolIdsOf resolves to prt-seed-biological-transfer', async () => {
    const seedDir = resolveSeedRecordsDir(dirname(fileURLToPath(import.meta.url)));
    expect(seedDir, 'seedDir must be resolvable').not.toBe(null);

    const yamlPath = join(seedDir, 'planned-run', `${RECORD_ID}__planned-seed-localbind.yaml`);
    const raw = await readFile(yamlPath, 'utf8');
    const parsed = parse(raw);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');

    // Strip $schema as the store does (unevaluatedProperties: false)
    const payload = { ...(parsed as Record<string, unknown>) };
    delete payload.$schema;

    // Validate against planned-run schema
    const validator = await loadPlannedRunSchema();
    const result = validator.validate(payload, PLANNED_RUN_SCHEMA_ID);
    if (!result.valid) {
      throw new Error(`Ajv validation failed: ${JSON.stringify(result.errors)}`);
    }

    // Assert protocolIdsOf resolves to the role-declaring protocol
    expect(protocolIdsOf(payload)).toEqual([PROTOCOL_ID]);
  });
});
