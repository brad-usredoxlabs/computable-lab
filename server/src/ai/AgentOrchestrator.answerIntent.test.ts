import { describe, expect, it, vi } from 'vitest';
import { parseAgentIntentArgs, AGENT_INTENT_TOOL_DEF } from './submitSuggestionTool.js';
import type { AgentIntentArgs } from './submitSuggestionTool.js';

describe('answer intent — parser and tool definition', () => {
  it('parses answer intent with text retained', () => {
    const result = parseAgentIntentArgs({
      intent: 'answer',
      text: 'This sequences workspace tracks sequence records and their runs.',
    });
    expect(result.intent).toBe('answer');
    expect(result.text).toBe('This sequences workspace tracks sequence records and their runs.');
  });

  it('rejects answer intent without text — falls to unknown', () => {
    const result = parseAgentIntentArgs({ intent: 'answer' });
    expect(result.intent).toBe('unknown');
  });

  it('rejects answer intent with empty string text — falls to unknown', () => {
    const result = parseAgentIntentArgs({ intent: 'answer', text: '' });
    expect(result.intent).toBe('unknown');
  });

  it('rejects answer intent with whitespace-only text — falls to unknown', () => {
    const result = parseAgentIntentArgs({ intent: 'answer', text: '   ' });
    expect(result.intent).toBe('unknown');
  });

  it('unknown intents still parse as unknown', () => {
    expect(parseAgentIntentArgs({ intent: 'explode_the_lab' }).intent).toBe('unknown');
  });

  it('tool definition enum includes answer', () => {
    const props = AGENT_INTENT_TOOL_DEF.function.parameters as { properties: Record<string, { enum?: string[] }> };
    expect(props.properties.intent?.enum).toContain('answer');
  });
});
