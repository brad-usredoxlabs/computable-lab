/**
 * REST handler for protocol-builder endpoints.
 *
 * extract: accepts plain text, returns a structured protocol candidate summary.
 * redraft: accepts previous draft + user remarks, returns an updated draft via AI.
 * promote: promotes a draft event graph to a committed record.
 * exportProtocol: exports the draft as a JSON record file.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '../types.js';
import type { AgentOrchestrator, AgentResult } from '../../ai/types.js';
import type { EditorContext } from '../../ai/types.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import { promoteVendorProtocolEventGraph } from '../../ingestion/vendor-protocol/VendorProtocolEventGraphPromotionService.js';
import type { VendorProtocolEventGraphDraftResult } from '../../ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.js';
import type { PlateEventPrimitive } from '../../compiler/biology/BiologyVerbExpander.js';

/**
 * Request body for the extract endpoint.
 */
interface ExtractProtocolBody {
  text: string;
  documentId?: string;
  vendor?: string;
}

/**
 * Response shape — mirrors AiProtocolCandidateSummary from the frontend types.
 */
interface AiProtocolCandidateSummary {
  kind: 'vendor-protocol-candidate';
  title: string;
  scope?: string;
  materials?: Array<{ label: string; role?: string; confidence?: number }>;
  labware?: Array<{ label: string; role?: string }>;
  equipment?: Array<{ label: string }>;
  steps?: Array<{
    stepNumber?: number;
    text: string;
    materials?: string[];
    labware?: string[];
    equipment?: string[];
    notes?: string[];
    confidence?: number;
  }>;
  diagnostics?: Array<{
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
  }>;
}

interface ProtocolBuilderExtractResponse {
  candidate: AiProtocolCandidateSummary;
  source: {
    inputKind: 'text';
    fileName: string;
    sha256: string;
  };
  document: {
    pageCount: number;
    sectionCount: number;
    tableCount: number;
  };
}

/**
 * Request body for the redraft endpoint.
 */
interface RedraftRequest {
  sourceText: string;
  candidate: Record<string, unknown>;
  previousDraft?: { events: unknown[] };
  remarks: string;
}

/**
 * Response shape for the redraft endpoint — matches DraftResponse so the
 * frontend can use the same handler for initial drafts and redrafts.
 */
interface RedraftResponse {
  success: true;
  events: unknown[];
  revisionNumber: number;
  labwares: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string; reason?: string }>;
  diagnostics: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }>;
}

interface PromoteRequest {
  events: unknown[];
  labwares?: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string }>;
  candidate?: Record<string, unknown>;
  sourceText?: string;
  documentId?: string;
}

interface PromoteResponse {
  success: boolean;
  recordId: string;
  eventCount: number;
  outputPath?: string;
  error?: string;
  message?: string;
}

interface ExportRequest {
  events: unknown[];
  labwares?: unknown[];
  candidate?: Record<string, unknown>;
}

interface ExportResponse {
  success: boolean;
  record: Record<string, unknown>;
  error?: string;
  message?: string;
}

interface FetchPdfTextRequest {
  url: string;
}

/**
 * Request body for the derive-from-run endpoint.
 */
interface DeriveFromRunRequest {
  runId: string;
  title: string;
  purpose?: string;
  notes?: string;
}

/**
 * Response shape for the derive-from-run endpoint.
 */
interface DeriveFromRunResponse {
  success: true;
  protocol: {
    recordId: string;
    title: string;
    purpose?: string;
    notes?: string;
    source: {
      type: 'derived';
      ref: { kind: 'record'; type: 'run'; id: string };
    };
    steps: unknown[];
    evolvedFrom: Array<{
      sourceType: 'run';
      sourceRef: { kind: 'record'; type: 'run'; id: string };
      reason: string;
      evolvedAt: string;
    }>;
  };
  message?: string;
}

/**
 * Request body for the draft endpoint.
 */
interface DraftRequest {
  candidate: Record<string, unknown>;
  sourceText: string;
  config: {
    skippedSteps: string[];
    overrides: Array<{ stepKey: string; volume?: string | null; temperature?: string | null; duration?: string | null; concentration?: string | null }>;
    mappings: Array<{ roleLabel: string; labwareRecordId: string; deckSlot: string }>;
  };
}

/**
 * Response shape for the draft endpoint.
 */
interface DraftResponse {
  success: true;
  events: unknown[];
  labwares: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string; reason?: string }>;
  diagnostics: Array<{ severity: "info" | "warning" | "error"; code: string; message: string }>;
}

