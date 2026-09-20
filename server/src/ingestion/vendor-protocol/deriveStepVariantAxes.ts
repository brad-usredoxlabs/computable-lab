/**
 * deriveStepVariantAxes — a step that DISPATCHES to variant steps is a question.
 *
 * The DNeasy handbook writes its first step as a dispatch sentence, then prints
 * the variants as sub-numbered steps:
 *
 *   1. For blood with non-nucleated erythrocytes, follow step 1a; for blood with
 *      nucleated erythrocytes, follow step 1b; for cultured cells, follow step 1c.
 *      1a. Non-nucleated: Pipet 20 µl Proteinase K …
 *      1b. Nucleated: …
 *      1c. Cultured cells: …
 *
 * The document is stating if/then logic in prose, and the extractor keeps the
 * variants as steps carrying `substep` ('a'/'b'/'c') and `stepNumber` (1). The
 * question is "which variant of step 1 applies?"; each option gates the step it
 * names.
 *
 * Deterministic rules (no inference, no fabrication):
 *   - a step qualifies only when it names AT LEAST TWO step targets in its own
 *     text ("… follow step 1a … follow step 1b …"). A single target is a
 *     cross-reference, not a choice;
 *   - every target must RESOLVE to a step in the same protocol section (by the
 *     manual's number plus its sub-label). A target nobody can find yields no
 *     axis: a question with a dead branch is worse than no question;
 *   - the option label is the condition clause verbatim, and the option key is
 *     its slug — the same convention as branch and table options, so the
 *     localization UI renders all of them alike.
 */

export interface VariantStepLike {
  /** The vendor candidate's own step id field (`id`, e.g. 'step-2'). */
  id?: unknown;
  stepId?: unknown;
  stepNumber?: unknown;
  substep?: unknown;
  sectionId?: unknown;
  /** The step's own text. */
  sourceText?: unknown;
}

export interface StepVariantAxisCondition {
  id: string;
  label: string;
  predicate: { op: 'equals'; path: string; value: string };
  then_stepIds: string[];
}

export interface StepVariantAxis {
  axisId: string;
  question: string;
  choiceKey: string;
  /** The protocol section whose own question this is (nested, asked once). */
  sectionId?: string;
  conditions: StepVariantAxisCondition[];
}

/** "For <condition>, follow step 1a" — also when/if, also "go to"/"continue with". */
const DISPATCH =
  /(?:^|[.;:]\s*)\b(?:for|when|if)\s+([^.;,]+?),\s*(?:follow|go to|continue with|proceed with)\s+step\s*(\d{1,2}[a-z]?)\b/giu;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/** The manual's own label for a step: number plus sub-letter ("1", "1a"). */
function manualLabel(step: VariantStepLike): string | undefined {
  if (typeof step.stepNumber !== 'number') {
    return undefined;
  }
  const substep = asString(step.substep);
  return `${step.stepNumber}${substep ?? ''}`;
}

function stepIdOf(step: VariantStepLike): string | undefined {
  return asString(step.id) ?? asString(step.stepId);
}

export function deriveStepVariantAxes(steps: unknown, protocolSections?: unknown): StepVariantAxis[] {
  const list = (Array.isArray(steps) ? steps : []).filter(
    (step): step is VariantStepLike => typeof step === 'object' && step !== null,
  );
  // A handbook can ask the SAME question in several protocols (DNeasy: "which
  // variant of step 1?" appears in the spin-column protocol AND in the DNeasy 96
  // protocol), so the protocol's own name is part of the question.
  const sectionTitles = new Map<string, string>();
  for (const section of Array.isArray(protocolSections) ? protocolSections : []) {
    if (typeof section !== 'object' || section === null) continue;
    const record = section as { id?: unknown; title?: unknown };
    const id = asString(record.id);
    const title = asString(record.title);
    if (id && title) sectionTitles.set(id, title);
  }
  const axes: StepVariantAxis[] = [];

  for (const step of list) {
    const text = asString(step.sourceText);
    const id = stepIdOf(step);
    if (!text || !id) {
      continue;
    }
    const dispatches: Array<{ clause: string; target: string }> = [];
    for (const match of text.matchAll(DISPATCH)) {
      // The sentence wraps in the PDF text; the clause is one line of prose.
      const clause = asString(match[1])?.replace(/\s+/gu, ' ');
      const target = asString(match[2]);
      if (clause && target) {
        dispatches.push({ clause, target });
      }
    }
    if (dispatches.length < 2) {
      continue;
    }

    // Resolve each target within the same protocol section: the manual's
    // numbering restarts in every protocol, so "step 2" means step 2 OF THIS
    // protocol.
    const section = asString(step.sectionId);
    const conditions: StepVariantAxisCondition[] = [];
    const seen = new Set<string>();
    for (const dispatch of dispatches) {
      const target = list.find(
        (candidate) =>
          manualLabel(candidate) === dispatch.target &&
          (section === undefined || asString(candidate.sectionId) === section),
      );
      const targetId = target ? stepIdOf(target) : undefined;
      if (!targetId) {
        // The document names this variant but its step was not extracted:
        // offering the other variants would hide this one from the reader who
        // needs it, so this step yields no question at all.
        conditions.length = 0;
        break;
      }
      const key = slug(dispatch.clause);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      conditions.push({
        id: key,
        label: dispatch.clause,
        predicate: { op: 'equals', path: '$.branchSelection', value: key },
        then_stepIds: [targetId],
      });
    }
    if (conditions.length < 2) {
      continue;
    }

    // Every option must name a DIFFERENT step, else the choice changes nothing.
    const gated = new Set(conditions.flatMap((condition) => condition.then_stepIds));
    if (gated.size !== conditions.length) {
      continue;
    }

    // Every VARIANT the document prints for this step must be offered. A
    // dispatch the pattern cannot read (the DNeasy 96 protocol writes "follow
    // step1a", with no space, which silently dropped that option) would leave a
    // reader with no branch to follow, so the axis is refused instead.
    const siblingVariants = list.filter(
      (candidate) =>
        candidate.stepNumber === step.stepNumber &&
        asString(candidate.substep) !== undefined &&
        (section === undefined || asString(candidate.sectionId) === section),
    );
    if (siblingVariants.length > gated.size) {
      continue;
    }

    const sectionTitle = section ? sectionTitles.get(section) : undefined;
    axes.push({
      axisId: `axis-${id}-variant`,
      ...(section ? { sectionId: section } : {}),
      question: sectionTitle
        ? `Which variant applies for step ${manualLabel(step) ?? id} in ${sectionTitle}?`
        : `Which variant applies for step ${manualLabel(step) ?? id}?`,
      choiceKey: 'branchSelection',
      conditions,
    });
  }

  return axes;
}
