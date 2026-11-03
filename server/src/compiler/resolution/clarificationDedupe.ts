/**
 * foldSameNounCards — L2-SUITE-A-uifix3 [D4] (regate-5 gate defect 4): the
 * same-RESPONSE same-noun card fold, at the card-EMIT aggregation.
 *
 * Gate evidence (run-main n=62): "1 mM clofibrate in DMSO" shipped as TWO
 * cards in one response — one per reason code (ambiguous-noun from the
 * resolution engine, unrealized-mixture-blob-material from the producer
 * bar) — with the SAME single action on both (the one mint row, the same
 * pre-seeded search). Same question, same only-action, two cards.
 *
 * Rule (the spec's scope, one response only — cross-turn repeats are the
 * fold/answer jurisdiction, not this fold): when two cards in the SAME
 * response carry the same unresolved noun (query) and the same
 * only-action (kind + menuProvider + options), emit ONE card keeping the
 * more specific reason code. Cards with DISTINCT actions are NEVER
 * collapsed; a card without a query has no key and is never folded
 * (never guess).
 *
 * The specificity order is ONE declared list (REASON_SPECIFICITY_ORDER)
 * with a single home — the resolution layer already owns the reason-code
 * constants (normalizeScientistIntent's UNREALIZED_* family, the engine's
 * ambiguous-noun/unknown-noun emission), so the order sits beside them;
 * the emit site never ranks reasons itself. (A data home for the order —
 * a new YAML section — is the natural shape but is OUT of this lane's
 * floor: no YAML unless D1-persistence lands.)
 */
import type { AgentClarificationRequest } from '../../ai/types.js';
// advc-c1 D3 (fix1): the unknown-noun code is named from the engine's OWN
// stable constant (its single shared source) — never a re-declared literal.
// (The dedupe module is a pure leaf; the engine imports no dedupe symbol, so
// this edge is acyclic.)
import { UNKNOWN_NOUN_REASON } from './resolutionEngine.js';

/** Most specific first. A producer bar names the exact structural gap
 *  (the blob must be materialized, the well label has no consumer, the
 *  fractions sum wrong, the role is the guidance fallback) — it is more
 *  specific than the engine's resolution failures, where a live-candidate
 *  ambiguity (ambiguous-noun) is more specific than a bare miss
 *  (unknown-noun) and a lookup failure / address miss is the least
 *  specific of the set. An UNRANKED reason is less specific than any
 *  ranked one (ranked-first, stable) — new reason codes therefore keep
 *  their card without a change to this list (fail-safe: no fold wins on
 *  an unknown code). */
export const REASON_SPECIFICITY_ORDER: readonly string[] = [
  'unrealized-mixture-blob-material',
  'unrealized-well-label',
  'unrealized-declared-argument',
  'composition-fraction-sum',
  'composition-role-gap',
  'ambiguous-noun',
  UNKNOWN_NOUN_REASON,
  'resolution-lookup-failed',
  'unknown-address',
];

function specificityRank(reason: string | undefined): number {
  const index = reason === undefined ? -1 : REASON_SPECIFICITY_ORDER.indexOf(reason);
  return index === -1 ? REASON_SPECIFICITY_ORDER.length : index;
}

/** The card's only-action signature: what the scientist can DO with the
 *  card (domain, menu, the offered options). Two cards with the same noun
 *  and the same signature ask the same question with the same answer —
 *  the reason code is the DIFFERENCE, and the more specific one names the
 *  question better. */
function actionSignature(card: AgentClarificationRequest): string {
  return JSON.stringify([card.kind, card.menuProvider, card.options ?? []]);
}

/** One noun + one only-action → one card (the best-specificity survivor),
 *  at the FIRST card's position. Everything else passes through verbatim.
 *  Pure — no mutation of the input cards (the emit paths re-use the same
 *  arrays for the legacy clarification channel). */
export function foldSameNounCards(cards: readonly AgentClarificationRequest[]): AgentClarificationRequest[] {
  if (cards.length < 2) return [...cards];
  // query → actionSignature → the group (survivor + leader index).
  const groups = new Map<string, Map<string, { survivor: AgentClarificationRequest; leader: number }>>();
  const memberOfGroup = new Map<number, true>();
  const survivorAt = new Map<number, AgentClarificationRequest>();
  cards.forEach((card, index) => {
    const query = typeof card.query === 'string' && card.query.trim().length > 0 ? card.query : null;
    if (query === null) {
      // No noun key — never fold (never guess).
      return;
    }
    // L2-CLARIFY-TARGET-1 (RE-PIN NOTE S4): a card carrying an assumed-value
    // control is a DISTINCT slot the scientist must approve (the answer fold
    // keys off its fact's actionLocation). Two quantity slots with the same
    // noun label (e.g. two add_material actions both missing volumeUl) share
    // a (query, actionSignature) and would otherwise collapse to one card —
    // losing a slot. The ONE narrow guard: never fold a clarifyControl-bearing
    // card (it passes through untouched, at its own position). The RED
    // (shorthandChat.sameNounDedupe.target1.test.ts) proved the collapse.
    if ('clarifyControl' in card && card.clarifyControl !== undefined) {
      return;
    }
    const signature = actionSignature(card);
    let bySignature = groups.get(query);
    if (!bySignature) {
      bySignature = new Map();
      groups.set(query, bySignature);
    }
    const group = bySignature.get(signature);
    if (!group) {
      bySignature.set(signature, { survivor: card, leader: index });
      survivorAt.set(index, card);
      return;
    }
    memberOfGroup.set(index, true);
    // Same noun, same only-action: the more specific reason wins (the
    // survivor's id/prompt carry it — the content key includes the reason,
    // so the survivor is the specific fact's OWN card). The survivor is
    // emitted at the group's LEADER position — a specific card that loses
    // its slot to nothing is still one card, not two.
    if (specificityRank(group.survivor.unresolvedFact?.reason) > specificityRank(card.unresolvedFact?.reason)) {
      group.survivor = card;
      survivorAt.set(group.leader, card);
    }
  });
  const out: AgentClarificationRequest[] = [];
  cards.forEach((card, index) => {
    if (memberOfGroup.has(index)) {
      // A folded-away duplicate: its group's survivor sits at the leader's
      // position (a leader is never in memberOfGroup — only the FOLLOWING
      // members are).
      return;
    }
    out.push(survivorAt.get(index) ?? card);
  });
  return out;
}
