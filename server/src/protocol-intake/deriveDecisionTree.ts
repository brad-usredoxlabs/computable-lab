/**
 * deriveDecisionTree — lift vendor-protocol branch structure plus AI-suggested
 * clarifying questions into a single `protocol-decision-tree` proposal record.
 *
 * Pure and deterministic: the same input always yields the same tree (modulo
 * `generatedAt` when `now` is omitted). Scale options are NEVER hardcoded here —
 * the caller passes registry levels so this module stays domain-data-free.
 *
 * CRITICAL rebinding rule: `deriveBranchAxes` emits predicates all targeting
 * `$.branchSelection`, which cannot answer multiple axes independently. Every
 * axis (document-derived OR ai-suggested) gets each condition's predicate path
 * rewritten to `$.branchSelection.${axisId}`, so the localization choices
 * object is always the nested shape { branchSelection: { axisId: slug } }.
 */

import { deriveBranchAxes, slugify } from '../ingestion/vendor-protocol/deriveBranchAxes.js';
import { deriveStepVariantAxes } from '../ingestion/vendor-protocol/deriveStepVariantAxes.js';
import { deriveSampleSourceAxis } from './deriveDocumentTableAxis.js';
import { deriveProtocolChoiceAxis } from './deriveProtocolChoiceAxis.js';
import type { BranchAxisLike, BranchConditionLike } from '../protocol/BranchResolver.js';

export interface QuestionEvidence {
  quote: string;
  page?: number;
  stepNumber?: number;
}

export interface DecisionTreeAxis {
  axisId: string;
  question: string;
  choiceKey: string;
  origin: 'document_branch' | 'document_table' | 'document_section' | 'ai_suggested';
  /**
   * The protocol section this question belongs to, when the question is NESTED
   * inside one protocol. A handbook asks the same sub-question in several
   * protocols (DNeasy asks "which variant of step 1?" in the spin-column
   * protocol and again in the DNeasy 96 protocol); nested means the review
   * surface asks it once, once that protocol is chosen, instead of listing it
   * beside the protocol choice as a near-duplicate.
   */
  sectionId?: string;
  evidence?: QuestionEvidence[];
  conditions: NonNullable<BranchAxisLike['conditions']>;
}

export interface DecisionTreeScaleOption {
  level: 'manual_tubes' | 'bench_plate_multichannel' | 'robot_deck';
  profileId?: string;
}

export interface DecisionTreeScaleAxis {
  question: string;
  options: DecisionTreeScaleOption[];
}

export interface ProtocolDecisionTree {
  kind: 'protocol-decision-tree';
  recordId: string;
  documentId: string;
  sourcePdf?: Record<string, unknown>;
  axes: DecisionTreeAxis[];
  scaleAxis: DecisionTreeScaleAxis;
  status: 'proposed';
  generatedAt: string;
  notes?: string;
}

export interface DeriveDecisionTreeInput {
  documentId: string;
  steps: Array<{
    stepNumber?: number;
    stepId?: string;
    branches?: string[];
    /** Step text — used to find steps that point at a document table (3b). */
    sourceText?: unknown;
    actions?: unknown;
    /** The protocol section the step belongs to (which protocol of the
     *  document it implements). */
    sectionId?: unknown;
    /** The manual's own sub-label for a variant step ("a" of "1a"). */
    substep?: unknown;
    /** The vendor candidate's own id field. */
    id?: unknown;
  }>;
  /** The document's protocol sections — more than one means the document
   *  presents a CHOICE of protocols, which is a question. */
  protocolSections?: unknown;
  /** Document tables verbatim — the sample table is a question (Phase 3b). */
  tables?: unknown;
  /** Caller passes registry levels — NEVER hardcoded here. */
  scaleOptions: DecisionTreeScaleOption[];
  aiQuestions?: Array<{
    question: string;
    choiceKey: string;
    conditions: NonNullable<BranchAxisLike['conditions']>;
    evidence: QuestionEvidence[];
  }>;
  sourcePdf?: Record<string, unknown>;
  now?: string;
  notes?: string;
}

/** Rewrite each condition's predicate path to `$.branchSelection.${axisId}`. */
function rebindPredicatePath(
  conditions: NonNullable<BranchAxisLike['conditions']>,
  axisId: string,
): BranchConditionLike[] {
  return conditions.map((cond) => {
    if (cond.predicate && typeof cond.predicate === 'object' && !Array.isArray(cond.predicate)) {
      // Shallow-copy then set path; leave everything else untouched.
      return { ...cond, predicate: { ...(cond.predicate as Record<string, unknown>), path: `$.branchSelection.${axisId}` } };
    }
    return { ...cond };
  });
}

function buildQuestion(axis: BranchAxisLike): string {
  const labels = (axis.conditions ?? [])
    .map((c) => c.label)
    .filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
  if (labels.length > 0) return `Which branch applies: ${labels.join(' / ')}?`;
  return axis.label ?? `Resolve branch axis ${axis.axisId}`;
}