export interface ProtocolBuilderHandlers {
  extractProtocol(
    request: FastifyRequest<{ Body: ExtractProtocolBody }>,
    reply: FastifyReply,
  ): Promise<ProtocolBuilderExtractResponse | ApiError>;
  redraft(
    request: FastifyRequest<{ Body: RedraftRequest }>,
    reply: FastifyReply,
  ): Promise<RedraftResponse | ApiError>;
  draft(
    request: FastifyRequest<{ Body: DraftRequest }>,
    reply: FastifyReply,
  ): Promise<DraftResponse | ApiError>;
  promote(
    request: FastifyRequest<{ Body: PromoteRequest }>,
    reply: FastifyReply,
  ): Promise<PromoteResponse | ApiError>;
  exportProtocol(
    request: FastifyRequest<{ Body: ExportRequest }>,
    reply: FastifyReply,
  ): Promise<ExportResponse | ApiError>;
  fetchPdfText(
    request: FastifyRequest<{ Body: FetchPdfTextRequest }>,
    reply: FastifyReply,
  ): Promise<{ text: string; pageCount: number } | ApiError>;
  deriveFromRun(
    request: FastifyRequest<{ Body: DeriveFromRunRequest }>,
    reply: FastifyReply,
  ): Promise<DeriveFromRunResponse | ApiError>;
}

/**
 * Build the extraction prompt for AI-based protocol extraction.
 */
function buildExtractionPrompt(
  text: string,
  documentId?: string,
  vendor?: string,
): string {
  const parts = [
    'You are an AI assistant that extracts structured protocol information from vendor documentation text.',
    '',
    'Extract the following from the text below:',
    '- title: A concise title for the protocol',
    '- scope: What the protocol covers (optional)',
    '- materials: Array of materials used (each with label, role, confidence)',
    '- labware: Array of labware items (each with label, role)',
    '- equipment: Array of equipment items (each with label)',
    '- steps: Array of protocol steps (each with stepNumber, text, materials, labware, equipment, notes, confidence)',
    '- diagnostics: Any extraction issues or warnings (each with code, severity, message)',
    '',
    'Return ONLY a JSON object with this structure:',
    JSON.stringify({
      kind: 'vendor-protocol-candidate',
      title: '',
      scope: '',
      materials: [],
      labware: [],
      equipment: [],
      steps: [],
      diagnostics: [],
    }, null, 2),
    '',
    ...(documentId ? [`Document ID: ${documentId}`, ''] : []),
    ...(vendor ? [`Vendor: ${vendor}`, ''] : []),
    'Protocol text:',
    text,
  ];
  return parts.join('\n');
}

