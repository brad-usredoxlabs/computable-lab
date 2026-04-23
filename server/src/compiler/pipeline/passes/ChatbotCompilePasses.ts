/**
 * ChatbotCompilePasses - Factory functions for passes in the chatbot-compile pipeline.
 * 
 * This module contains pass implementations for the chatbot-compile pipeline,
 * starting with the extract_entities pass that runs extraction on prompts and attachments.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../../extract/ExtractionDraftBuilder.js';
import type { ChatMessage, CompletionRequest } from '../../../ai/types.js';
import { decodeAttachmentText } from '../../../extract/decodeAttachment.js';

/**
 * An entity extracted from a prompt or attachment.
 */
export interface ExtractedEntity {
  kind: string;                     // e.g. 'labware-spec', 'material', 'protocol', 'context'
  draft: unknown;                   // the extraction candidate's draft payload
  confidence?: number;
  source: 'prompt' | 'attachment';
  attachment_name?: string;
}

/**
 * A file attachment to be processed.
 */
export interface FileAttachment {
  name: string;
  mime_type: string;
  content: string | Buffer;         // text or binary
}

/**
 * Dependencies for creating the extract_entities pass.
 */
export interface CreateExtractEntitiesPassDeps {
  extractionService: ExtractionRunnerService;
}

/**
 * Creates the extract_entities pass that runs ExtractionRunnerService on prompt + file attachments.
 * 
 * This pass:
 * - Reads state.input.prompt (string) and state.input.attachments (FileAttachment[])
 * - Calls extractionService.run once per attachment (target_kind derived from filename) 
 *   plus once on freetext prompt
 * - Accumulates candidates into an entities array
 * - Propagates extraction diagnostics via PassResult.diagnostics with pass_id='extract_entities'
 */
