import { parseConcentration, toStoredConcentration, type Concentration } from './concentration.js';
import { parseStoredCompositionEntries, type ParsedCompositionEntry } from './composition.js';

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

export type IngredientMeasureMode = 'target_concentration' | 'fixed_amount' | 'qs_to_final';
export type IngredientSourceState = 'solid' | 'liquid' | 'stock_solution' | 'formulation' | 'cells' | 'other';

export type FlexibleQuantity = {
  value: number | string;
  unit: string;
};

export type FormulationIngredient = {
  ref?: RefShape | null;
  roleType?: string;
  measureMode?: IngredientMeasureMode;
  sourceState?: IngredientSourceState;
  stockConcentration?: Concentration;
  targetContribution?: Concentration;
  requiredAmount?: FlexibleQuantity;
  molecularWeight?: { value: number; unit: string };
  compositionSnapshot?: ParsedCompositionEntry[];
};

type ResolvedIngredient = FormulationIngredient & {
  resolvedAmount?: { value: number; unit: string };
};

export type FormulationComputationResult = {
  ingredients: ResolvedIngredient[];
  outputComposition: ParsedCompositionEntry[];
  warnings: string[];
};

const VOLUME_FACTORS_TO_L = {
  uL: 1e-6,
  mL: 1e-3,
  L: 1,
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
}

function quantityValue(value: FlexibleQuantity | undefined): { value: number; unit: string } | undefined {
  if (!value) return undefined;
  const numeric = numericValue(value.value);
  const unit = stringValue(value.unit);
  if (numeric === undefined || !unit) return undefined;
  return { value: numeric, unit };
}

function volumeToLiters(value: { value: number; unit: string } | undefined): number | undefined {
  if (!value) return undefined;
  const factor = VOLUME_FACTORS_TO_L[value.unit as keyof typeof VOLUME_FACTORS_TO_L];
  return factor ? value.value * factor : undefined;
}

function litersToDisplayVolume(valueL: number): { value: number; unit: string } {
  if (valueL < 1e-3) return { value: Number((valueL * 1e6).toFixed(4)), unit: 'uL' };
  if (valueL < 1) return { value: Number((valueL * 1e3).toFixed(4)), unit: 'mL' };
  return { value: Number(valueL.toFixed(6)), unit: 'L' };
}

function gramsToDisplayMass(valueG: number): { value: number; unit: string } {
  if (valueG < 1e-6) return { value: Number((valueG * 1e9).toFixed(4)), unit: 'ng' };
  if (valueG < 1e-3) return { value: Number((valueG * 1e6).toFixed(4)), unit: 'ug' };
  if (valueG < 1) return { value: Number((valueG * 1e3).toFixed(4)), unit: 'mg' };
  return { value: Number(valueG.toFixed(6)), unit: 'g' };
}

function concentrationToBase(concentration: Concentration): number | undefined {
  switch (concentration.basis) {
    case 'molar':
      switch (concentration.unit) {
        case 'M': return concentration.value;
        case 'mM': return concentration.value * 1e-3;
        case 'uM': return concentration.value * 1e-6;
        case 'nM': return concentration.value * 1e-9;
        case 'pM': return concentration.value * 1e-12;
        case 'fM': return concentration.value * 1e-15;
        default: return undefined;
      }
    case 'mass_per_volume':
      switch (concentration.unit) {
        case 'g/L': return concentration.value;
        case 'mg/mL': return concentration.value;
        case 'ug/mL': return concentration.value * 1e-3;
        case 'ng/mL': return concentration.value * 1e-6;
        default: return undefined;
      }
    case 'activity_per_volume':
      switch (concentration.unit) {
        case 'U/mL': return concentration.value * 1e3;
        case 'U/uL': return concentration.value * 1e6;
        default: return undefined;
      }
    case 'count_per_volume':
      switch (concentration.unit) {
        case 'cells/mL': return concentration.value * 1e3;
        case 'cells/uL': return concentration.value * 1e6;
        default: return undefined;
      }
    case 'volume_fraction':
    case 'mass_fraction':
      return concentration.value / 100;
    default:
      return undefined;
  }
}

