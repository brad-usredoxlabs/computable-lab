/**
 * Unit tests for the opt-in ownership-defaults migration (§T13 / OWN-13).
 *
 * Contract proven here (RED first):
 *   1. dry-run (default) plans the differing ACLs and performs ZERO writes;
 *   2. --apply updates exactly the differing ACLs: visibility flips to the
 *      declared visibility and ownerUserId becomes the document's
 *      labOwnerUserId, with commit message `applyOwnershipDefaults: <acl-id>`;
 *   3. idempotency: a second pass after --apply plans nothing;
 *   4. a record with NO applicable rule is SKIPped — never a guessed owner;
 *   5. the resolved data dir is an injected string (the core never reads
 *      config; main() wires loadConfig).
 *
 * Vacuity rule: MemoryRecordStore.validate() always returns valid:true —
 * nothing here asserts validation/422 behaviour; assertions are on the plan
 * list and the spy'd update calls.
 */
import { describe, expect, it } from 'vitest';
import { MemoryRecordStore } from '../test-support/MemoryRecordStore.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { UpdateRecordOptions } from '../store/types.js';
import {
  OWNERSHIP_POLICY_SCHEMA_ID,
  OwnershipPolicyService,
} from '../security/OwnershipPolicyService.js';
import {
  ACCESS_POLICY_SCHEMA_ID,
  applyOwnershipDefaults,
  type MigrationReport,
} from './applyOwnershipDefaults.js';

/** Recording subclass: every update() call is captured for assertion. */
class RecordingMemoryRecordStore extends MemoryRecordStore {
  readonly updates: UpdateRecordOptions[] = [];

  async update(options: UpdateRecordOptions): Promise<ReturnType<MemoryRecordStore['update']>> {
    this.updates.push(options);
    return super.update(options);
  }
}

function docEnv(overrides: Record<string, unknown> = {}): RecordEnvelope {
  return {
    recordId: 'OWN-LAB-DEFAULT',
    schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
    payload: {
      kind: 'ownership-policy',
      recordId: 'OWN-LAB-DEFAULT',
      title: 'Lab policy',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      fallback: {
        owner: 'creator',
        visibility: 'private',
        filedTo: 'none',
        editRoles: ['owner'],
        shareTargets: ['user'],
      },
      kindRules: [
        {
          kind: 'instrument',
          owner: 'lab',
          visibility: 'public',
          filedTo: 'none',
          editRoles: ['owner', 'admin'],
          shareTargets: ['user', 'group', 'lab'],
          defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }],
        },
        {
          kind: 'local-protocol',
          owner: 'creator',
          visibility: 'private',
          filedTo: 'active-project',
          editRoles: ['owner', 'editor'],
          shareTargets: ['project', 'lab'],
        },
        ...((overrides.kindRules as unknown[]) ?? []),
      ],
      ...(overrides.fallback !== undefined ? { fallback: overrides.fallback } : {}),
    },
  };
}

function aclEnv(opts: {
  recordId: string;
  resourceId: string;
  resourceKind: string;
  visibility: string;
  ownerUserId: string;
}): RecordEnvelope {
  return {
    recordId: opts.recordId,
    schemaId: ACCESS_POLICY_SCHEMA_ID,
    payload: {
      kind: 'access-policy',
      recordId: opts.recordId,
      resourceRef: { kind: 'record', id: opts.resourceId, type: opts.resourceKind },
      visibility: opts.visibility,
      ownerUserId: opts.ownerUserId,
      grants: [],
    },
  };
}

const LAB_DIR = '/test-data-dir/never-real';

