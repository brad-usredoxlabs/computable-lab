import type { IngredientMeasureMode, IngredientSourceState, QuantityValue } from '../../shared/api/client'
import type { Ref } from '../../types/ref'
import type { CompositionEntryValue, ConcentrationValue } from '../../types/material'

export type FormulationIngredientComputation = {
  ref: Ref | null
  roleType: string
  measureMode?: IngredientMeasureMode
  sourceState?: IngredientSourceState
  stockConcentration?: ConcentrationValue
  targetContribution?: ConcentrationValue
  requiredAmount?: QuantityValue
  molecularWeight?: { value: number; unit: 'g/mol' }
  compositionSnapshot?: CompositionEntryValue[]
}

export type FormulationComputationResult = {
  ingredients: Array<FormulationIngredientComputation & { resolvedAmount?: QuantityValue }>
  outputComposition: CompositionEntryValue[]
  warnings: string[]
}

const VOLUME_FACTORS_TO_L = {
  uL: 1e-6,
  mL: 1e-3,
  L: 1,
} as const

function volumeToLiters(value?: QuantityValue | null): number | undefined {
  if (!value) return undefined
  const factor = VOLUME_FACTORS_TO_L[value.unit as keyof typeof VOLUME_FACTORS_TO_L]
  return factor ? value.value * factor : undefined
}

function litersToDisplayVolume(valueL: number): QuantityValue {
  if (valueL < 1e-3) return { value: Number((valueL * 1e6).toFixed(4)), unit: 'uL' }
  if (valueL < 1) return { value: Number((valueL * 1e3).toFixed(4)), unit: 'mL' }
  return { value: Number(valueL.toFixed(6)), unit: 'L' }
}

function gramsToDisplayMass(valueG: number): QuantityValue {
  if (valueG < 1e-6) return { value: Number((valueG * 1e9).toFixed(4)), unit: 'ng' }
  if (valueG < 1e-3) return { value: Number((valueG * 1e6).toFixed(4)), unit: 'ug' }
  if (valueG < 1) return { value: Number((valueG * 1e3).toFixed(4)), unit: 'mg' }
  return { value: Number(valueG.toFixed(6)), unit: 'g' }
}

function concentrationToBase(concentration: ConcentrationValue): number | undefined {
  switch (concentration.basis) {
    case 'molar':
      switch (concentration.unit) {
        case 'M': return concentration.value
        case 'mM': return concentration.value * 1e-3
        case 'uM': return concentration.value * 1e-6
        case 'nM': return concentration.value * 1e-9
        case 'pM': return concentration.value * 1e-12
        case 'fM': return concentration.value * 1e-15
        default: return undefined
      }
    case 'mass_per_volume':
      switch (concentration.unit) {
        case 'g/L': return concentration.value
        case 'mg/mL': return concentration.value
        case 'ug/mL': return concentration.value * 1e-3
        case 'ng/mL': return concentration.value * 1e-6
        default: return undefined
      }
    case 'activity_per_volume':
      switch (concentration.unit) {
        case 'U/mL': return concentration.value * 1e3
        case 'U/uL': return concentration.value * 1e6
        default: return undefined
      }
    case 'count_per_volume':
      switch (concentration.unit) {
        case 'cells/mL': return concentration.value * 1e3
        case 'cells/uL': return concentration.value * 1e6
        default: return undefined
      }
    case 'volume_fraction':
    case 'mass_fraction':
      return concentration.value / 100
    default:
      return undefined
  }
}

