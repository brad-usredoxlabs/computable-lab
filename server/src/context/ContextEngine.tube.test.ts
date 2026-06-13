import { describe, it, expect } from 'vitest';
import { ContextEngine } from './ContextEngine.js';
import type { EventGraph } from './types.js';

describe('ContextEngine — tube verbs', () => {
  it('replays place_tube / move_tube / remove_tube without throwing', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-TUBE-1',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'place_tube', details: { labwareId: 'rack', wells: ['A1'], tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 } } },
        { event_type: 'move_tube', details: { source: { labwareId: 'rack', well: 'A1' }, target: { labwareId: 'rack', well: 'B2' } } },
        { event_type: 'remove_tube', details: { labwareId: 'rack', wells: ['B2'] } },
      ],
    };
    expect(() =>
      engine.computeContext({ kind: 'record', id: 'LI-1', type: 'labware-instance' }, graph),
    ).not.toThrow();
  });
});
