/**
 * GraphSearchHandlers tests — HTTP surface for the graph query engine.
 */
import { describe, it, expect, vi } from 'vitest';
import { createGraphSearchHandlers } from './GraphSearchHandlers.js';
import type { GraphQueryService } from '../../graph-query/service.js';

function makeReply() {
  return {
    status: vi.fn(function status(this: unknown) { return this; }),
    send: vi.fn((payload: unknown) => payload),
  };
}

const EMPTY_RESULT = {
  query_id: 'qry_test',
  result_type: 'collection',
  objects: [],
  relationships: [],
  summary: { count: 0 },
};

function makeSvc(overrides: Partial<GraphQueryService> = {}): GraphQueryService {
  return {
    engine: {
      execute: vi.fn(async () => EMPTY_RESULT),
    } as never,
    collections: {
      createCollection: vi.fn(() => 'collection:q_1'),
      createSelection: vi.fn(() => 'selection:q_1'),
      getCollection: vi.fn(() => undefined),
      getSelection: vi.fn(() => undefined),
      metadata: vi.fn(() => undefined),
      toAiContext: vi.fn(() => ({ prompt: 'p', selection: 'selection:q_1', nodeIds: ['well:1'] })),
      size: vi.fn(() => 0),
    } as never,
    validation: {
      validate: vi.fn(async () => ({ valid: true, issues: [] })),
    } as never,
    rebuild: vi.fn(async () => {}),
    stats: vi.fn(() => ({ nodes: 0, edges: 0 })),
    ...overrides,
  } as unknown as GraphQueryService;
}

describe('GraphSearchHandlers.search', () => {
  it('runs a canonical find query and returns a GraphResult envelope', async () => {
    const svc = makeSvc();
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    const request = {
      body: { op: 'find', type: 'well', where: [{ field: 'treatment.name', operator: '=', value: 'rotenone' }] },
      log: { error: vi.fn() },
    };
    await handlers.search(request as never, reply as never);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledTimes(1);
    expect(reply.send.mock.calls[0][0]).toHaveProperty('query_id');
  });

  it('rejects a structurally invalid query with invalid_query + issues (400)', async () => {
    const svc = makeSvc();
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    const request = { body: { op: 'explode' }, log: { error: vi.fn() } };
    await handlers.search(request as never, reply as never);
    expect(reply.status).toHaveBeenCalledWith(400);
    const payload = reply.send.mock.calls[0][0] as { error?: string; issues?: unknown[] };
    expect(payload).toHaveProperty('error', 'invalid_query');
    expect(Array.isArray(payload.issues)).toBe(true);
  });

  it('rejects a semantically invalid query via GraphValidation (400)', async () => {
    const svc = makeSvc({
      validation: {
        validate: vi.fn(async () => ({ valid: false, issues: [{ code: 'invalid_relationship', message: 'nope' }] })),
      } as never,
    });
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    const request = { body: { op: 'traverse', start: 'x', relationship: 'bogus' }, log: { error: vi.fn() } };
    await handlers.search(request as never, reply as never);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send.mock.calls[0][0]).toHaveProperty('error', 'invalid_query');
  });

  it('returns 500 when the engine throws', async () => {
    const svc = makeSvc({
      engine: { execute: vi.fn(async () => { throw new Error('boom'); }) } as never,
    });
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    const request = { body: { op: 'find', type: 'well' }, log: { error: vi.fn() } };
    await handlers.search(request as never, reply as never);
    expect(reply.status).toHaveBeenCalledWith(500);
  });
});

describe('GraphSearchHandlers collections', () => {
  it('creates a collection from nodeIds', async () => {
    const svc = makeSvc();
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    await handlers.createCollection({ body: { nodeIds: ['a', 'b'] } } as never, reply as never);
    expect(reply.send).toHaveBeenCalledWith({ ok: true, handle: 'collection:q_1' });
  });

  it('creates a selection from a collection', async () => {
    const svc = makeSvc();
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    await handlers.createSelection({ body: { collection: 'collection:q_1', nodeIds: ['a'] } } as never, reply as never);
    expect(reply.send).toHaveBeenCalledWith({ ok: true, handle: 'selection:q_1' });
  });

  it('returns the AI context for a selection', async () => {
    const svc = makeSvc();
    const handlers = createGraphSearchHandlers(svc);
    const reply = makeReply();
    await handlers.aiContext({ body: { selection: 'selection:q_1', prompt: 'Add X' } } as never, reply as never);
    expect(reply.send).toHaveBeenCalledWith({ prompt: 'p', selection: 'selection:q_1', nodeIds: ['well:1'] });
  });
});