/**
 * DeterministicPrecompilePass — assembles candidateEvents from clause + verb + nouns + params.
 *
 * This pass combines TextSegmenter, VerbMatcher, ParameterGrammar, and NounPhraseResolver
 * into a single pipeline pass. Its output is a strict superset of AiPrecompileOutput
 * (so downstream passes don't change) plus two extra fields: residualClauses and
 * deterministicCompleteness.
 *
 * Passthrough strategy (spec-046):
 *   Strategy A — this pass writes a stripped AiPrecompileOutput-shaped subset of its
 *   output to state.outputs under key 'ai_precompile' via PassResult.secondaryOutputs.
 *   This ensures downstream passes (mint_materials, expand_biology_verbs, resolve_labware,
 *   etc.) can read outputs.ai_precompile.* even when ai_precompile is gated off (when
 *   clause evaluates false). When ai_precompile DOES run, it overwrites this passthrough
 *   with its own output, which is the correct behavior.
 */

import type { Pass, PassRunArgs, PassResult } from '../types.js';
import type { AiPrecompileOutput } from './ChatbotCompilePasses.js';
import { segmentClauses } from '../../precompile/TextSegmenter.js';
import { matchVerb } from '../../precompile/VerbMatcher.js';
import {
  extractVolumes,
  extractCounts,
  extractWellAddresses,
  extractDurations,
} from '../../precompile/ParameterGrammar.js';
import { resolveNounPhrases } from '../../precompile/NounPhraseResolver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A reference to a labware that was mentioned in the prompt.
 */
export interface CandidateLabware {
  hint: string;
  reason?: string;
}

/**
 * A clause that could not be fully resolved deterministically.
 */
export interface ResidualClause {
  text: string;
  span: [number, number];
  reason: 'no_verb' | 'unresolved_nouns' | 'mixed';
}

/**
 * Dependencies for creating the deterministic_precompile pass.
 */
export interface DeterministicPrecompileDeps {
  verbActionMapRegistry: {
    findVerbForToken: (t: string) => { verb: string; source: 'canonical' | 'synonym' } | undefined;
  };
  labwareDefinitionRegistry: {
    findByName: (n: string) => { recordId: string } | undefined;
  };
  compoundClassRegistry: {
    findByName: (n: string) => { recordId: string } | undefined;
  };
  ontologyTermRegistry: {
    searchLabel: (q: string) => Array<{ id: string; label: string; source: string }>;
  };
  labwareInstanceLookup: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
}

/**
 * Output shape for the deterministic_precompile pass.
 * Extends AiPrecompileOutput with residualClauses and deterministicCompleteness.
 */
export interface DeterministicPrecompileOutput extends AiPrecompileOutput {
  residualClauses: ResidualClause[];
  deterministicCompleteness: number; // 0..1
}

// ---------------------------------------------------------------------------
// Pass factory
// ---------------------------------------------------------------------------

/**
 * Creates the deterministic_precompile pass.
 *
 * This pass:
 * - Reads state.input.prompt (string, possibly empty)
 * - Segments into clauses via TextSegmenter
 * - For each clause:
 *   - Matches verb via VerbMatcher
 *   - If no verb → residual clause (reason: 'no_verb')
 *   - Resolves noun phrases via NounPhraseResolver
 *   - If any noun is 'unresolved' → residual clause (reason: 'unresolved_nouns')
 *   - Otherwise builds a candidateEvent with verb + parameter fields + labware refs
 * - Extracts volumes, counts, well addresses, durations via ParameterGrammar
 * - Labware hits go into candidateLabwares[]
 * - Compound/ontology hits go into unresolvedRefs[]
 * - Computes deterministicCompleteness = (clauses - residuals) / max(clauses, 1)
 */
