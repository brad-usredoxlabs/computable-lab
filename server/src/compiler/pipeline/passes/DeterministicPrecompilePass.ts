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

import type { Pass, PassDiagnostic, PassRunArgs, PassResult } from '../types.js';
import type { AiPrecompileOutput } from './ChatbotCompilePasses.js';
import { segmentClauses } from '../../precompile/TextSegmenter.js';
import { matchVerb } from '../../precompile/VerbMatcher.js';
import {
  extractVolumes,
  extractCounts,
  extractWellAddresses,
  extractDurations,
} from '../../precompile/ParameterGrammar.js';
import { resolveNounPhrases, resolveNounPhrasesFromTags, type ResolvedNoun } from '../../precompile/NounPhraseResolver.js';
import type { MaterializedPromptTag, MaterializedTaggerOutput } from '../../precompile/TaggerOutput.js';
import { parsePromptMentionMatches, type PromptMention } from '../../../ai/promptMentions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A reference to a labware that was mentioned in the prompt.
 */
export interface CandidateLabware {
  hint: string;
  reason?: string;
  deckSlot?: string;
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
    findByName: (n: string) => ({
      recordId: string;
      registryMatch?: {
        distance: number;
        matchedKey: string;
        matchKind: 'exact' | 'normalized' | 'edit';
      };
    }) | undefined;
  };
  compoundClassRegistry: {
    findByName: (n: string) => ({
      recordId: string;
      registryMatch?: {
        distance: number;
        matchedKey: string;
        matchKind: 'exact' | 'normalized' | 'edit';
      };
    }) | undefined;
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
  compileIr?: DeterministicCompileIr;
}

export interface DeterministicCompileIr {
  source: 'raw_prompt' | 'tag_prompt';
  actions: DeterministicCompileIrAction[];
}

export interface DeterministicCompileIrAction {
  verbText: string;
  verb?: string;
  span: [number, number];
  sourceText: string;
  nouns: ResolvedNoun[];
  parameters: {
    volume_uL?: number;
    count?: number;
    wells?: string[];
    duration_seconds?: number;
    wellRegion?: string;
    quantities?: string[];
    concentration_uM?: number;
    concentration?: { raw: string; unit?: string; value?: number };
  };
  unresolvedReason?: ResidualClause['reason'];
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
      const rawPrompt = typeof state.input.prompt === 'string' ? state.input.prompt : '';
      const tagPrompt = getUsableTagPromptOutput(state.outputs.get('tag_prompt'), rawPrompt);

      // Substitute `[[kind:id|label]]` tokens with `__MENTION_${i}__` placeholders.
      // The placeholder survives lowercasing, TextSegmenter's TOKEN_SPLITTER, and
      // NounPhraseResolver's NP_SPLIT_RE (none split on `_`), so mentions remain a
      // single noun-phrase candidate that the resolver can map back via mentionLookup.
      const mentionLookup = new Map<string, PromptMention>();
      const matches = parsePromptMentionMatches(rawPrompt);
      const inputMentions = normalizeInputMentions(state.input.mentions);
      let prompt: string;
      if (matches.length === 0) {
        const substituted = substituteInputMentionLabels(rawPrompt, inputMentions);
        prompt = substituted.prompt;
        for (const [placeholder, mention] of substituted.mentionLookup) {
          mentionLookup.set(placeholder, mention);
        }
      } else {
        const parts: string[] = [];
        let cursor = 0;
        matches.forEach((match, i) => {
          parts.push(rawPrompt.slice(cursor, match.start));
          const placeholder = `__MENTION_${i}__`;
          parts.push(placeholder);
          mentionLookup.set(placeholder.toLowerCase(), match.mention);
          cursor = match.end;
        });
        parts.push(rawPrompt.slice(cursor));
        prompt = parts.join('');
      }
      for (let i = 0; i < inputMentions.length; i++) {
        const mention = inputMentions[i]!;
        if (!mention.id) continue;
        mentionLookup.set(`__input_mention_${i}__`, mention);
      }

      if (tagPrompt.output) {
        const tagResult = await runFromTags(rawPrompt, tagPrompt.output.tags, deps, mentionLookup);
        return finalizeResult(tagResult, tagPrompt.diagnostics);
      }

      const clauses = segmentClauses(prompt);

