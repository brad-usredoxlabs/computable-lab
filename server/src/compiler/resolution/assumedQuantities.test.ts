/**
 * L2-CLARIFY-TARGET-1 (Change 1) RED — the assumed-value policy is DATA.
 *
 * The policy home is `config/drafting/shorthand-drafting.yaml` `assumedValues:`
 * (appended after `blobDetectPatterns`): the ONLY place the number `100` (and
 * its unit) lives. The loader `assumedQuantities.ts` is a per-call reader +
 * exact (verb, argument) lookup with zero verb/argument/unit literals — the
 * nounShape.ts idiom (path constant :29, loader :52-109, throw idioms
 * :59/:65/:74).
 *
 * RED (today): the loader module does not exist; the section is absent from
 * the config; a present-but-malformed declaration must throw naming the path.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assumedQuantityFor,
  assumedWellsFor,
  loadAssumedQuantities,
  type AssumedValuesPolicy,
} from './assumedQuantities.js';
import { defaultScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';

const REAL_POLICY_URL = new URL('../../../../config/drafting/shorthand-drafting.yaml', import.meta.url);

const POLICY = `surfaces: [run-workspace, event-editor]
nounShape:
  mintRefusePatterns: ['^\\\\s*the .+ (is|was)']
assumedValues:
  quantities:
    - verb: add_material
      argument: volumeUl
      label: volume
      value: 100
      unit: uL
      source: 'shorthand drafting example (server/src/ai/submitSuggestionTool.ts:645)'
      question: 'How much {label}? The prompt states none — {value} {unit} is assumed; approve it or enter the amount.'
  wells:
    - verb: add_material
      argument: targetWells
      question: 'Which wells? Name a range (A2:B3) or pick wells on the deck.'
`;

function writeTmp(content: string, name = 'assumed-t1.yaml'): string {
  const dir = mkdtempSync(join(tmpdir(), 't1-assumed-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

function emptyPolicy(): AssumedValuesPolicy {
  return { quantities: [], wells: [] };
}

describe('loadAssumedQuantities (L2-CLARIFY-TARGET-1 Change 1)', () => {
  it('returns the declared quantity entry and the wells question', () => {
    const path = writeTmp(POLICY);
    const policy = loadAssumedQuantities(path);
    const quantity = assumedQuantityFor('add_material', 'volumeUl', policy);
    expect(quantity).not.toBeNull();
    expect(quantity!.label).toBe('volume');
    expect(quantity!.value).toBe(100);
    expect(quantity!.unit).toBe('uL');
    expect(typeof quantity!.source).toBe('string');
    expect(quantity!.source.length).toBeGreaterThan(0);
    expect(quantity!.question).toContain('{value}');
    expect(quantity!.question).toContain('{unit}');
    const wells = assumedWellsFor('add_material', 'targetWells', policy);
    expect(wells?.question).toBe('Which wells? Name a range (A2:B3) or pick wells on the deck.');
  });

  it('absent file or absent section ⇒ empty policy (no assumption offered anywhere)', () => {
    expect(loadAssumedQuantities('/nonexistent/t1-assumed.yaml')).toEqual(emptyPolicy());
    const path = writeTmp('surfaces: [run-workspace, event-editor]\n');
    expect(loadAssumedQuantities(path)).toEqual(emptyPolicy());
  });

  it('present-but-malformed entry throws naming the path and the offending field', () => {
    const path = writeTmp(POLICY.replace('value: 100', 'value: -5'), 'bad-t1-path.yaml');
    expect(() => loadAssumedQuantities(path)).toThrow(/value/);
    expect(() => loadAssumedQuantities(path)).toThrow(/bad-t1-path/);
  });

  it('data⇄vocabulary lint: every declared (verb, argument) is an argContracts entry of the declared kind', () => {
    const vocabulary = defaultScientistIntentVocabulary();
    const policy = loadAssumedQuantities(REAL_POLICY_URL);
    expect(policy.quantities.length, 'the real policy declares at least one quantity').toBeGreaterThan(0);
    for (const entry of policy.quantities) {
      const contract = vocabulary.argContracts(entry.verb).find((c) => c.name === entry.argument);
      expect(contract, `quantities declaration (${entry.verb}.${entry.argument}) must be a declared arg`).toBeDefined();
      expect(contract!.kind, 'quantities declaration kind').toBe('quantity');
    }
    for (const entry of policy.wells) {
      const contract = vocabulary.argContracts(entry.verb).find((c) => c.name === entry.argument);
      expect(contract, `wells declaration (${entry.verb}.${entry.argument}) must be a declared arg`).toBeDefined();
      expect(contract!.kind, 'wells declaration kind').toBe('wells');
    }
  });

  it('the few-shot example no longer carries the assumed volume (R1.3(B): the number is not smuggled to the model)', () => {
    // R1.3(B) neutralised the smuggling source: the frozen few-shot example
    // (submitSuggestionTool.ts) no longer hands the model the assumed number
    // (`volumeUl: 100`). The model had been COPYING it into its documents, so the
    // declared-required sweep saw the slot "present" and stayed silent (the chip
    // missed 6/10). The number's ONE home is now the declared data policy.
    const example = readFileSync(new URL('../../ai/submitSuggestionTool.ts', import.meta.url), 'utf8');
    expect(example, 'the few-shot example must not carry a volumeUl number (the smuggling source)').not.toMatch(/volumeUl:\s*\d/);
    const policy = loadAssumedQuantities(REAL_POLICY_URL);
    const entry = assumedQuantityFor('add_material', 'volumeUl', policy);
    expect(entry, 'the (add_material, volumeUl) declaration must exist in the DATA').not.toBeNull();
    expect(entry!.value).toBe(100);
  });

  it('the loader source carries zero verb/argument/unit literals (the grep gate)', () => {
    const source = readFileSync(new URL('./assumedQuantities.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bvolumeUl\b|\btargetWells\b/);
    expect(source).not.toMatch(/\b100\b/);
    expect(source).not.toMatch(/['\`]uL['\`]/);
  });
});
