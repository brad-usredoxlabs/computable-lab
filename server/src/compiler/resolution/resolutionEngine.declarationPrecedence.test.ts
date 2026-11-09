/**
 * COMPBIND criterion-1 — declaration_precedence strategy.
 *
 * Architect ruling 11a181c0 Q1: when two equal-score candidates land in-band,
 * the one carrying formulationDeclared: true wins. The precedence is DECLARED
 * IN DATA (policies.ambiguity.strategyRef + strategyOrder), not a TS comparator.
 *
 * formulationDeclared is a typed contract term (server/src/resolve/types.ts:51)
 * — present only when true, ABSENT on candidates without it.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit, ResolveProvider } from '../../resolve/types.js';
import {
  createFailureTrackingProvider,
  createSpineAdapter,
  createLabwareHintAdapter,
  createRegistryAdapter,
  createRoleAddressAdapter,
} from './adapters.js';
import { buildStrategyRegistry } from './strategies.js';
import { resolveNoun, type EngineDeps, type ResolutionRequest } from './resolutionEngine.js';

const shippedVocab = () => loadScientistIntentVocabulary();

function hits(...hs: ProviderHit[]): ResolveProvider {
  return async () => hs;
}

function spineWith(termProvider: ResolveProvider, recordProvider: ResolveProvider) {
  const tracker = { failed: false };
  const spine = createResolveSpine({
    termProvider: createFailureTrackingProvider(termProvider, tracker),
    recordProvider: createFailureTrackingProvider(recordProvider, tracker),
    localTimeoutMs: 500,
    remoteTimeoutMs: 500,
  });
  return { spine, tracker };
}

function depsFor(opts: {
  spine: ReturnType<typeof spineWith>['spine'];
  tracker: { failed: boolean };
  vocab: ReturnType<typeof shippedVocab>;
}): EngineDeps {
  const adapters = [
    createSpineAdapter(opts.spine, opts.tracker),
    createLabwareHintAdapter(async () => []),
    createRegistryAdapter({
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
    }),
    createRoleAddressAdapter(),
  ];
  return {
    adapters,
    strategies: buildStrategyRegistry(),
  };
}

function request(over: Partial<ResolutionRequest> & { verb: string; argument: string; label: string; declared: ResolutionRequest['declared'] }): ResolutionRequest {
  const base = { actionIndex: 0, ...over };
  return {
    ...base,
    actionLocation: base.actionLocation ?? {
      actionIndex: base.actionIndex ?? 0,
      action: base.verb as never,
      argument: base.argument,
    },
  };
}

// ---------------------------------------------------------------------------
// Build a test vocabulary wrapper that points policies at declaration_precedence
// ---------------------------------------------------------------------------
function declarationVocab(): ReturnType<typeof shippedVocab> {
  const base = shippedVocab();
  const basePolicies = base.policies();
  return {
    ...base,
    policies: () => ({
      ...basePolicies,
      strategyOrder: ['declaration_precedence', ...basePolicies.strategyOrder],
      ambiguity: { ...basePolicies.ambiguity, strategyRef: 'declaration_precedence' },
    }),
  };
}

// Use transfer.source (no level requirement, domain: [labware, material])
const sourceContract = shippedVocab().argContracts('transfer').find((a) => a.name === 'source')!;

describe('resolutionEngine.declarationPrecedence', () => {
  // Both candidates from the record provider (tier 1) so they share the same
  // TIER_BASE score. The label is identical so matchBonus is identical.
  // conceptHit: no formulationDeclared (absent per contract)
  const conceptHit: ProviderHit = {
    curie: 'local:MAT-1-mm-clofibrate',
    label: 'clofibrate',
    namespace: 'local',
    level: 'concept',
    termKind: 'material',
  };

  // specHit: carries formulationDeclared: true
  const specHit: ProviderHit = {
    curie: 'MSP-PR9-TEST-CLO-1MM',
    label: 'clofibrate',
    namespace: 'msp',
    level: 'spec',
    formulationDeclared: true,
  };

  // -----------------------------------------------------------------------
  // Positive pin: one declared candidate at top score => bind the spec CURIE
  // Both hits have the same label → same matchBonus → same score (1.0 + 0.15 = 1.15)
  // The strategy narrows to specHit (formulationDeclared: true)
  // The narrowed band (1 candidate) binds through the existing single-bind path
  // -----------------------------------------------------------------------
  it('one declared candidate at top score binds the spec CURIE, zero clarification', async () => {
    const dv = declarationVocab();
    // Both candidates from record provider (tier 1) — no term provider hits
    const { spine, tracker } = spineWith(hits(), hits(conceptHit, specHit));
    const deps = depsFor({ spine, tracker, vocab: dv });

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'clofibrate', declared: sourceContract }),
      dv,
      deps,
    );

    expect(outcome.bindings).toHaveLength(1);
    expect(outcome.bindings[0]!.curie).toBe('MSP-PR9-TEST-CLO-1MM');
    expect(outcome.clarifications).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Negative pin (a): BOTH candidates carry formulationDeclared: true
  // => no narrowing => two in-band => clarify
  // -----------------------------------------------------------------------
  it('two candidates BOTH declared at equal score => clarify, no bind', async () => {
    const dv = declarationVocab();
    const conceptDeclared: ProviderHit = { ...conceptHit, formulationDeclared: true };
    const specDeclared: ProviderHit = { ...specHit };

    const { spine, tracker } = spineWith(hits(), hits(conceptDeclared, specDeclared));
    const deps = depsFor({ spine, tracker, vocab: dv });

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'clofibrate', declared: sourceContract }),
      dv,
      deps,
    );

    // Never pick when both are declared — still ambiguous
    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    expect(outcome.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  // -----------------------------------------------------------------------
  // Negative pin (b): NO candidate carries formulationDeclared
  // => no narrowing => two in-band => clarify
  // -----------------------------------------------------------------------
  it('no candidate declared => clarify (byte-identical to base)', async () => {
    const dv = declarationVocab();
    const conceptNotDeclared: ProviderHit = { ...conceptHit };
    const specNotDeclared: ProviderHit = { ...specHit };
    // Ensure neither has formulationDeclared (delete to enforce absent)
    delete (conceptNotDeclared as any).formulationDeclared;
    delete (specNotDeclared as any).formulationDeclared;

    const { spine, tracker } = spineWith(hits(), hits(conceptNotDeclared, specNotDeclared));
    const deps = depsFor({ spine, tracker, vocab: dv });

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'clofibrate', declared: sourceContract }),
      dv,
      deps,
    );

    // Band unchanged — still clarifies
    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    expect(outcome.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  // -----------------------------------------------------------------------
  // Negative pin (c): zero in-band => falls through to unknown-noun
  // -----------------------------------------------------------------------
  it('zero spine hits => no bind from precedence arm', async () => {
    const dv = declarationVocab();
    const { spine, tracker } = spineWith(hits(), hits());
    const deps = depsFor({ spine, tracker, vocab: dv });

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'nothing', declared: sourceContract }),
      dv,
      deps,
    );

    expect(outcome.bindings).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // SHIPPED-DATA PINS — declaration_precedence must be first in strategyOrder
  // and strategyRef must point to it. These read the actual shipped YAML.
  // -----------------------------------------------------------------------
  describe('shipped-vocabulary-pins', () => {
    it('strategyOrder[0] is declaration_precedence in shipped vocabulary', () => {
      expect(loadScientistIntentVocabulary().policies().strategyOrder[0]).toBe('declaration_precedence');
    });

    it('ambiguity.strategyRef is declaration_precedence in shipped vocabulary', () => {
      expect(loadScientistIntentVocabulary().policies().ambiguity.strategyRef).toBe('declaration_precedence');
    });

    // Positive scenario with shipped vocabulary directly — no declarationVocab() override.
    // If the YAML is reverted, this test goes RED.
    it('one declared candidate binds spec CURIE using shipped vocabulary directly', async () => {
      const vocab = loadScientistIntentVocabulary();
      const { spine, tracker } = spineWith(hits(), hits(conceptHit, specHit));
      const deps = depsFor({ spine, tracker, vocab });

      const outcome = await resolveNoun(
        request({ verb: 'transfer', argument: 'source', label: 'clofibrate', declared: sourceContract }),
        vocab,
        deps,
      );

      expect(outcome.bindings).toHaveLength(1);
      expect(outcome.bindings[0]!.curie).toBe('MSP-PR9-TEST-CLO-1MM');
      expect(outcome.clarifications).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Negative pin (c-continued): one in-band => binds through existing path
  // -----------------------------------------------------------------------
  it('one in-band candidate => binds through existing single-bind path', async () => {
    const dv = declarationVocab();
    const { spine, tracker } = spineWith(hits(), hits(specHit));
    const deps = depsFor({ spine, tracker, vocab: dv });

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'clofibrate', declared: sourceContract }),
      dv,
      deps,
    );

    expect(outcome.bindings).toHaveLength(1);
    expect(outcome.bindings[0]!.curie).toBe('MSP-PR9-TEST-CLO-1MM');
    expect(outcome.clarifications).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // DATA mutation proof: reverting strategyRef restores base behavior
  // -----------------------------------------------------------------------
  it('DATA mutation proof: reverting strategyRef to symbolic_label restores base behavior', async () => {
    const dv = declarationVocab();
    const basePolicies = dv.policies();
    const revertedVocab = {
      ...dv,
      policies: () => ({
        ...basePolicies,
        strategyOrder: [...basePolicies.strategyOrder.filter((s) => s !== 'declaration_precedence')],
        ambiguity: { ...basePolicies.ambiguity, strategyRef: 'symbolic_label' },
      }),
    } as ReturnType<typeof shippedVocab>;

    const { spine, tracker } = spineWith(hits(), hits(conceptHit, specHit));
    const deps = depsFor({ spine, tracker, vocab: revertedVocab });

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'clofibrate', declared: sourceContract }),
      revertedVocab,
      deps,
    );

    // With symbolic_label: no narrowing => both in-band => clarify
    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    expect(outcome.clarifications[0]!.reason).toBe('ambiguous-noun');
  });
});
