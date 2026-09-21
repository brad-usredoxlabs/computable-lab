import { describe, expect, it } from 'vitest';
import { selectSubmitCall } from './selectSubmitCall.js';

const call = (name: string, args: unknown) => ({
  function: { name, arguments: JSON.stringify(args) },
});

const eventGraphDraft = call('agent_intent', {
  intent: 'event_graph',
  events: [{ verb: 'add_material', details: { wells: ['A2'] } }],
});
const createRecord = call('agent_intent', { intent: 'create_record', records: [{ kind: 'material', name: 'HepG2 cells' }] });
const bareCreate = call('agent_intent', { intent: 'create_record' });

describe('one turn, several submit calls', () => {
  it('takes the single call when the model obeyed the contract', () => {
    const out = selectSubmitCall([call('search_records', {}), eventGraphDraft]);
    expect(out.chosen).toBe(eventGraphDraft);
    expect(out.ignored).toEqual([]);
  });

  it('prefers the call that carries draft events over a side-errand', () => {
    // The live failure: [create_record, event_graph] and the draft was thrown away.
    const out = selectSubmitCall([createRecord, eventGraphDraft]);
    expect(out.chosen).toBe(eventGraphDraft);
    expect(out.ignored).toHaveLength(1);
    expect(out.ignored[0]!.reason).toBe('no draft events in it');
  });

  it('keeps the model\u2019s own order when both carry events, and reports the other', () => {
    const second = call('agent_intent', { intent: 'event_graph', events: [{ verb: 'mix' }] });
    const out = selectSubmitCall([eventGraphDraft, second]);
    expect(out.chosen).toBe(eventGraphDraft);
    expect(out.ignored[0]!.reason).toBe('a second draft in the same turn');
  });

  it('falls back to the first call when nothing carries events', () => {
    const out = selectSubmitCall([createRecord, bareCreate]);
    expect(out.chosen).toBe(createRecord);
    expect(out.ignored).toHaveLength(1);
  });

  it('handles nothing, junk args, and non-submit tools', () => {
    expect(selectSubmitCall(undefined)).toEqual({ chosen: null, ignored: [] });
    expect(selectSubmitCall([])).toEqual({ chosen: null, ignored: [] });
    expect(selectSubmitCall([call('search_records', {})]).chosen).toBeNull();
    const junk = { function: { name: 'agent_intent', arguments: 'not json' } };
    expect(selectSubmitCall([junk]).chosen).toBe(junk);
  });
});