      const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
      const candidateLabwares: CandidateLabware[] = [];
      const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
      const residualClauses: ResidualClause[] = [];
      const labwareHints = new Set<string>();
      const diagnostics: PassDiagnostic[] = [...tagPrompt.diagnostics];
      const compileIr: DeterministicCompileIr = { source: 'raw_prompt', actions: [] };
      collectMentionLabwareSetupCandidates(matches, rawPrompt, candidateLabwares, labwareHints);
      collectInputMentionLabwareSetupCandidates(inputMentions, rawPrompt, candidateLabwares, labwareHints);
      let lastMaterialTargetLabwareId: string | undefined;
      let lastMaterialTargetWell: string | undefined;

      for (const clause of clauses) {
        // 1. Match verb
        const verbMatch = matchVerb(clause, deps.verbActionMapRegistry);

        if (!verbMatch) {
          if (isLabwareSetupContinuationClause(clause, mentionLookup)) {
            continue;
          }
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
          mentionLookup,
        });
        diagnostics.push(...diagnosticsForRegistryMatches(nouns));

        // 3. Check for unresolved nouns
        const hasUnresolved = nouns.some((n) => n.kind === 'unresolved');
        if (hasUnresolved) {
          compileIr.actions.push({
            verbText: clause.text.slice(verbMatch.span[0] - clause.span[0], verbMatch.span[1] - clause.span[0]),
            verb: verbMatch.verb,
            span: clause.span,
            sourceText: clause.text,
            nouns,
            parameters: {},
            unresolvedReason: 'unresolved_nouns',
          });
          residualClauses.push({
            text: clause.text,
            span: clause.span,
            reason: 'unresolved_nouns',
          });
          continue;
        }

        // 4. Extract parameters from the post-verb region only — values
        // before the verb are typically modifiers of upstream nouns
        // ("100uL pipette") and would otherwise shadow the actual event
        // parameter ("transfer 50uL").
        const verbOffset = verbMatch.span[1] - clause.span[0];
        const postVerbText = clause.text.slice(verbOffset);
        const volumes = extractVolumes(postVerbText);
        const counts = extractCounts(postVerbText);
        const wells = extractWellAddresses(postVerbText);
        const durations = extractDurations(postVerbText);
        const parameters: DeterministicCompileIrAction['parameters'] = {};
        if (volumes[0]) parameters.volume_uL = volumes[0].value;
        if (counts[0]) parameters.count = counts[0].value;
        if (wells[0]) parameters.wells = wells[0].wells;
        if (durations[0]) parameters.duration_seconds = durations[0].value_seconds;

        // 5. Build candidateEvent
        const event: Record<string, unknown> = { verb: verbMatch.verb };
        if (parameters.volume_uL !== undefined) event.volume_uL = parameters.volume_uL;
        if (parameters.count !== undefined) event.count = parameters.count;
        if (parameters.wells) event.wells = parameters.wells;
        if (parameters.duration_seconds !== undefined) event.duration_seconds = parameters.duration_seconds;

        // 6. Resolve labware references
        const labwareNouns = nouns.filter(
          (n) => n.kind === 'labware' || n.kind === 'labware-instance',
        );
        applyLabwareRoles(event, verbMatch.verb, labwareNouns, parameters, lastMaterialTargetLabwareId, lastMaterialTargetWell);

        // 6b. Resolve material reference from mentions ([[material:…]] /
        // [[aliquot:…]] / [[material-spec:…]]). Mentions are pre-resolved by
        // the user, so record the id directly on the event.
        const materialNoun = nouns.find((n) => n.kind === 'material');
        if (materialNoun) {
          event.material = materialForEvent(materialNoun, parameters);
        }
        if (verbMatch.verb === 'add_material' && typeof event.labware_id === 'string') {
          lastMaterialTargetLabwareId = event.labware_id;
          lastMaterialTargetWell = typeof event.well === 'string' ? event.well : undefined;
        }

        candidateEvents.push(event as { verb: string; [key: string]: unknown });
        compileIr.actions.push({
          verbText: clause.text.slice(verbMatch.span[0] - clause.span[0], verbMatch.span[1] - clause.span[0]),
          verb: verbMatch.verb,
          span: clause.span,
          sourceText: clause.text,
          nouns,
          parameters,
        });

