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
  actionFrames: DeterministicActionFrame[];
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
    mode?: 'fluorescence' | 'absorbance' | 'luminescence';
    wavelengthNm?: number;
    integrationMs?: number;
    simulate?: boolean;
  };
  unresolvedReason?: ResidualClause['reason'];
}

export interface DeterministicActionFrame {
  verbText: string;
  verb: string;
  span: [number, number];
  sourceText: string;
  nouns: ResolvedNoun[];
  parameters: DeterministicCompileIrAction['parameters'];
  roles: {
    labware_id?: string;
    source_labware_id?: string;
    target_labware_id?: string;
    source_well?: string;
    target_wells?: string[];
    well?: string;
    source?: { recordId: string };
    destination?: { recordId: string };
    material?: Record<string, unknown>;
    source_material_ref?: unknown;
    instrument?: string;
  };
  links: {
    sourceFromPreviousAdd?: boolean;
    sourceWellFromPreviousAdd?: boolean;
    sameMaterialAsPrevious?: boolean;
    labwareRoleRefs?: string[];
  };
  diagnostics: PassDiagnostic[];
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
      const compileIr: DeterministicCompileIr = { source: 'raw_prompt', actions: [], actionFrames: [] };
      collectMentionLabwareSetupCandidates(matches, rawPrompt, candidateLabwares, labwareHints);
      collectInputMentionLabwareSetupCandidates(inputMentions, rawPrompt, candidateLabwares, labwareHints);
      const labwareByRole = new Map<string, string>();
      rememberMentionLabwareRoles(labwareByRole, matches, rawPrompt);
      rememberInputMentionLabwareRoles(labwareByRole, inputMentions, rawPrompt);
      let lastMaterialTargetLabwareId: string | undefined;
      let lastMaterialTargetWell: string | undefined;
      let lastMaterialRef: unknown;

