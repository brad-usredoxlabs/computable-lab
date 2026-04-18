import type { Context, ContextContent } from '../types/context.js';

export interface ContextDiff {
  total_volume?: { from: number | undefined; to: number | undefined; delta: number | null };
  contents: Array<{
    material_id: string;
    from?: { volume_value?: number; concentration_value?: number };
    to?: { volume_value?: number; concentration_value?: number };
    delta?: { volume_value?: number; concentration_value?: number };
  }>;
  properties?: Record<string, { from: unknown; to: unknown }>;
  observed?: Record<string, { from: unknown; to: unknown }>;
  warnings: string[];
}

interface ObservedOrProps {
  [k: string]: unknown;
}

function materialId(c: ContextContent): string {
  const ref = c.material_ref as { id?: string } | undefined;
  return ref?.id ?? '<no-material-ref>';
}

function indexByMaterial(contents: ContextContent[] | undefined): Map<string, ContextContent> {
  const m = new Map<string, ContextContent>();
  for (const c of contents ?? []) {
    const key = materialId(c);
    if (!m.has(key)) m.set(key, c);
  }
  return m;
}

function shallowDiff(a: ObservedOrProps | undefined, b: ObservedOrProps | undefined): Record<string, { from: unknown; to: unknown }> | undefined {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const av = (a ?? {})[k];
    const bv = (b ?? {})[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      out[k] = { from: av, to: bv };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function diffContexts(a: Context, b: Context): ContextDiff {
  const warnings: string[] = [];
  const out: ContextDiff = { contents: [], warnings };

  // total_volume
  const avol = a.total_volume;
  const bvol = b.total_volume;
  if (avol || bvol) {
    if (avol && bvol && avol.unit !== bvol.unit) {
      warnings.push(`total_volume unit mismatch: ${avol.unit} vs ${bvol.unit}`);
      out.total_volume = { from: avol.value, to: bvol.value, delta: null };
    } else {
      const af = avol?.value;
      const bf = bvol?.value;
      out.total_volume = {
        from: af,
        to: bf,
        delta: (af !== undefined && bf !== undefined) ? bf - af : null,
      };
    }
  }

  // contents by material_ref.id
  const aIdx = indexByMaterial(a.contents);
  const bIdx = indexByMaterial(b.contents);
  const ids = new Set([...aIdx.keys(), ...bIdx.keys()]);
  for (const id of ids) {
    const ca = aIdx.get(id);
    const cb = bIdx.get(id);
    const entry: ContextDiff['contents'][number] = { material_id: id };
    if (ca) entry.from = { ...(ca.volume ? { volume_value: ca.volume.value } : {}), ...(ca.concentration ? { concentration_value: ca.concentration.value } : {}) };
    if (cb) entry.to = { ...(cb.volume ? { volume_value: cb.volume.value } : {}), ...(cb.concentration ? { concentration_value: cb.concentration.value } : {}) };
    if (ca && cb) {
      entry.delta = {
        ...(ca.volume && cb.volume ? { volume_value: cb.volume.value - ca.volume.value } : {}),
        ...(ca.concentration && cb.concentration ? { concentration_value: cb.concentration.value - ca.concentration.value } : {}),
      };
    }
    out.contents.push(entry);
  }

  const propsA = (a as unknown as { properties?: ObservedOrProps }).properties;
  const propsB = (b as unknown as { properties?: ObservedOrProps }).properties;
  const pd = shallowDiff(propsA, propsB);
  if (pd) out.properties = pd;

  const obsA = (a as unknown as { observed?: ObservedOrProps }).observed;
  const obsB = (b as unknown as { observed?: ObservedOrProps }).observed;
  const od = shallowDiff(obsA, obsB);
  if (od) out.observed = od;

  return out;
}
