import { computeFormulation, type IngredientMeasureMode, type IngredientSourceState } from './formulationMath.js';
import type { Concentration } from './concentration.js';
import type { ParsedCompositionEntry } from './composition.js';

export type CopilotRef = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

export type CopilotIngredientDraft = {
  ref?: CopilotRef;
  roleType: string;
  measureMode?: IngredientMeasureMode;
  sourceState?: IngredientSourceState;
  stockConcentration?: Concentration;
  targetContribution?: Concentration;
  requiredAmount?: { value: number; unit: string };
  molecularWeight?: { value: number; unit: 'g/mol' };
  compositionSnapshot?: ParsedCompositionEntry[];
};

export type FormulationCopilotDraft = {
  recipeName?: string;
  representsMaterial?: CopilotRef;
  totalProduced?: { value: number; unit: string };
  outputSolventRef?: CopilotRef;
  storage?: {
    storageTemperatureC?: number;
    lightSensitive?: boolean;
    maxFreezeThawCycles?: number;
    stabilityNote?: string;
  };
  notes?: string;
  ingredients: CopilotIngredientDraft[];
  steps?: Array<{ instruction: string }>;
};

export type FormulationCopilotIngredientSummary = {
  label: string;
  roleType: string;
  measureMode?: IngredientMeasureMode;
  sourceState?: IngredientSourceState;
  targetContribution?: Concentration;
  stockConcentration?: Concentration;
  requiredAmount?: { value: number; unit: string };
  note?: string;
};

export type FormulationCopilotResult = {
  draftPatch: Partial<FormulationCopilotDraft>;
  warnings: string[];
  assumptions: string[];
  calculationSummary: FormulationCopilotIngredientSummary[];
  outputComposition: ParsedCompositionEntry[];
};

export type PromptDraftResolver = (label: string, kind: 'material' | 'solvent' | 'ingredient') => Promise<CopilotRef | undefined>;

function ingredientLabel(ingredient: CopilotIngredientDraft, index: number): string {
  return ingredient.ref?.label ?? ingredient.ref?.id ?? `Ingredient ${index + 1}`;
}

function roleDefaultMeasureMode(roleType: string): IngredientMeasureMode {
  if (roleType === 'solvent' || roleType === 'diluent' || roleType === 'matrix') return 'qs_to_final';
  return 'target_concentration';
}

export function inferIngredientMeasureMode(ingredient: CopilotIngredientDraft): IngredientMeasureMode {
  return ingredient.measureMode
    ?? (ingredient.requiredAmount ? 'fixed_amount' : roleDefaultMeasureMode(ingredient.roleType));
}