export function createProtocolBuilderHandlers(
  workspaceRoot: string,
  inferenceConfig?: { baseUrl: string; model: string; apiKey?: string; temperature?: number },
  orchestratorRef?: { current?: AgentOrchestrator | undefined },
): ProtocolBuilderHandlers {
  const inferenceClient = inferenceConfig?.baseUrl
    ? createInferenceClient(inferenceConfig)
    : null;

  return {
    async extractProtocol(request, reply) {
      const { text, documentId, vendor } = request.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        reply.status(400);
        return {
          error: 'MISSING_TEXT',
          message: 'text is required and must be a non-empty string',
        };
      }

      if (inferenceClient) {
        const prompt = buildExtractionPrompt(text.trim(), documentId, vendor);
        const result = await inferenceClient.complete({
          model: inferenceConfig!.model,
          messages: [{ role: 'user' as const, content: prompt }],
          max_tokens: 4096,
          temperature: inferenceConfig?.temperature ?? 0.1,
        });

        const responseText = result.choices?.[0]?.message?.content ?? '';
        let candidate: AiProtocolCandidateSummary;

        /**
         * Extract JSON from AI response — handles markdown code blocks,
         * direct JSON, bracket-balanced extraction, and common JSON repair.
         */
        function extractJsonFromResponse(text: string): unknown {
          const trimmed = text.trim();

          // 1. Try direct parse first
          try { return JSON.parse(trimmed); } catch {}

          // 2. Try to extract from markdown code blocks
          const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
          let match: RegExpExecArray | null;
          while ((match = codeBlockRegex.exec(trimmed)) !== null) {
            if (match[1]) {
              try { return JSON.parse(match[1].trim()); } catch {}
            }
          }

          // 3. Bracket-balanced extraction — find outermost { ... } with matching braces
          function findBalancedBraces(src: string): string[] {
            const results: string[] = [];
            let i = 0;
            while (i < src.length) {
              const start = src.indexOf('{', i);
              if (start === -1) break;
              let depth = 0;
              let inString = false;
              let escape = false;
              for (let j = start; j < src.length; j++) {
                const ch = src[j];
                if (escape) { escape = false; continue; }
                if (ch === '\\') { escape = inString; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (inString) continue;
                if (ch === '{') { depth++; }
                else if (ch === '}') { depth--; if (depth === 0) { results.push(src.substring(start, j + 1)); i = j + 1; break; } }
              }
              if (depth > 0) i = start + 1;
            }
            return results;
          }

          for (const balanced of findBalancedBraces(trimmed)) {
            try { return JSON.parse(balanced); } catch {}
            // Try repaired version
            try { return JSON.parse(repairJson(balanced)); } catch {}
          }

          // 4. Try repairing the entire text and parsing
          try { return JSON.parse(repairJson(trimmed)); } catch {}

          throw new Error(`Could not extract valid JSON from AI response (${trimmed.slice(0, 300)}${trimmed.length > 300 ? '...' : ''})`);
        }

        /**
         * Repair common JSON issues: trailing commas, unquoted keys, single quotes.
         */
        function repairJson(text: string): string {
          let s = text;
          // Quote unquoted keys: identifier followed by colon
          s = s.replace(/(?<=[{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '"$1":');
          // Remove trailing commas before } or ]
          s = s.replace(/,(\s*[}\]])/g, '$1');
          // Replace single quotes with double quotes (rough approximation)
          // Only replace single quotes that are not inside a double-quoted string
          s = s.replace(/'(\\'|[^']*?)'/g, (m, _escaped, offset, str) => {
            let inDq = 0;
            for (let i = 0; i < offset; i++) {
              if (str[i] === '\\' && str[i - 1] === '\\') continue;
              if (str[i] === '"') inDq++;
            }
            return inDq % 2 === 0 ? `"${m.slice(1, -1)}"` : m;
          });
          return s;
        }

         try {
          const raw = extractJsonFromResponse(responseText);
          const parsed = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
          const steps = Array.isArray(parsed.steps)
            ? parsed.steps.map((step: unknown) => {
                const s = typeof step === 'object' && step !== null ? (step as Record<string, unknown>) : {};
                const stepObj: { stepNumber?: number; text: string; materials?: string[]; labware?: string[]; equipment?: string[]; notes?: string[]; confidence?: number } = {
                  text: typeof s.text === 'string' ? s.text : '',
                };
                if (typeof s.stepNumber === 'number') stepObj.stepNumber = s.stepNumber;
                if (Array.isArray(s.materials)) stepObj.materials = s.materials;
                if (Array.isArray(s.labware)) stepObj.labware = s.labware;
                if (Array.isArray(s.equipment)) stepObj.equipment = s.equipment;
                if (Array.isArray(s.notes)) stepObj.notes = s.notes;
                else if (typeof s.notes === 'string') stepObj.notes = [s.notes];
                if (typeof s.confidence === 'number') stepObj.confidence = s.confidence;
                return stepObj;
              })
            : undefined;
          const materials = Array.isArray(parsed.materials) ? parsed.materials : undefined;
          const labware = Array.isArray(parsed.labware) ? parsed.labware : undefined;
          const equipment = Array.isArray(parsed.equipment) ? parsed.equipment : undefined;
          const diagnostics = Array.isArray(parsed.diagnostics) ? parsed.diagnostics : undefined;
          const scope = parsed.scope && typeof parsed.scope === 'string' ? parsed.scope : undefined;
          candidate = {
            kind: 'vendor-protocol-candidate' as const,
            title: (typeof parsed.title === 'string' && parsed.title) ? parsed.title : 'Untitled Protocol',
            ...(scope ? { scope } : {}),
            ...(materials ? { materials } : {}),
            ...(labware ? { labware } : {}),
            ...(equipment ? { equipment } : {}),
            ...(steps ? { steps } : {}),
            ...(diagnostics ? { diagnostics } : {}),
          };
        } catch (parseErr) {
          request.log.error({ fullResponse: responseText }, 'All JSON extraction strategies exhausted — protocol extraction failed');
          reply.status(500);
          return {
            error: 'EXTRACTION_ERROR',
            message: `Could not parse AI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          };
        }

        return {
          candidate,
          source: {
            inputKind: 'text' as const,
            fileName: 'pasted-text.txt',
            sha256: '',
          },
          document: {
            pageCount: 0,
            sectionCount: 0,
            tableCount: 0,
          },
        };
      }

      // AI inference is required — no rule-based fallback
      request.log.error('AI inference is not configured; protocol extraction requires AI');
      reply.status(503);
      return {
        error: 'AI_UNAVAILABLE',
        message: 'AI inference is not configured; protocol extraction requires an AI backend',
      };
    },

    async redraft(request, reply) {
      const body = request.body;
      const { sourceText, candidate, previousDraft, remarks } = body;

      if (!remarks?.trim()) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'Remarks are required for redraft',
        };
      }

      if (previousDraft && Array.isArray(previousDraft.events) && previousDraft.events.length === 0) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'previousDraft.events must be a non-empty array',
        };
      }

      // Prefer orchestrator (same path as the draft endpoint)
      const orchestrator = orchestratorRef?.current;
      if (orchestrator) {
        const prompt = [
          'Revise this protocol event graph draft based on user remarks.',
          '',
          'User remarks:',
          remarks,
          '',
          'Protocol candidate:',
          JSON.stringify(candidate, null, 2),
          '',
          'Source text:',
          sourceText?.slice(0, 10000) ?? '(none)',
          '',
          'Previous draft events:',
          previousDraft?.events
            ? JSON.stringify(previousDraft.events, null, 2)
            : 'No previous draft.',
          '',
          'Generate revised events reflecting the user feedback. Add or modify labware as needed.',
        ].join('\n');

        const agentContext: EditorContext = {
          labwares: [],
          eventSummary: {
            totalEvents: previousDraft?.events?.length ?? 0,
            recentEvents: [],
          },
          vocabPackId: 'default',
          availableVerbs: [],
        };

        try {
          const result: AgentResult = await orchestrator.run({
            prompt,
            context: agentContext,
            forceDraftTool: true,
          });

          const diagnostics: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> = [];

          if (result.error) {
            diagnostics.push({ severity: 'error', code: 'ORCHESTRATOR_ERROR', message: result.error });
          }
          if (result.notes?.length) {
            result.notes.forEach((note) => diagnostics.push({ severity: 'info', code: 'AGENT_NOTE', message: note }));
          }

          const events: unknown[] = (result.events ?? []).map((evt) => ({
            event_id: evt.eventId,
            event_type: evt.event_type,
            verb: evt.verb,
            details: evt.details,
            materials: evt.materials,
            notes: evt.notes,
            ...(evt.t_offset ? { t_offset: evt.t_offset } : {}),
          }));

          const labwares: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string; reason?: string }> = [];
          if (result.labwareAdditions) {
            for (const la of result.labwareAdditions) {
              labwares.push({
                labwareId: la.recordId,
                labwareType: 'unknown',
                name: la.recordId,
                ...(la.deckSlot ? { deckSlot: la.deckSlot } : {}),
                ...(la.reason ? { reason: la.reason } : {}),
              });
            }
          }
          if (result.labwareRequirements) {
            for (const lr of result.labwareRequirements) {
              labwares.push({
                labwareId: lr.classCurie,
                labwareType: lr.classCurie.split(':').pop() ?? 'unknown',
                name: lr.classCurie,
                ...(lr.deckSlot ? { deckSlot: lr.deckSlot } : {}),
                ...(lr.reason ? { reason: lr.reason } : {}),
              });
            }
          }

          if (events.length > 0) {
            diagnostics.push({ severity: 'info', code: 'REDRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements via agent orchestrator` });
          } else if (!result.error) {
            diagnostics.push({ severity: 'warning', code: 'EMPTY_DRAFT', message: 'Agent returned no events' });
          }

          return { success: true, events, revisionNumber: previousDraft ? 2 : 1, labwares, diagnostics };
        } catch (err) {
          request.log.error(err, 'Redraft via orchestrator failed');
          reply.status(500);
          return {
            error: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Fallback: raw inference call when orchestrator is not available
      if (!inferenceClient) {
        reply.status(503);
        return {
          success: true,
          events: [],
          revisionNumber: previousDraft ? 2 : 1,
          labwares: [],
          diagnostics: [{ severity: 'error', code: 'AI_UNAVAILABLE', message: 'AI inference is not configured' }],
        };
      }

      const prompt = [
        'You are revising a protocol event graph draft based on user feedback.',
        '',
        'User remarks:',
        remarks,
        '',
        'Source protocol candidate:',
        JSON.stringify(candidate, null, 2),
        '',
        'Source text:',
        sourceText?.slice(0, 10000) ?? '(none)',
        '',
        'Previous draft events:',
        previousDraft?.events
          ? JSON.stringify(previousDraft.events, null, 2)
          : 'No previous draft.',
        '',
        'Return a JSON object with "events" (array of revised events) and "labwares" (array of labware placements).',
      ].join('\n');

      try {
        const result = await inferenceClient.complete({
          model: inferenceConfig!.model,
          messages: [{ role: 'user' as const, content: prompt }],
          max_tokens: 4096,
          temperature: inferenceConfig?.temperature ?? 0.1,
        });

        const text = result.choices?.[0]?.message?.content ?? '';
        let events: unknown[] = [];
        let labwares: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string; reason?: string }> = [];
        const diagnostics: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> = [];

        try {
          const trimmed = text.trim();
          // 1. Try direct parse
          try {
            const parsed = JSON.parse(trimmed);
            events = Array.isArray(parsed.events) ? parsed.events : (Array.isArray(parsed) ? parsed : []);
            labwares = Array.isArray(parsed.labwares) ? parsed.labwares : [];
            diagnostics.push({ severity: 'info', code: 'REDRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements` });
          } catch {
            // 2. Try markdown code blocks
            const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
            let codeMatch: RegExpExecArray | null;
            let parsed = false;
            while (!parsed && (codeMatch = codeBlockRegex.exec(trimmed)) !== null) {
              if (codeMatch[1]) {
                try {
                  const blockParsed = JSON.parse(codeMatch[1].trim());
                  events = Array.isArray(blockParsed.events) ? blockParsed.events : (Array.isArray(blockParsed) ? blockParsed : []);
                  labwares = Array.isArray(blockParsed.labwares) ? blockParsed.labwares : [];
                  parsed = true;
                } catch {}
              }
            }
            if (parsed) {
              diagnostics.push({ severity: 'info', code: 'REDRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements` });
            } else {
              // 3. Bracket-balanced extraction
              const findBalancedBraces = (src: string): string[] => {
                const results: string[] = [];
                let i = 0;
                while (i < src.length) {
                  const start = src.indexOf('{', i);
                  if (start === -1) break;
                  let depth = 0;
                  let inStr = false;
                  let esc = false;
                  for (let j = start; j < src.length; j++) {
                    const ch = src[j];
                    if (esc) { esc = false; continue; }
                    if (ch === '\\') { esc = inStr; continue; }
                    if (ch === '"') { inStr = !inStr; continue; }
                    if (inStr) continue;
                    if (ch === '{') { depth++; }
                    else if (ch === '}') { depth--; if (depth === 0) { results.push(src.substring(start, j + 1)); i = j + 1; break; } }
                  }
                  if (depth > 0) i = start + 1;
                }
                return results;
              };
              for (const balanced of findBalancedBraces(trimmed)) {
                try {
                  const objParsed = JSON.parse(balanced);
                  events = Array.isArray(objParsed.events) ? objParsed.events : (Array.isArray(objParsed) ? objParsed : []);
                  labwares = Array.isArray(objParsed.labwares) ? objParsed.labwares : [];
                  break;
                } catch {}
              }
              if (events.length > 0) {
                diagnostics.push({ severity: 'info', code: 'REDRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements` });
              } else {
                diagnostics.push({ severity: 'warning', code: 'PARSE_FAILED', message: 'Could not parse AI response as JSON events' });
              }
            }
          }
        } catch {
          diagnostics.push({ severity: 'warning', code: 'PARSE_FAILED', message: 'Could not parse AI response as JSON events' });
        }

        return { success: true, events, revisionNumber: previousDraft ? 2 : 1, labwares, diagnostics };
      } catch (err) {
        request.log.error(err, 'Redraft failed');
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async draft(request, reply) {
      const body = request.body;
      const { candidate, sourceText, config } = body;

      if (!candidate) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'candidate is required',
        };
      }

      const orchestrator = orchestratorRef?.current;
      if (orchestrator) {
        const skippedSteps = config?.skippedSteps ?? [];
        const overrides = config?.overrides ?? [];
        const mappings = config?.mappings ?? [];

        const prompt = [
          'Compile this protocol into a sequence of laboratory automation events.',
          '',
          'Protocol candidate:',
          JSON.stringify(candidate, null, 2),
          '',
          'Source text:',
          sourceText?.slice(0, 10000) ?? '(none)',
          '',
          'Config:',
          'Skipped steps:', JSON.stringify(skippedSteps),
          'Overrides:', JSON.stringify(overrides),
          'Labware mappings:', JSON.stringify(mappings),
          '',
          'Generate events for all non-skipped steps, applying the specified overrides and labware mappings.',
        ].join('\n');

        const agentContext: EditorContext = {
          labwares: mappings.map((m) => ({
            labwareId: m.labwareRecordId,
            labwareType: 'unknown',
            name: m.labwareRecordId,
          })),
          eventSummary: { totalEvents: 0, recentEvents: [] },
          vocabPackId: 'default',
          availableVerbs: [],
        };

        try {
          const result: AgentResult = await orchestrator.run({
            prompt,
            context: agentContext,
            forceDraftTool: true,
          });

          const diagnostics: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> = [];

          if (result.error) {
            diagnostics.push({ severity: 'error', code: 'ORCHESTRATOR_ERROR', message: result.error });
          }
          if (result.notes?.length) {
            result.notes.forEach((note) => diagnostics.push({ severity: 'info', code: 'AGENT_NOTE', message: note }));
          }

          const events: unknown[] = (result.events ?? []).map((evt) => ({
            event_id: evt.eventId,
            event_type: evt.event_type,
            verb: evt.verb,
            details: evt.details,
            materials: evt.materials,
            notes: evt.notes,
            ...(evt.t_offset ? { t_offset: evt.t_offset } : {}),
          }));

          const labwares: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string; reason?: string }> = [];
          if (result.labwareAdditions) {
            for (const la of result.labwareAdditions) {
              labwares.push({
                labwareId: la.recordId,
                labwareType: 'unknown',
                name: la.recordId,
                ...(la.deckSlot ? { deckSlot: la.deckSlot } : {}),
                ...(la.reason ? { reason: la.reason } : {}),
              });
            }
          }
          if (result.labwareRequirements) {
            for (const lr of result.labwareRequirements) {
              labwares.push({
                labwareId: lr.classCurie,
                labwareType: lr.classCurie.split(':').pop() ?? 'unknown',
                name: lr.classCurie,
                ...(lr.deckSlot ? { deckSlot: lr.deckSlot } : {}),
                ...(lr.reason ? { reason: lr.reason } : {}),
              });
            }
          }

          if (events.length > 0) {
            diagnostics.push({ severity: 'info', code: 'DRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements via agent orchestrator` });
          } else if (!result.error) {
            diagnostics.push({ severity: 'warning', code: 'EMPTY_DRAFT', message: 'Agent returned no events' });
          }

          return { success: true, events, labwares, diagnostics };
        } catch (err) {
          request.log.error(err, 'Draft generation via orchestrator failed');
          reply.status(500);
          return {
            error: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Fallback: raw inference call when orchestrator is not available
      if (!inferenceClient) {
        reply.status(503);
        return {
          success: true,
          events: [],
          labwares: [],
          diagnostics: [{ severity: 'error', code: 'AI_UNAVAILABLE', message: 'AI inference is not configured' }],
        };
      }

      const skippedSteps = config?.skippedSteps ?? [];
      const overrides = config?.overrides ?? [];
      const mappings = config?.mappings ?? [];

      const prompt = [
        'You are compiling a protocol into an event graph for a laboratory automation system.',
        '',
        'Generate a sequence of events (plate operations) from the protocol steps below.',
        'Skip any steps listed in skippedSteps.',
        'Apply any quantity overrides specified in overrides.',
        'Use the labware mappings specified in mappings for deck positions.',
        '',
        'Protocol candidate:',
        JSON.stringify(candidate, null, 2),
        '',
        'Source text:',
        sourceText?.slice(0, 10000) ?? '(none)',
        '',
        'Config:',
        'Skipped steps:', JSON.stringify(skippedSteps),
        'Overrides:', JSON.stringify(overrides),
        'Labware mappings:', JSON.stringify(mappings),
        '',
        'Return a JSON object with this structure:',
        JSON.stringify({ events: [], labwares: [] }, null, 2),
        '',
        'Each event should have: event_id, event_type, details (with wells, volume, etc.).',
        'Event types: add_material, transfer, multi_dispense, mix, wash, incubate, read, centrifuge, harvest, other.',
      ].join('\n');

      try {
        const result = await inferenceClient.complete({
          model: inferenceConfig!.model,
          messages: [{ role: 'user' as const, content: prompt }],
          max_tokens: 4096,
          temperature: inferenceConfig?.temperature ?? 0.1,
        });

        const text = result.choices?.[0]?.message?.content ?? '';
        let events: unknown[] = [];
        let labwares: Array<{ labwareId: string; labwareType: string; name: string; deckSlot?: string; reason?: string }> = [];
        const diagnostics: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> = [];

        // Bracket-balanced extraction (same pattern as redraft)
        function findBalancedBraces(src: string): string[] {
          const results: string[] = [];
          let i = 0;
          while (i < src.length) {
            const start = src.indexOf('{', i);
            if (start === -1) break;
            let depth = 0;
            let inString = false;
            let escape = false;
            for (let j = start; j < src.length; j++) {
              const ch = src[j];
              if (escape) { escape = false; continue; }
              if (ch === '\\') { escape = inString; continue; }
              if (ch === '"') { inString = !inString; continue; }
              if (inString) continue;
              if (ch === '{') { depth++; }
              else if (ch === '}') { depth--; if (depth === 0) { results.push(src.substring(start, j + 1)); i = j + 1; break; } }
            }
            if (depth > 0) i = start + 1;
          }
          return results;
        }

        try {
          const trimmed = text.trim();
          // 1. Try direct parse
          try {
            const parsed = JSON.parse(trimmed);
            events = Array.isArray(parsed.events) ? parsed.events : [];
            labwares = Array.isArray(parsed.labwares) ? parsed.labwares : [];
            diagnostics.push({ severity: 'info', code: 'DRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements` });
          } catch {
            // 2. Try markdown code blocks
            const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
            let codeMatch: RegExpExecArray | null;
            let parsed = false;
            while (!parsed && (codeMatch = codeBlockRegex.exec(trimmed)) !== null) {
              if (codeMatch[1]) {
                try {
                  const blockParsed = JSON.parse(codeMatch[1].trim());
                  events = Array.isArray(blockParsed.events) ? blockParsed.events : [];
                  labwares = Array.isArray(blockParsed.labwares) ? blockParsed.labwares : [];
                  parsed = true;
                } catch {}
              }
            }
            if (!parsed) {
              // 3. Bracket-balanced extraction
              for (const balanced of findBalancedBraces(trimmed)) {
                try {
                  const objParsed = JSON.parse(balanced);
                  events = Array.isArray(objParsed.events) ? objParsed.events : [];
                  labwares = Array.isArray(objParsed.labwares) ? objParsed.labwares : [];
                  break;
                } catch {}
              }
            }
            if (events.length > 0) {
              diagnostics.push({ severity: 'info', code: 'DRAFT_SUCCESS', message: `Generated ${events.length} events and ${labwares.length} labware placements` });
            } else {
              diagnostics.push({ severity: 'warning', code: 'PARSE_FAILED', message: 'Could not parse AI response as JSON events' });
            }
          }
        } catch {
          diagnostics.push({ severity: 'warning', code: 'PARSE_FAILED', message: 'Could not parse AI response' });
        }

        return { success: true, events, labwares, diagnostics };
      } catch (err) {
        request.log.error(err, 'Draft generation failed');
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async promote(request, reply) {
      const body = request.body;

      if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'events is required and must be a non-empty array',
          success: false,
          recordId: '',
          eventCount: 0,
        };
      }

      const draftResult: VendorProtocolEventGraphDraftResult = {
        kind: 'vendor-protocol-event-graph-draft',
        sourceProtocolRef: {
          documentId: body.documentId || `DOC-${Date.now()}`,
          title: (body.candidate?.title as string) || 'Untitled Protocol',
        },
        eventGraph: {
          kind: 'event-graph',
          id: `EVG-${Date.now()}`,
          name: (body.candidate?.title as string) || 'Untitled Protocol',
          description: (body.candidate?.scope as string) || '',
          status: 'draft',
          sourceProtocolRef: {
            documentId: body.documentId || `DOC-${Date.now()}`,
            title: (body.candidate?.title as string) || 'Untitled Protocol',
          },
          events: body.events as PlateEventPrimitive[],
          labwares: (body.labwares || []).map((lw: { labwareId?: string; labwareType?: string; name?: string; deckSlot?: string }, i: number) => ({
            labwareId: lw.labwareId || `lw-${i}`,
            labwareType: lw.labwareType || 'unknown',
            name: lw.name || `Labware ${i}`,
            ...(lw.deckSlot ? { deckSlot: lw.deckSlot } : {}),
          })),
          tags: ['vendor-protocol', 'standalone-builder'],
        },
        candidateSummary: {
          stepCount: 0,
          materialCount: 0,
          labwareCount: (body.labwares || []).length,
          equipmentCount: 0,
        },
        compileStatus: 'complete',
        compilePrompt: body.sourceText ? `Source: ${body.sourceText.slice(0, 200)}` : '',
      };

      try {
        const result = await promoteVendorProtocolEventGraph({
          workspaceRoot,
          draft: draftResult,
          allowIncompleteCompile: true,
          allowEmptyEvents: false,
        });

        if (result.status === 'promoted') {
          return {
            success: true,
            recordId: result.recordId,
            eventCount: body.events.length,
            ...(result.outputPath ? { outputPath: result.outputPath } : {}),
          };
        }

        // blocked
        const firstBlocker = result.blockers[0];
        reply.status(400);
        return {
          success: false,
          recordId: result.recordId,
          eventCount: 0,
          error: firstBlocker?.code || 'PROMOTION_BLOCKED',
          message: firstBlocker?.message || 'Promotion was blocked',
        };
      } catch (err) {
        request.log.error(err, 'Promotion failed');
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
          success: false,
          recordId: '',
          eventCount: 0,
        };
      }
    },

    async exportProtocol(request, reply) {
      const body = request.body;

      if (!body.events || !Array.isArray(body.events)) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'events is required and must be an array',
          success: false,
          record: {},
        };
      }

      const record: Record<string, unknown> = {
        kind: 'event-graph',
        id: `EVG-${Date.now()}`,
        name: (body.candidate?.title as string) || 'Untitled Protocol',
        description: (body.candidate?.scope as string) || '',
        status: 'draft',
        events: body.events,
        labwares: (body.labwares || []).map((lw: unknown, i: number) => {
          const obj = lw as Record<string, unknown>;
          return {
            labwareId: (obj.labwareId as string) || `lw-${i}`,
            labwareType: (obj.labwareType as string) || 'unknown',
            name: (obj.name as string) || `Labware ${i}`,
            ...(obj.deckSlot ? { deckSlot: obj.deckSlot } : {}),
          };
        }),
        tags: ['vendor-protocol', 'standalone-builder'],
        exportedAt: new Date().toISOString(),
      };

      return { success: true, record };
    },

    async fetchPdfText(request, reply) {
      const { url } = request.body;

      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        reply.status(400);
        return {
          error: 'MISSING_URL',
          message: 'url is required and must be a non-empty string',
        } as unknown as ApiError;
      }

      // Validate URL format
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          reply.status(400);
          return {
            error: 'INVALID_URL',
            message: 'URL must start with http:// or https://',
          } as unknown as ApiError;
        }
      } catch {
        reply.status(400);
        return {
          error: 'INVALID_URL',
          message: 'Please enter a valid URL',
        } as unknown as ApiError;
      }

      try {
        // Use Node built-in fetch (available in Node 18+)
        const resp = await fetch(url);
        if (!resp.ok) {
          reply.status(400);
          return {
            error: 'FETCH_FAILED',
            message: `Failed to fetch PDF: ${resp.status} ${resp.statusText}`,
          } as unknown as ApiError;
        }

        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Use pdf-parse (already installed in server package.json)
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        const text = textResult.text ?? '';
        const pageCount = textResult.pages.length;
        return { text, pageCount };
      } catch (err) {
        request.log.error(err, 'PDF fetch/parse failed');
        reply.status(500);
        return {
          error: 'FETCH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        } as unknown as ApiError;
      }
    },

    async deriveFromRun(request, reply) {
      const { runId, title, purpose, notes } = request.body;

      if (!runId || typeof runId !== 'string' || runId.trim().length === 0) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'runId is required and must be a non-empty string',
        } as unknown as ApiError;
      }

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'title is required and must be a non-empty string',
        } as unknown as ApiError;
      }

      const recordId = `PRT-derive-${runId.slice(-6)}-${Date.now().toString(36).slice(-4)}`;
      const evolvedAt = new Date().toISOString();

      const protocol = {
        kind: 'protocol' as const,
        recordId,
        title: title.trim(),
        ...(purpose ? { purpose: purpose.trim() } : {}),
        ...(notes ? { notes: notes.trim() } : {}),
        source: {
          type: 'derived' as const,
          ref: { kind: 'record' as const, type: 'run' as const, id: runId },
        },
        evolvedFrom: [
          {
            sourceType: 'run' as const,
            sourceRef: { kind: 'record' as const, type: 'run' as const, id: runId },
            reason: 'Protocol derived from execution run',
            evolvedAt,
          },
        ],
        state: 'draft' as const,
        steps: [],
      };

      return {
        success: true,
        protocol,
        message: `Protocol derived from run ${runId}`,
      };
    },
  };
}
