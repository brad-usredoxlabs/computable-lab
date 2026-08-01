/**
 * Tier 2 — the on-box OAK ontology service.
 *
 * Queries the local OAK SQLite snapshots (CHEBI/GO/NCIT/UBERON/NCBITaxon, …)
 * served by cl-appliance's ontology-service over loopback. This is the tier
 * that finally consumes the previously-orphaned on-box ontologies; when no
 * service URL is configured (bare computable-lab) this provider is not built.
 */

import type { OntologyConfig } from '../../config/types.js';
import type { ProviderHit, ResolveProvider } from '../types.js';

/** Bundled OAK ontologies queried when none are configured. */
const DEFAULT_LOCAL_ONTOLOGIES = ['chebi', 'go', 'ncit', 'uberon', 'ncbitaxon', 'bto'];

interface OakSearchResponse {
  q?: string;
  results?: Array<{ id?: string; label?: string; definition?: string | null }>;
}

/**
 * Resolve the effective OAK service URL: explicit config wins, then the
 * CLA_ONTOLOGY_SERVICE_URL env var. Returns undefined when neither is set
 * (⇒ no local OAK tier).
 */
export function resolveOakServiceUrl(ontology?: OntologyConfig): string | undefined {
  const fromConfig = ontology?.serviceUrl?.trim();
  if (fromConfig) return fromConfig.replace(/\/+$/, '');
  const fromEnv = process.env.CLA_ONTOLOGY_SERVICE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return undefined;
}

/**
 * Build a tier-2 provider for the configured OAK service, or undefined when
 * no service is reachable (so the spine simply skips this tier).
 */
export function createOakProvider(ontology?: OntologyConfig): ResolveProvider | undefined {
  const baseUrl = resolveOakServiceUrl(ontology);
  if (!baseUrl) return undefined;

  const ontologies =
    ontology?.localOntologies && ontology.localOntologies.length > 0
      ? ontology.localOntologies
      : DEFAULT_LOCAL_ONTOLOGIES;

  return async (term, limit, signal) => {
    const perOntology = Math.max(1, Math.ceil(limit / Math.max(1, ontologies.length)));

    const batches = await Promise.all(
      ontologies.map(async (name): Promise<ProviderHit[]> => {
        const url =
          `${baseUrl}/ontologies/${encodeURIComponent(name)}/search` +
          `?q=${encodeURIComponent(term)}&limit=${perOntology}`;
        try {
          const res = await fetch(url, { signal });
          if (!res.ok) return [];
          const json = (await res.json()) as OakSearchResponse;
          const hits: ProviderHit[] = [];
          for (const r of json.results ?? []) {
            const id = (r.id ?? '').trim();
            if (!id) continue;
            hits.push({
              curie: id,
              label: r.label ?? id,
              namespace: id.split(':')[0] ?? name,
              level: 'concept',
              // Older ontology-service builds don't return definitions on
              // search hits; treat the field as best-effort.
              ...(r.definition ? { definition: r.definition } : {}),
            });
          }
          return hits;
        } catch {
          // Isolation: a single ontology timing out must not sink the rest.
          return [];
        }
      }),
    );

    return batches.flat();
  };
}
