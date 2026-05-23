import { describe, expect, it } from 'vitest';
import { makeProbeTool, makeResolveLabwareTool, makeVerifyTool } from './FixItCoderTools.js';

describe('makeVerifyTool', () => {
  it('exposes a no-arg verify tool', () => {
    const tool = makeVerifyTool('/repo', 'spec-fix-X');
    expect(tool.definition.function.name).toBe('verify');
    expect(tool.definition.function.parameters.properties).toEqual({});
  });
});

describe('makeResolveLabwareTool', () => {
  it('exposes a resolve_labware tool requiring a hint', () => {
    const tool = makeResolveLabwareTool('/repo');
    expect(tool.definition.function.name).toBe('resolve_labware');
    expect(tool.definition.function.parameters.required).toContain('hint');
  });

  it('rejects an empty hint without shelling out', async () => {
    const tool = makeResolveLabwareTool('/repo');
    const result = await tool.handler({ hint: '  ' });
    expect(result.ok).toBe(false);
    expect(result.content).toContain('hint is required');
  });

  it('reports unavailable when the harness is missing from the repo', async () => {
    const tool = makeResolveLabwareTool('/nonexistent-repo-root');
    const result = await tool.handler({ hint: '12-well reservoir' });
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
