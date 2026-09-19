/**
 * reviewSteps — the review surface's step list, taken from the SAME extraction
 * the decision tree gates on.
 *
 * Why this exists: the review tab used to build its editable body by asking the
 * AI extractor for a SECOND candidate of the same PDF. That candidate's steps
 * are positionally numbered (`step-1..n`), so nothing on screen could be tied to
 * the `step-001` ids the tree's questions gate — the questions and the steps
 * were describing two different extractions of one document.
 *
 * This is a pure projection of the vendor-protocol candidate (the extractor's
 * output, already persisted as an artifact) plus the tree's axes, so each row
 * carries its real step id AND which questions gate it.
 */

export interface ReviewStepCandidateStep {
  id?: unknown;
  stepNumber?: unknown;
  sourceText?: unknown;
  actions?: unknown;
  notes?: unknown;
  branches?: unknown;
  provenance?: unknown;
}

export interface ReviewStepAxis {
  axisId?: unknown;
  question?: unknown;
  conditions?: unknown;
}

export interface ReviewStep {
  /** The candidate's own step id — the id the tree's conditions gate. */
  stepId: string;
  ordinal: number;
  label: string;
  description: string;
  /** Axis ids whose conditions gate this step (empty = always runs). */
  gatedByAxisIds: string[];
  /** Questions gating this step, in tree order (for the reviewer's eye). */
  gatedByQuestions: string[];
  /** The document's own branch sentences on this step, when it has any. */
  branches: string[];
  /** 1-based PDF pages this step came from (provenance). */
  provenancePages: number[];
  provenanceSectionId?: string;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

/** First sentence-ish of the step text, capped for a list row. */
function labelFrom(text: string, stepId: string): string {
  const first = text.split(/\n|(?<=\.)\s+/)[0]?.trim() ?? '';
  if (first.length === 0) return stepId;
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}

function pagesFrom(provenance: unknown): { pages: number[]; sectionId?: string } {
  if (typeof provenance !== 'object' || provenance === null) return { pages: [] };
  const p = provenance as Record<string, unknown>;
  const pages: number[] = [];
  for (const key of ['pageStart', 'page', 'pageNumber']) {
    const v = p[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) pages.push(v);
  }
  const end = p['pageEnd'];
  if (typeof end === 'number' && Number.isFinite(end) && end >= 1) pages.push(end);
  const sectionId = asString(p['sectionId']);
  return {
    pages: [...new Set(pages)].sort((a, b) => a - b),
    ...(sectionId ? { sectionId } : {}),
  };
}

/**
 * Project the candidate's steps + the tree's axes into review rows.
 * Deterministic; every gating axis is reported, never inferred.
 */
export function reviewStepsFromCandidate(input: {
  steps?: unknown;
  axes?: ReviewStepAxis[];
}): ReviewStep[] {
  const steps = (Array.isArray(input.steps) ? input.steps : []).filter(
    (s): s is ReviewStepCandidateStep => typeof s === 'object' && s !== null,
  );
  const axes = (input.axes ?? []).filter(
    (a): a is ReviewStepAxis & { axisId: string } => typeof a?.axisId === 'string' && a.axisId.length > 0,
  );

  // stepId -> { axisIds, questions } from each axis's conditions' then_stepIds.
  const gating = new Map<string, { axisIds: Set<string>; questions: string[] }>();
  for (const axis of axes) {
    const question = asString(axis.question) || axis.axisId;
    const conditions = Array.isArray(axis.conditions) ? axis.conditions : [];
    for (const condition of conditions) {
      if (typeof condition !== 'object' || condition === null) continue;
      const thenStepIds = asStringArray((condition as Record<string, unknown>)['then_stepIds']);
      for (const stepId of thenStepIds) {
        const entry = gating.get(stepId) ?? { axisIds: new Set<string>(), questions: [] };
        entry.axisIds.add(axis.axisId);
        if (!entry.questions.includes(question)) entry.questions.push(question);
        gating.set(stepId, entry);
      }
    }
  }

  return steps.map((step, index) => {
    const rawId = asString(step.id);
    const stepId = rawId || `step-${String(index + 1).padStart(3, '0')}`;
    const description = asString(step.sourceText);
    // Ordinal = the step's position in the document (its id), because a manual
    // may restart its OWN numbering mid-protocol: showing two "1." rows would
    // hide that a later list is a separate procedure. `stepNumber` (the
    // manual's number) stays on the candidate for cross-reference and is the
    // fallback when the step carries no id of its own.
    const fromId = rawId ? Number.parseInt(/^step-(\d+)/.exec(rawId)?.[1] ?? '', 10) : Number.NaN;
    const ordinal = Number.isFinite(fromId)
      ? fromId
      : typeof step.stepNumber === 'number' && Number.isFinite(step.stepNumber)
        ? step.stepNumber
        : index + 1;
    const { pages, sectionId } = pagesFrom(step.provenance);
    const entry = gating.get(stepId);
    return {
      stepId,
      ordinal,
      label: labelFrom(description, stepId),
      description,
      gatedByAxisIds: entry ? [...entry.axisIds] : [],
      gatedByQuestions: entry?.questions ?? [],
      branches: asStringArray(step.branches),
      provenancePages: pages,
      ...(sectionId ? { provenanceSectionId: sectionId } : {}),
    };
  });
}

/** Role labels (materials / labware / equipment) the candidate carries. */
export interface ReviewRoleLabels {
  materials: string[];
  labware: string[];
  equipment: string[];
}

export function reviewRolesFromCandidate(candidate: {
  materials?: unknown;
  labware?: unknown;
  equipment?: unknown;
}): ReviewRoleLabels {
  const labelsOf = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== 'object' || item === null) continue;
      const label = asString((item as Record<string, unknown>)['label']);
      if (label.length > 0 && !out.includes(label)) out.push(label);
    }
    return out;
  };
  return {
    materials: labelsOf(candidate.materials),
    labware: labelsOf(candidate.labware),
    equipment: labelsOf(candidate.equipment),
  };
}