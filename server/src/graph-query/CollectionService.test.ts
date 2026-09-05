/**
 * CollectionService tests — ephemeral collection/selection handles (spec §7).
 */
import { describe, it, expect } from 'vitest';
import { CollectionService } from './CollectionService.js';

describe('CollectionService', () => {
  it('creates a collection handle and resolves it back to node ids', () => {
    const svc = new CollectionService();
    const handle = svc.createCollection(['well:1:A1', 'well:1:A2', 'well:1:A3']);
    expect(handle).toMatch(/^collection:q_/);
    const nodeIds = svc.getCollection(handle);
    expect(nodeIds).toEqual(['well:1:A1', 'well:1:A2', 'well:1:A3']);
  });

  it('creates a selection handle from a subset of a collection', () => {
    const svc = new CollectionService();
    const collectionHandle = svc.createCollection(['well:1:A1', 'well:1:A2', 'well:1:A3', 'well:1:A4']);
    const selection = svc.createSelection(collectionHandle, ['well:1:A2', 'well:1:A4']);
    expect(selection).toMatch(/^selection:/);
    expect(svc.getSelection(selection)).toEqual(['well:1:A2', 'well:1:A4']);
  });

  it('rejects a selection drawn from a collection the caller never created', () => {
    const svc = new CollectionService();
    expect(() => svc.createSelection('collection:nope', ['well:1:A1'])).toThrow(/collection/);
  });

  it('preserves per-handle provenance (which collection/selection a node came from)', () => {
    const svc = new CollectionService();
    const c = svc.createCollection(['well:1:A1']);
    const s = svc.createSelection(c, ['well:1:A1']);
    expect(svc.metadata(c)?.kind).toBe('collection');
    expect(svc.metadata(s)?.kind).toBe('selection');
    expect(svc.metadata(s)?.sourceCollection).toBe(c);
  });

  it('toAiContext: turns a selection handle into an AI-consumable prompt + node ids', () => {
    const svc = new CollectionService();
    const c = svc.createCollection(['well:1:A1', 'well:1:A2']);
    const s = svc.createSelection(c, ['well:1:A1']);
    const ctx = svc.toAiContext(s, 'Add rotenone to these');
    expect(ctx.prompt).toBe('Add rotenone to these');
    expect(ctx.selection).toBe(s);
    expect(ctx.nodeIds).toEqual(['well:1:A1']);
  });

  it('is ephemeral and empty by default', () => {
    const svc = new CollectionService();
    expect(svc.getCollection('collection:nope')).toBeUndefined();
    expect(svc.size()).toBe(0);
  });
});