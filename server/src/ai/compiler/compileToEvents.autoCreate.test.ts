/**
 * Unit tests for compileToEvents auto-create labware functionality.
 * 
 * Covers:
 * - Case A: definition kind -> bypass with synthetic id + labwareAdditions using the def id directly
 * - Case B: text kind with a stub lookup returning one hit -> bypass with that recordId
 * - Case C: text kind with a stub lookup returning [] -> bypass: false
 * - Case D: text kind with no lookup dep provided -> bypass: false
 */

import { describe, it, expect } from 'vitest';
import { compileToEvents, type CompileSuccess, type CompileSkip } from './compileToEvents.js';
import type { ParsedIntent } from './parseIntent.js';
import type { ResolvedMention } from '../resolveMentions.js';

describe('compileToEvents - auto-create labware', () => {
  const baseIntent: ParsedIntent = {
    verb: 'add_material',
    volume: { value: 100, unit: 'uL' },
    wells: ['A1'],
    materialRef: {
      kind: 'material-spec' as const,
      id: 'MSP-TEST',
      label: 'Test Material',
    },
    postActions: ['set_source_location'],
    unresolvedSlots: [], // No unresolved slots for bypass
    rawPrompt: 'Add 100uL to well A1',
  };

  const resolvedMentions: ResolvedMention[] = [];

  describe('Case A: definition kind', () => {
    it('should bypass with synthetic labwareId and labwareAdditions using the def id directly', async () => {
      const intent: ParsedIntent = {
        ...baseIntent,
        labwareRef: {
          kind: 'definition' as const,
          id: 'lbw-nest-12-well-reservoir',
          label: 'NEST 12 Well Reservoir 15 mL',
        },
      };

      const result = await compileToEvents(intent, resolvedMentions);

      expect(result.bypass).toBe(true);
      const success = result as CompileSuccess;
      expect(success.events).toHaveLength(1);
      expect(success.events[0]!.details.labwareId).toMatch(/^lwi-compiler-/);
      expect(success.labwareAdditions).toHaveLength(1);
      expect(success.labwareAdditions![0]!.recordId).toBe('lbw-nest-12-well-reservoir');
      expect(success.labwareAdditions![0]!.reason).toContain('compiler auto-create for definition');
    });
  });

  describe('Case B: text kind with lookup hit', () => {
    it('should bypass with the looked-up recordId', async () => {
      const intent: ParsedIntent = {
        ...baseIntent,
        labwareRef: {
          kind: 'text' as const,
          hint: '12-well reservoir',
        },
      };

      const deps = {
        searchLabwareByHint: async (hint: string) => [
          { recordId: 'lbw-12-well-reservoir-seed', title: 'NEST 12 Well Reservoir 15 mL' },
        ],
      };

      const result = await compileToEvents(intent, resolvedMentions, deps);

      expect(result.bypass).toBe(true);
      const success = result as CompileSuccess;
      expect(success.events).toHaveLength(1);
      expect(success.events[0]!.details.labwareId).toMatch(/^lwi-compiler-/);
      expect(success.labwareAdditions).toHaveLength(1);
      expect(success.labwareAdditions![0]!.recordId).toBe('lbw-12-well-reservoir-seed');
      expect(success.labwareAdditions![0]!.reason).toContain('compiler auto-create for hint');
      expect(success.labwareAdditions![0]!.reason).toContain('12-well reservoir');
      expect(success.labwareAdditions![0]!.reason).toContain('NEST 12 Well Reservoir 15 mL');
    });
  });

  describe('Case C: text kind with lookup miss', () => {
    it('should return bypass: false with appropriate reason', async () => {
      const intent: ParsedIntent = {
        ...baseIntent,
        labwareRef: {
          kind: 'text' as const,
          hint: '12-well reservoir',
        },
      };

      const deps = {
        searchLabwareByHint: async (hint: string) => [],
      };

      const result = await compileToEvents(intent, resolvedMentions, deps);

      expect(result.bypass).toBe(false);
      const skip = result as CompileSkip;
      expect(skip.reason).toMatch(/labware not found in record store/);
      expect(skip.reason).toContain('12-well reservoir');
    });
  });

  describe('Case D: text kind with no lookup dep', () => {
    it('should return bypass: false with appropriate reason', async () => {
      const intent: ParsedIntent = {
        ...baseIntent,
        labwareRef: {
          kind: 'text' as const,
          hint: '12-well reservoir',
        },
      };

      const result = await compileToEvents(intent, resolvedMentions, undefined);

      expect(result.bypass).toBe(false);
      const skip = result as CompileSkip;
      expect(skip.reason).toMatch(/no labware lookup available/);
      expect(skip.reason).toContain('12-well reservoir');
    });
  });
});
