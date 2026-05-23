/**
 * Fix-it coder skill — a named, scoped debugging methodology injected into
 * the coder's system prompt. Each skill names a symptom shape, lists the
 * tools it uses, and gives a numbered workflow. The model self-triages from
 * the rubric in `renderSkillsForPrompt`.
 */
export interface FixItSkill {
  /** kebab-case identifier, e.g. "prompt-variation-debug". */
  name: string;
  /** Symptom shape — used by the triage rubric to route. */
  triggersWhen: string;
  /** Tool names this skill primarily uses. */
  tools: string[];
  /** Numbered workflow + steering. Injected verbatim into the system prompt. */
  promptText: string;
}
