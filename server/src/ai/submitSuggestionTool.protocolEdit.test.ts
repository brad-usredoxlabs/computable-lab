/**
 * PROTO-AI-7 — `protocol_edit` as a FOURTH intent on the single forced
 * `agent_intent` tool (PB-CH-1 widened the menu to five: workspace_action).
 *
 * The model answers a protocol-edit request with `{ intent: 'protocol_edit',
 * ops: [...] }` — the PROTO-AI-2 envelope. This file pins the PARSE layer only
 * (the schema validation and zero-write dispatch are AgentOrchestrator
 * .protocolEdit.test.ts): the intent menu is exactly the declared set, `ops`
 * ride the tool schema, and the parser retains the ops array VERBATIM — an
 * edit proposal that gets "helpfully" rewritten on the way to validation is
 * no longer the model's answer.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  AGENT_INTENT_TOOL_NAME,
  parseAgentIntentArgs,
} from './submitSuggestionTool.js';

describe('agent_intent — protocol_edit intent (PROTO-AI-7)', () => {
  it('exposes a seven-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate | compose_analysis)', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[] }>;
    };
    expect(params.required).toEqual(['intent']);
    expect(params.properties.intent?.type).toBe('string');
    // PB-CH-1 deliberately widened the menu to five; PB-CH-4 deliberately widened
    // it to SIX; PB-CH-5 deliberately widens it to SEVEN: compose_analysis is the
    // analysis composition mount (the orchestrator emits the analysis envelope
    // VERBATIM; POST /api/drafts/compile — Ajv + canAccept — is the trust
    // boundary; see AgentOrchestrator.analysisProposal.test.ts).
    expect(params.properties.intent?.enum).toEqual([
      'event_graph',
      'deck_layout',
      'create_record',
      'protocol_edit',
      'workspace_action',
      'compose_workstate',
      'compose_analysis',
    ]);
  });

  it('carries the ops array on the tool schema so the model can fill it', () => {
    const props = (AGENT_INTENT_TOOL_DEF.function.parameters as {
      properties: Record<string, { type?: string; items?: unknown }>;
    }).properties;
    expect(props.ops?.type).toBe('array');
    expect(props.ops?.items).toBeDefined();
    expect(AGENT_INTENT_TOOL_NAME).toBe('agent_intent');
  });

  it('parses protocol_edit and retains the ops array VERBATIM', () => {
    const ops = [
      { op: 'step_delete', stepId: 'step-003' },
      {
        op: 'step_update',
        stepId: 'step-001',
        label: 'Incubate lysate',
        settings: [{ settingId: 'temperature', label: 'Temperature', type: 'temperature', unit: 'C', defaultValue: 37 }],
      },
    ];
    const parsed = parseAgentIntentArgs({ intent: 'protocol_edit', ops });
    expect(parsed.intent).toBe('protocol_edit');
    // Verbatim: identity, not merely deep-equality — nothing between the model
    // and the schema validator may copy, filter, or reorder the ops.
    expect(parsed.ops).toBe(ops);
  });

  it('retains an optional protocolId and drops a non-string one', () => {
    const withId = parseAgentIntentArgs({ intent: 'protocol_edit', ops: [], protocolId: 'PRT-000123' });
    expect(withId.protocolId).toBe('PRT-000123');
    const badId = parseAgentIntentArgs({ intent: 'protocol_edit', ops: [], protocolId: 7 });
    expect(badId.protocolId).toBeUndefined();
  });

  it('unknown intents still fall to intent:"unknown" (protocol_edit did not widen the accept set)', () => {
    expect(parseAgentIntentArgs({ intent: 'explode_the_lab', variantId: 7 })).toEqual({ intent: 'unknown' });
    expect(parseAgentIntentArgs({ intent: 'protocol-edit', ops: [] })).toEqual({ intent: 'unknown' });
    expect(parseAgentIntentArgs({})).toEqual({ intent: 'unknown' });
  });
});
