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
import type { RegistryLoader } from '../../../registry/RegistryLoader.js';
import type { ProtocolSpec } from '../../../registry/ProtocolSpecRegistry.js';
import type { AssaySpec } from '../../../registry/AssaySpecRegistry.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { CompoundClass } from '../../../registry/CompoundClassRegistry.js';
import type { LabStateSnapshot } from '../../../compiler/state/LabState.js';
import { applyEventToLabState, emptyLabState } from '../../../compiler/state/LabState.js';

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
 * A directive to mint new material records at once.
 */
export interface MintMaterialsDirective {
  template: string;                          // e.g. 'fecal-sample'
  count: number;                             // e.g. 96
  namingPattern: string;                     // e.g. 'FS_{n}' where {n} is 1..count
  placementLabwareHint?: string;             // e.g. '96-well-deepwell-plate'
  wellSpread?: 'all' | 'first-row' | 'explicit';  // default 'all'
  wellList?: string[];                       // when wellSpread === 'explicit'
  properties?: Record<string, unknown>;
}

/**
 * A candidate labware hint from ai_precompile.
 */
export interface CandidateLabware {
  hint: string;
  reason?: string;
  deckSlot?: string;   // e.g. 'target', 'C1', 'D1'
}

/**
 * A reference to a labware that already exists in the lab (from a prior turn).
 */
export interface PriorLabwareRef {
  hint: string;           // original user text, e.g. "96-well deepwell plate of fecal samples"
  kindHint?: string;      // e.g. '96-well deepwell plate'
  contentHint?: string;   // e.g. 'fecal samples', 'binding buffer'
}

/**
 * A labware addition patch produced by resolve_labware.
 */
export interface AiLabwareAdditionPatch {
  recordId: string;
  reason: string;
  deckSlot?: string;   // carried through from candidateLabwares
}

/**
 * Output shape for the ai_precompile pass.
 */
export interface AiPrecompileOutput {
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  candidateLabwares: CandidateLabware[];
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
  clarification?: string;
  mintMaterials?: MintMaterialsDirective[];
  priorLabwareRefs?: PriorLabwareRef[];   // references to labware that already exists
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
  "candidateLabwares": [{"hint": "<labware description>", "reason": "<why user needs this>", "deckSlot": "<optional deck position>"}],
  "unresolvedRefs": [{"kind": "material"|"labware"|"operator"|"other", "label": "<raw text>", "reason": "<why unresolved>"}],
  "clarification": "<optional clarifying question for the user if the intent is ambiguous>",
  "priorLabwareRefs": [{"hint": "<original user text>", "kindHint": "<labware type in words>", "contentHint": "<materials inside, if mentioned>"}]
}

Rules:
- Emit only verbs from the list above.
- If a labware is mentioned but not clearly identified (e.g. "96-well plate" without a definition id), add it to candidateLabwares with the hint text.
- If a material is referenced but unclear (e.g. "HeLa cells"), add it to unresolvedRefs.
- Volumes, concentrations, counts: include as params on the relevant event.
- If the prompt is too ambiguous to emit events at all, return empty arrays and set clarification.
- Output MUST be valid JSON.

When the user specifies a deck slot for a labware (e.g. "on the target destination", "at position C1"), include deckSlot on that candidateLabwares entry. Slot strings are free-form — typical values are 'target', 'source', 'A1'..'D4', or user-supplied labels.

When the user asks to mint a number of new material records at
once (e.g. "add 96 fecal samples numbered 1-96"), add an entry
to mintMaterials instead of emitting 96 separate add_material
events. Required fields: template (kind tag), count (integer),
namingPattern (string with {n} placeholder where n is 1..count).
Optional: placementLabwareHint (use if they specify a destination
labware), wellSpread ('all' fills every well left-to-right,
top-to-bottom; 'first-row' fills only the first row; 'explicit'
uses wellList), properties (extra metadata per material).

