/**
 * An unbounded clarification loop must become an honest failure.
 *
 * Observed (2026-09-20, lfm-local): the model failed to emit a bindable material
 * reference, the whole draft was discarded, the same card was shown, the
 * biologist answered, and the identical card returned — with nothing anywhere
 * counting that it was the second (or fifth) time. A stuck model looked exactly
 * like a persistent question.
 *
 * The fix has two halves, and this is the honest half: the answer is now BOUND
 * deterministically (`materialBinding`), so answering works even when the model
 * cannot re-emit the reference; and when the *same* question arrives a second
 * time, that fact is stated instead of being hidden behind another card.
 *
 * No new session state: the conversation history already carries the assistant's
 * earlier turns, so "have we asked this before?" is answered from `history`.
 */

export interface ClarificationSignatureSource {
  prompt: string;
  query?: string;
}

/** Normalize a question so wording noise does not defeat the comparison. */
export function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The identity of a clarification: its prompt plus the search seed it carries.
 * The seed matters — "which material?" asked about A1 and about B7 are different
 * questions even though the sentence is identical.
 */
export function clarificationSignature(source: ClarificationSignatureSource): string {
  const prompt = normalizePrompt(source.prompt ?? '');
  const query = normalizePrompt(source.query ?? '');
  return `${prompt}::${query}`;
}

function historyContents(history: readonly { role?: string; content?: unknown }[] | undefined): string[] {
  if (!Array.isArray(history)) return [];
  const out: string[] = [];
  for (const message of history) {
    if (message?.role !== 'assistant') continue;
    const content = typeof message.content === 'string' ? message.content : '';
    if (content) out.push(normalizePrompt(content));
  }
  return out;
}

export interface ClarificationLoopResult {
  /** True when repeating this question would be (at least) the Nth identical ask. */
  looped: boolean;
  /** The signatures that were already asked in the conversation. */
  repeated: string[];
}

/**
 * Detect that a clarification we are about to ask has already been asked in this
 * conversation. `threshold` is the total number of identical asks tolerated
 * (default 2: ask once, and if the same question comes back a second time, say
 * so rather than showing a third card).
 */
export function detectClarificationLoop(options: {
  requests: readonly ClarificationSignatureSource[] | undefined;
  history?: readonly { role?: string; content?: unknown }[] | undefined;
  threshold?: number;
}): ClarificationLoopResult {
  const threshold = Math.max(1, options.threshold ?? 2);
  const priorAssistantTexts = historyContents(options.history);
  const repeated: string[] = [];
  if (priorAssistantTexts.length === 0 || !Array.isArray(options.requests)) {
    return { looped: false, repeated };
  }
  for (const request of options.requests) {
    const prompt = normalizePrompt(request.prompt ?? '');
    if (!prompt) continue;
    // Count earlier assistant turns that already ask this question. The current
    // turn is the (count + 1)-th ask; it loops once that reaches `threshold`.
    const alreadyAsked = priorAssistantTexts.filter((text) => text.includes(prompt)).length;
    if (alreadyAsked + 1 >= threshold) repeated.push(clarificationSignature(request));
  }
  return { looped: repeated.length > 0, repeated };
}

/** The failure line shown to the biologist — names the problem, not a mystery. */
export function clarificationLoopMessage(repeated: readonly string[]): string {
  const count = repeated.length;
  return (
    `clarification_loop: the model asked the same ${count === 1 ? 'question' : `${count} questions`} again ` +
    'without binding the reference, so asking it a third time will not help. ' +
    'Answer below and the pick is applied directly — or rephrase with the material named explicitly.'
  );
}
