/**
 * Compile-time ontology resolver.
 *
 * The compiler's `NounPhraseResolver` receives terms via an `ontologyResolver`
 * dependency (wired in server.ts). To guarantee "one resolution path, one
 * answer," this resolver is backed by the SAME resolve() spine the UI/agent
 * use, mapping ranked candidates to the `{ id, label, source }` shape the
 * NounPhraseResolver's ontology tier expects.
 *
 * Historical note: this was previously an OAK-only, local-only spine (no local
 * records, no OLS4), which made the compiler disagree with the UI and agent
 * for terms that exist in local records (tier 1) or OLS4 (tier 3) but not in
 * on-box OAK. Using the full spine closes that divergence: the compiler now
 * "prefers what the lab already has" exactly like every other consumer.
 */

import type { ResolveSpine } from './ResolveSpine.js';

/** Mapped candidate shape consumed by NounPhraseResolver's ontology tier. */
export interface CompileOntologyHit {
  id: string;
  label: string;
  source: string;
}

/**
 * Build a compiler-dependency `ontologyResolver(q) => CompileOntologyHit[]`
 * from a resolve() spine.
 *
 * @param spine The resolve() spine (prefer the shared instance used by the UI
 *   so compiler and UI agree).
 * @param opts.localOnly When true, keep only fast on-box tiers (local records +
 *   OAK). When false (default), remote OLS4 also participates, best-effort.
 */
export function createCompileOntologyResolver(
  spine: ResolveSpine,
  opts: { localOnly?: boolean } = {},
): (q: string) => Promise<CompileOntologyHit[]> {
  const { localOnly = false } = opts;
  return async (q: string) => {
    const candidates = await spine.resolve(q, localOnly ? { localOnly: true } : {});
    return (
      candidates
        // Only real CURIE-typed search hits — never the tier-5 mint affordance.
        .filter((c) => c.curie && c.source !== 'mint')
        .map((c) => ({ id: c.curie, label: c.label, source: c.namespace.toLowerCase() }))
    );
  };
}
