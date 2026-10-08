/**
 * SPINE-3 strategy registry — strategy IMPLEMENTATIONS are imperative code;
 * selection, order, and presence are DATA (policies().strategyOrder). The
 * engine looks strategies up by the vocabulary's declared ids only; it never
 * picks a strategy by verb, class, or domain NAME. Applicability is decided
 * from the DECLARED contract data (kind / hintEligible).
 *
 * The ambiguity arm is also data: policies().ambiguity.strategyRef names the
 * strategy whose resolveAmbiguity() decides what an in-band multi-candidate
 * set means ('clarify' | 'top'). A fixture COPY that swaps strategyOrder or
 * flips the strategyRef flips engine outcomes with zero TS diff.
 */
import type { RankedCandidate } from '../../resolve/types.js';
import type { ScientistIntentArgContract } from '../scientistIntent/vocabulary.js';
import { filterCandidatesByDeclaredDomain } from './adapters.js';
import type {
  EngineFailure,
  ResolutionRequest,
  ResolutionStrategy,
  StrategyContext,
  StrategyOutcome,
} from './types.js';

async function gatherFrom(
  req: ResolutionRequest,
  ctx: StrategyContext,
  adapterIds: readonly string[],
): Promise<StrategyOutcome> {
  const candidates: RankedCandidate[] = [];
  const failures: EngineFailure[] = [];
  const traces: string[] = [];
  for (const adapterId of adapterIds) {
    const adapter = ctx.adapters.get(adapterId);
    if (!adapter) continue;
    const outcome = await adapter.gather(req.label, req);
    if (outcome.failed) {
      failures.push({ kind: 'lookup_error', adapter: adapterId, term: req.label, message: outcome.error ?? 'lookup failed' });
    }
    candidates.push(...outcome.candidates);
  }
  return { candidates, failures, traces };
}

/** The declared domain tag -> ONTOLOGY_DOMAINS (data) -> namespace filter.
 *  Rejections are named in trace lines, never silently dropped. The effective
 *  domain is the vocabulary's declared domain; the doc's expected*Domain slot
 *  (SPINE-1's declaration, "SPINE-3 is that consumer") fills it when the
 *  vocabulary declares none, and a declared/expected disagreement is traced. */
function withDomainFilter(req: ResolutionRequest, outcome: StrategyOutcome): StrategyOutcome {
  const effectiveDomain = req.declared.domain ?? req.expectedDomain;
  const { eligible, rejected } = filterCandidatesByDeclaredDomain(outcome.candidates, effectiveDomain);
  const disagreement =
    req.declared.domain && req.expectedDomain && req.declared.domain !== req.expectedDomain
      ? [`domain-expectation: declared ${req.declared.domain} vs doc expected ${req.expectedDomain} for ${req.verb}.${req.argument}`]
      : [];
  return {
    candidates: eligible,
    failures: outcome.failures,
    traces: [
      ...outcome.traces,
      ...disagreement,
      ...rejected.map((r) => `domain-mismatch: ${r.curie} rejected for declared domain ${effectiveDomain ?? 'none'}`),
    ],
  };
}

// explicit_wells — address-kind arguments (contract kind 'wells') through the
// role-address adapter (defaultRoleResolver). Applicability: DATA kind.
const explicitWells: ResolutionStrategy = {
  id: 'explicit_wells',
  applies: (contract: ScientistIntentArgContract) => contract.kind === 'wells',
  gather: async (req, ctx) => gatherFrom(req, ctx, ['role-address']),
  resolveAmbiguity: () => 'clarify',
};

// hint_search — hint-eligible arguments (contract hintEligible flag, DATA)
// through the labware-hint lookup. Hints are evidence: they drive ADDITIONAL
// lookups (the engine's hintAuthority strategyRef names this strategy); the
// identities are the recordIds the lookup returns, never the hint strings.
const hintSearch: ResolutionStrategy = {
  id: 'hint_search',
  applies: (contract: ScientistIntentArgContract) => contract.hintEligible === true,
  gather: async (req, ctx) => {
    const outcome = await gatherFrom(req, ctx, ['labware-hint']);
    for (const hint of req.hints ?? []) {
      const adapter = ctx.adapters.get('labware-hint');
      if (!adapter) break;
      const hintOutcome = await adapter.gather(hint.label, { ...req, label: hint.label });
      if (hintOutcome.failed) {
        outcome.failures.push({ kind: 'lookup_error', adapter: 'labware-hint', term: hint.label, message: hintOutcome.error ?? 'lookup failed' });
      }
      outcome.candidates.push(...hintOutcome.candidates);
    }
    return outcome;
  },
  resolveAmbiguity: () => 'clarify',
};

// symbolic_label — resolvable arguments through the spine, filtered by the
// declared domain via ONTOLOGY_DOMAINS (data). Clarify on ambiguity.
const symbolicLabel: ResolutionStrategy = {
  id: 'symbolic_label',
  applies: (contract: ScientistIntentArgContract) => contract.kind === 'resolvable',
  gather: async (req, ctx) => withDomainFilter(req, await gatherFrom(req, ctx, ['spine'])),
  resolveAmbiguity: () => 'clarify',
};

// ontology_resolution — resolvable arguments through the spine with the
// declared-domain bridge applied (the ontology map is ONTOLOGY_DOMAINS data;
// no TS domain->ontology literals anywhere).
const ontologyResolution: ResolutionStrategy = {
  id: 'ontology_resolution',
  applies: (contract: ScientistIntentArgContract) => contract.kind === 'resolvable',
  gather: async (req, ctx) => withDomainFilter(req, await gatherFrom(req, ctx, ['spine'])),
  resolveAmbiguity: () => 'clarify',
};

// mint_local — the tier-5 mint affordance is an AFFORDANCE the engine may
// OFFER in a clarification, never a binding. This strategy gathers nothing
// new (the spine adapter already carries the affordance); its presence in
// strategyOrder is what makes the affordance-offer arm reachable.
const mintLocal: ResolutionStrategy = {
  id: 'mint_local',
  applies: (contract: ScientistIntentArgContract) => contract.kind === 'resolvable',
  gather: async () => ({ candidates: [], failures: [], traces: [] }),
  resolveAmbiguity: () => 'clarify',
};

// accept_top_ranked — an ambiguity-arm strategy that accepts the top-ranked
// in-band candidate. Reachable ONLY when the vocabulary DATA names it
// (strategyOrder + ambiguity.strategyRef); the shipped vocabulary does not.
const acceptTopRanked: ResolutionStrategy = {
  id: 'accept_top_ranked',
  applies: (contract: ScientistIntentArgContract) => contract.kind === 'resolvable',
  gather: async () => ({ candidates: [], failures: [], traces: [] }),
  resolveAmbiguity: () => 'top',
};

export function buildStrategyRegistry(): Map<string, ResolutionStrategy> {
  return new Map<string, ResolutionStrategy>([
    [explicitWells.id, explicitWells],
    [hintSearch.id, hintSearch],
    [symbolicLabel.id, symbolicLabel],
    [ontologyResolution.id, ontologyResolution],
    [mintLocal.id, mintLocal],
    [acceptTopRanked.id, acceptTopRanked],
  ]);
}
