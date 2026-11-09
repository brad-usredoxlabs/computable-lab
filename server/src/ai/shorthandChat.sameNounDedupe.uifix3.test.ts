/**
 * L2-SUITE-A-uifix3 [D4] RED (regate-5 gate defect 4, MODERATE) — one
 * unresolved noun asked TWICE in one response, with the SAME single action,
 * ships ONE card (the more specific reason code wins), never two.
 *
 * Gate evidence (receipts gate-l2t1520-regate5-tier2, run-main n=62):
 *  "1 mM clofibrate in DMSO" was asked twice in the SAME turn —
 *  card …-f4bafa1970 (reason ambiguous-noun) and card …-d0e9c7d900 (reason
 *  unrealized-mixture-blob-material), both material cards, both with the SAME
 *  single action row "New Create local term \"1 mM clofibrate in DMSO\""
 *  and the same pre-seeded search input. Same question, same only-action,
 *  two cards. (The DMEM/FBS re-ask on FOLLOWING turns is the fold/answer
 *  jurisdiction — OUT here; this file pins the same-RESPONSE fold only, and
 *  the report states what the cross-turn repeats need.)
 *
 * Contract pinned (fix at the card-EMIT aggregation, the server ai card
 * builder's single choke):
 *  - two cards in the SAME response carrying the same unresolved noun
 *    (query) and the same only-action (options) → ONE card, keeping the
 *    MORE SPECIFIC reason code;
 *  - cards with DISTINCT actions are NEVER collapsed (a noun that must be
 *    bound two different ways keeps both cards);
 *  - a card with no query is never folded (no key → never guess);
 *  - the specificity order is ONE exported constant with a single home
 *    (this lane's mechanical floor forbids new YAML — D1-persistence did
 *    not land — so the order lives beside the other reason-code
 *    constants in the resolution layer, not hardcoded inline at the emit
 *    site).
 */
import { describe, expect, it, vi } from 'vitest';
import { foldSameNounCards, REASON_SPECIFICITY_ORDER } from '../compiler/resolution/clarificationDedupe.js';
import { clarificationsFromUnresolvedFacts, canonicalLabelsForFacts, dropSatisfiedFacts, factRequestId } from './shorthandChat.js';
import { canonicalLabelKey, localMaterialIdForLabel } from '../materials/termId.js';
import type { AgentClarificationRequest } from './types.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { ScientistIntent, ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

const LABEL = '1 mM clofibrate in DMSO';

function fact(label: string, reason: string, actionIndex = 0, argument = 'material'): ScientistIntentUnresolvedFact {
  return {
    label,
    reason,
    actionLocation: { actionIndex, action: 'add_material', argument },
  };
}