        // 7. Collect candidateLabwares (dedupe by phrase). Labware instances
        // are already resolved, so only labware definitions should become
        // proposed additions for resolve_labware.
        for (const n of labwareNouns.filter((noun) => noun.kind === 'labware')) {
          const key = n.recordId ?? n.phrase;
          if (!labwareHints.has(key)) {
            labwareHints.add(key);
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
          compileIr,
        } satisfies DeterministicPrecompileOutput,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
        secondaryOutputs: { ai_precompile: aiPrecompilePassthrough },
      };
    },
  };
}

interface DeterministicAssembly {
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  candidateLabwares: CandidateLabware[];
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
  residualClauses: ResidualClause[];
  deterministicCompleteness: number;
  compileIr: DeterministicCompileIr;
  diagnostics: PassDiagnostic[];
}

async function runFromTags(
  prompt: string,
  tags: MaterializedPromptTag[],
  deps: DeterministicPrecompileDeps,
  mentionLookup: Map<string, PromptMention>,
): Promise<DeterministicAssembly> {
  const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
  const candidateLabwares: CandidateLabware[] = [];
  const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
  const residualClauses: ResidualClause[] = [];
  const diagnostics: PassDiagnostic[] = [{
    severity: 'info',
    code: 'deterministic_precompile_tag_path',
    message: 'deterministic_precompile consumed tag_prompt output',
    pass_id: 'deterministic_precompile',
  }];
  const labwareHints = new Set<string>();
  const compileIr: DeterministicCompileIr = { source: 'tag_prompt', actions: [] };
  let lastMaterialTargetLabwareId: string | undefined;
  let lastMaterialTargetWell: string | undefined;
  const labwareByRole = new Map<string, string>();

  const sortedTags = [...tags].sort((a, b) => a.span[0] - b.span[0]);
  const verbTags = sortedTags.filter((tag) => tag.kind === 'verb');

  for (let i = 0; i < verbTags.length; i++) {
    const verbTag = verbTags[i]!;
    const nextVerbTag = verbTags[i + 1];
    const actionEnd = nextVerbTag ? nextVerbTag.span[0] : prompt.length;
    const actionSpan: [number, number] = [verbTag.span[0], actionEnd];
    const sourceText = prompt.slice(actionSpan[0], actionSpan[1]).trim();
    const tagsInAction = sortedTags.filter(
      (tag) => tag.span[0] >= verbTag.span[1] && tag.span[0] < actionEnd,
    );
    const verbMatch = deps.verbActionMapRegistry.findVerbForToken(verbTag.text.toLowerCase());

    if (!verbMatch) {
      residualClauses.push({ text: sourceText, span: actionSpan, reason: 'no_verb' });
      compileIr.actions.push({
        verbText: verbTag.text,
        span: actionSpan,
        sourceText,
        nouns: [],
        parameters: {},
        unresolvedReason: 'no_verb',
      });
      continue;
    }

    const nouns = await resolveNounPhrasesFromTags(tagsInAction, {
      labwareDefinitionRegistry: deps.labwareDefinitionRegistry,
      compoundClassRegistry: deps.compoundClassRegistry,
      ontologyTermRegistry: deps.ontologyTermRegistry,
      labwareInstanceLookup: deps.labwareInstanceLookup,
      mentionLookup,
    });
    diagnostics.push(...diagnosticsForRegistryMatches(nouns));

    const parameters = parametersFromTags(tagsInAction);
    const hasBlockingUnresolved = nouns.some((noun) => noun.kind === 'unresolved' && !isMaterialCandidate(noun));
    if (hasBlockingUnresolved) {
      residualClauses.push({ text: sourceText, span: actionSpan, reason: 'unresolved_nouns' });
      compileIr.actions.push({
        verbText: verbTag.text,
        verb: verbMatch.verb,
        span: actionSpan,
        sourceText,
        nouns,
        parameters,
        unresolvedReason: 'unresolved_nouns',
      });
      continue;
    }

    const labwareNouns = nouns.filter(
      (noun) => noun.kind === 'labware' || noun.kind === 'labware-instance',
    );
    const slotTags = tagsInAction.filter((tag) => tag.kind === 'slot_ref');
    const materialNouns = nouns.filter((noun) => isMaterialLike(noun));

    if (isLabwareSetupAction(verbMatch.verb, labwareNouns, materialNouns, parameters)) {
      collectCandidateLabwares(candidateLabwares, labwareHints, labwareNouns, slotTags);
      rememberLabwareRoles(labwareByRole, labwareNouns, slotTags);
      compileIr.actions.push({
        verbText: verbTag.text,
        verb: verbMatch.verb,
        span: actionSpan,
        sourceText,
        nouns,
        parameters,
      });
      continue;
    }

    const backReferenceLabware = resolveBackReferenceLabware(tagsInAction, labwareByRole);
    const roleAwareLabwareNouns = mergeResolvedNouns(labwareNouns, backReferenceLabware);

    const event: Record<string, unknown> = { verb: verbMatch.verb };
    if (parameters.volume_uL !== undefined) event.volume_uL = parameters.volume_uL;
    if (parameters.count !== undefined) event.count = parameters.count;
    if (parameters.wells) event.wells = parameters.wells;
    if (parameters.duration_seconds !== undefined) event.duration_seconds = parameters.duration_seconds;
    if (parameters.wellRegion) event.wellRegion = parameters.wellRegion;
    if (parameters.concentration_uM !== undefined) event.concentration_uM = parameters.concentration_uM;
    if (parameters.concentration) event.concentration = parameters.concentration;

    applyLabwareRoles(event, verbMatch.verb, roleAwareLabwareNouns, parameters, lastMaterialTargetLabwareId, lastMaterialTargetWell);

    const materialNoun = materialNouns[0];
    if (materialNoun) {
      event.material = materialForEvent(materialNoun, parameters);
    }
    if (verbMatch.verb === 'add_material' && typeof event.labware_id === 'string') {
      lastMaterialTargetLabwareId = event.labware_id;
      lastMaterialTargetWell = typeof event.well === 'string' ? event.well : undefined;
    }

    candidateEvents.push(event as { verb: string; [key: string]: unknown });
    compileIr.actions.push({
      verbText: verbTag.text,
      verb: verbMatch.verb,
      span: actionSpan,
      sourceText,
      nouns: mergeResolvedNouns(nouns, backReferenceLabware),
      parameters,
    });

    collectCandidateLabwares(candidateLabwares, labwareHints, roleAwareLabwareNouns, slotTags);

    for (const noun of nouns) {
      if (noun.kind === 'compound' || noun.kind === 'ontology') {
        unresolvedRefs.push({
          kind: 'material',
          label: noun.phrase,
          reason: `registry hit ${noun.kind}`,
        });
      } else if (noun.kind === 'unresolved' && isMaterialCandidate(noun)) {
        unresolvedRefs.push({
          kind: 'material',
          label: noun.phrase,
          reason: 'unresolved tagged material',
        });
      }
    }
  }

  const deterministicCompleteness =
    verbTags.length === 0 ? 1.0 : (verbTags.length - residualClauses.length) / verbTags.length;

  return {
    candidateEvents,
    candidateLabwares,
    unresolvedRefs,
    residualClauses,
    deterministicCompleteness,
    compileIr,
    diagnostics,
  };
}

