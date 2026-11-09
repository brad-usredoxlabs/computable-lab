/**
 * SHORTHAND-COMP-2 Task 10a (RED-first): the vocabulary must expose a
 * GENERATED contract block — every verb with its declared args, built from
 * the vocabulary YAML. No hand-written verb list anywhere (bait 1): the
 * assertions iterate vocab.verbs()/toolActionEnum()/argContracts(), never
 * typed-out verb names.
 */
import { describe, expect, it } from 'vitest';
import { defaultScientistIntentVocabulary, formatArgDomain } from './vocabulary.js';

describe('vocabulary contract block', () => {
  it('lists every verb with its declared args', () => {
    const vocab = defaultScientistIntentVocabulary();
    const block = vocab.contractBlock();
    for (const verb of vocab.verbs()) expect(block).toContain(`- ${verb}`);
    expect(block).toContain('add_material — source?');
    expect(block).toContain('volumeUl?:quantity');
    // L2-CLARIFY-TARGET-1 (Change 4): the add_material line is the EXACT post-flip
    // string — volumeUl is now required (no `?`) and targetWells:wells is appended
    // after composition. One line changed; the teaching line is untouched (OQ1
    // ruling: data-driven contract-block delta). Any OTHER diff is a defect.
    expect(block).toContain(
      '- add_material — source?:resolvable(labware), target?:resolvable(labware), labware?:resolvable(labware), material?:resolvable(material), source_name?:scalar, volumeUl:quantity, volume?:quantity, composition?:resolvable(material), targetWells:wells',
    );
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
        .map((a) => `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${formatArgDomain(a.domain)})` : ''}`)
        .join(', ');
      const line = block.split('\n').find((l) => l.startsWith(`- ${verb}`))!;
      expect(line).toBe(expectedArgs ? `- ${verb} — ${expectedArgs}` : `- ${verb}`);
    }
  });

  // L2-LABSTATE-CONTENTS-1 FIX RUN 4 (ruling LABSTATE-DRIVEBAR-l2t1125
  // "PRODUCT DEFECTS" item 1): the producer-side container-carry teaching
  // is DATA on add_material.labware (the live sampler's labware-less
  // add_material drafting gap) and the GENERIC contractBlock render keys off
  // the field's presence. Pin: the line is present, renders byte-identical
  // to the declared data, and never re-lists a token literal (the
  // meta-schema constraint, schema.yaml ~:187 — one authority for the
  // token value).
  it('FIX4: add_material.labware declares a teaching string that contractBlock renders (presence + byte-parity + no token re-list)', () => {
    const vocab = defaultScientistIntentVocabulary();
    const args = vocab.argContracts('add_material');
    const labware = args.find((a) => a.name === 'labware');
    expect(labware, 'add_material declares the labware arg').toBeDefined();
    expect(typeof labware!.teaching, 'add_material.labware declares teaching (the DATA home)').toBe('string');
    const teaching = labware!.teaching!;
    expect(teaching.length).toBeGreaterThan(0);
    // The renderer composes `  <argName>: <teaching>` under the verb line.
    const block = vocab.contractBlock();
    const rendered = block
      .split('\n')
      .find((l) => l.startsWith('  ') && l.slice(2).startsWith('labware: '));
    expect(rendered, 'the indented teaching line renders in contractBlock').toBe(`  labware: ${teaching}`);
    // Meta-schema constraint honored at the data level: the teaching states
    // the carry/omit contract only and never re-lists any declared token
    // literal (the token value stays single-homed in wellsetValueTokens).
    for (const token of vocab.wellsetValueTokens()) {
      expect(teaching).not.toContain(token);
    }
  });
});
