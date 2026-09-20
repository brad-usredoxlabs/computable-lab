/**
 * deriveProtocolChoiceAxis — lift a QUESTION out of a vendor document's own
 * list of protocols.
 *
 * A vendor handbook is a MATRIX, not a protocol. DNeasy Blood & Tissue prints
 * eight short protocols side by side — {blood or cells, tissues} × {spin column,
 * DNeasy 96}, plus four pretreatments — each headed
 * "Protocol: Purification of Total DNA from Animal Blood or Cells (Spin-Column
 * Protocol)". Which one applies depends on the sample, which is exactly the
 * if/then logic a decision tree must state. Reading the handbook as one list
 * concatenated all eight into a single 77-step protocol and asked nothing.
 *
 * Deterministic rules (no inference, no fabrication):
 *   - the document must print MORE THAN ONE protocol section (one protocol is
 *     not a choice);
 *   - every section must carry the name the document prints for it (the
 *     contents page completes a wrapped heading);
 *   - every option's steps must be attributable — steps carry the section they
 *     came from (`sectionId`), so the choice GATES the right steps. A document
 *     whose steps cannot be attributed yields no axis: an unanswerable or
 *     mis-gating question is worse than none.
 */

export interface ProtocolSectionLike {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  provenance?: unknown;
}

export interface ProtocolChoiceStepLike {
  /** The vendor candidate's own step id field (`id`, e.g. 'step-7'). */
  id?: unknown;
  stepId?: unknown;
  sectionId?: unknown;
  stepNumber?: unknown;
  substep?: unknown;
}

export interface ProtocolChoiceAxisCondition {
  id: string;
  label: string;
  predicate: { op: 'equals'; path: string; value: string };
  then_stepIds: string[];
}

export interface ProtocolChoiceAxis {
  axisId: string;
  question: string;
  choiceKey: string;
  conditions: ProtocolChoiceAxisCondition[];
}

export type ProtocolChoiceReason =
  | 'no_protocol_sections'
  | 'single_protocol'
  | 'unnamed_protocols'
  | 'steps_not_attributed';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/** Steps in the order the reader walks them: 1, 1a, 1b, 2, … */
function readingOrder(steps: ProtocolChoiceStepLike[]): ProtocolChoiceStepLike[] {
  return [...steps].sort((a, b) => {
    const an = typeof a.stepNumber === 'number' ? a.stepNumber : Number.MAX_SAFE_INTEGER;
    const bn = typeof b.stepNumber === 'number' ? b.stepNumber : Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    const as = asString(a.substep) ?? '';
    const bs = asString(b.substep) ?? '';
    return as.localeCompare(bs);
  });
}

export function deriveProtocolChoiceAxis(input: {
  protocolSections?: unknown;
  steps?: unknown;
}): { axis?: ProtocolChoiceAxis; reason?: ProtocolChoiceReason } {
  const sections = (Array.isArray(input.protocolSections) ? input.protocolSections : []).filter(
    (section): section is ProtocolSectionLike =>
      typeof section === 'object' && section !== null && (section as ProtocolSectionLike).kind === 'protocol',
  );
  if (sections.length === 0) {
    return { reason: 'no_protocol_sections' };
  }
  if (sections.length === 1) {
    return { reason: 'single_protocol' };
  }

  const named = sections.map((section) => ({
    id: asString(section.id) ?? '',
    title: asString(section.title),
  }));
  if (named.some((section) => !section.title)) {
    return { reason: 'unnamed_protocols' };
  }

  const steps = (Array.isArray(input.steps) ? input.steps : []).filter(
    (step): step is ProtocolChoiceStepLike => typeof step === 'object' && step !== null,
  );
  const attributed = steps.filter((step) => asString(step.sectionId));
  if (attributed.length === 0) {
    return { reason: 'steps_not_attributed' };
  }

  const conditions: ProtocolChoiceAxisCondition[] = [];
  for (const section of named) {
    const title = section.title as string;
    const sectionSteps = readingOrder(
      attributed.filter((step) => asString(step.sectionId) === section.id),
    )
      .map((step) => asString(step.id) ?? asString(step.stepId))
      .filter((id): id is string => Boolean(id));
    if (sectionSteps.length === 0) {
      // A protocol the document prints but whose steps did not parse must not
      // be quietly missing from the choice: the reader who needs it would find
      // no branch. The whole axis is refused, and the reason is recorded.
      return { reason: 'steps_not_attributed' };
    }
    conditions.push({
      // The SECTION id is the condition id, so "this answer selects that
      // protocol" is an exact match rather than a naming convention: the review
      // surface uses it to ask the chosen protocol's own nested questions, and
      // only those. The PREDICATE keeps the slug of the printed name, because
      // that is the value the localization choices carry.
      id: section.id,
      label: title,
      predicate: { op: 'equals', path: '$.branchSelection', value: slug(title) },
      then_stepIds: sectionSteps,
    });
  }
  if (conditions.length < 2) {
    return { reason: 'steps_not_attributed' };
  }

  // Ids are section ids (unique by construction); the LABELS are what the
  // reviewer chooses between, so two protocols printing the same name remain a
  // refusal: an ambiguous choice is not a choice.
  const ids = new Set(conditions.map((condition) => condition.id));
  const labels = new Set(conditions.map((condition) => condition.label));
  if (ids.size !== conditions.length || labels.size !== conditions.length) {
    return { reason: 'unnamed_protocols' };
  }

  return {
    axis: {
      axisId: 'axis-protocol-choice',
      question: 'Which protocol applies?',
      choiceKey: 'branchSelection',
      conditions,
    },
  };
}
