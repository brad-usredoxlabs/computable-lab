/**
 * Tier 0 — canonical terms (the identity spine).
 *
 * The F-praus fix at the resolution layer. `term` records carry an
 * `aliases[]` basket capturing every spelling variant the lab actually uses
 * ("F praus", "FPRAUS", "f pruas", "f praaus"). Because alias knowledge is
 * authoritative, an alias match on a canonical term OUTRANKS any remote exact
 * hit — extending the spine's "prefer what the lab already has" doctrine to
 * lab-owned spelling variants.
 *
 * Each hit becomes a `local:<termId>` CURIE. When the winning term is
 * material/vendor/labware-backed, callers follow the term's root_ref to the
 * physical record for deck-ghost / event-graph material_refs.
 */

import type { RecordStore } from '../../store/types.js';
import type { MaterialLevel, ProviderHit, ResolveProvider } from '../types.js';
import { TERM_SCHEMA_ID } from '../../terms/EnsureTerm.js';
import { normalizeAlias } from '../../terms/alias.js';

/** Match quality → bonus, mirroring matchBonus but over aliases. */
type AliasQuality = 'exact' | 'prefix' | 'substring' | 'none';

function aliasQuality(term: string, alias: string): AliasQuality {
  const t = normalizeAlias(term);
  const a = normalizeAlias(alias);
  if (!t || !a) return 'none';
  if (a === t) return 'exact';
  if (a.startsWith(t)) return 'prefix';
  if (a.includes(t)) return 'substring';
  return 'none';
}

function collectAliasStrings(payload: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  push(payload.preferredLabel);
  push(payload.name);
  const aliases = payload.aliases;
  if (Array.isArray(aliases)) aliases.forEach(push);
  const synonyms = payload.synonyms;
  if (Array.isArray(synonyms)) synonyms.forEach(push);
  return out;
}

function kindLevel(payload: Record<string, unknown>): MaterialLevel {
  return payload.kind === 'material' || payload.kind === 'vendor' ? 'concept' : 'unknown';
}

/**
 * Build the tier-0 term provider over the given store. Matches the canonical
 * term set by alias quality (exact > prefix > substring), then label.
 */
export function createTermProvider(store: RecordStore): ResolveProvider {
  return async (term, limit): Promise<ProviderHit[]> => {
    const hits: ProviderHit[] = [];

    // Snapshot the term set; the spine dedups by CURIE so re-scanning each
    // call is fine at term volumes (hundreds, not millions).
    let terms;
    try {
      terms = await store.list({ schemaId: TERM_SCHEMA_ID });
    } catch {
      return hits; // a missing index must not sink the spine
    }

    const scored: Array<{ hit: ProviderHit; quality: AliasQuality; label: string }> = [];
    for (const record of terms) {
      const payload = (record.payload ?? {}) as Record<string, unknown>;
      const aliases = collectAliasStrings(payload);
      let best: AliasQuality = 'none';
      let matchedAlias: string | undefined;
      for (const a of aliases) {
        const q = aliasQuality(term, a);
        if (q === 'exact') { best = 'exact'; matchedAlias = a; break; }
        if ((q === 'prefix' || q === 'substring') && (best === 'none' || q < best)) {
          best = q;
          matchedAlias = a;
        }
      }
      if (best === 'none') continue;

      const label = String(payload.preferredLabel ?? payload.name ?? record.recordId);
      const curie = `local:${record.recordId}`;
      scored.push({
        quality: best,
        label,
        hit: {
          curie,
          label,
          namespace: 'local',
          level: kindLevel(payload),
          ...(typeof payload.kind === 'string' ? { termKind: payload.kind } : {}),
          ...(typeof payload.domain === 'string' ? { domain: payload.domain } : {}),
          // carry the matched alias as `definition` so the spine's generic
          // hasLexicalSupport filter accepts an alias hit whose *label* has no
          // textual overlap with the query (the F-praus case).
          ...(matchedAlias ? { definition: matchedAlias } : {}),
        },
      });
    }

    // Rank by alias quality, then label.
    const order: Record<AliasQuality, number> = { exact: 0, prefix: 1, substring: 2, none: 3 };
    scored.sort((a, b) => order[a.quality] - order[b.quality] || a.label.localeCompare(b.label));
    for (const s of scored) {
      hits.push(s.hit);
      if (hits.length >= limit) break;
    }
    return hits;
  };
}