      for (const clause of clauses) {
        // 1. Match verb
        const verbMatch = matchVerb(clause, deps.verbActionMapRegistry);

        if (!verbMatch) {
          const setupNouns = await resolveNounPhrases(clause, undefined, {
            labwareDefinitionRegistry: deps.labwareDefinitionRegistry,
            compoundClassRegistry: deps.compoundClassRegistry,
            ontologyTermRegistry: deps.ontologyTermRegistry,
            labwareInstanceLookup: deps.labwareInstanceLookup,
            mentionLookup,
          });
          const setupLabwareNouns = resolveContextualLabwareReferences(setupNouns, labwareByRole).filter(
            (n) => n.kind === 'labware' || n.kind === 'labware-instance',
          );
          if (isLabwareSetupFragment(clause.text, setupLabwareNouns)) {
            collectCandidateLabwaresFromResolved(candidateLabwares, labwareHints, setupLabwareNouns, 'mentioned in setup fragment', clause.text);
            rememberRawLabwareRoles(labwareByRole, setupLabwareNouns, clause.text);
            continue;
          }
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
        const resolvedNouns = await resolveNounPhrases(clause, verbMatch, {
          labwareDefinitionRegistry: deps.labwareDefinitionRegistry,
          compoundClassRegistry: deps.compoundClassRegistry,
          ontologyTermRegistry: deps.ontologyTermRegistry,
          labwareInstanceLookup: deps.labwareInstanceLookup,
          mentionLookup,
        });
        const nouns = resolveContextualLabwareReferences(resolvedNouns, labwareByRole);
        diagnostics.push(...diagnosticsForRegistryMatches(nouns));

        // 3. Check for unresolved nouns
        const unresolvedNouns = nouns.filter((n) => n.kind === 'unresolved');
        const hasUnresolved = unresolvedNouns.length > 0;
        const unresolvedOnlyReadParameters = verbMatch.verb === 'read'
          && unresolvedNouns.every((n) => isReadParameterPhrase(n.phrase));
        const unresolvedOnlyMaterialBackReferences = verbMatch.verb === 'transfer'
          && mentionsMaterialBackReference(clause.text)
          && unresolvedNouns.every((n) => isMaterialBackReferencePhrase(n.phrase));
        if (hasUnresolved && !unresolvedOnlyReadParameters && !unresolvedOnlyMaterialBackReferences) {
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
        const wells = extractNonDeckSlotWells(postVerbText);
        const durations = extractDurations(postVerbText);
        const parameters: DeterministicCompileIrAction['parameters'] = {};
        if (volumes[0]) parameters.volume_uL = volumes[0].value;
        if (counts[0]) parameters.count = counts[0].value;
        if (wells[0]) parameters.wells = wells[0].wells;
        if (durations[0]) parameters.duration_seconds = durations[0].value_seconds;
        Object.assign(parameters, extractConcentrationParameters(postVerbText));
        Object.assign(parameters, extractReadParameters(postVerbText));

        let actionNouns = nouns;

        // 5. Build a normalized action frame, then lower it to the legacy
        // candidateEvent shape expected by downstream compiler passes.
        let labwareNouns = actionNouns.filter(
          (n) => n.kind === 'labware' || n.kind === 'labware-instance',
        );
        if (verbMatch.verb === 'read' && labwareNouns.length === 0) {
          const inferredReadLabware = inferReadBackReferenceLabware(clause, labwareByRole);
          if (inferredReadLabware) {
            actionNouns = mergeResolvedNouns(actionNouns, [inferredReadLabware]);
            labwareNouns = actionNouns.filter(
              (n) => n.kind === 'labware' || n.kind === 'labware-instance',
            );
          }
        }
        rememberRawLabwareRoles(labwareByRole, labwareNouns, clause.text);
        const materialNouns = actionNouns.filter(isMaterialLike);
        const frame = buildActionFrame({
          verbText: clause.text.slice(verbMatch.span[0] - clause.span[0], verbMatch.span[1] - clause.span[0]),
          verb: verbMatch.verb,
          span: clause.span,
          sourceText: clause.text,
          nouns: actionNouns,
          parameters,
          labwareNouns,
          materialNouns,
          previousSourceLabwareId: lastMaterialTargetLabwareId,
          previousSourceWell: lastMaterialTargetWell,
          previousMaterialRef: lastMaterialRef,
          hasMaterialBackReference: mentionsMaterialBackReference(clause.text),
          instrument: instrumentFromText(clause.text),
        });
        const event = lowerActionFrame(frame);
        diagnostics.push(...frame.diagnostics);

        if (verbMatch.verb === 'add_material' && typeof frame.roles.labware_id === 'string') {
          lastMaterialTargetLabwareId = frame.roles.labware_id;
          lastMaterialTargetWell = typeof frame.roles.well === 'string' ? frame.roles.well : undefined;
          lastMaterialRef = materialReferenceForTransfer(frame.roles.material);
        }

        // 7. Collect candidateLabwares (dedupe by phrase). Labware instances
        // are already resolved, so only labware definitions should become
        // proposed additions for resolve_labware. Run before the
        // labware-setup short-circuit so "place plate on B2" still emits a
        // candidate labware (which resolve_labware turns into a placement).
        collectCandidateLabwaresFromResolved(candidateLabwares, labwareHints, labwareNouns, 'mentioned in clause', clause.text);

        // Suppress the spurious add_material candidate event when the clause
        // is purely a labware-placement intent (e.g. "place a 96-well plate
        // on deck slot B2") — the labware addition above carries the intent.
        if (isLabwareSetupAction(verbMatch.verb, labwareNouns, materialNouns, parameters)) {
          continue;
        }

        candidateEvents.push(event as { verb: string; [key: string]: unknown });
        compileIr.actionFrames.push(frame);
        compileIr.actions.push({
          verbText: clause.text.slice(verbMatch.span[0] - clause.span[0], verbMatch.span[1] - clause.span[0]),
          verb: verbMatch.verb,
          span: clause.span,
          sourceText: clause.text,
          nouns: actionNouns,
          parameters,
        });

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
  rawPrompt: string,
  tags: MaterializedPromptTag[],
  deps: DeterministicPrecompileDeps,
  mentionLookup: Map<string, PromptMention>,
): Promise<DeterministicAssembly> {
  const sortedTags = [...tags].sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
  const actionGroups: Array<{ verbTag: MaterializedPromptTag; tags: MaterializedPromptTag[] }> = [];

  for (const tag of sortedTags) {
    if (tag.kind === 'verb') {
      actionGroups.push({ verbTag: tag, tags: [tag] });
      continue;
    }
    actionGroups[actionGroups.length - 1]?.tags.push(tag);
  }

  const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
  const candidateLabwares: CandidateLabware[] = [];
  const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
  const residualClauses: ResidualClause[] = [];
  const diagnostics: PassDiagnostic[] = [{
    severity: 'info',
    code: 'deterministic_precompile_tag_path',
    message: 'deterministic_precompile used materialized tag_prompt output',
    pass_id: 'deterministic_precompile',
  }];
  const compileIr: DeterministicCompileIr = { source: 'tag_prompt', actions: [], actionFrames: [] };
  const labwareHints = new Set<string>();
  const labwareByRole = new Map<string, string>();

  let lastMaterialTargetLabwareId: string | undefined;
  let lastMaterialTargetWell: string | undefined;
  let lastMaterialRef: unknown;

  for (const group of actionGroups) {
    const rawVerb = group.verbTag.text;
    const normalizedVerb = rawVerb.toLowerCase().trim();
    const verbMatch = deps.verbActionMapRegistry.findVerbForToken(normalizedVerb);
    const span: [number, number] = [
      group.verbTag.span[0],
      group.tags[group.tags.length - 1]?.span[1] ?? group.verbTag.span[1],
    ];
    const sourceText = rawPrompt.slice(span[0], span[1]);

    if (!verbMatch) {
      residualClauses.push({ text: sourceText, span, reason: 'no_verb' });
      continue;
    }

    const resolvedFromTags = await resolveNounPhrasesFromTags(group.tags, {
      ...deps,
      mentionLookup,
    });
    const nouns = resolveContextualLabwareReferences(mergeResolvedNouns(
      resolvedFromTags,
      resolveBackReferenceLabware(group.tags, labwareByRole),
    ), labwareByRole);
    diagnostics.push(...diagnosticsForRegistryMatches(nouns));

    const parameters = parametersFromTags(group.tags, sourceText);
    const labwareNouns = nouns.filter((noun) => noun.kind === 'labware' || noun.kind === 'labware-instance');
    const materialNouns = nouns.filter(isMaterialLike);

    compileIr.actions.push({
      verbText: group.verbTag.text,
      verb: verbMatch.verb,
      span,
      sourceText,
      nouns,
      parameters,
    });

    const slotTags = group.tags.filter((tag) => tag.kind === 'slot_ref');
    collectCandidateLabwares(candidateLabwares, labwareHints, labwareNouns, slotTags);
    rememberLabwareRoles(labwareByRole, labwareNouns, slotTags);

    if (isLabwareSetupAction(verbMatch.verb, labwareNouns, materialNouns, parameters)) {
      continue;
    }

    const unresolvedMaterialNouns = materialNouns.filter((noun) => noun.kind === 'unresolved');
    for (const noun of unresolvedMaterialNouns) {
      unresolvedRefs.push({
        kind: 'material',
        label: noun.phrase,
        reason: 'unresolved tagged material',
      });
    }

    const unresolvedNonMaterialNouns = nouns.filter((noun) => (
      noun.kind === 'unresolved'
      && !isMaterialCandidate(noun)
      && !(verbMatch.verb === 'read' && isReadParameterPhrase(noun.phrase))
    ));
    if (unresolvedNonMaterialNouns.length > 0) {
      residualClauses.push({ text: sourceText, span, reason: 'unresolved_nouns' });
      continue;
    }

    const frame = buildActionFrame({
      verbText: group.verbTag.text,
      verb: verbMatch.verb,
      span,
      sourceText,
      nouns,
      parameters,
      labwareNouns,
      materialNouns,
      previousSourceLabwareId: lastMaterialTargetLabwareId,
      previousSourceWell: lastMaterialTargetWell,
      previousMaterialRef: lastMaterialRef,
      hasMaterialBackReference: mentionsMaterialBackReference(sourceText, group.tags),
      instrument: instrumentFromText(sourceText, group.tags),
    });
    const event = lowerActionFrame(frame);
    diagnostics.push(...frame.diagnostics);

    if (verbMatch.verb === 'add_material' && typeof frame.roles.labware_id === 'string') {
      lastMaterialTargetLabwareId = frame.roles.labware_id;
      lastMaterialTargetWell = typeof frame.roles.well === 'string' ? frame.roles.well : undefined;
      lastMaterialRef = materialReferenceForTransfer(frame.roles.material);
    }

    compileIr.actionFrames.push(frame);
    candidateEvents.push(event as { verb: string; [key: string]: unknown });
  }

  const deterministicCompleteness =
    actionGroups.length === 0 ? 1.0 : (actionGroups.length - residualClauses.length) / actionGroups.length;

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

function parametersFromTags(tags: MaterializedPromptTag[], sourceText = ''): DeterministicCompileIrAction['parameters'] {
  const deckSlotSpans = extractDeckSlotSpans(sourceText);
  if (deckSlotSpans.length > 0) {
    const [start, end] = deckSlotSpans[0];
    const slotName = sourceText.slice(start, end).trim();
    return { deckSlot: slotName };
  }
  const wells = extractWellAddresses(sourceText);
  const volumes = extractVolumes(sourceText);
  const counts = extractCounts(sourceText);
  const durations = extractDurations(sourceText);
  return { wells, volumes, counts, durations };
}

function extractConcentrationParameters(text: string): Pick<
  DeterministicCompileIrAction['parameters'],
  'concentration' | 'concentration_uM'
> {
  const match = text.match(/\d+(?:\.\d+)?\s*(?:um|µm|μm|nm|mm|m)\b/i);
  if (!match) return {};

  const concentration = parseConcentration(match[0]!);
  return {
    concentration,
    ...(concentration.unit === 'uM' && typeof concentration.value === 'number'
      ? { concentration_uM: concentration.value }
      : {}),
  };
}

function extractNonDeckSlotWells(text: string): ReturnType<typeof extractWellAddresses> {
  const deckSlotSpans = extractDeckSlotSpans(text);
  if (deckSlotSpans.length === 0) return extractWellAddresses(text);
  return extractWellAddresses(text).filter((well) => (
    !deckSlotSpans.some((span) => spansOverlap(well.span, span))
  ));
}

function extractDeckSlotSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /\b(?:deck\s+)?slot\s+[A-D][1-4]\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

function spansOverlap(left: [number, number], right: [number, number]): boolean {
  return left[0] < right[1] && right[0] < left[1];
}

function extractReadParameters(text: string): Pick<
  DeterministicCompileIrAction['parameters'],
  'mode' | 'wavelengthNm' | 'integrationMs'
  | 'simulate'
> {
  const lower = text.toLowerCase();
  const parameters: Pick<
    DeterministicCompileIrAction['parameters'],
    'mode' | 'wavelengthNm' | 'integrationMs'
    | 'simulate'
  > = {};

  if (/\bfluorescen(?:ce|t)\b/.test(lower)) {
    parameters.mode = 'fluorescence';
  } else if (/\babsorbance\b|\bod\b/.test(lower)) {
    parameters.mode = 'absorbance';
  } else if (/\bluminescen(?:ce|t)\b/.test(lower)) {
    parameters.mode = 'luminescence';
  }

  if (/\b(?:simulate|simulation|dry\s*run)\b/.test(lower)) {
    parameters.simulate = true;
  } else if (/\b(?:live|real\s+(?:instrument|gemini|read)|run\s+on\s+(?:the\s+)?(?:real\s+)?gemini)\b/.test(lower)) {
    parameters.simulate = false;
  }

  const wavelength = lower.match(/\b(?:at\s+|wavelength\s+)?(\d{3})(?:\s*)(?:nm|nanometer|nanometers)\b/);
  if (wavelength) {
    const value = Number.parseInt(wavelength[1]!, 10);
    if (Number.isFinite(value) && value >= 200 && value <= 900) {
      parameters.wavelengthNm = value;
    }
  }

  const integration = lower.match(/\b(?:integration(?:\s*time)?\s*(?:of\s*)?)?(\d+(?:\.\d+)?)\s*(ms|millisecond|milliseconds|s|sec|second|seconds)\s*(?:integration|integration\s*time)?\b/);
  if (integration && /integration/.test(integration[0])) {
    const value = Number.parseFloat(integration[1]!);
    const unit = integration[2]!;
    const ms = unit.startsWith('s') || unit === 'sec' || unit.startsWith('second')
      ? Math.round(value * 1000)
      : Math.round(value);
    if (Number.isFinite(ms) && ms > 0) {
      parameters.integrationMs = ms;
    }
  }

  return parameters;
}

function isReadParameterPhrase(phrase: string): boolean {
  const lower = phrase.toLowerCase();
  return /\b(?:fluorescen(?:ce|t)|absorbance|luminescen(?:ce|t)|mode|wavelength|integration|nm|nanometer|nanometers|gemini|plate reader|read)\b/.test(lower)
    || /\b\d{3}\s*(?:nm|nanometer|nanometers)\b/.test(lower)
    || /\b\d+(?:\.\d+)?\s*(?:ms|millisecond|milliseconds|s|sec|second|seconds)\b/.test(lower);
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

function buildActionFrame(args: {
  verbText: string;
  verb: string;
  span: [number, number];
  sourceText: string;
  nouns: ResolvedNoun[];
  parameters: DeterministicCompileIrAction['parameters'];
  labwareNouns: ResolvedNoun[];
  materialNouns: ResolvedNoun[];
  previousSourceLabwareId: string | undefined;
  previousSourceWell: string | undefined;
  previousMaterialRef: unknown;
  hasMaterialBackReference: boolean;
  instrument?: string | undefined;
}): DeterministicActionFrame {
  const roles: DeterministicActionFrame['roles'] = {};
  const links: DeterministicActionFrame['links'] = {};

  applyLabwareRoles(
    roles as Record<string, unknown>,
    args.verb,
    args.labwareNouns,
    args.parameters,
    args.previousSourceLabwareId,
    args.previousSourceWell,
  );

  const materialNoun = args.materialNouns[0];
  if (materialNoun) {
    roles.material = materialForEvent(materialNoun, args.parameters);
  }
  if (args.instrument) {
    roles.instrument = args.instrument;
  }

  if (
    args.verb === 'transfer' &&
    args.previousMaterialRef !== undefined &&
    args.hasMaterialBackReference
  ) {
    roles.source_material_ref = args.previousMaterialRef;
    links.sameMaterialAsPrevious = true;
  }

  if (
    args.verb === 'transfer' &&
    args.previousSourceLabwareId &&
    roles.source_labware_id === args.previousSourceLabwareId
  ) {
    links.sourceFromPreviousAdd = true;
  }
  if (
    args.verb === 'transfer' &&
    args.previousSourceWell &&
    roles.source_well === args.previousSourceWell
  ) {
    links.sourceWellFromPreviousAdd = true;
  }

  const labwareRoleRefs = args.labwareNouns
    .map((noun) => roleRefFromSource(noun.source))
    .filter((role): role is string => typeof role === 'string');
  if (labwareRoleRefs.length > 0) {
    links.labwareRoleRefs = Array.from(new Set(labwareRoleRefs));
  }

  const frame: DeterministicActionFrame = {
    verbText: args.verbText,
    verb: args.verb,
    span: args.span,
    sourceText: args.sourceText,
    nouns: args.nouns,
    parameters: args.parameters,
    roles,
    links,
    diagnostics: [],
  };
  frame.diagnostics = validateActionFrame(frame);
  return frame;
}

function lowerActionFrame(frame: DeterministicActionFrame): { verb: string; [key: string]: unknown } {
  const event: Record<string, unknown> = { verb: frame.verb };
  addActionParameters(event, frame.parameters);
  Object.assign(event, frame.roles);
  return event as { verb: string; [key: string]: unknown };
}

function addActionParameters(
  event: Record<string, unknown>,
  parameters: DeterministicCompileIrAction['parameters'],
): void {
  if (parameters.volume_uL !== undefined) event.volume_uL = parameters.volume_uL;
  if (parameters.count !== undefined) event.count = parameters.count;
  if (parameters.wells) event.wells = parameters.wells;
  if (parameters.duration_seconds !== undefined) event.duration_seconds = parameters.duration_seconds;
  if (parameters.concentration_uM !== undefined) event.concentration_uM = parameters.concentration_uM;
  if (parameters.concentration) event.concentration = parameters.concentration;
  if (parameters.mode !== undefined) event.mode = parameters.mode;
  if (parameters.wavelengthNm !== undefined) event.wavelengthNm = parameters.wavelengthNm;
  if (parameters.integrationMs !== undefined) event.integrationMs = parameters.integrationMs;
  if (parameters.simulate !== undefined) event.simulate = parameters.simulate;
}

function roleRefFromSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const match = source.match(/^(?:context|back_reference):(.+)$/);
  return match?.[1];
}

function validateActionFrame(frame: DeterministicActionFrame): PassDiagnostic[] {
  const diagnostics: PassDiagnostic[] = [];
  const details = {
    verb: frame.verb,
    sourceText: frame.sourceText,
    span: frame.span,
  };

  if (frame.verb === 'transfer') {
    if (!frame.roles.source_labware_id) {
      diagnostics.push(frameDiagnostic('missing_transfer_source_labware', 'Transfer is missing a source labware reference.', details));
    }
    if (!frame.roles.target_labware_id) {
      diagnostics.push(frameDiagnostic('missing_transfer_target_labware', 'Transfer is missing a target labware reference.', details));
    }
    if (!frame.roles.target_wells || frame.roles.target_wells.length === 0) {
      diagnostics.push(frameDiagnostic('missing_transfer_target_wells', 'Transfer is missing target wells.', details));
    }
  }

  if (frame.verb === 'read') {
    if (!frame.roles.labware_id) {
      diagnostics.push(frameDiagnostic('missing_read_labware', 'Read is missing a labware or plate reference.', details));
    }
    if (!frame.roles.instrument) {
      diagnostics.push(frameDiagnostic('missing_read_instrument', 'Read is missing an instrument reference.', details));
    }
  }

  return diagnostics;
}

function frameDiagnostic(
  code: string,
  message: string,
  details: Record<string, unknown>,
): PassDiagnostic {
  return {
    severity: 'warning',
    code: `action_frame_${code}`,
    message,
    pass_id: 'deterministic_precompile',
    details,
  };
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

  if (verb === 'read') {
    if (labwareNouns[0]?.recordId) event.labware_id = labwareNouns[0].recordId;
    if (parameters.wells?.length === 1) {
      event.well = parameters.wells[0];
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

function materialReferenceForTransfer(material: unknown): unknown {
  if (!material || typeof material !== 'object') return undefined;
  const record = material as Record<string, unknown>;
  if (typeof record.recordId === 'string') {
    return {
      id: record.recordId,
      ...(typeof record.kind === 'string' ? { kind: record.kind } : {}),
      ...(typeof record.name === 'string' ? { label: record.name } : {}),
    };
  }
  if (typeof record.name === 'string') return record.name;
  return undefined;
}

function mentionsMaterialBackReference(text: string, tags: MaterializedPromptTag[] = []): boolean {
  if (/\b(?:of|from)\s+(?:it|them|this|that)\b/i.test(text)) return true;
  if (/\b(?:of|from|use|using)\s+(?:the\s+)?(?:same\s+)?(?:source\s+)?(?:material|solution|compound|reagent)\b/i.test(text)) return true;
  if (/\b(?:that|this|same)\s+(?:material|solution|compound|reagent)\b/i.test(text)) return true;
  return tags.some((tag) => (
    tag.kind === 'back_reference' &&
    isMaterialBackReferencePhrase(tag.text)
  ));
}

function isMaterialBackReferencePhrase(text: string): boolean {
  return /^(?:it|them|this|that|source\s+material|material|solution|compound|reagent|same\s+material|the\s+same\s+material|same\s+solution|the\s+same\s+solution|that\s+solution|this\s+solution|same\s+compound|the\s+same\s+compound|same\s+reagent|the\s+same\s+reagent)$/i.test(text.trim());
}

function instrumentFromText(text: string, tags: MaterializedPromptTag[] = []): string | undefined {
  const instrumentTag = tags.find((tag) => tag.kind === 'instrument');
  if (instrumentTag) return normalizeInstrumentName(instrumentTag.text);

  const lower = text.toLowerCase();
  if (lower.includes('gemini em')) return 'Gemini EM plate reader';

  const explicit = text.match(/\b(?:on|using|with)\s+(?:the\s+)?([a-z0-9][a-z0-9\s-]*(?:plate reader|reader|spectrophotometer|fluorometer|luminometer))\b/i);
  if (explicit) return normalizeInstrumentName(explicit[1]!);

  if (/\bplate reader\b/i.test(text)) return 'plate-reader';
  return undefined;
}

function normalizeInstrumentName(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (/^gemini em(?: plate reader)?$/i.test(compact)) return 'Gemini EM plate reader';
  if (/^plate reader$/i.test(compact)) return 'plate-reader';
  return compact;
}

function resolveContextualLabwareReferences(
  nouns: ResolvedNoun[],
  labwareByRole: Map<string, string>,
): ResolvedNoun[] {
  if (labwareByRole.size === 0) return nouns;
  return nouns.map((noun) => {
    if (noun.kind !== 'unresolved' && noun.kind !== 'labware' && noun.kind !== 'labware-instance') {
      return noun;
    }
    const role = contextualLabwareRole(noun.phrase, labwareByRole);
    if (!role) return noun;
    const recordId = labwareByRole.get(role);
    if (!recordId) return noun;
    return {
      ...noun,
      kind: 'labware',
      recordId,
      confidence: Math.max(noun.confidence, 0.85),
      source: `context:${role}`,
    };
  });
}

function contextualLabwareRole(phrase: string, labwareByRole: Map<string, string>): string | undefined {
  const lower = phrase.toLowerCase();
  if (isInstrumentReferencePhrase(lower)) return undefined;
  if (/\b(?:source|reservoir source)\b/.test(lower) && labwareByRole.has('source')) return 'source';
  if (/\b(?:target|destination)\b/.test(lower) && labwareByRole.has('target')) return 'target';
  if (lower.includes('reservoir') && labwareByRole.has('reservoir')) return 'reservoir';
  if (lower.includes('plate') && labwareByRole.has('plate')) return 'plate';
  return undefined;
}

function inferReadBackReferenceLabware(
  clause: { text: string; span: [number, number] },
  labwareByRole: Map<string, string>,
): ResolvedNoun | undefined {
  const match = clause.text.match(/\b(?:it|this|that|(?:the\s+)?(?:same\s+)?(?:target\s+)?plate|reservoir)\b/i);
  if (!match || match.index === undefined) return undefined;

  const lower = match[0].toLowerCase();
  const role = lower.includes('reservoir')
    ? (labwareByRole.has('reservoir') ? 'reservoir' : labwareByRole.has('source') ? 'source' : undefined)
    : (labwareByRole.has('target') ? 'target' : labwareByRole.has('plate') ? 'plate' : undefined);
  if (!role) return undefined;

  const recordId = labwareByRole.get(role);
  if (!recordId) return undefined;

  const spanStart = clause.span[0] + match.index;
  return {
    phrase: match[0],
    span: [spanStart, spanStart + match[0].length],
    kind: 'labware',
    recordId,
    confidence: 0.82,
    source: `back_reference:${role}`,
  };
}

function isInstrumentReferencePhrase(text: string): boolean {
  return /^(?:(?:gemini\s+em|gemini)(?:\s+plate\s+reader)?|[a-z0-9][a-z0-9\s-]*(?:plate reader|reader|spectrophotometer|fluorometer|luminometer))(?:\s+(?:in|with|at|as)\b.*)?$/i.test(text.trim());
}

function collectCandidateLabwaresFromResolved(
  candidateLabwares: CandidateLabware[],
  labwareHints: Set<string>,
  labwareNouns: ResolvedNoun[],
  reason: string,
  sourceText?: string,
): void {
  for (const n of labwareNouns) {
    if (n.kind !== 'labware' && n.kind !== 'labware-instance') continue;
    const spanInText = sourceText?.toLowerCase().indexOf(n.phrase.toLowerCase()) ?? -1;
    const deckSlot = sourceText && spanInText >= 0
      ? inferDeckSlotForMention(sourceText, spanInText, spanInText + n.phrase.length)
      : undefined;
    // A resolved labware-instance is already on the deck (or in the editor),
    // so it doesn't need to be proposed as a new labware addition — unless
    // the prompt anchors it to a specific deck slot, in which case
    // resolve_labware turns the candidate into a placement.
    if (n.kind === 'labware-instance' && !deckSlot) continue;
    const key = n.recordId ?? n.phrase;
    if (labwareHints.has(key)) continue;
    labwareHints.add(key);
    candidateLabwares.push({
      hint: n.phrase,
      reason,
      ...(deckSlot ? { deckSlot } : {}),
    });
  }
}

function isLabwareSetupFragment(text: string, labwareNouns: ResolvedNoun[]): boolean {
  return labwareNouns.length > 0 && /\b(?:source|target|destination|location|position)\b/i.test(text);
}

function rememberRawLabwareRoles(
  labwareByRole: Map<string, string>,
  labwareNouns: ResolvedNoun[],
  text: string,
): void {
  for (const noun of labwareNouns) {
    if (!noun.recordId) continue;
    const spanInText = text.toLowerCase().indexOf(noun.phrase.toLowerCase());
    const deckSlot = spanInText >= 0
      ? inferDeckSlotForMention(text, spanInText, spanInText + noun.phrase.length)
      : undefined;
    rememberLabwareAliases(labwareByRole, noun.phrase, noun.recordId, deckSlot);
  }
}

function rememberMentionLabwareRoles(
  labwareByRole: Map<string, string>,
  matches: Array<{ mention: PromptMention; start: number; end: number }>,
  prompt: string,
): void {
  for (const match of matches) {
    const mention = match.mention;
    if (mention.type !== 'labware' || !mention.id) continue;
    const deckSlot = inferDeckSlotForMention(prompt, match.start, match.end);
    rememberLabwareAliases(labwareByRole, mention.label, mention.id, deckSlot);
  }
}

function rememberInputMentionLabwareRoles(
  labwareByRole: Map<string, string>,
  mentions: PromptMention[],
  prompt: string,
): void {
  for (const mention of mentions) {
    if (mention.type !== 'labware' || !mention.id) continue;
    const span = findMentionLabelSpan(prompt, mention);
    const deckSlot = span ? inferDeckSlotForMention(prompt, span.start, span.end) : undefined;
    rememberLabwareAliases(labwareByRole, mention.label, mention.id, deckSlot);
  }
}

function rememberLabwareAliases(
  labwareByRole: Map<string, string>,
  phrase: string,
  recordId: string,
  deckSlot?: string,
): void {
  if (deckSlot) labwareByRole.set(deckSlot, recordId);
  const lower = phrase.toLowerCase();
  if (lower.includes('source')) labwareByRole.set('source', recordId);
  if (lower.includes('target') || lower.includes('destination')) labwareByRole.set('target', recordId);
  if (lower.includes('reservoir')) labwareByRole.set('reservoir', recordId);
  if (lower.includes('plate')) labwareByRole.set('plate', recordId);
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
  const deckSlot = text.match(/\b(?:deck\s+)?slot\s+([A-D][1-4])\b/i);
  if (deckSlot) return deckSlot[1]!.toUpperCase();

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
