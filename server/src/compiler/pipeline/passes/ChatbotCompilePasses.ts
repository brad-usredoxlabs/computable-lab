/**
 * ChatbotCompilePasses - Factory functions for passes in the chatbot-compile pipeline.
 * 
 * This module contains pass implementations for the chatbot-compile pipeline,
 * starting with the extract_entities pass that runs extraction on prompts and attachments.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { ResourceManifest } from '../CompileContracts.js';
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
import { applyDirectiveToLabState, type DirectiveNode } from '../../../compiler/directives/Directive.js';
import { getValidationChecks } from '../../../compiler/validation/ValidationCheck.js';

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
 * A state-change directive emitted by ai_precompile (non-liquid-handling).
 */
export interface Directive {
  kind: 'reorient_labware' | 'mount_pipette' | 'swap_pipette';
  params: Record<string, unknown>;
}

/**
 * A declared future compile job (e.g. downstream analysis).
 */
export interface DownstreamCompileJob {
  kind: string;             // e.g. 'qPCR', 'GC-FID', 'GC-MS', 'plate-reader', 'imaging'
  description?: string;
  params?: Record<string, unknown>;
}

/**
 * A named stamp / fanout / triplicate pattern invocation.
 */
export interface PatternEvent {
  pattern: string;          // id from stamp-pattern registry
  fromLabwareHint?: string;
  toLabwareHint?: string;
  startCol?: number;
  startRow?: string;
  count?: number;
  perPosition?: Record<string, unknown>;  // keyed by position index or label
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
  directives?: Directive[];                   // state-change nodes (reorient, mount, swap)
  downstreamCompileJobs?: DownstreamCompileJob[];  // declared future compile targets
  patternEvents?: PatternEvent[];             // named stamp pattern invocations
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
and contentHint (materials inside, if mentioned, e.g. "fecal samples").

State-change operations that are not liquid handling go in
directives. Emit {kind: 'reorient_labware', params: {labwareHint,
orientation: 'portrait'|'landscape'}} when the user says 'turn the
plate to portrait'. Emit {kind: 'mount_pipette', params:
{mountSide, pipetteType}} for pipette mounts. Emit {kind:
'swap_pipette', params: {from, to}} for mid-compile swaps.

