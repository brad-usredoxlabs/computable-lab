/**
 * SPINE-7 chatbot-chain byte-identity regression (spec: "chatbot byte-identity
 * regression mandatory").
 *
 * The SPINE-7 seam promises (ChatbotCompilePasses.ts :2378-2382 comment):
 * slot absent (chatbot pipeline) => today's code runs byte-identically. The
 * producer (normalizeScientistIntent wellRole) lives on the scientist-intent
 * chain ONLY, and the transfer expander is a PASSIVE carrier of `wellRole`
 * (never of a chatbot candidate's own `role` param). This file pins both
 * absence guarantees at the pass level:
 *   1. expand_biology_verbs: a chatbot candidate carrying a `role` param is
 *      lowered EXACTLY as before SPINE-7 — no details.role invented, wells
 *      array passes through.
 *   2. resolve_roles: chatbot-shaped state (NO resolve_nouns slot) + an event
 *      with details.role => defaultRoleResolver fallback, byte-identical.
 */
import { describe, expect, it } from 'vitest';
import type { PipelineState } from '../types.js';
import {
  createExpandBiologyVerbsPass,
  createResolveRolesPass,
} from './ChatbotCompilePasses.js';
import { emptyLabState, type LabStateSnapshot } from '../../state/LabState.js';
// side-effect: register the biology-verb expanders (compileScientistIntent idiom)
import '../../biology/verbs/simpleVerbs.js';
import '../../biology/verbs/compoundVerbs.js';
import '../../biology/verbs/centrifugeVerbs.js';

describe('SPINE-7 chatbot byte-identity — expand_biology_verbs', () => {
  it('a chatbot candidate with a `role` param lowers byte-identically (no details.role invented, wells pass through)', () => {
    const state: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [
            { verb: 'transfer', role: 'control_well', wells: ['A1'], labware_id: 'plate-1', volume_uL: 10 },
          ],
        }],
      ]),
      diagnostics: [],
    };
    const res = createExpandBiologyVerbsPass().run({ pass_id: 'expand_biology_verbs', state });
    const events = (res.output as { events: Array<{ details: Record<string, unknown> }> }).events;
    expect(events).toHaveLength(1);
    const details = events[0]!.details;
    // Pre-SPINE-7 shape: the candidate's `role` param was NEVER lowered into
    // details (the expander reads wells/target_well/etc., not role). SPINE-7
    // must not change that: only the scientist-intent `wellRole` key rides.
    expect(Object.keys(details)).not.toContain('role');
    expect(details['wells']).toEqual(['A1']);
    // Pre-SPINE-7 lowering: labware_id ALWAYS rode destination_labware — the
    // byte-identity pin asserts the shipped value, not absence.
    expect(details['destination_labware']).toBe('plate-1');
    expect(details['volumeUl']).toBe(10);
  });

  it('the scientist-intent `wellRole` key IS lowered to details.role (the seam producer path)', () => {
    const state: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [
            { verb: 'transfer', wellRole: 'control_well', labware_id: 'plate-1', volume_uL: 10 },
          ],
        }],
      ]),
      diagnostics: [],
    };
    const res = createExpandBiologyVerbsPass().run({ pass_id: 'expand_biology_verbs', state });
    const events = (res.output as { events: Array<{ details: Record<string, unknown> }> }).events;
    expect(events[0]!.details['role']).toBe('control_well');
    expect(Object.keys(events[0]!.details)).not.toContain('wells');
  });
});

describe('SPINE-7 chatbot byte-identity — resolve_roles slot-absent arm', () => {
  it('chatbot-shaped state (NO resolve_nouns slot): details.role expands via defaultRoleResolver fallback, byte-identical', () => {
    const labState: LabStateSnapshot = {
      ...emptyLabState(),
      labware: {
        'plate-1': {
          instanceId: 'plate-1',
          labwareType: '96-well-plate',
          slot: 'A1',
          orientation: 'landscape',
          wells: {},
        },
      },
    };
    const state: PipelineState = {
      input: { labState },
      context: {},
      meta: {},
      outputs: new Map([
        ['expand_biology_verbs', {
          events: [{
            eventId: 'evt-chatbot-transfer',
            event_type: 'transfer',
            details: { role: 'control_well', labwareInstanceId: 'plate-1' },
          }],
        }],
        // NO 'resolve_nouns' entry — the chatbot pipeline registers no such pass.
      ]),
      diagnostics: [],
    };
    const res = createResolveRolesPass().run({ pass_id: 'resolve_roles', state });
    const events = (res.output as { events: Array<{ eventId: string; details: Record<string, unknown> }> }).events;
    // Today's chatbot behavior: fallback defaultRoleResolver('control_well') = ['A12'].
    expect(events).toHaveLength(1);
    expect(events[0]!.details['well']).toBe('A12');
    expect(events[0]!.details['role']).toBeUndefined();
  });
});
