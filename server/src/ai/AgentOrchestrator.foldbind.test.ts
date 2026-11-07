// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bindFoldPicksOntoCompile } from './AgentOrchestrator.js';
import type { AgentClarificationAnswer } from './types.js';

describe('L2-PROMPT2-SCIENCE-CHAIN-1 fold-path bind', () => {
  it('binds two composition_snapshot entries by label match', () => {
    // Events carry draft mints — the fold path defect: answers are dropped
    // because bindMaterialAnswersToEvents is never called on this path.
    const events = [
      {
        event_type: 'add_material',
        details: {
          labwareId: 'LBW-test',
          wells: ['A1'],
          material_ref: { kind: 'draft', id: 'mint:mixture', label: 'mixture' },
          composition_snapshot: [
            {
              component_ref: { kind: 'draft', id: 'mint:1 mM Clofibrate in DMSO', label: '1 mM Clofibrate in DMSO' },
              role: 'solute',
            },
            {
              component_ref: { kind: 'draft', id: 'mint:DMSO', label: 'DMSO' },
              role: 'solvent',
            },
          ],
        },
      },
    ];
    const compiled = {
      terminalArtifacts: { events: events as any },
      normalized: {} as any,
      outcome: 'events' as const,
      diagnostics: [],
      clarifications: [],
    };
    // Held-fact requestIds (unresolved-c-* format — not material-<n>)
    const answers: AgentClarificationAnswer[] = [
      {
        requestId: 'unresolved-c-solute',
        label: '1 mM Clofibrate in DMSO',
        ref: { kind: 'record', id: 'MSP-clofibrate', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
      },
      {
        requestId: 'unresolved-c-solvent',
        label: 'DMSO',
        ref: { kind: 'record', id: 'MAT-dmsolater', type: 'material', label: 'DMSO' },
      },
    ];
    // Before binding: events carry mints (the defect)
    expect((events[0] as any).details.composition_snapshot[0].component_ref.kind).toBe('draft');

    const { boundCompiled, bound, unbound } = bindFoldPicksOntoCompile(
      compiled as any,
      answers,
    );

    expect(bound).toHaveLength(2);
    expect(unbound).toHaveLength(0);
    const snapshot = (boundCompiled.terminalArtifacts.events[0] as any).details.composition_snapshot;

    // Solute entry: bound to record ref with material-spec type
    expect(snapshot[0].component_ref).toMatchObject({
      kind: 'record',
      id: 'MSP-clofibrate',
      type: 'material-spec',
    });
    expect(snapshot[0].role).toBe('solute');

    // Solvent entry: bound to record ref with material type
    expect(snapshot[1].component_ref).toMatchObject({
      kind: 'record',
      id: 'MAT-dmsolater',
      type: 'material',
    });
    expect(snapshot[1].role).toBe('solvent');
  });

  it('is a no-op when answers carry no ref (unbound -> events unchanged)', () => {
    const events = [
      {
        event_type: 'add_material',
        details: {
          composition_snapshot: [
            { component_ref: { kind: 'draft', id: 'mint:X', label: 'X' }, role: 'solute' },
          ],
        },
      },
    ];
    const compiled = {
      terminalArtifacts: { events: events as any },
      normalized: {} as any,
      outcome: 'events' as const,
      diagnostics: [],
      clarifications: [],
    };
    const answers: AgentClarificationAnswer[] = [
      { requestId: 'unresolved-c-X', label: 'X' }, // no ref
    ];

    const { boundCompiled, bound, unbound } = bindFoldPicksOntoCompile(
      compiled as any,
      answers,
    );
    expect(bound).toHaveLength(0);
    expect(unbound).toHaveLength(1);
    // Events unchanged — no guessed ref
    expect((boundCompiled.terminalArtifacts.events[0] as any).details.composition_snapshot[0].component_ref.kind).toBe('draft');
  });
});
