/**
 * Fix-it coder skill registry. Each skill is a named debugging methodology
 * (numbered workflow + tool list + symptom-shape trigger) injected into the
 * coder's system prompt. The triage rubric (rendered first) maps the verify
 * symptom to a skill; the model self-routes.
 *
 * Architecture choice: skills are injected as a UNIT (all skills + triage) so
 * the model can compose them (e.g. prompt-variation-debug → resolution-debug
 * if varying the prompt locates the bug at noun resolution). Server-side
 * triage-and-inject-one would require a verify result at job start, which
 * isn't available until the coder runs verify itself.
 */
import { eventStateDebug } from './eventStateDebug.js';
import { loweringDebug } from './loweringDebug.js';
import { promptVariationDebug } from './promptVariationDebug.js';
import { resolutionDebug } from './resolutionDebug.js';
import type { FixItSkill } from './types.js';

export { type FixItSkill } from './types.js';

export const FIXIT_SKILLS: readonly FixItSkill[] = [
  promptVariationDebug,
  resolutionDebug,
  loweringDebug,
  eventStateDebug,
];

const TRIAGE_RUBRIC = [
  'SKILL TRIAGE — pick the skill that matches the verify symptom; you may chain skills:',
  '  - Wrong slot pinned, dropped clause, verb ignored, or output depends on prompt phrasing',
  '    → prompt-variation-debug',
  '  - Right tag but wrong recordId, missing record, or alias-map ≠ canonical-registry',
  '    → resolution-debug',
  '  - Right events but wrong params (volume, source/dest, well address, t_offset)',
  '    → lowering-debug',
  '  - Wrong event ordering, dependency, or downstream state references',
  '    → event-state-debug',
  'For data-only fixes (no compiler logic involved), follow the spec directly and skip skills.',
  'Skills compose: e.g. start with prompt-variation-debug; if the flipping variable is a noun,',
  'switch to resolution-debug. The diagnosis label on the spec (if present) is a soft hint.',
].join('\n');

/**
 * Render the triage rubric + every skill's promptText, separated by blank
 * lines, as a single string to splice into the coder system prompt.
 */
export function renderSkillsForPrompt(skills: readonly FixItSkill[] = FIXIT_SKILLS): string {
  return [TRIAGE_RUBRIC, '', ...skills.map((s) => s.promptText)].join('\n\n');
}
