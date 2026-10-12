/**
 * OwnershipPolicyTools — OWN-10 AI tool contract test (plan §T10).
 *
 * Harness: the MaterialsAiTools.test.ts pattern — REAL RecordStoreImpl via
 * initializeApp (NOT MemoryRecordStore, whose validate is an always-valid
 * stub), so the malformed-update refusal is proven through the real Ajv
 * pipeline. CONFIG_PATH is pinned to a non-existent tmp config (the
 * VendorDocumentTools.test.ts precedent) so initializeApp falls to the
 * embedded default repository with recordsDir = the tmp test dir instead of
 * the shared 'records' directory from config.yaml — without this the
 * beforeAll hook times out scanning the shared repo (observed on the base
 * run of this very suite).
 *
 * Seed-trap note (spec correction 3): at boot the OWN-LAB-DEFAULT seed lives
 * only under records/seed/identity/, which activeLabPolicy()'s kind-list
 * merge is blind to; store.get-by-id finds it but store.update cannot write
 * it. So the test store.create()s the document into the tmp records dir
 * first — exactly what a real lab must do before the AI can edit it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initializeApp, type AppContext } from '../../server.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import {
  DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
  OWNERSHIP_POLICY_SCHEMA_ID,
} from '../../security/OwnershipPolicyService.js';
import { registerOwnershipPolicyTools } from './ownershipPolicyTools.js';

const textOf = (result: CallToolResult): string =>
  result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';

describe('ownership-policy AI MCP tools', () => {
  let ctx: AppContext;
  let registry: ToolRegistry;
  const repoRoot = resolve(process.cwd());
  const recordsDir = resolve(repoRoot, 'tmp/ownership-policy-tools-test/records');
  const originalConfigPath = process.env.CONFIG_PATH;

  beforeAll(async () => {
    process.env.CONFIG_PATH = resolve(repoRoot, 'tmp/ownership-policy-tools-test/missing-config.yaml');
    await mkdir(recordsDir, { recursive: true });

    ctx = await initializeApp(repoRoot, {
      recordsDir: 'tmp/ownership-policy-tools-test/records',
      logLevel: 'silent',
    });

    // Seed-trap fix: the document must exist in the repo (not just the seed
    // dir) before store.update can write it. A previous interrupted run (e.g.
    // a hook timeout) can leave the record committed in the embedded worktree,
    // so clear it first — but only when it lives under this test's own records
    // dir, never a real lab document of the same id.
    const existing = await ctx.store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);
    if (existing && (existing.meta?.path ?? '').includes('ownership-policy-tools-test')) {
      await ctx.store.delete({ recordId: DEFAULT_OWNERSHIP_POLICY_RECORD_ID });
    }

    const created = await ctx.store.create({
      envelope: {
        recordId: DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
        schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
        payload: {
          kind: 'ownership-policy',
          recordId: DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
          title: 'Lab Ownership & Sharing Policy',
          description: 'Test policy document for the ownership-policy AI tools.',
          scope: { type: 'lab', id: 'lab' },
          labOwnerUserId: 'USR-LOCAL-ADMIN',
          fallback: {
            owner: 'creator',
            visibility: 'private',
            filedTo: 'none',
            editRoles: ['owner', 'editor'],
            shareTargets: ['user', 'group', 'project', 'lab'],
          },
          kindRules: [
            {
              kind: 'local-protocol',
              owner: 'creator',
              visibility: 'private',
              filedTo: 'active-project',
              editRoles: ['owner', 'editor'],
              shareTargets: ['project', 'lab', 'user', 'group'],
            },
          ],
        },
      },
    });
    expect(created.success).toBe(true);

    registry = new ToolRegistry();
    registerOwnershipPolicyTools(new McpServer({ name: 'test-ownership-policy', version: '1.0.0' }), ctx, registry);
  }, 60_000); // initializeApp boot + seed-create exceed vitest's default 10s hook
  // timeout on this disk (the same timeout is what fails MaterialsAiTools.test.ts
  // on the base run of this suite); a test-local hook timeout, no shared config change.

  afterAll(async () => {
    if (originalConfigPath === undefined) delete process.env.CONFIG_PATH;
    else process.env.CONFIG_PATH = originalConfigPath;
    await rm(resolve(repoRoot, 'tmp/ownership-policy-tools-test'), { recursive: true, force: true });
  });

  it('reads the resolved policy document through the tool registry', async () => {
    const tool = registry.get('ownership_policy_get');
    expect(tool).toBeDefined();

    const result = await tool!.handler({});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(textOf(result));

    // resolved is the coerced document: kindRules is a keyed map
    // (OwnershipPolicyService.ts:115-120), NOT the array form.
    expect(parsed.resolved.kindRules['local-protocol'].filedTo).toBe('active-project');
    expect(parsed.resolved.labOwnerUserId).toBe('USR-LOCAL-ADMIN');
    expect(parsed.record.recordId).toBe(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);
  });

  it('refuses a malformed kindRules update, naming what failed, without touching the document', async () => {
    const tool = registry.get('ownership_policy_update');
    expect(tool).toBeDefined();

    // Non-vacuity: the ToolRegistry path bypasses zod (dualRegister.ts:39-43
    // passes raw args), so this refusal must come from the handler's
    // validate-first step. The entry lacks all five required KindRule fields.
    const bad = await tool!.handler({
      kindRules: [{ kind: 'protocol' }],
      fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: [], shareTargets: [] },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
    });
    const badText = textOf(bad);
    expect(bad.isError).toBe(true);
    expect(badText).toMatch(/Invalid policy/);
    // validation.errors carries the JSON-Schema instancePaths — the failing
    // path must be named.
    expect(badText).toMatch(/kindRules/);

    // The document on disk did NOT change.
    const after = await ctx.store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);
    expect(after).not.toBeNull();
    const kindRules = (after!.payload as { kindRules: Array<{ kind: string }> }).kindRules;
    expect(kindRules.some((r) => r.kind === 'local-protocol')).toBe(true);
    expect(kindRules.some((r) => r.kind === 'protocol')).toBe(false);
  });

  it('writes a valid update read-modify-write, records the reason in the commit message, and preserves fields the update never names', async () => {
    const tool = registry.get('ownership_policy_update');
    expect(tool).toBeDefined();

    const good = await tool!.handler({
      kindRules: [
        {
          kind: 'local-protocol',
          owner: 'creator',
          visibility: 'private',
          filedTo: 'active-project',
          editRoles: ['owner', 'editor'],
          shareTargets: ['project', 'lab', 'user', 'group'],
        },
        {
          kind: 'material',
          owner: 'lab',
          visibility: 'public',
          filedTo: 'none',
          editRoles: ['owner', 'admin'],
          shareTargets: ['user', 'group', 'lab'],
        },
      ],
      fallback: {
        owner: 'creator',
        visibility: 'private',
        filedTo: 'none',
        editRoles: ['owner', 'editor'],
        shareTargets: ['user', 'group', 'project', 'lab'],
      },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      reason: 'open materials to the lab',
    });
    expect(good.isError).toBeFalsy();
    const parsed = JSON.parse(textOf(good));
    expect(parsed.success).toBe(true);
    // `reason` rides the git commit message via UpdateRecordOptions.message
    // (verified by reading the message construction in ownershipPolicyTools.ts;
    // asserting the commit text through the embedded repo is out of scope for
    // the unit test per the spec).

    // Re-read through the get tool: the new rule is present AND fields the
    // update never named survived — proof of the read-modify-write spread
    // over a blind replace (mutation probe: dropping `...current.payload`
    // flips this assertion RED).
    const read = await registry.get('ownership_policy_get')!.handler({});
    const reread = JSON.parse(textOf(read));
    expect(reread.resolved.kindRules['material']).toBeDefined();
    expect(reread.resolved.kindRules['material'].owner).toBe('lab');
    expect(reread.resolved.kindRules['local-protocol'].filedTo).toBe('active-project');
    expect(reread.record.payload.title).toBe('Lab Ownership & Sharing Policy');
    expect(reread.record.payload.description).toBe('Test policy document for the ownership-policy AI tools.');
    expect(reread.record.payload.scope).toEqual({ type: 'lab', id: 'lab' });
  });
});