export function summarizeFormulationDraft(draft: FormulationCopilotDraft): FormulationCopilotResult {
  const assumptions: string[] = [];
  const baseWarnings: string[] = [];
  const normalizedIngredients = draft.ingredients.map((ingredient) => {
    const normalized: CopilotIngredientDraft = {
      ...ingredient,
      measureMode: inferIngredientMeasureMode(ingredient),
      sourceState: ingredient.sourceState ?? (ingredient.roleType === 'solvent' || ingredient.roleType === 'diluent' ? 'liquid' : 'other'),
    };
    if (normalized.measureMode === 'target_concentration' && !normalized.targetContribution) {
      baseWarnings.push(`Missing target concentration for ${ingredient.ref?.label ?? ingredient.ref?.id ?? 'an ingredient'}.`);
    }
    if (normalized.sourceState === 'solid' && normalized.targetContribution?.basis === 'molar' && !normalized.molecularWeight) {
      assumptions.push(`Molecular weight is required to calculate the solid amount for ${ingredient.ref?.label ?? ingredient.ref?.id ?? 'an ingredient'}.`);
    }
    if (
      normalized.sourceState !== 'solid'
      && normalized.measureMode === 'target_concentration'
      && normalized.targetContribution
      && normalized.targetContribution.basis !== 'volume_fraction'
      && !normalized.stockConcentration
    ) {
      assumptions.push(`Stock concentration is required to calculate transfer volume for ${ingredient.ref?.label ?? ingredient.ref?.id ?? 'an ingredient'}.`);
    }
    return normalized;
  });

  const computed = computeFormulation({
    ingredients: normalizedIngredients.map((ingredient) => ({
      ...(ingredient.ref ? { ref: ingredient.ref } : {}),
      roleType: ingredient.roleType,
      ...(ingredient.measureMode ? { measureMode: ingredient.measureMode } : {}),
      ...(ingredient.sourceState ? { sourceState: ingredient.sourceState } : {}),
      ...(ingredient.stockConcentration ? { stockConcentration: ingredient.stockConcentration } : {}),
      ...(ingredient.targetContribution ? { targetContribution: ingredient.targetContribution } : {}),
      ...(ingredient.requiredAmount ? { requiredAmount: ingredient.requiredAmount } : {}),
      ...(ingredient.molecularWeight ? { molecularWeight: ingredient.molecularWeight } : {}),
      ...(ingredient.compositionSnapshot ? { compositionSnapshot: ingredient.compositionSnapshot } : {}),
    })),
    ...(draft.totalProduced ? { totalOutputQuantity: draft.totalProduced } : {}),
  });

  const calculationSummary = normalizedIngredients.map((ingredient, index) => ({
    label: ingredientLabel(ingredient, index),
    roleType: ingredient.roleType,
    ...(ingredient.measureMode ? { measureMode: ingredient.measureMode } : {}),
    ...(ingredient.sourceState ? { sourceState: ingredient.sourceState } : {}),
    ...(ingredient.targetContribution ? { targetContribution: ingredient.targetContribution } : {}),
    ...(ingredient.stockConcentration ? { stockConcentration: ingredient.stockConcentration } : {}),
    ...(computed.ingredients[index]?.resolvedAmount
      ? { requiredAmount: computed.ingredients[index].resolvedAmount }
      : ingredient.requiredAmount
        ? { requiredAmount: ingredient.requiredAmount }
        : {}),
    ...(!computed.ingredients[index]?.resolvedAmount && ingredient.requiredAmount
      ? { note: 'Using manually specified amount.' }
      : {}),
  }));

  const draftPatch: Partial<FormulationCopilotDraft> = {
    ingredients: normalizedIngredients.map((ingredient, index) => ({
      ...ingredient,
      ...(computed.ingredients[index]?.resolvedAmount ? { requiredAmount: computed.ingredients[index].resolvedAmount } : {}),
    })),
    ...(draft.totalProduced ? { totalProduced: draft.totalProduced } : {}),
    ...(draft.recipeName ? { recipeName: draft.recipeName } : {}),
    ...(draft.representsMaterial ? { representsMaterial: draft.representsMaterial } : {}),
    ...(draft.outputSolventRef ? { outputSolventRef: draft.outputSolventRef } : {}),
    ...(draft.storage ? { storage: draft.storage } : {}),
    ...(draft.notes ? { notes: draft.notes } : {}),
    ...(draft.steps ? { steps: draft.steps } : {}),
  };

  return {
    draftPatch,
    warnings: [...baseWarnings, ...computed.warnings],
    assumptions,
    calculationSummary,
    outputComposition: computed.outputComposition,
  };
}

export function flattenFormulationDraft(draft: FormulationCopilotDraft): FormulationCopilotResult {
  return summarizeFormulationDraft(draft);
}

export function suggestMissingFormulationFields(draft: FormulationCopilotDraft): FormulationCopilotResult {
  const summary = summarizeFormulationDraft(draft);
  const draftPatch: Partial<FormulationCopilotDraft> = { ...summary.draftPatch };

  if (!draft.recipeName?.trim()) {
    const primary = draft.representsMaterial?.label ?? draft.ingredients[0]?.ref?.label ?? draft.ingredients[0]?.ref?.id;
    const solvent = draft.outputSolventRef?.label ?? draft.ingredients.find((entry) => entry.roleType === 'solvent' || entry.roleType === 'diluent')?.ref?.label;
    if (primary) {
      draftPatch.recipeName = solvent ? `${primary} in ${solvent}` : primary;
    }
  }

  if ((!draft.steps || draft.steps.length === 0) && draft.ingredients.length > 0) {
    draftPatch.steps = [{ instruction: 'Combine ingredients and mix until homogeneous.' }];
  }

  return { ...summary, draftPatch };
}

function normalizeConcentrationUnitFromPrompt(unit: string): string {
  const trimmed = unit.replace(/\s+/g, ' ').trim();
  if (trimmed === '%v/v' || trimmed === '% v / v' || trimmed === '% v/v') return '% v/v';
  if (trimmed === '%w/v' || trimmed === '% w / v' || trimmed === '% w/v') return '% w/v';
  return trimmed;
}