function parametersFromTags(tags: MaterializedPromptTag[]): DeterministicCompileIrAction['parameters'] {
  const parameters: DeterministicCompileIrAction['parameters'] = {};
  const quantities: string[] = [];

  for (const tag of tags) {
    if (tag.kind === 'quantity') {
      quantities.push(tag.text);
      const volumes = extractVolumes(tag.text);
      const counts = extractCounts(tag.text);
      const durations = extractDurations(tag.text);
      if (parameters.volume_uL === undefined && volumes[0]) parameters.volume_uL = volumes[0].value;
      if (parameters.count === undefined && counts[0]) parameters.count = counts[0].value;
      if (parameters.duration_seconds === undefined && durations[0]) {
        parameters.duration_seconds = durations[0].value_seconds;
      }
    }
    if (tag.kind === 'well_address') {
      const wells = extractWellAddresses(tag.text);
      if (!parameters.wells && wells[0]) parameters.wells = wells[0].wells;
    }
    if (tag.kind === 'well_region' && !parameters.wellRegion) {
      parameters.wellRegion = tag.text;
      const wells = extractWellAddresses(tag.text);
      if (!parameters.wells && wells[0]) parameters.wells = wells[0].wells;
    }
    if (tag.kind === 'concentration' && !parameters.concentration) {
      const concentration = parseConcentration(tag.text);
      parameters.concentration = concentration;
      if (concentration.unit === 'uM' && typeof concentration.value === 'number') {
        parameters.concentration_uM = concentration.value;
      }
    }
  }

  if (quantities.length > 0) parameters.quantities = quantities;
  return parameters;
}

