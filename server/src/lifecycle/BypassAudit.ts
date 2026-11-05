/**
 * Lifecycle-bypass detection predicate.
 *
 * The lifecycle gate (checkLifecycleTransition) is only enforced by
 * RecordHandlers.updateRecord. Direct store.update callers (lab-sync inbound
 * mutations, the tree MCP 'filed' writer) can flip the state/status field of
 * a lifecycle-managed record without ever consulting the gate. Per the QMS
 * corrective action (spec §10 gap), the store detects such writes at its own
 * choke point and self-reports them as `lifecycle_state_bypass` audit events
 * rather than pretending they don't happen.
 *
 * This module is a pure predicate — no I/O, no engine imports beyond a
 * structural type — so the store can call it without coupling to governance.
 */

import type { AuditEventInput } from '../governance/AuditEventService.js';

/** Structural slice of LifecycleEngine that the predicate needs. */
export interface BypassLifecycleReader {
  isLoaded(lifecycleId: string): boolean;
}

/** Structural slice of AuditEventService used by the store hook. */
export interface BypassAuditAppender {
  append(input: AuditEventInput): Promise<void>;
}

/** The lifecycle state value of a payload: state ?? status (gate parity). */
export function lifecycleStateOf(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  const v = p.state ?? p.status;
  return typeof v === 'string' ? v : undefined;
}

export interface BypassDetectionInput {
  previousPayload: unknown;
  nextPayload: unknown;
  /** True when the write came through the gated record API for this state change. */
  viaLifecycleApi?: boolean;
  /** Acting identifier resolved by the caller (options.actor → meta → 'unknown'). */
  actor: string;
  /** Canonical record identity. */
  recordId: string;
}

/**
 * Returns the audit event to append when a direct store.update bypasses the
 * lifecycle gate, or null when the write is not a bypass. Mirrors the state
 * reading of checkLifecycleTransition exactly:
 * lifecycleId string + engine.isLoaded + state (state ?? status) CHANGED.
 */
export function detectLifecycleBypass(
  engine: BypassLifecycleReader,
  input: BypassDetectionInput,
): AuditEventInput | null {
  if (input.viaLifecycleApi === true) return null;

  const next = input.nextPayload;
  if (!next || typeof next !== 'object') return null;
  const nextObj = next as Record<string, unknown>;

  const lifecycleId = nextObj.lifecycleId;
  if (typeof lifecycleId !== 'string') return null;
  if (!engine.isLoaded(lifecycleId)) return null;

  const from = lifecycleStateOf(input.previousPayload);
  const to = lifecycleStateOf(input.nextPayload);
  if (from === to) return null;

  const kind = nextObj.kind;
  return {
    actor: input.actor,
    action: 'lifecycle_state_bypass',
    subjectType: typeof kind === 'string' ? kind : 'record',
    subjectId: input.recordId,
    data: { lifecycleId, from: from ?? '', to: to ?? '', via: 'store_update' },
  };
}
