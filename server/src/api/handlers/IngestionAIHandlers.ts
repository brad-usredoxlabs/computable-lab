/**
 * REST handlers for AI-assisted ingestion endpoints.
 *
 * These endpoints provide AI-powered suggestions for:
 * - Source kind inference from file content
 * - Run mapping suggestions for ingestion jobs
 * - Issue explanation for ingestion problems
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgentOrchestrator } from '../../ai/types.js';
import type { RecordStore } from '../../store/types.js';
import type { IngestionSourceKind } from '../../ingestion/types.js';

interface InferSourceKindBody {
  fileName: string;
  mimeType: string;
  preview: string;
}

interface SuggestMappingBody {
  jobId: string;
  suggestedKind: string;
}

interface ExplainIssueBody {
  issueId: string;
  jobId: string;
}

export interface IngestionAIHandlers {
  inferSourceKind(
    request: FastifyRequest<{ Body: InferSourceKindBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  suggestIngestionMapping(
    request: FastifyRequest<{ Body: SuggestMappingBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  explainIngestionIssue(
    request: FastifyRequest<{ Body: ExplainIssueBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
}

const VALID_SOURCE_KINDS: IngestionSourceKind[] = [
  'vendor_plate_map_pdf',
  'vendor_formulation_html',
  'vendor_plate_map_spreadsheet',
  'vendor_catalog_page',
  'instrument_plate_reader',
  'instrument_qpcr',
  'instrument_gc_ms',
  'instrument_gc_fid',
  'instrument_fluorescence_microscopy',
  'other',
];

/**
 * Simple heuristic-based source kind inference when AI is not available.
 * Uses file name and MIME type to make a best guess.
 */
function heuristicInferSourceKind(fileName: string, mimeType: string, _preview: string): {
  suggestedKind: IngestionSourceKind;
  confidence: number;
  reasoning: string;
} {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.pdf')) {
    return {
      suggestedKind: 'vendor_plate_map_pdf',
      confidence: 0.6,
      reasoning: 'PDF file detected — likely a vendor plate map or catalog document.',
    };
  }

  if (mimeType === 'text/html' || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return {
      suggestedKind: 'vendor_formulation_html',
      confidence: 0.6,
      reasoning: 'HTML file detected — likely a vendor formulation or catalog page.',
    };
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    if (lower.includes('qpcr') || lower.includes('q-pcr') || lower.includes('ct_values')) {
      return { suggestedKind: 'instrument_qpcr', confidence: 0.7, reasoning: 'Spreadsheet with qPCR-related filename.' };
    }
    if (lower.includes('plate') || lower.includes('reader') || lower.includes('absorbance') || lower.includes('fluorescence') || lower.includes('luminescence')) {
      return { suggestedKind: 'instrument_plate_reader', confidence: 0.7, reasoning: 'Spreadsheet with plate reader-related filename.' };
    }
    return {
      suggestedKind: 'vendor_plate_map_spreadsheet',
      confidence: 0.5,
      reasoning: 'Spreadsheet file detected — likely a vendor plate map.',
    };
  }

  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    if (lower.includes('gc-ms') || lower.includes('gcms')) {
      return { suggestedKind: 'instrument_gc_ms', confidence: 0.7, reasoning: 'CSV/TSV file with GC-MS-related filename.' };
    }
    if (lower.includes('gc-fid') || lower.includes('gcfid') || lower.includes('fid')) {
      return { suggestedKind: 'instrument_gc_fid', confidence: 0.7, reasoning: 'CSV/TSV file with GC-FID-related filename.' };
    }
    if (lower.includes('plate') || lower.includes('reader')) {
      return { suggestedKind: 'instrument_plate_reader', confidence: 0.7, reasoning: 'CSV/TSV file with plate reader-related filename.' };
    }
    if (lower.includes('qpcr') || lower.includes('q-pcr')) {
      return { suggestedKind: 'instrument_qpcr', confidence: 0.7, reasoning: 'CSV/TSV file with qPCR-related filename.' };
    }
    return {
      suggestedKind: 'vendor_plate_map_spreadsheet',
      confidence: 0.4,
      reasoning: 'CSV/TSV file detected — could be vendor data or instrument output.',
    };
  }

  if (lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.nd2') || lower.endsWith('.czi') || lower.endsWith('.lif')) {
    return {
      suggestedKind: 'instrument_fluorescence_microscopy',
      confidence: 0.8,
      reasoning: 'Microscopy image format detected.',
    };
  }

  return {
    suggestedKind: 'other',
    confidence: 0.3,
    reasoning: 'Unable to determine source kind from file name or MIME type.',
  };
}

