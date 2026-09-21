/**
 * Resolve the biologist's VERBATIM term with the lab's identity spine.
 *
 * Brad's question (2026-09-20): "Doesn't computable lab have a materialResolver?
 * Can't we just use THAT to resolve the materials and allow the AI to use the
 * user's verbatim term?" It does — `ResolveSpine` (tier 0 canonical terms,
 * alias-first; tier 1 workspace records; then OAK, OLS4, vendor, mint). The UI,
 * the compiler and the agent already share it, so all three agree on what a term
 * resolves to.
 *
 * So the model stops choosing among five ref fields and five material layers and
 * stops minting CURIEs. It emits the words the biologist used. This module does
 * the rest, at the boundary:
 *
 *   local hit (tier 0/1) → BIND it, into the field its LAYER implies. Silent:
 *                          "Methanol" hits the one local term, so the lab never
 *                          grows a second one.
 *   no local hit         → keep the mint (a proposed local term) and offer the
 *                          remote candidates to the review dialogue's term panel.
 *   explicit id already  → untouched. A model that named a record is not
 *                          second-guessed; only MINTs are resolved here.
 *
 * Local tiers only by default: tiers 0-2 are synchronous, so the snappy path never
 * waits on OLS4 or Exa. Nothing here blocks, and nothing is dropped silently.
 */
import { MATERIAL_LAYER_FIELD, MATERIAL_REF_FIELDS, materialLayerOf } from './materialRefFields.js';

/** The slice of ResolveSpine this module needs (so tests need no server). */
export interface SpineLike {
  resolve(term: string, opts?: { localOnly?: boolean }): Promise<readonly SpineCandidate[]>;
}

export interface SpineCandidate {
  curie: string;
  label: string;
  tier: number;
  level?: string;
  source?: string;
  domain?: string;
  termKind?: string;
}

/** Tiers that are the lab's own: canonical terms and workspace records. */
export const LOCAL_TIERS: readonly number[] = [0, 1];

/** MaterialLevel → the record type whose LAYER picks the details field. */
const RECORD_TYPE_BY_LEVEL: Record<string, string> = {
  concept: 'material',
  spec: 'material-spec',
  instance: 'material-instance',
  aliquot: 'aliquot',
};

export interface BoundTerm {
  /** The biologist's words, preserved. */
  label: string;
  /** What they were bound to. */
  id: string;
  resolvedLabel: string;
  tier: number;
  source: string;
  /** The details field the ref now lives in. */
  field: string;
}

export interface ProposedTerm {
  label: string;
  /** Remote candidates the term panel can offer (never bound automatically). */
  suggestions: SpineCandidate[];
}

export interface DraftMaterialResolution {
  events: unknown[];
  bound: BoundTerm[];
  proposed: ProposedTerm[];
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Is this ref a MINT — something nobody has resolved yet? */
export function isMintRef(ref: Dict): boolean {
  const kind = typeof ref['kind'] === 'string' ? ref['kind'].trim().toLowerCase() : '';
  const id = typeof ref['id'] === 'string' ? ref['id'].trim() : '';
  return kind === 'draft' || id.toLowerCase().startsWith('mint:') || isDict(ref['mint']);
}

/** The words the biologist used, as carried by a mint ref. */
export function mintLabel(ref: Dict): string {
  const direct = ref['label'] ?? ref['name'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const mint = isDict(ref['mint']) ? ref['mint'] : null;
  const nested = mint ? (mint['label'] ?? mint['name']) : undefined;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  const id = typeof ref['id'] === 'string' ? ref['id'].trim() : '';
  if (id.toLowerCase().startsWith('mint:')) return id.slice(5).trim();
  return '';
}

/** The field a candidate belongs in, given the level the spine reported. */
function fieldForCandidate(candidate: SpineCandidate): string {
  const recordType = candidate.level ? RECORD_TYPE_BY_LEVEL[candidate.level] : undefined;
  if (!recordType) return MATERIAL_LAYER_FIELD.material;
  return MATERIAL_LAYER_FIELD[materialLayerOf(recordType)];
}

export async function resolveDraftMaterials(
  events: readonly unknown[] | undefined,
  spine: SpineLike,
  opts: { localOnly?: boolean; suggestionLimit?: number } = {},
): Promise<DraftMaterialResolution> {
  const localOnly = opts.localOnly ?? true;
  const suggestionLimit = opts.suggestionLimit ?? 3;
  const bound: BoundTerm[] = [];
  const proposed: ProposedTerm[] = [];
  // Cache the PROMISE, not the result: events are processed concurrently, so a
  // 32-well draft that shares one material must still make exactly one spine call.
  const byLabel = new Map<string, Promise<{ best: SpineCandidate | null; others: SpineCandidate[] }>>();

  /** One spine call per distinct spelling, however many wells use it. */
  const lookup = (label: string) => {
    const cached = byLabel.get(label);
    if (cached) return cached;
    const pending = lookupUncached(label);
    byLabel.set(label, pending);
    return pending;
  };

  const lookupUncached = async (label: string) => {
    const candidates = await spine.resolve(label, { localOnly });
    const locals = candidates
      .filter((candidate) => LOCAL_TIERS.includes(candidate.tier) && typeof candidate.curie === 'string' && candidate.curie)
      .sort((a, b) => (b.tier === a.tier ? 0 : a.tier - b.tier));
    const best = locals.length > 0 ? locals[0]! : null;
    const others = best ? [] : candidates.filter((c) => typeof c.curie === 'string' && c.curie).slice(0, suggestionLimit);
    return { best, others };
  };

  const nextEvents = await Promise.all(
    (Array.isArray(events) ? events : []).map(async (rawEvent) => {
      if (!isDict(rawEvent)) return rawEvent;
      const details = rawEvent['details'];
      if (!isDict(details)) return rawEvent;
      if (!MATERIAL_REF_FIELDS.some((field) => field in details)) return rawEvent;

      const nextDetails: Dict = { ...details };
      let touched = false;

      for (const field of MATERIAL_REF_FIELDS) {
        const ref = details[field];
        if (!isDict(ref) || !isMintRef(ref)) continue;
        const label = mintLabel(ref);
        if (!label) continue;

        const { best, others } = await lookup(label);
        delete nextDetails[field];
        touched = true;

        if (best) {
          const targetField = fieldForCandidate(best);
          const recordType = best.level ? RECORD_TYPE_BY_LEVEL[best.level] : undefined;
          nextDetails[targetField] = {
            kind: 'record',
            id: best.curie,
            // The verbatim words stay on the ref: the panel shows what the
            // biologist said next to what it matched.
            label,
            ...(recordType ? { type: recordType } : {}),
          };
          if (!bound.some((entry) => entry.label === label && entry.id === best.curie)) {
            bound.push({
              label,
              id: best.curie,
              resolvedLabel: best.label,
              tier: best.tier,
              source: best.source ?? 'canonical-term',
              field: targetField,
            });
          }
        } else {
          nextDetails[field] = ref;
          if (!proposed.some((entry) => entry.label === label)) {
            proposed.push({ label, suggestions: others });
          }
        }
      }

      return touched ? { ...rawEvent, details: nextDetails } : rawEvent;
    }),
  );

  return { events: nextEvents, bound, proposed };
}