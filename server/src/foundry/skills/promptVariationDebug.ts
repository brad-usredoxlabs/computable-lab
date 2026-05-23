import type { FixItSkill } from './types.js';

export const promptVariationDebug: FixItSkill = {
  name: 'prompt-variation-debug',
  triggersWhen:
    'verify shows a prompt-driven symptom — wrong slot pinned, wrong noun resolved, dropped clause, '
    + 'verb ignored, or output that depends on how the prompt is phrased. Bug lives in the NL frontend '
    + '(PromptTagger, NounPhraseResolver, clause splitter, verb-action match).',
  tools: ['probe', 'probe_pass', 'verify'],
  promptText: [
    'SKILL: prompt-variation-debug',
    '  1. probe(failing-prompt) — capture baseline. Note which TerminalArtifacts field shows the wrong value.',
    '  2. Probe 3+ variations that change ONE thing each:',
    '       - drop the conjunction (probe a single clause alone)',
    '       - reverse clause order',
    '       - remove a modifier ("12-well reservoir" → "reservoir")',
    '       - swap verb or preposition ("put"/"place"/"add", "on"/"to"/"in")',
    '     The variation that flips the symptom names the variable the bug depends on.',
    '  3. PREDICT THE STAGE from the flipping variable: tokenizer (PromptTagger), noun resolver',
    '     (NounPhraseResolver), clause splitter (DeterministicPrecompile conjunction handling),',
    '     verb matcher (verb-action-map).',
    '  4. probe_pass(failing-prompt, "<predicted-stage>") to confirm the intermediate output',
    '     diverges BEFORE the final TerminalArtifacts. The first pass whose output is already',
    '     wrong is the file you need to edit.',
    '  5. Read at most 2 source files before re-probing. Re-verify after every edit.',
  ].join('\n'),
};