export async function draftFormulationFromPrompt(
  prompt: string,
  resolveRef?: PromptDraftResolver,
): Promise<FormulationCopilotResult> {
  const text = prompt.trim();
  const assumptions: string[] = [];

  const volumeMatch = text.match(/(\d+(?:\.\d+)?)\s*(uL|mL|L)\b/i);
  const concentrationMatch = text.match(/(\d+(?:\.\d+)?)\s*(M|mM|uM|nM|pM|fM|g\/L|mg\/mL|ug\/mL|ng\/mL|%\s*v\/v|%\s*w\/v)\b/i);
  const inMatch = text.match(/\b(?:in|into|with)\s+([A-Za-z0-9 .+\-_/()]+)$/i);
  const ofMatch = text.match(/\bof\s+(.+?)$/i);

  const volumeUnit = volumeMatch?.[2];
  const totalProduced = volumeMatch && volumeUnit
    ? { value: Number(volumeMatch[1]), unit: volumeUnit }
    : undefined;

  const normalizedPrompt = text.replace(/^make\s+/i, '').replace(/^prepare\s+/i, '').trim();
  let representedLabel = normalizedPrompt;
  if (volumeMatch) representedLabel = representedLabel.replace(volumeMatch[0], '').trim();
  if (/\bof\b/i.test(representedLabel)) representedLabel = representedLabel.replace(/^.*?\bof\b/i, '').trim();

  let solventLabel = inMatch?.[1]?.trim();
  let soluteLabel = representedLabel;
  if (concentrationMatch) {
    const concentrationIndex = representedLabel.toLowerCase().indexOf(concentrationMatch[0].toLowerCase());
    if (concentrationIndex >= 0) {
      soluteLabel = representedLabel.slice(concentrationIndex + concentrationMatch[0].length).trim();
    } else if (ofMatch?.[1]) {
      soluteLabel = ofMatch[1].trim();
    }
  }
  if (solventLabel && /\bin\s+/i.test(soluteLabel)) {
    soluteLabel = soluteLabel.replace(/\bin\s+.*$/i, '').trim();
  }
  solventLabel = solventLabel?.replace(/\.$/, '').trim();
  soluteLabel = soluteLabel.replace(/\bin\s+.*$/i, '').replace(/\.$/, '').trim();
  if (!soluteLabel && ofMatch?.[1]) soluteLabel = ofMatch[1].replace(/\bin\s+.*$/i, '').trim();

  const concentrationUnit = concentrationMatch?.[2];
  const targetContribution = concentrationMatch && concentrationUnit
    ? {
        value: Number(concentrationMatch[1]),
        unit: normalizeConcentrationUnitFromPrompt(concentrationUnit),
        basis: (
          concentrationUnit.includes('%')
            ? concentrationUnit.toLowerCase().includes('w') ? 'mass_fraction' : 'volume_fraction'
            : ['M', 'mM', 'uM', 'nM', 'pM', 'fM'].includes(concentrationUnit) ? 'molar'
            : 'mass_per_volume'
        ) as NonNullable<Concentration['basis']>,
      }
    : undefined;

  if (!totalProduced) assumptions.push('Total output quantity was not found in the prompt.');
  if (!targetContribution) assumptions.push('Target concentration was not found in the prompt.');
  if (!soluteLabel) assumptions.push('Primary ingredient name was not found in the prompt.');

  const soluteRef = soluteLabel && resolveRef ? await resolveRef(soluteLabel, 'material') : undefined;
  const solventRef = solventLabel && resolveRef ? await resolveRef(solventLabel, 'solvent') : undefined;

  const ingredients: CopilotIngredientDraft[] = [];
  if (soluteLabel) {
    ingredients.push({
      ...(soluteRef ? { ref: soluteRef } : {}),
      roleType: 'solute',
      measureMode: 'target_concentration',
      sourceState: 'solid',
      ...(targetContribution ? { targetContribution } : {}),
    });
  }
  if (solventLabel) {
    const solventIngredient: CopilotIngredientDraft = {
      ...(solventRef ? { ref: solventRef } : {}),
      roleType: 'solvent',
      measureMode: 'qs_to_final',
      sourceState: 'liquid',
      ...(solventRef ? { compositionSnapshot: [{ componentRef: solventRef, role: 'solvent' }] } : {}),
    };
    ingredients.push(solventIngredient);
  }

  const draft: FormulationCopilotDraft = {
    recipeName: text,
    ...(soluteRef ? { representsMaterial: soluteRef } : {}),
    ...(totalProduced ? { totalProduced } : {}),
    ...(solventRef ? { outputSolventRef: solventRef } : {}),
    ingredients,
    steps: ingredients.length > 0 ? [{ instruction: 'Combine ingredients and mix until homogeneous.' }] : [],
  };

  const summary = suggestMissingFormulationFields(draft);
  return {
    ...summary,
    assumptions: [...assumptions, ...summary.assumptions],
  };
}