When the user declares future analyses (e.g. 'we'll analyze by
qPCR, GC-FID, imaging'), add one entry per downstream readout to
downstreamCompileJobs. Do NOT expand them in the current compile.

When the user describes a stamp or replicate pattern (e.g. 'stamp
96-well into quadrants of a 384-well', 'triplicate wells'), emit a
patternEvent with the pattern id (from the stamp-pattern registry)
instead of enumerating individual wells.

Prefer role-based coordinates to physical well enumeration. When a
group of wells shares a semantic role, emit {role: '<role-name>'}
on the event instead of {wells: [B2, B3, ..., G11]}. Canonical roles
you may use: 'cell_region' (interior cells on a plate), 'control_well',
'positive_control', 'negative_control', 'treatment:<label>',
'perturbant_col_<N>', 'triplicate_<label>'. The compiler maps roles
to physical wells using the current plate orientation and assay panel
— you do not need to know the mapping. Emit physical well addresses
ONLY when the user specifies them explicitly and no role applies.
`;

/**
 * Zod schema for validating ai_precompile LLM output.
 * Malformed fields produce a warning diagnostic; the pass never throws.
 * Note: z.record() is broken in zod v4 in vitest, so we use z.any() instead.
 */
function createAiPrecompileOutputSchema() {
  const { z } = require('zod') as typeof import('zod');
  return z.object({
    candidateEvents: z.array(z.any()).default([]),
    candidateLabwares: z.array(z.any()).default([]),
    unresolvedRefs: z.array(z.any()).default([]),
    clarification: z.string().optional(),
    mintMaterials: z.array(z.any()).optional(),
    priorLabwareRefs: z.array(z.any()).optional(),
    directives: z
      .array(z.object({ kind: z.string(), params: z.any() }))
      .optional(),
    downstreamCompileJobs: z
      .array(
        z.object({
          kind: z.string(),
          description: z.string().optional(),
          params: z.any().optional(),
        }),
      )
      .optional(),
    patternEvents: z.array(z.any()).optional(),
  });
}

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
      // Validate against zod schema; emit warning on mismatch, never throw.
      let validated: unknown;
      try {
        validated = createAiPrecompileOutputSchema().parse(parsed);
      } catch {
        return {
          ok: true,
          output: { candidateEvents: [], candidateLabwares: [], unresolvedRefs: [] } satisfies AiPrecompileOutput,
          diagnostics: [{
            severity: 'warning',
            code: 'ai_precompile_shape_mismatch',
            message: 'ai_precompile output shape mismatch',
            pass_id,
          }],
        };
      }
      // Normalize: ensure all three arrays exist; carry through validated fields
      const output: AiPrecompileOutput = {
        candidateEvents: Array.isArray(parsed.candidateEvents) ? parsed.candidateEvents : [],
        candidateLabwares: Array.isArray(parsed.candidateLabwares) ? parsed.candidateLabwares : [],
        unresolvedRefs: Array.isArray(parsed.unresolvedRefs) ? parsed.unresolvedRefs : [],
        ...(typeof parsed.clarification === 'string' ? { clarification: parsed.clarification } : {}),
        ...(Array.isArray(parsed.mintMaterials) ? { mintMaterials: parsed.mintMaterials } : {}),
        ...(Array.isArray(parsed.priorLabwareRefs) ? { priorLabwareRefs: parsed.priorLabwareRefs } : {}),
        ...(Array.isArray(parsed.directives) ? { directives: parsed.directives } : {}),
        ...(Array.isArray(parsed.downstreamCompileJobs) ? { downstreamCompileJobs: parsed.downstreamCompileJobs } : {}),
        ...(Array.isArray(parsed.patternEvents) ? { patternEvents: parsed.patternEvents } : {}),
      };

      // Lint: flag dense physical-well enumeration (regression from role-based coords).
      // Skip events that already use role coordinates — only warn when wells are listed
      // without a role field present.
      const enumerationWarnings: PassDiagnostic[] = [];
      let regressionCount = 0;
      for (const event of output.candidateEvents) {
        const wells = (event as { wells?: string[] }).wells;
        if (Array.isArray(wells) && wells.length > 3 && !('role' in event)) {
          regressionCount++;
        }
      }
      if (regressionCount > 0) {
        enumerationWarnings.push({
          severity: 'warning',
          code: 'ai_precompile_role_regression',
          message: `LLM emitted ${regressionCount} events with dense physical-well enumeration. Prefer role coordinates.`,
          pass_id,
        });
      }

      return { ok: true, output, ...(enumerationWarnings.length > 0 ? { diagnostics: enumerationWarnings } : {}) };
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
 * Import the role resolver.
 */
import { defaultRoleResolver, type RoleResolutionContext } from '../../roles/RoleResolver.js';

/**
 * Import the pattern expander registry.
 */
import {
  getPatternExpander,
  type PatternExpanderContext,
} from '../../patterns/PatternExpanders.js';

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
 * - Handles targetLabwareRef: 'prior' sentinel by resolving against
 *   resolve_prior_labware_references output and passing the resolved
 *   instanceId as labware_id to the expander
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

      // Look up resolved prior labware refs (for targetLabwareRef: 'prior' sentinel)
      const priorLabwareOutput = state.outputs.get('resolve_prior_labware_references') as
        { resolvedLabwareRefs?: Array<{ hint: string; matched: { instanceId: string; labwareType: string } }> } | undefined;
      const resolvedPriorRefs = priorLabwareOutput?.resolvedLabwareRefs ?? [];

      for (const cand of candidateEvents) {
        const { verb, ...params } = cand;

        // Handle targetLabwareRef: 'prior' sentinel — resolve against prior labware refs
        if ((params.targetLabwareRef as string | undefined) === 'prior') {
          const firstResolved = resolvedPriorRefs[0];
          if (firstResolved) {
            // Pass the resolved instanceId as labware_id to the expander
            (params as Record<string, unknown>).labware_id = firstResolved.matched.instanceId;
          } else {
            // No resolved ref available — emit with null labwareInstanceId and flag in gaps
            diagnostics.push({
              severity: 'warning' as const,
              code: 'prior_labware_not_resolved',
              message: `targetLabwareRef 'prior' resolved to no labware; emitting event with null labwareId.`,
              pass_id,
            });
          }
        }

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
 * - Reads directives from state.outputs.get('apply_directives')
 * - Reads events from state.outputs.get('resolve_roles') (which aggregates
 *   mint_materials, expand_patterns, expand_biology_verbs, expand_protocol)
 * - Folds directives FIRST, then events, via applyDirectiveToLabState / applyEventToLabState
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
      // resolve_roles aggregates all expanded events (mint, patterns, verbs, protocol)
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = resolvedRolesOutput?.events ?? [];

      // Fold directives FIRST, then events (events depend on post-directive state)
      let snapshot: LabStateSnapshot = { ...prior, turnIndex: prior.turnIndex + 1 };
      const directives = (state.outputs.get('apply_directives') as { directives?: DirectiveNode[] } | undefined)?.directives ?? [];
      for (const d of directives) {
        snapshot = applyDirectiveToLabState(snapshot, d);
      }
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
 * Output shape for the apply_directives pass.
 */
export interface ApplyDirectivesPassOutput {
  directives: DirectiveNode[];
}

/**
 * Creates the apply_directives pass that turns ai_precompile.directives
 * entries into DirectiveNode[] with generated directiveIds.
 *
 * This pass:
 * - Reads directives from state.outputs.get('ai_precompile')
 * - For each directive, generates a directiveId (dir_<counter>)
 * - Emits { directives: DirectiveNode[] }
 */
export function createApplyDirectivesPass(): Pass {
  return {
    id: 'apply_directives',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { directives?: Directive[] } | undefined;
      const rawDirectives = ai?.directives ?? [];
      const directives: DirectiveNode[] = [];

      for (let i = 0; i < rawDirectives.length; i++) {
        const raw = rawDirectives[i]!;
        directives.push({
          directiveId: `dir_${i + 1}`,
          kind: raw.kind,
          params: raw.params ?? {},
        });
      }

      return {
        ok: true,
        output: { directives } satisfies ApplyDirectivesPassOutput,
      };
    },
  };
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
 * Collect all existing materialIds from labState for collision detection.
 */
function collectExistingMaterialIds(labState: LabStateSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const instance of Object.values(labState.labware)) {
    for (const materials of Object.values(instance.wells)) {
      for (const m of materials) {
        ids.add(m.materialId);
      }
    }
  }
  return ids;
}

/**
 * Resolve the placement labware for a mint directive.
 * Priority order:
 * 1. resolve_prior_labware_references (by labwareType match)
 * 2. resolve_labware pass output (resolvedLabwares)
 * 3. labState direct lookup (by labwareType match)
 * 4. Otherwise return undefined (will create new container)
 */
function resolvePlacementLabware(
  directive: MintMaterialsDirective,
  state: PipelineState,
): { instanceId: string; labwareType: string } | undefined {
  const hint = directive.placementLabwareHint;
  if (!hint) return undefined;

  // 1. Check resolve_prior_labware_references output
  const priorLabwareOutput = state.outputs.get('resolve_prior_labware_references') as
    { resolvedLabwareRefs?: Array<{ hint: string; matched: { instanceId: string; labwareType: string } }> } | undefined;
  const priorRefs = priorLabwareOutput?.resolvedLabwareRefs ?? [];
  for (const ref of priorRefs) {
    if (ref.matched.labwareType === hint) {
      return ref.matched;
    }
  }

  // 2. Check resolve_labware pass output
  const labwareResolveOutput = state.outputs.get('resolve_labware') as
    { resolvedLabwares?: Array<{ hint: string; recordId: string; title?: string }> } | undefined;
  const resolvedLabwares = labwareResolveOutput?.resolvedLabwares ?? [];
  for (const rl of resolvedLabwares) {
    if (rl.hint === hint) {
      return { instanceId: rl.recordId, labwareType: hint };
    }
  }

  // 3. Check labState directly for existing labware of this type
  const labState = (state.input as { labState?: LabStateSnapshot }).labState ?? emptyLabState();
  for (const instance of Object.values(labState.labware)) {
    if (instance.labwareType === hint) {
      return { instanceId: instance.instanceId, labwareType: hint };
    }
  }

  return undefined;
}

/**
 * Creates the mint_materials pass that expands mintMaterials directives
 * into create_container + add_material events.
 *
 * This pass:
 * - Reads mintMaterials from state.outputs.get('ai_precompile')
 * - Iterates ALL directives (not just the first)
 * - For each directive with a placementLabwareHint:
 *   - Resolves against resolve_prior_labware_references, then resolve_labware
 *   - If an existing labware instance is found, reuses it (no create_container)
 *   - Otherwise emits one create_container
 * - For each material to mint, emits one add_material with generated materialId
 * - Name collision check: if materialId already exists in labState, appends _2, _3, etc.
 *   and emits a warning diagnostic with code 'mint_materials_name_collision'
 * - wellSpread: 'explicit' uses directive.wellList verbatim
 * - wellSpread: 'first-row' fills A1..L1 (12 wells)
 * - wellSpread: 'all' (default) fills every well left-to-right, top-to-bottom
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
      const diagnostics: PassDiagnostic[] = [];
      const createdHints = new Set<string>();

      // Collect existing materialIds from labState for collision detection
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const existingMaterialIds = collectExistingMaterialIds(labState);

      // Track used disambiguation suffixes per naming pattern
      const usedMaterialIds = new Set<string>(existingMaterialIds);

      for (const d of directives) {
        // 1. Resolve placement labware
        const resolvedLabware = resolvePlacementLabware(d, state);
        const labwareInstanceId = resolvedLabware?.instanceId ?? d.placementLabwareHint ?? 'auto';
        const labwareType = resolvedLabware?.labwareType ?? d.placementLabwareHint ?? '96-well-plate';

        // 2. Emit create_container only if labware doesn't already exist in labState
        if (d.placementLabwareHint && !createdHints.has(d.placementLabwareHint)) {
          // Check if this labware already exists in labState
          const alreadyExists = Object.values(labState.labware).some(
            inst => inst.labwareType === d.placementLabwareHint,
          );

          if (!alreadyExists) {
            createdHints.add(d.placementLabwareHint);
            events.push({
              eventId: `evt-mint-container-${d.placementLabwareHint}`,
              event_type: 'create_container',
              details: {
                labwareType,
                slot: 'auto',
                instanceId: labwareInstanceId,
              },
            });
          }
          // If already exists, skip create_container — reuse existing instance
        }

        // 3. For n = 1..count: compute materialId, destination well, emit add_material
        const count = Math.max(0, d.count);
        for (let n = 1; n <= count; n++) {
          let materialId = d.namingPattern.replace('{n}', String(n));

          // Name collision check: if materialId already exists, append suffix
          let suffix = 2;
          while (usedMaterialIds.has(materialId)) {
            materialId = `${d.namingPattern.replace('{n}', String(n))}_${suffix}`;
            suffix++;
          }
          usedMaterialIds.add(materialId);

          // Emit warning diagnostic on collision
          if (suffix > 2) {
            diagnostics.push({
              severity: 'warning',
              code: 'mint_materials_name_collision',
              message: `MaterialId '${materialId}' collides with existing material; disambiguated to '${materialId}'`,
              pass_id,
              details: {
                originalPattern: d.namingPattern,
                n,
                template: d.template,
              },
            });
          }

          let well: string;

          if (d.wellSpread === 'first-row') {
            // First row: A1..L1 (12 wells)
            well = wellAddressForIndex(n - 1);
          } else if (d.wellSpread === 'explicit' && d.wellList && d.wellList.length > 0) {
            // Explicit well list: use wellList verbatim
            well = d.wellList[n - 1] ?? wellAddressForIndex(n - 1);
          } else {
            // Default: 'all' — fills every well left-to-right, top-to-bottom
            well = wellAddressForIndex(n - 1);
          }

          events.push({
            eventId: `evt-mint-${d.template}-${n}`,
            event_type: 'add_material',
            details: {
              labwareInstanceId,
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

      return { ok: true, output: { events } satisfies MintMaterialsPassOutput, diagnostics };
    },
  };
}

// ---------------------------------------------------------------------------
// expand_patterns pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the expand_patterns pass.
 */
export interface ExpandPatternsOutput {
  events: PlateEventPrimitive[];
}

/**
 * Dependencies for creating the expand_patterns pass.
 */
export interface CreateExpandPatternsPassDeps {
  stampPatternRegistry: RegistryLoader<StampPatternSpec>;
}

/**
 * Creates the expand_patterns pass that dispatches patternEvents from
 * ai_precompile to registered pattern expanders.
 *
 * This pass:
 * - Reads patternEvents from state.outputs.get('ai_precompile')
 * - For each PatternEvent, looks up the stamp-pattern spec from the registry
 * - Looks up the registered expander by pattern id
 * - Invokes the expander, collecting emitted events
 * - Missing expander → warning diagnostic, no events emitted for that entry
 * - Output: { events: PlateEventPrimitive[] }
 */
export function createExpandPatternsPass(
  deps: CreateExpandPatternsPassDeps,
): Pass {
  return {
    id: 'expand_patterns',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { patternEvents?: PatternEvent[] } | undefined;
      const patternEvents = ai?.patternEvents ?? [];
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();
      const emitted: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const pe of patternEvents) {
        const spec = deps.stampPatternRegistry.get(pe.pattern);
        if (!spec) {
          diagnostics.push({
            severity: 'warning',
            code: 'unknown_pattern',
            message: `Unknown stamp pattern: ${pe.pattern}`,
            pass_id,
          });
          continue;
        }
        const expander = getPatternExpander(pe.pattern);
        if (!expander) {
          diagnostics.push({
            severity: 'warning',
            code: 'missing_expander',
            message: `No expander registered for pattern: ${pe.pattern}`,
            pass_id,
          });
          continue;
        }
        const events = expander.expand(pe, spec, { labState });
        emitted.push(...events);
      }

      return { ok: true, output: { events: emitted }, diagnostics };
    },
  };
}

// ---------------------------------------------------------------------------
// resolve_roles pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the resolve_roles pass.
 */
export interface ResolveRolesOutput {
  events: PlateEventPrimitive[];
}

/**
 * Collect all events from upstream passes that may contain role fields.
 * This includes events from mint_materials, expand_patterns, expand_biology_verbs,
 * and expand_protocol passes.
 */
function collectEventsToResolve(state: PipelineState): PlateEventPrimitive[] {
  const mintOutput = state.outputs.get('mint_materials') as
    { events?: PlateEventPrimitive[] } | undefined;
  const patternsOutput = state.outputs.get('expand_patterns') as
    { events?: PlateEventPrimitive[] } | undefined;
  const verbsOutput = state.outputs.get('expand_biology_verbs') as
    { events?: PlateEventPrimitive[] } | undefined;
  const protocolOutput = state.outputs.get('expand_protocol') as
    { events?: PlateEventPrimitive[] } | undefined;

  return [
    ...(mintOutput?.events ?? []),
    ...(patternsOutput?.events ?? []),
    ...(verbsOutput?.events ?? []),
    ...(protocolOutput?.events ?? []),
  ];
}

/**
 * Find the labware type for an event from the labState.
 * Falls back to '96-well-plate' if no labware info is available.
 */
function findLabwareTypeForEvent(
  event: PlateEventPrimitive,
  labState: LabStateSnapshot,
): string {
  const details = event.details as Record<string, unknown> | undefined;
  const labwareInstanceId = details?.labwareInstanceId as string | undefined;
  if (labwareInstanceId && labState.labware[labwareInstanceId]) {
    return labState.labware[labwareInstanceId]!.labwareType;
  }
  // Default to 96-well-plate for role resolution
  return '96-well-plate';
}

/**
 * Find the orientation for an event from the labState.
 * Falls back to 'landscape' if no labware info is available.
 */
function findOrientationForEvent(
  event: PlateEventPrimitive,
  labState: LabStateSnapshot,
): 'landscape' | 'portrait' {
  const details = event.details as Record<string, unknown> | undefined;
  const labwareInstanceId = details?.labwareInstanceId as string | undefined;
  if (labwareInstanceId && labState.labware[labwareInstanceId]) {
    return labState.labware[labwareInstanceId]!.orientation;
  }
  return 'landscape';
}

/**
 * Creates the resolve_roles pass that maps role-based coordinates
 * to physical well addresses under the current labware orientation.
 *
 * This pass:
 * - Collects events from mint_materials, expand_patterns, expand_biology_verbs, expand_protocol
 * - For each event with a role field in details, resolves the role to concrete wells
 * - Events without a role pass through unchanged
 * - Events with a role are expanded into N concrete events (one per well)
 * - Original role event is removed; new events get regenerated IDs
 * - Uses the current labware orientation from labState
 * - Uses assay-spec panelConstraints if an assay is tagged
 * - Falls back to the default role library for common roles
 */
export function createResolveRolesPass(): Pass {
  return {
    id: 'resolve_roles',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const events = collectEventsToResolve(state);
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      // Look up resolved assay refs for panelConstraints
      const resolvedRefs = (
        state.outputs.get('resolve_references') as
          { resolvedRefs?: ResolvedReference[] } | undefined
      )?.resolvedRefs ?? [];
      const assayRefs = resolvedRefs.filter(r => r.kind === 'assay');
      const assaySpec = assayRefs.length > 0
        ? (assayRefs[0] as { resolvedId: string; resolvedName?: string })
        : undefined;

      const out: PlateEventPrimitive[] = [];
      let counter = 0;

      for (const ev of events) {
        const details = ev.details as Record<string, unknown> | undefined;
        const role = details?.role as string | undefined;

        if (!role) {
          // No role — pass through unchanged
          out.push(ev);
          continue;
        }

        // Resolve the role to concrete well addresses
        const labwareType = findLabwareTypeForEvent(ev, labState);
        const orientation = findOrientationForEvent(ev, labState);

        const ctx: RoleResolutionContext = {
          orientation,
          labwareType,
          assay: assaySpec ? { id: assayRefs[0]!.resolvedId } : undefined,
          args: details as Record<string, unknown>,
        };

        const wells = defaultRoleResolver(role, ctx);

        if (wells.length === 0) {
          // Unknown role — pass through unchanged with a warning
          out.push(ev);
          continue;
        }

        // Expand into one event per well
        for (const well of wells) {
          out.push({
            ...ev,
            eventId: `${ev.eventId}_r${counter++}`,
            details: {
              ...ev.details,
              well,
              role: undefined,
            } as Record<string, unknown>,
          });
        }
      }

      return { ok: true, output: { events: out } satisfies ResolveRolesOutput };
    },
  };
}

// ---------------------------------------------------------------------------
// compute_volumes pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the compute_volumes pass.
 */
export interface ComputeVolumesPassOutput {
  events: PlateEventPrimitive[];
}

/**
 * Import the volume resolver.
 */
import {
  isVolumePlaceholder,
  resolveVolumePlaceholder,
  type VolumePlaceholder,
} from '../../math/VolumeResolver.js';

/**
 * Creates the compute_volumes pass that resolves placeholder volumes
 * ('just_enough', { percent, of }, 'COMPUTED', etc.) to concrete uL values.
 *
 * This pass:
 * - Reads events from state.outputs.get('resolve_roles')
 * - For each event with a placeholder volumeUl, invokes the resolver
 * - Replaces the placeholder with the concrete value, or surfaces a gap
 * - Pass never throws — unresolvable placeholders produce warning diagnostics
 */
export function createComputeVolumesPass(): Pass {
  return {
    id: 'compute_volumes',
    family: 'expand' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = resolvedRolesOutput?.events ?? [];
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      const resolved: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const ev of events) {
        const details = ev.details as Record<string, unknown>;
        const rawVolume = details.volumeUl;

        // Skip events that already have a concrete numeric volume
        if (typeof rawVolume === 'number' && !Number.isNaN(rawVolume)) {
          resolved.push(ev);
          continue;
        }

        // Skip events without a volumeUl field at all
        if (rawVolume === undefined) {
          resolved.push(ev);
          continue;
        }

        // Check if this is a volume placeholder
        if (!isVolumePlaceholder(rawVolume)) {
          resolved.push(ev);
          continue;
        }

        // Determine the reagent kind from the event
        const material = details.material as { kind?: string } | undefined;
        const reagentKind = material?.kind ?? 'unknown';

        // Resolve the placeholder
        const result = resolveVolumePlaceholder(
          rawVolume as VolumePlaceholder,
          reagentKind,
          events,
          labState,
        );

        if (result.resolvedUl !== null) {
          // Replace the placeholder with the concrete value
          resolved.push({
            ...ev,
            details: {
              ...details,
              volumeUl: result.resolvedUl,
            },
          });
        } else {
          // Unresolvable — surface as a gap diagnostic, pass through event
          diagnostics.push({
            severity: 'warning',
            code: 'unresolvable_volume',
            message: result.gap ?? `Unresolvable volume for event ${ev.eventId}`,
            pass_id,
            details: {
              eventId: ev.eventId,
              placeholder: String(rawVolume),
              reagentKind,
            },
          });
          resolved.push(ev);
        }
      }

      return {
        ok: true,
        output: { events: resolved } satisfies ComputeVolumesPassOutput,
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// compute_resources pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the compute_resources pass.
 */
export interface ComputeResourcesPassOutput {
  resourceManifest: ResourceManifest;
}

/**
 * Pipetting event types that consume a tip.
 */
/**
 * Pipetting event types that consume a tip.
 * Only liquid-handling operations — excludes spin, pellet, freeze, thaw,
 * label, count, passage which do not use pipette tips.
 */
const PIPETTING_EVENT_TYPES: ReadonlySet<string> = new Set([
  'transfer',
  'add_material',
  'mix',
  'aliquot',
  'wash',
  'elute',
  'resuspend',
  'dilute',
  'stain',
  'fix',
  'permeabilize',
  'block',
  'quench',
  'transfect',
]);

/**
 * Channels per pipette type.
 */
const CHANNELS_PER_TYPE: Readonly<Record<string, number>> = {
  'p1000-single': 1,
  'p1000-multi': 8,
  'p300-single': 1,
  'p300-multi': 8,
  'p200-single': 1,
  'p200-multi': 8,
  'p20-single': 1,
  'p20-multi': 8,
  'p10-single': 1,
  'p10-multi': 8,
  'p1000-12ch': 12,
  'p300-12ch': 12,
  'p200-12ch': 12,
  'p20-12ch': 12,
};

/**
 * Default channel count when pipette type is unknown.
 */
const DEFAULT_CHANNELS = 1;

/**
 * Tips per rack (standard 96-tip rack).
 */
const TIPS_PER_RACK = 96;

/**
 * Creates the compute_resources pass that walks the final event list
 * and emits a ResourceManifest with tip-rack counts, reservoir loads,
 * and consumable labware.
 *
 * This pass:
 * - Reads events from state.outputs.get('compute_volumes')
 * - Reads labState from state.input.labState
 * - Reads deckLayoutPlan from state.outputs.get('lab_state') (labStateDelta)
 *   to determine which labware is already "pinned"
 * - For each pipetting event, increments tip counter per pipetteType
 * - For each transfer from a reservoir, aggregates volume by reservoir+well+reagentKind
 * - Consumables: labware instances not in deckLayoutPlan.pinned
 * - Output: { resourceManifest }
 */
export function createComputeResourcesPass(): Pass {
  return {
    id: 'compute_resources',
    family: 'emit' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      const computeVolumesOutput = state.outputs.get('compute_volumes') as
        { events?: PlateEventPrimitive[] } | undefined;
      const events = computeVolumesOutput?.events ?? [];
      const labState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      // 1. Tip counting: walk pipetting events, count tips per pipetteType
      const tipCounts = new Map<string, number>(); // pipetteType → total tips used

      for (const ev of events) {
        if (!PIPETTING_EVENT_TYPES.has(ev.event_type)) {
          continue;
        }

        const details = ev.details as Record<string, unknown> | undefined;
        const pipetteType = (details?.pipetteType as string)
          ?? (details?.pipette as string)
          ?? 'unknown';

        // Each pipetting operation consumes exactly 1 tip.
        // The pipetteType determines which rack type to use, not the tip count.
        tipCounts.set(pipetteType, (tipCounts.get(pipetteType) ?? 0) + 1);
      }

      // Convert tip counts to rack counts (ceil(total / 96))
      const tipRacks: Array<{ pipetteType: string; rackCount: number }> = [];
      for (const [pipetteType, totalTips] of tipCounts) {
        const rackCount = Math.ceil(totalTips / TIPS_PER_RACK);
        tipRacks.push({ pipetteType, rackCount });
      }

      // 2. Reservoir loads: aggregate volumes from transfer events where source is a reservoir
      const reservoirLoads = new Map<string, { well: string; reagentKind: string; volumeUl: number }>();

      for (const ev of events) {
        if (ev.event_type !== 'transfer') {
          continue;
        }

        const details = ev.details as Record<string, unknown> | undefined;
        const from = details?.from as Record<string, unknown> | undefined;
        const fromLabwareId = from?.labwareInstanceId as string | undefined;

        // Check if source is a reservoir
        if (!fromLabwareId || !(fromLabwareId in labState.reservoirs)) {
          continue;
        }

        const fromWell = from.well as string | undefined;
        const volumeUl = typeof details?.volumeUl === 'number' ? details.volumeUl : 0;
        const material = details?.material as { kind?: string } | undefined;
        const reagentKind = material?.kind ?? 'unknown';

        if (!fromWell || volumeUl <= 0) {
          continue;
        }

        const key = `${fromLabwareId}::${fromWell}::${reagentKind}`;
        const existing = reservoirLoads.get(key);
        if (existing) {
          existing.volumeUl += volumeUl;
        } else {
          reservoirLoads.set(key, {
            reservoirRef: fromLabwareId,
            well: fromWell,
            reagentKind,
            volumeUl,
          });
        }
      }

      const reservoirLoadsArray = Array.from(reservoirLoads.values());

      // 3. Consumables: labware instances not already declared in deckLayoutPlan.pinned
      // Read deckLayoutPlan from lab_state pass output (labStateDelta)
      const labStateOutput = state.outputs.get('lab_state') as
        { events?: PlateEventPrimitive[]; snapshotAfter?: LabStateSnapshot } | undefined;
      const snapshotAfter = labStateOutput?.snapshotAfter;

      // Also check the lab_stateDelta output for deckLayoutPlan
      const deckLayoutPlan = (state.outputs.get('lab_state') as
        { deckLayoutPlan?: { pinned: Array<{ slot: string; labwareHint: string }> } } | undefined
      )?.deckLayoutPlan;

      // Collect pinned labware hints
      const pinnedHints = new Set<string>();
      if (deckLayoutPlan?.pinned) {
        for (const pin of deckLayoutPlan.pinned) {
          pinnedHints.add(pin.labwareHint);
        }
      }

      // Also check labStateDelta for deckLayoutPlan
      const labStateDelta = (state.outputs.get('lab_state') as
        { labStateDelta?: { deckLayoutPlan?: { pinned: Array<{ slot: string; labwareHint: string }> } } } | undefined
      )?.labStateDelta;
      if (labStateDelta?.deckLayoutPlan?.pinned) {
        for (const pin of labStateDelta.deckLayoutPlan.pinned) {
          pinnedHints.add(pin.labwareHint);
        }
      }

      // Collect labware types not in pinned hints
      const consumables = new Set<string>();
      for (const instance of Object.values(labState.labware)) {
        // Check if this labware's type is in the pinned hints
        let isPinned = false;
        for (const hint of pinnedHints) {
          if (instance.labwareType.includes(hint) || hint.includes(instance.labwareType)) {
            isPinned = true;
            break;
          }
        }
        if (!isPinned) {
          consumables.add(instance.labwareType);
        }
      }

      const consumablesArray = Array.from(consumables);

      return {
        ok: true,
        output: {
          resourceManifest: {
            tipRacks,
            reservoirLoads: reservoirLoadsArray,
            consumables: consumablesArray,
          },
        } satisfies ComputeResourcesPassOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// plan_deck_layout pass
// ---------------------------------------------------------------------------

/**
 * Opentrons-style 4×4 deck slot grid (A1–D4).
 */
const OT_DECK_SLOTS = [
  'A1','A2','A3','A4',
  'B1','B2','B3','B4',
  'C1','C2','C3','C4',
  'D1','D2','D3','D4',
] as const;

/**
 * Output shape for the plan_deck_layout pass.
 */
export interface PlanDeckLayoutOutput {
  pinned: Array<{ slot: string; labwareHint: string }>;
  autoFilled: Array<{ slot: string; labwareHint: string; reason: string }>;
  conflicts: Array<{ slot: string; candidates: string[] }>;
}

/**
 * Creates the plan_deck_layout pass that assembles a full deck layout plan.
 *
 * This pass:
 * - Reads labwareAdditions from resolve_labware (which carries deckSlot hints)
 * - Reads tipRacks from resourceManifest (compute_resources output)
 * - Assembles pinned: one per unique deckSlot hint (first-wins on conflict)
 * - Detects conflicts: two hints for the same slot → record conflict, keep first
 * - Auto-fills remaining labware + tipRacks into first available OT_DECK_SLOTS
 * - Output: { pinned, autoFilled, conflicts }
 */
export function createPlanDeckLayoutPass(): Pass {
  return {
    id: 'plan_deck_layout',
    family: 'emit' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      // 1. Read labware additions from resolve_labware
      const labwareOutput = state.outputs.get('resolve_labware') as
        { labwareAdditions?: AiLabwareAdditionPatch[] } | undefined;
      const labwareAdditions = labwareOutput?.labwareAdditions ?? [];

      // 2. Read tipRacks from resourceManifest (compute_resources output)
      const computeResourcesOutput = state.outputs.get('compute_resources') as
        { resourceManifest?: { tipRacks: Array<{ pipetteType: string; rackCount: number }> } } | undefined;
      const tipRacks = computeResourcesOutput?.resourceManifest?.tipRacks ?? [];

      // 3. Build pinned list from deckSlot hints (first-wins on conflict)
      const pinned: Array<{ slot: string; labwareHint: string }> = [];
      const conflicts: Array<{ slot: string; candidates: string[] }> = [];
      const pinnedSlots = new Set<string>();
      const pinnedLabwareHints = new Set<string>();

      for (const patch of labwareAdditions) {
        const slot = patch.deckSlot;
        if (!slot) continue;
        if (pinnedSlots.has(slot)) {
          // Conflict: another labware already pinned here
          const existing = pinned.find(p => p.slot === slot);
          if (existing) {
            const conflictEntry = conflicts.find(c => c.slot === slot);
            if (conflictEntry) {
              conflictEntry.candidates.push(patch.recordId);
            } else {
              conflicts.push({ slot, candidates: [existing.labwareHint, patch.recordId] });
            }
          }
        } else {
          pinnedSlots.add(slot);
          pinned.push({ slot, labwareHint: patch.recordId });
          pinnedLabwareHints.add(patch.recordId);
        }
      }

      // 4. Collect remaining labware hints (no deckSlot)
      const remainingLabware = labwareAdditions
        .filter(p => !p.deckSlot)
        .map(p => p.recordId);

      // 5. Auto-fill: remaining labware + tipRacks into first available slots
      const autoFilled: Array<{ slot: string; labwareHint: string; reason: string }> = [];
      const usedSlots = new Set(pinnedSlots);

      // Helper: find first available slot
      const nextAvailableSlot = (): string | undefined => {
        for (const slot of OT_DECK_SLOTS) {
          if (!usedSlots.has(slot)) {
            usedSlots.add(slot);
            return slot;
          }
        }
        return undefined;
      };

      // Auto-fill remaining labware
      for (const hint of remainingLabware) {
        const slot = nextAvailableSlot();
        if (slot) {
          autoFilled.push({ slot, labwareHint: hint, reason: 'autoFill' });
        }
      }

      // Auto-fill tipRacks
      for (const tipRack of tipRacks) {
        const slot = nextAvailableSlot();
        if (slot) {
          autoFilled.push({ slot, labwareHint: tipRack.pipetteType, reason: 'tipRack' });
        }
      }

      return {
        ok: true,
        output: { pinned, autoFilled, conflicts } satisfies PlanDeckLayoutOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// validate pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the validate pass.
 */
export interface ValidatePassOutput {
  validationReport: { findings: unknown[] };
}

/**
 * Creates the validate pass that aggregates findings from all
 * registered ValidationChecks into a ValidationReport.
 *
 * This pass:
 * - Reads TerminalArtifacts from the pipeline state (assembled from
 *   upstream pass outputs)
 * - Reads priorLabState from state.input.labState
 * - Invokes every registered ValidationCheck
 * - Aggregates all findings into a ValidationReport
 * - Returns { validationReport: { findings } }
 */
export function createValidatePass(): Pass {
  return {
    id: 'validate',
    family: 'validate' as const,
    run({ state }: PassRunArgs): PassResult {
      const artifacts = (state.input as { terminalArtifacts?: unknown }).terminalArtifacts
        ?? {};
      const priorLabState = (state.input as { labState?: LabStateSnapshot }).labState
        ?? emptyLabState();

      const findings: unknown[] = [];
      for (const check of getValidationChecks()) {
        findings.push(...check.run({ artifacts, priorLabState }));
      }

      return {
        ok: true,
        output: { validationReport: { findings } } satisfies ValidatePassOutput,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// emit_instrument_run_files pass
// ---------------------------------------------------------------------------

import {
  getInstrumentEmitter,
  type InstrumentRunFile,
} from '../../artifacts/InstrumentRunFile.js';

/**
 * Output shape for the emit_instrument_run_files pass.
 */
export interface EmitInstrumentRunFilesOutput {
  instrumentRunFiles: InstrumentRunFile[];
}

/**
 * Creates the emit_instrument_run_files pass that generates
 * InstrumentRunFile artifacts for each read-event instrument group.
 *
 * This pass:
 * - Reads all events from resolve_roles output
 * - Groups read events by details.instrument
 * - For each instrument with a registered emitter, invokes it
 * - Unregistered instruments emit a warning diagnostic + skipped run file
 * - Output: { instrumentRunFiles: InstrumentRunFile[] }
 */
export function createEmitInstrumentRunFilesPass(): Pass {
  return {
    id: 'emit_instrument_run_files',
    family: 'emit' as const,
    run({ pass_id, state }: PassRunArgs): PassResult {
      // Collect all events from upstream passes
      const resolvedRolesOutput = state.outputs.get('resolve_roles') as
        { events?: PlateEventPrimitive[] } | undefined;
      const allEvents = resolvedRolesOutput?.events ?? [];

      // Read resolved refs for emitter context
      const resolveRefsOutput = state.outputs.get('resolve_references') as
        { resolvedRefs?: ResolvedReference[] } | undefined;
      const resolvedRefs = resolveRefsOutput?.resolvedRefs ?? [];

      // Group read events by instrument
      const instrumentGroups = new Map<string, PlateEventPrimitive[]>();
      for (const event of allEvents) {
        if (event.event_type === 'read') {
          const instrument = (event.details as { instrument?: string }).instrument;
          if (instrument) {
            const group = instrumentGroups.get(instrument) ?? [];
            group.push(event);
            instrumentGroups.set(instrument, group);
          }
        }
      }

      const instrumentRunFiles: InstrumentRunFile[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const [instrument, events] of instrumentGroups) {
        const emitter = getInstrumentEmitter(instrument);
        if (!emitter) {
          // Unregistered instrument: emit warning + skipped run file
          diagnostics.push({
            severity: 'warning',
            code: 'unregistered_instrument',
            message: `No emitter registered for instrument '${instrument}'; skipping run-file generation.`,
            pass_id,
            details: { instrument },
          });
          instrumentRunFiles.push({
            instrument,
            wells: [],
          });
          continue;
        }
        try {
          const runFile = emitter(events, resolvedRefs);
          instrumentRunFiles.push(runFile);
        } catch (err) {
          diagnostics.push({
            severity: 'error',
            code: 'emitter_failure',
            message: `Emitter for instrument '${instrument}' threw: ${err instanceof Error ? err.message : String(err)}`,
            pass_id,
            details: { instrument },
          });
        }
      }

      return {
        ok: true,
        output: { instrumentRunFiles } satisfies EmitInstrumentRunFilesOutput,
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// emit_downstream_queue pass
// ---------------------------------------------------------------------------

/**
 * Output shape for the emit_downstream_queue pass.
 */
export interface EmitDownstreamQueueOutput {
  downstreamQueue: DownstreamCompileJob[];
}

/**
 * Creates the emit_downstream_queue pass that reads
 * ai_precompile.downstreamCompileJobs and passes them through
 * to its output as downstreamQueue.
 *
 * This pass:
 * - Reads downstreamCompileJobs from state.outputs.get('ai_precompile')
 * - Passes them through verbatim as downstreamQueue
 * - Returns { downstreamQueue: DownstreamCompileJob[] }
 */
export function createEmitDownstreamQueuePass(): Pass {
  return {
    id: 'emit_downstream_queue',
    family: 'emit' as const,
    run({ state }: PassRunArgs): PassResult {
      const ai = state.outputs.get('ai_precompile') as
        { downstreamCompileJobs?: DownstreamCompileJob[] } | undefined;
      const queue = ai?.downstreamCompileJobs ?? [];
      return { ok: true, output: { downstreamQueue: queue } satisfies EmitDownstreamQueueOutput };
    },
  };
}
