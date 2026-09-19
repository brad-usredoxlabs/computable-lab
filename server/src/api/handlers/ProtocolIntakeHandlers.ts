/**
 * ProtocolIntakeHandlers — read + redraft surface for the corpus-intake
 * review loop.
 *
 *   GET  /protocol-ide/intake/trees                  list decision trees (?documentId= filter)
 *   GET  /protocol-ide/intake/trees/:treeId          tree + all its subgraph proposals
 *   POST /protocol-ide/intake/proposals/:proposalId/prompt    attach redraft instruction
 *   POST /protocol-ide/intake/proposals/:proposalId/redraft   re-draft one subgraph
 *
 * Records are the truth: trees and proposals are plain store records written
 * by ProtocolIntakeService; these handlers read/mutate them through the same
 * store and never invent review state.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import { runChatbotCompile } from '../../ai/runChatbotCompile.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import {
  ProtocolIntakeService,
  PROTOCOL_DECISION_TREE_SCHEMA_ID,
  SUBGRAPH_PROPOSAL_SCHEMA_ID,
  type IngestPdfResult,
} from '../../protocol-intake/ProtocolIntakeService.js';
import type { ProtocolCandidate } from '../../ingestion/vendor-protocol/types.js';
import type { RunChatbotCompileResult } from '../../ai/runChatbotCompile.js';

export interface ProtocolIntakeDepsHolder {
  /** Override the compiler edge (tests); default reads ctx.extractionRunner at call time. */
  compileRunner?: (args: {
    prompt: string;
    candidate: ProtocolCandidate;
    deterministicOnly: boolean;
  }) => Promise<RunChatbotCompileResult>;
}

interface ProposalPayload {
  kind: string;
  recordId: string;
  documentId?: string;
  state?: string;
  reviewPrompt?: string;
  revision?: number;
  notes?: string;
  treeRef?: { kind: string; id: string; type: string };
  [key: string]: unknown;
}

interface TreeSummary {
  recordId: string;
  documentId: string;
  status?: string;
  generatedAt?: string;
  axisCount: number;
  scaleLevels: string[];
  proposalCount: number;
  sourcePdf?: Record<string, unknown>;
}

function toSummary(tree: Record<string, unknown>, proposalCount: number): TreeSummary {
  const axes = Array.isArray(tree['axes']) ? (tree['axes'] as unknown[]) : [];
  const scaleAxis = tree['scaleAxis'] as { options?: Array<{ level?: string }> } | undefined;
  return {
    recordId: String(tree['recordId'] ?? ''),
    documentId: String(tree['documentId'] ?? ''),
    ...(typeof tree['status'] === 'string' ? { status: tree['status'] } : {}),
    ...(typeof tree['generatedAt'] === 'string' ? { generatedAt: tree['generatedAt'] } : {}),
    axisCount: axes.length,
    scaleLevels: (scaleAxis?.options ?? []).map((o) => String(o.level ?? '')).filter(Boolean),
    proposalCount,
    ...(tree['sourcePdf'] && typeof tree['sourcePdf'] === 'object'
      ? { sourcePdf: tree['sourcePdf'] as Record<string, unknown> }
      : {}),
  };
}