function concentrationFromBase(value: number, template: ConcentrationValue): ConcentrationValue | undefined {
  switch (template.basis) {
    case 'molar':
      switch (template.unit) {
        case 'M': return { ...template, value: Number(value.toFixed(9)) }
        case 'mM': return { ...template, value: Number((value * 1e3).toFixed(6)) }
        case 'uM': return { ...template, value: Number((value * 1e6).toFixed(6)) }
        case 'nM': return { ...template, value: Number((value * 1e9).toFixed(6)) }
        case 'pM': return { ...template, value: Number((value * 1e12).toFixed(6)) }
        case 'fM': return { ...template, value: Number((value * 1e15).toFixed(6)) }
        default: return undefined
      }
    case 'mass_per_volume':
      switch (template.unit) {
        case 'g/L': return { ...template, value: Number(value.toFixed(6)) }
        case 'mg/mL': return { ...template, value: Number(value.toFixed(6)) }
        case 'ug/mL': return { ...template, value: Number((value * 1e3).toFixed(6)) }
        case 'ng/mL': return { ...template, value: Number((value * 1e6).toFixed(6)) }
        default: return undefined
      }
    case 'activity_per_volume':
      switch (template.unit) {
        case 'U/mL': return { ...template, value: Number((value / 1e3).toFixed(6)) }
        case 'U/uL': return { ...template, value: Number((value / 1e6).toFixed(6)) }
        default: return undefined
      }
    case 'count_per_volume':
      switch (template.unit) {
        case 'cells/mL': return { ...template, value: Number((value / 1e3).toFixed(6)) }
        case 'cells/uL': return { ...template, value: Number((value / 1e6).toFixed(6)) }
        default: return undefined
      }
    case 'volume_fraction':
    case 'mass_fraction':
      return { ...template, value: Number((value * 100).toFixed(6)) }
    default:
      return undefined
  }
}

function scaleConcentration(concentration: ConcentrationValue, ratio: number): ConcentrationValue | undefined {
  const base = concentrationToBase(concentration)
  if (base === undefined) return undefined
  return concentrationFromBase(base * ratio, concentration)
}