function concentrationFromBase(value: number, template: Concentration): Concentration | undefined {
  switch (template.basis) {
    case 'molar':
      switch (template.unit) {
        case 'M': return { ...template, value: Number(value.toFixed(9)) };
        case 'mM': return { ...template, value: Number((value * 1e3).toFixed(6)) };
        case 'uM': return { ...template, value: Number((value * 1e6).toFixed(6)) };
        case 'nM': return { ...template, value: Number((value * 1e9).toFixed(6)) };
        case 'pM': return { ...template, value: Number((value * 1e12).toFixed(6)) };
        case 'fM': return { ...template, value: Number((value * 1e15).toFixed(6)) };
        default: return undefined;
      }
    case 'mass_per_volume':
      switch (template.unit) {
        case 'g/L': return { ...template, value: Number(value.toFixed(6)) };
        case 'mg/mL': return { ...template, value: Number(value.toFixed(6)) };
        case 'ug/mL': return { ...template, value: Number((value * 1e3).toFixed(6)) };
        case 'ng/mL': return { ...template, value: Number((value * 1e6).toFixed(6)) };
        default: return undefined;
      }
    case 'activity_per_volume':
      switch (template.unit) {
        case 'U/mL': return { ...template, value: Number((value / 1e3).toFixed(6)) };
        case 'U/uL': return { ...template, value: Number((value / 1e6).toFixed(6)) };
        default: return undefined;
      }
    case 'count_per_volume':
      switch (template.unit) {
        case 'cells/mL': return { ...template, value: Number((value / 1e3).toFixed(6)) };
        case 'cells/uL': return { ...template, value: Number((value / 1e6).toFixed(6)) };
        default: return undefined;
      }
    case 'volume_fraction':
    case 'mass_fraction':
      return { ...template, value: Number((value * 100).toFixed(6)) };
    default:
      return undefined;
  }
}

function scaleConcentration(concentration: Concentration, ratio: number): Concentration | undefined {
  const base = concentrationToBase(concentration);
  if (base === undefined) return undefined;
  return concentrationFromBase(base * ratio, concentration);
}