describe('foldSameNounCards — L2-SUITE-A-uifix3 D4: one noun, one response, one card', () => {
  it('the gate pair (ambiguous-noun + unrealized-mixture-blob-material, same only-action) folds to ONE card keeping the SPECIFIC reason', () => {
    const generic = fact(LABEL, 'ambiguous-noun');
    const specific = fact(LABEL, 'unrealized-mixture-blob-material');
    const cards = clarificationsFromUnresolvedFacts([generic, specific]);
    // Sanity: the builder ships the two distinct cards the gate saw (pre-fold).
    expect(cards).toHaveLength(2);

    const folded = foldSameNounCards(cards);
    expect(folded).toHaveLength(1);
    const card = folded[0]!;
    // The SPECIFIC reason survives (the order's top-ranked code present in
    // the pair), the generic one drops.
    expect(card.unresolvedFact?.reason).toBe('unrealized-mixture-blob-material');
    expect(card.prompt).toContain('unrealized-mixture-blob-material');
    expect(card.prompt).not.toContain('(ambiguous-noun)');
    // The surviving card is the specific fact's OWN card: the same
    // content-keyed id the fold channel would join on, the same query.
    expect(card.id).toBe(factRequestId(specific));
    expect(card.id).not.toBe(factRequestId(generic));
    // D3 (ruling l2t1430 §3 read path (i)): the request's LABEL rides the
    // canonical display string — STAGE B identity form (no grounded record
    // here), so `query` folds to `canonicalLabelKey` (re-pinned). The RAW
    // model label survives on `unresolvedFact.label`.
    expect(card.query).toBe(canonicalLabelKey(LABEL));
    expect(card.unresolvedFact!.label).toBe(LABEL);
    // The only-action (the mint row is the card's single option-free
    // affordance) is intact: same menu, same query, no options added.
    expect(card.menuProvider).toBe('/m');
    expect(card.options).toEqual([]);
  });

  it('a noun with DISTINCT actions keeps BOTH cards (never collapse different only-actions)', () => {
    const cards = clarificationsFromUnresolvedFacts([
      fact(LABEL, 'ambiguous-noun', 0, 'material'),
      fact(LABEL, 'ambiguous-noun', 0, 'labware'),
    ]);
    expect(cards).toHaveLength(2);
    // Force the distinct-action shape: a /m material card versus a /l
    // labware card carrying DIFFERENT options — the same noun, different
    // only-actions.
    cards[0] = { ...cards[0]!, kind: 'material', menuProvider: '/m', options: [] };
    cards[1] = {
      ...cards[1]!,
      kind: 'labware',
      menuProvider: '/l',
      options: [{ id: 'LBW-1', label: 'plate A' }],
    };
    const folded = foldSameNounCards(cards);
    expect(folded).toHaveLength(2);
  });

  it('distinct nouns in one response stay distinct (the fold is per-noun, never global), first-appearance order preserved', () => {
    const cards = clarificationsFromUnresolvedFacts([
      fact('DMEM', 'ambiguous-noun'),
      fact('FBS', 'ambiguous-noun'),
      fact(LABEL, 'ambiguous-noun'),
      fact(LABEL, 'unrealized-mixture-blob-material'),
    ]);
    expect(cards).toHaveLength(4);
    const folded = foldSameNounCards(cards);
    // D3 (ruling l2t1430 §3 read path (i)): `query` now rides the canonical
    // display string (STAGE B identity form, no grounded record) — re-pinned
    // to `canonicalLabelKey`; the RAW model labels survive on
    // `unresolvedFact.label` (asserted below for the survivor).
    expect(folded.map((c) => c.query)).toEqual([
      canonicalLabelKey('DMEM'),
      canonicalLabelKey('FBS'),
      canonicalLabelKey(LABEL),
    ]);
    // The clofibrate survivor is the specific one (raw label preserved).
    expect(folded[2]!.unresolvedFact!.label).toBe(LABEL);
    expect(folded[2]!.unresolvedFact?.reason).toBe('unrealized-mixture-blob-material');
  });

  it('a card whose query is ABSENT is never folded (no key → never guess)', () => {
    const withQuery = clarificationsFromUnresolvedFacts([fact(LABEL, 'ambiguous-noun')])[0]!;
    const { query: _dropped, ...rest } = withQuery;
    const noQuery: AgentClarificationRequest = { ...rest, query: undefined };
    const folded = foldSameNounCards([noQuery, withQuery]);
    expect(folded).toHaveLength(2);
  });

  it('two cards for the same noun with the SAME reason still fold (the fold is same-noun+same-action, not same-reason)', () => {
    // The gate's cross-turn DMEM shape re-asked in one response: the same
    // reason on the same noun with the same only-action is STILL one
    // question — one card.
    const cards = clarificationsFromUnresolvedFacts([
      fact('DMEM', 'ambiguous-noun', 0, 'material'),
      fact('DMEM', 'ambiguous-noun', 1, 'material'),
    ]);
    // Distinct actionIndex → distinct ids (the content key carries it), but
    // the same noun + same only-action.
    expect(cards).toHaveLength(2);
    expect(cards[0]!.id).not.toBe(cards[1]!.id);
    const folded = foldSameNounCards(cards);
    expect(folded).toHaveLength(1);
    // D3 (ruling l2t1430 §3 read path (i)): `query` rides the canonical
    // identity form (STAGE B) — re-pinned to `canonicalLabelKey`.
    expect(folded[0]!.query).toBe(canonicalLabelKey('DMEM'));
  });

  it('the specificity order is a DECLARED list (single home, data-shaped): ambiguous-noun ranks above unknown-noun (a more constrained failure)', () => {
    // The order itself is the pin: a declared array, not an inline
    // comparison at the emit site. The shipped order (most specific first):
    // a resolution-engine ambiguity (live candidates, unbound) is more
    // specific than a bare unknown-noun (nothing found); an unrealized
    // producer bar names the exact structural gap.
    const order = REASON_SPECIFICITY_ORDER;
    expect(order.indexOf('ambiguous-noun')).toBeLessThan(order.indexOf('unknown-noun'));
    expect(order.indexOf('unrealized-mixture-blob-material')).toBeGreaterThanOrEqual(0);

    const cards = clarificationsFromUnresolvedFacts([
      fact('Enigma Broth', 'unknown-noun'),
      fact('Enigma Broth', 'ambiguous-noun'),
    ]);
    const folded = foldSameNounCards(cards);
    expect(folded).toHaveLength(1);
    expect(folded[0]!.unresolvedFact?.reason).toBe('ambiguous-noun');
  });
});

