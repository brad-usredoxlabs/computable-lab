/**
 * Tests for the Lint Engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLintEngine, LintEngine } from './LintEngine.js';
import type { LintSpec, LintRule, Predicate } from './types.js';

// Helper to create a simple rule
function makeRule(
  id: string,
  assert: Predicate,
  options: Partial<LintRule> = {}
): LintRule {
  return {
    id,
    title: `Rule ${id}`,
    severity: 'error',
    scope: 'record',
    assert,
    message: { template: `Rule ${id} failed` },
    ...options,
  };
}

// Helper to create a spec
function makeSpec(rules: LintRule[]): LintSpec {
  return {
    lintVersion: 1,
    rules,
  };
}

describe('LintEngine', () => {
  let engine: LintEngine;
  
  beforeEach(() => {
    engine = createLintEngine();
  });
  
  describe('spec management', () => {
    it('starts with no specs', () => {
      expect(engine.specCount).toBe(0);
      expect(engine.ruleCount).toBe(0);
    });
    
    it('adds specs and indexes rules', () => {
      const spec = makeSpec([
        makeRule('rule-1', { op: 'exists', path: 'title' }),
        makeRule('rule-2', { op: 'exists', path: 'name' }),
      ]);
      
      engine.addSpec('test-spec', spec);
      
      expect(engine.specCount).toBe(1);
      expect(engine.ruleCount).toBe(2);
    });
    
    it('throws on duplicate rule IDs', () => {
      const spec1 = makeSpec([makeRule('dup-id', { op: 'exists', path: 'a' })]);
      const spec2 = makeSpec([makeRule('dup-id', { op: 'exists', path: 'b' })]);
      
      engine.addSpec('spec1', spec1);
      
      expect(() => engine.addSpec('spec2', spec2)).toThrow(/Duplicate rule ID/);
    });
    
    it('removes specs and rules', () => {
      const spec = makeSpec([makeRule('rule-1', { op: 'exists', path: 'a' })]);
      engine.addSpec('test', spec);
      
      const removed = engine.removeSpec('test');
      
      expect(removed).toBe(true);
      expect(engine.specCount).toBe(0);
      expect(engine.ruleCount).toBe(0);
    });
    
    it('returns false when removing non-existent spec', () => {
      expect(engine.removeSpec('nope')).toBe(false);
    });
    
    it('clears all specs', () => {
      engine.addSpec('a', makeSpec([makeRule('r1', { op: 'exists', path: 'x' })]));
      engine.addSpec('b', makeSpec([makeRule('r2', { op: 'exists', path: 'y' })]));
      
      engine.clear();
      
      expect(engine.specCount).toBe(0);
      expect(engine.ruleCount).toBe(0);
    });
    
    it('gets rule by ID', () => {
      const rule = makeRule('get-me', { op: 'exists', path: 'foo' });
      engine.addSpec('test', makeSpec([rule]));
      
      expect(engine.getRule('get-me')).toBe(rule);
      expect(engine.getRule('unknown')).toBeUndefined();
    });
    
    it('filters rules by schemaId', () => {
      const generic = makeRule('generic', { op: 'exists', path: 'a' });
      const specific = makeRule('specific', { op: 'exists', path: 'b' }, {
        schemaId: 'https://example.com/study.yaml',
      });
      
      engine.addSpec('test', makeSpec([generic, specific]));
      
      // All rules
      expect(engine.getRules().length).toBe(2);
      
      // Filtered to study schema
      const studyRules = engine.getRules('https://example.com/study.yaml');
      expect(studyRules.length).toBe(2); // generic + specific
      
      // Filtered to other schema (only gets generic)
      const otherRules = engine.getRules('https://example.com/other.yaml');
      expect(otherRules.length).toBe(1);
      expect(otherRules[0]?.id).toBe('generic');
    });
  });
  
  describe('predicate evaluation', () => {
    it('passes when exists predicate is true', () => {
      engine.addSpec('test', makeSpec([
        makeRule('has-title', { op: 'exists', path: 'title' }),
      ]));
      
      const result = engine.lint({ title: 'Hello' });
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
    
    it('fails when exists predicate is false', () => {
      engine.addSpec('test', makeSpec([
        makeRule('has-title', { op: 'exists', path: 'title' }),
      ]));
      
      const result = engine.lint({ name: 'No title here' });
      
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.ruleId).toBe('has-title');
    });
    
    it('passes when nonEmpty predicate is true', () => {
      engine.addSpec('test', makeSpec([
        makeRule('non-empty-title', { op: 'nonEmpty', path: 'title' }),
      ]));
      
      const result = engine.lint({ title: 'Content' });
      expect(result.valid).toBe(true);
    });
    
    it('fails when nonEmpty predicate is false', () => {
      engine.addSpec('test', makeSpec([
        makeRule('non-empty-title', { op: 'nonEmpty', path: 'title' }),
      ]));
      
      expect(engine.lint({ title: '' }).valid).toBe(false);
      expect(engine.lint({ title: '   ' }).valid).toBe(false);
      expect(engine.lint({}).valid).toBe(false);
    });
    
    it('evaluates regex predicate', () => {
      engine.addSpec('test', makeSpec([
        makeRule('valid-id', { op: 'regex', path: 'id', pattern: '^STU-\\d+$' }),
      ]));
      
      expect(engine.lint({ id: 'STU-12345' }).valid).toBe(true);
      expect(engine.lint({ id: 'INVALID' }).valid).toBe(false);
    });
    
    it('evaluates equals predicate', () => {
      engine.addSpec('test', makeSpec([
        makeRule('is-study', { op: 'equals', path: 'kind', value: 'study' }),
      ]));
      
      expect(engine.lint({ kind: 'study' }).valid).toBe(true);
      expect(engine.lint({ kind: 'material' }).valid).toBe(false);
    });
    
    it('evaluates in predicate', () => {
      engine.addSpec('test', makeSpec([
        makeRule('valid-status', { 
          op: 'in', 
          path: 'status', 
          values: ['draft', 'published', 'archived']
        }),
      ]));
      
      expect(engine.lint({ status: 'draft' }).valid).toBe(true);
      expect(engine.lint({ status: 'pending' }).valid).toBe(false);
    });
    
    it('evaluates all predicate (AND)', () => {
      engine.addSpec('test', makeSpec([
        makeRule('both', {
          op: 'all',
          predicates: [
            { op: 'exists', path: 'a' },
            { op: 'exists', path: 'b' },
          ],
        }),
      ]));
      
      expect(engine.lint({ a: 1, b: 2 }).valid).toBe(true);
      expect(engine.lint({ a: 1 }).valid).toBe(false);
      expect(engine.lint({ b: 2 }).valid).toBe(false);
    });
    
    it('evaluates any predicate (OR)', () => {
      engine.addSpec('test', makeSpec([
        makeRule('either', {
          op: 'any',
          predicates: [
            { op: 'exists', path: 'email' },
            { op: 'exists', path: 'phone' },
          ],
        }),
      ]));
      
      expect(engine.lint({ email: 'x@y.com' }).valid).toBe(true);
      expect(engine.lint({ phone: '123' }).valid).toBe(true);
      expect(engine.lint({ email: 'x', phone: '1' }).valid).toBe(true);
      expect(engine.lint({}).valid).toBe(false);
    });
    
    it('evaluates not predicate', () => {
      engine.addSpec('test', makeSpec([
        makeRule('not-archived', {
          op: 'not',
          not: { op: 'equals', path: 'status', value: 'archived' },
        }),
      ]));
      
      expect(engine.lint({ status: 'active' }).valid).toBe(true);
      expect(engine.lint({ status: 'archived' }).valid).toBe(false);
    });
  });
  
  describe('when conditions', () => {
    it('skips rule when condition is not met', () => {
      engine.addSpec('test', makeSpec([
        makeRule('study-has-pi', { op: 'nonEmpty', path: 'pi' }, {
          when: { op: 'equals', path: 'kind', value: 'study' },
        }),
      ]));
      
      // Rule is skipped for non-study
      const result1 = engine.lint({ kind: 'material' });
      expect(result1.valid).toBe(true);
      expect(result1.summary?.skipped).toBe(1);
      
      // Rule applies to study
      const result2 = engine.lint({ kind: 'study', pi: 'Dr. Smith' });
      expect(result2.valid).toBe(true);
      expect(result2.summary?.passed).toBe(1);
      
      // Rule fails for study without PI
      const result3 = engine.lint({ kind: 'study' });
      expect(result3.valid).toBe(false);
    });
  });
  
  describe('dependencies', () => {
    it('evaluates rules in dependency order', () => {
      engine.addSpec('test', makeSpec([
        makeRule('child', { op: 'nonEmpty', path: 'detail' }, {
          dependsOn: ['parent'],
        }),
        makeRule('parent', { op: 'exists', path: 'main' }),
      ]));
      
      // Both should pass
      const result1 = engine.lint({ main: 'x', detail: 'y' });
      expect(result1.valid).toBe(true);
      expect(result1.summary?.passed).toBe(2);
    });
    
    it('skips dependent rules when dependency fails', () => {
      engine.addSpec('test', makeSpec([
        makeRule('child', { op: 'nonEmpty', path: 'detail' }, {
          dependsOn: ['parent'],
        }),
        makeRule('parent', { op: 'exists', path: 'main' }),
      ]));
      
      // Parent fails, child is skipped
      const result = engine.lint({ detail: 'y' });
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]?.ruleId).toBe('parent');
      expect(result.summary?.skipped).toBe(1);
    });
    
    it('detects circular dependencies', () => {
      engine.addSpec('test', makeSpec([
        makeRule('a', { op: 'exists', path: 'x' }, { dependsOn: ['b'] }),
        makeRule('b', { op: 'exists', path: 'y' }, { dependsOn: ['a'] }),
      ]));
      
      expect(() => engine.lint({ x: 1, y: 2 })).toThrow(/[Cc]ircular/);
    });
  });
  
  describe('severity', () => {
    it('tracks errors, warnings, and info separately', () => {
      engine.addSpec('test', makeSpec([
        makeRule('err', { op: 'exists', path: 'err' }, { severity: 'error' }),
        makeRule('warn', { op: 'exists', path: 'warn' }, { severity: 'warning' }),
        makeRule('info', { op: 'exists', path: 'info' }, { severity: 'info' }),
      ]));
      
      const result = engine.lint({});
      
      expect(result.valid).toBe(false); // errors make it invalid
      expect(result.summary?.errors).toBe(1);
      expect(result.summary?.warnings).toBe(1);
      expect(result.summary?.info).toBe(1);
    });
    
    it('is valid if only warnings/info', () => {
      engine.addSpec('test', makeSpec([
        makeRule('warn', { op: 'exists', path: 'x' }, { severity: 'warning' }),
        makeRule('info', { op: 'exists', path: 'y' }, { severity: 'info' }),
      ]));
      
      const result = engine.lint({});
      
      expect(result.valid).toBe(true); // no errors
      expect(result.violations.length).toBe(2);
    });
  });
  
  describe('message interpolation', () => {
    it('interpolates paths in message template', () => {
      engine.addSpec('test', makeSpec([
        makeRule('named', { op: 'exists', path: 'missing' }, {
          message: { 
            template: 'Record {{id}} is missing field at {{missing}}',
            paths: ['id', 'missing'],
          },
        }),
      ]));
      
      const result = engine.lint({ id: 'REC-001' });
      
      expect(result.violations[0]?.message).toContain('REC-001');
    });
  });
  
  describe('stopOnFirstError option', () => {
    it('stops after first error when enabled', () => {
      engine = createLintEngine({ stopOnFirstError: true });
      engine.addSpec('test', makeSpec([
        makeRule('first', { op: 'exists', path: 'a' }),
        makeRule('second', { op: 'exists', path: 'b' }),
        makeRule('third', { op: 'exists', path: 'c' }),
      ]));
      
      const result = engine.lint({});
      
      // Should stop after first failure
      expect(result.violations.length).toBe(1);
    });
  });
});
