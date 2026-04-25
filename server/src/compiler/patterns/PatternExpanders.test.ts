/**
 * Tests for PatternExpanders registry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPatternExpander,
  getPatternExpander,
  clearPatternExpanders,
} from './PatternExpanders.js';
import type { PatternEvent } from '../pipeline/passes/ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../registry/StampPatternRegistry.js';
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { PatternExpanderContext } from './PatternExpanders.js';

describe('PatternExpanders', () => {
  beforeEach(() => {
    clearPatternExpanders();
  });

  it('should register and retrieve a pattern expander', () => {
    const fakeExpander = {
      expand: (_event: PatternEvent, _spec: StampPatternSpec, _ctx: PatternExpanderContext): PlateEventPrimitive[] => [],
    };
    registerPatternExpander('test-pattern', fakeExpander);
    const retrieved = getPatternExpander('test-pattern');
    expect(retrieved).toBe(fakeExpander);
  });

  it('should return undefined for unregistered pattern', () => {
    const retrieved = getPatternExpander('nonexistent');
    expect(retrieved).toBeUndefined();
  });

  it('should allow overwriting a registered expander', () => {
    const expander1 = {
      expand: (): PlateEventPrimitive[] => [{ eventId: 'a', event_type: 'transfer', details: {} }],
    };
    const expander2 = {
      expand: (): PlateEventPrimitive[] => [{ eventId: 'b', event_type: 'transfer', details: {} }],
    };
    registerPatternExpander('test-pattern', expander1);
    registerPatternExpander('test-pattern', expander2);
    const retrieved = getPatternExpander('test-pattern');
    expect(retrieved).toBe(expander2);
  });

  it('should clear all registered expanders', () => {
    registerPatternExpander('test-pattern', {
      expand: (): PlateEventPrimitive[] => [],
    });
    clearPatternExpanders();
    const retrieved = getPatternExpander('test-pattern');
    expect(retrieved).toBeUndefined();
  });

  it('should isolate expanders between tests via clearPatternExpanders', () => {
    // Simulate test isolation: register in "previous test", clear, verify clean
    registerPatternExpander('isolation-test', {
      expand: (): PlateEventPrimitive[] => [],
    });
    clearPatternExpanders();
    expect(getPatternExpander('isolation-test')).toBeUndefined();
  });
});
