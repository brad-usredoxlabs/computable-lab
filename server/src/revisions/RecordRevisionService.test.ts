import { describe, expect, it } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { RecordRevisionService, contentHash, revisionRef, token } from './RecordRevisionService.js';
import { acceptProtocolGraph, pinRunProtocol } from './ProtocolUseService.js';

import { memoryStore } from './testStore.js';

describe('immutable protocol revisions', () => {
  it('saves drafts without freezing; first use and later changed uses allocate minor versions', async () => {
    const { store, protocol, put } = memoryStore();
    const service = new RecordRevisionService(store);
    expect(await service.list('PRT-1')).toEqual([]);
    const first = await service.freezeProtocol('PRT-1', 'USR-A', token(protocol));
    expect(first.payload.version).toBe('1.0.0');
    expect((await service.freezeProtocol('PRT-1', 'USR-A')).recordId).toBe(first.recordId);
    const next = put({ ...protocol, payload: { ...(protocol.payload as any), notes: 'Use cold buffer' } });
    expect(await service.draftVersion('PRT-1', next.payload)).toBe('1.1.0-draft');
    const second = await service.freezeProtocol('PRT-1', 'USR-B');
    expect(second.payload.version).toBe('1.1.0');
    expect(first.payload.snapshot).not.toHaveProperty('notes');
    expect((await service.resolve({ id: 'PRT-1', revisionRef: revisionRef(first.recordId) }))?.payload).toEqual(first.payload.snapshot);
  });
  it('does not allocate new versions for timestamp/editor-only changes or concurrent requests', async () => {
    const { store, protocol, put } = memoryStore();
    const service = new RecordRevisionService(store);
    const versions = await Promise.all(Array.from({ length: 5 }, () => service.freezeProtocol('PRT-1', 'USR-A')));
    expect(new Set(versions.map(v => v.recordId)).size).toBe(1);
    put({ ...protocol, payload: { ...(protocol.payload as any), updatedAt: '2026-10-04', authoring: { sessionRef: {} } } });
    expect((await service.freezeProtocol('PRT-1', 'USR-A')).recordId).toBe(versions[0]!.recordId);
  });
  it('rejects stale graph sources and then accepts a regenerated graph idempotently', async () => {
    const { store, protocol, put } = memoryStore();
    const graph = put({ recordId: 'EVG-1', schemaId: 'event-graph', payload: { kind: 'event-graph', events: [{}], protocolSource: { recordId: 'PRT-1', sourceToken: token(protocol), contentHash: contentHash(protocol.payload) } } });
    const next = put({ ...protocol, payload: { ...(protocol.payload as any), title: 'Changed' } });
    await expect(acceptProtocolGraph(store, graph.recordId, 'USR-A', token(graph)!)).rejects.toMatchObject({ code: 'STALE_PROTOCOL' });
    const regenerated = put({ ...graph, payload: { ...(graph.payload as any), protocolSource: { recordId: next.recordId, contentHash: contentHash(next.payload), sourceToken: token(next) } } });
    const accepted = await acceptProtocolGraph(store, graph.recordId, 'USR-A', token(regenerated)!);
    expect(accepted.revision.payload.version).toBe('1.0.0');
    expect((await acceptProtocolGraph(store, graph.recordId, 'USR-A', token(regenerated)!)).revision.recordId).toBe(accepted.revision.recordId);
    const run = put({ recordId: 'RUN-1', schemaId: 'run', payload: { kind: 'run', plannedEventGraphId: graph.recordId } });
    put({ ...next, payload: { ...(next.payload as any), title: 'Changed again' } });
    expect(await pinRunProtocol(store, run, 'USR-A')).toEqual({ protocolRevisionRef: revisionRef(accepted.revision.recordId), protocolVersion: '1.0.0' });
  });
  it('never fabricates a historical pin for an existing graph without source provenance', async () => {
    const { store, put } = memoryStore();
    put({ recordId: 'EVG-OLD', schemaId: 'event-graph', payload: { kind: 'event-graph', events: [{}] } });
    const run = put({ recordId: 'RUN-OLD', schemaId: 'run', payload: { kind: 'run', plannedEventGraphId: 'EVG-OLD', protocolRef: { id: 'PRT-1' } } });
    expect(await pinRunProtocol(store, run, 'USR-A')).toEqual({});
  });
  it('stores exact signature snapshots and never calls a file hash a git commit', async () => {
    const { store, protocol } = memoryStore();
    const snapshot = await new RecordRevisionService(store).capture(protocol, 'USR-A', 'signature');
    expect(snapshot.payload.contentHash).toBe(contentHash(protocol.payload));
    expect(snapshot.payload.gitCommit).toBeUndefined();
    expect(snapshot.payload.createdBy).toBe('USR-A');
  });
});
