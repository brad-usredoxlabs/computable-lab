// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { protocolRefsOf, protocolIdsOf, leadProtocolId, withAttachedProtocol } from './runProtocolList.js';

function runSchemaId() {
  return 'https://computable-lab.com/schema/computable-lab/run.schema.yaml';
}

async function loadRunSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const p of ['core/common.schema.yaml', 'core/datatypes/ref.schema.yaml', 'studies/run.schema.yaml']) {
    contents.set(p, await readFile(join(schemaRoot, p), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

describe('protocolRefsOf — legacy singular ref', () => {
  it('returns one element from localProtocolRef', () => {
    const payload = {
      kind: 'run',
      localProtocolRef: { kind: 'record', id: 'LPR-1', type: 'local-protocol' },
    };
    expect(protocolIdsOf(payload)).toEqual(['LPR-1']);
    expect(protocolRefsOf(payload).length).toBe(1);
  });
});

describe('protocolRefsOf — ordered list', () => {
  it('returns ids in order', () => {
    const refA = { kind: 'record', id: 'LPR-A', type: 'local-protocol' };
    const refB = { kind: 'record', id: 'LPR-B', type: 'local-protocol' };
    const payload = { kind: 'run', localProtocolRefs: [refA, refB] };
    expect(protocolIdsOf(payload)).toEqual(['LPR-A', 'LPR-B']);
  });
});

describe('protocolRefsOf — both list and singular', () => {
  it('list wins and singular is deduped by id', () => {
    const refA = { kind: 'record', id: 'LPR-A', type: 'local-protocol' };
    const refB = { kind: 'record', id: 'LPR-B', type: 'local-protocol' };
    const payload = {
      kind: 'run',
      localProtocolRef: { kind: 'record', id: 'LPR-A', type: 'local-protocol' },
      localProtocolRefs: [refA, refB],
    };
    const ids = protocolIdsOf(payload);
    expect(ids).toEqual(['LPR-A', 'LPR-B']);
    expect(ids.length).toBe(2);
  });
});

describe('protocolRefsOf — no fields', () => {
  it('returns empty array, never throws', () => {
    expect(protocolIdsOf({ kind: 'run' })).toEqual([]);
    expect(protocolRefsOf({})).toEqual([]);
    expect(protocolIdsOf({})).toEqual([]);
  });
});

describe('withAttachedProtocol — idempotency and legacy compat', () => {
  it('applying twice does not grow the list', () => {
    const refB = { kind: 'record', id: 'LPR-B', type: 'local-protocol' };
    const payload = { kind: 'run' as const, localProtocolRefs: [{ kind: 'record', id: 'LPR-A', type: 'local-protocol' }] };
    const once = withAttachedProtocol(payload, refB);
    const twice = withAttachedProtocol(once, refB);
    expect(twice.localProtocolRefs).toBeDefined();
    expect(Array.isArray(twice.localProtocolRefs)).toBe(true);
    expect((twice.localProtocolRefs as any[]).length).toBe((once.localProtocolRefs as any[]).length);
  });

  it('legacy singular payload returns list form, legacy field untouched', () => {
    const refB = { kind: 'record', id: 'LPR-B', type: 'local-protocol' };
    const payload = {
      kind: 'run' as const,
      localProtocolRef: { kind: 'record', id: 'LPR-A', type: 'local-protocol' },
    };
    const result = withAttachedProtocol(payload, refB);
    expect(result.localProtocolRef).toEqual(payload.localProtocolRef);
    expect(Array.isArray(result.localProtocolRefs)).toBe(true);
    expect((result.localProtocolRefs as any[]).length).toBe(2);
    expect(protocolIdsOf(result)).toEqual(['LPR-A', 'LPR-B']);
  });
});

describe('run schema — localProtocolRefs validation', () => {
  it('validates a run with localProtocolRefs', async () => {
    const result = await loadRunSchemas();
    expect(result.errors).toEqual([]);
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }
    const valid = validator.validate(
      {
        kind: 'run',
        recordId: 'RUN-001',
        status: 'planned',
        localProtocolRefs: [
          { kind: 'record', id: 'LPR-A', type: 'local-protocol' },
          { kind: 'record', id: 'LPR-B', type: 'local-protocol' },
        ],
      },
      runSchemaId(),
    );
    expect(valid.valid).toBe(true);
  });

  it('validates a legacy singular run', async () => {
    const result = await loadRunSchemas();
    expect(result.errors).toEqual([]);
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }
    const valid = validator.validate(
      {
        kind: 'run',
        recordId: 'RUN-002',
        status: 'planned',
        localProtocolRef: { kind: 'record', id: 'LPR-1', type: 'local-protocol' },
      },
      runSchemaId(),
    );
    expect(valid.valid).toBe(true);
  });

  it('rejects a ref entry with undeclared property', async () => {
    const result = await loadRunSchemas();
    expect(result.errors).toEqual([]);
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }
    const valid = validator.validate(
      {
        kind: 'run',
        recordId: 'RUN-003',
        status: 'planned',
        localProtocolRefs: [
          { kind: 'record', id: 'LPR-A', type: 'local-protocol', undeclaredProp: 'bad' },
        ],
      },
      runSchemaId(),
    );
    expect(valid.valid).toBe(false);
    const pathError = valid.errors?.find((e) => e.path.includes('/localProtocolRefs/0'));
    expect(pathError).toBeDefined();
  });
});
