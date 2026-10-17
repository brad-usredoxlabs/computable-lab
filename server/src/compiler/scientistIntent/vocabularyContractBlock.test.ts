/**
 * SHORTHAND-COMP-2 Task 10a (RED-first): the vocabulary must expose a
 * GENERATED contract block — every verb with its declared args, built from
 * the vocabulary YAML. No hand-written verb list anywhere (bait 1): the
 * assertions iterate vocab.verbs()/toolActionEnum()/argContracts(), never
 * typed-out verb names.
 */
import { describe, expect, it } from 'vitest';
import { defaultScientistIntentVocabulary } from './vocabulary.js';

describe('vocabulary contract block', () => {
  it('lists every verb with its declared args', () => {
    const vocab = defaultScientistIntentVocabulary();
    const block = vocab.contractBlock();
    for (const verb of vocab.verbs()) expect(block).toContain(`- ${verb}`);
    expect(block).toContain('add_material — source?');
    expect(block).toContain('volumeUl?:quantity');
    // The block is generated, so it can never disagree with the enum the parser injects.
    expect(vocab.toolActionEnum().every((v) => block.includes(`- ${v}`))).toBe(true);
  });

  it('set-equality BOTH directions: block verbs == toolActionEnum (bait 1: SET DIFFS, never lengths)', () => {
    const vocab = defaultScientistIntentVocabulary();
    const blockVerbs = new Set(
      vocab.contractBlock()
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).split(' — ')[0]!.trim()),
    );
    const enumVerbs = new Set(vocab.toolActionEnum());
    expect([...blockVerbs].filter((v) => !enumVerbs.has(v))).toEqual([]);
    expect([...enumVerbs].filter((v) => !blockVerbs.has(v))).toEqual([]);
    expect(blockVerbs.size).toBe(new Set(vocab.verbs()).size);
  });

  it('per-verb args mirror argContracts exactly (name??:kind(domain))', () => {
    const vocab = defaultScientistIntentVocabulary();
    const block = vocab.contractBlock();
    for (const verb of vocab.verbs()) {
      const expectedArgs = vocab.argContracts(verb)
        .map((a) => `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${a.domain})` : ''}`)
        .join(', ');
      const line = block.split('\n').find((l) => l.startsWith(`- ${verb}`))!;
      expect(line).toBe(expectedArgs ? `- ${verb} — ${expectedArgs}` : `- ${verb}`);
    }
  });
});
