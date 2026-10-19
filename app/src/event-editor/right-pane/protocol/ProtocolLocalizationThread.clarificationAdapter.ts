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
 * TWO answer-surface rules, both DATA (W211-GAPCARD-1 updated this header):
 *
 * 1. A fact whose reason is NAMED in the table gets the table's menu. A null
 *    table entry is a DECLARED no-surface (the stable engine code
 *    'missing-required-argument' — it always carries a filled actionLocation,
 *    the sweep fills it, resolveNounsPass.ts:243-258): the thread renders no
 *    card for it and the honest infoMsg line remains the fallback (spec test 4).
 *
 * 2. GAP-SHAPE FALLBACK (W211-GAPCARD-1): a fact whose reason has NO table
 *    entry AND which carries NO slot identity (actionLocation absent — the same
 *    generic read `heldFactToClarificationRequest` already does; precedent:
 *    resolveNounsPass.ts:394-411 keys gated fate on slot identity as data,
 *    "never silently dropped") is a slot-less gap fact: it gets the picker-less
 *    'choice' surface (the EXISTING types/ai.ts:215 union member — the free-text
 *    box QuestionsPanel already uses for a picker-less question). Facts WITH
 *    slot identity but no row stay null. The fallback keys ONLY on table-entry
 *    presence + actionLocation presence + the candidates read — NEVER a
 *    substring/regex against a reason sentence.
 *
 * The fallback lives in the FOLD mapper (`clarificationRequestForFact` /
 * `foldCards`), NOT inside `heldFactToClarificationRequest`: the golden
 * fixture's integrity pin 5d feeds the class-(d) wire through
 * `heldFactToClarificationRequest` and pins expectedCard:false (BLOCKED-ON-FIX
 * record; the fixture bytes are frozen until the named follow-up flips the pin
 * AND the sha together). The thread folds every arm through `foldCards` — the
 * ONE adapter call-site.
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
export const CLARIFICATION_MENU_BY_REASON: Readonly<Record<string, AiClarificationMenuProvider | null>> = {
  'unknown-noun': '/m',
  'ambiguous-noun': '/m',
  'resolution-lookup-failed': '/m',
  // SAMPLE-CARD-1 (ARCHITECT DECISION W28-A5i Q2): the stable model-side
  // reason for a stated-but-uncommitted fact (the emitter types it with
  // actionLocation + exact label). Without this row the fact gets NO card and
  // is unanswerable-by-construction; with it the shipped ANSWER-BIND-1
  // exact-identity join (b52f5dfc) is the answer path — zero new machinery.
  'not-stated': '/m',
  // GAPCARD-1: the two OTHER prompt-declared model reasons
  // (schema/registry/prompt-templates/intent.compile.system.yaml:22 declares
  // `not-stated | ambiguous | contradicts-the-text`). Declared vocabulary, not
  // invented codes — 'ambiguous' is the MODEL-side reason, distinct from the
  // engine's 'ambiguous-noun' (resolutionEngine.ts:217). Without these rows a
  // model fact carrying either is unanswerable-by-construction — the exact
  // SAMPLE-CARD-1 disease the 'not-stated' row cured.
  'ambiguous': '/m',
  'contradicts-the-text': '/m',
  // GAPCARD-1: the stable engine code's "declared no surface" as DATA (the
  // sweep always fills its actionLocation, resolveNounsPass.ts:243-258 — a
  // slot-identity fact, never the slot-less gap shape). The explicit null
  // entry keeps the existing null pins green BY DATA, not by incidental
  // fallthrough, and blocks the gap-shape fallback for this reason.
  'missing-required-argument': null,
}

/**
 * ANSWER-SURFACE-1: (reason, argument) -> menu overrides, as the same DATA
 * table class. `argument` is declared vocabulary data (the arg-contract names
 * carried on the wire fact's actionLocation) — reading it is a generic read of
 * the fact, not a noun/verb/protocol literal. A reason with NO menu row never
 * gets a card, argument or not (the lookup consults the reason table first).
 * GAPCARD-1: the two new prompt-declared model rows carry the same labware
 * override as every other carded reason — exactly the SAMPLE-CARD-1 pattern
 * (a labware-semantic fact answers by PICKING '/l', every other argument falls
 * to the (reason,'*') row).
 */
