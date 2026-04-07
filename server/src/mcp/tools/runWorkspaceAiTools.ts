import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { RunWorkspaceService } from '../../run-workspace/RunWorkspaceService.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerRunWorkspaceAiTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const service = new RunWorkspaceService(ctx.store);

  dualRegister(
    server,
    registry,
    'run_summarize',
    'Summarize a run by reading its linked records, event graph, measurements, and claims. Returns a structured summary with run intent, key materials, event count, measurement status, and open questions.',
    {
      runId: z.string().describe('The run record ID to summarize'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        const runPayload = workspace.run.payload;
        const events = workspace.eventGraph?.payload.events ?? [];
        const allAssignments = Object.values(workspace.wellRoleAssignmentsByContext).flat();

        const openQuestions: string[] = [];
        if (!workspace.eventGraph) openQuestions.push('No event graph attached — plan is missing.');
        if (workspace.wellGroups.length === 0) openQuestions.push('No well groups defined — biology layer is empty.');
        if (workspace.measurementContexts.length === 0) openQuestions.push('No measurement contexts — readouts not configured.');
        if (workspace.measurements.length === 0 && workspace.measurementContexts.length > 0) openQuestions.push('Measurement contexts exist but no measurements have been ingested.');
        if (workspace.claims.length === 0 && workspace.measurements.length > 0) openQuestions.push('Measurements exist but no claims have been drafted.');

        const contextsWithoutAssignments = workspace.measurementContexts.filter(
          (ctx) => !workspace.wellRoleAssignmentsByContext[ctx.recordId]?.length,
        );
        if (contextsWithoutAssignments.length > 0) {
          openQuestions.push(`${contextsWithoutAssignments.length} measurement context(s) have no well role assignments.`);
        }

        return jsonResult({
          runId: workspace.run.recordId,
          title: runPayload.title,
          status: runPayload.status,
          experimentId: runPayload.experimentId,
          studyId: runPayload.studyId,
          eventGraph: workspace.eventGraph
            ? {
                name: workspace.eventGraph.payload.name,
                eventCount: events.length,
                labwareCount: workspace.eventGraph.payload.labwares?.length ?? 0,
                readEventCount: events.filter((e) => e?.event_type === 'read').length,
              }
            : null,
          biology: {
            wellGroupCount: workspace.wellGroups.length,
            roleAssignmentCount: allAssignments.length,
          },
          readouts: {
            measurementContextCount: workspace.measurementContexts.length,
            contextNames: workspace.measurementContexts.map((c) => c.payload.name),
          },
          results: {
            measurementCount: workspace.measurements.length,
          },
          claims: {
            claimCount: workspace.claims.length,
            assertionCount: workspace.assertions.length,
            evidenceCount: workspace.evidence.length,
          },
          openQuestions,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'run_draft_claims',
    'Draft structured claim and evidence records from a run\'s measurements, well role assignments, and biological context. Returns proposed claim + evidence record drafts with confidence and unresolved questions.',
    {
      runId: z.string().describe('The run record ID'),
      measurementContextFilter: z.string().optional().describe('Optional measurement context ID to filter by'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        const allAssignments = Object.values(workspace.wellRoleAssignmentsByContext).flat();
        let contexts = workspace.measurementContexts;
        if (args.measurementContextFilter) {
          contexts = contexts.filter((c) => c.recordId === args.measurementContextFilter);
          if (contexts.length === 0) return errorResult(`Measurement context not found: ${args.measurementContextFilter}`);
        }

        const measurements = args.measurementContextFilter
          ? workspace.measurements.filter((m) => m.payload.measurementContextRef?.id === args.measurementContextFilter)
          : workspace.measurements;

        const unresolvedQuestions: string[] = [];
        if (measurements.length === 0) unresolvedQuestions.push('No measurements available to base claims on.');
        if (allAssignments.length === 0) unresolvedQuestions.push('No well role assignments — cannot determine control vs treatment wells.');

        return jsonResult({
          runId: workspace.run.recordId,
          contexts: contexts.map((c) => ({
            recordId: c.recordId,
            name: c.payload.name,
            instrument: c.payload.instrument_ref,
            assay: c.payload.assay_def_ref,
          })),
          measurements: measurements.map((m) => {
            const payload = m.payload as Record<string, unknown>;
            const rows = Array.isArray(payload.data) ? payload.data : [];
            return {
              recordId: m.recordId,
              title: payload.title,
              measurementContextId: m.payload.measurementContextRef?.id,
              rowCount: rows.length,
            };
          }),
          wellRoleAssignments: allAssignments.map((a) => ({
            recordId: a.recordId,
            roleFamily: a.payload.role_family,
            roleType: a.payload.role_type,
            expectedBehavior: a.payload.expected_behavior,
            subjectCount: a.payload.subject_refs?.length ?? 0,
          })),
          wellGroups: workspace.wellGroups.map((g) => ({
            recordId: g.recordId,
            name: g.payload.name,
            wellCount: g.payload.well_ids?.length ?? 0,
          })),
          existingClaims: workspace.claims.map((c) => ({
            recordId: c.recordId,
            statement: c.payload.statement,
          })),
          unresolvedQuestions,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'run_find_similar',
    'Search for runs with overlapping materials, event types, or biological contexts. Returns a ranked list of similar runs with similarity reasoning.',
    {
      runId: z.string().describe('The run record ID to find similar runs for'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        const runPayload = workspace.run.payload;

        // Collect all run records
        const allRuns = await ctx.store.list({ kind: 'run', limit: 1000 }) as Array<{ recordId: string; payload: Record<string, unknown> }>;
        const otherRuns = allRuns.filter((r) => r.recordId !== args.runId);

        if (otherRuns.length === 0) {
          return jsonResult({ runId: args.runId, similarRuns: [], message: 'No other runs found in the repository.' });
        }

        // Score similarity based on shared experiment, study, platform
        const scored = otherRuns.map((other) => {
          const reasons: string[] = [];
          let score = 0;

          if (other.payload.experimentId === runPayload.experimentId) {
            reasons.push('Same experiment');
            score += 3;
          }
          if (runPayload.studyId && other.payload.studyId === runPayload.studyId) {
            reasons.push('Same study');
            score += 2;
          }
          if (runPayload.methodPlatform && other.payload.methodPlatform === runPayload.methodPlatform) {
            reasons.push('Same platform');
            score += 1;
          }
          if (runPayload.methodVocabId && other.payload.methodVocabId === runPayload.methodVocabId) {
            reasons.push('Same method vocabulary');
            score += 1;
          }

          return {
            recordId: other.recordId,
            title: typeof other.payload.title === 'string' ? other.payload.title : undefined,
            status: other.payload.status,
            experimentId: other.payload.experimentId,
            score,
            reasons,
          };
        });

        const ranked = scored
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        return jsonResult({
          runId: args.runId,
          similarRuns: ranked,
          message: ranked.length === 0
            ? 'No runs found with overlapping experiment, study, platform, or vocabulary.'
            : `Found ${ranked.length} similar run(s).`,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
