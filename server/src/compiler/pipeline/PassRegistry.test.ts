/**
 * Tests for PassRegistry.
 */

import { describe, expect, it } from 'vitest';
import { PassRegistry } from './PassRegistry.js';
import type { Pass, PassRunArgs, PassResult, PassFamily } from './types.js';

// Helper to create a mock pass for testing
function createMockPass(id: string, family: PassFamily = 'parse'): Pass {
  return {
    id,
    family,
    run(_args: PassRunArgs): PassResult {
      return { ok: true };
    },
  };
}

describe('PassRegistry', () => {
  it('should register and retrieve a pass by id', () => {
    const registry = new PassRegistry();
    const pass = createMockPass('test-pass-1', 'parse');

    registry.register(pass);

    const retrieved = registry.get('test-pass-1');
    expect(retrieved).toBe(pass);
    expect(retrieved?.id).toBe('test-pass-1');
    expect(retrieved?.family).toBe('parse');
  });

  it('should throw when registering a duplicate pass id', () => {
    const registry = new PassRegistry();
    const pass1 = createMockPass('duplicate-id', 'normalize');
    const pass2 = createMockPass('duplicate-id', 'validate');

    registry.register(pass1);

    expect(() => registry.register(pass2)).toThrow("Pass 'duplicate-id' already registered");
  });

  it('should return true for has() after register, false for unknown id', () => {
    const registry = new PassRegistry();
    const pass = createMockPass('known-pass', 'disambiguate');

    expect(registry.has('known-pass')).toBe(false);

    registry.register(pass);

    expect(registry.has('known-pass')).toBe(true);
    expect(registry.has('unknown-pass')).toBe(false);
  });

  it('should return all registered passes in list()', () => {
    const registry = new PassRegistry();
    const pass1 = createMockPass('pass-a', 'parse');
    const pass2 = createMockPass('pass-b', 'normalize');
    const pass3 = createMockPass('pass-c', 'derive_context');

    registry.register(pass1);
    registry.register(pass2);
    registry.register(pass3);

    const listed = registry.list();

    expect(listed).toHaveLength(3);
    const ids = listed.map((p) => p.id);
    expect(ids).toContain('pass-a');
    expect(ids).toContain('pass-b');
    expect(ids).toContain('pass-c');
  });

  it('should support different pass families', () => {
    const registry = new PassRegistry();

    const parsePass = createMockPass('parse-pass', 'parse');
    const normalizePass = createMockPass('normalize-pass', 'normalize');
    const disambiguatePass = createMockPass('disambiguate-pass', 'disambiguate');
    const validatePass = createMockPass('validate-pass', 'validate');
    const deriveContextPass = createMockPass('derive-context-pass', 'derive_context');
    const expandPass = createMockPass('expand-pass', 'expand');
    const projectPass = createMockPass('project-pass', 'project');

    registry.register(parsePass);
    registry.register(normalizePass);
    registry.register(disambiguatePass);
    registry.register(validatePass);
    registry.register(deriveContextPass);
    registry.register(expandPass);
    registry.register(projectPass);

    const listed = registry.list();
    expect(listed).toHaveLength(7);

    // Verify each family is represented
    const families = listed.map((p) => p.family);
    expect(families).toContain('parse');
    expect(families).toContain('normalize');
    expect(families).toContain('disambiguate');
    expect(families).toContain('validate');
    expect(families).toContain('derive_context');
    expect(families).toContain('expand');
    expect(families).toContain('project');
  });
});
