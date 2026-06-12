/**
 * Draft-time material-ref labeling + normalization.
 *
 * In forced-tool mode the agent's structured draft goes straight to the
 * client — runChatbotCompile (which used to bind ontology CURIEs to labeled
 * local records) never runs. Grounded materials[] carry bare CURIEs, so
 * without this step the deck's well state renders "CHEBI:17790" where the
 * user expects "methanol", and a model that stuffs several CURIEs into one
 * ref ("CHEBI:1,XCO:2") collapses a mixture onto one well-tooltip line.
 *
 * enrichAddMaterialRefs() repairs both at draft time:
 *  - resolves labels for CURIEs (local records → on-box OAK terms endpoint →
 *    remote OLS4, all best-effort with short timeouts; the CURIE stands in
 *    when every tier misses),
 *  - splits comma-joined CURIE lists and multi-entry materials[] into a
 *    details.composition_snapshot so each component gets its own ledger
 *    line in the well state.
 */

import type { OntologyConfig } from '../config/types.js';
import type { RecordStore } from '../store/types.js';
import { resolveOakServiceUrl } from '../resolve/providers/oak.js';

const OLS4_TERMS_BASE = 'https://www.ebi.ac.uk/ols4/api/terms';
const OAK_TIMEOUT_MS = 1500;
const OLS4_TIMEOUT_MS = 2500;

/** CURIE-shaped: prefix, colon, non-space local id ("CHEBI:17790", "local:MAT-x"). */
const CURIE_RE = /^[A-Za-z][\w.-]*:\S+$/;

export function isCurieShaped(value: string): boolean {
  return CURIE_RE.test(value.trim());
}

/**
 * Split "CHEBI:1, XCO:2" into its parts — but only when EVERY comma-separated
 * part is CURIE-shaped, so chemical names like "1,2-dichloroethane" are never
 * torn apart. Returns null when the value isn't a CURIE list.
 */
export function splitCurieList(value: string): string[] | null {
  if (!value.includes(',')) return null;
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.every((p) => CURIE_RE.test(p)) ? parts : null;
}

export interface MaterialLabelerDeps {
  store?: RecordStore | undefined;
  ontology?: OntologyConfig | undefined;
}

export interface MaterialLabeler {
  /** Best-effort CURIE → human label. Null when no tier knows the term. */
  lookup(curie: string): Promise<string | null>;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a labeler with a per-instance cache (one instance per draft, so a
 * CURIE used by five events costs one lookup).
 */
export function createMaterialLabeler(deps: MaterialLabelerDeps = {}): MaterialLabeler {
  const cache = new Map<string, string | null>();
  const oakBase = resolveOakServiceUrl(deps.ontology);

  async function lookupUncached(curie: string): Promise<string | null> {
    if (curie.startsWith('local:')) {
      const recordId = curie.slice('local:'.length);
      try {
        const record = await deps.store?.get(recordId);
        const payload = record?.payload as Record<string, unknown> | undefined;
        for (const key of ['name', 'title', 'label'] as const) {
          const v = payload?.[key];
          if (typeof v === 'string' && v) return v;
        }
      } catch {
        /* missing record — fall through */
      }
      return null;
    }

    const namespace = curie.split(':')[0] ?? '';
    if (oakBase && namespace) {
      const url = `${oakBase}/ontologies/${encodeURIComponent(namespace.toLowerCase())}/terms/${encodeURIComponent(curie)}`;
      const json = (await fetchJson(url, OAK_TIMEOUT_MS)) as { label?: unknown } | null;
      if (json && typeof json.label === 'string' && json.label) return json.label;
    }

    const ols = (await fetchJson(
      `${OLS4_TERMS_BASE}?obo_id=${encodeURIComponent(curie)}&size=1`,
      OLS4_TIMEOUT_MS,
    )) as { _embedded?: { terms?: Array<{ label?: unknown }> } } | null;
    const label = ols?._embedded?.terms?.[0]?.label;
    return typeof label === 'string' && label ? label : null;
  }

  return {
    async lookup(curie: string): Promise<string | null> {
      const key = curie.trim();
      if (!key) return null;
      if (cache.has(key)) return cache.get(key) ?? null;
      const label = await lookupUncached(key);
      cache.set(key, label);
      return label;
    },
  };
}

type Dict = Record<string, unknown>;

/** One grounded component: an existing CURIE or a mint-by-label. */
interface RefPart {
  curie?: string;
  label?: string;
}

function asDict(v: unknown): Dict | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : null;
}