// ---------------------------------------------------------------------------
// CARD1-D3 FIX-2 (advc c7 DEFECT 2 + DEFECT 3) — the two previously
// UNPINNED ruling read/drop legs. Hosted here (a GREEN file, already a
// canonicalLabelKey scope-lock mentioner) because the only other
// dropSatisfiedFacts mentions (shorthandChat.cueCascade.test.ts T6/T7) are
// already RED at baseline and cannot witness the change.
// ---------------------------------------------------------------------------
describe('CARD1-D3 FIX-2 — ruling §5 pin 3 DROP half: dropSatisfiedFacts rides the CANONICAL key', () => {
  // Ruling §5 pin 3: a case/extra-space DRIFT of the answered label still
  // satisfies the slot — the re-derived fact is DROPPED, not re-asked.
  it('the exact review-order pin: a drifted-casing re-derived fact is DROPPED (returns [])', () => {
    // The document's slot value is the MODEL'S DRIFTED text (case + double
    // space) — NOT string-equal to the answered label, but canonically equal
    // (that is exactly the D3 premise: the slot is satisfied by the CANONICAL
    // label, not the raw string). A pre-fix `value !== entry.label` compare
    // would see a DIFFERENT string and keep the fact (re-ask) — so this pin
    // is RED on pre-D3 identity.
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 'fx2-drop',
      actions: [{ action: 'add_material', material: '1 mM Clofibrate  in DMSO' }],
      unresolved: [],
    };
    const drifted = fact('1 mM Clofibrate  in DMSO', 'ambiguous-noun');
    expect(
      dropSatisfiedFacts([drifted], [
        { actionIndex: 0, argument: 'material', label: '1 mM clofibrate in DMSO' },
      ], doc),
    ).toEqual([]);
    // Sanity (non-vacuity of the negative arm): a fact whose slot value is a
    // DIFFERENT label survives the drop.
    const other = fact('mystery goop', 'ambiguous-noun');
    const docOther: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 'fx2-drop',
      actions: [{ action: 'add_material', material: 'mystery goop' }],
      unresolved: [],
    };
    expect(
      dropSatisfiedFacts([other], [
        { actionIndex: 0, argument: 'material', label: '1 mM clofibrate in DMSO' },
      ], docOther),
    ).toHaveLength(1);
  });

  // The NON-STRING slot value keeps the existing `return true` arm (a
  // non-string can never equal the answered string label — never dropped).
  it('the non-string arm: a non-string slot value SURVIVES the drop (return true)', () => {
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 'fx2-drop',
      actions: [{
        action: 'add_material',
        // A degenerate document (Ajv rejects this upstream in the real
        // pipeline): the slot value is NON-STRING, which the type cannot
        // express — the value-level cast is deliberate (this pin witnesses
        // the pure function's `return true` arm on such input).
        material: 42 as unknown as string,
      }],
      unresolved: [],
    };
    const fact2 = fact('1 mM Clofibrate  in DMSO', 'ambiguous-noun');
    expect(
      dropSatisfiedFacts([fact2], [
        { actionIndex: 0, argument: 'material', label: '1 mM clofibrate in DMSO' },
      ], doc),
    ).toHaveLength(1);
  });
});

describe('CARD1-D3 FIX-2 — ruling §3 read path (i) STAGE A: the record-title read path', () => {
  // Ruling §5 pin 6 / §3 read path (i): when a local-term record is GROUNDED
  // for the fact's identity, the card's displayed label is the record's TITLE
  // (STAGE A) — never the identity form, never the raw model label — while the
  // `unresolvedFact` mirror keeps the RAW label verbatim (provenance is never
  // collapsed).
  it('STAGE A: the grounded record TITLE rides query + prompt; unresolvedFact.label stays RAW (read-only store seam)', async () => {
    const RAW = '1 mM Clofibrate  in DMSO'; // model's verbatim (drifted) label
    const TITLE = '1 mM Clofibrate in DMSO'; // the grounded record's title
    const recordId = localMaterialIdForLabel(RAW);
    const get = vi.fn(async (id: string): Promise<RecordEnvelope | null> =>
      id === recordId ? { payload: { name: TITLE } } as unknown as RecordEnvelope : null);
    // A read-only fake store (the repeatEcho mockStore shape): `get` resolves
    // the grounded record; `create` is a throwing stub — the STAGE A seam is
    // READ-ONLY (the ruling: "ask-time is read-only"; the mint path owns the
    // write), so any accidental mutation fails the pin loud.
    const store: RecordStore = {
      get,
      create: vi.fn(async () => { throw new Error('STAGE A read path must be READ-ONLY (store.create)'); }),
    } as unknown as RecordStore;
    const map = await canonicalLabelsForFacts([fact(RAW, 'ambiguous-noun')], store);
    expect(map.get(canonicalLabelKey(RAW))).toBe(TITLE);
    expect(get).toHaveBeenCalledTimes(1); // deduped to ONE GET per identity
    expect(get.mock.calls[0]![0]).toBe(recordId);

    const card = clarificationsFromUnresolvedFacts(
      [fact(RAW, 'ambiguous-noun')],
      map,
    )[0]!;
    // STAGE A: the card carries the TITLE form (ruling §3 read path (i)).
    expect(card.query).toBe(TITLE);
    expect(card.prompt).toContain(`"${TITLE}"`);
    // Provenance is never collapsed: the RAW model label survives verbatim.
    expect(card.unresolvedFact!.label).toBe(RAW);
    expect(card.unresolvedFact!.label).not.toBe(TITLE);
    // Read-only (the ruling: "ask-time is read-only" — the mint path owns the
    // write; the fake's write stubs would have thrown on any mutation).
    expect(get).toHaveBeenCalledTimes(1);
  });
});
