import { describe, it, expect } from '@jest/globals';
import {
  resolveMention,
  resolveMentions,
  Mention,
  ResolutionCandidate,
  MentionResolution,
  AmbiguitySpan,
  ResolveManyResult,
} from './MentionResolver';

describe('resolveMention', () => {
  describe('Single resolution - name match', () => {
    it('resolves when mention matches candidate name (case-insensitive)', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
      ];
      const mention: Mention = { _mention: 'h2o2', _kind: 'material-spec' };
      
      const result: MentionResolution = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref).toEqual({
        kind: 'record',
        id: 'MSP-h2o2',
        type: 'material-spec'
      });
      expect(result.matched_candidate_ids).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });
  });

  describe('Alias match', () => {
    it('resolves when mention matches a candidate alias', () => {
      const candidates: ResolutionCandidate[] = [
        {
          record_id: 'MSP-h2o2',
          kind: 'material-spec',
          name: 'Hydrogen Peroxide',
          aliases: ['hydrogen peroxide', 'H2O2', 'peroxide']
        }
      ];
      const mention: Mention = { _mention: 'hydrogen peroxide', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('MSP-h2o2');
    });

    it('resolves when mention matches any alias (case-insensitive)', () => {
      const candidates: ResolutionCandidate[] = [
        {
          record_id: 'MSP-buffer-a',
          kind: 'material-spec',
          name: 'Buffer A',
          aliases: ['PBS', 'phosphate-buffered saline']
        }
      ];
      const mention: Mention = { _mention: 'PBS', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('MSP-buffer-a');
    });
  });

  describe('Case-insensitive matching', () => {
    it('resolves with mixed-case mention', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-buffer', kind: 'material-spec', name: 'Buffer' }
      ];
      const mention: Mention = { _mention: 'HyDrOgEn PeRoXiDe', _kind: 'material-spec' };
      
      // This should NOT match "Buffer" - different strings
      const result = resolveMention(mention, candidates);
      expect(result.status).toBe('unresolved');
    });

    it('resolves with all-uppercase mention', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-nacl', kind: 'material-spec', name: 'NaCl' }
      ];
      const mention: Mention = { _mention: 'NACL', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('MSP-nacl');
    });

    it('resolves with all-lowercase mention', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-glucose', kind: 'material-spec', name: 'Glucose' }
      ];
      const mention: Mention = { _mention: 'GLUCOSE', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('MSP-glucose');
    });
  });

  describe('Unresolved mentions', () => {
    it('returns unresolved when no candidates match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
      ];
      const mention: Mention = { _mention: 'ethanol', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
      expect(result.reason).toContain('ethanol');
      expect(result.reason).toContain('material-spec');
      expect(result.record_ref).toBeUndefined();
    });

    it('returns unresolved when no candidates of that kind exist', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
      ];
      const mention: Mention = { _mention: 'H2O2', _kind: 'protocol' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });

    it('returns unresolved when candidate has no name or aliases', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-unknown', kind: 'material-spec' }
      ];
      const mention: Mention = { _mention: 'something', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });
  });

  describe('Ambiguous mentions', () => {
    it('returns ambiguous when 2+ candidates match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-buffer-a', kind: 'material-spec', name: 'buffer' },
        { record_id: 'MSP-buffer-b', kind: 'material-spec', name: 'Buffer' }
      ];
      const mention: Mention = { _mention: 'buffer', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('ambiguous');
      expect(result.matched_candidate_ids).toHaveLength(2);
      expect(result.matched_candidate_ids).toContain('MSP-buffer-a');
      expect(result.matched_candidate_ids).toContain('MSP-buffer-b');
      expect(result.reason).toContain('2 records matched');
      expect(result.record_ref).toBeUndefined();
    });

    it('returns ambiguous when candidates match via aliases', () => {
      const candidates: ResolutionCandidate[] = [
        {
          record_id: 'MSP-salt-1',
          kind: 'material-spec',
          name: 'Sodium Chloride',
          aliases: ['salt', 'NaCl']
        },
        {
          record_id: 'MSP-salt-2',
          kind: 'material-spec',
          name: 'Potassium Chloride',
          aliases: ['salt', 'KCl']
        }
      ];
      const mention: Mention = { _mention: 'salt', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('ambiguous');
      expect(result.matched_candidate_ids).toHaveLength(2);
    });
  });

  describe('Kind filtering', () => {
    it('only matches candidates of the same kind', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' },
        { record_id: 'PRM-something', kind: 'protocol', name: 'H2O2' }
      ];
      const mention: Mention = { _mention: 'H2O2', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('MSP-h2o2');
      // The protocol candidate should NOT be matched
    });

    it('does not match when kind differs even if name matches', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'PRM-h2o2-protocol', kind: 'protocol', name: 'H2O2' }
      ];
      const mention: Mention = { _mention: 'H2O2', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });
  });

  describe('Trimming', () => {
    it('trims whitespace from mention', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
      ];
      const mention: Mention = { _mention: '  H2O2  ', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
    });

    it('trims whitespace from candidate name', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'MSP-h2o2', kind: 'material-spec', name: '  H2O2  ' }
      ];
      const mention: Mention = { _mention: 'H2O2', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
    });

    it('trims whitespace from aliases', () => {
      const candidates: ResolutionCandidate[] = [
        {
          record_id: 'MSP-h2o2',
          kind: 'material-spec',
          name: 'Hydrogen Peroxide',
          aliases: ['  hydrogen peroxide  ']
        }
      ];
      const mention: Mention = { _mention: 'hydrogen peroxide', _kind: 'material-spec' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
    });
  });
});

