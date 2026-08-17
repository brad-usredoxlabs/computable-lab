/**
 * ContextChain — unit tests (Plan 2, Phase A): consumption gate.
 */

import { describe, it, expect } from 'vitest';
import { buildConsumptionEvents } from './ContextChain.js';

const INPUT = [
  { role: 'source-rna-plate', sourceKind: 'plate-context', consumesByDefault: true },
  { role: 'source-cells', sourceKind: 'material-context', consumesByDefault: false },
];

const BINDINGS = [
  { role: 'source-rna-plate', contextRef: { kind: 'record', type: 'context-snapshot', id: 'CTX-rna-1' } },
  { role: 'source-cells', contextRef: { kind: 'record', type: 'context-snapshot', id: 'CTX-cells-1' } },
];

describe('buildConsumptionEvents', () => {
  it('emits a transfer-off-the-source for each consuming binding', () => {
    const events = buildConsumptionEvents(BINDINGS, INPUT);
    expect(events).toHaveLength(1); // source-cells consumesByDefault:false → skipped
    expect(events[0].event_type).toBe('transfer');
    expect(events[0].details.sourceContextRef).toEqual(BINDINGS[0].contextRef);
    expect(events[0].details.dest?.role).toBe('source-rna-plate');
    expect(events[0].notes).toMatch(/CTX-rna-1/);
  });

  it('respects consumesByDefault:false (gate disabled)', () => {
    const onlyCells = buildConsumptionEvents([BINDINGS[1]], INPUT);
    expect(onlyCells).toEqual([]);
  });

  it('unknown roles yield no events (never throws)', () => {
    const events = buildConsumptionEvents([{ role: 'nope', contextRef: { kind: 'record', type: 'context-snapshot', id: 'CTX-x' } }], INPUT);
    expect(events).toEqual([]);
  });

  it('empty bindings → empty events', () => {
    expect(buildConsumptionEvents([], INPUT)).toEqual([]);
  });
});