export function createIngestionAIHandlers(
  orchestrator: AgentOrchestrator | undefined,
  store: RecordStore,
): IngestionAIHandlers {
  return {
    async inferSourceKind(request, reply) {
      const { fileName, mimeType, preview } = request.body ?? {};

      if (!fileName || typeof fileName !== 'string') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'fileName is required' };
      }

      if (orchestrator) {
        try {
          const result = await orchestrator.run({
            prompt: `Analyze this file and suggest the most appropriate ingestion source kind.

File name: ${fileName}
MIME type: ${mimeType || 'unknown'}
Preview (base64, first ~2KB): ${(preview || '').slice(0, 2730)}

Valid source kinds: ${VALID_SOURCE_KINDS.join(', ')}

Respond with ONLY a JSON object (no markdown fencing):
{"suggestedKind": "<kind>", "confidence": <0-1>, "reasoning": "<brief explanation>"}`,
            context: {
              labwares: [],
              eventSummary: '',
              vocabPackId: 'general',
              availableVerbs: [],
            },
            surface: 'ingestion',
          });

          const text = typeof result === 'string' ? result : (result as unknown as Record<string, unknown>)?.text as string ?? '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*?"suggestedKind"[\s\S]*?\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { suggestedKind: string; confidence: number; reasoning: string };
              if (VALID_SOURCE_KINDS.includes(parsed.suggestedKind as IngestionSourceKind)) {
                return {
                  suggestedKind: parsed.suggestedKind,
                  confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
                  reasoning: parsed.reasoning || 'AI inference.',
                };
              }
            }
          } catch {
            // Fall through to heuristic
          }
        } catch (err) {
          request.log.warn(err, 'AI inference failed for source kind, falling back to heuristic');
        }
      }

      return heuristicInferSourceKind(fileName, mimeType || '', preview || '');
    },

    async suggestIngestionMapping(request, reply) {
      const { jobId, suggestedKind } = request.body ?? {};

      if (!jobId || typeof jobId !== 'string') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'jobId is required' };
      }

      // Load the job to get context
      const job = await store.get(jobId);
      if (!job) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Ingestion job not found: ${jobId}` };
      }

      // Load available runs for mapping
      const runs = await store.list({ kind: 'run', limit: 100 });
      if (runs.length === 0) {
        return { suggestions: [] };
      }

      if (orchestrator) {
        try {
          const runSummaries = runs.map((r) => ({
            id: r.recordId,
            title: (r.payload as Record<string, unknown>).title,
            status: (r.payload as Record<string, unknown>).status,
          }));

          const result = await orchestrator.run({
            prompt: `Given an ingestion job of kind "${suggestedKind || (job.payload as Record<string, unknown>).source_kind}", suggest which run(s) this data might belong to.

Available runs:
${JSON.stringify(runSummaries, null, 2)}