function isMaterialCandidate(noun: ResolvedNoun): boolean {
  return typeof noun.source === 'string' && noun.source.split(',').some((part) => {
    const normalized = part.replace(/^tag:/, '').trim().toLowerCase();
    return normalized === 'material' || normalized === 'compound' || normalized === 'ontology';
  });
}

function isMaterialLike(noun: ResolvedNoun): boolean {
  return (
    noun.kind === 'material' ||
    noun.kind === 'compound' ||
    noun.kind === 'ontology' ||
    (noun.kind === 'unresolved' && isMaterialCandidate(noun))
  );
}

function isLabwareSetupAction(
  verb: string,
  labwareNouns: ResolvedNoun[],
  materialNouns: ResolvedNoun[],
  parameters: DeterministicCompileIrAction['parameters'],
): boolean {
  return (
    verb === 'add_material' &&
    labwareNouns.length > 0 &&
    materialNouns.length === 0 &&
    parameters.volume_uL === undefined &&
    !parameters.wells
  );
}

function applyLabwareRoles(
  event: Record<string, unknown>,
  verb: string,
  labwareNouns: ResolvedNoun[],
  parameters: DeterministicCompileIrAction['parameters'],
  previousSourceLabwareId?: string,
  previousSourceWell?: string,
): void {
  if (verb === 'transfer') {
    if (labwareNouns.length >= 2) {
      if (labwareNouns[0]?.recordId) event.source_labware_id = labwareNouns[0].recordId;
      if (labwareNouns[1]?.recordId) event.target_labware_id = labwareNouns[1].recordId;
    } else if (labwareNouns.length === 1) {
      if (previousSourceLabwareId) event.source_labware_id = previousSourceLabwareId;
      if (labwareNouns[0]?.recordId) event.target_labware_id = labwareNouns[0].recordId;
    } else if (previousSourceLabwareId) {
      event.source_labware_id = previousSourceLabwareId;
    }
    if (previousSourceWell) event.source_well = previousSourceWell;
    if (parameters.wells) event.target_wells = parameters.wells;
    return;
  }

  if (verb === 'add_material') {
    if (labwareNouns[0]?.recordId) event.labware_id = labwareNouns[0].recordId;
    if (parameters.wells?.length === 1) {
      event.well = parameters.wells[0];
      delete event.wells;
    }
    return;
  }

  if (labwareNouns[0]?.recordId) event.source = { recordId: labwareNouns[0].recordId };
  if (labwareNouns[1]?.recordId) event.destination = { recordId: labwareNouns[1].recordId };
}

function materialForEvent(
  noun: ResolvedNoun,
  parameters: DeterministicCompileIrAction['parameters'],
): Record<string, unknown> {
  const material: Record<string, unknown> = {};
  if (noun.recordId) material.recordId = noun.recordId;
  if (noun.source) material.kind = noun.source;
  if (!noun.recordId) material.name = noun.phrase;
  if (parameters.volume_uL !== undefined) material.volume_uL = parameters.volume_uL;
  if (parameters.concentration_uM !== undefined) material.concentration_uM = parameters.concentration_uM;
  if (parameters.concentration) material.concentration = parameters.concentration;
  return material;
}

function collectCandidateLabwares(
  candidateLabwares: CandidateLabware[],
  labwareHints: Set<string>,
  labwareNouns: ResolvedNoun[],
  slotTags: MaterializedPromptTag[],
): void {
  const labwareDefinitions = labwareNouns.filter((noun) => noun.kind === 'labware');
  for (let i = 0; i < labwareDefinitions.length; i++) {
    const noun = labwareDefinitions[i]!;
    const key = noun.recordId ?? noun.phrase;
    if (labwareHints.has(key)) continue;
    labwareHints.add(key);
    const deckSlot = inferDeckSlot(noun, labwareDefinitions[i + 1], slotTags);
    candidateLabwares.push({
      hint: noun.phrase,
      reason: 'mentioned in tagged action',
      ...(deckSlot ? { deckSlot } : {}),
    });
  }
}