/**
 * Pull the component list for an add_material event: grounded materials[]
 * first (the tool-schema contract), else a degraded details.material_ref the
 * model wrote directly. Comma-joined CURIE lists are split either way.
 */
function collectParts(e: Dict, details: Dict): RefPart[] {
  const materials = Array.isArray(e.materials) ? (e.materials as unknown[]) : [];
  const parts: RefPart[] = [];
  for (const item of materials) {
    const ref = asDict(asDict(item)?.ref);
    if (!ref) continue;
    if (typeof ref.curie === 'string' && ref.curie) {
      const split = splitCurieList(ref.curie);
      if (split) for (const c of split) parts.push({ curie: c });
      else parts.push({ curie: ref.curie });
    } else {
      const mint = asDict(ref.mint);
      if (mint && typeof mint.label === 'string' && mint.label) {
        parts.push({ label: mint.label });
      }
    }
  }
  if (parts.length > 0) return parts;

  const mr = details.material_ref;
  if (typeof mr === 'string' && mr) {
    const split = splitCurieList(mr);
    if (split) return split.map((c) => ({ curie: c }));
    if (isCurieShaped(mr)) return [{ curie: mr }];
    return [];
  }
  const obj = asDict(mr);
  if (obj) {
    const id = typeof obj.id === 'string' ? obj.id : '';
    const label = typeof obj.label === 'string' ? obj.label : '';
    const split = (id ? splitCurieList(id) : null) ?? (label ? splitCurieList(label) : null);
    if (split) return split.map((c) => ({ curie: c }));
    if (id && isCurieShaped(id)) return [{ curie: id }];
  }
  return [];
}

/**
 * A material_ref the well engine can already render properly: an object with
 * a label that isn't just the CURIE echoed back (and isn't a comma list).
 */
function hasHealthyMaterialRef(details: Dict): boolean {
  const obj = asDict(details.material_ref);
  if (!obj) return false;
  const id = typeof obj.id === 'string' ? obj.id : '';
  const label = typeof obj.label === 'string' ? obj.label : '';
  if (!label || label === id) return false;
  if (splitCurieList(label) || splitCurieList(id)) return false;
  return !isCurieShaped(label);
}

async function toMaterialRef(part: RefPart, labeler: MaterialLabeler): Promise<Dict> {
  if (part.curie) {
    const label = (await labeler.lookup(part.curie)) ?? part.curie;
    if (part.curie.startsWith('local:')) {
      return { kind: 'record', id: part.curie.slice('local:'.length), type: 'material', label };
    }
    return {
      kind: 'ontology',
      id: part.curie,
      namespace: part.curie.split(':')[0] ?? '',
      label,
    };
  }
  return { kind: 'draft', id: `mint:${part.label}`, label: part.label ?? '' };
}

/**
 * Normalize material references on drafted add_material events. See module
 * doc. Events with sibling refs (aliquot/spec/instance/vendor) or an already
 * healthy material_ref pass through untouched.
 */
export async function enrichAddMaterialRefs<T>(
  events: T[],
  labeler: MaterialLabeler,
): Promise<T[]> {
  return Promise.all(
    events.map(async (ev) => {
      if (!ev || typeof ev !== 'object') return ev;
      const e = ev as Dict;
      if ((e.event_type ?? e.verb) !== 'add_material') return ev;
      const details = asDict(e.details) ?? {};
      if (
        details.material_spec_ref || details.aliquot_ref ||
        details.material_instance_ref || details.vendor_product_ref
      ) {
        return ev;
      }
      if (hasHealthyMaterialRef(details)) return ev;

      const parts = collectParts(e, details);
      if (parts.length === 0) return ev;

      const refs = await Promise.all(parts.map((p) => toMaterialRef(p, labeler)));
      const next: Dict = { ...details, material_ref: refs[0] };
      const existingSnapshot = Array.isArray(details.composition_snapshot)
        ? (details.composition_snapshot as unknown[])
        : [];
      if (refs.length > 1 && existingSnapshot.length === 0) {
        // One ledger line per component: the well engine renders snapshot
        // entries individually, so a mixture stops collapsing onto one line.
        next.composition_snapshot = refs.map((componentRef) => ({
          componentRef,
          role: 'other',
        }));
      }
      return { ...e, details: next } as T;
    }),
  );
}
