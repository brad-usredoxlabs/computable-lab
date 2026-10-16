/**
 * HARNESS-SEQ-2 FIX3 (D1) — the deterministic sequences focus-guard.
 *
 * The tier-2 gate (2026-10-16_0445, traces zyyrls/1ta7ju) proved the failure
 * shape: "focus on record ANR-000001" (kind analysis-run, OUTSIDE the
 * sequences surface's declared `selectableKinds`) — the served model emitted
 * ZERO agent_intent calls, so the client-side selectableKinds gate
 * (app/src/sequences/applyAgentAction.ts) had nothing to refuse and the chat
 * showed only the generic model-failure line. The named refusal must NOT
 * depend on the model emitting anything.
 *
 * This module is the PRE-MODEL guard: when the ask explicitly requests to
 * focus/show/open a record id that the store resolves to a kind the surface's
 * DECLARED `selectableKinds` (schema/registry/surfaces/surfaces.yaml through
 * the injected SurfacesRegistry) does not include, the turn ends in a NAMED
 * refusal — zero inference, zero agent_action frames, zero writes. TS reads
 * the registry data; there is NO kind list, NO surface literal, NO id pattern
 * policy here beyond the request-shape probe (repo rule #1/#3). Swap the
 * registry DATA and the refusal text flips (unit-pinned).
 *
 * Honesty contract: the refusal names the record id, the record's kind (the
 * store's answer — catalog reality, not a TS allow-list), and the kinds the
 * surface declares, mirroring the client gate's wording so the refusal reads
 * the same whether the server or the client caught it.
 */
import type { SurfacesRegistry } from '../surfaces/surfaces.js';
import type { RecordStore } from '../store/types.js';

export interface FocusGuardInput {
  /** The user's ask (the raw prompt — clarification-appended text is not re-probed). */
  prompt: string;
  /** The surface id this turn runs on (from the request, not inferred). */
  surface: string;
}

export interface FocusGuardDeps {
  store: RecordStore;
  surfaces: SurfacesRegistry;
}

export interface FocusGuardRefusal {
  code: 'FOCUS_KIND_NOT_SELECTABLE';
  message: string;
}

/**
 * The request-shape probe: an explicit focus/show/open/display/view request
 * naming a record id. The id token needs a hyphen or a digit (the catalog's
 * id shape) so prose nouns ("focus on the analysis") never match. This is a
 * SHAPE probe, not kind policy — which kinds are selectable is pure registry
 * data.
 */
const FOCUS_RECORD_RE = /\b(?:focus|show|open|display|view)\b[^\n]{0,40}?\b([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+|\d[A-Za-z0-9]*))\b/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The record TYPE the same way the workspace-action compiler reads it:
 *  payload.kind is the discriminator, schemaId the fallback. No kind
 *  knowledge lives here. */
function recordType(record: { recordId: string; schemaId: string; payload: unknown }): string {
  const payload = asRecord(record.payload) ?? {};
  const kind = payload.kind;
  if (typeof kind === 'string' && kind.trim().length > 0) return kind.trim();
  if (typeof record.schemaId === 'string' && record.schemaId.trim().length > 0) return record.schemaId.trim();
  return 'record';
}

/**
 * Returns a refusal envelope when the guard FIRES; null when it stays silent
 * (no id in the ask, no registry entry / no declared kinds to check against,
 * no store, or the id resolves to a declared kind or does not resolve at all
 * — an unknown id is the compiler's UNKNOWN_RECORD story, not this guard's).
 */
export async function sequencesFocusGuard(
  input: FocusGuardInput,
  deps: FocusGuardDeps | Record<string, never>,
): Promise<FocusGuardRefusal | null> {
  const store = (deps as FocusGuardDeps).store;
  const surfaces = (deps as FocusGuardDeps).surfaces;
  if (!store || !surfaces) return null;

  const entry = surfaces.get(input.surface);
  const declaredKinds = entry?.selectableKinds ?? [];
  if (declaredKinds.length === 0) return null;

  const match = FOCUS_RECORD_RE.exec(input.prompt);
  const recordId = match?.[1];
  if (!recordId) return null;

  const record = await store.get(recordId);
  if (!record) return null;

  const kind = recordType(record);
  if (declaredKinds.includes(kind)) return null;

  const surfaceLabel = entry?.label ?? input.surface;
  return {
    code: 'FOCUS_KIND_NOT_SELECTABLE',
    message:
      `Record "${recordId}" (kind ${kind}) is not a kind ${surfaceLabel} can select ` +
      `(it declares ${declaredKinds.join(', ')}). Nothing was changed.`,
  };
}
