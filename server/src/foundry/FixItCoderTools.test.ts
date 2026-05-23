import { describe, expect, it } from 'vitest';
import { makeInspectRegistryTool, makeProbeTool, makeVerifyTool } from './FixItCoderTools.js';

describe('makeVerifyTool', () => {
  it('exposes a no-arg verify tool', () => {
    const tool = makeVerifyTool('/repo', 'spec-fix-X');
    expect(tool.definition.function.name).toBe('verify');
    expect(tool.definition.function.parameters.properties).toEqual({});
  });
});

describe('makeInspectRegistryTool', () => {
  it('exposes an inspect_registry tool with a registry-name enum and optional key', () => {
    const tool = makeInspectRegistryTool('/repo');
    expect(tool.definition.function.name).toBe('inspect_registry');
    expect(tool.definition.function.parameters.required).toContain('name');
    expect(tool.definition.function.parameters.required).not.toContain('key');
    const props = tool.definition.function.parameters.properties as Record<
      string,
      { type: string; enum?: string[] }
    >;
    expect(props['name']?.enum).toContain('labware-definitions');
    expect(props['name']?.enum).toContain('ontology-terms');
  });

  it('rejects an empty registry name without shelling out', async () => {
    const tool = makeInspectRegistryTool('/repo');
    const result = await tool.handler({ name: '  ' });
    expect(result.ok).toBe(false);
    expect(result.content).toContain('name is required');
  });

  it('reports unavailable when the harness is missing from the repo', async () => {
    const tool = makeInspectRegistryTool('/nonexistent-repo-root');
    const result = await tool.handler({ name: 'labware-definitions' });
    expect(result.ok).toBe(false);
    expect(result.content).toContain('unavailable');
  });
});

describe('makeProbeTool', () => {
  it('exposes a probe tool requiring a prompt', () => {
    const tool = makeProbeTool('/repo');
    expect(tool.definition.function.name).toBe('probe');
    expect(tool.definition.function.parameters.required).toContain('prompt');
  });

  it('declares an optional `fields` array parameter', () => {
    const tool = makeProbeTool('/repo');
    const props = tool.definition.function.parameters.properties as Record<string, { type: string; items?: unknown }>;
    expect(props['fields']).toBeDefined();
    expect(props['fields']?.type).toBe('array');
    expect(tool.definition.function.parameters.required).not.toContain('fields');
  });

  it('rejects an empty prompt without shelling out', async () => {
    const tool = makeProbeTool('/repo');
    const result = await tool.handler({ prompt: '   ' });
    expect(result.ok).toBe(false);
    expect(result.content).toContain('prompt is required');
  });

  it('reports unavailable when the harness is missing from the repo', async () => {
    const tool = makeProbeTool('/nonexistent-repo-root');
    const result = await tool.handler({ prompt: 'Place a 96-well plate on B2' });
    expect(result.ok).toBe(false);
    expect(result.content).toContain('unavailable');
  });
});