export function createExtractEntitiesPass(
  deps: CreateExtractEntitiesPassDeps,
): Pass {
  return {
    id: 'extract_entities',
    family: 'parse' as const,
    async run({ pass_id, state }: PassRunArgs): Promise<PassResult> {
      const prompt = typeof state.input.prompt === 'string' ? state.input.prompt : '';
      const attachments = Array.isArray(state.input.attachments)
        ? (state.input.attachments as FileAttachment[])
        : [];
      const entities: ExtractedEntity[] = [];
      const diagnostics: PassDiagnostic[] = [];

      // Helper to convert extraction diagnostics to pass diagnostics
      const convertDiagnostic = (
        d: unknown,
        attachmentName?: string
      ): PassDiagnostic => {
        // Extraction diagnostics may have different shape; normalize them
        const diag = d as Record<string, unknown>;
        return {
          severity: (diag.severity as 'info' | 'warning' | 'error') ?? 'info',
          code: (diag.code as string) ?? 'EXTRACTION_DIAG',
          message: (diag.message as string) ?? 'Extraction diagnostic',
          pass_id,
          details: {
            ...(diag.details as Record<string, unknown> ?? {}),
            ...(attachmentName ? { attachment_name: attachmentName } : {}),
          },
        };
      };

      // 1. Run extraction on prompt text if non-empty
      if (prompt.trim().length > 0) {
        const runRequest: RunExtractionServiceArgs = {
          target_kind: 'unknown',
          text: prompt,
          source: {
            kind: 'freetext',
            id: 'prompt',
          },
        };
        
        try {
          const result: ExtractionDraftBody = await deps.extractionService.run(runRequest);
          
          // Extract candidates from the draft body
          // The ExtractionDraftBody has a candidates array with target_kind and other fields
          for (const cand of result.candidates ?? []) {
            const candidate = cand as Record<string, unknown>;
            entities.push({
              kind: (candidate.target_kind as string) ?? 'unknown',
              draft: candidate,
              ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
              source: 'prompt',
            });
          }
          
          // Propagate diagnostics if present
          if (result.diagnostics) {
            for (const d of result.diagnostics) {
              diagnostics.push(convertDiagnostic(d));
            }
          }
        } catch (error) {
          // Log the error but don't fail the pass - just add a diagnostic
          diagnostics.push({
            severity: 'error',
            code: 'EXTRACTION_ERROR',
            message: `Failed to extract from prompt: ${error instanceof Error ? error.message : String(error)}`,
            pass_id,
            details: { source: 'prompt' },
          });
        }
      }

      // 2. Run extraction on each attachment
      for (const att of attachments) {
        // Derive target_kind from filename extension or default to 'unknown'
        let targetKind = 'unknown';
        const fileNameLower = att.name.toLowerCase();
        if (fileNameLower.endsWith('.pdf')) {
          targetKind = 'protocol'; // Default for PDFs
        } else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
          targetKind = 'material'; // Default for spreadsheets
        } else if (fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm')) {
          targetKind = 'material'; // Default for HTML
        }

        // Decode the attachment using the right adapter for its file type.
        // Critical for PDFs / XLSX — raw utf-8 toString on a binary buffer
        // produces gibberish and causes the extractor to find nothing.
        const decoded = await decodeAttachmentText(att.name, att.mime_type, att.content);
        for (const d of decoded.diagnostics) {
          diagnostics.push({
            severity: d.severity === 'error' ? 'error' : 'warning',
            code: d.code,
            message: d.message,
            pass_id,
            details: { attachment_name: att.name },
          });
        }

        if (decoded.text.length === 0) {
          diagnostics.push({
            severity: 'warning',
            code: 'attachment_empty_text',
            message: `No text could be extracted from ${att.name}; skipping.`,
            pass_id,
            details: { attachment_name: att.name },
          });
          continue;
        }

        const runRequest: RunExtractionServiceArgs = {
          target_kind: targetKind,
          text: decoded.text,
          source: {
            kind: 'file',
            id: att.name,
            locator: att.name,
          },
          fileName: att.name,
        };

        try {
          const result: ExtractionDraftBody = await deps.extractionService.run(runRequest);
          
          for (const cand of result.candidates ?? []) {
            const candidate = cand as Record<string, unknown>;
            entities.push({
              kind: (candidate.target_kind as string) ?? targetKind,
              draft: candidate,
              ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
              source: 'attachment',
              attachment_name: att.name,
            });
          }
          
          // Propagate diagnostics if present
          if (result.diagnostics) {
            for (const d of result.diagnostics) {
              diagnostics.push(convertDiagnostic(d, att.name));
            }
          }
        } catch (error) {
          diagnostics.push({
            severity: 'error',
            code: 'EXTRACTION_ERROR',
            message: `Failed to extract from attachment ${att.name}: ${error instanceof Error ? error.message : String(error)}`,
            pass_id,
            details: { attachment_name: att.name },
          });
        }
      }

      return { ok: true, output: { entities }, diagnostics };
    },
  };
}

/**
 * Minimal LLM client interface for the ai_precompile pass.
 */
export interface LlmClient {
  complete(req: CompletionRequest): Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>;
}

/**
 * Output shape for the ai_precompile pass.
 */
export interface AiPrecompileOutput {
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  candidateLabwares: Array<{ hint: string; reason?: string }>;
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
  clarification?: string;
}

/**
 * System prompt for the ai_precompile pass.
 */