function collectMentionLabwareSetupCandidates(
  matches: Array<{ mention: PromptMention; start: number; end: number }>,
  prompt: string,
  candidateLabwares: CandidateLabware[],
  labwareHints: Set<string>,
): void {
  for (const match of matches) {
    const mention = match.mention;
    if (mention.type !== 'labware' || !mention.id || isRuntimeLabwareMention(mention)) continue;

    const key = mention.id;
    if (labwareHints.has(key)) continue;
    labwareHints.add(key);

    const deckSlot = inferDeckSlotForMention(prompt, match.start, match.end);
    candidateLabwares.push({
      hint: key,
      reason: 'resolved labware mention',
      ...(deckSlot ? { deckSlot } : {}),
    });
  }
}

function collectInputMentionLabwareSetupCandidates(
  mentions: PromptMention[],
  prompt: string,
  candidateLabwares: CandidateLabware[],
  labwareHints: Set<string>,
): void {
  for (const mention of mentions) {
    if (mention.type !== 'labware' || !mention.id || isRuntimeLabwareMention(mention)) continue;

    const key = mention.id;
    if (labwareHints.has(key)) continue;
    labwareHints.add(key);

    const span = findMentionLabelSpan(prompt, mention);
    const deckSlot = span
      ? inferDeckSlotForMention(prompt, span.start, span.end)
      : undefined;
    candidateLabwares.push({
      hint: key,
      reason: 'resolved labware mention',
      ...(deckSlot ? { deckSlot } : {}),
    });
  }
}

function isLabwareSetupContinuationClause(
  clause: { text: string },
  mentionLookup: Map<string, PromptMention>,
): boolean {
  const lower = clause.text.toLowerCase();
  const placeholders = lower.match(/__(?:input_)?mention_\d+__/g) ?? [];
  if (placeholders.some((placeholder) => mentionLookup.get(placeholder)?.type === 'labware')) {
    return /\b(?:source|target)\b/.test(lower);
  }
  if (!/\b(?:source|target)\b/.test(lower)) return false;
  return Array.from(mentionLookup.values()).some((mention) => (
    mention.type === 'labware' && tokenOverlapScore(clause.text, mention.label) >= 0.25
  ));
}

function inferDeckSlotForMention(
  prompt: string,
  start: number,
  end: number,
): string | undefined {
  const after = prompt.slice(end, Math.min(prompt.length, end + 120)).toLowerCase();
  const before = prompt.slice(Math.max(0, start - 40), start).toLowerCase();
  const forward = firstSlotKeyword(after);
  if (forward) return forward;
  return firstSlotKeyword(before);
}

function substituteInputMentionLabels(
  prompt: string,
  mentions: PromptMention[],
): { prompt: string; mentionLookup: Map<string, PromptMention> } {
  const spans: Array<{ start: number; end: number; placeholder: string; mention: PromptMention }> = [];
  for (let i = 0; i < mentions.length; i++) {
    const mention = mentions[i]!;
    const span = findMentionLabelSpan(prompt, mention);
    if (!span) continue;
    spans.push({
      ...span,
      placeholder: `__INPUT_MENTION_${i}__`,
      mention,
    });
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: typeof spans = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.start < lastEnd) continue;
    accepted.push(span);
    lastEnd = span.end;
  }

  if (accepted.length === 0) {
    return { prompt, mentionLookup: new Map() };
  }

  const lookup = new Map<string, PromptMention>();
  const parts: string[] = [];
  let cursor = 0;
  for (const span of accepted) {
    parts.push(prompt.slice(cursor, span.start));
    parts.push(span.placeholder);
    lookup.set(span.placeholder.toLowerCase(), span.mention);
    cursor = span.end;
  }
  parts.push(prompt.slice(cursor));
  return { prompt: parts.join(''), mentionLookup: lookup };
}

function firstSlotKeyword(text: string): string | undefined {
  const source = text.indexOf('source');
  const target = text.indexOf('target');
  if (source === -1 && target === -1) return undefined;
  if (source !== -1 && (target === -1 || source < target)) return 'source';
  return 'target';
}

