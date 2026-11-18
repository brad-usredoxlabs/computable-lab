/**
 * Persist the local plan event graph as ONE event-graph record and link it to
 * the run (D8.1). The projection layer stays pure — this module owns the
 * store interaction: create event-graph record, then update the run with the
 * graph link. No measured values, no partial graph on failure.
 */

import type { RecordStore, RecordEnvelope } from '../store/types.js';
import type { LocalPlanEventGraphDocumentResult } from './localPlanEventGraph.js';

export interface PersistLocalPlanEventGraphInput {
  store: RecordStore;
  runId: string;
  runPayload: Record<string, unknown>;
  documentResult: LocalPlanEventGraphDocumentResult;
  eventGraphSchemaId: string;
  runSchemaId: string;
}

export type PersistLocalPlanEventGraphResult =
  | { ok: true; graphId: string }
  | { ok: false; code: 'UNSUPPORTED_EVENT_TYPE'; eventType: string; stepId: string }
  | { ok: false; code: 'STORE_ERROR'; error: string };

/**
 * Persist a local plan event-graph document and link it to the run.
 *
 * Order: create event-graph record first, then update the run — mirroring
 * ProtocolContextService.ts:334-336 so the graph exists before the run
 * references it. When projection fails ({ ok: false }), nothing is created
 * and the named error is returned.
 */
export async function persistLocalPlanEventGraph(
  input: PersistLocalPlanEventGraphInput,
): Promise<PersistLocalPlanEventGraphResult> {
  // Projection failed — no document, nothing to store.
  if (!input.documentResult.ok) {
    return input.documentResult;
  }

  const doc = input.documentResult.document;
  const now = new Date().toISOString();

  // 1. Create the event-graph record (exactly ONE record per D8.1).
  const eventGraphEnvelope: RecordEnvelope = {
    recordId: doc.id,
    schemaId: input.eventGraphSchemaId,
    payload: doc,
    meta: { createdAt: now, updatedAt: now },
  };

  const createResult = await input.store.create({
    envelope: eventGraphEnvelope,
    message: `Persist local plan event graph ${doc.id}`,
  });

  if (!createResult.success) {
    return {
      ok: false,
      code: 'STORE_ERROR',
      error: createResult.error ?? 'Failed to create event-graph record',
    };
  }

  // 2. Update the run with the graph link (methodEventGraphId — the field
  // the RUN schema declares for a protocol instance's graph).
  const updatedRunPayload: Record<string, unknown> = {
    ...input.runPayload,
    methodEventGraphId: doc.id,
  };

  const runEnvelope: RecordEnvelope = {
    recordId: input.runId,
    schemaId: input.runSchemaId,
    payload: updatedRunPayload,
    meta: { updatedAt: now },
  };

  const updateResult = await input.store.update({
    envelope: runEnvelope,
    message: `Link event graph ${doc.id} to run ${input.runId}`,
  });

  if (!updateResult.success) {
    return {
      ok: false,
      code: 'STORE_ERROR',
      error: updateResult.error ?? 'Failed to update run with event graph link',
    };
  }

  return { ok: true, graphId: doc.id };
}
