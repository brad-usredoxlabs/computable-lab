import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { RunWorkspaceService } from '../../run-workspace/RunWorkspaceService.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerEvidencePipelineTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const service = new RunWorkspaceService(ctx.store);

  dualRegister(
    server,
    registry,
    'run_interpret_results',
    'Interpret measurement results for a run, grouped by measurement context. Returns key findings, statistical summaries, treatment/control comparisons, and QC flags per context.',
    {
      runId: z.string().describe('The run record ID'),
      measurementContextIds: z.array(z.string()).optional().describe('Optional list of measurement context IDs to filter by'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        const allAssignments = Object.values(workspace.wellRoleAssignmentsByContext).flat();
        let contexts = workspace.measurementContexts;
        if (args.measurementContextIds?.length) {
          const filterSet = new Set(args.measurementContextIds);
          contexts = contexts.filter((c) => filterSet.has(c.recordId));
        }

        const measurements = args.measurementContextIds?.length
          ? workspace.measurements.filter((m) => {
              const ctxId = m.payload.measurementContextRef?.id;
              return ctxId && args.measurementContextIds!.includes(ctxId);
            })
          : workspace.measurements;

        const qcFlags: string[] = [];
        if (measurements.length === 0) qcFlags.push('No measurements available.');
        if (allAssignments.length === 0) qcFlags.push('No well role assignments — cannot determine control vs treatment.');

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
          qcFlags,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'run_assemble_evidence',
    'Assemble evidence records from a run\'s measurements. Returns proposed evidence records linking measurements to biological context with confidence scores.',
    {
      runId: z.string().describe('The run record ID'),
      measurementContextIds: z.array(z.string()).optional().describe('Optional measurement context IDs to filter by'),
      includeWellGrouping: z.boolean().optional().describe('Whether to group evidence by well groups'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        const allAssignments = Object.values(workspace.wellRoleAssignmentsByContext).flat();
        let contexts = workspace.measurementContexts;
        if (args.measurementContextIds?.length) {
          const filterSet = new Set(args.measurementContextIds);
          contexts = contexts.filter((c) => filterSet.has(c.recordId));
        }

        const measurements = args.measurementContextIds?.length
          ? workspace.measurements.filter((m) => {
              const ctxId = m.payload.measurementContextRef?.id;
              return ctxId && args.measurementContextIds!.includes(ctxId);
            })
          : workspace.measurements;

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
          wellGroups: workspace.wellGroups.map((g) => ({
            recordId: g.recordId,
            name: g.payload.name,
            wellCount: g.payload.well_ids?.length ?? 0,
          })),
          wellRoleAssignments: allAssignments.map((a) => ({
            recordId: a.recordId,
            roleFamily: a.payload.role_family,
            roleType: a.payload.role_type,
            expectedBehavior: a.payload.expected_behavior,
            subjectCount: a.payload.subject_refs?.length ?? 0,
          })),
          existingEvidence: workspace.evidence.map((e) => ({
            recordId: e.recordId,
            title: (e.payload as Record<string, unknown>).title,
          })),
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'run_draft_assertions',
    'Draft assertion records from a run\'s evidence. Returns proposed assertions with confidence, evidence links, and contradiction warnings.',
    {
      runId: z.string().describe('The run record ID'),
      evidenceIds: z.array(z.string()).optional().describe('Optional evidence record IDs to draft assertions from'),
      checkContradictions: z.boolean().optional().describe('Whether to check for contradictions against existing claims'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        let evidence = workspace.evidence;
        if (args.evidenceIds?.length) {
          const filterSet = new Set(args.evidenceIds);
          evidence = evidence.filter((e) => filterSet.has(e.recordId));
        }

        return jsonResult({
          runId: workspace.run.recordId,
          evidence: evidence.map((e) => {
            const payload = e.payload as Record<string, unknown>;
            return {
              recordId: e.recordId,
              title: payload.title,
              supports: payload.supports,
              quality: payload.quality,
            };
          }),
          existingAssertions: workspace.assertions.map((a) => {
            const payload = a.payload as Record<string, unknown>;
            return {
              recordId: a.recordId,
              statement: payload.statement,
              claimRefId: (payload.claim_ref as Record<string, unknown> | undefined)?.id,
            };
          }),
          existingClaims: workspace.claims.map((c) => {
            const payload = c.payload as Record<string, unknown>;
            return {
              recordId: c.recordId,
              statement: payload.statement,
            };
          }),
          checkContradictions: args.checkContradictions !== false,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'run_check_contradictions',
    'Check a proposed assertion statement for contradictions against existing assertions, claims, and literature in the knowledge graph.',
    {
      runId: z.string().describe('The run record ID for context'),
      statement: z.string().describe('The assertion statement to check'),
      scope: z.string().optional().describe('The scope of the assertion'),
    },
    async (args) => {
      try {
        const workspace = await service.getRunWorkspace(args.runId);
        if (!workspace) return errorResult(`Run not found: ${args.runId}`);

        return jsonResult({
          runId: workspace.run.recordId,
          targetStatement: args.statement,
          targetScope: args.scope,
          existingAssertions: workspace.assertions.map((a) => {
            const payload = a.payload as Record<string, unknown>;
            return {
              recordId: a.recordId,
              statement: payload.statement,
              scope: payload.scope,
            };
          }),
          existingClaims: workspace.claims.map((c) => {
            const payload = c.payload as Record<string, unknown>;
            return {
              recordId: c.recordId,
              statement: payload.statement,
            };
          }),
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