export const AI_PRECOMPILE_SYSTEM_PROMPT = `You are the AI-precompile stage of a biology event-graph compiler. You are given:
- prompt: the user's freetext description of an experiment step (e.g. "add a reservoir and a 96-well plate, then Tuesday seed with HeLa cells")
- entities: structured data extracted from the prompt and any attached PDFs (materials, labware hints, operators, dates, volumes)

Your job: emit a STRICT JSON object of this shape and NOTHING ELSE (no prose, no markdown):

{
  "candidateEvents": [{"verb": "seed" | "incubate" | "harvest" | "aliquot" | "wash" | "elute" | "resuspend" | "pellet" | "dilute" | "mix" | "stain" | "fix" | "permeabilize" | "block" | "quench" | "count" | "passage" | "freeze" | "thaw" | "spin" | "label" | "transfect" | "add_material" | "transfer" | "read", ...params per verb}],
  "candidateLabwares": [{"hint": "<labware description>", "reason": "<why user needs this>"}],
  "unresolvedRefs": [{"kind": "material"|"labware"|"operator"|"other", "label": "<raw text>", "reason": "<why unresolved>"}],
  "clarification": "<optional clarifying question for the user if the intent is ambiguous>"
}

Rules:
- Emit only verbs from the list above.
- If a labware is mentioned but not clearly identified (e.g. "96-well plate" without a definition id), add it to candidateLabwares with the hint text.
- If a material is referenced but unclear (e.g. "HeLa cells"), add it to unresolvedRefs.
- Volumes, concentrations, counts: include as params on the relevant event.
- If the prompt is too ambiguous to emit events at all, return empty arrays and set clarification.
- Output MUST be valid JSON.`;

/**
 * Dependencies for creating the ai_precompile pass.
 */
export interface CreateAiPrecompilePassDeps {
  llmClient: LlmClient;
  model?: string;
}

/**
 * Creates the ai_precompile pass that asks an LLM to reason over prompt + entities
 * and emit a structured proposal of candidate events, labwares, and unresolved references.
 */
