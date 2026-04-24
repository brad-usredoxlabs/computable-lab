/**
 * Tests for the expand_protocol pass.
 */

import { describe, it, expect } from 'vitest';
import {
  createExpandProtocolPass,
  type CreateExpandProtocolPassDeps,
  type ExpandProtocolOutput,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { RegistryLoader } from '../../../registry/RegistryLoader.js';
import type { ProtocolSpec } from '../../../registry/ProtocolSpecRegistry.js';

// ---------------------------------------------------------------------------
// Helpers — build mock registries
// ---------------------------------------------------------------------------

function makeProtocolRegistry(
  specs: ProtocolSpec[],
): RegistryLoader<ProtocolSpec> {
  return {
    list: () => specs.slice(),
    get: (id: string) => specs.find(s => s.id === id),
    reload: () => {},
  };
}

function makeMockState(
  resolvedRefs: Array<{ kind: string; label: string; resolvedId: string }>,
  candidateEvents: Array<{ verb: string; [k: string]: unknown }>,
): PipelineState {
  return {
    input: {},
    context: {},
    meta: {},
    outputs: new Map([
      ['resolve_references', { resolvedRefs }],
      ['ai_precompile', { candidateEvents }],
    ]),
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createExpandProtocolPass', () => {
  it('expands a 3-step protocol into 3 primitive events', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'test-wash-protocol',
          name: 'Test Wash Protocol',
          description: 'A minimal test protocol',
          steps: [
            { step: 1, verb: 'add_material', params: { targetLabwareRef: 'primary_plate', well: 'all', materialKind: 'wash-buffer', volumeUl: 200 } },
            { step: 2, verb: 'mix', params: { targetLabwareRef: 'primary_plate', well: 'all', cycles: 3 } },
            { step: 3, verb: 'aliquot', params: { fromLabwareRef: 'primary_plate', toLabwareRef: 'waste', well: 'all', volumeUl: 200 } },
          ],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'test-wash-protocol', resolvedId: 'test-wash-protocol' }],
        [{ verb: 'run_protocol', protocolRef: 'test-wash-protocol', bindings: { primary_plate: 'plate-1' } }],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.stepsExpanded).toBe(3);
    expect(output.events).toHaveLength(3);

    // Verify event types are correctly mapped
    expect(output.events[0]).toMatchObject({
      eventId: 'pe_proto_test-wash-protocol_1',
      event_type: 'add_material',
      details: { protocolStepNumber: 1, protocolId: 'test-wash-protocol' },
    });
    expect(output.events[1]).toMatchObject({
      eventId: 'pe_proto_test-wash-protocol_2',
      event_type: 'mix',
      details: { protocolStepNumber: 2, protocolId: 'test-wash-protocol' },
    });
    expect(output.events[2]).toMatchObject({
      eventId: 'pe_proto_test-wash-protocol_3',
      event_type: 'transfer', // aliquot maps to transfer
      details: { protocolStepNumber: 3, protocolId: 'test-wash-protocol' },
    });
  });

  it('substitutes {{key}} placeholders from bindings', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'param-protocol',
          name: 'Param Protocol',
          description: 'Protocol with placeholders',
          steps: [
            { step: 1, verb: 'add_material', params: { targetLabwareRef: '{{primary_plate}}', volumeUl: 100 } },
          ],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'param-protocol', resolvedId: 'param-protocol' }],
        [{ verb: 'run_protocol', protocolRef: 'param-protocol', bindings: { primary_plate: 'my-plate' } }],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(1);
    expect((output.events[0] as { details: Record<string, unknown> }).details.targetLabwareRef).toBe('my-plate');
  });

  it('unresolved placeholders produce warning diagnostics and null values', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'param-protocol',
          name: 'Param Protocol',
          description: 'Protocol with placeholders',
          steps: [
            { step: 1, verb: 'add_material', params: { targetLabwareRef: '{{missing_key}}', volumeUl: 100 } },
          ],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'param-protocol', resolvedId: 'param-protocol' }],
        [{ verb: 'run_protocol', protocolRef: 'param-protocol', bindings: {} }],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(1);
    expect((output.events[0] as { details: Record<string, unknown> }).details.targetLabwareRef).toBeNull();
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]).toMatchObject({
      pass_id: 'expand_protocol',
      severity: 'warning',
      code: 'unresolved_placeholder',
    });
    expect((result.diagnostics![0] as { message: string }).message).toContain('missing_key');
  });

  it('protocol_not_found warning when resolved id is not in registry', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'nonexistent', resolvedId: 'nonexistent' }],
        [],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(0);
    expect(output.stepsExpanded).toBe(0);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]).toMatchObject({
      pass_id: 'expand_protocol',
      severity: 'warning',
      code: 'protocol_not_found',
    });
  });

  it('handles empty resolvedRefs gracefully', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState([], []),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(0);
    expect(output.stepsExpanded).toBe(0);
  });

  it('handles missing resolve_references output gracefully', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
    };

    const pass = createExpandProtocolPass(deps);
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'expand_protocol',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(0);
    expect(output.stepsExpanded).toBe(0);
  });

  it('handles missing ai_precompile output gracefully', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'test-protocol',
          name: 'Test Protocol',
          description: '',
          steps: [{ step: 1, verb: 'add_material', params: { targetLabwareRef: 'plate' } }],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_references', { resolvedRefs: [{ kind: 'protocol', label: 'test-protocol', resolvedId: 'test-protocol' }] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'expand_protocol',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(1);
    // Without bindings, the placeholder would be unresolved, but 'plate' is not a placeholder
    expect(output.stepsExpanded).toBe(1);
  });

  it('pass id is expand_protocol and family is expand', () => {
    const pass = createExpandProtocolPass({
      protocolRegistry: makeProtocolRegistry([]),
    });
    expect(pass.id).toBe('expand_protocol');
    expect(pass.family).toBe('expand');
  });

  it('maps protocol verbs to correct event types', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'verb-protocol',
          name: 'Verb Protocol',
          description: '',
          steps: [
            { step: 1, verb: 'add_material', params: {} },
            { step: 2, verb: 'transfer', params: {} },
            { step: 3, verb: 'aliquot', params: {} },
            { step: 4, verb: 'wash', params: {} },
            { step: 5, verb: 'elute', params: {} },
            { step: 6, verb: 'mix', params: {} },
            { step: 7, verb: 'incubate', params: {} },
            { step: 8, verb: 'read', params: {} },
            { step: 9, verb: 'spin', params: {} },
            { step: 10, verb: 'pellet', params: {} },
            { step: 11, verb: 'unknown_verb', params: {} },
          ],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'verb-protocol', resolvedId: 'verb-protocol' }],
        [],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(11);
    expect(output.events[0]).toMatchObject({ event_type: 'add_material' });
    expect(output.events[1]).toMatchObject({ event_type: 'transfer' });
    expect(output.events[2]).toMatchObject({ event_type: 'transfer' }); // aliquot
    expect(output.events[3]).toMatchObject({ event_type: 'transfer' }); // wash
    expect(output.events[4]).toMatchObject({ event_type: 'transfer' }); // elute
    expect(output.events[5]).toMatchObject({ event_type: 'mix' });
    expect(output.events[6]).toMatchObject({ event_type: 'incubate' });
    expect(output.events[7]).toMatchObject({ event_type: 'read' });
    expect(output.events[8]).toMatchObject({ event_type: 'centrifuge' }); // spin
    expect(output.events[9]).toMatchObject({ event_type: 'centrifuge' }); // pellet
    expect(output.events[10]).toMatchObject({ event_type: 'transfer' }); // unknown_verb fallback
  });

  it('non-string params are passed through unchanged', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'mixed-params',
          name: 'Mixed Params',
          description: '',
          steps: [
            { step: 1, verb: 'add_material', params: { targetLabwareRef: '{{plate}}', volumeUl: 200, cycles: 3 } },
          ],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'mixed-params', resolvedId: 'mixed-params' }],
        [{ verb: 'run_protocol', protocolRef: 'mixed-params', bindings: { plate: 'plate-1' } }],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(1);
    const details = (output.events[0] as { details: Record<string, unknown> }).details;
    expect(details.targetLabwareRef).toBe('plate-1');
    expect(details.volumeUl).toBe(200);
    expect(details.cycles).toBe(3);
  });

  it('resolves protocol by resolvedId when label does not match candidateEvents', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'my-protocol',
          name: 'My Protocol',
          description: '',
          steps: [{ step: 1, verb: 'add_material', params: { targetLabwareRef: 'plate' } }],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [{ kind: 'protocol', label: 'my-protocol', resolvedId: 'my-protocol' }],
        [{ verb: 'run_protocol', protocolRef: 'my-protocol', bindings: {} }],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.events).toHaveLength(1);
    expect(output.stepsExpanded).toBe(1);
  });

  it('handles multiple protocol refs', () => {
    const deps: CreateExpandProtocolPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        {
          id: 'proto-a',
          name: 'Proto A',
          description: '',
          steps: [
            { step: 1, verb: 'add_material', params: {} },
            { step: 2, verb: 'mix', params: {} },
          ],
        },
        {
          id: 'proto-b',
          name: 'Proto B',
          description: '',
          steps: [{ step: 1, verb: 'transfer', params: {} }],
        },
      ]),
    };

    const pass = createExpandProtocolPass(deps);
    const result = pass.run({
      pass_id: 'expand_protocol',
      state: makeMockState(
        [
          { kind: 'protocol', label: 'proto-a', resolvedId: 'proto-a' },
          { kind: 'protocol', label: 'proto-b', resolvedId: 'proto-b' },
        ],
        [],
      ),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ExpandProtocolOutput;
    expect(output.stepsExpanded).toBe(3);
    expect(output.events).toHaveLength(3);
  });
});
