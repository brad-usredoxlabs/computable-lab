/**
 * SPINE-3 — the one resolution engine (§5.1): pass-internal library, NOT a
 * standalone service. `resolveScientistIntentNouns` takes the PARSED
 * ScientistIntent document (SPINE-1 frozen contract), the SPINE-2 vocabulary,
 * and injected adapters; returns { bindings, clarifications, failures }.
 *
 * NO store writes, NO minting, NO pipeline mutation. Mint stays behind
 * MaterialGrounding/EnsureTerm; the spine's tier-5 mint affordance is OFFERED
 * in a clarification, never bound.
 *
 * Policy is data: strategies run in policies().strategyOrder order; the
 * acceptance band is ambiguity.confidenceAccept; the ambiguity arm is decided
 * by the strategy named in ambiguity.strategyRef; the domain bridge is
 * ONTOLOGY_DOMAINS. The engine never switches on a verb, class, or domain
 * NAME (vocabulary.ts's law, inherited). If a check cannot be data-driven it
 * does not belong in this engine.
 */
import type { RankedCandidate } from '../../resolve/types.js';
import { materialLayerOf, isWellReadyLayer } from '../../ai/materialRefFields.js';
import { nearMissSuggestions } from './adapters.js';
import { loadNounShape, isMintableLabel } from '../scientistIntent/nounShape.js';
import type { ScientistIntentVocabulary, ScientistIntentArgContract } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent, ScientistIntentActionKind, ScientistIntentActionLocation } from '../scientistIntent/types.js';
import type {
  BoundNoun,
  Clarification,
  EngineDeps,
  EngineFailure,
  EngineOutcome,
  ResolutionRequest,
  StrategyContext,
} from './types.js';

function confidenceOf(candidate: RankedCandidate): number {
  return Math.min(Math.max(candidate.score, 0), 1);
}

/** Stable ordering: score DESC then curie ASC (declared, test-pinned). */
function sortCandidates(candidates: readonly RankedCandidate[]): RankedCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score || a.curie.localeCompare(b.curie));
}

function dedupeByCurie(candidates: readonly RankedCandidate[]): RankedCandidate[] {
  const byCurie = new Map<string, RankedCandidate>();
  for (const candidate of candidates) {
    if (!candidate.curie) continue; // the mint affordance is handled separately
    const existing = byCurie.get(candidate.curie);
    if (!existing || candidate.score > existing.score) byCurie.set(candidate.curie, candidate);
  }
  return [...byCurie.values()];
}

function mintAffordances(candidates: readonly RankedCandidate[]): RankedCandidate[] {
  return candidates.filter((c) => c.tier === 5 || !c.curie);
}

function candidateFact(candidate: RankedCandidate): { label: string; confidence: number } {
  return { label: candidate.label, confidence: confidenceOf(candidate) };
}

function clarificationFor(
  req: ResolutionRequest,
  reason: string,
  candidates: readonly RankedCandidate[],
): Clarification {
  const ordered = sortCandidates(candidates);
  const actionLocation = req.actionLocation;
  return {
    label: req.label,
    reason,
    ...(ordered.length > 0 ? { candidates: ordered.map(candidateFact) } : {}),
    ...(actionLocation ? { actionLocation } : {}),
  };
}

function bindingFor(req: ResolutionRequest, candidate: RankedCandidate): BoundNoun {
  return {
    verb: req.verb,
    argument: req.argument,
    label: req.label,
    curie: candidate.curie,
    resolvedLabel: candidate.label,
    tier: candidate.tier,
    level: candidate.level,
    confidence: confidenceOf(candidate),
    source: candidate.source,
    ...(req.actionIndex !== undefined ? { actionIndex: req.actionIndex } : {}),
  };
}

/** Level eligibility (§5.5): a concept/unknown candidate is INELIGIBLE for a
 *  well-ready requirement (spec/instance/aliquot) — the same fact
 *  WELL_READY_LAYERS encodes. The requirement rides the wantLevel seam; the
 *  well-ready table is materialRefFields DATA, never a TS copy. */
function levelFilter(
  req: ResolutionRequest,
  candidates: RankedCandidate[],
): { eligible: RankedCandidate[]; traces: string[] } {
  const wantLevel = req.wantLevel;
  if (!wantLevel) return { eligible: candidates, traces: [] };
  if (!isWellReadyLayer(materialLayerOf(wantLevel))) return { eligible: candidates, traces: [] };
  const eligible: RankedCandidate[] = [];
  const traces: string[] = [];
  for (const candidate of candidates) {
    if (candidate.level === 'concept' || candidate.level === 'unknown') {
      traces.push(`level-mismatch: ${candidate.curie} (level ${candidate.level}) ineligible for wantLevel ${wantLevel}`);
    } else {
      eligible.push(candidate);
    }
  }
  return { eligible, traces };
}

