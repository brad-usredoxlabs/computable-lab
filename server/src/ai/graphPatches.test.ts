import { describe, it, expect } from 'vitest';
import { clarificationAnswersToPatches, applyPatches, type GraphPatch } from './graphPatches.js';
import { createEmptyProtocolIntent } from '../compiler/protocolIntent/ProtocolIntent.js';
import type { AgentClarificationAnswer } from './types.js';

describe('graphPatches', () => {
  it('converts clarification answers to bind_entity patches', () => {
    const answers: AgentClarificationAnswer[] = [
      {
        requestId: 'mention-1',
        label: 'Clofibrate',
        mentionToken: '[[material:MAT-1|Clofibrate]]',
        ref: { kind: 'record', id: 'MAT-1', label: 'Clofibrate' },
      },
    ];
    const intent = createEmptyProtocolIntent({});
    const patches = clarificationAnswersToPatches(answers, intent);
    expect(patches).toHaveLength(1);
    expect(patches[0].op).toBe('bind_entity');
  });

  it('rejects bind_entity when mention not found', () => {
    const intent = createEmptyProtocolIntent({});
    const patch: GraphPatch = {
      op: 'bind_entity',
      mentionId: 'nonexistent',
      binding: { localRef: { kind: 'record', id: 'MAT-1', label: 'test' } },
    };
    const result = applyPatches(intent, [patch]);
    expect(result.rejected).toHaveLength(1);
    expect(result.applied).toHaveLength(0);
  });

  it('rejects set_parameter when operation not found', () => {
    const intent = createEmptyProtocolIntent({});
    const patch: GraphPatch = {
      op: 'set_parameter',
      operationId: 'nonexistent',
      path: 'duration',
      value: 'PT16H',
    };
    const result = applyPatches(intent, [patch]);
    expect(result.rejected).toHaveLength(1);
  });

  it('applies add_execution_constraint unconditionally', () => {
    const intent = createEmptyProtocolIntent({});
    const patch: GraphPatch = {
      op: 'add_execution_constraint',
      target: 'op-1',
      constraint: { capability: 'temperature_controlled_shaking' },
    };
    const result = applyPatches(intent, [patch]);
    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });
});
