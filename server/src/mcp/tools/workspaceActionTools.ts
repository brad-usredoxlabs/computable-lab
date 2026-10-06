/**
 * PB-CH-1 — MCP/agent tool: workspace_action.
 *
 * The non-forced-loop registration site for the workspace-action proposal
 * (the assist chat path rides the forced `agent_intent` intent instead — the
 * deck_layout precedent). The HANDLER compiles the proposal through the SAME
 * compiler as the orchestrator branch and returns the outcome as a JSON tool
 * message. It NEVER emits stream events itself: the orchestrator's dispatch
 * branch is the ONE emitter of `agent_action` (two emit paths would let the
 * compile be bypassed or double-fired).
 *
 * The model proposes VERBS AND TERMS; the server resolves terms through
 * ResolveSpine + the declarative surfaces registry and store-verifies every
 * id. An invented record id dies at UNKNOWN_RECORD — Ajv-validity is not
 * resolution.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { loadDefaultSurfacesRegistry } from '../../surfaces/surfaces.js';
import { compileWorkspaceAction } from '../../ai/compileWorkspaceAction.js';

const targetShape = z.object({
  kind: z.enum(['protocol-step', 'record', 'ontology']).describe('Target discriminator.'),
  protocolId: z.string().optional().describe('protocol-step: an EXISTING protocol record id (store-verified).'),
  stepId: z.string().optional().describe('protocol-step: an existing stepId in that protocol.'),
  id: z.string().optional().describe('record/ontology: an existing record id or CURIE — the server verifies it; never invent one.'),
  type: z.string().optional().describe('record: the record type (e.g. "material", "protocol").'),
  label: z.string().optional().describe('A TERM in the biologist\'s words for the server to resolve, or a display label.'),
});

export function registerWorkspaceActionTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const resolveSpine = createResolveSpineFromContext(ctx);
  const surfaces = loadDefaultSurfacesRegistry(ctx.schemaDir);

  dualRegister(server, registry,
    'workspace_action',
    'Propose a workspace action: focus the investigation on a target (protocol-step, record, or ontology ref/TERM) or open a registered surface. VERBS AND TERMS ONLY — the server compiles the proposal: terms resolve through the lab resolve-spine + surface registry, every id is store-verified, and an invented id is REJECTED. Only a resolved action can reach the client; nothing is written.',
    {
      action: z.enum(['focus', 'open-surface']).describe('The declared verb. Unknown verbs are rejected by the registered agent-action schema.'),
      target: targetShape.optional().describe('focus: what to retarget to. A TERM ({kind:"record", label:"HepG2 cells"}) is resolved server-side; protocol-step targets must cite protocolId+stepId the protocol actually has.'),
      surface: z.string().optional().describe('open-surface: a registered surface id (see the surfaces registry).'),
      contextNote: z.string().optional().describe('A human-readable note; it never overrides the authoritative resolved label.'),
    },
    async (args) => {
      try {
        const proposal: Record<string, unknown> = {
          action: args.action,
          ...(args.target !== undefined ? { target: args.target } : {}),
          ...(args.surface !== undefined ? { surface: args.surface } : {}),
          ...(args.contextNote !== undefined ? { contextNote: args.contextNote } : {}),
        };
        const compiled = await compileWorkspaceAction(proposal, { resolveSpine, surfaces, store: ctx.store });
        // Data ONLY — this handler never emits stream events. The orchestrator
        // branch is the single emitter of agent_action.
        if (compiled.ok) {
          return jsonResult({ ok: true, action: compiled.action });
        }
        return jsonResult({ ok: false, diagnostics: compiled.diagnostics });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
