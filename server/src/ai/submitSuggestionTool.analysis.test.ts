/**
 * PB-CH-5 — the `compose_analysis` intent on agent_intent.
 *
 * Pinned here:
 *  - the intent menu is exactly the declared seven-intent set (the deliberate
 *    six→seven golden delta, PB-CH-5);
 *  - the tool schema carries the `analysis` envelope so the model can fill it;
 *  - parseAgentIntentArgs retains the analysis envelope VERBATIM (by reference,
 *    no copy/filter — the `ops`/`action`/`workstate` discipline);
 *  - a compose_analysis call with no analysis object parses to no envelope
 *    (the orchestrator's error channel owns the correction).
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  AGENT_INTENT_TOOL_NAME,
  parseAgentIntentArgs,
} from './submitSuggestionTool.js';

describe('agent_intent — compose_analysis intent (PB-CH-5)', () => {
  it('exposes a SEVEN-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate | compose_analysis)', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[] }>;
    };
    expect(params.required).toEqual(['intent']);
    expect(params.properties.intent?.type).toBe('string');
    // PB-CH-5 deliberately widened the menu to seven: compose_analysis is the
    // analysis composition mount. It carries the model's analysis INTENT (terms
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

  it('carries the analysis envelope on the tool schema so the model can fill it', () => {
    const props = (AGENT_INTENT_TOOL_DEF.function.parameters as {
      properties: Record<string, { type?: string }>;
    }).properties;
    expect(props.analysis?.type).toBe('object');
    expect(AGENT_INTENT_TOOL_NAME).toBe('agent_intent');
  });

  it('the envelope description states the compile/queued/never-executes contract', () => {
    const props = (AGENT_INTENT_TOOL_DEF.function.parameters as {
      properties: Record<string, { description?: string }>;
    }).properties;
    const desc = props.analysis?.description ?? '';
    expect(desc).toMatch(/QUEUED/);
    expect(desc).toMatch(/NEVER executes/);
    expect(desc).toMatch(/NEVER promotes/);
  });

  it('parses compose_analysis and retains the analysis envelope VERBATIM', () => {
    const analysis = {
      operation: 'compose-analysis',
      target: {
        revision: { term: 'ROS mitochondrial flux analysis' },
        newRun: { title: 'Fresh ROS run', inputs: { trace: { term: 'Seahorse trace file' } } },
      },
      focus: 'run',
    };
    const parsed = parseAgentIntentArgs({ intent: 'compose_analysis', analysis });
    expect(parsed.intent).toBe('compose_analysis');
    // VERBATIM: the SAME object reference — no copy, no filter, no reorder.
    expect(parsed.analysis).toBe(analysis);
  });

  it('a compose_analysis call with no analysis object parses with NO envelope (the orchestrator corrects)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_analysis' });
    expect(parsed.intent).toBe('compose_analysis');
    expect(parsed.analysis).toBeUndefined();
  });

  it('a compose_analysis call with a non-object analysis drops the envelope (never guesses one)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_analysis', analysis: 'compose-analysis' });
    expect(parsed.intent).toBe('compose_analysis');
    expect(parsed.analysis).toBeUndefined();
  });

  it('an unknown intent still parses to unknown', () => {
    expect(parseAgentIntentArgs({ intent: 'compose_chaos' })).toEqual({ intent: 'unknown' });
  });
});
