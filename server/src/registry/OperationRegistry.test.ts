import { describe, it, expect } from 'vitest';
import { getOperationRegistry } from './OperationRegistry.js';

describe('OperationRegistry', () => {
  const registry = getOperationRegistry();

  describe('alias lookup', () => {
    it('shake → mix', () => {
      const op = registry.lookup('shake');
      expect(op).toBeDefined();
      expect(op?.id).toBe('mix');
    });

    it('agitate → mix', () => {
      const op = registry.lookup('agitate');
      expect(op).toBeDefined();
      expect(op?.id).toBe('mix');
    });

    it('spin → centrifuge', () => {
      const op = registry.lookup('spin');
      expect(op).toBeDefined();
      expect(op?.id).toBe('centrifuge');
    });

    it('heat → incubate', () => {
      const op = registry.lookup('heat');
      expect(op).toBeDefined();
      expect(op?.id).toBe('incubate');
    });

    it('vortex → mix', () => {
      const op = registry.lookup('vortex');
      expect(op).toBeDefined();
      expect(op?.id).toBe('mix');
    });
  });

  describe('canonical id lookup', () => {
    it('looks up by canonical id', () => {
      const op = registry.lookup('mix');
      expect(op).toBeDefined();
      expect(op?.id).toBe('mix');
      expect(op?.primitive).toBe('mix');
    });
  });

  describe('expands_to', () => {
    it('wash has expandsTo: add_material, transfer', () => {
      const op = registry.lookup('wash');
      expect(op).toBeDefined();
      expect(op?.primitive).toBeNull();
      expect(op?.expands_to).toEqual(['add_material', 'transfer']);
    });
  });

  describe('unknown verbs', () => {
    it('returns undefined for unknown verb', () => {
      const op = registry.lookup('xyz_unknown_verb');
      expect(op).toBeUndefined();
    });
  });

  describe('listPrimitives', () => {
    it('returns 9 primitive operations', () => {
      const primitives = registry.listPrimitives();
      expect(primitives.length).toBe(9);
      const ids = primitives.map((p) => p.id).sort();
      expect(ids).toEqual([
        'add_material',
        'centrifuge',
        'create_container',
        'incubate',
        'load_plate',
        'mix',
        'read',
        'set_well_contents',
        'transfer',
      ]);
    });
  });

  describe('listAll', () => {
    it('returns all operations', () => {
      const all = registry.listAll();
      expect(all.length).toBeGreaterThan(9);
    });
  });
});
