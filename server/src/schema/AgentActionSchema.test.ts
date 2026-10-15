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
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';

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

async function validatorFor() {
  const result = await loadActionSchemas();
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);
  return { validator };
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

  // ==========================================================================
  // HARNESS-SEQ-2 — the sequences target arms (RED-first)
  // ==========================================================================

  it('validates a sequence-tab target (switch the surface tab)', async () => {
    const { validator } = await validatorFor();
    const out = validator.validate(
      { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } },
      AGENT_ACTION_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('rejects a sequence-tab target naming an UNDECLARED tab (the fence is the declared list)', async () => {
    const { validator } = await validatorFor();
    const out = validator.validate(
      { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Settings' } },
      AGENT_ACTION_SCHEMA,
    );
    expect(out.valid).toBe(false);
  });

  it('rejects a sequence-tab target with extra keys (additionalProperties:false per arm)', async () => {
    const { validator } = await validatorFor();
    const out = validator.validate(
      { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Editor', label: 'extra' } },
      AGENT_ACTION_SCHEMA,
    );
    expect(out.valid).toBe(false);
  });

  it('validates a sequence-record target (cite a real catalog id)', async () => {
    const { validator } = await validatorFor();
    const out = validator.validate(
      { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19', label: 'pUC19' } },
      AGENT_ACTION_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('rejects a sequence-record target with no recordId (the id is required)', async () => {
    const { validator } = await validatorFor();
    const out = validator.validate(
      { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', label: 'pUC19' } },
      AGENT_ACTION_SCHEMA,
    );
    expect(out.valid).toBe(false);
  });

  it('the sequence-tab tab enum matches the DECLARED registry tabs (drift fence)', async () => {
    type TargetArm = { properties?: { tab?: { enum?: string[] } } };
    const raw = parse(readFileSync(join(process.cwd(), 'schema', 'workflow', 'agent-action.schema.yaml'), 'utf8')) as {
      properties: { target: { oneOf: TargetArm[] } };
    };
    const arm = raw.properties.target.oneOf.find((candidate) => candidate.properties?.tab?.enum);
    expect(arm, 'the agent-action schema must declare a sequence-tab arm with a tab enum').toBeDefined();
    const registry = loadDefaultSurfacesRegistry(join(process.cwd(), 'schema'));
    expect((arm?.properties?.tab?.enum ?? []).slice().sort()).toEqual((registry.get('sequences')?.tabs ?? []).slice().sort());
  });
});