function mergeCompositionEntries(entries: ParsedCompositionEntry[]): ParsedCompositionEntry[] {
  const merged = new Map<string, ParsedCompositionEntry>();
  for (const entry of entries) {
    const concentrationKey = entry.concentration ? `${entry.concentration.basis}:${entry.concentration.unit}` : 'none';
    const key = `${entry.componentRef.kind}:${entry.componentRef.id}:${entry.role}:${concentrationKey}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }
    if (!existing.concentration || !entry.concentration) continue;
    const existingBase = concentrationToBase(existing.concentration);
    const nextBase = concentrationToBase(entry.concentration);
    if (existingBase === undefined || nextBase === undefined) continue;
    const summed = concentrationFromBase(existingBase + nextBase, existing.concentration);
    if (summed) merged.set(key, { ...existing, concentration: summed });
  }
  return [...merged.values()];
}

function primaryIngredientRef(ingredient: FormulationIngredient): RefShape | undefined {
  return ingredient.ref ?? ingredient.compositionSnapshot?.[0]?.componentRef;
}

function inferredCompositionForIngredient(ingredient: FormulationIngredient): ParsedCompositionEntry[] {
  if (ingredient.compositionSnapshot?.length) return ingredient.compositionSnapshot;
  const ref = primaryIngredientRef(ingredient);
  if (!ref) return [];
  return [{
    componentRef: ref,
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
  }];
}

function computeRequiredAmount(
  ingredient: FormulationIngredient,
  totalOutputQuantity: { value: number; unit: string } | undefined,
): { value: number; unit: string } | undefined {
  const explicit = quantityValue(ingredient.requiredAmount);
  if (explicit) return explicit;

  if (ingredient.measureMode === 'fixed_amount') return undefined;
  const totalVolumeL = volumeToLiters(totalOutputQuantity);

  if (ingredient.measureMode === 'target_concentration' && ingredient.targetContribution) {
    if (ingredient.sourceState === 'solid') {
      if (ingredient.targetContribution.basis === 'molar' && ingredient.molecularWeight?.unit === 'g/mol' && totalVolumeL !== undefined) {
        const concentrationM = concentrationToBase(ingredient.targetContribution);
        if (concentrationM !== undefined) {
          return gramsToDisplayMass(concentrationM * totalVolumeL * ingredient.molecularWeight.value);
        }
      }
      if (ingredient.targetContribution.basis === 'mass_per_volume' && totalVolumeL !== undefined) {
        const concentrationGL = concentrationToBase(ingredient.targetContribution);
        if (concentrationGL !== undefined) {
          return gramsToDisplayMass(concentrationGL * totalVolumeL);
        }
      }
    }

    if (ingredient.targetContribution.basis === 'count_per_volume' && totalVolumeL !== undefined) {
      const cellsPerL = concentrationToBase(ingredient.targetContribution);
      if (cellsPerL !== undefined) {
        return { value: Number((cellsPerL * totalVolumeL).toFixed(2)), unit: 'cells' };
      }
    }

    if (ingredient.targetContribution.basis === 'volume_fraction' && totalVolumeL !== undefined) {
      const fraction = concentrationToBase(ingredient.targetContribution);
      if (fraction !== undefined) {
        return litersToDisplayVolume(totalVolumeL * fraction);
      }
    }

    if (ingredient.stockConcentration && totalVolumeL !== undefined) {
      const stockBase = concentrationToBase(ingredient.stockConcentration);
      const targetBase = concentrationToBase(ingredient.targetContribution);
      if (
        stockBase !== undefined
        && targetBase !== undefined
        && ingredient.stockConcentration.basis === ingredient.targetContribution.basis
        && stockBase > 0
      ) {
        return litersToDisplayVolume((targetBase / stockBase) * totalVolumeL);
      }
    }
  }

  return undefined;
}

function computeQsToFinalAmount(
  ingredients: ResolvedIngredient[],
  index: number,
  totalOutputQuantity: { value: number; unit: string } | undefined,
): { value: number; unit: string } | undefined {
  const totalVolumeL = volumeToLiters(totalOutputQuantity);
  if (totalVolumeL === undefined) return undefined;
  const usedVolumeL = ingredients.reduce((acc, ingredient, ingredientIndex) => {
    if (ingredientIndex === index) return acc;
    const amount = ingredient.resolvedAmount;
    const liters = amount ? volumeToLiters(amount) : undefined;
    return acc + (liters ?? 0);
  }, 0);
  const remaining = totalVolumeL - usedVolumeL;
  if (!(remaining > 0)) return undefined;
  return litersToDisplayVolume(remaining);
}

function flattenIngredientComposition(
  ingredient: ResolvedIngredient,
  totalOutputQuantity: { value: number; unit: string } | undefined,
): ParsedCompositionEntry[] {
  const totalVolumeL = volumeToLiters(totalOutputQuantity);
  const ingredientVolumeL = volumeToLiters(ingredient.resolvedAmount);
  const baseComposition = inferredCompositionForIngredient(ingredient);

  if (ingredient.measureMode === 'target_concentration' && ingredient.sourceState === 'solid' && ingredient.targetContribution) {
    const ref = primaryIngredientRef(ingredient);
    if (!ref) return baseComposition;
    return [{
      componentRef: ref,
      role: baseComposition[0]?.role ?? 'solute',
      concentration: ingredient.targetContribution,
    }];
  }

  if (baseComposition.length === 0) return [];

  return baseComposition.map((entry) => {
    if (entry.concentration && ingredientVolumeL !== undefined && totalVolumeL !== undefined && totalVolumeL > 0) {
      const concentration = scaleConcentration(entry.concentration, ingredientVolumeL / totalVolumeL);
      return {
        ...entry,
        ...(concentration ? { concentration } : {}),
      };
    }
    if (
      !entry.concentration
      && entry.role === 'solvent'
      && ingredientVolumeL !== undefined
      && totalVolumeL !== undefined
      && totalVolumeL > 0
    ) {
      return {
        ...entry,
        concentration: {
          value: Number(((ingredientVolumeL / totalVolumeL) * 100).toFixed(6)),
          unit: '% v/v',
          basis: 'volume_fraction',
        },
      };
    }
    return entry;
  });
}

export function computeFormulation(args: {
  ingredients: FormulationIngredient[];
  totalOutputQuantity?: { value: number; unit: string };
}): FormulationComputationResult {
  const warnings: string[] = [];
  const ingredients: ResolvedIngredient[] = args.ingredients.map((ingredient) => {
    const next: ResolvedIngredient = { ...ingredient };
    const resolvedAmount = computeRequiredAmount(ingredient, args.totalOutputQuantity);
    if (resolvedAmount) next.resolvedAmount = resolvedAmount;
    return next;
  });

  ingredients.forEach((ingredient, index) => {
    if (ingredient.measureMode === 'qs_to_final' && !ingredient.resolvedAmount) {
      const resolved = computeQsToFinalAmount(ingredients, index, args.totalOutputQuantity);
      if (resolved) ingredient.resolvedAmount = resolved;
    }
    if (!ingredient.resolvedAmount && ingredient.measureMode !== 'fixed_amount') {
      const ref = primaryIngredientRef(ingredient);
      warnings.push(`Could not resolve required amount for ${ref?.label ?? ref?.id ?? `ingredient ${index + 1}`}.`);
    }
  });

  const outputComposition = mergeCompositionEntries(
    ingredients.flatMap((ingredient) => flattenIngredientComposition(ingredient, args.totalOutputQuantity)),
  );

  return { ingredients, outputComposition, warnings };
}

export function parseStoredIngredientComposition(value: unknown): ParsedCompositionEntry[] {
  return parseStoredCompositionEntries(value);
}

export function toStoredIngredientConcentration(value: unknown): Record<string, unknown> | undefined {
  return toStoredConcentration(value);
}

export function parseIngredientConcentration(value: unknown): Concentration | undefined {
  return parseConcentration(value);
}
