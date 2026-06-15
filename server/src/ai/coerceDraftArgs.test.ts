import { describe, expect, it } from 'vitest';
import { coerceDraftArgsFromContent } from './AgentOrchestrator.js';

describe('coerceDraftArgsFromContent', () => {
  it('unwraps a <tool_call> envelope emitted as plain content', () => {
    const content = `<tool_call>\n{"name":"compile_event_graph_draft","arguments":{"events":[{"verb":"add_material"}]}}\n</tool_call>`;
    expect(coerceDraftArgsFromContent(content)).toEqual({ events: [{ verb: 'add_material' }] });
  });

  it('unwraps an envelope whose arguments is a JSON-encoded string', () => {
    const content = `{"name":"compile_event_graph_draft","arguments":"{\\"events\\":[],\\"notes\\":\\"x\\"}"}`;
    expect(coerceDraftArgsFromContent(content)).toEqual({ events: [], notes: 'x' });
  });

  it('accepts a bare argument object in a fenced block', () => {
    const content = '```json\n{"labwareRequirements":[{"classCurie":"CL:96_well_plate"}]}\n```';
    expect(coerceDraftArgsFromContent(content)).toEqual({ labwareRequirements: [{ classCurie: 'CL:96_well_plate' }] });
  });

  it('accepts a clarification-only draft', () => {
    const content = '{"clarificationRequests":[{"id":"c1","kind":"material","prompt":"which?"}]}';
    expect(coerceDraftArgsFromContent(content)?.clarificationRequests).toBeTruthy();
  });

  it('returns null for prose with no JSON (caller re-asks)', () => {
    expect(coerceDraftArgsFromContent('Sure! I added 200 µL of DMEM to A1.')).toBeNull();
  });

  it('returns null for unrelated JSON with no draft keys (never fed to the compiler)', () => {
    expect(coerceDraftArgsFromContent('Here is an example: {"foo":1,"bar":2}')).toBeNull();
  });

  it('returns null for non-string content', () => {
    expect(coerceDraftArgsFromContent(null)).toBeNull();
    expect(coerceDraftArgsFromContent(undefined)).toBeNull();
  });
});
