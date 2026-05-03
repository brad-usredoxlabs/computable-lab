/**
 * VerbActionMapRegistry tests — load, lookup-known, lookup-unknown.
 */

import { describe, it, expect } from 'vitest';
import { getVerbActionMap, type VerbMapping } from './VerbActionMapRegistry.js';

describe('VerbActionMapRegistry', () => {
  it('loads and size matches the file (26 verbs)', () => {
    const registry = getVerbActionMap();
    expect(registry.size()).toBe(26);
  });

  it('lookup("incubate") returns a mapping with at least one of exact_id or obi_id', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('incubate');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('incubate');
    const hasOntologyRef = mapping!.exact_id !== undefined || mapping!.obi_id !== undefined;
    expect(hasOntologyRef).toBe(true);
  });

  it('lookup("create_container") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('create_container');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('create_container');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("seed") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('seed');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('seed');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("add_material") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('add_material');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('add_material');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("read") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('read');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('read');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("spin") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('spin');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('spin');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("transfect") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('transfect');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('transfect');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("freeze") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('freeze');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('freeze');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("thaw") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('thaw');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('thaw');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("label") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('label');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('label');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("passage") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('passage');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('passage');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("count") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('count');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('count');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("quench") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('quench');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('quench');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("block") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('block');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('block');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("permeabilize") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('permeabilize');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('permeabilize');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("fix") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('fix');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('fix');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("stain") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('stain');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('stain');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("dilute") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('dilute');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('dilute');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("pellet") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('pellet');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('pellet');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("resuspend") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('resuspend');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('resuspend');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("elute") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('elute');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('elute');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("wash") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('wash');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('wash');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("aliquot") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('aliquot');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('aliquot');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("harvest") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('harvest');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('harvest');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("mix") returns a mapping with at least one of exact_id, obi_id, or notes', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('mix');
    expect(mapping).toBeDefined();
    expect(mapping!.verb).toBe('mix');
    expect(mapping!.exact_id ?? mapping!.obi_id ?? mapping!.notes).toBeDefined();
  });

  it('lookup("unknown_verb") returns undefined', () => {
    const registry = getVerbActionMap();
    const mapping = registry.lookup('unknown_verb');
    expect(mapping).toBeUndefined();
  });

  it('list() returns all 26 mappings', () => {
    const registry = getVerbActionMap();
    const all = registry.list();
    expect(all.length).toBe(26);
    // Verify all verbs are present — matches the registered verb expanders
    const verbs = all.map((m) => m.verb);
    const expectedVerbs = [
      'seed', 'incubate', 'harvest', 'aliquot', 'wash', 'elute',
      'resuspend', 'pellet', 'dilute', 'mix', 'stain', 'fix',
      'permeabilize', 'block', 'quench', 'count', 'passage',
      'freeze', 'thaw', 'spin', 'label', 'transfect',
      'add_material', 'create_container', 'read', 'transfer',
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
