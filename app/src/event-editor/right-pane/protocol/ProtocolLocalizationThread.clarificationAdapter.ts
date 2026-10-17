/**
 * THREAD-ASK-1 (Leg 2) — the ONE adapter between the two clarification shapes.
 *
 * The held 422 bar carries `ScientistIntentUnresolvedFact`-shaped facts
 * (server/src/compiler/scientistIntent/types.ts: {label, reason, candidates?,
 * actionLocation?}) while the product's answer surface, ClarificationPicker,
 * consumes `AiClarificationRequest` (app/src/types/ai.ts: {id, kind, prompt,
 * menuProvider, options, ...}). The two shapes are NOT unified and neither is
 * renamed (spec §8 bait 2): this module maps fact -> request and invents
 * nothing — label -> query/prompt, candidates -> options, reason -> menu via
 * the DATA table below (presentation mapping, not scattered branches).
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
 * reason -> menu provider, as DATA (spec §8 bait 4: presentation mapping
 * belongs in the client adapter as a table, not scattered branches). Only the
 * noun-resolution reasons the spine's resolution engine emits with an answer
 * surface are listed; everything else falls through to no card.
 *
 * OPEN QUESTION (Brad, THREAD-ASK-1 spec): /vocab/mint is MATERIAL-ONLY today
 * (VocabHandlers MINTABLE declares 'material' only; ClarificationPicker canMint
 * excludes non-material layers). Unknown-noun facts here are often
 * labware-semantic; they map to the '/m' menu because it is the ONLY menu
 * carrying a mint floor TODAY (decision fact 8: a minted MAT- binds tier-1
 * regardless of the noun's labware semantics). Whether /vocab/mint gains a
 * labware draft floor is a domain-policy call — NOT decided here, and no
 * labware minting is added.
 */
export const CLARIFICATION_MENU_BY_REASON: Readonly<Record<string, AiClarificationMenuProvider>> = {
  'unknown-noun': '/m',
  'ambiguous-noun': '/m',
  'resolution-lookup-failed': '/m',
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
  const menuProvider = CLARIFICATION_MENU_BY_REASON[reason]
  if (!menuProvider) return null

  const rawCandidates = Array.isArray(fact.candidates) ? fact.candidates : []
  const options: AiClarificationOption[] = rawCandidates
    .filter((c): c is { label: string } =>
      typeof c === 'object' && c !== null && typeof (c as { label?: unknown }).label === 'string'
      && !!(c as { label: string }).label.trim())
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
