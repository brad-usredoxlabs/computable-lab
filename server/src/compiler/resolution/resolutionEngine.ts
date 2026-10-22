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
import { loadNounShape, isMintableLabel } from './nounShape.js';
import { buildEligibilityEnvelope } from './eligibility/facts.js';
import { evaluateCandidateEligibility, type CandidateEligibility } from './eligibility/evaluate.js';
import type { MaterialEligibilityPolicy } from './eligibility/policy.js';
import type { ScientistIntentVocabulary, ScientistIntentArgContract } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent, ScientistIntentActionKind, ScientistIntentActionLocation } from '../scientistIntent/types.js';
import type {
  BoundNoun,
  Clarification,
  ClarificationCandidateFact,
  EligibilityVerdictFact,
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

/** MINT-FLOOR-UI-1 — keyed collapse of IDENTICAL mint affordances. The two
 *  spine-gathering strategies (symbolic_label + ontology_resolution) each
 *  carry the spine's per-call tier-5 mint (ResolveSpine.ts:218), and
 *  dedupeByCurie above explicitly skips no-curie candidates — so N identical
 *  mint copies used to reach the unknown-noun clarification (the blessed
 *  goldens baked 2 per noun). The key is the mint identity the candidate
 *  already carries (`mint.label`, fallback `label`) — candidate STRUCTURE
 *  (tier/curie/mint.label), never a verb, class, domain, or noun NAME.
 *  Different mint labels (a near-miss mint for another term) stay distinct.
 *  Non-mint candidates never enter this map. */
function dedupeMintsByLabel(candidates: readonly RankedCandidate[]): RankedCandidate[] {
  const byMintLabel = new Map<string, RankedCandidate>();
  for (const candidate of candidates) {
    const key = candidate.mint?.label ?? candidate.label;
    const existing = byMintLabel.get(key);
    if (!existing || candidate.score > existing.score) byMintLabel.set(key, candidate);
  }
  return [...byMintLabel.values()];
}

/** W28-OPTIONBIND-1 (ARCHITECT DECISION W28-A5n Q1) — the candidate's OWN
 *  store-backed record identity, as the SPINE-1 candidate entry's optional
 *  `ref`. Anti-fabrication is the whole rule (A5n verbatim: "the handle is
 *  the engine's existing gathered evidence, never a minted value"):
 *  - tier > 1 (ontology/vendor hits) and the tier-5 mint affordance: NO ref;
 *  - the spine's declared local-CURIE convention is `local:<recordId>`
 *    (providers/records.ts, terms.ts) — a suffix that still carries ':' is
 *    NOT a record id (the role-address arm's `local:well:<address>` names a
 *    WELL, not a record), so it gets NO ref;
 *  - the labware-hint/registry adapters already carry the bare recordId as
 *    the curie (adapters.ts) — that rides verbatim.
 *  The unwrap mirrors resolveNounsPass.ts recordIdFromCurie exactly (the same
 *  declared prefix), so the ref is the id store.get() accepts and the
 *  ClarificationPicker answerFromMention idiom already carries. */
function candidateRecordRef(candidate: RankedCandidate): string | undefined {
  if (candidate.tier > 1) return undefined;
  const curie = candidate.curie;
  if (!curie) return undefined; // the mint affordance carries no curie
  const prefix = 'local:';
  const recordId = curie.startsWith(prefix) ? curie.slice(prefix.length) : curie;
  if (!recordId || recordId.includes(':')) return undefined; // not a record id
  return recordId;
}

/** MATRES-ELIG §7.4: one evaluated in-band candidate — the verdict trio plus
 *  the envelope's derived referent level (disclosure source). */
interface EligibilityRun {
  eligibility: CandidateEligibility;
  referentLevel: string;
}

function verdictFact(e: CandidateEligibility): EligibilityVerdictFact {
  return {
    display: e.display.state,
    suppress: e.suppress.state,
    bind: e.bind.state,
    policyIds: { display: e.display.policyId, suppress: e.suppress.policyId, bind: e.bind.policyId },
    ...(e.bind.role !== undefined ? { bindRole: e.bind.role } : {}),
  };
}

function candidateFact(
  candidate: RankedCandidate,
  run?: EligibilityRun,
): ClarificationCandidateFact {
  const ref = candidateRecordRef(candidate);
  return {
    label: candidate.label,
    confidence: confidenceOf(candidate),
    ...(ref !== undefined ? { ref } : {}),
    // MATRES-ELIG §7.4.4 (D6): ADDITIVE disclosure — the candidate states its
    // own facts (tier, derived referent level, the three verdict enums + the
    // policy ids that decided them). Conditional spread only; a candidate with
    // no eligibility run keeps its pre-ELIG shape byte-identically.
    ...(run !== undefined ? {
      tier: candidate.tier,
      referentLevel: run.referentLevel,
      eligibility: verdictFact(run.eligibility),
    } : {}),
  };
}

function clarificationFor(
  req: ResolutionRequest,
  reason: string,
  candidates: readonly RankedCandidate[],
  runs?: Map<RankedCandidate, EligibilityRun>,
): Clarification {
  const ordered = sortCandidates(candidates);
  const actionLocation = req.actionLocation;
  return {
    label: req.label,
    reason,
    ...(ordered.length > 0
      ? { candidates: ordered.map((c) => candidateFact(c, runs?.get(c))) }
      : {}),
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

/** MATRES-ELIG AC-3 gate (spec §7.3): a token whose SHAPE matches the policy
 *  data's `catalogShape` patterns while the request declares NO vendor scope is
 *  a catalog-shaped token — the utterance must say WHICH catalog. The gate
 *  elicits the scope (the data-named reason) and carries NO candidates: shape
 *  alone never invents vendor scope and never fabricates product identity.
 *  Generic read: the patterns and the reason code are DATA; zero vendor-kind
 *  literals here. Returns null when the token is not catalog-shaped or a scope
 *  IS declared (then ordinary gathering proceeds). */
function catalogScopeGate(
  req: ResolutionRequest,
  policy: MaterialEligibilityPolicy,
): { reason: string; traces: string[] } | null {
  const shaped = policy.catalogShape().some((pattern) => pattern.test(req.label.trim()));
  if (!shaped) return null;
  if (req.scopedIdentifiers !== undefined && req.scopedIdentifiers.length > 0) return null;
  return {
    reason: policy.catalogScopeReason(),
    traces: [
      `catalog-scope-gate: label "${req.label}" matches a data catalogShape pattern with no declared vendor scope — eliciting scope, fabricating no identity`,
    ],
  };
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

  // --- MATRES-ELIG (§7.4) -------------------------------------------------
  // The eligibility POLICY is data (schema/scientist-intent/material-eligibility/),
  // loaded PER call by the caller (never process-cached — the nounShape law).
  // Absent data ⇒ the engine runs its pre-ELIG behavior byte-identically: the
  // eligibility arms below are inert without the document. The engine holds NO
  // policy branch: every tier/level/verdict/reason value it consults is read
  // from the document through the eligibility modules (no tier literal, no
  // level name, no reason literal appears in this arm).
  const eligibilityPolicy = deps.eligibility;
  const catalogGate = eligibilityPolicy
    ? catalogScopeGate(req, eligibilityPolicy)
    : null;
  if (catalogGate) {
    // AC-3: a catalog-shaped token with NO declared vendor scope elicits the
    // scope. The clarification carries NO candidates — nothing is minted or
    // labelled with an invented vendor (shape alone never invents scope).
    traces.push(...catalogGate.traces);
    clarifications.push(clarificationFor(req, catalogGate.reason, []));
    return { bindings, clarifications, failures, traces };
  }

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

    // §7.4.1: assemble the declared-fact envelope per in-band candidate and
    // evaluate the three data-declared predicates. Verdicts ride the existing
    // traces channel; the disclosure rides the candidate payload (§7.4.4).
    const runs = new Map<RankedCandidate, EligibilityRun>();
    if (eligibilityPolicy && inBand.length > 0) {
      for (const candidate of inBand) {
        const envelope = buildEligibilityEnvelope({
          policy: eligibilityPolicy,
          candidate,
          contract: req.declared,
          ...(req.scopedIdentifiers !== undefined ? { utteranceScopedIdentifiers: req.scopedIdentifiers } : {}),
        });
        const eligibility = evaluateCandidateEligibility(eligibilityPolicy, envelope);
        runs.set(candidate, { eligibility, referentLevel: envelope.candidate.referentLevel });
        for (const trace of eligibility.traces) {
          traces.push(`${candidate.curie || candidate.label}: ${trace}`);
        }
      }
    }

    // §7.4.3 SUPPRESSION: the early-return on `inBand >= 1` is replaced by the
    // sufficient-to-suppress VERDICT. The loop continues to the next strategy
    // iff NO in-band candidate is sufficient-to-suppress PASS — an
    // approximate-level local candidate can no longer suppress an exact
    // demanded-level remote candidate (AC-1). Without the data the presence
    // law stands byte-identically. Suppression is never a side effect of
    // truncation or tier presence (M1).
    const suppresses = eligibilityPolicy
      ? inBand.some((c) => runs.get(c)!.eligibility.suppress.state === 'pass')
      : inBand.length > 0;
    if (!suppresses) continue;

    if (inBand.length === 1) {
      const winner = inBand[0]!;
      // §7.4.2 BIND: a band-passing candidate binds only on authorized-to-bind
      // PASS. A band-passing but bind-INCOMPLETE/FAIL candidate falls to
      // clarification as an INCOMPLETE POSSIBILITY (the data-named reason),
      // never a bind and never a silent pass.
      const bindVerdict = runs.get(winner)?.eligibility.bind;
      if (bindVerdict !== undefined && bindVerdict.state !== 'pass') {
        clarifications.push(clarificationFor(req, eligibilityPolicy!.bindIncompleteReason(), inBand, runs));
        return { bindings, clarifications, failures, traces };
      }
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
        clarifications.push(clarificationFor(req, 'ambiguous-noun', inBand, runs));
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
  // The noun-shape bar runs FIRST (unchanged): it gates WHAT enters. Only
  // what passed is collapsed — identical mint copies for the same mint label
  // collapse to one (MINT-FLOOR-UI-1); different mint labels stay distinct.
  const mints = dedupeMintsByLabel(
    mintAffordances(allCandidates).filter(
      (candidate) => isMintableLabel(candidate.mint?.label ?? candidate.label, nounShape),
    ),
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