export function deriveDecisionTree(input: DeriveDecisionTreeInput): ProtocolDecisionTree {
  const axes: DecisionTreeAxis[] = [];

  // A protocol's own questions are derived BEFORE the choice between
  // protocols, because they decide what the choice gates: "1a" and "1b" are
  // alternatives WITHIN a protocol, so the protocol option must not carry them
  // (the union of a protocol's steps and its chosen variant would otherwise run
  // every variant at once).
  const variantAxes = deriveStepVariantAxes(input.steps, input.protocolSections);
  const variantStepsBySection = new Map<string, Set<string>>();
  for (const axis of variantAxes) {
    if (!axis.sectionId) continue;
    const set = variantStepsBySection.get(axis.sectionId) ?? new Set<string>();
    for (const condition of axis.conditions) {
      // The condition objects carry the schema's own key (`then_stepIds`), not the
      // camelCase of BranchConditionLike: Ajv validates the stored tree.
      for (const stepId of ((condition as unknown as Record<string, unknown>)['then_stepIds'] as string[] | undefined) ?? []) {
        set.add(stepId);
      }
    }
    variantStepsBySection.set(axis.sectionId, set);
  }

  // The document's own protocol list (Phase 3c). A handbook that prints eight
  // protocols — DNeasy: {blood or cells, tissues} × {spin column, DNeasy 96} —
  // is not one protocol; the choice between them is the document's top-level
  // if/then, so this axis comes FIRST.
  let protocolNote: string | undefined;
  const protocolAxis = deriveProtocolChoiceAxis({
    protocolSections: input.protocolSections,
    steps: input.steps,
  });
  if (protocolAxis.axis) {
    const a = protocolAxis.axis;
    axes.push({
      axisId: a.axisId,
      question: a.question,
      choiceKey: a.choiceKey,
      origin: 'document_section' as const,
      conditions: rebindPredicatePath(
        a.conditions.map((condition) => {
          const variantSteps = variantStepsBySection.get(condition.id);
          if (!variantSteps) return condition;
          const existing = ((condition as unknown as Record<string, unknown>)['then_stepIds'] as string[] | undefined) ?? [];
          const own = existing.filter((stepId) => !variantSteps.has(stepId));
          return { ...condition, 'then_stepIds': own };
        }) as unknown as NonNullable<BranchAxisLike['conditions']>,
        a.axisId,
      ),
    });
  } else if (protocolAxis.reason && protocolAxis.reason !== 'single_protocol' && protocolAxis.reason !== 'no_protocol_sections') {
    protocolNote = `protocol_choice_axis_not_derived: ${protocolAxis.reason}`;
  }

  for (const a of deriveBranchAxes(input.steps)) {
    axes.push({
      axisId: a.axisId,
      question: buildQuestion(a),
      choiceKey: 'branchSelection',
      origin: 'document_branch' as const,
      conditions: rebindPredicatePath(a.conditions ?? [], a.axisId),
    });
  }

  for (const q of input.aiQuestions ?? []) {
    if (axes.some((a) => a.choiceKey === q.choiceKey)) continue;
    const axisId = slugify(`axis-${q.choiceKey}`);
    axes.push({
      axisId,
      question: q.question,
      choiceKey: q.choiceKey,
      origin: 'ai_suggested' as const,
      evidence: q.evidence,
      conditions: rebindPredicatePath(q.conditions, axisId),
    });
  }

  // Variant dispatches (Phase 3c): a step that says "For <condition>, follow
  // step 1a … 1b … 1c" is the document stating if/then logic in prose, and the
  // variants it names are steps of their own. Each option gates the step it
  // names.
  for (const a of variantAxes) {
    if (axes.some((existing) => existing.axisId === a.axisId)) continue;
    axes.push({
      axisId: a.axisId,
      question: a.question,
      choiceKey: a.choiceKey,
      origin: 'document_branch' as const,
      ...(a.sectionId ? { sectionId: a.sectionId } : {}),
      conditions: rebindPredicatePath(
        a.conditions as unknown as NonNullable<BranchAxisLike['conditions']>,
        a.axisId,
      ),
    });
  }

  // Document-table questions (Phase 3b): a table the document's own steps
  // point at ("using the table below") is a question, exactly like lettered
  // branches. Refusals are recorded as notes — never silently dropped.
  let tableNote: string | undefined;
  const tableAxis = deriveSampleSourceAxis({ tables: input.tables, steps: input.steps });
  if (tableAxis.axis) {
    const a = tableAxis.axis;
    if (!axes.some((existing) => existing.axisId === a.axisId)) {
      axes.push({
        axisId: a.axisId,
        question: a.question,
        choiceKey: a.choiceKey,
        origin: 'document_table' as const,
        evidence: a.evidence,
        conditions: rebindPredicatePath(a.conditions as NonNullable<BranchAxisLike['conditions']>, a.axisId),
      });
    }
  } else if (tableAxis.reason && tableAxis.reason !== 'no_sample_table') {
    tableNote = `sample_source_axis_not_derived: ${tableAxis.reason}`;
  }

  const notes = [input.notes, protocolNote, tableNote].filter(
    (n): n is string => typeof n === 'string' && n.length > 0,
  );

  return {
    kind: 'protocol-decision-tree',
    recordId: `PDT-${input.documentId}`,
    documentId: input.documentId,
    ...(input.sourcePdf ? { sourcePdf: input.sourcePdf } : {}),
    axes,
    scaleAxis: {
      question: 'At what execution scale should this protocol run?',
      options: input.scaleOptions,
    },
    status: 'proposed',
    generatedAt: input.now ?? new Date().toISOString(),
    ...(notes.length > 0 ? { notes: notes.join('; ') } : {}),
  };
}
