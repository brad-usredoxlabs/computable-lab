// server/src/security/OwnershipPolicyService.test.ts
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { MemoryRecordStore } from '../test-support/MemoryRecordStore.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import {
  OWNERSHIP_POLICY_SCHEMA_ID,
  OwnershipPolicyService,
} from './OwnershipPolicyService.js';

function docEnv(): RecordEnvelope {
  return {
    recordId: 'OWN-LAB-DEFAULT',
    schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
    payload: {
      kind: 'ownership-policy',
      recordId: 'OWN-LAB-DEFAULT',
      title: 'Lab policy',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
      kindRules: [
        { kind: 'local-protocol', owner: 'creator', visibility: 'private', filedTo: 'active-project', editRoles: ['owner', 'editor'], shareTargets: ['project', 'lab'] },
        { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
      ],
    },
  };
}

describe('OwnershipPolicyService', () => {
  it('resolves a kind rule with its origin', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const rule = await service.ruleFor('instrument');
    expect(rule?.owner).toBe('lab');
    expect(rule?.visibility).toBe('public');
    expect(rule?.origin).toEqual({ policyRecordId: 'OWN-LAB-DEFAULT', source: 'kind' });
  });

  it('falls back for an unlisted kind', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const rule = await service.ruleFor('claim');
    expect(rule?.visibility).toBe('private');
    expect(rule?.origin.source).toBe('fallback');
  });

  it('resolves create defaults: the CREATING user owns every kind (OWN-15 ruling R2)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    // OWN-15 (flips the defect-certifying assertion): `owner: lab` survives only
    // as visibility/grants semantics — defaultsForCreate NEVER substitutes the
    // document's labOwnerUserId for the creator at create-stamp time.
    expect(defaults?.ownerUserId).toBe('USR-BRAD');
    expect(defaults?.visibility).toBe('public');
  });

  it('resolves create defaults: creator-owned kinds file into the active project', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-BRAD' });
    expect(defaults?.ownerUserId).toBe('USR-BRAD');
    expect(defaults?.filedTo).toBe('active-project');
  });

  it('returns null when no document is installed (no declared defaults)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([]));
    expect(await service.ruleFor('protocol')).toBeNull();
    expect(await service.defaultsForCreate({ kind: 'protocol', creatorUserId: 'USR-BRAD' })).toBeNull();
  });

  it('carries the declared default grants (multi-user: the lab admin group)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    // OWN-15: the declared GRANT survives (it is the multi-user lever); what no
    // longer survives is the lab-owner SUBSTITUTION (asserted above). Resolvability
    // of the declared principal is enforced at MINT (AuthorizationService
    // validateDeclaredGrants — see LocalAuthorization.test.ts OWN-15 cases), not here.
    expect(defaults?.grants).toEqual([{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }]);
  });

  it('evaluates creator-owned defaults PER USER — two authors get two private records', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const a = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-A' });
    const b = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-B' });
    expect(a?.ownerUserId).toBe('USR-A');
    expect(b?.ownerUserId).toBe('USR-B');
    expect(a?.grants).toEqual([]);
    expect(b?.grants).toEqual([]);
  });

  it('reports the allowed share targets for a kind', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    expect(await service.shareTargetsFor('instrument')).toEqual(['user', 'group', 'lab']);
  });

  // OWN-15 (criterion 2 / bait 9): the seeded admin group is a REAL record that
  // validates against its own schema through the same Ajv pipeline the record
  // store uses — ontology terms (kind: group, GRP-/USR- id shapes) are pinned,
  // not asserted by prose.
  it('the seeded GRP-LAB-ADMINS group validates against group.schema.yaml (Ajv authority)', async () => {
    const repoRoot = resolve(process.cwd(), '..');
    const schemaRoot = join(repoRoot, 'schema');
    const registry = createSchemaRegistry();
    const validator = createValidator({ strict: false });
    const contents = new Map<string, string>();
    for (const path of ['core/common.schema.yaml', 'identity/group.schema.yaml']) {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    }
    const loaded = loadSchemasFromContent(contents);
    expect(loaded.errors).toEqual([]);
    registry.addSchemas(loaded.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }

    const groupPath = join(repoRoot, 'records/seed/group/GRP-LAB-ADMINS__lab-administrators.yaml');
    const raw = parseYaml(await readFile(groupPath, 'utf8')) as Record<string, unknown>;
    const { $schema: _schema, ...payload } = raw;
    const result = validator.validate(payload, 'https://computable-lab.com/schema/computable-lab/group.schema.yaml');
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);

    // And the group surface actually resolves it: the mint-side resolvability
    // check (AuthorizationService.groupPrincipalResolves) reads store.list
    // seed merges — a MemoryRecordStore with the seeded payload must satisfy it.
    const envelope: RecordEnvelope = {
      recordId: String(payload.recordId),
      schemaId: 'https://computable-lab.com/schema/computable-lab/group.schema.yaml',
      payload,
    };
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv(), envelope]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    expect(defaults?.grants).toEqual([{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }]);
  });

  // OWN-15 (criterion 3, declaration-side): the shipped ownership-policy lint
  // spec carries the defaultGrants principal-shape rule, the REAL seed passes
  // it, and a mistyped principal fails it with the NAMED rule. (Existence of the
  // named principal is enforced at MINT in TS — see LocalAuthorization.test.ts
  // OWN-15 cases — because the mint persists with skipLint: true.)
  it('ownership-policy lint: the declared defaultGrants rule exists, the real seed passes, a mistyped principal fails with the NAMED rule', async () => {
    const schemaRoot = resolve(process.cwd(), '..', 'schema');
    const loaded = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
    // Pre-existing unrelated loader noise (e.g. core/lab-state.lint.yaml) is not
    // this test's business; assert OUR spec file loads clean.
    expect(loaded.errors.filter((e) => e.path.includes('ownership-policy'))).toEqual([]);
    const spec = loaded.specs.find((s) => s.spec.schemaId === OWNERSHIP_POLICY_SCHEMA_ID);
    expect(spec, 'ownership-policy lint spec not loaded').toBeDefined();
    const rule = spec!.spec.rules.find((r) => r.id === 'ownership-policy-default-grants-carry-typed-principal-ids');
    expect(rule, 'OWN-15 defaultGrants lint rule missing').toBeDefined();

    const engine = new LintEngine();
    engine.addSpec(spec!.name, spec!.spec);

    // The REAL seed file on disk passes its own lint.
    const seedPath = join(resolve(process.cwd(), '..'), 'records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml');
    const seedRaw = parseYaml(await readFile(seedPath, 'utf8')) as Record<string, unknown>;
    const { $schema: _schema, ...seedPayload } = seedRaw;
    const seedResult = engine.lint(seedPayload, OWNERSHIP_POLICY_SCHEMA_ID);
    expect(seedResult.valid, JSON.stringify(seedResult.violations)).toBe(true);

    // A mistyped principalId (group grant naming a USR-*) fails with the NAMED rule.
    const mutated = structuredClone(seedPayload) as Record<string, unknown>;
    const kindRules = mutated.kindRules as Array<Record<string, unknown>>;
    const materialRule = kindRules.find((k) => k.kind === 'material');
    expect(materialRule).toBeDefined();
    (materialRule!.defaultGrants as Array<Record<string, unknown>>)[0]!.principalId = 'USR-NOT-A-GROUP';
    const badResult = engine.lint(mutated, OWNERSHIP_POLICY_SCHEMA_ID);
    expect(badResult.valid).toBe(false);
    expect(badResult.violations.some((v) => v.ruleId === 'ownership-policy-default-grants-carry-typed-principal-ids')).toBe(true);
  });
});
