/**
 * NLPlanner tests — natural-language → GraphQuery planning (spec §16).
 */
import { describe, it, expect } from 'vitest';
import { NLPlanner } from './NLPlanner.js';

describe('NLPlanner (deterministic offline)', () => {
  const planner = new NLPlanner();

  it('maps "wells treated with rotenone" to a well find with treatment expansion', async () => {
    const p = await planner.plan('wells treated with rotenone');
    expect(p.deterministic).toBe(true);
    expect(p.query.op).toBe('find');
    expect(p.query.type).toBe('well');
    expect(p.query.where).toEqual([
      { field: 'treatment.name', operator: 'contains', value: 'rotenone' },
    ]);
    expect(p.explain).toContain('rotenone');
  });

  it('maps "FITC measurements" to a measurement channel find', async () => {
    const p = await planner.plan('show me FITC measurements');
    expect(p.query.type).toBe('measurement');
    expect(p.query.where).toEqual([{ field: 'channel', operator: '=', value: 'FITC' }]);
  });

  it('maps "runs performed by Alice" to a run find', async () => {
    const p = await planner.plan('runs performed by Alice last month');
    expect(p.query.type).toBe('run');
    expect(p.query.where?.[0]?.value).toContain('Alice');
  });

  it('falls back to a free-text well find for anything unknown', async () => {
    const p = await planner.plan('strange phrased query here');
    expect(p.query.op).toBe('find');
    expect(p.query.type).toBe('well');
    expect(p.explain.length).toBeGreaterThan(0);
  });

  it('uses the LLM path when configured and skips determinism flag', async () => {
    const plannerWithLlm = new NLPlanner({
      llmPlan: async () => ({
        query: { op: 'find', type: 'material', where: [{ field: 'name', operator: 'contains', value: 'rotenone' }] },
        explain: 'LLM planned query',
      }),
    });
    const p = await plannerWithLlm.plan('anything');
    expect(p.deterministic).toBe(false);
    expect(p.query.type).toBe('material');
    expect(p.explain).toBe('LLM planned query');
  });

  it('falls back to deterministic when the LLM path throws', async () => {
    const plannerWithLlm = new NLPlanner({
      llmPlan: async () => { throw new Error('llm down'); },
    });
    const p = await plannerWithLlm.plan('wells treated with rotenone');
    expect(p.deterministic).toBe(true);
    expect(p.query.where?.[0]?.value).toBe('rotenone');
  });
});