/**
 * Unit tests for the deterministic intent parser.
 */

import { describe, it, expect } from 'vitest';
import { parseIntent, type ParsedIntent } from './parseIntent.js';
import type { ResolvedMention } from '../resolveMentions.js';

describe('parseIntent', () => {
  describe('Case 1 — Golden', () => {
    it('should correctly parse the golden add_material prompt', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]] to well A1 of a 12-well reservoir and add it to the source location.';
      
      const resolvedMentions: ResolvedMention[] = [
        {
          raw: '[[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]]',
          kind: 'material-spec',
          id: 'MSP-MMIITWMZ-93SU5Y',
          label: 'Clofibrate, 1 mM in DMSO',
          resolved: { name: 'Clofibrate', concentration: '1 mM', solvent: 'DMSO' },
        },
      ];

      const result = parseIntent(prompt, resolvedMentions);

      expect(result.verb).toBe('add_material');
      expect(result.volume).toEqual({ value: 100, unit: 'uL' });
      expect(result.wells).toEqual(['A1']);
      expect(result.materialRef).toEqual({
        kind: 'material-spec',
        id: 'MSP-MMIITWMZ-93SU5Y',
        label: 'Clofibrate, 1 mM in DMSO',
      });
      expect(result.labwareRef).toEqual({
        kind: 'text',
        hint: '12-well reservoir',
      });
      expect(result.postActions).toContain('set_source_location');
      expect(result.unresolvedSlots).not.toContain('labware');
      expect(result.unresolvedSlots).toContain('labwareInstance');
      expect(result.rawPrompt).toBe(prompt);
    });
  });

  describe('Case 2 — Missing volume', () => {
    it('should return unresolvedSlots containing volume when no volume is specified', () => {
      const prompt = 'Add [[material-spec:MSP-X|foo]] to A1';
      
      const resolvedMentions: ResolvedMention[] = [
        {
          raw: '[[material-spec:MSP-X|foo]]',
          kind: 'material-spec',
          id: 'MSP-X',
          label: 'foo',
          resolved: { name: 'foo' },
        },
      ];

      const result = parseIntent(prompt, resolvedMentions);

      expect(result.verb).toBe('add_material');
      expect(result.volume).toBeUndefined();
      expect(result.wells).toEqual(['A1']);
      expect(result.materialRef).toEqual({
        kind: 'material-spec',
        id: 'MSP-X',
        label: 'foo',
      });
      expect(result.unresolvedSlots).toContain('volume');
    });
  });

  describe('Case 3 — Missing wells', () => {
    it('should return unresolvedSlots containing wells when no well is specified', () => {
      const prompt = 'Add 50uL of [[material-spec:MSP-X|foo]] to the reservoir';
      
      const resolvedMentions: ResolvedMention[] = [
        {
          raw: '[[material-spec:MSP-X|foo]]',
          kind: 'material-spec',
          id: 'MSP-X',
          label: 'foo',
          resolved: { name: 'foo' },
        },
      ];

      const result = parseIntent(prompt, resolvedMentions);

      expect(result.verb).toBe('add_material');
      expect(result.volume).toEqual({ value: 50, unit: 'uL' });
      expect(result.wells).toBeUndefined();
      expect(result.materialRef).toEqual({
        kind: 'material-spec',
        id: 'MSP-X',
        label: 'foo',
      });
      expect(result.unresolvedSlots).toContain('wells');
    });
  });

  describe('Case 4 — Only material, no labware mention', () => {
    it('should return unresolvedSlots containing labware when no labware hint is present', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-X|foo]] to A1';
      
      const resolvedMentions: ResolvedMention[] = [
        {
          raw: '[[material-spec:MSP-X|foo]]',
          kind: 'material-spec',
          id: 'MSP-X',
          label: 'foo',
          resolved: { name: 'foo' },
        },
      ];

      const result = parseIntent(prompt, resolvedMentions);

      expect(result.verb).toBe('add_material');
      expect(result.volume).toEqual({ value: 100, unit: 'uL' });
      expect(result.wells).toEqual(['A1']);
      expect(result.materialRef).toEqual({
        kind: 'material-spec',
        id: 'MSP-X',
        label: 'foo',
      });
      expect(result.labwareRef).toBeUndefined();
      expect(result.unresolvedSlots).toContain('labware');
      expect(result.unresolvedSlots).not.toContain('labwareInstance');
    });
  });

  describe('Case 5 — Non-add-material prompt', () => {
    it('should return verb=unknown and empty unresolvedSlots for non-add-material prompts', () => {
      const prompt = 'what is a plate map?';
      
      const resolvedMentions: ResolvedMention[] = [];

      const result = parseIntent(prompt, resolvedMentions);

      expect(result.verb).toBe('unknown');
      expect(result.unresolvedSlots).toEqual([]);
      expect(result.volume).toBeUndefined();
      expect(result.wells).toBeUndefined();
      expect(result.materialRef).toBeUndefined();
      expect(result.labwareRef).toBeUndefined();
      expect(result.postActions).toEqual([]);
    });
  });

  describe('Additional edge cases', () => {
    it('should handle µL and ul unit variations', () => {
      const prompt = 'Add 50µL of [[material-spec:MSP-X|foo]] to A1';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.volume).toEqual({ value: 50, unit: 'uL' });
    });

    it('should handle mL unit', () => {
      const prompt = 'Add 2.5mL of [[material-spec:MSP-X|foo]] to A1';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.volume).toEqual({ value: 2.5, unit: 'mL' });
    });

    it('should handle multiple wells and deduplicate', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-X|foo]] to A1 and A1 and B2';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.wells).toEqual(['A1', 'B2']);
    });

    it('should detect dispense and pipette verbs', () => {
      const prompt1 = 'Dispense 100uL of [[material-spec:MSP-X|foo]] to A1';
      const prompt2 = 'Pipette 100uL of [[material-spec:MSP-X|foo]] to A1';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      expect(parseIntent(prompt1, resolvedMentions).verb).toBe('add_material');
      expect(parseIntent(prompt2, resolvedMentions).verb).toBe('add_material');
    });

    it('should detect transfer in verb but not plain transfer', () => {
      const prompt1 = 'Transfer in 100uL of [[material-spec:MSP-X|foo]] to A1';
      const prompt2 = 'Transfer [[material-spec:MSP-X|foo]] to A1';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      expect(parseIntent(prompt1, resolvedMentions).verb).toBe('add_material');
      expect(parseIntent(prompt2, resolvedMentions).verb).toBe('unknown');
    });

    it('should handle labware definition mentions', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-X|foo]] to [[labware:def:96-well-plate|96-well plate]]';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
        { raw: '[[labware:def:96-well-plate|96-well plate]]', kind: 'labware', id: 'def:96-well-plate', label: '96-well plate' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.labwareRef).toEqual({ kind: 'definition', id: '96-well-plate', label: '96-well plate' });
      expect(result.unresolvedSlots).toContain('labwareInstance');
    });

    it('should handle labware instance mentions', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-X|foo]] to [[labware:lw-123|My Plate]]';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
        { raw: '[[labware:lw-123|My Plate]]', kind: 'labware', id: 'lw-123', label: 'My Plate' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.labwareRef).toEqual({ kind: 'instance', id: 'lw-123', label: 'My Plate' });
      expect(result.unresolvedSlots).not.toContain('labwareInstance');
    });

    it('should detect set as source post action', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-X|foo]] to A1 and set as source';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.postActions).toContain('set_source_location');
    });

    it('should handle 12-well plate text hint', () => {
      const prompt = 'Add 100uL of [[material-spec:MSP-X|foo]] to A1 of a 12-well plate';
      const resolvedMentions: ResolvedMention[] = [
        { raw: '[[material-spec:MSP-X|foo]]', kind: 'material-spec', id: 'MSP-X', label: 'foo' },
      ];
      const result = parseIntent(prompt, resolvedMentions);
      expect(result.labwareRef).toEqual({ kind: 'text', hint: '12-well plate' });
      expect(result.unresolvedSlots).toContain('labwareInstance');
    });
  });
});
