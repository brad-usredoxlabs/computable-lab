import { describe, expect, it } from 'vitest';
import { findDependentsOfLabState } from './LabStateCascadeWalker.js';
import type { LabStateCandidate } from './LabStateCascadeWalker.js';

describe('LabStateCascadeWalker', () => {
  describe('findDependentsOfLabState', () => {
    it('returns empty array for empty candidates list', () => {
      const candidates: LabStateCandidate[] = [];
      const result = findDependentsOfLabState('LST-abc', candidates);
      expect(result).toEqual([]);
    });

    it('finds local-protocol dependent when lab_state_refs contains superseded id as string', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'local-protocol',
          recordId: 'LP-001',
          lab_state_refs: ['LST-fuge-location-abc', 'LST-other-def'],
        },
      ];
      const result = findDependentsOfLabState('LST-fuge-location-abc', candidates);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ dependentKind: 'local-protocol' });
      expect(result[0]?.dependentRecordId).toBe('LP-001');
      expect(result[0]?.supersededLabStateRecordId).toBe('LST-fuge-location-abc');
      expect(result[0]?.reason).toContain('LST-fuge-location-abc');
    });

    it('finds execution-environment dependent when lab_state_refs contains superseded id', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'execution-environment',
          recordId: 'EE-001',
          lab_state_refs: ['LST-incubator-xyz'],
        },
      ];
      const result = findDependentsOfLabState('LST-incubator-xyz', candidates);
      expect(result).toHaveLength(1);
      expect(result[0]?.dependentKind).toBe('execution-environment');
      expect(result[0]?.dependentRecordId).toBe('EE-001');
      expect(result[0]?.supersededLabStateRecordId).toBe('LST-incubator-xyz');
    });

    it('returns empty when candidate references a different lab-state id', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'local-protocol',
          recordId: 'LP-002',
          lab_state_refs: ['LST-different-id'],
        },
      ];
      const result = findDependentsOfLabState('LST-target-id', candidates);
      expect(result).toEqual([]);
    });

    it('returns empty when candidate has no lab_state_refs', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'local-protocol',
          recordId: 'LP-003',
        },
      ];
      const result = findDependentsOfLabState('LST-any-id', candidates);
      expect(result).toEqual([]);
    });

    it('matches ref-as-string format', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'local-protocol',
          recordId: 'LP-004',
          lab_state_refs: ['LST-abc'],
        },
      ];
      const result = findDependentsOfLabState('LST-abc', candidates);
      expect(result).toHaveLength(1);
      expect(result[0]?.dependentKind).toBe('local-protocol');
    });

    it('matches ref-as-object format with .id property', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'local-protocol',
          recordId: 'LP-005',
          lab_state_refs: [{ id: 'LST-xyz' }],
        },
      ];
      const result = findDependentsOfLabState('LST-xyz', candidates);
      expect(result).toHaveLength(1);
      expect(result[0]?.dependentKind).toBe('local-protocol');
    });

    it('handles mixed ref formats in same candidate', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'execution-environment',
          recordId: 'EE-002',
          lab_state_refs: ['LST-string-ref', { id: 'LST-object-ref' }],
        },
      ];
      const result = findDependentsOfLabState('LST-object-ref', candidates);
      expect(result).toHaveLength(1);
      expect(result[0]?.dependentKind).toBe('execution-environment');
    });

    it('returns diagnostics for multiple dependents referencing same lab-state', () => {
      const candidates: LabStateCandidate[] = [
        {
          kind: 'local-protocol',
          recordId: 'LP-006',
          lab_state_refs: ['LST-shared'],
        },
        {
          kind: 'execution-environment',
          recordId: 'EE-003',
          lab_state_refs: ['LST-shared'],
        },
      ];
      const result = findDependentsOfLabState('LST-shared', candidates);
      expect(result).toHaveLength(2);
      expect(result[0]?.dependentKind).toBe('local-protocol');
      expect(result[1]?.dependentKind).toBe('execution-environment');
    });

    it('does not mutate input candidates', () => {
      const candidate: LabStateCandidate = {
        kind: 'local-protocol',
        recordId: 'LP-007',
        lab_state_refs: ['LST-test'],
      };
      const candidates: LabStateCandidate[] = [candidate];
      findDependentsOfLabState('LST-test', candidates);
      expect(candidate.lab_state_refs).toEqual(['LST-test']);
      expect(candidate.kind).toBe('local-protocol');
    });
  });
});
