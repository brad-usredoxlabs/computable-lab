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
  origin: 'document_branch' | 'ai_suggested';
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
  steps: Array<{ stepNumber?: number; stepId?: string; branches?: string[] }>;
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
  const axes: DecisionTreeAxis[] = deriveBranchAxes(input.steps).map((a) => ({
    axisId: a.axisId,
    question: buildQuestion(a),
    choiceKey: 'branchSelection',
    origin: 'document_branch' as const,
    conditions: rebindPredicatePath(a.conditions ?? [], a.axisId),
  }));

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
    ...(input.notes ? { notes: input.notes } : {}),
  };
}
