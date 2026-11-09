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
import type { ConcentrationValue } from '../../types/material'
import { formatComputedConcentration } from '../../shared/lib/formHelpers'

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

// ---- Concentration display ladder (L2-PROMPT2-TOOLTIP-FINAL-CONC-1) ----

export interface ConcentrationLadderRung {
  unit: string
  perBase: number
}

export interface ConcentrationDisplayConvention {
  minDisplayMagnitude: number
  significantDigits: number
  unitLadders: Record<string, ConcentrationLadderRung[]>
}

/**
 * Parse the concentrationDisplay section from the convention text PER call.
 * Absent/empty section ⇒ undefined + one console.warn naming the path.
 * Present but malformed ⇒ throws naming the path and the offending key.
 */
export function loadConcentrationDisplayConvention(
  rawText: string = conventionRaw,
): ConcentrationDisplayConvention | undefined {
  const displayPath = MIXTURE_SHARE_CONVENTION_PATH
  if (!rawText.trim()) {
    console.warn(`[concentration-display-off] convention data home (${displayPath}) is empty — concentration display ladder unavailable.`)
    return undefined
  }
  let raw: unknown
  try {
    raw = parseYaml(rawText)
  } catch (error) {
    throw new Error(`concentration-display convention unreadable (${displayPath}): ${error instanceof Error ? error.message : String(error)}`)
  }
  if (raw === undefined || raw === null) {
    console.warn(`[concentration-display-off] convention data home (${displayPath}) is empty — concentration display ladder unavailable.`)
    return undefined
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`concentration-display convention (${displayPath}): must be an object`)
  }
  const doc = raw as Record<string, unknown>
  const section = doc.concentrationDisplay
  if (section === undefined || section === null) {
    console.warn(`[concentration-display-off] section 'concentrationDisplay' absent in ${displayPath} — concentration display ladder unavailable.`)
    return undefined
  }
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`concentration-display convention (${displayPath}): \`concentrationDisplay\` must be an object`)
  }
  const s = section as Record<string, unknown>

  const minDisplayMagnitude = s.minDisplayMagnitude
  if (typeof minDisplayMagnitude !== 'number' || !isFinite(minDisplayMagnitude) || minDisplayMagnitude <= 0) {
    throw new Error(`concentration-display convention (${displayPath}): \`minDisplayMagnitude\` must be a positive number`)
  }

  const significantDigits = s.significantDigits
  if (typeof significantDigits !== 'number' || !Number.isInteger(significantDigits) || significantDigits <= 0) {
    throw new Error(`concentration-display convention (${displayPath}): \`significantDigits\` must be a positive integer`)
  }

  const unitLadders = s.unitLadders
  if (typeof unitLadders !== 'object' || unitLadders === null || Array.isArray(unitLadders)) {
    throw new Error(`concentration-display convention (${displayPath}): \`unitLadders\` must be an object`)
  }
  const ladderObj = unitLadders as Record<string, unknown>
  const parsedLadders: Record<string, ConcentrationLadderRung[]> = {}
  for (const [family, ladderRaw] of Object.entries(ladderObj)) {
    if (!Array.isArray(ladderRaw)) {
      throw new Error(`concentration-display convention (${displayPath}): \`unitLadders.${family}\` must be an array`)
    }
    if (ladderRaw.length === 0) {
      throw new Error(`concentration-display convention (${displayPath}): \`unitLadders.${family}\` must not be empty`)
    }
    const parsedRungs: ConcentrationLadderRung[] = []
    for (const [idx, rungRaw] of ladderRaw.entries()) {
      if (typeof rungRaw !== 'object' || rungRaw === null || Array.isArray(rungRaw)) {
        throw new Error(`concentration-display convention (${displayPath}): \`unitLadders.${family}[${idx}]\` must be an object`)
      }
      const rung = rungRaw as Record<string, unknown>
      const unit = rung.unit
      if (typeof unit !== 'string' || !unit.trim()) {
        throw new Error(`concentration-display convention (${displayPath}): \`unitLadders.${family}[${idx}].unit\` must be a non-empty string`)
      }
      const perBase = rung.perBase
      if (typeof perBase !== 'number' || !isFinite(perBase) || perBase <= 0) {
        throw new Error(`concentration-display convention (${displayPath}): \`unitLadders.${family}[${idx}].perBase\` must be a positive number`)
      }
      parsedRungs.push({ unit: unit.trim(), perBase })
    }
    parsedLadders[family] = parsedRungs
  }

  return { minDisplayMagnitude, significantDigits, unitLadders: parsedLadders }
}

/**
 * Format a concentration through the ordered unit ladder.
 *
 * - unknown === true ⇒ 'unknown'
 * - no convention ⇒ delegates to formatComputedConcentration (byte-identical to today)
 * - value <= 0 or not finite ⇒ delegates
 * - declared unit not in any ladder ⇒ delegates
 * - otherwise: climb the ladder for the most-significant rung whose
 *   converted magnitude ≥ minDisplayMagnitude; if none qualifies, use the
 *   smallest rung. Format with significantDigits, strip trailing zeros,
 *   never emit exponential notation.
 */
export function formatLadderedConcentration(
  concentration: ConcentrationValue | null | undefined,
  convention: ConcentrationDisplayConvention | undefined,
  unknownFlag = false,
): string | null {
  if (unknownFlag) return 'unknown'
  if (!concentration) return formatComputedConcentration(concentration, unknownFlag)
  if (typeof concentration.value !== 'number' || !Number.isFinite(concentration.value)) {
    return formatComputedConcentration(concentration, unknownFlag)
  }
  if (concentration.value <= 0) {
    return formatComputedConcentration(concentration, unknownFlag)
  }
  if (!convention) {
    return formatComputedConcentration(concentration, unknownFlag)
  }

  const declaredUnit = concentration.unit
  const declaredValue = concentration.value

  // Find which ladder family contains the declared unit
  let targetLadder: ConcentrationLadderRung[] | undefined
  let declaredRung: ConcentrationLadderRung | undefined
  for (const [_family, rungs] of Object.entries(convention.unitLadders)) {
    const rung = rungs.find((r) => r.unit === declaredUnit)
    if (rung) {
      targetLadder = rungs
      declaredRung = rung
      break
    }
  }

  // Declared unit not in any ladder ⇒ delegate to today's string
  if (!targetLadder || !declaredRung) {
    return formatComputedConcentration(concentration, unknownFlag)
  }

  // Climb the ladder: find first rung where converted magnitude >= minDisplayMagnitude
  const minMag = convention.minDisplayMagnitude
  let selectedRung = targetLadder[targetLadder.length - 1] // default to smallest
  for (const rung of targetLadder) {
    const convertedMagnitude = Math.abs(declaredValue) * (rung.perBase / declaredRung.perBase)
    if (convertedMagnitude >= minMag) {
      selectedRung = rung
      break
    }
  }

  // Compute the displayed value in the selected unit
  const displayedValue = declaredValue * (selectedRung.perBase / declaredRung.perBase)

  // Format with significant digits
  const digits = convention.significantDigits
  const formatted = displayedValue.toPrecision(digits)

  // Strip trailing zeros and trailing dot
  let result = formatted
  if (result.includes('.')) {
    result = result.replace(/\.?0+$/, '')
  }

  // Safety: never emit exponential notation
  if (/e[+-]/i.test(result)) {
    return formatComputedConcentration(concentration, unknownFlag)
  }

  return `${result} ${selectedRung.unit}`
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
