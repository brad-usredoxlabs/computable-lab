/**
 * SurfaceContext — deterministic YAML/JSON serialization (phase 2, Task 2.3).
 *
 * toYaml/toJson produce a stable key order so the same context serializes to
 * the same string (crucial for corpus capture — the SurfaceContext YAML is
 * embedded in the prompt). Optional fields (asOf, selection, prompt) are
 * omitted when empty rather than serialized as `undefined`.
 */
import { parse, stringify } from 'yaml';
import type { SurfaceContext } from './SurfaceContext.js';

/** Strip undefined/optional-empty fields so YAML/JSON emit absent keys. */
function slim(ctx: SurfaceContext): Record<string, unknown> {
  const out: Record<string, unknown> = {
    surface: ctx.surface,
    active: {
      objectType: ctx.active.objectType,
      objectId: ctx.active.objectId,
      label: ctx.active.label,
      ...(ctx.active.linkedProjectIds && ctx.active.linkedProjectIds.length > 0
        ? { linkedProjectIds: ctx.active.linkedProjectIds }
        : {}),
    },
  };
  if (ctx.selection.length > 0) {
    out.selection = ctx.selection.map((item) => ({
      ref: {
        kind: item.ref.kind,
        id: item.ref.id,
        ...(item.ref.kind === 'record' ? { type: item.ref.type } : {}),
        ...(item.ref.label !== undefined && item.ref.label.length > 0 ? { label: item.ref.label } : {}),
        ...(item.ref.kind === 'ontology' ? { namespace: item.ref.namespace } : {}),
      },
      ...(item.label !== undefined && item.label.length > 0 ? { label: item.label } : {}),
      ...(item.data && Object.keys(item.data).length > 0 ? { data: item.data } : {}),
    }));
  }
  if (ctx.prompt && ctx.prompt.trim().length > 0) {
    out.prompt = ctx.prompt.trim();
  }
  if (ctx.asOf) {
    out.asOf = ctx.asOf;
  }
  return out;
}

/** Deterministic JSON string with stable key order (stringify keeps insert order). */
export function toJson(ctx: SurfaceContext): string {
  return JSON.stringify(slim(ctx), null, 2);
}

/** Deterministic YAML string with stable key order. */
export function toYaml(ctx: SurfaceContext): string {
  return stringify(slim(ctx));
}

/** Parse a previously-serialized SurfaceContext back into a typed value. */
export function parseSurfaceContext(yamlOrJson: string): SurfaceContext {
  const parsed = parse(yamlOrJson);
  return parsed as unknown as SurfaceContext;
}