When the user references a labware that already exists in the lab
(e.g. "we already have a 96-well deepwell plate of fecal samples",
"that PCR plate we made", "use that plate"), add an entry to
priorLabwareRefs instead of treating it as a new candidateLabware.
Include kindHint (labware type in words, e.g. "96-well deepwell plate")
and contentHint (materials inside, if mentioned, e.g. "fecal samples").`;

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
        ...(Array.isArray(parsed.mintMaterials) ? { mintMaterials: parsed.mintMaterials } : {}),
        ...(Array.isArray(parsed.priorLabwareRefs) ? { priorLabwareRefs: parsed.priorLabwareRefs } : {}),
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

// ---------------------------------------------------------------------------
// resolve_prior_labware_references pass
// ---------------------------------------------------------------------------

/**
 * A labware reference that was successfully resolved against a prior snapshot.
 */
export interface ResolvedLabwareRef {
  hint: string;
  matched: { instanceId: string; labwareType: string };
}

/**
 * A labware reference that could not be resolved.
 */
export interface UnresolvedLabwareRef {
  hint: string;
  reason: string;
}

/**
 * Output shape for the resolve_prior_labware_references pass.
 */
export interface ResolvePriorLabwareReferencesOutput {
  resolvedLabwareRefs: ResolvedLabwareRef[];
  unresolved: UnresolvedLabwareRef[];
}

/**
 * Simple heuristic: match a PriorLabwareRef against labware in a snapshot.
 * Uses kindHint (labwareType substring/token overlap) and contentHint
 * (material kind substring) to find the best match.
 */
function findLabwareByHints(
  snapshot: LabStateSnapshot,
  ref: PriorLabwareRef,
): { instanceId: string; labwareType: string } | undefined {
  for (const instance of Object.values(snapshot.labware)) {
    // Match by labwareType substring (case-insensitive) against kindHint.
    if (ref.kindHint) {
      const normalizedKindHint = ref.kindHint.toLowerCase().replace(/[\s-]/g, '');
      const normalizedType = instance.labwareType.toLowerCase().replace(/[\s-]/g, '');
      if (normalizedType.includes(normalizedKindHint)) {
        // Strong substring match — also check contentHint if present
        if (ref.contentHint) {
          const materials = Object.values(instance.wells).flat();
          const firstWord = ref.contentHint!.toLowerCase().split(/\s+/)[0];
          const anyMatch = materials.some(
            m => (m.kind ?? '').toLowerCase().includes(firstWord),
          );
          if (anyMatch) {
            return { instanceId: instance.instanceId, labwareType: instance.labwareType };
          }
        } else {
          return { instanceId: instance.instanceId, labwareType: instance.labwareType };
        }
      } else {
        // Fallback: split on non-alpha and check token overlap.
        const wantTokens = ref.kindHint.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const haveTokens = instance.labwareType.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const overlap = wantTokens.filter(t => haveTokens.includes(t)).length;
        if (overlap >= 2) {
          // Token overlap sufficient — also check contentHint if present
          if (ref.contentHint) {
            const materials = Object.values(instance.wells).flat();
            const firstWord = ref.contentHint!.toLowerCase().split(/\s+/)[0];
            const anyMatch = materials.some(
              m => (m.kind ?? '').toLowerCase().includes(firstWord),
            );
            if (anyMatch) {
              return { instanceId: instance.instanceId, labwareType: instance.labwareType };
            }
          } else {
            return { instanceId: instance.instanceId, labwareType: instance.labwareType };
          }
        }
      }
    }
    // If no kindHint, try contentHint only.
    if (ref.contentHint) {
      const materials = Object.values(instance.wells).flat();
      const firstWord = ref.contentHint.toLowerCase().split(/\s+/)[0];
      const anyMatch = materials.some(
        m => (m.kind ?? '').toLowerCase().includes(firstWord),
      );
      if (anyMatch) {
        return { instanceId: instance.instanceId, labwareType: instance.labwareType };
      }
    }
  }
  return undefined;
}

/**
 * Creates the resolve_prior_labware_references pass that resolves
 * priorLabwareRefs against the prior lab-state snapshot.
 *
 * This pass:
 * - Reads priorLabwareRefs from state.outputs.get('ai_precompile')
 * - Reads prior labState from state.input.labState
 * - For each ref, tries to match against labware in the snapshot
 * - Emits resolvedLabwareRefs[] for matches, unresolved[] for gaps
 */
export function createResolvePriorLabwareReferencesPass(): Pass {
  return {
    id: 'resolve_prior_labware_references',
    family: 'disambiguate' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { priorLabwareRefs?: PriorLabwareRef[] } | undefined;
      const refs = ai?.priorLabwareRefs ?? [];
      const prior = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const resolved: ResolvedLabwareRef[] = [];
      const gaps: UnresolvedLabwareRef[] = [];

      for (const ref of refs) {
        const match = findLabwareByHints(prior, ref);
        if (match) {
          resolved.push({ hint: ref.hint, matched: match });
        } else {
          gaps.push({ hint: ref.hint, reason: 'no matching labware in prior snapshot' });
        }
      }

      return {
        ok: true,
        output: { resolvedLabwareRefs: resolved, unresolved: gaps } satisfies ResolvePriorLabwareReferencesOutput,
      };
    },
  };
}

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

// ---------------------------------------------------------------------------
// resolve_references pass
// ---------------------------------------------------------------------------

/**
 * A reference that was successfully resolved against a registry.
 */
export interface ResolvedReference {
  kind: string;
  label: string;
  resolvedId: string;
  resolvedName?: string;
}

/**
 * A reference that could not be resolved.
 */
export interface UnresolvedReference {
  kind: string;
  label: string;
  reason: string;
  candidates?: unknown[];
}

/**
 * Output shape for the resolve_references pass.
 */
export interface ResolveReferencesOutput {
  resolvedRefs: ResolvedReference[];
  unresolvableRefs: UnresolvedReference[];
}

/**
 * Dependencies for creating the resolve_references pass.
 */
export interface CreateResolveReferencesPassDeps {
  protocolRegistry: RegistryLoader<ProtocolSpec>;
  assayRegistry: RegistryLoader<AssaySpec>;
  stampPatternRegistry: RegistryLoader<StampPatternSpec>;
  compoundClassRegistry: RegistryLoader<CompoundClass>;
}

/**
 * Simple fuzzy match: case-insensitive, strips non-alphanumeric chars,
 * returns true if either string contains the other.
 */
function fuzzyMatch(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const n = needle.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return h.includes(n) || n.includes(h);
}

/**
 * Creates the resolve_references pass that dispatches unresolved refs
 * from ai_precompile to the appropriate registry for lookup.
 *
 * This pass:
 * - Reads unresolvedRefs from state.outputs.get('ai_precompile')
 * - Dispatches each ref by kind to the correct registry
 * - Returns resolvedRefs[] and unresolvableRefs[]
 * - For compound-class with >1 candidates, emits a gap (not auto-pick)
 */
export function createResolveReferencesPass(
  deps: CreateResolveReferencesPassDeps,
): Pass {
  return {
    id: 'resolve_references',
    family: 'disambiguate' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { unresolvedRefs?: Array<{ kind: string; label: string; reason: string }> } | undefined;
      const refs = ai?.unresolvedRefs ?? [];
      const resolved: ResolvedReference[] = [];
      const unresolvable: UnresolvedReference[] = [];

      for (const ref of refs) {
        switch (ref.kind) {
          case 'protocol': {
            const found = deps.protocolRegistry.list().find(
              p => fuzzyMatch(p.name, ref.label) || p.id === ref.label,
            );
            if (found) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.id,
                resolvedName: found.name,
              });
            } else {
              unresolvable.push({ ...ref, reason: 'no matching protocol-spec' });
            }
            break;
          }
          case 'assay': {
            const found = deps.assayRegistry.list().find(
              a => fuzzyMatch(a.name, ref.label) || a.id === ref.label,
            );
            if (found) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.id,
                resolvedName: found.name,
              });
            } else {
              unresolvable.push({ ...ref, reason: 'no matching assay-spec' });
            }
            break;
          }
          case 'pattern': {
            const found =
              deps.stampPatternRegistry.get(ref.label) ??
              deps.stampPatternRegistry.list().find(
                p => fuzzyMatch(p.name, ref.label),
              );
            if (found) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.id,
                resolvedName: found.name,
              });
            } else {
              unresolvable.push({ ...ref, reason: 'no matching stamp-pattern' });
            }
            break;
          }
          case 'compound-class': {
            const found = deps.compoundClassRegistry.list().find(
              c => fuzzyMatch(c.name, ref.label) || c.id === ref.label,
            );
            if (!found) {
              unresolvable.push({ ...ref, reason: 'no matching compound-class' });
              break;
            }
            if (found.candidates.length === 1) {
              resolved.push({
                kind: ref.kind,
                label: ref.label,
                resolvedId: found.candidates[0].compoundId,
                resolvedName: found.candidates[0].name,
              });
            } else {
              unresolvable.push({
                ...ref,
                reason: `compound-class has ${found.candidates.length} candidates; pick one`,
                candidates: found.candidates,
              });
            }
            break;
          }
          default:
            // labware, material, other — not handled here (spec-014 for labware)
            unresolvable.push({
              ...ref,
              reason: `kind ${ref.kind} not handled by resolve_references`,
            });
        }
      }

      return {
        ok: true,
        output: { resolvedRefs: resolved, unresolvableRefs: unresolvable } satisfies ResolveReferencesOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// expand_protocol pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the expand_protocol pass.
 */
export interface ExpandProtocolOutput {
  events: PlateEventPrimitive[];
  stepsExpanded: number;
}

/**
 * Dependencies for creating the expand_protocol pass.
 */
export interface CreateExpandProtocolPassDeps {
  protocolRegistry: RegistryLoader<ProtocolSpec>;
}

/**
 * Creates the expand_protocol pass that unrolls resolved protocol-specs
 * into primitive PlateEventPrimitive events.
 *
 * This pass:
 * - Reads resolvedRefs from state.outputs.get('resolve_references')
 * - Filters for kind === 'protocol'
 * - For each resolved protocol, looks up the spec from the registry
 * - Finds the matching run_protocol invocation in ai_precompile's candidateEvents
 * - Substitutes {{key}} placeholders in step params from invocation bindings
 * - Emits one PlateEventPrimitive per step with the mapped event_type
 * - Unresolved placeholders produce warning diagnostics (not errors)
 */
export function createExpandProtocolPass(
  deps: CreateExpandProtocolPassDeps,
): Pass {
  return {
    id: 'expand_protocol',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const resolvedRefs = (
        state.outputs.get('resolve_references') as
          { resolvedRefs?: ResolvedReference[] } | undefined
      )?.resolvedRefs ?? [];
      const protocolRefs = resolvedRefs.filter(r => r.kind === 'protocol');

      const ai = state.outputs.get('ai_precompile') as
        { candidateEvents?: Array<{ verb: string; [k: string]: unknown }> } | undefined;
      const candidateEvents = ai?.candidateEvents ?? [];

      const emitted: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];
      let stepsExpanded = 0;

      for (const ref of protocolRefs) {
        const spec = deps.protocolRegistry.get(ref.resolvedId);
        if (!spec) {
          diagnostics.push({
            severity: 'warning',
            code: 'protocol_not_found',
            message: `Protocol ${ref.resolvedId} resolved but not findable`,
            pass_id,
          });
          continue;
        }

        // Find the run_protocol invocation in candidateEvents that refers to this ref
        const invocation = candidateEvents.find(
          e =>
            e.verb === 'run_protocol' &&
            (e.protocolRef === ref.label || e.protocolRef === ref.resolvedId),
        );
        const bindings = (invocation?.bindings as Record<string, string> | undefined) ?? {};

        for (const step of spec.steps) {
          const substituted = substituteParams(
            step.params,
            bindings,
            diagnostics,
            pass_id,
          );
          emitted.push({
            eventId: `pe_proto_${ref.resolvedId}_${step.step}`,
            event_type: mapProtocolVerbToEventType(step.verb),
            details: {
              protocolStepNumber: step.step,
              protocolId: ref.resolvedId,
              ...substituted,
            },
          });
          stepsExpanded++;
        }
      }

      return { ok: true, output: { events: emitted, stepsExpanded }, diagnostics };
    },
  };
}

/**
 * Substitute {{key}} placeholders in step params with values from bindings.
 * Unresolved placeholders produce a warning diagnostic and are set to null.
 */
function substituteParams(
  params: Record<string, unknown>,
  bindings: Record<string, string>,
  diagnostics: PassDiagnostic[],
  pass_id: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== 'string') {
      out[k] = v;
      continue;
    }
    const match = v.match(/^\{\{([^}]+)\}\}$/);
    if (!match) {
      out[k] = v;
      continue;
    }
    const key = match[1].trim();
    // Try exact key first, then fall back to the last segment after '.'
    const resolved =
      bindings[key] ?? bindings[key.split('.').pop() ?? ''];
    if (resolved === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'unresolved_placeholder',
        message: `Unresolved placeholder: {{${key}}}`,
        pass_id,
      });
      out[k] = null;
    } else {
      out[k] = resolved;
    }
  }
  return out;
}

/**
 * Map a protocol step verb to a PlateEventPrimitive event_type.
 * Falls back to 'transfer' for unmapped verbs.
 */
function mapProtocolVerbToEventType(
  verb: string,
): PlateEventPrimitive['event_type'] {
  switch (verb) {
    case 'add_material':
      return 'add_material';
    case 'transfer':
    case 'aliquot':
    case 'wash':
    case 'elute':
      return 'transfer';
    case 'mix':
      return 'mix';
    case 'incubate':
      return 'incubate';
    case 'read':
      return 'read';
    case 'spin':
    case 'pellet':
      return 'centrifuge';
    default:
      return 'transfer'; // fallback
  }
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
 * - Carries deckSlot from candidateLabwares through to labwareAdditions
 * - Output shape: { labwareAdditions, resolvedLabwares }
 */
export function createLabwareResolvePass(
  deps: CreateLabwareResolvePassDeps,
): Pass {
  return {
    id: 'resolve_labware',
    family: 'disambiguate' as const,
    async run({ pass_id, state }: PassRunArgs): Promise<PassResult> {
      const ai = state.outputs.get('ai_precompile') as { candidateLabwares?: CandidateLabware[] } | undefined;
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
            ...(cand.deckSlot ? { deckSlot: cand.deckSlot } : {}),
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

// ---------------------------------------------------------------------------
// lab_state pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the lab_state pass.
 */
export interface LabStatePassOutput {
  events: PlateEventPrimitive[];
  snapshotAfter: LabStateSnapshot;
}

/**
 * Creates the lab_state pass that folds expanded events over the prior
 * lab-state snapshot and emits the updated state.
 *
 * This pass:
 * - Reads prior labState from state.input.labState (defaults to emptyLabState)
 * - Reads events from state.outputs.get('mint_materials') and state.outputs.get('expand_biology_verbs')
 * - Folds each event over the prior snapshot via applyEventToLabState
 * - Increments turnIndex by 1
 * - Returns { events, snapshotAfter }
 */
export function createLabStatePass(): Pass {
  return {
    id: 'lab_state',
    family: 'emit' as const,
    run({ state }: PassRunArgs): PassResult {
      const prior = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const mintOutput = state.outputs.get('mint_materials') as
        { events?: PlateEventPrimitive[] } | undefined;
      const expandOutput = state.outputs.get('expand_biology_verbs') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = [
        ...(mintOutput?.events ?? []),
        ...(expandOutput?.events ?? []),
      ];
      let snapshot: LabStateSnapshot = { ...prior, turnIndex: prior.turnIndex + 1 };
      for (const event of events) {
        snapshot = applyEventToLabState(snapshot, event);
      }
      return { ok: true, output: { events, snapshotAfter: snapshot } };
    },
  };
}

// ---------------------------------------------------------------------------
// mint_materials pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the mint_materials pass.
 */
export interface MintMaterialsPassOutput {
  events: PlateEventPrimitive[];
}

/**
 * Generate a well address for a 96-well plate (rows A-H × cols 1-12).
 * Fills left-to-right, top-to-bottom.
 */
function wellAddressForIndex(index: number): string {
  const row = String.fromCharCode(65 + Math.floor(index / 12)); // A=65
  const col = (index % 12) + 1;
  return `${row}${col}`;
}

/**
 * Creates the mint_materials pass that expands mintMaterials directives
 * into create_container + add_material events.
 *
 * This pass:
 * - Reads mintMaterials from state.outputs.get('ai_precompile')
 * - For each directive with a placementLabwareHint, emits one create_container
 * - For each material to mint, emits one add_material with generated materialId
 * - Deduplicates create_container by placementLabwareHint
 */
export function createMintMaterialsPass(): Pass {
  return {
    id: 'mint_materials',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { mintMaterials?: MintMaterialsDirective[] } | undefined;
      const directives = ai?.mintMaterials ?? [];
      const events: PlateEventPrimitive[] = [];
      const createdHints = new Set<string>();

      for (const d of directives) {
        // 1. Emit create_container if placementLabwareHint present and not yet created
        if (d.placementLabwareHint && !createdHints.has(d.placementLabwareHint)) {
          createdHints.add(d.placementLabwareHint);
          events.push({
            eventId: `evt-mint-container-${d.placementLabwareHint}`,
            event_type: 'create_container',
            details: {
              labwareType: d.placementLabwareHint,
              slot: 'auto',
              instanceId: d.placementLabwareHint,
            },
          });
        }

        // 2. For n = 1..count: compute materialId, destination well, emit add_material
        const count = Math.max(0, d.count);
        for (let n = 1; n <= count; n++) {
          const materialId = d.namingPattern.replace('{n}', String(n));
          let well: string;

          if (d.wellSpread === 'first-row') {
            // First row: A1..L1 (12 wells)
            well = wellAddressForIndex(n - 1);
          } else if (d.wellSpread === 'explicit' && d.wellList && d.wellList.length > 0) {
            well = d.wellList[n - 1] ?? wellAddressForIndex(n - 1);
          } else {
            // Default: 'all' — fills every well left-to-right, top-to-bottom
            well = wellAddressForIndex(n - 1);
          }

          events.push({
            eventId: `evt-mint-${d.template}-${n}`,
            event_type: 'add_material',
            details: {
              labwareInstanceId: d.placementLabwareHint ?? 'auto',
              well,
              material: {
                materialId,
                kind: d.template,
                ...(d.properties ? { properties: d.properties } : {}),
              },
            },
          });
        }
      }

      return { ok: true, output: { events } satisfies MintMaterialsPassOutput };
    },
  };
}
