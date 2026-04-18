import { describe, it, expect } from 'vitest';
import { buildLocalProtocol, LocalProtocolPayload } from './LocalProtocolBuilder.js';

describe('LocalProtocolBuilder', () => {
  describe('minimal input', () => {
    it('should produce a valid payload with minimal arguments', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-foo',
        globalProtocolTitle: 'Foo',
        compiledSteps: []
      });

      expect(result.kind).toBe('local-protocol');
      expect(result.protocolLayer).toBe('lab');
      expect(result.recordId).toBe('LPR-foo-v1');
      expect(result.status).toBe('draft');
      expect(result.inherits_from).toEqual({
        kind: 'record',
        id: 'PRT-foo',
        type: 'protocol'
      });
      expect(result.overrides).toEqual({});
    });
  });

  describe('bindings from compiledSteps', () => {
    it('should emit bindings only for steps with equipmentRef', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-bar',
        globalProtocolTitle: 'Bar Protocol',
        compiledSteps: [
          {
            stepId: 'step-1',
            equipmentRef: { kind: 'record', id: 'EQP-mixer-01', type: 'equipment' }
          },
          {
            stepId: 'step-2'
            // No equipmentRef - should be skipped
          }
        ]
      });

      expect(result.overrides.bindings).toHaveLength(1);
      expect(result.overrides.bindings?.[0]).toEqual({
        stepId: 'step-1',
        equipmentRef: { kind: 'record', id: 'EQP-mixer-01', type: 'equipment' }
      });
    });

    it('should include multiple bindings when multiple steps have equipmentRef', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-multi',
        globalProtocolTitle: 'Multi Equipment',
        compiledSteps: [
          {
            stepId: 'mix-1',
            equipmentRef: { kind: 'record', id: 'EQP-mixer', type: 'equipment' }
          },
          {
            stepId: 'pipette-1',
            equipmentRef: { kind: 'record', id: 'EQP-pipette', type: 'equipment' }
          }
        ]
      });

      expect(result.overrides.bindings).toHaveLength(2);
      expect(result.overrides.bindings?.[0].stepId).toBe('mix-1');
      expect(result.overrides.bindings?.[1].stepId).toBe('pipette-1');
    });
  });

  describe('substitutions pass through', () => {
    it('should pass substitutions through to overrides', () => {
      const substitutions = [
        {
          role: 'dye',
          material_ref: { kind: 'record', id: 'MSP-DCFDA', type: 'material-spec' }
        }
      ];

      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-ros',
        globalProtocolTitle: 'ROS Assay',
        compiledSteps: [],
        substitutions
      });

      expect(result.overrides.substitutions).toHaveLength(1);
      expect(result.overrides.substitutions?.[0].role).toBe('dye');
      expect(result.overrides.substitutions?.[0].material_ref).toEqual({
        kind: 'record',
        id: 'MSP-DCFDA',
        type: 'material-spec'
      });
    });

    it('should omit substitutions when empty', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-simple',
        globalProtocolTitle: 'Simple',
        compiledSteps: [],
        substitutions: []
      });

      expect(result.overrides.substitutions).toBeUndefined();
    });
  });

  describe('lab-state refs', () => {
    it('should map labStateRefs to lab_state_refs with correct shape', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-stateful',
        globalProtocolTitle: 'Stateful Protocol',
        compiledSteps: [],
        labStateRefs: ['LST-a', 'LST-b']
      });

      expect(result.lab_state_refs).toHaveLength(2);
      expect(result.lab_state_refs?.[0]).toEqual({
        kind: 'record',
        id: 'LST-a',
        type: 'lab-state'
      });
      expect(result.lab_state_refs?.[1]).toEqual({
        kind: 'record',
        id: 'LST-b',
        type: 'lab-state'
      });
    });

    it('should omit lab_state_refs when empty', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-nostate',
        globalProtocolTitle: 'No State',
        compiledSteps: [],
        labStateRefs: []
      });

      expect(result.lab_state_refs).toBeUndefined();
    });
  });

  describe('status override', () => {
    it('should use provided status when given', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-active',
        globalProtocolTitle: 'Active Protocol',
        compiledSteps: [],
        status: 'active'
      });

      expect(result.status).toBe('active');
    });

    it('should default to draft when status not provided', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-new',
        globalProtocolTitle: 'New Protocol',
        compiledSteps: []
      });

      expect(result.status).toBe('draft');
    });

    it('should accept all valid status values', () => {
      const statuses: Array<LocalProtocolPayload['status']> = ['draft', 'active', 'superseded', 'retracted'];
      
      for (const status of statuses) {
        const result = buildLocalProtocol({
          globalProtocolRecordId: 'PRT-test',
          globalProtocolTitle: 'Test',
          compiledSteps: [],
          status
        });
        expect(result.status).toBe(status);
      }
    });
  });

  describe('recordId generation', () => {
    it('should strip PRT- prefix and lowercase the suffix', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-MyProtocol',
        globalProtocolTitle: 'My Protocol',
        compiledSteps: []
      });

      expect(result.recordId).toBe('LPR-myprotocol-v1');
    });

    it('should strip PRO- prefix and lowercase the suffix', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRO-MyProtocol',
        globalProtocolTitle: 'My Protocol',
        compiledSteps: []
      });

      expect(result.recordId).toBe('LPR-myprotocol-v1');
    });

    it('should handle recordIds without PRT-/PRO- prefix', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'my-protocol-id',
        globalProtocolTitle: 'My Protocol',
        compiledSteps: []
      });

      expect(result.recordId).toBe('LPR-my-protocol-id-v1');
    });

    it('should match the expected regex pattern', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-foo',
        globalProtocolTitle: 'Foo',
        compiledSteps: []
      });

      const regex = /^LPR-[A-Za-z0-9_-]+$/;
      expect(regex.test(result.recordId)).toBe(true);
    });
  });

  describe('notes', () => {
    it('should include notes when provided', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-noted',
        globalProtocolTitle: 'Noted Protocol',
        compiledSteps: [],
        notes: 'This is a test note'
      });

      expect(result.notes).toBe('This is a test note');
    });

    it('should omit notes when empty', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-nonote',
        globalProtocolTitle: 'No Note',
        compiledSteps: [],
        notes: ''
      });

      expect(result.notes).toBeUndefined();
    });
  });

  describe('title generation', () => {
    it('should prefix the title with "Local realization of "', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-titletest',
        globalProtocolTitle: 'Original Title',
        compiledSteps: []
      });

      expect(result.title).toBe('Local realization of Original Title');
    });
  });

  describe('inherits_from', () => {
    it('should reference the global protocol correctly', () => {
      const result = buildLocalProtocol({
        globalProtocolRecordId: 'PRT-parent',
        globalProtocolTitle: 'Parent',
        compiledSteps: []
      });

      expect(result.inherits_from).toEqual({
        kind: 'record',
        id: 'PRT-parent',
        type: 'protocol'
      });
    });
  });
});