describe('resolveMentions', () => {
  describe('Resolves nested mentions', () => {
    it('replaces nested mention markers with resolved refs', () => {
      const draft = {
        contents: [
          { material_ref: { _mention: 'H2O2', _kind: 'material-spec' } }
        ]
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
        ]]
      ]);
      
      const result: ResolveManyResult<typeof draft> = resolveMentions(draft, candidatesByKind);
      
      expect(result.resolved_draft.contents[0].material_ref).toEqual({
        kind: 'record',
        id: 'MSP-h2o2',
        type: 'material-spec'
      });
      expect(result.ambiguity_spans).toHaveLength(0);
    });

    it('resolves multiple mentions at different paths', () => {
      const draft = {
        reagents: [
          { name: 'H2O2', ref: { _mention: 'H2O2', _kind: 'material-spec' } },
          { name: 'DMSO', ref: { _mention: 'DMSO', _kind: 'material-spec' } }
        ]
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' },
          { record_id: 'MSP-dmsO', kind: 'material-spec', name: 'DMSO' }
        ]]
      ]);
      
      const result = resolveMentions(draft, candidatesByKind);
      
      expect(result.resolved_draft.reagents[0].ref).toEqual({
        kind: 'record',
        id: 'MSP-h2o2',
        type: 'material-spec'
      });
      expect(result.resolved_draft.reagents[1].ref).toEqual({
        kind: 'record',
        id: 'MSP-dmsO',
        type: 'material-spec'
      });
      expect(result.ambiguity_spans).toHaveLength(0);
    });
  });

  describe('Surfaces ambiguity spans', () => {
    it('leaves ambiguous marker in place and records span', () => {
      const draft = {
        material: { _mention: 'buffer', _kind: 'material-spec' }
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-buffer-a', kind: 'material-spec', name: 'buffer' },
          { record_id: 'MSP-buffer-b', kind: 'material-spec', name: 'Buffer' }
        ]]
      ]);
      
      const result = resolveMentions(draft, candidatesByKind);
      
      // Marker should remain in place
      expect((result.resolved_draft.material as any)._mention).toBe('buffer');
      expect((result.resolved_draft.material as any)._kind).toBe('material-spec');
      
      // Ambiguity span should be recorded
      expect(result.ambiguity_spans).toHaveLength(1);
      expect(result.ambiguity_spans[0].path).toBe('material');
      expect(result.ambiguity_spans[0].reason).toContain('2 records matched');
      expect(result.ambiguity_spans[0].matched_candidate_ids).toHaveLength(2);
    });

    it('records unresolved mentions as ambiguity spans', () => {
      const draft = {
        contents: [
          { material_ref: { _mention: 'unknown-substance', _kind: 'material-spec' } }
        ]
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
        ]]
      ]);
      
      const result = resolveMentions(draft, candidatesByKind);
      
      // Marker should remain in place
      expect((result.resolved_draft.contents[0].material_ref as any)._mention).toBe('unknown-substance');
      
      // Ambiguity span should be recorded
      expect(result.ambiguity_spans).toHaveLength(1);
      expect(result.ambiguity_spans[0].path).toBe('contents[0].material_ref');
      expect(result.ambiguity_spans[0].reason).toContain('unknown-substance');
    });
  });

  describe('Does not mutate input', () => {
    it('does not mutate the original draft object', () => {
      const draft = Object.freeze({
        contents: [
          { material_ref: Object.freeze({ _mention: 'H2O2', _kind: 'material-spec' }) }
        ]
      });
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
        ]]
      ]);
      
      // Should not throw
      const result = resolveMentions(draft, candidatesByKind);
      
      // Original should still have the marker
      expect((draft.contents[0].material_ref as any)._mention).toBe('H2O2');
      // Result should have the resolved ref
      expect(result.resolved_draft.contents[0].material_ref).toEqual({
        kind: 'record',
        id: 'MSP-h2o2',
        type: 'material-spec'
      });
    });

    it('handles deeply nested frozen objects', () => {
      const draft = Object.freeze({
        experiment: Object.freeze({
          samples: Object.freeze([
            Object.freeze({
              material: Object.freeze({ _mention: 'H2O2', _kind: 'material-spec' })
            })
          ])
        })
      });
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
        ]]
      ]);
      
      expect(() => resolveMentions(draft, candidatesByKind)).not.toThrow();
    });
  });

  describe('Path generation', () => {
    it('generates correct JSON path for nested structures', () => {
      const draft = {
        protocol: {
          steps: [
            {
              action: 'add',
              target: { _mention: 'H2O2', _kind: 'material-spec' }
            }
          ]
        }
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
        ]]
      ]);
      
      const result = resolveMentions(draft, candidatesByKind);
      
      expect(result.ambiguity_spans).toHaveLength(0);
      expect(result.resolved_draft.protocol.steps[0].target).toEqual({
        kind: 'record',
        id: 'MSP-h2o2',
        type: 'material-spec'
      });
    });
  });

  describe('Empty candidates', () => {
    it('handles empty candidates map gracefully', () => {
      const draft = {
        material: { _mention: 'H2O2', _kind: 'material-spec' }
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>();
      
      const result = resolveMentions(draft, candidatesByKind);
      
      expect(result.ambiguity_spans).toHaveLength(1);
      expect(result.ambiguity_spans[0].path).toBe('material');
      expect((result.resolved_draft.material as any)._mention).toBe('H2O2');
    });
  });

  describe('Claim resolution', () => {
    it('resolves claim by exact record ID match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CLM-h2o2-dose-response', kind: 'claim', title: 'H2O2 Dose-Response Study' }
      ];
      const mention: Mention = { _mention: 'CLM-h2o2-dose-response', _kind: 'claim' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref).toEqual({
        kind: 'record',
        id: 'CLM-h2o2-dose-response',
        type: 'claim'
      });
    });

    it('resolves claim by title substring match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CLM-h2o2-dose-response', kind: 'claim', title: 'H2O2 Dose-Response Study' }
      ];
      const mention: Mention = { _mention: 'dose-response', _kind: 'claim' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('CLM-h2o2-dose-response');
    });

    it('returns ambiguous when multiple claims match by record ID', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CLM-claim-1', kind: 'claim', title: 'First Claim' },
        { record_id: 'CLM-claim-2', kind: 'claim', title: 'Second Claim' }
      ];
      // This test is for when the mention matches multiple record IDs exactly
      // which is unlikely, but we test the ambiguity case for title substring
      const candidates2: ResolutionCandidate[] = [
        { record_id: 'CLM-claim-1', kind: 'claim', title: 'H2O2 Study' },
        { record_id: 'CLM-claim-2', kind: 'claim', title: 'H2O2 Analysis' }
      ];
      const mention: Mention = { _mention: 'H2O2', _kind: 'claim' };
      
      const result = resolveMention(mention, candidates2);
      
      expect(result.status).toBe('ambiguous');
      expect(result.matched_candidate_ids).toHaveLength(2);
      expect(result.matched_candidate_ids).toContain('CLM-claim-1');
      expect(result.matched_candidate_ids).toContain('CLM-claim-2');
    });

    it('returns unresolved when no claim matches', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CLM-h2o2-dose-response', kind: 'claim', title: 'H2O2 Dose-Response Study' }
      ];
      const mention: Mention = { _mention: 'ethanol study', _kind: 'claim' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
      expect(result.reason).toContain('ethanol study');
    });

    it('handles empty candidates for claim kind', () => {
      const candidates: ResolutionCandidate[] = [];
      const mention: Mention = { _mention: 'some claim', _kind: 'claim' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });
  });

  describe('Context resolution', () => {
    it('resolves context by exact record ID match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CTX-ros-assay-context', kind: 'context', name: 'ROS Assay Context' }
      ];
      const mention: Mention = { _mention: 'CTX-ros-assay-context', _kind: 'context' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref).toEqual({
        kind: 'record',
        id: 'CTX-ros-assay-context',
        type: 'context'
      });
    });

    it('resolves context by exact name match (case-insensitive)', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CTX-ros-assay-context', kind: 'context', name: 'ROS Assay Context' }
      ];
      const mention: Mention = { _mention: 'ros assay context', _kind: 'context' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('CTX-ros-assay-context');
    });

    it('returns ambiguous when multiple contexts match by name', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CTX-timeline-1', kind: 'context', name: 'Main Timeline' },
        { record_id: 'CTX-timeline-2', kind: 'context', name: 'Main Timeline' }
      ];
      const mention: Mention = { _mention: 'Main Timeline', _kind: 'context' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('ambiguous');
      expect(result.matched_candidate_ids).toHaveLength(2);
      expect(result.matched_candidate_ids).toContain('CTX-timeline-1');
      expect(result.matched_candidate_ids).toContain('CTX-timeline-2');
    });

    it('returns unresolved when no context matches', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'CTX-ros-assay-context', kind: 'context', name: 'ROS Assay Context' }
      ];
      const mention: Mention = { _mention: 'unknown context', _kind: 'context' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
      expect(result.reason).toContain('unknown context');
    });

    it('handles empty candidates for context kind', () => {
      const candidates: ResolutionCandidate[] = [];
      const mention: Mention = { _mention: 'some context', _kind: 'context' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });
  });

  describe('Operator resolution', () => {
    it('resolves operator by exact record ID match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'OP-john-doe', kind: 'operator', display_name: 'John Doe' }
      ];
      const mention: Mention = { _mention: 'OP-john-doe', _kind: 'operator' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref).toEqual({
        kind: 'record',
        id: 'OP-john-doe',
        type: 'operator'
      });
    });

    it('resolves operator by exact display_name match (case-insensitive)', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'OP-john-doe', kind: 'operator', display_name: 'John Doe' }
      ];
      const mention: Mention = { _mention: 'john doe', _kind: 'operator' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('OP-john-doe');
    });

    it('returns ambiguous when multiple operators match by display_name', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'OP-operator-1', kind: 'operator', display_name: 'Lab Tech' },
        { record_id: 'OP-operator-2', kind: 'operator', display_name: 'Lab Tech' }
      ];
      const mention: Mention = { _mention: 'Lab Tech', _kind: 'operator' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('ambiguous');
      expect(result.matched_candidate_ids).toHaveLength(2);
      expect(result.matched_candidate_ids).toContain('OP-operator-1');
      expect(result.matched_candidate_ids).toContain('OP-operator-2');
    });

    it('returns unresolved when no operator matches', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'OP-john-doe', kind: 'operator', display_name: 'John Doe' }
      ];
      const mention: Mention = { _mention: 'jane smith', _kind: 'operator' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
      expect(result.reason).toContain('jane smith');
    });

    it('handles empty candidates for operator kind', () => {
      const candidates: ResolutionCandidate[] = [];
      const mention: Mention = { _mention: 'some operator', _kind: 'operator' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });
  });

  describe('Facility-zone resolution', () => {
    it('resolves facility-zone by exact record ID match', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'FZ-zone-a', kind: 'facility-zone', zone_label: 'Zone A' }
      ];
      const mention: Mention = { _mention: 'FZ-zone-a', _kind: 'facility-zone' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref).toEqual({
        kind: 'record',
        id: 'FZ-zone-a',
        type: 'facility-zone'
      });
    });

    it('resolves facility-zone by exact zone_label match (case-insensitive)', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'FZ-zone-a', kind: 'facility-zone', zone_label: 'Zone A' }
      ];
      const mention: Mention = { _mention: 'zone a', _kind: 'facility-zone' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('resolved');
      expect(result.record_ref?.id).toBe('FZ-zone-a');
    });

    it('returns ambiguous when multiple facility-zones match by zone_label', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'FZ-zone-1', kind: 'facility-zone', zone_label: 'Incubation Zone' },
        { record_id: 'FZ-zone-2', kind: 'facility-zone', zone_label: 'Incubation Zone' }
      ];
      const mention: Mention = { _mention: 'Incubation Zone', _kind: 'facility-zone' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('ambiguous');
      expect(result.matched_candidate_ids).toHaveLength(2);
      expect(result.matched_candidate_ids).toContain('FZ-zone-1');
      expect(result.matched_candidate_ids).toContain('FZ-zone-2');
    });

    it('returns unresolved when no facility-zone matches', () => {
      const candidates: ResolutionCandidate[] = [
        { record_id: 'FZ-zone-a', kind: 'facility-zone', zone_label: 'Zone A' }
      ];
      const mention: Mention = { _mention: 'Zone B', _kind: 'facility-zone' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
      expect(result.reason).toContain('Zone B');
    });

    it('handles empty candidates for facility-zone kind', () => {
      const candidates: ResolutionCandidate[] = [];
      const mention: Mention = { _mention: 'some zone', _kind: 'facility-zone' };
      
      const result = resolveMention(mention, candidates);
      
      expect(result.status).toBe('unresolved');
    });
  });
});

  describe('Mixed resolution results', () => {
    it('handles a mix of resolved and unresolved mentions', () => {
      const draft = {
        reagents: [
          { ref: { _mention: 'H2O2', _kind: 'material-spec' } },
          { ref: { _mention: 'Unknown', _kind: 'material-spec' } }
        ]
      };
      const candidatesByKind = new Map<string, ResolutionCandidate[]>([
        ['material-spec', [
          { record_id: 'MSP-h2o2', kind: 'material-spec', name: 'H2O2' }
        ]]
      ]);
      
      const result = resolveMentions(draft, candidatesByKind);
      
      // First should be resolved
      expect(result.resolved_draft.reagents[0].ref).toEqual({
        kind: 'record',
        id: 'MSP-h2o2',
        type: 'material-spec'
      });
      
      // Second should remain as marker
      expect((result.resolved_draft.reagents[1].ref as any)._mention).toBe('Unknown');
      
      // One ambiguity span for the unresolved
      expect(result.ambiguity_spans).toHaveLength(1);
      expect(result.ambiguity_spans[0].path).toBe('reagents[1].ref');
    });
  });
});