function isRuntimeLabwareMention(mention: PromptMention): boolean {
  return typeof mention.id === 'string' && mention.id.startsWith('lw-');
}

function normalizeInputMentions(value: unknown): PromptMention[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PromptMention => (
    !!entry &&
    typeof entry === 'object' &&
    typeof (entry as { type?: unknown }).type === 'string' &&
    typeof (entry as { label?: unknown }).label === 'string'
  ));
}

function findMentionLabelSpan(
  prompt: string,
  mention: PromptMention,
): { start: number; end: number } | undefined {
  const candidates = [
    mention.label,
    mention.id,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  const lowerPrompt = prompt.toLowerCase();
  for (const candidate of candidates) {
    const start = lowerPrompt.indexOf(candidate.toLowerCase());
    if (start >= 0) return { start, end: start + candidate.length };
  }
  return undefined;
}

function tokenOverlapScore(a: string, b: string): number {
  const left = mentionTokens(a);
  const right = mentionTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / Math.max(left.size, right.size);
}

function mentionTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of text.toLowerCase().split(/[\s,;:.\-—–"'()\[\]{}!?]+/)) {
    if (token.length <= 1) continue;
    if (token === 'the' || token === 'and' || token === 'source' || token === 'target' || token === 'location') continue;
    tokens.add(token);
  }
  return tokens;
}

function rememberLabwareRoles(
  labwareByRole: Map<string, string>,
  labwareNouns: ResolvedNoun[],
  slotTags: MaterializedPromptTag[],
): void {
  const labwareDefinitions = labwareNouns.filter((noun) => noun.kind === 'labware' && noun.recordId);
  for (let i = 0; i < labwareDefinitions.length; i++) {
    const noun = labwareDefinitions[i]!;
    const deckSlot = inferDeckSlot(noun, labwareDefinitions[i + 1], slotTags);
    if (deckSlot) labwareByRole.set(deckSlot, noun.recordId!);

    const phrase = noun.phrase.toLowerCase();
    if (phrase.includes('reservoir')) labwareByRole.set('reservoir', noun.recordId!);
    if (phrase.includes('plate')) labwareByRole.set('plate', noun.recordId!);
  }
}

function resolveBackReferenceLabware(
  tags: MaterializedPromptTag[],
  labwareByRole: Map<string, string>,
): ResolvedNoun[] {
  const resolved: ResolvedNoun[] = [];
  for (const tag of tags) {
    if (tag.kind !== 'back_reference') continue;
    const text = tag.text.toLowerCase();
    const role = text.includes('reservoir')
      ? 'reservoir'
      : text.includes('target')
        ? 'target'
        : text.includes('source')
          ? 'source'
          : text.includes('plate')
            ? 'plate'
            : undefined;
    if (!role) continue;
    const recordId = labwareByRole.get(role);
    if (!recordId) continue;
    resolved.push({
      phrase: tag.text,
      span: tag.span,
      kind: 'labware',
      recordId,
      confidence: 0.8,
      source: `back_reference:${role}`,
    });
  }
  return resolved;
}

function mergeResolvedNouns(a: ResolvedNoun[], b: ResolvedNoun[]): ResolvedNoun[] {
  if (b.length === 0) return a;
  const seen = new Set(a.map((noun) => `${noun.kind}:${noun.recordId ?? noun.phrase}:${noun.span[0]}`));
  const merged = [...a];
  for (const noun of b) {
    const key = `${noun.kind}:${noun.recordId ?? noun.phrase}:${noun.span[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(noun);
  }
  return merged.sort((left, right) => left.span[0] - right.span[0]);
}

function inferDeckSlot(
  noun: ResolvedNoun,
  nextNoun: ResolvedNoun | undefined,
  slotTags: MaterializedPromptTag[],
): string | undefined {
  const slot = slotTags.find((tag) => (
    tag.span[0] >= noun.span[1] &&
    (!nextNoun || tag.span[0] < nextNoun.span[0])
  ));
  if (!slot) return undefined;
  const text = slot.text.toLowerCase();
  if (text.includes('source')) return 'source';
  if (text.includes('target')) return 'target';
  return slot.text;
}

function parseConcentration(raw: string): { raw: string; unit?: string; value?: number } {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(um|µm|μm|nm|mm|m)\b/i);
  if (!match) return { raw };
  const value = Number(match[1]);
  const unit = match[2]!.replace('µ', 'u').replace('μ', 'u');
  const lower = unit.toLowerCase();
  if (lower === 'um') return { raw, value, unit: 'uM' };
  if (lower === 'nm') return { raw, value: value / 1000, unit: 'uM' };
  if (lower === 'mm') return { raw, value: value * 1000, unit: 'uM' };
  if (lower === 'm') return { raw, value: value * 1_000_000, unit: 'uM' };
  return { raw, value, unit };
}

function finalizeResult(
  assembly: DeterministicAssembly,
  diagnostics: PassDiagnostic[] = [],
): PassResult {
  const aiPrecompilePassthrough: Record<string, unknown> = {
    candidateEvents: assembly.candidateEvents,
    candidateLabwares: assembly.candidateLabwares,
    unresolvedRefs: assembly.unresolvedRefs,
  };
  const allDiagnostics = [...diagnostics, ...assembly.diagnostics];

  return {
    ok: true,
    output: {
      candidateEvents: assembly.candidateEvents,
      candidateLabwares: assembly.candidateLabwares,
      unresolvedRefs: assembly.unresolvedRefs,
      residualClauses: assembly.residualClauses,
      deterministicCompleteness: assembly.deterministicCompleteness,
      compileIr: assembly.compileIr,
    } satisfies DeterministicPrecompileOutput,
    ...(allDiagnostics.length > 0 ? { diagnostics: allDiagnostics } : {}),
    secondaryOutputs: { ai_precompile: aiPrecompilePassthrough },
  };
}

function diagnosticsForRegistryMatches(nouns: ResolvedNoun[]): PassDiagnostic[] {
  return nouns.flatMap((noun) => {
    if (!noun.registryMatch || noun.registryMatch.matchKind === 'exact') return [];
    return [{
      severity: 'info' as const,
      code: 'fuzzy_registry_match',
      message: `Resolved "${noun.phrase}" to registry key "${noun.registryMatch.matchedKey}"`,
      pass_id: 'deterministic_precompile',
      details: {
        phrase: noun.phrase,
        kind: noun.kind,
        recordId: noun.recordId,
        matchedKey: noun.registryMatch.matchedKey,
        matchKind: noun.registryMatch.matchKind,
        distance: noun.registryMatch.distance,
      },
    }];
  });
}

function getUsableTagPromptOutput(
  value: unknown,
  prompt: string,
): { output?: MaterializedTaggerOutput; diagnostics: PassDiagnostic[] } {
  if (!value || typeof value !== 'object') return { diagnostics: [] };
  const maybeTags = (value as { tags?: unknown }).tags;
  if (!Array.isArray(maybeTags) || maybeTags.length === 0) return { diagnostics: [] };

  const tags: MaterializedPromptTag[] = [];
  for (const tag of maybeTags) {
    if (!isMaterializedTag(tag, prompt)) {
      return {
        diagnostics: [{
          severity: 'warning',
          code: 'tag_prompt_invalid_for_deterministic_precompile',
          message: 'deterministic_precompile ignored invalid tag_prompt output and used raw prompt fallback',
          pass_id: 'deterministic_precompile',
        }],
      };
    }
    tags.push(tag);
  }

  if (!tags.some((tag) => tag.kind === 'verb')) {
    return {
      diagnostics: [{
        severity: 'warning',
        code: 'tag_prompt_no_verbs',
        message: 'deterministic_precompile ignored tag_prompt output with no verb tags and used raw prompt fallback',
        pass_id: 'deterministic_precompile',
      }],
    };
  }

  return { output: { tags }, diagnostics: [] };
}

function isMaterializedTag(tag: unknown, prompt: string): tag is MaterializedPromptTag {
  if (!tag || typeof tag !== 'object') return false;
  const candidate = tag as Partial<MaterializedPromptTag>;
  if (typeof candidate.kind !== 'string' || typeof candidate.text !== 'string') return false;
  if (!Array.isArray(candidate.span) || candidate.span.length !== 2) return false;
  const [start, end] = candidate.span;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 0 || end < start || end > prompt.length) return false;
  return prompt.slice(start, end) === candidate.text;
}
