import { describe, it, expect } from 'vitest';
import { parsePromptMentionMatches, parsePromptMentions } from './promptMentions.js';

describe('parsePromptMentionMatches', () => {
  describe('material-spec tokens', () => {
    it('should parse a single material-spec mention', () => {
      const prompt = 'Please prepare [[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      // "Please prepare " is 15 characters, so the mention starts at index 15
      // The raw token is 62 characters long, so end = 15 + 62 = 77
      expect(result[0]).toMatchObject({
        raw: '[[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]]',
        start: 15,
        end: 77,
        mention: {
          type: 'material',
          entityKind: 'material-spec',
          id: 'MSP-MMIITWMZ-93SU5Y',
          label: 'Clofibrate, 1 mM in DMSO',
        },
      });
    });

    it('should parse multiple material-spec mentions', () => {
      const prompt = 'Use [[material-spec:SPEC-1|Reagent A]] and [[material-spec:SPEC-2|Reagent B]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(2);
      expect(result[0].mention.id).toBe('SPEC-1');
      expect(result[1].mention.id).toBe('SPEC-2');
    });
  });

  describe('aliquot tokens', () => {
    it('should parse a single aliquot mention', () => {
      const prompt = 'Transfer [[aliquot:ALIQUOT-123|50 uL of stock]] to the plate';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        raw: '[[aliquot:ALIQUOT-123|50 uL of stock]]',
        mention: {
          type: 'material',
          entityKind: 'aliquot',
          id: 'ALIQUOT-123',
          label: '50 uL of stock',
        },
      });
    });

    it('should parse aliquot without label', () => {
      const prompt = 'Use [[aliquot:ALIQUOT-456]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0].mention.id).toBe('ALIQUOT-456');
      expect(result[0].mention.label).toBe('ALIQUOT-456');
    });
  });

  describe('material tokens', () => {
    it('should parse a single material mention', () => {
      const prompt = 'Add [[material:MAT-789|Ethanol]] to the mixture';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        raw: '[[material:MAT-789|Ethanol]]',
        mention: {
          type: 'material',
          entityKind: 'material',
          id: 'MAT-789',
          label: 'Ethanol',
        },
      });
    });

    it('should parse material without label', () => {
      const prompt = 'Use [[material:ETHANOL]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0].mention.id).toBe('ETHANOL');
      expect(result[0].mention.label).toBe('ETHANOL');
    });
  });

  describe('labware tokens', () => {
    it('should parse a single labware mention', () => {
      const prompt = 'Place the plate on [[labware:PLATE-001|96-well plate]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        raw: '[[labware:PLATE-001|96-well plate]]',
        mention: {
          type: 'labware',
          id: 'PLATE-001',
          label: '96-well plate',
        },
      });
    });

    it('should parse labware without label', () => {
      const prompt = 'Use [[labware:TIPBOX-5]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0].mention.id).toBe('TIPBOX-5');
      expect(result[0].mention.label).toBe('TIPBOX-5');
    });
  });

  describe('selection tokens', () => {
    it('should parse a source selection mention', () => {
      const prompt = 'Transfer from [[selection:source|PLATE-A|A1,B1,C1|Source wells]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        raw: '[[selection:source|PLATE-A|A1,B1,C1|Source wells]]',
        mention: {
          type: 'selection',
          selectionKind: 'source',
          labwareId: 'PLATE-A',
          wells: ['A1', 'B1', 'C1'],
          label: 'Source wells',
        },
      });
    });

    it('should parse a target selection mention', () => {
      const prompt = 'Transfer to [[selection:target|PLATE-B|A1,A2|Target]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        raw: '[[selection:target|PLATE-B|A1,A2|Target]]',
        mention: {
          type: 'selection',
          selectionKind: 'target',
          labwareId: 'PLATE-B',
          wells: ['A1', 'A2'],
          label: 'Target',
        },
      });
    });

    it('should parse selection with empty wells', () => {
      const prompt = 'Use [[selection:source|PLATE-C||||Label]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0].mention.wells).toEqual([]);
    });

    it('should reject invalid selection kind', () => {
      const prompt = 'Use [[selection:invalid|PLATE-D|A1|Label]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(0);
    });

    it('should reject selection without labwareId', () => {
      const prompt = 'Use [[selection:source||A1|Label]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty prompt', () => {
      const result = parsePromptMentionMatches('');
      expect(result).toHaveLength(0);
    });

    it('should handle prompt with no mentions', () => {
      const result = parsePromptMentionMatches('This is just plain text');
      expect(result).toHaveLength(0);
    });

    it('should handle malformed mentions', () => {
      const prompt = '[[invalid]] and [[material:]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(0);
    });

    it('should handle mentions with special characters in label', () => {
      const prompt = 'Use [[material-spec:SPEC-1|Reagent with "quotes" and \\ backslash]]';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(1);
      expect(result[0].mention.label).toBe('Reagent with "quotes" and \\ backslash');
    });

    it('should deduplicate identical mentions', () => {
      const prompt = 'Use [[material-spec:SPEC-1|Reagent]] and [[material-spec:SPEC-1|Reagent]] again';
      const result = parsePromptMentionMatches(prompt);
      
      expect(result).toHaveLength(2); // Note: parser doesn't dedupe, resolver does
    });
  });
});

describe('parsePromptMentions', () => {
  it('should return just mention objects without position info', () => {
    const prompt = 'Use [[material-spec:SPEC-1|Reagent]]';
    const result = parsePromptMentions(prompt);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'material',
      entityKind: 'material-spec',
      id: 'SPEC-1',
      label: 'Reagent',
    });
    
    // Should not have position info
    expect((result[0] as any).start).toBeUndefined();
    expect((result[0] as any).end).toBeUndefined();
    expect((result[0] as any).raw).toBeUndefined();
  });
});
