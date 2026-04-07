import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerIngestionAiTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {

  dualRegister(
    server,
    registry,
    'ingestion_infer_source_kind',
    'Infer the most likely ingestion source kind from a file name and optional preview content. Returns a suggested source kind, confidence score, and reasoning.',
    {
      fileName: z.string().describe('The uploaded file name'),
      mimeType: z.string().optional().describe('The MIME type of the file'),
      preview: z.string().optional().describe('Base64-encoded preview of the first ~2KB of file content'),
    },
    async (args) => {
      try {
        const lower = args.fileName.toLowerCase();
        let suggestedKind = 'other';
        let confidence = 0.3;
        let reasoning = 'Unable to determine source kind from file name.';

        if (lower.endsWith('.pdf')) {
          suggestedKind = 'vendor_plate_map_pdf';
          confidence = 0.6;
          reasoning = 'PDF file — likely a vendor plate map or catalog document.';
        } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
          suggestedKind = 'vendor_formulation_html';
          confidence = 0.6;
          reasoning = 'HTML file — likely a vendor formulation or catalog page.';
        } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          if (lower.includes('qpcr') || lower.includes('ct_values')) {
            suggestedKind = 'instrument_qpcr'; confidence = 0.7; reasoning = 'Spreadsheet with qPCR-related filename.';
          } else if (lower.includes('plate') || lower.includes('reader') || lower.includes('absorbance')) {
            suggestedKind = 'instrument_plate_reader'; confidence = 0.7; reasoning = 'Spreadsheet with plate reader-related filename.';
          } else {
            suggestedKind = 'vendor_plate_map_spreadsheet'; confidence = 0.5; reasoning = 'Spreadsheet file — likely a vendor plate map.';
          }
        } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
          if (lower.includes('gc-ms') || lower.includes('gcms')) {
            suggestedKind = 'instrument_gc_ms'; confidence = 0.7; reasoning = 'CSV with GC-MS-related filename.';
          } else if (lower.includes('gc-fid') || lower.includes('gcfid') || lower.includes('fid')) {
            suggestedKind = 'instrument_gc_fid'; confidence = 0.7; reasoning = 'CSV with GC-FID-related filename.';
          } else if (lower.includes('plate') || lower.includes('reader')) {
            suggestedKind = 'instrument_plate_reader'; confidence = 0.7; reasoning = 'CSV with plate reader-related filename.';
          } else if (lower.includes('qpcr')) {
            suggestedKind = 'instrument_qpcr'; confidence = 0.7; reasoning = 'CSV with qPCR-related filename.';
          } else {
            suggestedKind = 'vendor_plate_map_spreadsheet'; confidence = 0.4; reasoning = 'CSV file — could be vendor data or instrument output.';
          }
        } else if (lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.nd2') || lower.endsWith('.czi') || lower.endsWith('.lif')) {
          suggestedKind = 'instrument_fluorescence_microscopy'; confidence = 0.8; reasoning = 'Microscopy image format detected.';
        }

        return jsonResult({ suggestedKind, confidence, reasoning });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'ingestion_suggest_run_mapping',
    'Suggest which run(s), read events, and measurement contexts an ingestion job might map to. Returns ranked suggestions with confidence and reasoning.',
    {
      jobId: z.string().describe('The ingestion job record ID'),
      suggestedKind: z.string().optional().describe('The suggested or selected source kind'),
    },
    async (args) => {
      try {
        const job = await ctx.store.get(args.jobId);
        if (!job) return errorResult(`Ingestion job not found: ${args.jobId}`);

        const runs = await ctx.store.list({ kind: 'run', limit: 100 });
        if (runs.length === 0) {
          return jsonResult({ suggestions: [], message: 'No runs found in the repository.' });
        }

        const suggestions = runs.slice(0, 5).map((r) => ({
          runId: r.recordId,
          runTitle: typeof (r.payload as Record<string, unknown>).title === 'string'
            ? (r.payload as Record<string, unknown>).title as string
            : r.recordId,
          confidence: 0.2,
          reasoning: 'Candidate run — review to determine if this ingestion job maps here.',
        }));

        return jsonResult({ suggestions });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'ingestion_explain_issue',
    'Explain an ingestion issue in plain language and suggest a fix. Returns a human-readable explanation and suggested remediation.',
    {
      issueId: z.string().describe('The ingestion issue record ID'),
      jobId: z.string().describe('The parent ingestion job record ID'),
    },
    async (args) => {
      try {
        const issue = await ctx.store.get(args.issueId);
        if (!issue) return errorResult(`Issue not found: ${args.issueId}`);

        const payload = issue.payload as Record<string, unknown>;
        const issueType = String(payload.issue_type || '');

        const explanations: Record<string, { explanation: string; suggestedFix: string }> = {
          name_ambiguity: {
            explanation: 'The parser found a name that could refer to multiple different entities.',
            suggestedFix: 'Review the candidate and select the correct entity.',
          },
          ontology_match_ambiguous: {
            explanation: 'Multiple ontology terms matched this candidate with similar scores.',
            suggestedFix: 'Review the ontology term suggestions and select the best match.',
          },
          missing_vendor_identifier: {
            explanation: 'No vendor catalog number could be extracted.',
            suggestedFix: 'Check the source document and add catalog numbers manually.',
          },
          table_parse_gap: {
            explanation: 'Some rows or columns could not be parsed from the source table.',
            suggestedFix: 'Check the source file for unusual formatting.',
          },
          symbol_normalization_changed: {
            explanation: 'A chemical or biological symbol was normalized to a different form.',
            suggestedFix: 'Review the normalized name and confirm it matches the intended substance.',
          },
          parser_not_implemented: {
            explanation: 'No automated parser exists yet for this instrument source kind.',
            suggestedFix: 'Review the uploaded artifacts manually or wait for parser support.',
          },
        };

        const result = explanations[issueType] ?? {
          explanation: `Issue: ${payload.title || issueType}. ${payload.detail || ''}`,
          suggestedFix: 'Review the issue details and resolve manually.',
        };

        return jsonResult(result);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
