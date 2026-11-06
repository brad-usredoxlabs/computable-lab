/**
 * SCIENCE-CHAIN-1 unit 2 — mixture-share formatting.
 *
 * Reads `displayRoundingFactor` from the composition-fraction convention DATA
 * file. The percentage decimal count is derived: `Math.round(Math.log10(factor))`.
 * `formatVolume` is injected — no volume grammar or literal decimals here.
 *
 * Convention is loaded PER call (never module-cached), mirroring the
 * participationConvention discipline. Empty text ⇒ LOUD-off (one console.warn).
 * Malformed ⇒ throw naming the path.
 */
import conventionRaw from '../../../../config/drafting/composition-fraction-convention.yaml?raw'
import { parse as parseYaml } from 'yaml'

export const MIXTURE_SHARE_CONVENTION_PATH = 'config/drafting/composition-fraction-convention.yaml'

export interface MixtureShareConvention {
  displayRoundingFactor: number
}

/**
 * Parse the embedded convention text PER call (never module-cached).
 * Empty text ⇒ one console.warn naming the path and returns undefined.
 * Malformed text ⇒ throws naming the path.
 */
export function loadMixtureShareConvention(rawText: string = conventionRaw): MixtureShareConvention | undefined {
  const displayPath = MIXTURE_SHARE_CONVENTION_PATH
  if (!rawText.trim()) {
    console.warn(`[mixture-share-convention-off] convention data home (${displayPath}) is empty — no derived mixture share will be computed. Convention data home: ${displayPath}`)
    return undefined
  }
  let raw: unknown
  try {
    raw = parseYaml(rawText)
  } catch (error) {
    throw new Error(`mixture-share convention unreadable (${displayPath}): ${error instanceof Error ? error.message : String(error)}`)
  }
  if (raw === undefined || raw === null) {
    console.warn(`[mixture-share-convention-off] convention data home (${displayPath}) is empty — no derived mixture share will be computed. Convention data home: ${displayPath}`)
    return undefined
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`mixture-share convention (${displayPath}): must be an object`)
  }
  const doc = raw as Record<string, unknown>
  const factor = doc.displayRoundingFactor
  if (typeof factor !== 'number' || !isFinite(factor) || factor <= 0) {
    throw new Error(`mixture-share convention (${displayPath}): \`displayRoundingFactor\` must be a positive number`)
  }
  return { displayRoundingFactor: factor }
}

/**
 * Format a denominator-stated share: `` `${formatVolume(n)} / ${formatVolume(d)} (${pct} %)` ``.
 * Returns `undefined` when the share cannot be computed (`n > d` or `d === 0`).
 * `formatVolume` is injected — this module knows nothing about volume grammar.
 */
export function formatMixtureShare(
  numeratorUl: number,
  denominatorUl: number,
  roundingFactor: number,
  formatVolume: (vol: number) => string,
): string | undefined {
  if (denominatorUl === 0 || numeratorUl > denominatorUl) return undefined
  const pct = (numeratorUl / denominatorUl) * 100
  const decimals = Math.round(Math.log10(roundingFactor))
  return `${formatVolume(numeratorUl)} / ${formatVolume(denominatorUl)} (${pct.toFixed(decimals)} %)`
}
