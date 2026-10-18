/**
 * THREAD-ASK-1 (Leg 2) — the ONE adapter between the two clarification shapes.
 *
 * The held 422 bar carries `ScientistIntentUnresolvedFact`-shaped facts
 * (server/src/compiler/scientistIntent/types.ts: {label, reason, candidates?,
 * actionLocation?}) while the product's answer surface, ClarificationPicker,
 * consumes `AiClarificationRequest` (app/src/types/ai.ts: {id, kind, prompt,
 * menuProvider, options, ...}). The two shapes are NOT unified and neither is
 * renamed (spec §8 bait 2): this module maps fact -> request and invents
 * nothing — label -> query/prompt, candidates -> options, (reason, argument) ->
 * menu via the DATA tables below (presentation mapping, not scattered branches;
 * `argument` is read generically off the wire fact's actionLocation — the
 * SPINE-1 frozen unresolved shape — never inferred from the label or the
 * candidates).
 *
 * A fact whose reason has NO entry in the table has no answer surface: the
 * thread renders no card for it and the honest infoMsg line remains the
 * fallback (spec test 4).
 */
import type {
  AiClarificationMenuProvider,
  AiClarificationOption,
  AiClarificationRequest,
} from '../../../types/ai'

/**
 * (reason,'*') -> menu provider, as DATA (spec §8 bait 4: presentation mapping
 * belongs in the client adapter as a table, not scattered branches). Only the
 * noun-resolution reasons the spine's resolution engine emits with an answer
 * surface are listed; everything else falls through to no card. This row is
 * the SINGLE fallback: every (reason, argument) combination not named in the
 * argument table below renders exactly what this table says today.
 *
 * CLOSED (ANSWER-SURFACE-1, ARCHITECT DECISION W28-A5h Q2 — this closes the
 * OPEN QUESTION this table used to carry, THREAD-ASK-1 spec / W2-11-D4):
 * labware-semantic facts (fact.actionLocation.argument === 'labware' — the
 * SPINE-1 frozen unresolved shape already carries actionLocation on the wire,
 * workflow/scientist-intent.schema.yaml:220-244) are answered by PICKING the
 * '/l' menu (ClarificationPicker routes '/l' to resolveLabware), NEVER by
 * minting: '/vocab/mint' stays MATERIAL-ONLY (domain posture reaffirmed; the
 * mint floor row is emitted by resolveMaterial alone — resolvers.ts:67-92 —
 * and resolveLabware emits none, so a '/l' card has no mint floor and its
 * empty-state copy says plain 'No matches', FIX1 D1). No labware minting is
 * added and no schema field is added.
 */
export const CLARIFICATION_MENU_BY_REASON: Readonly<Record<string, AiClarificationMenuProvider>> = {
  'unknown-noun': '/m',
  'ambiguous-noun': '/m',
  'resolution-lookup-failed': '/m',
}

/**
 * ANSWER-SURFACE-1: (reason, argument) -> menu overrides, as the same DATA
 * table class. `argument` is declared vocabulary data (the arg-contract names
 * carried on the wire fact's actionLocation) — reading it is a generic read of
 * the fact, not a noun/verb/protocol literal. A reason with NO menu row never
 * gets a card, argument or not (the lookup consults the reason table first).
 */
const CLARIFICATION_MENU_BY_REASON_ARGUMENT: Readonly<Record<string, Readonly<Record<string, AiClarificationMenuProvider>>>> = {
  'unknown-noun': { labware: '/l' },
  'ambiguous-noun': { labware: '/l' },
  'resolution-lookup-failed': { labware: '/l' },
}

/**
 * The ONE menu lookup: (reason, argument) override first, (reason,'*') as the
 * single fallback. No if-ladders, no scattered branches.
 */
function menuForFact(reason: string, argument: string | undefined): AiClarificationMenuProvider | undefined {
  const fallback = CLARIFICATION_MENU_BY_REASON[reason]
  if (!fallback) return undefined
  if (argument === undefined) return fallback
  return CLARIFICATION_MENU_BY_REASON_ARGUMENT[reason]?.[argument] ?? fallback
}

/**
 * MINT-FLOOR-UI-1 (OQ1 strict): the picker's own mint floor row (the '/m'
 * resolver's `mint:<q>` suggestion, resolvers.ts:67-92 — straight quotes) is
 * the card's ONE mint affordance for the fact's own label. A wire candidate
 * that IS the mint offer for THIS fact's label (the server's tier-5
 * affordance, curly quotes, ResolveSpine.ts:271) is a dead-end option button:
 * picking it answers with the literal 'Create local term "x"' label the spine
 * cannot bind. Drop it. The rule keys on the fact's OWN label (already in
 * hand) and the affordance label SHAPE the module already documents — quote-
 * normalized (curly “ ” vs straight " "), never a noun table and never a
 * blanket "drop all mint options": a mint offer for a DIFFERENT term survives.
 */
const MINT_OFFER_PREFIX = 'Create local term'

function normalizeMintQuotes(value: string): string {
  return value.replace(/[\u201c\u201d]/g, '"')
}

function isMintOfferForLabel(optionLabel: string, factLabel: string): boolean {
  const normalized = normalizeMintQuotes(optionLabel)
  const prefix = `${MINT_OFFER_PREFIX} "`
  if (!normalized.startsWith(prefix) || !normalized.endsWith('"')) return false
  const inner = normalized.slice(prefix.length, -1)
  return inner.trim() === factLabel.trim()
}

/**
 * Map one held clarification fact onto a picker request. Returns null when the
 * fact has no identity or no answer surface (no menu for its reason) — the
 * caller then renders no card. `index` is the card's UI identity within this
 * held bundle (the answers map keys on the fact's own LABEL, not this id).
 */
export function heldFactToClarificationRequest(
  fact: Record<string, unknown>,
  index: number,
): AiClarificationRequest | null {
  const label = typeof fact.label === 'string' && fact.label.trim() ? fact.label.trim() : ''
  if (!label) return null
  const reason = typeof fact.reason === 'string' ? fact.reason : ''
  // ANSWER-SURFACE-1: the menu pick is keyed on (reason, argument) — `argument`
  // is read generically off the wire fact's actionLocation (SPINE-1 frozen
  // shape), never inferred from the label or the candidates.
  const actionLocation = typeof fact.actionLocation === 'object' && fact.actionLocation !== null
    ? fact.actionLocation as { argument?: unknown }
    : undefined
  const argument = typeof actionLocation?.argument === 'string' ? actionLocation.argument : undefined
  const menuProvider = menuForFact(reason, argument)
  if (!menuProvider) return null

  const rawCandidates = Array.isArray(fact.candidates) ? fact.candidates : []
  const options: AiClarificationOption[] = rawCandidates
    .filter((c): c is { label: string } =>
      typeof c === 'object' && c !== null && typeof (c as { label?: unknown }).label === 'string'
      && !!(c as { label: string }).label.trim())
    // MINT-FLOOR-UI-1: the mint offer for THIS fact's own label is the
    // picker's floor row already — drop the duplicate dead-end option button.
    // Mint offers for a DIFFERENT term survive (keyed rule, not a blanket).
    .filter((c) => !isMintOfferForLabel(c.label.trim(), label))
    .map((c, i) => ({ id: `held-candidate-${index}-${i}`, label: c.label.trim() }))

  return {
    id: `held-fact-${index}`,
    kind: 'general',
    prompt: label,
    menuProvider,
    query: label,
    options,
  }
}
