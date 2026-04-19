/**
 * Extraction passes for the extraction-compile pipeline.
 * 
 * This module provides three pass factories for the extraction pipeline:
 * - extractor_run: invokes the extractor adapter
 * - mention_resolve: resolves mentions in candidate drafts
 * - draft_assemble: assembles the extraction-draft record
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult, ExtractionCandidate } from '../../../extract/ExtractorAdapter.js';
import type { ResolutionCandidate, AmbiguitySpan } from '../../../extract/MentionResolver.js';
import { resolveMentions } from '../../../extract/MentionResolver.js';
import { buildExtractionDraft, type BuildExtractionDraftArgs } from '../../../extract/ExtractionDraftBuilder.js';

/**
 * Create the extractor_run pass.
 * 
 * This pass invokes the extractor adapter to extract candidates from text.
 * 
 * @param extractor - The extractor adapter to use
 * @returns A pass that runs the extractor
 */
export function createExtractorRunPass(extractor: ExtractorAdapter): Pass {
  return {
    id: 'extractor_run',
    family: 'parse',
    async run(args: PassRunArgs): Promise<PassResult> {
      const { state, pass_id } = args;
      
      // Read text from state.input (required)
      const input = state.input;
      const text = input.text;
      
      if (typeof text !== 'string') {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_INPUT_TEXT',
              message: 'state.input.text is required and must be a string',
              pass_id
            }
          ]
        };
      }

      // Build extraction request
      const hint = input.hint as ExtractionRequest['hint'];
      const extractionRequest: ExtractionRequest = {
        text
      };
      if (hint !== undefined) {
        extractionRequest.hint = hint;
      }

      // Call the extractor
      const result: ExtractionResult = await extractor.extract(extractionRequest);

      // Fold extractor diagnostics into pass diagnostics
      const passDiagnostics: PassDiagnostic[] = result.diagnostics.map(d => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        pass_id,
        details: d.details as Record<string, unknown>
      }));

      // Check for failure condition: zero candidates AND any error-severity diagnostic
      const hasErrorDiagnostic = result.diagnostics.some(d => d.severity === 'error');
      const hasNoCandidates = result.candidates.length === 0;

      if (hasNoCandidates && hasErrorDiagnostic) {
        return {
          ok: false,
          output: result,
          diagnostics: passDiagnostics
        };
      }

      // Success: return the full extraction result
      return {
        ok: true,
        output: result,
        diagnostics: passDiagnostics
      };
    }
  };
}

/**
 * Create the mention_resolve pass.
 * 
 * This pass resolves mentions in each candidate's draft using the
 * deterministic mention resolver.
 * 
 * @param candidatesByKind - Map from kind to list of resolution candidates
 * @returns A pass that resolves mentions
 */
export function createMentionResolvePass(
  candidatesByKind: ReadonlyMap<string, ReadonlyArray<ResolutionCandidate>>
): Pass {
  return {
    id: 'mention_resolve',
    family: 'disambiguate',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;

      // Get extractor_run output from state.outputs
      const extractorOutput = state.outputs.get('extractor_run') as ExtractionResult | undefined;
      
      if (!extractorOutput) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_EXTRACTOR_OUTPUT',
              message: 'extractor_run output not found in state.outputs',
              pass_id
            }
          ]
        };
      }

      // Process each candidate's draft
      const resolvedCandidates: typeof extractorOutput.candidates = [];
      const ambiguitySpansByCandidate: Array<typeof extractorOutput.candidates[number]['ambiguity_spans']> = [];

      for (const candidate of extractorOutput.candidates) {
        // Resolve mentions in the draft
        const result = resolveMentions(candidate.draft, candidatesByKind);
        
        // Build a new candidate with the resolved draft
        const resolvedCandidate = {
          ...candidate,
          draft: result.resolved_draft
        };
        
        resolvedCandidates.push(resolvedCandidate);
        ambiguitySpansByCandidate.push(result.ambiguity_spans);
      }

      // Build output
      const output = {
        resolved_candidates: resolvedCandidates,
        ambiguity_spans_by_candidate: ambiguitySpansByCandidate
      };

      // Always ok: ambiguities are not failures
      return {
        ok: true,
        output
      };
    }
  };
}

/**
 * Create the draft_assemble pass.
 * 
 * This pass assembles the final extraction-draft record from the
 * resolved candidates.
 * 
 * @param params - Configuration for the pass
 * @returns A pass that assembles the draft
 */
export function createDraftAssemblePass(params: {
  recordIdPrefix: string;    // e.g., "XDR-session-"
  source_artifact: BuildExtractionDraftArgs['source_artifact'];
  now?: () => Date;
}): Pass {
  const { recordIdPrefix, source_artifact, now } = params;
  
  return {
    id: 'draft_assemble',
    family: 'project',
    run(runArgs: PassRunArgs): PassResult {
      const { state, pass_id } = runArgs;

      // Get mention_resolve output from state.outputs
      const mentionResolveOutput = state.outputs.get('mention_resolve') as {
        resolved_candidates: ExtractionCandidate[];
        ambiguity_spans_by_candidate: AmbiguitySpan[][];
      } | undefined;

      if (!mentionResolveOutput) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_MENTION_RESOLVE_OUTPUT',
              message: 'mention_resolve output not found in state.outputs',
              pass_id
            }
          ]
        };
      }

      // Generate recordId: ${recordIdPrefix}${timestamp}-v1
      const nowFn = now ?? (() => new Date());
      const timestamp = nowFn().toISOString().replace(/[:.]/g, '-');
      const recordId = `${recordIdPrefix}${timestamp}-v1`;

      // Build extraction draft
      const buildArgs: BuildExtractionDraftArgs = {
        recordId,
        source_artifact,
        candidates: mentionResolveOutput.resolved_candidates,
        ambiguity_spans_by_candidate: mentionResolveOutput.ambiguity_spans_by_candidate
      };
      if (now !== undefined) {
        buildArgs.now = now;
      }
      const draftBody = buildExtractionDraft(buildArgs);

      return {
        ok: true,
        output: draftBody
      };
    }
  };
}