Respond with ONLY a JSON object (no markdown fencing):
{"suggestions": [{"runId": "<id>", "runTitle": "<title>", "confidence": <0-1>, "reasoning": "<brief explanation>"}]}`,
            context: {
              labwares: [],
              eventSummary: '',
              vocabPackId: 'general',
              availableVerbs: [],
            },
            surface: 'ingestion',
          });

          const text = typeof result === 'string' ? result : (result as unknown as Record<string, unknown>)?.text as string ?? '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*?"suggestions"[\s\S]*?\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { suggestions: Array<Record<string, unknown>> };
              if (Array.isArray(parsed.suggestions)) {
                return { suggestions: parsed.suggestions };
              }
            }
          } catch {
            // Fall through to empty
          }
        } catch (err) {
          request.log.warn(err, 'AI inference failed for run mapping');
        }
      }

      // Fallback: return all runs as low-confidence suggestions
      return {
        suggestions: runs.slice(0, 5).map((r) => ({
          runId: r.recordId,
          runTitle: typeof (r.payload as Record<string, unknown>).title === 'string'
            ? (r.payload as Record<string, unknown>).title as string
            : r.recordId,
          confidence: 0.2,
          reasoning: 'No AI available — showing recent runs as candidates.',
        })),
      };
    },

    async explainIngestionIssue(request, reply) {
      const { issueId, jobId } = request.body ?? {};

      if (!issueId || typeof issueId !== 'string') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'issueId is required' };
      }
      if (!jobId || typeof jobId !== 'string') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'jobId is required' };
      }

      const issue = await store.get(issueId);
      if (!issue) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Issue not found: ${issueId}` };
      }

      const issuePayload = issue.payload as Record<string, unknown>;

      if (orchestrator) {
        try {
          const result = await orchestrator.run({
            prompt: `Explain this ingestion issue in plain language and suggest how to fix it.

Issue type: ${issuePayload.issue_type}
Severity: ${issuePayload.severity}
Title: ${issuePayload.title}
Detail: ${issuePayload.detail || 'No additional detail.'}
Resolution status: ${issuePayload.resolution_status}

Respond with ONLY a JSON object (no markdown fencing):
{"explanation": "<human-readable explanation>", "suggestedFix": "<actionable suggestion>"}`,
            context: {
              labwares: [],
              eventSummary: '',
              vocabPackId: 'general',
              availableVerbs: [],
            },
            surface: 'ingestion',
          });

          const text = typeof result === 'string' ? result : (result as unknown as Record<string, unknown>)?.text as string ?? '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*?"explanation"[\s\S]*?\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { explanation: string; suggestedFix: string };
              if (parsed.explanation) {
                return {
                  explanation: parsed.explanation,
                  suggestedFix: parsed.suggestedFix || 'No specific fix suggested.',
                };
              }
            }
          } catch {
            // Fall through
          }
        } catch (err) {
          request.log.warn(err, 'AI inference failed for issue explanation');
        }
      }

      // Heuristic fallback
      const issueType = String(issuePayload.issue_type || '');
      const explanations: Record<string, { explanation: string; suggestedFix: string }> = {
        name_ambiguity: {
          explanation: 'The parser found a name that could refer to multiple different entities. This happens when vendor catalogs use abbreviated or informal names.',
          suggestedFix: 'Review the candidate and select the correct entity from the suggestions, or manually enter the canonical name.',
        },
        ontology_match_ambiguous: {
          explanation: 'Multiple ontology terms matched this candidate with similar scores. The system cannot determine which mapping is correct without human review.',
          suggestedFix: 'Review the ontology term suggestions and select the best match.',
        },
        missing_vendor_identifier: {
          explanation: 'The parser could not extract a vendor catalog number or product identifier from this entry.',
          suggestedFix: 'Check the source document for catalog numbers and add them manually if they exist.',
        },
        table_parse_gap: {
          explanation: 'Some rows or columns in the source table could not be parsed. Data may be missing from the extraction.',
          suggestedFix: 'Check the source file for unusual formatting and consider re-uploading with a cleaner format.',
        },
        symbol_normalization_changed: {
          explanation: 'A chemical or biological symbol was normalized to a different form during extraction.',
          suggestedFix: 'Review the normalized name and confirm it matches the intended substance.',
        },
        parser_not_implemented: {
          explanation: 'No automated parser exists yet for this instrument source kind. The file was accepted and is available for manual review, but automated extraction has not been performed.',
          suggestedFix: 'Review the uploaded artifacts manually and create candidates by hand, or wait for parser support in a future release.',
        },
      };

      const fallback = explanations[issueType] ?? {
        explanation: `Issue of type "${issueType}": ${issuePayload.title || 'No title'}. ${issuePayload.detail || ''}`,
        suggestedFix: 'Review the issue details and resolve manually.',
      };

      return fallback;
    },
  };
}
