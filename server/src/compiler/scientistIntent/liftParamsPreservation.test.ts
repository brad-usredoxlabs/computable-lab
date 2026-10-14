/**
 * SHORTHAND-COMP-2 Task 8 (RED-first): the lift must NOT drop the open `params`
 * slot. The corpus TRAINING TARGET is the lifted document
 * (corpus/shorthandCorpus.ts:61 lifts before it stores), so a dropped `params`
 * silently erases the declared composition components from BOTH the compiled
 * document and the training data.
 */
import { describe, expect, it } from 'vitest';
import { liftScientistIntent } from './liftScientistIntent.js';
import { parseScientistIntent } from './parseScientistIntent.js';

describe('lift preserves the open params slot', () => {
  it('keeps params.composition through the lift and past Ajv', () => {
    const lifted = liftScientistIntent({
      intentId: 'seed-mixture',
      actions: [{
        action: 'add_material',
        material: 'HepG2 cell suspension',
        volumeUl: 50,
        params: { composition: [
          { material: 'Thermo DMEM', role: 'buffer_component', fraction: '50%' },
          { material: 'Thermo FBS', role: 'additive', fraction: '10%' },
        ] },
      }],
    });
    const action = (lifted.actions as Array<Record<string, unknown>>)[0]!;
    expect(action.params).toBeDefined();
    expect(((action.params as Record<string, unknown>).composition as unknown[])).toHaveLength(2);
    expect(() => parseScientistIntent(JSON.stringify(lifted))).not.toThrow();
  });

  it('params rides through VERBATIM — no key filtering inside params (Ajv/Stage B own that)', () => {
    const lifted = liftScientistIntent({
      intentId: 'verbatim',
      actions: [{
        action: 'transfer',
        source: 'plate',
        params: { anything: { nested: true }, volume_ul: 'not coerced', count: 5 },
      }],
    });
    const action = (lifted.actions as Array<Record<string, unknown>>)[0]!;
    expect(action.params).toEqual({ anything: { nested: true }, volume_ul: 'not coerced', count: 5 });
  });

  it('a nested `parameters:` object is STILL flattened then skipped (it is not an open slot)', () => {
    const lifted = liftScientistIntent({
      intentId: 'flatten',
      actions: [{ action: 'spin', parameters: { rpm: '1000', duration: '5 min' } }],
    });
    const action = (lifted.actions as Array<Record<string, unknown>>)[0]!;
    expect(action['parameters']).toBeUndefined();
    expect(action['rpm']).toBe(1000);
    expect(action['duration']).toBe('5 min');
  });

  it('a document WITHOUT params lifts byte-identically (additive change pin)', () => {
    const doc = {
      intentId: 'no-params',
      actions: [{ action: 'add_material', material: 'DMEM', volumeUl: 100 }],
    };
    const lifted = liftScientistIntent(doc);
    expect(JSON.stringify(lifted)).toBe(JSON.stringify({
      intentId: 'no-params',
      actions: [{ action: 'add_material', material: 'DMEM', volumeUl: 100 }],
    }));
  });
});