describe('applyOwnershipDefaults (opt-in defaults migration, §T13)', () => {
  it('dry-run (default) plans the differing ACLs and writes NOTHING', async () => {
    const store = new RecordingMemoryRecordStore([
      docEnv(),
      aclEnv({
        recordId: 'ACL-INST-1',
        resourceId: 'INST-1',
        resourceKind: 'instrument',
        visibility: 'private',
        ownerUserId: 'USR-BRAD',
      }),
    ]);

    const report: MigrationReport = await applyOwnershipDefaults({
      store,
      service: new OwnershipPolicyService(store),
      resolvedDir: LAB_DIR,
      apply: false,
    });

    expect(report.resolvedDir).toBe(LAB_DIR);
    expect(report.planned).toHaveLength(1);
    const change = report.planned[0]!;
    expect(change.aclId).toBe('ACL-INST-1');
    expect(change.kind).toBe('instrument');
    expect(change.fromVisibility).toBe('private');
    expect(change.toVisibility).toBe('public');
    expect(change.ruleRecordId).toBe('OWN-LAB-DEFAULT');
    // The dry-run promise: ZERO store.update calls.
    expect(store.updates).toHaveLength(0);
  });

  it('--apply flips visibility and owner to the declared lab defaults, with the commit message', async () => {
    const store = new RecordingMemoryRecordStore([
      docEnv(),
      aclEnv({
        recordId: 'ACL-INST-1',
        resourceId: 'INST-1',
        resourceKind: 'instrument',
        visibility: 'private',
        ownerUserId: 'USR-BRAD',
      }),
    ]);

    const report = await applyOwnershipDefaults({
      store,
      service: new OwnershipPolicyService(store),
      resolvedDir: LAB_DIR,
      apply: true,
    });

    expect(store.updates).toHaveLength(1);
    const update = store.updates[0]!;
    expect(update.message).toBe('applyOwnershipDefaults: ACL-INST-1');
    const payload = update.envelope.payload as Record<string, unknown>;
    expect(payload.visibility).toBe('public');
    expect(payload.ownerUserId).toBe('USR-LOCAL-ADMIN');
    expect(report.applied).toHaveLength(1);

    // The store now holds the migrated policy.
    const stored = await store.get('ACL-INST-1');
    expect((stored!.payload as Record<string, unknown>).visibility).toBe('public');
    expect((stored!.payload as Record<string, unknown>).ownerUserId).toBe('USR-LOCAL-ADMIN');
  });

  it('idempotent: a second pass after --apply plans nothing', async () => {
    const store = new RecordingMemoryRecordStore([
      docEnv(),
      aclEnv({
        recordId: 'ACL-INST-1',
        resourceId: 'INST-1',
        resourceKind: 'instrument',
        visibility: 'private',
        ownerUserId: 'USR-BRAD',
      }),
    ]);

    await applyOwnershipDefaults({ store, service: new OwnershipPolicyService(store), resolvedDir: LAB_DIR, apply: true });
    const updateCountAfterApply = store.updates.length;

    const second = await applyOwnershipDefaults({ store, service: new OwnershipPolicyService(store), resolvedDir: LAB_DIR, apply: false });
    expect(second.planned).toHaveLength(0);
    expect(store.updates).toHaveLength(updateCountAfterApply);

    // Even a second --apply writes nothing new.
    const third = await applyOwnershipDefaults({ store, service: new OwnershipPolicyService(store), resolvedDir: LAB_DIR, apply: true });
    expect(third.planned).toHaveLength(0);
    expect(third.applied).toHaveLength(0);
    expect(store.updates).toHaveLength(updateCountAfterApply);
  });

  it('SKIPs a record with no applicable rule and never guesses an owner', async () => {
    // No ownership-policy document at all -> ruleFor returns null for every kind.
    const store = new RecordingMemoryRecordStore([
      aclEnv({
        recordId: 'ACL-INST-1',
        resourceId: 'INST-1',
        resourceKind: 'instrument',
        visibility: 'private',
        ownerUserId: 'USR-BRAD',
      }),
    ]);

    const report = await applyOwnershipDefaults({
      store,
      service: new OwnershipPolicyService(store),
      resolvedDir: LAB_DIR,
      apply: true, // even with --apply, a no-rule record must not be touched
    });

    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]!.aclId).toBe('ACL-INST-1');
    expect(report.skipped[0]!.reason).toContain('no applicable rule');
    expect(report.planned).toHaveLength(0);
    expect(report.applied).toHaveLength(0);
    expect(store.updates).toHaveLength(0);

    // The untouched record keeps its stamped owner — nothing was guessed.
    const stored = await store.get('ACL-INST-1');
    expect((stored!.payload as Record<string, unknown>).ownerUserId).toBe('USR-BRAD');
    expect((stored!.payload as Record<string, unknown>).visibility).toBe('private');
  });

  it('takes the resolved data dir as an injected string (core never reads config)', async () => {
    // The core signature accepts an arbitrary dir string; nothing in the core
    // touches process.env or config.yaml. A creator-private rule that already
    // matches the stamped ACL produces zero planned changes.
    const store = new RecordingMemoryRecordStore([
      docEnv(),
      aclEnv({
        recordId: 'ACL-LP-1',
        resourceId: 'LP-1',
        resourceKind: 'local-protocol',
        visibility: 'private',
        ownerUserId: 'USR-BRAD',
      }),
    ]);

    const report = await applyOwnershipDefaults({
      store,
      service: new OwnershipPolicyService(store),
      resolvedDir: '/some/other/dir',
      apply: false,
    });

    expect(report.resolvedDir).toBe('/some/other/dir');
    expect(report.planned).toHaveLength(0);
    expect(store.updates).toHaveLength(0);
  });
});
