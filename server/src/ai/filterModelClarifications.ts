/**
 * The harness enforces what the prompt tells the model.
 *
 * The draft tool's own instructions are explicit (submitSuggestionTool):
 *
 *   - MATERIALS ARE NEVER A CLARIFICATION YOU AUTHOR.
 *   - Reserve `clarificationRequests[]` for genuinely non-material ambiguities you
 *     truly cannot draft past — and never to confirm a quantity/concentration the
 *     user already stated.
 *
 * Observed 2026-09-20, in violation: a seeding draft authored its own card —
 * "What is the desired final volume per well and the cell suspension
 * concentration (cells/uL) for this seeding step?" — for a CELL line, whose type
 * declares that only a count is owed and that adherent cells may have zero
 * volume. The biologist was being slowed down by a question their own type rules
 * forbid, and the card's wording was the model's, not the system's.
 *
 * So: a model-authored question that DEMANDS an amount the material's type does
 * not owe is dropped, and the drop is reported (never silent). Requests the
 * HARNESS authored (`origin: 'harness'`) are always kept — see the live failure
 * noted on the `origin` field in types.ts. Questions that
 * name something else — which plate, which preparation, which lot — are left
 * alone: those are the ambiguities the model is allowed to raise.
 */
import type { AgentClarificationRequest } from './types.js';

/** The words a question uses to ask for each amount. */
const AMOUNT_WORDS: Record<string, readonly string[]> = {
  volume: ['volume'],
  concentration: ['concentration', 'cells/ul', 'cells/µl', 'dilution factor'],
  count: ['how many', 'cell count', 'number of cells'],
};

/**
 * The harness's own identity question, in the words the model tends to copy back
 * verbatim ("Which material is \"X\"? Pick an ontology term or create a local
 * record."). The draft tool forbids the model from authoring material
 * clarifications at all, and the harness asks this one itself when a material is
 * ungrounded — so a model-authored copy is a duplicate that loops the
 * conversation (observed 2026-09-20: the biologist answered the identity twice
 * and the same card returned).
 */
const MATERIAL_IDENTITY_QUESTION = /which material|pick an ontology term|create a local record/i;
/** …but a question about WHICH preparation/lot/aliquot is a different, allowed ask. */
const ALLOWED_MATERIAL_NARROWING = /preparation|lot|aliquot|instance|batch/i;

/** Is this a question asking the biologist to identify the material itself? */
export function isMaterialIdentityQuestion(prompt: string): boolean {
  if (!MATERIAL_IDENTITY_QUESTION.test(prompt)) return false;
  return !ALLOWED_MATERIAL_NARROWING.test(prompt);
}

/** Which amounts does this question actually ask for? */
export function demandedAmounts(prompt: string): string[] {
  const text = prompt.toLowerCase();
  return Object.entries(AMOUNT_WORDS)
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([key]) => key);
}

export interface ClarificationFilterResult {
  requests: AgentClarificationRequest[];
  /** One line per dropped question, for the draft notes. */
  notes: string[];
}

/**
 * Drop questions that demand amounts the type does not owe.
 *
 * `declaredRequirements` is the type's own table (e.g. a cell line declares
 * `['count']`), so a question about volume or concentration for a cell line is
 * dropped while a question about the count survives. When a question asks for
 * nothing in particular it is always kept.
 */
export function filterForbiddenAmountQuestions(
  requests: readonly AgentClarificationRequest[] | undefined,
  declaredRequirements: readonly string[] | null,
): ClarificationFilterResult {
  if (!Array.isArray(requests) || requests.length === 0) return { requests: [], notes: [] };
  // The identity rule holds regardless of type; the amount rule needs the table.
  const allowed = declaredRequirements ? new Set(declaredRequirements) : null;
  const kept: AgentClarificationRequest[] = [];
  const notes: string[] = [];
  for (const request of requests) {
    const prompt = request.prompt ?? '';
    // The system's own questions are not the model's to author, and not mine to
    // delete: the gate merges its cards into the same list this filter walks, so
    // without this the identity rule ate the very card the gate had just asked.
    if (request.origin === 'harness') {
      kept.push(request);
      continue;
    }
    // The model may not author the material-identity question: the harness asks
    // it, once, when the material is ungrounded. A duplicate here is what made a
    // biologist answer the same question twice and see it come back.
    if (isMaterialIdentityQuestion(prompt)) {
      notes.push('I dropped the model’s “which material?” question — the system asks that itself when a material is ungrounded.');
      continue;
    }
    const demanded = allowed ? demandedAmounts(prompt) : [];
    const forbidden = allowed ? demanded.filter((key) => !allowed.has(key)) : [];
    if (forbidden.length === 0 || demanded.length === 0) {
      kept.push(request);
      continue;
    }
    const owes = declaredRequirements && declaredRequirements.length > 0
      ? declaredRequirements.join(', ')
      : 'no amounts';
    notes.push(
      `I dropped the model’s question about ${forbidden.join(' and ')} — this material’s type does not owe it ` +
        `(it owes ${owes}).`,
    );
  }
  return { requests: kept, notes };
}
