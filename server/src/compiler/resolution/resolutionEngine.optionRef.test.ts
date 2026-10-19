/**
 * W28-OPTIONBIND-1 — the engine candidate's OPTIONAL store-backed record
 * handle (RED-first, ARCHITECT DECISION W28-A5n Q1, spec 2026-10-19_1515 §Group 2.1).
 *
 * Class fixed: OPTION-PICK NON-BINDING. The wire's clarification candidates
 * carry {label, confidence} ONLY (resolutionEngine.ts candidateFact :77-79), so
 * an option button on an engine ambiguous-noun card has no record identity to
 * ride: its answer is a plain label the ANSWER-BIND contract treats as
 * prompt-echo only (IntentCompileFromPromptHandlers.ts MENTION_ANSWER_PATTERN
 * + store validation) -> inert answer -> identical card re-emitted forever.
 *
 * Fix: candidateFact gains an OPTIONAL `ref` — the candidate's OWN store-backed
 * record id — populated ONLY from a tier <= 1 candidate whose CURIE names a
 * record (the spine's declared conventions: providers/records.ts + terms.ts
 * `local:<recordId>`, unwrapped exactly as resolveNounsPass.ts recordIdFromCurie
 * does; the labware-hint/registry adapters already carry the bare recordId as
 * the curie). Anti-fabrication (A5n verbatim): the handle is the engine's
 * EXISTING gathered evidence, never a minted or inferred value —
 *   - the tier-5 mint affordance (no curie) gets NO handle;
 *   - tier > 1 (ontology hits) get NO handle;
 *   - the role-address arm's curie ('local:well:<address>') names a WELL, not
 *     a record — the spine's own declared format says a record id carries no
 *     ':' after the 'local:' prefix, so an address candidate gets NO handle.
 *
 * The ref is the id the ClarificationPicker answerFromMention idiom already
 * carries (ClarificationPicker.tsx:118-131 `[[labware:<id>|<label>]]`), so the
 * existing server validation (parseMentionAnswer + store.get) accepts the
 * resulting answer unchanged. exactOptionalPropertyTypes: the key is ABSENT or
 * a value, never :undefined (conditional spread).
 *
 * RED at base: legs 1-3 fail (`expected undefined ... to be ...` / candidate
 * key sets lack 'ref'); legs 4-6 are characterization pins that hold at base
 * AND after the fix (anti-fabrication must not regress).
 *
 * Hard constraints honored: resolveNounsPass.ts :313 value-join and the
 * STAGNANT-HEDGE consume rule are NOT touched by this file or its fix.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { parseScientistIntent, SCIENTIST_INTENT_SCHEMA_ID } from '../scientistIntent/parseScientistIntent.js';
import { createValidator } from '../../validation/AjvValidator.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit, RankedCandidate, ResolveProvider } from '../../resolve/types.js';
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
  searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  strategies?: Map<string, EngineDeps['strategies'] extends Map<string, infer S> ? S : never>;
}): EngineDeps {
  const adapters = [
    createSpineAdapter(opts.spine, opts.tracker),
    createLabwareHintAdapter(opts.searchLabwareByHint ?? (async () => [])),
    createRegistryAdapter({
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
    }),
    createRoleAddressAdapter(),
  ];
  return {
    adapters,
    strategies: opts.strategies ?? buildStrategyRegistry(),
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
// 1. store-backed tier-1 candidates carry the handle (the OPTIONBIND leg)
// ---------------------------------------------------------------------------

describe('optionbind.candidate record handle (W28-A5n Q1)', () => {
  it('1. ambiguous labware-hint candidates (tier 1, bare-recordId curie) carry ref = the record id', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;
    const twoMatches = async () => [
      { recordId: 'LBW-B', title: 'Gemini reader B' },
      { recordId: 'LBW-A', title: 'Gemini reader A' },
    ];
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine, tracker, searchLabwareByHint: twoMatches }),
    );
    expect(outcome.clarifications).toHaveLength(1);
    const clarification = outcome.clarifications[0]!;
    expect(clarification.reason).toBe('ambiguous-noun');
    const candidates = clarification.candidates ?? [];
    expect(candidates.map((c) => c.label)).toEqual(['Gemini reader A', 'Gemini reader B']);
    // RED at base: candidateFact emits {label, confidence} only.
    expect(candidates.map((c) => (c as Record<string, unknown>)['ref'])).toEqual(['LBW-A', 'LBW-B']);
  });

  it('2. spine tier-0 term-record candidates (local:<recordId> curie) carry ref = the UNWRAPPED record id', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;
    // Two canonical term records for the same label -> in-band ambiguity.
    const { spine, tracker } = spineWith(
      hits(
        { curie: 'local:TERM-gemini-a', label: 'Gemini plate A', namespace: 'local' },
        { curie: 'local:TERM-gemini-b', label: 'Gemini plate B', namespace: 'local' },
      ),
      hits(),
    );
    const outcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine, tracker }),
    );
    const candidates = outcome.clarifications[0]!.candidates ?? [];
    expect(candidates.length).toBe(2);
    // The handle is the record id the store.get() lookup accepts — the 'local:'
    // prefix is the spine's declared CURIE convention, unwrapped exactly as
    // resolveNounsPass.ts recordIdFromCurie unwraps binding curies.
    expect(candidates.map((c) => (c as Record<string, unknown>)['ref']).sort()).toEqual([
      'TERM-gemini-a',
      'TERM-gemini-b',
    ]);
  });

  it('3. the unresolved-shape candidate entry carries the ref KEY (absent-or-value, never :undefined)', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;
    const twoMatches = async () => [
      { recordId: 'LBW-A', title: 'Gemini reader A' },
      { recordId: 'LBW-B', title: 'Gemini reader B' },
    ];
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine, tracker, searchLabwareByHint: twoMatches }),
    );
    const candidates = (outcome.clarifications[0]!.candidates ?? []) as Array<Record<string, unknown>>;
    // exactOptionalPropertyTypes contract: the KEY is present with a string value.
    expect(Object.keys(candidates[0]!).sort()).toEqual(['confidence', 'label', 'ref']);
    expect(typeof candidates[0]!['ref']).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Anti-fabrication legs: characterization pins that hold at base AND after
  // the fix — the handle is the engine's existing evidence, never a minted,
  // ontology, or well-address value.
  // -------------------------------------------------------------------------

  it('4. the tier-5 mint affordance candidate carries NO ref key (anti-fabrication)', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'mystery reader', declared: contract }),
      vocab,
      depsFor({ spine, tracker }),
    );
    expect(outcome.clarifications[0]!.reason).toBe('unknown-noun');
    const candidates = (outcome.clarifications[0]!.candidates ?? []) as Array<Record<string, unknown>>;
    const mint = candidates.find((c) => String(c['label']).includes('Create local term'));
    expect(mint).toBeDefined();
    expect(mint!).not.toHaveProperty('ref');
    expect(Object.keys(mint!).sort()).toEqual(['confidence', 'label']);
  });

  it('5. tier > 1 candidates (ontology hits) carry NO ref key', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'instrument')!;
    // The engine's spine adapter runs localOnly (remote tiers never gather), so
    // the tier gate is pinned through the injected strategy seam
    // (EngineDeps.strategies is the declared injection map): the mint_local slot
    // is replaced with an implementation gathering two tier-3 (ols4) candidates.
    const tier3 = (curie: string, label: string): RankedCandidate => ({
      curie,
      label,
      namespace: 'CHEBI',
      tier: 3,
      level: 'unknown',
      score: 0.9,
      source: 'ols4',
    });
    const strategies = buildStrategyRegistry();
    strategies.set('mint_local', {
      id: 'mint_local',
      applies: () => true,
      gather: async () => ({
        candidates: [tier3('CHEBI:1001', 'Cycler alpha'), tier3('CHEBI:1002', 'Cycler beta')],
        failures: [],
        traces: [],
      }),
      resolveAmbiguity: () => 'clarify',
    });
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'read', argument: 'instrument', label: 'Cycler', declared: contract }),
      vocab,
      depsFor({ spine, tracker, strategies: strategies as EngineDeps['strategies'] }),
    );
    expect(outcome.clarifications[0]!.reason).toBe('ambiguous-noun');
    const candidates = (outcome.clarifications[0]!.candidates ?? []) as Array<Record<string, unknown>>;
    expect(candidates.length).toBe(2);
    for (const candidate of candidates) {
      expect(candidate).not.toHaveProperty('ref');
    }
  });

  it('6. role-address well candidates (local:well:<address>) carry NO ref key — a well is not a record', async () => {
    const vocab = shippedVocab();
    const wellsContract = vocab.argContracts('transfer').find((a) => a.name === 'sourceWells')!;
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'sourceWells', label: 'cell_region', declared: wellsContract }),
      vocab,
      depsFor({ spine, tracker }),
    );
    // cell_region expands to 60 in-band tier-1 address candidates -> ambiguity.
    const clarification = outcome.clarifications[0]!;
    expect(clarification.reason).toBe('ambiguous-noun');
    const candidates = (clarification.candidates ?? []) as Array<Record<string, unknown>>;
    expect(candidates.length).toBeGreaterThan(1);
    for (const candidate of candidates) {
      expect(candidate).not.toHaveProperty('ref');
    }
  });

  it('7. model-side candidates cannot inject a handle: parse normalization keeps {label, confidence} (anti-fabrication at the parse door)', () => {
    const doc = parseScientistIntent(`
intentId: optionbind-parse
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - label: which plate?
    reason: not named
    candidates:
      - { label: 96-well plate, confidence: 0.8, ref: FABRICATED-9 }
`);
    const candidate = doc.unresolved[0]?.candidates?.[0] as Record<string, unknown>;
    expect(candidate).not.toHaveProperty('ref');
    expect(Object.keys(candidate).sort()).toEqual(['confidence', 'label']);
  });
});

// ---------------------------------------------------------------------------
// 2. SPINE-1 frozen candidate shape: the schema gains the OPTIONAL ref field,
//    additive-only — the additionalProperties/unevaluatedProperties posture and
//    the required set stay byte-unchanged.
// ---------------------------------------------------------------------------

const SCHEMA_PATH = join(process.cwd(), '..', 'schema', 'workflow', 'scientist-intent.schema.yaml');

function loadSchemaDocument(): Record<string, unknown> {
  return parseYaml(readFileSync(SCHEMA_PATH, 'utf-8')) as Record<string, unknown>;
}

describe('optionbind.spine-1 candidate shape (additive optional ref)', () => {
  it('8. a candidate WITH a string ref validates; without one still validates', () => {
    const validator = createValidator({ strict: false });
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID);
    for (const candidates of [
      [{ label: 'Gemini reader A', confidence: 1, ref: 'LBW-A' }],
      [{ label: 'Gemini reader A', confidence: 1 }],
    ]) {
      const result = validator.validate({
        intentId: 'optionbind-schema',
        actions: [{ action: 'read', labware: 'Gemini' }],
        unresolved: [{ label: 'Gemini', reason: 'ambiguous-noun', candidates }],
      }, SCIENTIST_INTENT_SCHEMA_ID);
      expect(result.errors ?? []).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('9. the additive posture holds: a non-string ref and an unknown extra key are still rejected', () => {
    const validator = createValidator({ strict: false });
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID);
    for (const candidates of [
      [{ label: 'x', ref: 7 }],
      [{ label: 'x', ref: 'LBW-A', bogus: 'nope' }],
    ]) {
      const result = validator.validate({
        intentId: 'optionbind-schema-bad',
        actions: [{ action: 'read', labware: 'Gemini' }],
        unresolved: [{ label: 'Gemini', reason: 'ambiguous-noun', candidates }],
      }, SCIENTIST_INTENT_SCHEMA_ID);
      expect(result.valid, `must reject ${JSON.stringify(candidates)}`).toBe(false);
    }
  });
});