export async function resolveNoun(
  req: ResolutionRequest,
  vocab: ScientistIntentVocabulary,
  deps: EngineDeps,
): Promise<EngineOutcome> {
  const policies = vocab.policies();
  const band = policies.ambiguity.confidenceAccept;
  const failures: EngineFailure[] = [];
  const traces: string[] = [];
  const bindings: BoundNoun[] = [];
  const clarifications: Clarification[] = [];

  // Input integrity (§7): actionLocation.action must agree with the action at
  // actionIndex. This is defensive glue, not business policy over a verb.
  if (req.actionLocation?.action !== undefined && req.actionLocation.action !== req.verb) {
    clarifications.push(clarificationFor(req, 'action-location-unreliable', []));
    return { bindings, clarifications, failures, traces };
  }

  const ambiguityStrategy = deps.strategies.get(policies.ambiguity.strategyRef);
  if (!ambiguityStrategy) {
    throw new Error(
      `resolution engine: policies.ambiguity.strategyRef '${policies.ambiguity.strategyRef}' has no strategy implementation`,
    );
  }
  const ambiguityArm = ambiguityStrategy.resolveAmbiguity();

  const adapters = new Map(deps.adapters.map((adapter) => [adapter.id, adapter]));
  const ctx: StrategyContext = {
    adapters,
    adapterIds: deps.adapters.map((adapter) => adapter.id),
    hintStrategyId: policies.hintAuthority.strategyRef,
  };

  const allCandidates: RankedCandidate[] = [];
  let sawFailure = false;

  for (const strategyId of policies.strategyOrder) {
    const strategy = deps.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`resolution engine: strategyOrder names unimplemented strategy '${strategyId}'`);
    }
    if (!strategy.applies(req.declared)) continue;

    // Hint evidence reaches ONLY the strategy the DATA names
    // (policies().hintAuthority.strategyRef); other strategies see no hints.
    let strategyReq = req;
    if (strategyId !== policies.hintAuthority.strategyRef && req.hints) {
      const copy: ResolutionRequest = { ...req };
      delete copy.hints;
      strategyReq = copy;
    }

    const outcome = await strategy.gather(strategyReq, ctx);
    failures.push(...outcome.failures);
    traces.push(...outcome.traces);
    if (outcome.failures.length > 0) sawFailure = true;
    allCandidates.push(...outcome.candidates);

    const { eligible, traces: levelTraces } = levelFilter(req, dedupeByCurie(outcome.candidates));
    traces.push(...levelTraces);
    const inBand = eligible.filter(
      (c) => c.tier !== 5 && confidenceOf(c) >= band.min && confidenceOf(c) <= band.max,
    );

    if (inBand.length === 1) {
      const winner = inBand[0]!;
      const binding = bindingFor(req, winner);
      if (req.declared.kind === 'wells') {
        binding.addresses = sortCandidates(inBand).map((c) => c.label);
      }
      bindings.push(binding);
      return { bindings, clarifications, failures, traces };
    }

    if (inBand.length > 1) {
      // Ambiguity is a structured outcome, never an arbitrary winner — unless
      // the DATA (ambiguity.strategyRef's strategy) declares a top-accept arm.
      if (ambiguityArm === 'top') {
        const top = sortCandidates(inBand)[0]!;
        bindings.push(bindingFor(req, top));
        traces.push(`ambiguity-accepted-top: ${top.curie} via policies.ambiguity.strategyRef ${policies.ambiguity.strategyRef}`);
      } else {
        clarifications.push(clarificationFor(req, 'ambiguous-noun', inBand));
      }
      return { bindings, clarifications, failures, traces };
    }
    // zero in-band: fall through to the next strategy in strategyOrder
  }

  // Nothing bound. The mint affordance is OFFERED only on the unknown-noun arm
  // (never on a lookup-failure arm — lookup error != unknown noun, §5.6).
  // SH-QA-3 (fix 2): the mint affordance is filtered by the noun-shape DATA
  // (config/drafting/shorthand-drafting.yaml `nounShape:` — loaded PER call,
  // never process-cached). A label whose SHAPE fails the DATA patterns is
  // never offered as a CURIE-worthy local term. The reason code is UNCHANGED
  // (`unknown-noun`), the QUESTION survives, and the near-miss suggestions leg
  // below stays intact — only the mint candidates are withheld. A cue hit
  // alone never refuses mint: the check is sentence SHAPE, never " in "/"%".
  const nounShape = loadNounShape();
  const mints = mintAffordances(allCandidates).filter(
    (candidate) => isMintableLabel(candidate.mint?.label ?? candidate.label, nounShape),
  );
  if (sawFailure) {
    clarifications.push(clarificationFor(req, 'resolution-lookup-failed', []));
  } else if (req.declared.kind === 'wells') {
    clarifications.push(clarificationFor(req, 'unknown-address', []));
  } else {
    const clarification = clarificationFor(req, 'unknown-noun', mints);
    if (deps.termsForSuggestions) {
      const suggestions = nearMissSuggestions(req.label, await deps.termsForSuggestions());
      if (suggestions.length > 0) {
        clarification.candidates = [...(clarification.candidates ?? []), ...suggestions];
      }
    }
    clarifications.push(clarification);
  }
  return { bindings, clarifications, failures, traces };
}