function mergeCompositionEntries(entries: CompositionEntryValue[]): CompositionEntryValue[] {
  const merged = new Map<string, CompositionEntryValue>()
  for (const entry of entries) {
    const concentrationKey = entry.concentration ? `${entry.concentration.basis}:${entry.concentration.unit}` : 'none'
    const key = `${entry.componentRef.kind}:${entry.componentRef.id}:${entry.role}:${concentrationKey}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, entry)
      continue
    }
    if (!existing.concentration || !entry.concentration) continue
    const existingBase = concentrationToBase(existing.concentration)
    const nextBase = concentrationToBase(entry.concentration)
    if (existingBase === undefined || nextBase === undefined) continue
    const summed = concentrationFromBase(existingBase + nextBase, existing.concentration)
    if (summed) merged.set(key, { ...existing, concentration: summed })
  }
  return [...merged.values()]
}

export function inferIngredientSourceState(ref: Ref | null, domain?: string): IngredientSourceState {
  if (!ref) return 'other'
  if (ref.kind === 'record' && ref.type === 'material-spec') return 'formulation'
  if (ref.kind === 'record' && ref.type === 'vendor-product') return 'stock_solution'
  if (domain === 'chemical') return 'solid'
  return 'liquid'
}

function defaultComposition(ingredient: FormulationIngredientComputation): CompositionEntryValue[] {
  if (ingredient.compositionSnapshot?.length) return ingredient.compositionSnapshot
  if (!ingredient.ref) return []
  return [{
    componentRef: ingredient.ref,
    role: ingredient.roleType === 'cells'
      ? 'cells'
      : ingredient.roleType === 'solvent' || ingredient.roleType === 'diluent'
        ? 'solvent'
        : ingredient.roleType === 'buffer_component' || ingredient.roleType === 'matrix'
          ? 'buffer_component'
          : ingredient.roleType === 'activity_source'
            ? 'activity_source'
            : ingredient.roleType === 'additive'
              ? 'additive'
              : ingredient.roleType === 'solute'
                ? 'solute'
                : 'other',
    ...(ingredient.targetContribution ? { concentration: ingredient.targetContribution } : {}),
  }]
}

function computeRequiredAmount(
  ingredient: FormulationIngredientComputation,
  totalOutputQuantity?: QuantityValue,
): QuantityValue | undefined {
  if (ingredient.requiredAmount) return ingredient.requiredAmount
  const totalVolumeL = volumeToLiters(totalOutputQuantity)
  if (ingredient.measureMode !== 'target_concentration' || !ingredient.targetContribution) return undefined

  if (ingredient.sourceState === 'solid') {
    if (ingredient.targetContribution.basis === 'molar' && ingredient.molecularWeight?.unit === 'g/mol' && totalVolumeL !== undefined) {
      const concentrationM = concentrationToBase(ingredient.targetContribution)
      if (concentrationM !== undefined) return gramsToDisplayMass(concentrationM * totalVolumeL * ingredient.molecularWeight.value)
    }
    if (ingredient.targetContribution.basis === 'mass_per_volume' && totalVolumeL !== undefined) {
      const concentrationGL = concentrationToBase(ingredient.targetContribution)
      if (concentrationGL !== undefined) return gramsToDisplayMass(concentrationGL * totalVolumeL)
    }
  }

  if (ingredient.targetContribution.basis === 'count_per_volume' && totalVolumeL !== undefined) {
    const cellsPerL = concentrationToBase(ingredient.targetContribution)
    if (cellsPerL !== undefined) return { value: Number((cellsPerL * totalVolumeL).toFixed(2)), unit: 'cells' }
  }

  if (ingredient.targetContribution.basis === 'volume_fraction' && totalVolumeL !== undefined) {
    const fraction = concentrationToBase(ingredient.targetContribution)
    if (fraction !== undefined) return litersToDisplayVolume(totalVolumeL * fraction)
  }

  if (ingredient.stockConcentration && totalVolumeL !== undefined) {
    const stockBase = concentrationToBase(ingredient.stockConcentration)
    const targetBase = concentrationToBase(ingredient.targetContribution)
    if (
      stockBase !== undefined
      && targetBase !== undefined
      && ingredient.stockConcentration.basis === ingredient.targetContribution.basis
      && stockBase > 0
    ) {
      return litersToDisplayVolume((targetBase / stockBase) * totalVolumeL)
    }
  }

  return undefined
}

function flattenIngredient(
  ingredient: FormulationIngredientComputation & { resolvedAmount?: QuantityValue },
  totalOutputQuantity?: QuantityValue,
): CompositionEntryValue[] {
  const totalVolumeL = volumeToLiters(totalOutputQuantity)
  const ingredientVolumeL = volumeToLiters(ingredient.resolvedAmount)
  const entries = defaultComposition(ingredient)

  if (ingredient.measureMode === 'target_concentration' && ingredient.sourceState === 'solid' && ingredient.targetContribution && ingredient.ref) {
    return [{
      componentRef: ingredient.ref,
      role: entries[0]?.role ?? 'solute',
      concentration: ingredient.targetContribution,
    }]
  }

  return entries.map((entry) => {
    if (entry.concentration && ingredientVolumeL !== undefined && totalVolumeL !== undefined && totalVolumeL > 0) {
      return {
        ...entry,
        concentration: scaleConcentration(entry.concentration, ingredientVolumeL / totalVolumeL),
      }
    }
    if (!entry.concentration && entry.role === 'solvent' && ingredientVolumeL !== undefined && totalVolumeL !== undefined && totalVolumeL > 0) {
      return {
        ...entry,
        concentration: {
          value: Number(((ingredientVolumeL / totalVolumeL) * 100).toFixed(6)),
          unit: '% v/v',
          basis: 'volume_fraction',
        },
      }
    }
    return entry
  })
}

export function computeFormulationComposition(args: {
  ingredients: FormulationIngredientComputation[]
  totalOutputQuantity?: QuantityValue
}): FormulationComputationResult {
  const warnings: string[] = []
  const ingredients = args.ingredients.map((ingredient) => ({
    ...ingredient,
    ...(computeRequiredAmount(ingredient, args.totalOutputQuantity)
      ? { resolvedAmount: computeRequiredAmount(ingredient, args.totalOutputQuantity) }
      : {}),
  }))

  const totalVolumeL = volumeToLiters(args.totalOutputQuantity)
  ingredients.forEach((ingredient, index) => {
    if (ingredient.measureMode === 'qs_to_final' && !ingredient.resolvedAmount && totalVolumeL !== undefined) {
      const usedVolumeL = ingredients.reduce((acc, other, otherIndex) => {
        if (otherIndex === index) return acc
        return acc + (volumeToLiters(other.resolvedAmount) ?? 0)
      }, 0)
      const remaining = totalVolumeL - usedVolumeL
      if (remaining > 0) ingredient.resolvedAmount = litersToDisplayVolume(remaining)
    }
    if (!ingredient.resolvedAmount && ingredient.measureMode !== 'fixed_amount') {
      warnings.push(`Could not resolve required amount for ${ingredient.ref?.label || ingredient.ref?.id || `ingredient ${index + 1}`}.`)
    }
  })

  return {
    ingredients,
    outputComposition: mergeCompositionEntries(ingredients.flatMap((ingredient) => flattenIngredient(ingredient, args.totalOutputQuantity))),
    warnings,
  }
}
