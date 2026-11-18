/**
 * PlannedRunFromLocalProtocolService
 *
 * Creates a planned-run draft record from an existing local-protocol.
 * This is the backend half of the "Plan execution" handoff from Protocol IDE.
 *
 * Supports both singular ref (back-compat) and ordered array of refs (u2).
 */

import { RecordRevisionService, revisionRef } from '../revisions/RecordRevisionService.js';
import { randomUUID } from 'node:crypto';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { slugifyRecordLabel } from '../compiler/material/MaterialCompiler.js';

/**
 * Options for creating a planned-run from a local-protocol.
 */
export interface CreatePlannedRunOptions {
  /** Override title; defaults to 'Plan: <local-protocol title>' */
  title?: string;
  /** Prefix for the recordId; default 'PLR-' */
  recordIdPrefix?: string;
  /** Optional project filing links; defaults to the source local-protocol links. */
  actor?: string;
  links?: { studyId?: string; experimentId?: string; runId?: string };
}

/**
 * Result of creating a planned-run from a local-protocol.
 */
export type CreatePlannedRunResult =
  | { ok: true; plannedRunRef: string; envelope: RecordEnvelope }
  | { ok: false; reason: string; status: number };

/**
 * Service that creates planned-run draft records from local-protocol records.
 */
export class PlannedRunFromLocalProtocolService {
  constructor(private store: RecordStore) {}

  /**
   * Create a planned-run draft from a local-protocol record or ordered list of refs.
   *
   * @param localProtocolRef - Single recordId string (back-compat) or ordered string[] of ids
   * @param options - Optional overrides for title and recordId prefix
   * @returns Result with the created envelope or an error
   */
  async createFromLocalProtocol(
    localProtocolRef: string | string[],
    options: CreatePlannedRunOptions = {},
  ): Promise<CreatePlannedRunResult> {
    // Normalise to ordered, de-duplicated array
    let refs: string[];
    if (typeof localProtocolRef === 'string') {
      if (!localProtocolRef || localProtocolRef.trim().length === 0) {
        return { ok: false, reason: 'localProtocolRef required', status: 400 };
      }
      refs = [localProtocolRef.trim()];
    } else if (Array.isArray(localProtocolRef)) {
      if (localProtocolRef.length === 0) {
        return { ok: false, reason: 'localProtocolRef required', status: 400 };
      }
      // De-dupe preserving order
      const seen = new Set<string>();
      refs = [];
      for (const id of localProtocolRef) {
        if (id && !seen.has(id)) {
          seen.add(id);
          refs.push(id);
        }
      }
      if (refs.length === 0) {
        return { ok: false, reason: 'localProtocolRef required', status: 400 };
      }
    } else {
      return { ok: false, reason: 'localProtocolRef required', status: 400 };
    }

    // Validate EVERY id
    const resolvedProtocols: Array<{ envelope: RecordEnvelope; id: string }> = [];
    for (const id of refs) {
      const envelope = await this.store.get(id);
      if (!envelope) {
        return { ok: false, reason: `local-protocol not found: ${id}`, status: 404 };
      }
      const payload = envelope.payload as Record<string, unknown>;
      if (payload.kind !== 'local-protocol') {
        return {
          ok: false,
          reason: `resolved record is not a local-protocol (id=${id}, kind=${payload.kind})`,
          status: 400,
        };
      }
      resolvedProtocols.push({ envelope, id });
    }

    // Derive title from the first (lead) protocol
    const lead = resolvedProtocols[0]!;
    const leadPayload = lead.envelope.payload as Record<string, unknown>;
    const sourceTitle = (leadPayload.title as string) ?? 'Untitled local-protocol';
    const title = options.title ?? `Plan: ${sourceTitle}`;

    // Generate recordId
    const prefix = options.recordIdPrefix ?? 'PLR-';
    const shortId = randomUUID().replace(/-/g, '').slice(0, 8);
    const recordId = `${prefix}${slugifyRecordLabel(title)}-${shortId}`;

    // Merge links from all protocols + options (later sources override)
    const mergedLinks: { studyId?: string; experimentId?: string; runId?: string } = {};
    for (const { envelope } of resolvedProtocols) {
      const p = envelope.payload as Record<string, unknown>;
      const srcLinks = p.links && typeof p.links === 'object'
        ? p.links as { studyId?: string; experimentId?: string; runId?: string }
        : {};
      if (srcLinks.studyId) mergedLinks.studyId = srcLinks.studyId;
      if (srcLinks.experimentId) mergedLinks.experimentId = srcLinks.experimentId;
      if (srcLinks.runId) mergedLinks.runId = srcLinks.runId;
    }
    if (options.links?.studyId) mergedLinks.studyId = options.links.studyId;
    if (options.links?.experimentId) mergedLinks.experimentId = options.links.experimentId;
    if (options.links?.runId) mergedLinks.runId = options.links.runId;

    const revisions = new RecordRevisionService(this.store);
    const actor = options.actor ?? 'system';

    // Pin and snapshot every protocol, capturing revisionRef per ref
    const refEntries: Array<{ kind: string; type: string; id: string; revisionRef: { kind: string; type: string; id: string } }> = [];
    for (const { envelope, id } of resolvedProtocols) {
      const pinned = await revisions.pinInheritance(envelope, actor);
      const snapshot = await revisions.capture(pinned, actor, 'derivation');
      refEntries.push({
        kind: 'record',
        type: 'local-protocol',
        id,
        revisionRef: revisionRef(snapshot.recordId),
      });
    }

    // Build the envelope
    const payload: Record<string, unknown> = {
      kind: 'planned-run',
      recordId,
      title,
      protocolLayer: 'lab',
      sourceType: 'local-protocol',
      sourceRef: refEntries[0],
      localProtocolRefs: refEntries,
      ...(Object.keys(mergedLinks).length > 0 ? { links: mergedLinks } : {}),
      state: 'draft',
      bindings: {
        labware: [],
        materials: [],
        contexts: [],
      },
    };

    // Legacy singular: write ONLY when list has exactly one entry
    if (refEntries.length === 1) {
      payload.localProtocolRef = refEntries[0];
    }

    const envelope: RecordEnvelope = {
      recordId,
      schemaId:
        'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
      payload,
    };

    // Persist
    await this.store.create({ envelope, message: 'plan from local-protocol' });

    return { ok: true, plannedRunRef: recordId, envelope };
  }
}