/** Build one ResolutionRequest riding the DECLARED contract for one label
 *  (SHORTHAND-COMP-4 Stage B: shared by the scalar arm and the many arm — the
 *  label is the only difference. Hints, expected*Domain slots and the action
 *  location all come from the contract/doc, never from a NAME table). */
function requestFor(
  verb: ScientistIntentActionKind,
  index: number,
  contract: ScientistIntentArgContract,
  fields: Record<string, unknown>,
  label: string,
  deps: EngineDeps,
): ResolutionRequest {
  const hints: Array<{ label: string; reason: string }> = [];
  if (contract.hintEligible === true) {
    const hintValue = fields[`${contract.name}Hint`];
    if (typeof hintValue === 'string' && hintValue.trim()) {
      hints.push({ label: hintValue, reason: `scientist-intent ${contract.name}Hint` });
    }
  }

  // expected*Domain slots are named by argument convention
  // (expectedSourceDomain for 'source', ...) — derived, not a route table.
  const slotKey = `expected${contract.name.charAt(0).toUpperCase()}${contract.name.slice(1)}Domain`;
  const expectedDomain = fields[slotKey];

  const actionLocation: ScientistIntentActionLocation = {
    actionIndex: index,
    action: verb,
    argument: contract.name,
  };

  const wantLevel = deps.levelFor?.(verb, contract.name);
  return {
    verb,
    argument: contract.name,
    label,
    declared: contract,
    actionIndex: index,
    actionLocation,
    ...(typeof expectedDomain === 'string' ? { expectedDomain } : {}),
    ...(hints.length > 0 ? { hints } : {}),
    ...(wantLevel !== undefined ? { wantLevel } : {}),
  };
}

/** The doc-level door: every resolvable/wells argument of every action becomes
 *  a ResolutionRequest riding its DECLARED contract. Verbatim labels are
 *  preserved (resolveDraftMaterials doctrine); *Hint companions enter only as
 *  evidence. SHORTHAND-COMP-4 Stage B: the DECLARED `cardinality` slot decides
 *  how the wire value is read — 'many' + an array yields ONE request per entry,
 *  each label read from the property named by the declared `itemNounField`
 *  (the clarification's label is then the COMPONENT name). Zero verb/arg/
 *  domain NAME literals: everything is driven off the declared contract. */
export async function resolveScientistIntentNouns(
  intent: ScientistIntent,
  vocab: ScientistIntentVocabulary,
  deps: EngineDeps,
): Promise<EngineOutcome> {
  const bindings: BoundNoun[] = [];
  const clarifications: Clarification[] = [];
  const failures: EngineFailure[] = [];
  const traces: string[] = [];

  for (let index = 0; index < intent.actions.length; index++) {
    const action = intent.actions[index]!;
    const verb = action.action;
    for (const contract of vocab.argContracts(verb)) {
      if (contract.kind !== 'resolvable' && contract.kind !== 'wells') continue;
      const fields = action as unknown as Record<string, unknown>;
      const raw = fields[contract.name];

      // Declared-cardinality arm (Stage B): an array-valued many-arg becomes
      // one request per entry. Malformed entries are Ajv's job (the wire
      // schema is the entry-shape authority); an entry whose noun property is
      // absent/blank is skipped defensively, exactly like a blank scalar.
      if (contract.cardinality === 'many' && Array.isArray(raw)) {
        const nounField = contract.itemNounField;
        if (!nounField) continue; // lint P5 makes this unreachable for shipped data
        for (const entry of raw) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          const noun = (entry as Record<string, unknown>)[nounField];
          if (typeof noun !== 'string' || noun.trim().length === 0) continue;
          const outcome = await resolveNoun(requestFor(verb, index, contract, fields, noun.trim(), deps), vocab, deps);
          bindings.push(...outcome.bindings);
          clarifications.push(...outcome.clarifications);
          failures.push(...outcome.failures);
          traces.push(...outcome.traces);
        }
        continue;
      }

      // Scalar arm (byte-identical behavior to pre-Stage-B): non-string values
      // of a non-many arg stay invisible to the door.
      if (typeof raw !== 'string' || raw.trim().length === 0) continue;

      const outcome = await resolveNoun(requestFor(verb, index, contract, fields, raw.trim(), deps), vocab, deps);
      bindings.push(...outcome.bindings);
      clarifications.push(...outcome.clarifications);
      failures.push(...outcome.failures);
      traces.push(...outcome.traces);
    }
  }

  return { bindings, clarifications, failures, traces };
}