export function createProtocolIntakeHandlers(ctx: AppContext, deps?: ProtocolIntakeDepsHolder) {
  const intakeService = () => {
    // Same compile edge the vendor-protocol MCP draft tool uses; read lazily
    // so late-initialized AI runtime state is picked up, and deterministic-
    // only (compile false in the service) when the runtime is unavailable.
    const runtimeCompileRunner = ctx.extractionRunner
      ? ({ prompt, deterministicOnly }: { prompt: string; deterministicOnly: boolean }) =>
        runChatbotCompile({
          prompt,
          deterministicOnly,
          deps: {
            extractionService: ctx.extractionRunner!,
            llmClient: null,
            searchLabwareByHint: createLabwareLookup(ctx.store),
            store: ctx.store,
          },
        })
      : undefined;
    const compileRunner = deps?.compileRunner ?? runtimeCompileRunner;
    return new ProtocolIntakeService({
      workspaceRoot: ctx.workspaceRoot,
      store: ctx.store,
      validator: ctx.validator,
      ...(compileRunner ? { compileRunner } : {}),
    });
  };

  async function proposalsFor(treeId: string): Promise<ProposalPayload[]> {
    const envelopes = await ctx.store.list({ kind: 'subgraph-proposal' });
    return envelopes
      .map((e) => e.payload as unknown as ProposalPayload)
      .filter((p) => p.treeRef?.id === treeId)
      .sort((a, b) => a.recordId.localeCompare(b.recordId));
  }

  return {
    /** GET /protocol-ide/intake/trees?documentId= */
    async listTrees(
      request: FastifyRequest<{ Querystring: { documentId?: string } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      try {
        const documentIdFilter = typeof request.query?.documentId === 'string' && request.query.documentId.trim()
          ? request.query.documentId.trim()
          : undefined;
        const trees = await ctx.store.list({ kind: 'protocol-decision-tree' });
        const proposals = await ctx.store.list({ kind: 'subgraph-proposal' });
        const counts = new Map<string, number>();
        for (const envelope of proposals) {
          const payload = envelope.payload as unknown as ProposalPayload;
          const treeId = payload.treeRef?.id;
          if (treeId) counts.set(treeId, (counts.get(treeId) ?? 0) + 1);
        }
        let summaries = trees
          .map((e) => toSummary(e.payload as unknown as Record<string, unknown>, counts.get(String((e.payload as Record<string, unknown>)['recordId'] ?? '')) ?? 0))
          .sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
        if (documentIdFilter) {
          summaries = summaries.filter((s) => s.documentId === documentIdFilter);
        }
        reply.status(200);
        return { success: true, trees: summaries };
      } catch (err) {
        reply.status(500);
        return { error: 'INTAKE_TREES_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /** GET /protocol-ide/intake/trees/:treeId */
    async getTree(
      request: FastifyRequest<{ Params: { treeId: string } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      try {
        const treeId = request.params.treeId?.trim();
        if (!treeId || !treeId.startsWith('PDT-')) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'treeId must be a PDT- record id' };
        }
        const envelope = await ctx.store.get(treeId);
        if (!envelope || envelope.schemaId !== PROTOCOL_DECISION_TREE_SCHEMA_ID) {
          reply.status(404);
          return { error: 'TREE_NOT_FOUND', message: `Decision tree not found: ${treeId}` };
        }
        const treePayload = envelope.payload as unknown as Record<string, unknown>;
        const proposals = await proposalsFor(treeId);
        reply.status(200);
        return {
          success: true,
          tree: {
            ...toSummary(treePayload, proposals.length),
            axes: treePayload['axes'] ?? [],
            scaleAxis: treePayload['scaleAxis'] ?? { question: '', options: [] },
            notes: treePayload['notes'],
          },
          proposals,
        };
      } catch (err) {
        reply.status(500);
        return { error: 'INTAKE_TREE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /** POST /protocol-ide/intake/proposals/:proposalId/prompt { prompt } */
    async setProposalPrompt(
      request: FastifyRequest<{ Params: { proposalId: string }; Body: { prompt?: unknown } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      try {
        const prompt = typeof request.body?.prompt === 'string' ? request.body.prompt.trim() : '';
        if (!prompt) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'prompt is required' };
        }
        const envelope = await ctx.store.get(request.params.proposalId);
        const payload = envelope?.payload as unknown as ProposalPayload | undefined;
        if (!envelope || envelope.schemaId !== SUBGRAPH_PROPOSAL_SCHEMA_ID || !payload) {
          reply.status(404);
          return { error: 'PROPOSAL_NOT_FOUND', message: `Subgraph proposal not found: ${request.params.proposalId}` };
        }
        const updated: ProposalPayload = {
          ...payload,
          reviewPrompt: prompt,
          state: 'needs_prompt',
        };
        const result = await ctx.store.update({
          envelope: { recordId: envelope.recordId, schemaId: SUBGRAPH_PROPOSAL_SCHEMA_ID, payload: updated as unknown as Record<string, unknown> },
          message: `intake: redraft prompt on ${envelope.recordId}`,
        });
        if (!result.success) {
          reply.status(422);
          return { error: 'PROMPT_SAVE_FAILED', message: result.error ?? 'store.update failed' };
        }
        reply.status(200);
        return { success: true, proposal: updated };
      } catch (err) {
        reply.status(500);
        return { error: 'INTAKE_PROMPT_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },

    /** POST /protocol-ide/intake/proposals/:proposalId/redraft */
    async redraftProposal(
      request: FastifyRequest<{ Params: { proposalId: string } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      try {
        const envelope = await ctx.store.get(request.params.proposalId);
        if (!envelope || envelope.schemaId !== SUBGRAPH_PROPOSAL_SCHEMA_ID) {
          reply.status(404);
          return { error: 'PROPOSAL_NOT_FOUND', message: `Subgraph proposal not found: ${request.params.proposalId}` };
        }
        const result: IngestPdfResult = await intakeService().redraftProposal({
          proposalRecordId: envelope.recordId,
        });
        const failed = result.diagnostics.filter((d) => d.severity === 'error');
        if (failed.length > 0) {
          reply.status(422);
          return { success: false, diagnostics: result.diagnostics };
        }
        reply.status(200);
        return { success: true, ...result };
      } catch (err) {
        reply.status(500);
        return { error: 'INTAKE_REDRAFT_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export type ProtocolIntakeHandlers = ReturnType<typeof createProtocolIntakeHandlers>;
