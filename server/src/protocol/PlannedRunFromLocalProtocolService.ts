/**
 * PlannedRunFromLocalProtocolService
 *
 * Creates a planned-run draft record from an existing local-protocol.
 * This is the backend half of the "Plan execution" handoff from Protocol IDE.
 */

import { randomUUID } from 'node:crypto';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { slugify } from '../compiler/material/MaterialCompiler.js';

/**
 * Options for creating a planned-run from a local-protocol.
 */
export interface CreatePlannedRunOptions {
  /** Override title; defaults to 'Plan: <local-protocol title>' */
  title?: string;
  /** Prefix for the recordId; default 'PLR-' */
  recordIdPrefix?: string;
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
   * Create a planned-run draft from a local-protocol record.
   *
   * @param localProtocolRef - The recordId of the local-protocol to base the plan on
   * @param options - Optional overrides for title and recordId prefix
   * @returns Result with the created envelope or an error
   */
  async createFromLocalProtocol(
    localProtocolRef: string,
    options: CreatePlannedRunOptions = {},
  ): Promise<CreatePlannedRunResult> {
    // Validate input
    if (!localProtocolRef || localProtocolRef.trim().length === 0) {
      return { ok: false, reason: 'localProtocolRef required', status: 400 };
    }

    // Look up the local-protocol
    const localProtocolEnvelope = await this.store.get(localProtocolRef);
    if (!localProtocolEnvelope) {
      return { ok: false, reason: 'local-protocol not found', status: 404 };
    }

    // Verify it's actually a local-protocol
    const payload = localProtocolEnvelope.payload as Record<string, unknown>;
    if (payload.kind !== 'local-protocol') {
      return {
        ok: false,
        reason: `resolved record is not a local-protocol (kind=${payload.kind})`,
        status: 400,
      };
    }

    // Derive title
    const sourceTitle = (payload.title as string) ?? 'Untitled local-protocol';
    const title = options.title ?? `Plan: ${sourceTitle}`;

    // Generate recordId
    const prefix = options.recordIdPrefix ?? 'PLR-';
    const shortId = randomUUID().replace(/-/g, '').slice(0, 8);
    const recordId = `${prefix}${slugify(title)}-${shortId}`;

    // Build the envelope
    const envelope: RecordEnvelope = {
      recordId,
      schemaId:
        'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
      payload: {
        kind: 'planned-run',
        recordId,
        title,
        protocolLayer: 'lab',
        sourceType: 'local-protocol',
        sourceRef: {
          kind: 'record',
          type: 'local-protocol',
          id: localProtocolRef,
        },
        localProtocolRef: {
          kind: 'record',
          type: 'local-protocol',
          id: localProtocolRef,
        },
        state: 'draft',
        bindings: {
          labware: [],
          materials: [],
          contexts: [],
        },
      },
    };

    // Persist
    await this.store.create({ envelope, message: 'plan from local-protocol' });

    return { ok: true, plannedRunRef: recordId, envelope };
  }
}
