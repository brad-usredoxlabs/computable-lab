/**
 * AgentActionSchema — the declarative AGENT-ACTION contract.
 *
 * The plan's core: navigation/context changes are STRUCTURED OUTPUT validated
 * against declared data, never prose-parsed. An agent-action is a small YAML
 * object a tool/stream can emit that the harness executes (focus a step, open
 * a surface, jump). Ajv is the single validation authority (SOUL rule 3).
 * Non-record transport values use the shared datatypes, not a new validator.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { readFile } from 'node:fs/promises';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'workflow/agent-action.schema.yaml',
] as const;

const AGENT_ACTION_SCHEMA = 'https://computable-lab.com/schema/computable-lab/workflow/agent-action.schema.yaml';

async function loadActionSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

describe('agent-action schema contract', () => {
  it('registry exposes agent-action schema (loaded)', async () => {
    const result = await loadActionSchemas();
    const schema = result.entries.find((e) => e.id.endsWith('/workflow/agent-action.schema.yaml'));
    expect(schema).toBeDefined();
  });

  it('validates a focus-step action (navigate the investigation to a step)', async () => {
    const result = await loadActionSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const action = {
      action: 'focus',
      target: { kind: 'protocol-step', protocolId: 'PRT-heparg-drug-screen', stepId: 'step-3' },
      contextNote: 'Scoped to STEP 3 · HepaRG drug screen',
    };
    const out = validator.validate(action, AGENT_ACTION_SCHEMA);
    expect(out.valid).toBe(true);
  });

  it('validates an open-surface action (jump to a registered surface)', async () => {
    const result = await loadActionSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const action = {
      action: 'open-surface',
      surface: 'analysis',
      target: { kind: 'record', type: 'analysis-run', id: 'ANLR-000001' },
    };
    const out = validator.validate(action, AGENT_ACTION_SCHEMA);
    expect(out.valid).toBe(true);
  });

  it('rejects an unknown action verb', async () => {
    const result = await loadActionSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const out = validator.validate(
      { action: 'delete-everything', target: { kind: 'protocol-step', protocolId: 'P', stepId: 's' } },
      AGENT_ACTION_SCHEMA,
    );
    expect(out.valid).toBe(false);
  });
});