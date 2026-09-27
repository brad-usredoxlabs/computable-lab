/**
 * Governance record schemas: role-grant, signature, audit-event.
 *
 * The harness loads the REAL schemas from disk via the repo's own
 * SchemaLoader + SchemaRegistry + AjvValidator pipeline (same order as
 * server.ts), so this test exercises exactly what the store enforces.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

describe('governance schemas (role-grant, signature, audit-event)', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const schemaDir = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');
    const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
  });

  it('loads role-grant, signature and audit-event with all $refs resolvable', () => {
    for (const name of ['role-grant.schema.yaml', 'signature.schema.yaml', 'audit-event.schema.yaml']) {
      expect(() => validator.validate({}, SCHEMA_ID(name))).not.toThrow();
    }
  });

  // --- role-grant -----------------------------------------------------------

  const validRoleGrant = {
    kind: 'role-grant',
    recordId: 'GRANT-TEST-1',
    userId: 'USR-TEST-1',
    roles: ['author', 'approver'],
  };

  it('accepts a minimal role-grant', () => {
    const ok = validator.validate(validRoleGrant, SCHEMA_ID('role-grant.schema.yaml'));
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects a role-grant without roles', () => {
    const { roles: _roles, ...withoutRoles } = validRoleGrant;
    const ok = validator.validate(withoutRoles, SCHEMA_ID('role-grant.schema.yaml'));
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'required')).toBe(true);
  });

  // --- signature ------------------------------------------------------------

  const validSignature = {
    kind: 'signature',
    recordId: 'SIG-TEST-1',
    signedBy: 'USR-TEST-1',
    action: 'approved',
    meaning: { code: 'approved' },
    subject: { recordId: 'DOC-TEST-1', gitCommit: 'a1b2c3d' },
    signedAt: '2026-09-26T00:00:00.000Z',
    authentication: { method: 'password_reauthentication' },
  };

  it('accepts a minimal signature', () => {
    const ok = validator.validate(validSignature, SCHEMA_ID('signature.schema.yaml'));
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects a signature with an unknown action', () => {
    const ok = validator.validate(
      { ...validSignature, action: 'not_a_real_action' },
      SCHEMA_ID('signature.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'enum' && e.path === '/action')).toBe(true);
  });

  // --- audit-event ----------------------------------------------------------

  const validAuditEvent = {
    kind: 'audit-event',
    recordId: 'EVT-TEST-1',
    actor: 'USR-TEST-1',
    action: 'state_changed',
    subjectType: 'document',
    subjectId: 'DOC-TEST-1',
    occurredAt: '2026-09-26T00:00:00.000Z',
  };

  it('accepts a minimal audit-event', () => {
    const ok = validator.validate(validAuditEvent, SCHEMA_ID('audit-event.schema.yaml'));
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects an audit-event with an uppercase action', () => {
    const ok = validator.validate(
      { ...validAuditEvent, action: 'Record_Created' },
      SCHEMA_ID('audit-event.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'pattern' && e.path === '/action')).toBe(true);
  });
});
