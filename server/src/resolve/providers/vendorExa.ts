/**
 * Tier 4 — vendor/catalog search via Exa web.
 *
 * Searches Exa for real vendor products (materials / labware / equipment) and
 * surfaces each as a `local:` CURIE-typed candidate carrying the web URL as its
 * IRI. Selecting one is a MINT-ON-SELECT: the client calls `/vendor/exa/from`
 * to land a durable local record, so the resolved term is a real thing the lab
 * can buy, not a bare ontology concept.
 *
 * This is what finally makes the spine's tier-4 `vendor` source real — the
 * `vendorProvider` slot existed in ResolveSpine.ts but nothing wired it. Kept
 * best-effort (a missing/failed Exa key just omits the tier), like OLS4.
 */

import type { AppConfig } from '../../config/types.js';
import type { ProviderHit, ResolveProvider } from '../types.js';
import { exaSearch, resolveExaConfig } from '../../integrations/exa.js';
import { labelHash } from '../../materials/termId.js';

const DEFAULT_LIMIT = 6;
const CATEGORY_QUERIES: Record<'catalog' | 'labware' | 'equipment', string> = {
  catalog: 'vendor laboratory product catalog',
  labware: 'laboratory labware plate tube rack manufacturer catalog',
  equipment: 'laboratory equipment instrument manufacturer model',
};

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function exaResults(response: unknown): Array<Record<string, unknown>> {
  const root = objectValue(response);
  const results = root?.results;
  return Array.isArray(results)
    ? results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function snippetOf(entry: Record<string, unknown>): string | undefined {
  const direct = stringValue(entry.summary) ?? stringValue(entry.text);
  if (direct) return direct.slice(0, 400);
  const highlights = entry.highlights;
  if (Array.isArray(highlights)) {
    return highlights.map((item) => stringValue(item)).filter(Boolean).join(' ').slice(0, 400) || undefined;
  }
  return undefined;
}

function shapeHit(entry: Record<string, unknown>, category: 'catalog' | 'labware' | 'equipment'): ProviderHit | null {
  const url = stringValue(entry.url);
  const label = stringValue(entry.title) ?? url;
  if (!url || !label) return null;
  // A stable, category-scoped local CURIE that records "a vendor product for
  // this URL". Deterministic so re-resolving the same term/URL yields the same
  // candidate (idempotency, mirroring termId).
  const stable = `${category}:${url}`;
  const snippet = snippetOf(entry);
  return {
    curie: `local:vendor-${category}-${labelHash(stable)}`,
    label,
    namespace: 'local',
    uri: url,
    level: 'unknown',
    ...(snippet ? { definition: snippet } : {}),
  };
}

/**
 * Build a tier-4 vendor provider backed by Exa. `getAppConfig` is read per-call
 * so a freshly-pasted key (PATCH /api/config) takes effect without a restart.
 */
export function createVendorExaProvider(getAppConfig: () => AppConfig | undefined): ResolveProvider {
  return async (term, limit, signal): Promise<ProviderHit[]> => {
    const trimmed = (term ?? '').trim();
    if (trimmed.length < 2) return [];

    const config = resolveExaConfig(getAppConfig());
    if (!config) return [];

    const perCategory = Math.max(Math.min(limit, DEFAULT_LIMIT), 1);
    const categories: Array<'catalog' | 'labware' | 'equipment'> = ['catalog', 'labware', 'equipment'];
    const responses = await Promise.all(
      categories.map(async (category) => {
        if (signal.aborted) return [];
      try {
        const response = await exaSearch(config, {
          query: `${trimmed} ${CATEGORY_QUERIES[category]}`,
          searchType: 'auto',
          numResults: perCategory,
          contentMode: 'highlights',
          maxCharacters: 900,
          highlightQuery: trimmed,
        });
        return exaResults(response)
          .slice(0, perCategory)
          .map((entry) => shapeHit(entry, category))
          .filter((hit): hit is ProviderHit => Boolean(hit));
      } catch {
        return [];
      }
      }),
    );

    return responses.flat().slice(0, limit);
  };
}