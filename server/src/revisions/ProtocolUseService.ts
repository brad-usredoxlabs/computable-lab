import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { RecordRevisionService, RevisionError, contentHash, recipeHash, object, revisionRef, token, withRecordLock, type RevisionRef } from './RecordRevisionService.js';

/** Pin a graph on explicit acceptance. Previews never call this service. */
export async function acceptProtocolGraph(store: RecordStore, graphId: string, actor: string, expectedSha: string) {
  return withRecordLock(store, graphId, async () => {
    const graph = await store.get(graphId);
    if (!graph || object(graph.payload).kind !== 'event-graph') throw new RevisionError('GRAPH_NOT_FOUND', 'Graph not found.', 404);
    const payload = object(graph.payload);
    const revisions = new RecordRevisionService(store);
    const existingRef = object(payload.protocolRevisionRef);
    if (typeof existingRef.id === 'string') {
      return { record: graph, revision: await revisions.read({ id: existingRef.id }) };
    }
    if (token(graph) !== expectedSha) throw new RevisionError('STALE_GRAPH', 'The graph changed. Reload before accepting it.');
    const source = object(payload.protocolSource);
    if (typeof source.recordId !== 'string' || typeof source.sourceToken !== 'string' || typeof source.contentHash !== 'string') {
      throw new RevisionError('PROTOCOL_SOURCE_REQUIRED', 'Save the protocol and regenerate this graph before accepting it.', 422);
    }
    const protocol = await store.get(source.recordId);
    const generatedFrom = (await revisions.list(source.recordId)).find(r => r.payload.contentHash === source.contentHash);
    if (!protocol || (contentHash(protocol.payload) !== source.contentHash && generatedFrom?.payload.recipeHash !== recipeHash(protocol.payload))) throw new RevisionError('STALE_PROTOCOL', 'The protocol changed. Regenerate the graph before accepting it.');
    if (!Array.isArray(payload.events) || !payload.events.length) throw new RevisionError('EMPTY_GRAPH', 'Add executable steps before accepting this graph.', 422);
    const revision = await revisions.freezeProtocol(source.recordId, actor, token(protocol));
    const updated = await store.update({
      envelope: { ...graph, payload: { ...payload, protocolRevisionRef: revisionRef(revision.recordId) } },
      expectedSha, actor, message: `Accept ${graphId} using ${source.recordId} v${revision.payload.version}`,
    });
    if (!updated.success) throw new RevisionError('GRAPH_ACCEPT_FAILED', updated.error ?? 'Could not accept graph. Retry after reloading.');
    return { record: updated.envelope ?? await store.get(graphId), revision };
  });
}

/** Follow declared ancestry only; never guess a historical protocol from a title. */
export async function pinRunProtocol(store: RecordStore, record: RecordEnvelope, actor: string): Promise<{ protocolRevisionRef?: RevisionRef; protocolVersion?: string }> {
  const service = new RecordRevisionService(store);
  const visited = new Set<string>();
  const walk = async (current: RecordEnvelope): Promise<Awaited<ReturnType<RecordRevisionService['read']>> | undefined> => {
    if (visited.has(current.recordId)) return undefined;
    visited.add(current.recordId);
    const p = object(current.payload);
    const pinned = object(p.protocolRevisionRef);
    if (typeof pinned.id === 'string') return service.read({ id: pinned.id });
    if (p.kind === 'protocol') return service.freezeProtocol(current.recordId, actor, token(current));
    if (p.kind === 'event-graph') {
      if (p.protocolSource) return (await acceptProtocolGraph(store, current.recordId, actor, token(current) ?? '')).revision;
      return undefined; // Existing unpinned graphs retain honest, unknown provenance.
    }
    for (const key of ['plannedEventGraphId', 'methodEventGraphId', 'plannedRunRef', 'localProtocolRef', 'protocolRef', 'inherits_from', 'sourceRef']) {
      const ref = p[key];
      const id = typeof ref === 'string' ? ref : object(ref).id;
      if (typeof id !== 'string') continue;
      const source = await service.resolve({ id, ...(object(ref).revisionRef ? { revisionRef: object(ref).revisionRef as unknown as RevisionRef } : {}) });
      if (!source) throw new RevisionError('SOURCE_NOT_FOUND', `Protocol source ${id} is missing.`, 422);
      if (object(ref).revisionRef && object(source.payload).kind === 'protocol') {
        const pinnedSource = await service.read(object(ref).revisionRef as RevisionRef, id);
        return pinnedSource.payload.purpose === 'research-use' ? pinnedSource : service.freezeProtocol(id, actor, pinnedSource.payload.sourceToken);
      }
      const result = await walk(source);
      if (result) return result;
      // A pre-existing graph without pins must not be attributed to a newer protocol head.
      if (object(source.payload).kind === 'event-graph') return undefined;
    }
    return undefined;
  };
  const revision = await walk(record);
  if (revision?.payload.snapshot.lifecycleId) {
    const current = await store.get(revision.payload.sourceRecordId);
    if (!current || object(current.payload).state !== 'effective') throw new RevisionError('CONTROLLED_PROTOCOL_NOT_EFFECTIVE', 'The pinned controlled protocol is no longer effective.', 422);
  }
  return revision ? { protocolRevisionRef: revisionRef(revision.recordId), ...(revision.payload.version ? { protocolVersion: revision.payload.version } : {}) } : {};
}