export function createDeterministicPrecompilePass(
  deps: DeterministicPrecompileDeps,
): Pass {
  return {
    id: 'deterministic_precompile',
    family: 'parse' as const,
    async run({ state }: PassRunArgs): Promise<PassResult> {
      const prompt = typeof state.input.prompt === 'string' ? state.input.prompt : '';
      const clauses = segmentClauses(prompt);

      const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
      const candidateLabwares: CandidateLabware[] = [];
      const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
      const residualClauses: ResidualClause[] = [];
      const labwareHints = new Set<string>();

      for (const clause of clauses) {
        // 1. Match verb
        const verbMatch = matchVerb(clause, deps.verbActionMapRegistry);

        if (!verbMatch) {
          // No verb → residual clause
          residualClauses.push({
            text: clause.text,
            span: clause.span,
            reason: 'no_verb',
          });
          continue;
        }

        // 2. Resolve noun phrases
        const nouns = await resolveNounPhrases(clause, verbMatch, {
          labwareDefinitionRegistry: deps.labwareDefinitionRegistry,
          compoundClassRegistry: deps.compoundClassRegistry,
          ontologyTermRegistry: deps.ontologyTermRegistry,
          labwareInstanceLookup: deps.labwareInstanceLookup,
        });

        // 3. Check for unresolved nouns
        const hasUnresolved = nouns.some((n) => n.kind === 'unresolved');
        if (hasUnresolved) {
          residualClauses.push({
            text: clause.text,
            span: clause.span,
            reason: 'unresolved_nouns',
          });
          continue;
        }

        // 4. Extract parameters
        const volumes = extractVolumes(clause.text);
        const counts = extractCounts(clause.text);
        const wells = extractWellAddresses(clause.text);
        const durations = extractDurations(clause.text);

        // 5. Build candidateEvent
        const event: Record<string, unknown> = { verb: verbMatch.verb };
        if (volumes[0]) event.volume_uL = volumes[0].value;
        if (counts[0]) event.count = counts[0].value;
        if (wells[0]) event.wells = wells[0].wells;
        if (durations[0]) event.duration_seconds = durations[0].value_seconds;

        // 6. Resolve labware references (first = source, second = destination)
        const labwareNouns = nouns.filter(
          (n) => n.kind === 'labware' || n.kind === 'labware-instance',
        );
        if (labwareNouns[0]) event.source = { recordId: labwareNouns[0].recordId };
        if (labwareNouns[1]) event.destination = { recordId: labwareNouns[1].recordId };

        candidateEvents.push(event as { verb: string; [key: string]: unknown });

        // 7. Collect candidateLabwares (dedupe by phrase)
        for (const n of labwareNouns) {
          if (!labwareHints.has(n.phrase)) {
            labwareHints.add(n.phrase);
            candidateLabwares.push({
              hint: n.phrase,
              reason: 'mentioned in clause',
            });
          }
        }

        // 8. Collect unresolvedRefs for compound/ontology hits
        for (const n of nouns) {
          if (n.kind === 'compound' || n.kind === 'ontology') {
            unresolvedRefs.push({
              kind: 'material',
              label: n.phrase,
              reason: `registry hit ${n.kind}`,
            });
          }
        }
      }

      // 9. Compute deterministicCompleteness
      const deterministicCompleteness =
        clauses.length === 0 ? 1.0 : (clauses.length - residualClauses.length) / clauses.length;

      // Build AiPrecompileOutput-shaped subset (strip residualClauses + deterministicCompleteness)
      // for passthrough to 'ai_precompile' key (Strategy A, spec-046).
      const aiPrecompilePassthrough: Record<string, unknown> = {
        candidateEvents,
        candidateLabwares,
        unresolvedRefs,
      };

      return {
        ok: true,
        output: {
          candidateEvents,
          candidateLabwares,
          unresolvedRefs,
          residualClauses,
          deterministicCompleteness,
        } satisfies DeterministicPrecompileOutput,
        secondaryOutputs: { ai_precompile: aiPrecompilePassthrough },
      };
    },
  };
}
