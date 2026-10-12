/**
 * MCP/AI tools for the lab ownership & sharing policy (OWN-10, plan §T10).
 *
 * The document is DATA; the AI edits it like any other record. Writes are
 * gated by the document's own ACL (admin), never by a role baked into this
 * file.
 *
 * ACTOR RULE (spec recon, orchestrator-adjudicated OQ2): there is NO session
 * actor anywhere in the MCP tool context — ToolRegistry handlers receive only
 * `args` (ai/ToolRegistry.ts:17-24), dualRegister's registry wrapper passes
 * `{} as never` as the MCP callback's second parameter (dualRegister.ts:41),
 * and the only actor in the existing write-adjacent materials tool is a
 * model-supplied free-text provenance label (materialsAiTools.ts), never fed
 * to canAccess. Therefore the D7 admin gate STAYS at the API layer:
 * PUT /settings/ownership-policy (api/handlers/OwnershipPolicyHandlers.ts)
 * enforces the DEV-2 credential gate and canAccess(userId, 'admin', record)
 * for humans/UI. These tools follow the recordTools precedent (store-level
 * write through the same store.update the handler calls) plus the §T10
 * mitigation: the update description tells the model to describe the change
 * to the user and get confirmation before calling, and the user's `reason`
 * is recorded in the git commit message for attribution. No identity
 * machinery (AuthorizationService, LocalIdentityService, resolveRequestUser,
 * userId args) belongs in this file — inventing one is forbidden by the plan.
 *
 * Load-bearing mirrors of the OWN-9 handler (OwnershipPolicyHandlers.ts):
 * - by-id fallback: activeLabPolicy() lists by kind and is blind to the
 *   seed-dir copy of the default document at boot, while store.get-by-id
 *   finds it (AS-ORCH-L1-042). Both tools resolve through the same fallback.
 * - DEV-1: `resolved` is the coerced document when activeLabPolicy() is null.
 * - DEV-3: store.validate takes a RecordEnvelope, not {schemaId, payload}.
 * - Seed write trap: store.update fails for a seed-only record; a failed
 *   update is surfaced honestly, never as success:true.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import {
  coerceOwnershipPolicy,
  DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
  OWNERSHIP_POLICY_SCHEMA_ID,
} from '../../security/OwnershipPolicyService.js';

const KindRuleSchema = z.object({
  kind: z.string().describe('Record kind this rule applies to (e.g. local-protocol)'),
  owner: z.enum(['creator', 'lab']),
  visibility: z.enum(['private', 'shared', 'public']),
  filedTo: z.enum(['none', 'active-project']),
  editRoles: z.array(z.enum(['owner', 'admin', 'editor', 'operator', 'qa', 'viewer'])),
  shareTargets: z.array(z.enum(['user', 'group', 'project', 'lab'])),
  publishRole: z.enum(['owner', 'admin', 'editor', 'operator', 'qa', 'viewer']).optional(),
});

export function registerOwnershipPolicyTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  /**
   * Resolve the current policy document envelope. Mirrors the OWN-9 handler's
   * load-bearing by-id fallback: activeLabPolicy() is seed-blind at boot while
   * get-by-id finds the seed copy. Null = nothing installed.
   */
  async function resolveDocument() {
    const doc = await ctx.ownershipPolicyService.activeLabPolicy();
    if (doc) return ctx.store.get(doc.recordId);
    return ctx.store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);
  }

  dualRegister(server, registry,
    'ownership_policy_get',
    'Read the lab ownership & sharing policy: per-kind defaults for owner, visibility, project filing, edit roles and share targets. Call this before proposing a change.',
    {},
    async () => {
      try {
        const doc = await ctx.ownershipPolicyService.activeLabPolicy();
        const record = await resolveDocument();
        if (!record) {
          return errorResult(`No ownership-policy document installed (expected ${DEFAULT_OWNERSHIP_POLICY_RECORD_ID}).`);
        }
        // DEV-1 shape (OWN-9 GET semantics): when activeLabPolicy() is
        // seed-blind-null, coerce the found envelope so `resolved` carries the
        // honest view; a corrupt stored doc yields resolved: null deliberately.
        return jsonResult({ record, resolved: doc ?? coerceOwnershipPolicy(record) });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(server, registry,
    'ownership_policy_update',
    'Replace the lab ownership & sharing policy document. Requires admin on the document. Describe the change to the user and get confirmation before calling this.',
    {
      kindRules: z.array(KindRuleSchema).describe('Full replacement list of per-kind rules'),
      fallback: KindRuleSchema.omit({ kind: true }).describe('Rule for kinds not listed'),
      labOwnerUserId: z.string().describe('USR-* id that owns lab-owned records'),
      reason: z.string().optional().describe('Why this change is being made (recorded in the commit message)'),
    },
    async (args) => {
      try {
        const current = await resolveDocument();
        if (!current) {
          return errorResult(`No ownership-policy document installed; create ${DEFAULT_OWNERSHIP_POLICY_RECORD_ID} first.`);
        }

        // Read-modify-write, NOT a blind replace: spread the current payload,
        // then overwrite exactly the three fields this tool owns. `fallback`
        // and `kindRules` are full replacements per §T10; everything else
        // (title, description, scope, ...) survives untouched.
        const payload = {
          ...(current.payload as Record<string, unknown>),
          labOwnerUserId: args.labOwnerUserId,
          fallback: args.fallback,
          kindRules: args.kindRules,
        };

        // Validate FIRST (DEV-3 envelope form — store.validate takes a
        // RecordEnvelope). The ToolRegistry path bypasses zod, so this is the
        // gate that refuses malformed payloads and names what failed.
        const validation = await ctx.store.validate({
          recordId: current.recordId,
          schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
          payload,
        });
        if (!validation.valid) {
          return errorResult(`Invalid policy: ${JSON.stringify(validation.errors)}`);
        }

        const message = args.reason ? `Update ownership-policy: ${args.reason}` : 'Update ownership-policy';
        const result = await ctx.store.update({
          envelope: { ...current, payload },
          message,
        });
        // Seed write trap: store.update fails for a seed-only record. Surface
        // the failure honestly — never report success on a failed update.
        if (!result.success) {
          return errorResult(`Ownership-policy update failed: ${result.error ?? 'unknown error'}`);
        }
        return jsonResult({
          success: result.success,
          record: result.envelope ?? await ctx.store.get(current.recordId),
          validation: result.validation,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
