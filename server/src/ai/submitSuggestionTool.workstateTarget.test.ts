/**
 * PB-CH-6 fix1 F2 — tool-menu target alignment (reflection, not policy).
 *
 * The compile envelope (schema/workflow/workstate-intent.schema.yaml) has
 * `required: [surface, target]` per tab and a target oneOf {term} xor
 * {recordId}, each branch additionalProperties:false. The rendered menu was
 * blind to it (gate receipts: bare-surface tabs rejected MALFORMED_ENVELOPE).
 * The menu now mirrors what the registered schemas require — nothing more.
 *
 * Finding pinned here: analysis-intent.schema.yaml `open.tabs.items` carries
 * the SAME requirement ([surface, target] + targetRef oneOf), so the `open`
 * sub-tabs mirror it too. (workstate-intent governs compose_workstate tabs.)
 */
import { describe, expect, it } from 'vitest';
import { AGENT_INTENT_TOOL_DEF, buildAgentIntentToolDef } from './submitSuggestionTool.js';

interface JsonSchemaNode {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode>;
}

function toolParams(): { properties: Record<string, JsonSchemaNode> } {
  return AGENT_INTENT_TOOL_DEF.function.parameters as unknown as {
    properties: Record<string, JsonSchemaNode>;
  };
}

function workstateTabItems(): JsonSchemaNode {
  return toolParams().properties['workstate']!.properties!['tabs']!.items!;
}

function openTabItems(): JsonSchemaNode {
  return toolParams().properties['analysis']!.properties!['open']!.properties!['tabs']!.items!;
}

function assertTargetMirror(target: JsonSchemaNode, context: string): void {
  expect(target.oneOf, `${context}: target is a oneOf`).toHaveLength(2);
  const [termBranch, recordBranch] = target.oneOf!;
  expect(termBranch!.required).toEqual(['term']);
  expect(termBranch!.additionalProperties).toBe(false);
  expect(termBranch!.properties?.['term']?.type).toBe('string');
  expect(recordBranch!.required).toEqual(['recordId']);
  expect(recordBranch!.additionalProperties).toBe(false);
  expect(recordBranch!.properties?.['recordId']?.type).toBe('string');
}

describe('agent_intent menu — workstate tab target alignment (PB-CH-6 fix1 F2)', () => {
  it('workstate.tabs.items requires [surface, target] — mirror of workstate-intent.schema.yaml', () => {
    expect(workstateTabItems().required).toEqual(['surface', 'target']);
  });

  it('workstate tab target is oneOf {term} xor {recordId}, each branch additionalProperties:false + its own required', () => {
    assertTargetMirror(workstateTabItems().properties!['target']!, 'compose_workstate tab');
  });

  it('analysis open.tabs.items carries the SAME requirement — analysis-intent.schema.yaml requires [surface, target] there too', () => {
    expect(openTabItems().required).toEqual(['surface', 'target']);
    assertTargetMirror(openTabItems().properties!['target']!, 'compose_analysis open tab');
  });

  it('the registry-rendered clone (buildAgentIntentToolDef) carries the same required lists (menu/schema parity survives the surface-vocab render)', () => {
    const def = buildAgentIntentToolDef(['alpha', 'beta']);
    expect(def).not.toBe(AGENT_INTENT_TOOL_DEF);
    const params = def.function.parameters as unknown as { properties: Record<string, JsonSchemaNode> };
    expect(params.properties['workstate']!.properties!['tabs']!.items!.required).toEqual(['surface', 'target']);
    expect(params.properties['analysis']!.properties!['open']!.properties!['tabs']!.items!.required).toEqual(['surface', 'target']);
  });
});
