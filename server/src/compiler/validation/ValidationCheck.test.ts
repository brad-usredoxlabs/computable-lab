/**
 * Tests for the ValidationCheck registry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerValidationCheck,
  getValidationChecks,
  clearValidationChecks,
  type ValidationCheck,
} from './ValidationCheck.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeCheck(id: string, category: string, findings: unknown[]): ValidationCheck {
  return { id, category, run: () => findings as never };
}

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('ValidationCheck registry', () => {
  beforeEach(() => {
    clearValidationChecks();
  });

  it('starts empty', () => {
    expect(getValidationChecks()).toHaveLength(0);
  });

  it('register adds a check and getValidationChecks returns it', () => {
    const check = makeFakeCheck('test-check', 'test-category', []);
    registerValidationCheck(check);
    const all = getValidationChecks();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('test-check');
    expect(all[0]!.category).toBe('test-category');
  });

  it('register with duplicate id overwrites', () => {
    const check1 = makeFakeCheck('dup', 'cat1', []);
    const check2 = makeFakeCheck('dup', 'cat2', []);
    registerValidationCheck(check1);
    registerValidationCheck(check2);
    expect(getValidationChecks()).toHaveLength(1);
    expect(getValidationChecks()[0]!.category).toBe('cat2');
  });

  it('clearValidationChecks empties the registry', () => {
    registerValidationCheck(makeFakeCheck('a', 'cat', []));
    expect(getValidationChecks()).toHaveLength(1);
    clearValidationChecks();
    expect(getValidationChecks()).toHaveLength(0);
  });
});
