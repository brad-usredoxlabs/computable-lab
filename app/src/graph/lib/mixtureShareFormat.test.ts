// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  loadConcentrationDisplayConvention,
  formatLadderedConcentration,
} from './mixtureShareFormat'

describe('loadConcentrationDisplayConvention', () => {
  it('parses the real convention', () => {
    const conv = loadConcentrationDisplayConvention()
    expect(conv).toBeDefined()
    expect(conv!.minDisplayMagnitude).toBe(1)
    expect(conv!.significantDigits).toBe(4)
    expect(conv!.unitLadders.molar).toBeDefined()
    expect(conv!.unitLadders.mass_per_volume).toBeDefined()
    expect(conv!.unitLadders.molar[0].unit).toBe('M')
    expect(conv!.unitLadders.molar[0].perBase).toBe(1)
    expect(conv!.unitLadders.molar[1].unit).toBe('mM')
    expect(conv!.unitLadders.mass_per_volume[0].unit).toBe('g/L')
  })

  it('returns undefined with a console.warn when the section is absent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const yamlWithoutSection = `
displayRoundingFactor: 100
basis: percent-of-final-volume
`
    const result = loadConcentrationDisplayConvention(yamlWithoutSection)
    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/section 'concentrationDisplay' absent/)
    warnSpy.mockRestore()
  })

  it('returns undefined for empty text', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadConcentrationDisplayConvention('')
    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/is empty/)
    warnSpy.mockRestore()
  })

  it('throws when significantDigits is non-integer', () => {
    const yaml = `
concentrationDisplay:
  minDisplayMagnitude: 1
  significantDigits: 4.5
  unitLadders:
    molar:
      - {unit: M, perBase: 1}
`
    expect(() => loadConcentrationDisplayConvention(yaml)).toThrow('significantDigits')
  })

  it('throws when perBase is <= 0', () => {
    const yaml = `
concentrationDisplay:
  minDisplayMagnitude: 1
  significantDigits: 4
  unitLadders:
    molar:
      - {unit: M, perBase: -1}
`
    expect(() => loadConcentrationDisplayConvention(yaml)).toThrow('perBase')
  })
})

describe('formatLadderedConcentration', () => {
  const conv = loadConcentrationDisplayConvention()!

  it('returns "unknown" when unknownFlag is true', () => {
    expect(formatLadderedConcentration(
      { value: 1, unit: 'mM' },
      conv,
      true,
    )).toBe('unknown')
  })

  it('delegates to formatComputedConcentration when no convention', () => {
    expect(formatLadderedConcentration(
      { value: 1, unit: 'mM' },
      undefined,
    )).toBe('1 mM')
  })

  it('delegates when value is 0', () => {
    // formatComputedConcentration({value:0}) returns '0 mM', not null
    expect(formatLadderedConcentration(
      { value: 0, unit: 'mM' },
      conv,
    )).toBe('0 mM')
  })

  it('delegates when declared unit is not in any ladder', () => {
    // 'cells/mL' is not in our ladders
    expect(formatLadderedConcentration(
      { value: 500, unit: 'cells/mL' },
      conv,
    )).toBe('500 cells/mL')
  })

  it('converts 0.003268 mM => 3.268 uM (the core RECON finding D-1 pin)', () => {
    const result = formatLadderedConcentration(
      { value: 0.003268, unit: 'mM', basis: 'molar' },
      conv,
    )
    expect(result).toBe('3.268 uM')
  })

  it('clamps to smallest rung when no rung meets minDisplayMagnitude', () => {
    // 0.0000005 mM = 0.0005 uM = 0.5 nM = 500 pM — should pick pM
    const result = formatLadderedConcentration(
      { value: 0.0000005, unit: 'mM', basis: 'molar' },
      conv,
    )
    expect(result).toBe('500 pM')
  })

  it('picks M when value is >= 1 in M', () => {
    // 1 mM = 0.001 M (< 1 minDisplayMagnitude), so stays mM => 1 mM
    expect(formatLadderedConcentration(
      { value: 1, unit: 'mM', basis: 'molar' },
      conv,
    )).toBe('1 mM')
    // 1000 mM = 1 M (>= 1 minDisplayMagnitude)
    expect(formatLadderedConcentration(
      { value: 1000, unit: 'mM', basis: 'molar' },
      conv,
    )).toBe('1 M')
  })

  it('never emits exponential notation', () => {
    const result = formatLadderedConcentration(
      { value: 0.003268, unit: 'mM', basis: 'molar' },
      conv,
    )
    expect(result).not.toMatch(/e[+-]/i)
  })

  it('strips trailing zeros', () => {
    // 1000 mM = 1 M (no trailing zeros)
    expect(formatLadderedConcentration(
      { value: 1000, unit: 'mM', basis: 'molar' },
      conv,
    )).toBe('1 M')
  })

  it('delegates for null concentration', () => {
    expect(formatLadderedConcentration(null, conv)).toBeNull()
  })

  it('delegates for undefined concentration', () => {
    expect(formatLadderedConcentration(undefined, conv)).toBeNull()
  })

  it('converts mass_per_volume: 0.003268 g/L => 3.268 ug/mL', () => {
    // 0.003268 g/L = 0.003268 mg/mL (< 1 minDisplayMagnitude), so picks ug/mL
    const result = formatLadderedConcentration(
      { value: 0.003268, unit: 'g/L', basis: 'mass_per_volume' },
      conv,
    )
    expect(result).toBe('3.268 ug/mL')
  })
})
