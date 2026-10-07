/**
 * PB-CH-4 — `compose_workstate` as the SIXTH intent on the single forced
 * `agent_intent` tool (the chat→draft proposal-emission mount PB-CH-2 assigned
 * to this item).
 *
 * Pins (spec §4 + matrix row "server emission"):
 *  - the intent menu is exactly the declared seven-intent set (the deliberate
 *    five→SIX pin delta — golden-test discipline, diff called out in the report);
 *  - the parser retains the `workstate` envelope VERBATIM (identity, not a copy):
 *    the model's own answer rides to the emission path untouched;
 *  - an INVALID envelope still parses verbatim — the parser never "helps" and
 *    the server never client-side-compiles here: /api/drafts/compile (Ajv +
 *    canAccept) is the trust boundary (OQ1 ruling).
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  AGENT_INTENT_TOOL_NAME,
  parseAgentIntentArgs,
} from './submitSuggestionTool.js';

describe('agent_intent — compose_workstate intent (PB-CH-4)', () => {
  it('exposes a SEVEN-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate | compose_analysis)', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[] }>;
    };
    expect(params.required).toEqual(['intent']);
    expect(params.properties.intent?.type).toBe('string');
    // PB-CH-4 deliberately widened the menu to six; PB-CH-5 deliberately widens
    // it to seven: compose_analysis carries the model's analysis INTENT (terms
    // only); the drafts compile endpoint — not this tool — resolves and gates it.
    // PB-CH-8 deliberately widens it to eight (query_workstate_history — the
    // ledger READ riding the ONE forced tool; the server owns the time anchor).
    expect(params.properties.intent?.enum).toEqual([
      'event_graph',
      'deck_layout',
      'create_record',
      'protocol_edit',
      'workspace_action',
      'compose_workstate',
      'compose_analysis',
      'query_workstate_history',
    ]);
  });

  it('carries the workstate envelope on the tool schema so the model can fill it', () => {
    const props = (AGENT_INTENT_TOOL_DEF.function.parameters as {
      properties: Record<string, { type?: string }>;
    }).properties;
    expect(props.workstate?.type).toBe('object');
    expect(AGENT_INTENT_TOOL_NAME).toBe('agent_intent');
  });

  it('parses compose_workstate and retains the workstate envelope VERBATIM', () => {
    const workstate = {
      operation: 'compose-workstate',
      tabs: [
        { surface: 'run-design', target: { term: 'ROS run' } },
        { surface: 'analysis', target: { recordId: 'AN-0007' } },
      ],
      activeTab: { index: 0 },
    };
    const parsed = parseAgentIntentArgs({ intent: 'compose_workstate', workstate });
    expect(parsed.intent).toBe('compose_workstate');
    // Verbatim: identity, not merely deep-equality — nothing between the model
    // and the compile endpoint may copy, filter, or "help" the proposal.
    expect(parsed.workstate).toBe(workstate);
  });

  it('an invalid workstate envelope still parses verbatim — /api/drafts/compile owns the diagnostic (the server never client-side-compiles here)', () => {
    // Missing `operation`, a tab with no target, a numeric surface: all real
    // workstate-intent schema violations. The parser passes them through —
    // the compile endpoint's Ajv gate + canAccept:false is the trust boundary.
    const garbage = { tabs: [{ surface: 7 }, 'not-a-tab'], activeTab: { index: -1 } };
    const parsed = parseAgentIntentArgs({ intent: 'compose_workstate', workstate: garbage });
    expect(parsed.intent).toBe('compose_workstate');
    expect(parsed.workstate).toBe(garbage);
  });

  it('a compose_workstate call with no workstate object falls to the intent with no envelope (still not a compile)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_workstate' });
    expect(parsed.intent).toBe('compose_workstate');
    expect(parsed.workstate).toBeUndefined();
  });

  it('unknown intents still fall to intent:"unknown" (compose_workstate did not widen the accept set)', () => {
    expect(parseAgentIntentArgs({ intent: 'compose-workstate', workstate: {} })).toEqual({ intent: 'unknown' });
    expect(parseAgentIntentArgs({ intent: 'explode_the_lab', workstate: {} })).toEqual({ intent: 'unknown' });
    expect(parseAgentIntentArgs({})).toEqual({ intent: 'unknown' });
  });
});
