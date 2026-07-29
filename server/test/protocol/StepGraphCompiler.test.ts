import { describe, expect, it } from 'vitest';
import {
  StepGraphCompiler,
  substituteVariables,
  type StepTemplate,
  type Bindings,
} from '../../src/protocol/StepGraphCompiler.js';

describe('StepGraphCompiler', () => {
  describe('substituteVariables', () => {
    it('replaces simple {{variable}} placeholders in strings', () => {
      const bindings: Bindings = { reagent: 'PBS' };
      const result = substituteVariables('Add {{reagent}} to wells', bindings);
      expect(result).toBe('Add PBS to wells');
    });

    it('replaces multiple placeholders in one string', () => {
      const bindings: Bindings = { reagent: 'PBS', volume: '100 uL' };
      const result = substituteVariables(
        'Add {{volume}} of {{reagent}} to wells',
        bindings,
      );
      expect(result).toBe('Add 100 uL of PBS to wells');
    });

    it('resolves nested object paths with dots', () => {
      const bindings: Bindings = {
        labware: { id: 'LAB-96-1', name: '96-well plate' },
      };
      const result = substituteVariables(
        'Use {{labware.id}} for {{labware.name}}',
        bindings,
      );
      expect(result).toBe('Use LAB-96-1 for 96-well plate');
    });

    it('replaces unresolved variables with empty string', () => {
      const bindings: Bindings = {};
      const result = substituteVariables('Add {{missing}} to wells', bindings);
      expect(result).toBe('Add  to wells');
    });

    it('recursively processes nested objects', () => {
      const bindings: Bindings = {
        reagent: 'BPE',
        labware: { id: 'RES-12' },
      };
      const input = {
        event_type: 'add_material',
        details: {
          material: '{{reagent}}',
          target: '{{labware.id}}',
        },
      };
      const result = substituteVariables(input, bindings);
      expect(result).toEqual({
        event_type: 'add_material',
        details: {
          material: 'BPE',
          target: 'RES-12',
        },
      });
    });

    it('recursively processes arrays', () => {
      const bindings: Bindings = { plate: 'SAMPLE-1' };
      const input = ['{{plate}}', 'fixed', '{{plate}}'];
      const result = substituteVariables(input, bindings);
      expect(result).toEqual(['SAMPLE-1', 'fixed', 'SAMPLE-1']);
    });

    it('returns null/undefined as-is', () => {
      expect(substituteVariables(null, {})).toBeNull();
      expect(substituteVariables(undefined, {})).toBeUndefined();
    });

    it('returns numbers and booleans as-is', () => {
      expect(substituteVariables(42, {})).toBe(42);
      expect(substituteVariables(true, {})).toBe(true);
    });
  });

  describe('compileStepToGraph', () => {
    const compiler = new StepGraphCompiler();

    it('compiles a simple step without variables', () => {
      const step: StepTemplate = {
        stepId: 'step-1',
        kind: 'add_material',
        label: 'Add Buffer',
        events: [
          {
            eventId: 'evt-1',
            event_type: 'add_material',
            details: { material: 'PBS', wells: ['A1:A12'] },
          },
        ],
        labwares: [
          { labwareId: 'LAB-96-1', labwareType: 'plate_96', name: 'Sample Plate' },
        ],
      };

      const result = compiler.compileStepToGraph(step, {});

      expect(result.stepId).toBe('step-1');
      expect(result.graph.id).toBe('SGR-step-1');
      expect(result.graph.stepId).toBe('step-1');
      expect(result.graph.events).toHaveLength(1);
      expect(result.graph.events[0]).toMatchObject({
        eventId: 'evt-1',
        event_type: 'add_material',
        stepId: 'step-1',
      });
      expect(result.graph.labwares).toHaveLength(1);
    });

    it('substitutes variables in events and labwares', () => {
      const step: StepTemplate = {
        stepId: 'step-transfer',
        kind: 'transfer',
        label: 'Transfer {{source}} to {{target}}',
        description: 'Transfer {{volume}} from {{source}}',
        events: [
          {
            eventId: 'evt-transfer',
            event_type: 'transfer',
            details: {
              from: '{{source}}',
              to: '{{target}}',
              volume: '{{volume}}',
            },
          },
        ],
        labwares: [
          {
            labwareId: '{{source}}',
            labwareType: 'reservoir_12',
            name: 'Source Reservoir',
          },
        ],
      };

      const bindings: Bindings = {
        source: 'RES-SAMPLE',
        target: 'PLT-ASSAY',
        volume: '50 uL',
      };

      const result = compiler.compileStepToGraph(step, bindings);

      expect(result.graph.name).toBe('Transfer RES-SAMPLE to PLT-ASSAY');
      expect(result.graph.description).toBe('Transfer 50 uL from RES-SAMPLE');
      expect(result.graph.events[0]).toMatchObject({
        details: {
          from: 'RES-SAMPLE',
          to: 'PLT-ASSAY',
          volume: '50 uL',
        },
      });
      expect(result.graph.labwares[0]).toMatchObject({
        labwareId: 'RES-SAMPLE',
      });
    });

    it('attaches stepId to events that don\'t have one', () => {
      const step: StepTemplate = {
        stepId: 'mix-1',
        kind: 'mix',
        events: [
          {
            eventId: 'evt-mix',
            event_type: 'mix',
          },
        ],
        labwares: [],
      };

      const result = compiler.compileStepToGraph(step, {});
      expect(result.graph.events[0]).toHaveProperty('stepId', 'mix-1');
    });

    it('preserves existing stepId on events', () => {
      const step: StepTemplate = {
        stepId: 'parent',
        kind: 'other',
        events: [
          {
            eventId: 'evt-1',
            event_type: 'other',
            stepId: 'child-step',
          },
        ],
        labwares: [],
      };

      const result = compiler.compileStepToGraph(step, {});
      expect(result.graph.events[0]).toHaveProperty('stepId', 'child-step');
    });

    it('handles steps with no events or labwares', () => {
      const step: StepTemplate = {
        stepId: 'empty-step',
        kind: 'other',
      };

      const result = compiler.compileStepToGraph(step, {});
      expect(result.graph.events).toEqual([]);
      expect(result.graph.labwares).toEqual([]);
    });

    it('includes phaseId when provided', () => {
      const step: StepTemplate = {
        stepId: 'step-1',
        kind: 'add_material',
        phaseId: 'phase-prep',
        events: [],
        labwares: [],
      };

      const result = compiler.compileStepToGraph(step, {});
      expect(result.graph.phaseId).toBe('phase-prep');
    });
  });

  describe('compileProtocolToStepGraphs', () => {
    const compiler = new StepGraphCompiler();

    it('compiles multiple steps in ordinal order', () => {
      const steps: StepTemplate[] = [
        {
          stepId: 'step-2',
          kind: 'transfer',
          ordinal: 2,
          label: 'Transfer',
          events: [],
          labwares: [],
        },
        {
          stepId: 'step-1',
          kind: 'add_material',
          ordinal: 1,
          label: 'Add Material',
          events: [],
          labwares: [],
        },
        {
          stepId: 'step-3',
          kind: 'mix',
          ordinal: 3,
          label: 'Mix',
          events: [],
          labwares: [],
        },
      ];

      const results = compiler.compileProtocolToStepGraphs(steps, {});
      expect(results).toHaveLength(3);
      expect(results[0]?.stepId).toBe('step-1');
      expect(results[1]?.stepId).toBe('step-2');
      expect(results[2]?.stepId).toBe('step-3');
    });

    it('applies bindings to all steps', () => {
      const steps: StepTemplate[] = [
        {
          stepId: 'prep',
          kind: 'add_material',
          label: 'Prep with {{reagent}}',
          events: [
            {
              eventId: 'evt-prep',
              event_type: 'add_material',
              details: { material: '{{reagent}}' },
            },
          ],
          labwares: [],
        },
        {
          stepId: 'transfer',
          kind: 'transfer',
          label: 'Transfer {{volume}}',
          events: [
            {
              eventId: 'evt-xfer',
              event_type: 'transfer',
              details: { volume: '{{volume}}' },
            },
          ],
          labwares: [],
        },
      ];

      const bindings: Bindings = { reagent: 'BPE', volume: '100 uL' };
      const results = compiler.compileProtocolToStepGraphs(steps, bindings);

      expect(results[0]?.graph.events[0]).toMatchObject({
        details: { material: 'BPE' },
      });
      expect(results[1]?.graph.events[0]).toMatchObject({
        details: { volume: '100 uL' },
      });
    });

    it('returns empty array for non-array input', () => {
      const results = compiler.compileProtocolToStepGraphs({}, {});
      expect(results).toEqual([]);
    });
  });
});
