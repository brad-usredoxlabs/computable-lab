/**
 * VerbActionMapRegistry tests — load, lookup-known, lookup-unknown.
 */

import { describe, it, expect } from 'vitest';
import { getVerbActionMap, type VerbMapping } from './VerbActionMapRegistry.js';

describe('VerbActionMapRegistry', () => {
  it('loads and size matches the file (25 verbs)', () => {
    const registry = getVerbActionMap();
    expect(registry.size()).toBe(25);
  });

  it('lookup("incubate") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('incubate');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('incubate');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("create_container") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('create_container');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('create_container');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("seed") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('seed');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('seed');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("add_material") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('add_material');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('add_material');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("read") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('read');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('read');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("spin") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('spin');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('spin');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("transfect") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('transfect');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('transfect');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("freeze") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('freeze');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('freeze');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("thaw") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('thaw');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('thaw');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("label") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('label');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('label');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("passage") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('passage');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('passage');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("count") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('count');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('count');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("quench") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('quench');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('quench');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("block") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('block');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('block');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("permeabilize") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('permeabilize');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('permeabilize');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("fix") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('fix');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('fix');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("stain") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('stain');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('stain');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("dilute") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('dilute');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('dilute');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("pellet") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('pellet');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('pellet');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("resuspend") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('resuspend');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('resuspend');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("elute") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('elute');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('elute');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("wash") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('wash');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('wash');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("aliquot") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('aliquot');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('aliquot');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("harvest") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('harvest');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('harvest');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("mix") returns a mapping with notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('mix');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('mix');
    expect(mapping!.notes).toBeDefined();
  });

  it('lookup("unknown_verb") returns undefined', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('unknown_verb');
    expect(mapping).toBeUndefined();
  });

  it('list() returns all 25 mappings', () => {
    const registry = getVerbActionMap();
    const all = registry.list();
    expect(all.length).toBe(25);
    // Verify all verbs are present — matches the 25 registered verb expanders
    const verbs = all.map((m) => m.verb);
    const expectedVerbs = [
      'seed', 'incubate', 'harvest', 'aliquot', 'wash', 'elute',
      'resuspend', 'pellet', 'dilute', 'mix', 'stain', 'fix',
      'permeabilize', 'block', 'quench', 'count', 'passage',
      'freeze', 'thaw', 'spin', 'label', 'transfect',
      'add_material', 'create_container', 'read',
    ];
    for (const v of expectedVerbs) {
      expect(verbs).toContain(v);
    }
  });

  it('every mapping has at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    for (const m of registry.list()) {
      expect(m.exact_id ?? m.obi_id ?? m.notes).toBeDefined();
    }
  });
});