export function createAiPrecompilePass(deps: CreateAiPrecompilePassDeps): Pass {
  return {
    id: 'ai_precompile',
    family: 'expand' as const,
    async run({ pass_id, state }: PassRunArgs): Promise<PassResult> {
      const prompt = typeof state.input.prompt === 'string' ? state.input.prompt : '';
      const entities = (state.outputs.get('extract_entities') as { entities?: unknown[] } | undefined)?.entities ?? [];
      const system = AI_PRECOMPILE_SYSTEM_PROMPT;
      const user = JSON.stringify({ prompt, entities });
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const response = await deps.llmClient.complete({
        model: deps.model ?? 'claude-sonnet-4-6',
        messages,
        response_format: { type: 'json_object' },
      } as CompletionRequest);
      const raw = response.choices[0]?.message?.content ?? '';
      let parsed: AiPrecompileOutput;
      try {
        parsed = JSON.parse(raw) as AiPrecompileOutput;
      } catch (err) {
        return {
          ok: true,
          output: { candidateEvents: [], candidateLabwares: [], unresolvedRefs: [] } satisfies AiPrecompileOutput,
          diagnostics: [{
            severity: 'warning',
            code: 'ai_precompile_parse_error',
            message: `LLM response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
            pass_id,
            details: { raw_preview: raw.slice(0, 300) },
          }],
        };
      }
      // Normalize: ensure all three arrays exist
      const output: AiPrecompileOutput = {
        candidateEvents: Array.isArray(parsed.candidateEvents) ? parsed.candidateEvents : [],
        candidateLabwares: Array.isArray(parsed.candidateLabwares) ? parsed.candidateLabwares : [],
        unresolvedRefs: Array.isArray(parsed.unresolvedRefs) ? parsed.unresolvedRefs : [],
        ...(typeof parsed.clarification === 'string' ? { clarification: parsed.clarification } : {}),
      };
      return { ok: true, output };
    },
  };
}

/**
 * Import the biology verb expander registry (side-effect registration).
 */
import { getExpander, type PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';
import '../../biology/verbs/simpleVerbs.js';
import '../../biology/verbs/compoundVerbs.js';
import '../../biology/verbs/centrifugeVerbs.js';

/**
 * Creates the expand_biology_verbs pass that lowers high-level biology verbs
 * to primitive event types that the ContextEngine handles.
 * 
 * This pass:
 * - Reads candidateEvents from state.outputs.get('ai_precompile')
 * - Looks up expanders for each verb
 * - Concatenates expanded PlateEventPrimitive[] into output { events }
 * - Unknown verbs produce a warning diagnostic code='unknown_biology_verb' and are skipped
 */
export function createExpandBiologyVerbsPass(): Pass {
  return {
    id: 'expand_biology_verbs',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as { candidateEvents?: Array<{ verb: string; [k: string]: unknown }> } | undefined;
      const candidateEvents = ai?.candidateEvents ?? [];
      const events: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];
      
      for (const cand of candidateEvents) {
        const { verb, ...params } = cand;
        const expander = getExpander(verb);
        if (!expander) {
          diagnostics.push({
            severity: 'warning' as const,
            code: 'unknown_biology_verb',
            message: `No expander registered for verb '${verb}'; dropping candidate event.`,
            pass_id,
            details: { verb },
          });
          continue;
        }
        const expanded = expander.expand({ verb, params });
        for (const e of expanded) events.push(e);
      }
      
      return { ok: true, output: { events }, diagnostics };
    },
  };
}

/**
 * A proposed labware addition that couldn't be resolved to an existing instance.
 */
export interface AiLabwareAdditionPatch {
  recordId: string;
  reason?: string;
}

/**
 * A labware hint that was successfully resolved to an existing instance.
 */
export interface ResolvedLabware {
  hint: string;
  recordId: string;
  title?: string;
}

/**
 * Output shape for the resolve_labware pass.
 */
export interface LabwareResolveOutput {
  labwareAdditions: AiLabwareAdditionPatch[];
  resolvedLabwares: ResolvedLabware[];
}

/**
 * Dependencies for creating the resolve_labware pass.
 */
export interface CreateLabwareResolvePassDeps {
  searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
}

/**
 * Creates the resolve_labware pass that disambiguates candidate labware hints.
 * 
 * This pass:
 * - Reads candidateLabwares from state.outputs.get('ai_precompile')
 * - For each hint, calls searchLabwareByHint and:
 *   (a) if one match → adds to resolvedLabwares with {hint, recordId, title}
 *   (b) if >1 matches → adds to resolvedLabwares with the top match AND emits an 'ambiguous_labware_hint' info diagnostic
 *   (c) if zero matches → emits an AiLabwareAddition {recordId: hint, reason: 'proposed from prompt'} in labwareAdditions
 * - Output shape: { labwareAdditions, resolvedLabwares }
 */
export function createLabwareResolvePass(
  deps: CreateLabwareResolvePassDeps,
): Pass {
  return {
    id: 'resolve_labware',
    family: 'disambiguate' as const,
    async run({ pass_id, state }: PassRunArgs): Promise<PassResult> {
      const ai = state.outputs.get('ai_precompile') as { candidateLabwares?: Array<{ hint: string; reason?: string }> } | undefined;
      const candidates = ai?.candidateLabwares ?? [];
      const labwareAdditions: AiLabwareAdditionPatch[] = [];
      const resolvedLabwares: ResolvedLabware[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const cand of candidates) {
        const hint = cand.hint;
        if (typeof hint !== 'string' || hint.trim().length === 0) continue;
        
        const matches = await deps.searchLabwareByHint(hint);
        
        if (matches.length === 0) {
          // Zero matches: propose a new labware addition
          labwareAdditions.push({
            recordId: hint,
            ...(cand.reason ? { reason: cand.reason } : { reason: 'proposed from prompt' }),
          });
        } else if (matches.length === 1) {
          // One match: resolve directly
          resolvedLabwares.push({ hint, recordId: matches[0]!.recordId, title: matches[0]!.title });
        } else {
          // Multi-match: pick top, emit info diagnostic so the UI can prompt the user
          resolvedLabwares.push({ hint, recordId: matches[0]!.recordId, title: matches[0]!.title });
          diagnostics.push({
            severity: 'info' as const,
            code: 'ambiguous_labware_hint',
            message: `Hint '${hint}' matched ${matches.length} labware candidates; chose '${matches[0]!.title}' (${matches[0]!.recordId})`,
            pass_id,
            details: {
              hint,
              chosen: matches[0],
              alternatives: matches.slice(1, 5),
            },
          });
        }
      }

      return {
        ok: true,
        output: { labwareAdditions, resolvedLabwares } satisfies LabwareResolveOutput,
        diagnostics,
      };
    },
  };
}