const CLARIFICATION_MENU_BY_REASON_ARGUMENT: Readonly<Record<string, Readonly<Record<string, AiClarificationMenuProvider>>>> = {
  'unknown-noun': { labware: '/l' },
  'ambiguous-noun': { labware: '/l' },
  'resolution-lookup-failed': { labware: '/l' },
  // SAMPLE-CARD-1 (W28-A5i Q2): a labware-semantic not-stated fact answers by
  // PICKING '/l' (resolveLabware — no mint floor, resolvers.ts:67-92), exactly
  // the ANSWER-SURFACE-1 pattern; every other argument falls to '/m'.
  // W28-SOURCEROW-1 (ARCHITECT DECISION W28-A5n Q2, DATA-AMENDMENT): 'source'
  // IS labware-semantic by the declared data — EVERY declared `source`
  // argument in scientist-intent-vocabulary.yaml (all 23 verbs that declare
  // it) is `kind: resolvable` + `domain: labware`; the vocabulary NEVER
  // declares a material-domain `source` (material semantics are the separately
  // declared `material`/`source_name` args). A source-argument not-stated fact
  // answered on the '/m' material funnel is the same domain misroute
  // SAMPLE-CARD-1 cured for `labware`. One row added; the (reason,'*')
  // fallback row stays '/m' — a SOURCE-LESS not-stated hedge keeps '/m'.
  'not-stated': { labware: '/l', source: '/l' },
  // GAPCARD-1: same pattern for the two prompt-declared model reasons.
  'ambiguous': { labware: '/l' },
  'contradicts-the-text': { labware: '/l' },
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

/**
 * GAPCARD-1 (fold mapper): the thread's ONE fact->request rule.
 *
 * 1. A fact with a table row maps exactly as `heldFactToClarificationRequest`
 *    does today — rows win over the shape fallback (a row'd reason with NO slot
 *    identity keeps its row: the 'not-stated' prose-label case stays '/m').
 * 2. Otherwise the GAP-SHAPE FALLBACK: a fact whose reason is NOT NAMED in the
 *    table AND which carries NO slot identity (actionLocation absent — the same
 *    generic read as above) is a slot-less gap fact: menuProvider 'choice' (the
 *    EXISTING types/ai.ts:215 union member — the picker-less free-text surface;
 *    a 'choice' card has no mint floor and no picker). A table-less fact WITH
 *    slot identity stays null — the fallback is slot-identity-gated; a wider
 *    fallback is the design error, not the pin's.
 *
 * Keys ONLY on table-entry presence + actionLocation presence + the candidates
 * read. Zero substring/regex matching against a reason sentence anywhere
 * (spec bait 4: a HARD defect). NOT inside `heldFactToClarificationRequest`:
 * the golden fixture's integrity pin 5d feeds the class-(d) wire through that
 * function and pins expectedCard:false until the named follow-up flips the pin
 * AND the fixture sha together (OQ3).
 */
export function clarificationRequestForFact(
  fact: Record<string, unknown>,
  index: number,
): AiClarificationRequest | null {
  const menuRequest = heldFactToClarificationRequest(fact, index)
  if (menuRequest) return menuRequest
  const reason = typeof fact.reason === 'string' ? fact.reason : ''
  // An explicit null table entry (declared no-surface) and a fact WITH slot
  // identity both stay null: only an UNNAMED reason + no slot identity reaches
  // the gap-shape fallback.
  if (reason in CLARIFICATION_MENU_BY_REASON) return null
  const hasSlotIdentity = typeof fact.actionLocation === 'object' && fact.actionLocation !== null
  if (hasSlotIdentity) return null
  const label = typeof fact.label === 'string' && fact.label.trim() ? fact.label.trim() : ''
  if (!label) return null
  // Same construction as the menu mapper (:191-198); candidates survive as
  // option buttons beside the free-text box (OQ5 ratified — no new rendering
  // rule, the card code already renders both).
  const rawCandidates = Array.isArray(fact.candidates) ? fact.candidates : []
  const options: AiClarificationOption[] = rawCandidates
    .filter((c): c is { label: string } =>
      typeof c === 'object' && c !== null && typeof (c as { label?: unknown }).label === 'string'
      && !!(c as { label: string }).label.trim())
    .filter((c) => !isMintOfferForLabel(c.label.trim(), label))
    .map((c, i) => ({ id: `held-candidate-${index}-${i}`, label: c.label.trim() }))
  return {
    id: `held-fact-${index}`,
    kind: 'general',
    prompt: label,
    menuProvider: 'choice',
    query: label,
    options,
  }
}

/**
 * W211-GAPCARD-1 (fold discipline, bait 6): the ONE adapter call-site. Every
 * arm that folds clarification facts into the held-card surface maps through
 * THIS helper — a second `.map(heldFactToClarificationRequest)` call-site in
 * the thread is the drift class. Facts with no answer surface map to null and
 * stay infoMsg-only (no picker-less card).
 */
export function foldCards(
  facts: ReadonlyArray<Record<string, unknown>>,
): AiClarificationRequest[] {
  return facts
    .map((fact, index) => clarificationRequestForFact(fact, index))
    .filter((request): request is AiClarificationRequest => request !== null)
}
