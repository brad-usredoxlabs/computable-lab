import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAiChat } from '../shared/hooks/useAiChat'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import type { AiContext } from '../types/aiContext'
import {
  apiClient,
  type CreateFormulationRequest,
  type ExecuteRecipeResponse,
  type FormulationCopilotDraft,
  type FormulationCopilotResponse,
  type FormulationSummary,
  type IngredientMeasureMode,
  type IngredientSourceState,
  type MaterialInventoryItem,
  type QuantityValue,
} from '../shared/api/client'
import { MaterialPicker } from './material'
import { MaterialInstanceBuilderModal } from './material/MaterialInstanceBuilderModal'
import { AliquotSplitModal } from './material/AliquotSplitModal'
import { resolveAddMaterialSourceDefaults } from './lib/materialComposition'
import { computeFormulationComposition, inferIngredientSourceState } from './lib/formulationMath'
import { formatMolecularWeightResolutionNote, formatResolvedMolecularWeightValue } from './lib/molecularWeight'
import type { Ref } from '../types/ref'
import {
  CONCENTRATION_UNITS,
  formatCompositionSummary,
  formatConcentration,
  generateMaterialId,
  getPrimaryDeclaredConcentration,
  inferDomainFromNamespace,
  RECIPE_ROLE_OPTIONS,
  type CompositionEntryValue,
  type ConcentrationValue,
  type RecipeRoleType,
  withInferredConcentrationBasis,
} from '../types/material'

const AMOUNT_UNITS = [
  'uL',
  'mL',
  'L',
  'ng',
  'ug',
  'mg',
  'g',
  'nM',
  'uM',
  'mM',
  'M',
  'cells',
] as const

const OUTPUT_QUANTITY_UNITS = ['uL', 'mL', 'L'] as const
const SOURCE_STATE_OPTIONS: readonly { value: IngredientSourceState; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'stock_solution', label: 'Stock' },
  { value: 'formulation', label: 'Formulation' },
  { value: 'cells', label: 'Cells' },
  { value: 'other', label: 'Other' },
] as const

type IngredientDraft = {
  ref: Ref | null
  roleType: RecipeRoleType
  measureMode: IngredientMeasureMode
  sourceState: IngredientSourceState
  stockConcentrationValue: string
  stockConcentrationUnit: string
  targetContributionValue: string
  targetContributionUnit: string
  requiredAmountValue: string
  requiredAmountUnit: string
  molecularWeight: string
  compositionSnapshot: CompositionEntryValue[]
}

type PreferredSourceDraft = {
  vendor: string
  catalogNumber: string
}

type StepDraft = {
  instruction: string
}

type FormulationDraft = {
  recipeName: string
  representsMaterial: Ref | null
  totalProducedValue: string
  totalProducedUnit: string
  storageTemperatureC: string
  lightSensitive: boolean
  maxFreezeThawCycles: string
  stabilityNote: string
  notes: string
  outputMaterialMolecularWeight: string
  outputSolventRef: Ref | null
  ingredients: IngredientDraft[]
  preferredSources: PreferredSourceDraft[]
  steps: StepDraft[]
}

type PrepareDraft = {
  bindings: Record<string, string>
  outputMode: 'batch' | 'batch-and-split'
  outputCount: string
  outputVolumeValue: string
  outputVolumeUnit: string
  scale: string
  containerType: string
  storageLocation: string
  barcodePrefix: string
  notes: string
}

type CopilotMessage = {
  role: 'user' | 'assistant'
  text: string
}

function emptyDraft(): FormulationDraft {
  return {
    recipeName: '',
    representsMaterial: null,
    totalProducedValue: '10',
    totalProducedUnit: 'mL',
    storageTemperatureC: '',
    lightSensitive: false,
    maxFreezeThawCycles: '',
    stabilityNote: '',
    notes: '',
    outputMaterialMolecularWeight: '',
    outputSolventRef: null,
    ingredients: [
      {
        ref: null,
        roleType: 'solute',
        measureMode: 'target_concentration',
        sourceState: 'solid',
        stockConcentrationValue: '',
        stockConcentrationUnit: 'mM',
        targetContributionValue: '',
        targetContributionUnit: 'mM',
        requiredAmountValue: '',
        requiredAmountUnit: 'mg',
        molecularWeight: '',
        compositionSnapshot: [],
      },
    ],
    preferredSources: [
      {
        vendor: '',
        catalogNumber: '',
      },
    ],
    steps: [{ instruction: 'Combine ingredients and mix until homogeneous.' }],
  }
}

function ingredientNameFromRole(role: FormulationSummary['inputRoles'][number]): string {
  if (role.materialRef?.label) return role.materialRef.label
  return role.allowedMaterialSpecRefs[0]?.label || role.roleId
}

function ingredientDisplayParts(role: FormulationSummary['inputRoles'][number]): {
  name: string
  quantity: string
  unit: string
} {
  const name = ingredientNameFromRole(role)
  if (role.requiredAmount) {
    return {
      name,
      quantity: String(role.requiredAmount.value),
      unit: role.requiredAmount.unit,
    }
  }
  if (role.quantity) {
    return {
      name,
      quantity: String(role.quantity.value),
      unit: role.quantity.unit,
    }
  }
  const parsed = parseIngredientAmount(role.constraints)
  return {
    name,
    quantity: parsed.quantity,
    unit: parsed.unit,
  }
}

function slugifyIngredientName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildIngredientRoleIds(ingredients: IngredientDraft[]): string[] {
  const used = new Set<string>()
  return ingredients.map((ingredient, index) => {
    const base = slugifyIngredientName(ingredient.ref?.label || ingredient.ref?.id || '') || `ingredient_${index + 1}`
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`
      suffix += 1
    }
    used.add(candidate)
    return candidate
  })
}

function parseIngredientAmount(constraints: string[]): { quantity: string; unit: string } {
  const amountConstraint = constraints.find((constraint) => constraint.toLowerCase().startsWith('amount:'))
  if (!amountConstraint) return { quantity: '', unit: '' }
  const match = amountConstraint.match(/^amount:\s*([^\s]+)\s*(.*)$/i)
  if (!match) return { quantity: '', unit: '' }
  return {
    quantity: match[1]?.trim() || '',
    unit: match[2]?.trim() || '',
  }
}

function parseConcentrationInput(
  concentration?: ConcentrationValue | null,
): { value: string; unit: string } {
  return {
    value: concentration ? String(concentration.value) : '',
    unit: concentration?.unit || 'mM',
  }
}

function parseQuantityInput(
  quantity?: QuantityValue | null,
  fallbackUnit = 'mL',
): { value: string; unit: string } {
  return {
    value: quantity ? String(quantity.value) : '',
    unit: quantity?.unit || fallbackUnit,
  }
}

function parseIngredientRole(role: FormulationSummary['inputRoles'][number]): RecipeRoleType {
  const roleType = role.roleType as RecipeRoleType
  return RECIPE_ROLE_OPTIONS.some((option) => option.value === roleType) ? roleType : 'other'
}

function parseIngredientRef(role: FormulationSummary['inputRoles'][number]): Ref | null {
  if (role.allowedMaterialSpecRefs[0]?.id) {
    return {
      kind: 'record',
      id: role.allowedMaterialSpecRefs[0].id,
      type: 'material-spec',
      label: role.allowedMaterialSpecRefs[0].label || role.allowedMaterialSpecRefs[0].id,
    }
  }
  if (role.vendorProductRef?.id) {
    return {
      kind: 'record',
      id: role.vendorProductRef.id,
      type: 'vendor-product',
      label: role.vendorProductRef.label || role.vendorProductRef.id,
    }
  }
  if (role.materialRef?.id) {
    return {
      kind: 'record',
      id: role.materialRef.id,
      type: 'material',
      label: role.materialRef.label || role.materialRef.id,
    }
  }
  return null
}

function ingredientUnitOptions(currentUnit: string): string[] {
  const trimmed = currentUnit.trim()
  if (!trimmed) return [...AMOUNT_UNITS]
  return AMOUNT_UNITS.includes(trimmed as typeof AMOUNT_UNITS[number])
    ? [...AMOUNT_UNITS]
    : [trimmed, ...AMOUNT_UNITS]
}

function concentrationFromIngredient(quantity: string, unit: string) {
  const numeric = Number(quantity)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  const normalizedUnit = unit.trim()
  if (!CONCENTRATION_UNITS.some((entry) => entry.value === normalizedUnit)) return undefined
  return withInferredConcentrationBasis({ value: numeric, unit: normalizedUnit })
}

function buildOutputComposition(draft: FormulationDraft): CompositionEntryValue[] {
  const totalProduced = Number(draft.totalProducedValue)
  const computed = computeFormulationComposition({
    ingredients: draft.ingredients
      .filter((ingredient): ingredient is IngredientDraft & { ref: Ref } => Boolean(ingredient.ref))
      .map((ingredient) => ({
        ref: ingredient.ref,
        roleType: ingredient.roleType,
        measureMode: ingredient.measureMode,
        sourceState: ingredient.sourceState,
        stockConcentration: concentrationFromIngredient(ingredient.stockConcentrationValue, ingredient.stockConcentrationUnit),
        targetContribution: concentrationFromIngredient(ingredient.targetContributionValue, ingredient.targetContributionUnit),
        requiredAmount: ingredient.requiredAmountValue.trim() && ingredient.requiredAmountUnit.trim() && Number.isFinite(Number(ingredient.requiredAmountValue))
          ? { value: Number(ingredient.requiredAmountValue), unit: ingredient.requiredAmountUnit.trim() }
          : undefined,
        molecularWeight: Number.isFinite(Number(ingredient.molecularWeight)) && Number(ingredient.molecularWeight) > 0
          ? { value: Number(ingredient.molecularWeight), unit: 'g/mol' as const }
          : undefined,
        compositionSnapshot: ingredient.compositionSnapshot,
      })),
    ...(Number.isFinite(totalProduced) && totalProduced > 0
      ? { totalOutputQuantity: { value: totalProduced, unit: draft.totalProducedUnit } }
      : {}),
  })

  const entries = [...computed.outputComposition]
  const hasSolvent = draft.outputSolventRef && entries.some((entry) => entry.componentRef.id === draft.outputSolventRef?.id && entry.role === 'solvent')
  if (draft.outputSolventRef && !hasSolvent) {
    entries.push({
      componentRef: draft.outputSolventRef,
      role: 'solvent',
      source: 'declared solvent',
    })
  }
  return entries
}

function draftToCopilotRequest(draft: FormulationDraft): FormulationCopilotDraft {
  return {
    ...(draft.recipeName.trim() ? { recipeName: draft.recipeName.trim() } : {}),
    ...(draft.representsMaterial ? { representsMaterial: draft.representsMaterial } : {}),
    ...(Number.isFinite(Number(draft.totalProducedValue)) && Number(draft.totalProducedValue) > 0
      ? { totalProduced: { value: Number(draft.totalProducedValue), unit: draft.totalProducedUnit } }
      : {}),
    ...(draft.outputSolventRef ? { outputSolventRef: draft.outputSolventRef } : {}),
    storage: {
      ...(draft.storageTemperatureC.trim() && Number.isFinite(Number(draft.storageTemperatureC))
        ? { storageTemperatureC: Number(draft.storageTemperatureC) }
        : {}),
      ...(draft.lightSensitive ? { lightSensitive: true } : {}),
      ...(draft.maxFreezeThawCycles.trim() && Number.isFinite(Number(draft.maxFreezeThawCycles))
        ? { maxFreezeThawCycles: Number(draft.maxFreezeThawCycles) }
        : {}),
      ...(draft.stabilityNote.trim() ? { stabilityNote: draft.stabilityNote.trim() } : {}),
    },
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    ingredients: draft.ingredients
      .filter((ingredient): ingredient is IngredientDraft & { ref: Ref } => Boolean(ingredient.ref))
      .map((ingredient) => ({
        ref: ingredient.ref,
        roleType: ingredient.roleType,
        measureMode: ingredient.measureMode,
        sourceState: ingredient.sourceState,
        ...(concentrationFromIngredient(ingredient.stockConcentrationValue, ingredient.stockConcentrationUnit)
          ? { stockConcentration: concentrationFromIngredient(ingredient.stockConcentrationValue, ingredient.stockConcentrationUnit) }
          : {}),
        ...(concentrationFromIngredient(ingredient.targetContributionValue, ingredient.targetContributionUnit)
          ? { targetContribution: concentrationFromIngredient(ingredient.targetContributionValue, ingredient.targetContributionUnit) }
          : {}),
        ...(ingredient.requiredAmountValue.trim() && ingredient.requiredAmountUnit.trim() && Number.isFinite(Number(ingredient.requiredAmountValue))
          ? { requiredAmount: { value: Number(ingredient.requiredAmountValue), unit: ingredient.requiredAmountUnit.trim() } }
          : {}),
        ...(Number.isFinite(Number(ingredient.molecularWeight)) && Number(ingredient.molecularWeight) > 0
          ? { molecularWeight: { value: Number(ingredient.molecularWeight), unit: 'g/mol' as const } }
          : {}),
        ...(ingredient.compositionSnapshot.length > 0 ? { compositionSnapshot: ingredient.compositionSnapshot } : {}),
      })),
    steps: draft.steps
      .map((step) => ({ instruction: step.instruction.trim() }))
      .filter((step) => step.instruction),
  }
}

function copilotRefToDraftRef(ref: FormulationCopilotDraft['representsMaterial'] | undefined): Ref | null {
  if (!ref) return null
  return ref.kind === 'ontology'
    ? {
        kind: 'ontology',
        id: ref.id,
        namespace: ref.namespace || '',
        label: ref.label || ref.id,
        ...(ref.uri ? { uri: ref.uri } : {}),
      }
    : {
        kind: 'record',
        id: ref.id,
        type: ref.type || 'material',
        ...(ref.label ? { label: ref.label } : {}),
      }
}

function ingredientDraftFromCopilotIngredient(
  ingredient: FormulationCopilotDraft['ingredients'][number],
): IngredientDraft {
  return {
    ref: ingredient.ref ? copilotRefToDraftRef(ingredient.ref) : null,
    roleType: (ingredient.roleType as RecipeRoleType) || 'other',
    measureMode: ingredient.measureMode || 'fixed_amount',
    sourceState: ingredient.sourceState || 'other',
    stockConcentrationValue: ingredient.stockConcentration ? String(ingredient.stockConcentration.value) : '',
    stockConcentrationUnit: ingredient.stockConcentration?.unit || 'mM',
    targetContributionValue: ingredient.targetContribution ? String(ingredient.targetContribution.value) : '',
    targetContributionUnit: ingredient.targetContribution?.unit || 'mM',
    requiredAmountValue: ingredient.requiredAmount ? String(ingredient.requiredAmount.value) : '',
    requiredAmountUnit: ingredient.requiredAmount?.unit || 'mL',
    molecularWeight: ingredient.molecularWeight ? String(ingredient.molecularWeight.value) : '',
    compositionSnapshot: ingredient.compositionSnapshot || [],
  }
}

function applyCopilotPatchToDraft(current: FormulationDraft, patch: Partial<FormulationCopilotDraft>): FormulationDraft {
  return {
    ...current,
    ...(patch.recipeName ? { recipeName: patch.recipeName } : {}),
    ...(patch.representsMaterial ? { representsMaterial: copilotRefToDraftRef(patch.representsMaterial) } : {}),
    ...(patch.totalProduced ? { totalProducedValue: String(patch.totalProduced.value), totalProducedUnit: patch.totalProduced.unit } : {}),
    ...(patch.outputSolventRef ? { outputSolventRef: copilotRefToDraftRef(patch.outputSolventRef) } : {}),
    ...(patch.storage
      ? {
          storageTemperatureC: patch.storage.storageTemperatureC !== undefined ? String(patch.storage.storageTemperatureC) : current.storageTemperatureC,
          lightSensitive: patch.storage.lightSensitive ?? current.lightSensitive,
          maxFreezeThawCycles: patch.storage.maxFreezeThawCycles !== undefined ? String(patch.storage.maxFreezeThawCycles) : current.maxFreezeThawCycles,
          stabilityNote: patch.storage.stabilityNote ?? current.stabilityNote,
        }
      : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.ingredients?.length ? {
      ingredients: patch.ingredients.map(ingredientDraftFromCopilotIngredient),
      preferredSources: patch.ingredients.map(() => ({ vendor: '', catalogNumber: '' })),
    } : {}),
    ...(patch.steps ? { steps: patch.steps.map((step) => ({ instruction: step.instruction })) } : {}),
  }
}

function summarizeCopilotResponse(result: FormulationCopilotResponse): string {
  const parts = [
    result.calculationSummary.length ? `${result.calculationSummary.length} ingredient(s)` : null,
    result.outputComposition.length ? `composition: ${formatCompositionSummary(result.outputComposition, 4)}` : null,
    result.warnings[0] ? `warning: ${result.warnings[0]}` : null,
    result.assumptions[0] ? `assumption: ${result.assumptions[0]}` : null,
  ].filter(Boolean)
  return parts.join(' | ') || 'Reviewed formulation draft.'
}

function draftFromSummary(summary: FormulationSummary): FormulationDraft {
  const ingredients = summary.inputRoles.length
    ? summary.inputRoles.map((role) => ({
        ref: parseIngredientRef(role),
        roleType: parseIngredientRole(role),
        measureMode: role.measureMode || 'fixed_amount',
        sourceState: role.sourceState || inferIngredientSourceState(parseIngredientRef(role)),
        ...(() => {
          const parsed = parseConcentrationInput(role.stockConcentration)
          return {
            stockConcentrationValue: parsed.value,
            stockConcentrationUnit: parsed.unit,
          }
        })(),
        ...(() => {
          const parsed = parseConcentrationInput(role.targetContribution)
          return {
            targetContributionValue: parsed.value,
            targetContributionUnit: parsed.unit,
          }
        })(),
        ...(() => {
          const parsed = parseQuantityInput(role.requiredAmount || (typeof role.quantity?.value === 'number' ? { value: role.quantity.value, unit: role.quantity.unit } : undefined), 'mL')
          return {
            requiredAmountValue: parsed.value,
            requiredAmountUnit: parsed.unit,
          }
        })(),
        molecularWeight: role.molecularWeight?.unit === 'g/mol' ? String(role.molecularWeight.value) : '',
        compositionSnapshot: role.compositionSnapshot || [],
      }))
    : emptyDraft().ingredients
  const preferredSourcesByRole = new Map((summary.preferredSources ?? []).map((source) => [source.roleId, source]))
  const totalProduced = summary.batch?.defaultOutputQuantity || summary.scale?.defaultBatchVolume
  return {
    recipeName: `${summary.recipeName} Copy`,
    representsMaterial: summary.outputSpec.materialId
      ? {
          kind: 'record',
          id: summary.outputSpec.materialId,
          type: 'material',
          label: summary.outputSpec.materialName || summary.outputSpec.materialId,
        }
      : null,
    totalProducedValue: totalProduced ? String(totalProduced.value) : emptyDraft().totalProducedValue,
    totalProducedUnit: totalProduced?.unit || emptyDraft().totalProducedUnit,
    storageTemperatureC: summary.outputSpec.handling?.storageTemperatureC !== undefined ? String(summary.outputSpec.handling.storageTemperatureC) : '',
    lightSensitive: Boolean(summary.outputSpec.handling?.lightSensitive),
    maxFreezeThawCycles: summary.outputSpec.handling?.maxFreezeThawCycles !== undefined ? String(summary.outputSpec.handling.maxFreezeThawCycles) : '',
    stabilityNote: summary.outputSpec.handling?.stabilityNote || '',
    notes: '',
    outputMaterialMolecularWeight: '',
    outputSolventRef: summary.outputSpec.solventRefId
      ? {
          kind: 'record',
          id: summary.outputSpec.solventRefId,
          type: 'material',
          label: summary.outputSpec.solventLabel || summary.outputSpec.solventRefId,
        }
      : null,
    ingredients,
    preferredSources: summary.inputRoles.length
      ? summary.inputRoles.map((role) => ({
          vendor: preferredSourcesByRole.get(role.roleId)?.vendor || '',
          catalogNumber: preferredSourcesByRole.get(role.roleId)?.catalogNumber || '',
        }))
      : emptyDraft().preferredSources,
    steps: summary.steps.length
      ? summary.steps.map((step) => ({ instruction: step.instruction }))
      : emptyDraft().steps,
  }
}

function buildPrepareDraft(summary: FormulationSummary, inventory: MaterialInventoryItem[]): PrepareDraft {
  const bindings: Record<string, string> = {}
  for (const role of summary.inputRoles) {
    const matching = inventory.find((item) => {
      if (item.status && item.status !== 'available') return false
      if (role.allowedMaterialSpecRefs.length > 0) {
        return role.allowedMaterialSpecRefs.some((ref) => ref.id === item.materialSpec.id)
      }
      if (role.materialRef?.id) {
        return item.materialSpec.materialId === role.materialRef.id
      }
      return true
    })
    if (matching) bindings[role.roleId] = matching.aliquotId
  }
  return {
    bindings,
    outputMode: 'batch-and-split',
    outputCount: '1',
    outputVolumeValue: summary.scale?.defaultBatchVolume
      ? String(summary.scale.defaultBatchVolume.value)
      : summary.batch?.defaultOutputQuantity
        ? String(summary.batch.defaultOutputQuantity.value)
        : '100',
    outputVolumeUnit: summary.scale?.defaultBatchVolume?.unit || summary.batch?.defaultOutputQuantity?.unit || 'uL',
    scale: '1',
    containerType: '',
    storageLocation: '',
    barcodePrefix: '',
    notes: '',
  }
}

function formatQuantity(value?: QuantityValue): string {
  if (!value) return 'Not set'
  return `${value.value} ${value.unit}`
}

function formatDate(value?: string): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function MaterialBadge({
  item,
  onUse,
}: {
  item: MaterialInventoryItem
  onUse: (aliquotIds: string[]) => void
}) {
  return (
    <div className="formulations-instance-card">
      <div className="formulations-instance-card__head">
        <div>
          <div className="formulations-instance-card__name">{item.name}</div>
          <div className="formulations-instance-card__meta">{item.aliquotId}</div>
        </div>
        <span className={`formulations-status formulations-status--${item.status || 'available'}`}>
          {item.status || 'available'}
        </span>
      </div>
      <div className="formulations-instance-card__body">
        <span>{item.materialSpec.name}</span>
        <span>{formatQuantity(item.volume)}</span>
        <span>{item.storage?.location || 'Unassigned storage'}</span>
      </div>
      <button className="btn btn-secondary" onClick={() => onUse([item.aliquotId])}>
        Use In Event Graph
      </button>
    </div>
  )
}

export function FormulationsPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [formulations, setFormulations] = useState<FormulationSummary[]>([])
  const [inventory, setInventory] = useState<MaterialInventoryItem[]>([])

  const [search, setSearch] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [inventorySearch, setInventorySearch] = useState('')
  const [selectedInventoryStatus, setSelectedInventoryStatus] = useState('available')

  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<FormulationDraft>(emptyDraft())
  const [outputMaterialMolecularWeightNote, setOutputMaterialMolecularWeightNote] = useState<string | null>(null)
  const [ingredientFocusTarget, setIngredientFocusTarget] = useState<{ index: number; key: number } | null>(null)
  const [stepFocusTarget, setStepFocusTarget] = useState<{ index: number; key: number } | null>(null)
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([])
  const [copilotResult, setCopilotResult] = useState<FormulationCopilotResponse | null>(null)

  // AI panel
  const aiContext = useMemo((): AiContext => ({
    surface: 'formulations',
    summary: `Formulations page${createOpen ? ', creating new formulation' : ''}`,
    surfaceContext: {
      formulationCount: formulations.length,
      isCreating: createOpen,
      draftName: createOpen ? createDraft.recipeName : null,
      ingredientCount: createOpen ? createDraft.ingredients.length : null,
    },
  }), [formulations.length, createOpen, createDraft.recipeName, createDraft.ingredients.length])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  const [prepareTarget, setPrepareTarget] = useState<FormulationSummary | null>(null)
  const [prepareDraft, setPrepareDraft] = useState<PrepareDraft | null>(null)
  const [lastPrepared, setLastPrepared] = useState<ExecuteRecipeResponse | null>(null)
  const [createPreparedFromSummary, setCreatePreparedFromSummary] = useState<FormulationSummary | null>(null)
  const [splitTarget, setSplitTarget] = useState<{ id: string; name: string } | null>(null)

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [summary, inventoryItems] = await Promise.all([
        apiClient.getFormulationsSummary({
          q: search || undefined,
          hasAvailableInstances: availableOnly ? true : undefined,
        }),
        apiClient.getMaterialInventory({
          status: selectedInventoryStatus || undefined,
          q: inventorySearch || undefined,
          limit: 200,
        }),
      ])
      setFormulations(summary)
      setInventory(inventoryItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load formulations workspace')
    } finally {
      setLoading(false)
    }
  }, [availableOnly, inventorySearch, search, selectedInventoryStatus])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const filteredInventory = useMemo(() => inventory, [inventory])

  const availableInventoryByRecipe = useMemo(() => {
    const grouped = new Map<string, MaterialInventoryItem[]>()
    for (const item of inventory) {
      if (item.recipe?.id) {
        const list = grouped.get(item.recipe.id) || []
        list.push(item)
        grouped.set(item.recipe.id, list)
      }
    }
    return grouped
  }, [inventory])

  const openCreate = useCallback((draft?: FormulationDraft) => {
    setCreateDraft(draft || emptyDraft())
    setOutputMaterialMolecularWeightNote(null)
    setIngredientFocusTarget(null)
    setStepFocusTarget(null)
    setCopilotPrompt('')
    setCopilotMessages([])
    setCopilotResult(null)
    setCreateOpen(true)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('create') !== '1') return
    const ontologyId = params.get('prefillOntologyId')
    const ontologyNamespace = params.get('prefillOntologyNamespace')
    const ontologyLabel = params.get('prefillOntologyLabel') || params.get('prefillName')
    if (!ontologyId || !ontologyNamespace || !ontologyLabel) return
    const ontologyRef: Ref = {
      kind: 'ontology',
      id: ontologyId,
      namespace: ontologyNamespace,
      label: ontologyLabel,
      ...(params.get('prefillOntologyUri') ? { uri: params.get('prefillOntologyUri') || undefined } : {}),
    }
    openCreate({
      recipeName: params.get('prefillName') || ontologyLabel,
      representsMaterial: ontologyRef,
      totalProducedValue: '10',
      totalProducedUnit: 'mL',
      storageTemperatureC: '',
      lightSensitive: false,
      maxFreezeThawCycles: '',
      stabilityNote: '',
      notes: '',
      outputMaterialMolecularWeight: '',
      outputSolventRef: null,
      ingredients: [{
        ref: null,
        roleType: 'solute',
        measureMode: 'target_concentration',
        sourceState: 'solid',
        stockConcentrationValue: '',
        stockConcentrationUnit: 'mM',
        targetContributionValue: '',
        targetContributionUnit: 'mM',
        requiredAmountValue: '',
        requiredAmountUnit: 'mg',
        molecularWeight: '',
        compositionSnapshot: [],
      }],
      preferredSources: [{ vendor: '', catalogNumber: '' }],
      steps: [{ instruction: 'Describe how this material is prepared in your lab.' }],
    })
    navigate('/formulations', { replace: true })
  }, [location.search, navigate, openCreate])

  useEffect(() => {
    if (!createOpen) return
    const ref = createDraft.representsMaterial
    if (!ref || ref.kind !== 'ontology' || inferDomainFromNamespace(ref.namespace) !== 'chemical') {
      setOutputMaterialMolecularWeightNote(null)
      return
    }
    if (createDraft.outputMaterialMolecularWeight.trim()) return
    let cancelled = false
    setOutputMaterialMolecularWeightNote('Looking up molecular weight…')
    apiClient.resolveOntologyMolecularWeight({
      namespace: ref.namespace,
      id: ref.id,
      label: ref.label,
      uri: ref.uri,
    }).then((result) => {
      if (cancelled) return
      setOutputMaterialMolecularWeightNote(formatMolecularWeightResolutionNote(result))
      if (result.resolved && result.molecularWeight) {
        const resolvedWeight = result.molecularWeight.value
        setCreateDraft((prev) => {
          if (
            prev.representsMaterial?.kind !== 'ontology'
            || prev.representsMaterial.id !== ref.id
            || prev.outputMaterialMolecularWeight.trim()
          ) {
            return prev
          }
          return {
            ...prev,
            outputMaterialMolecularWeight: formatResolvedMolecularWeightValue(resolvedWeight),
          }
        })
      }
    }).catch(() => {
      if (!cancelled) setOutputMaterialMolecularWeightNote('Could not resolve molecular weight automatically.')
    })
    return () => {
      cancelled = true
    }
  }, [
    createDraft.outputMaterialMolecularWeight,
    createDraft.representsMaterial,
    createOpen,
  ])

  const createComputation = useMemo(() => {
    const totalProduced = Number(createDraft.totalProducedValue)
    return computeFormulationComposition({
      ingredients: createDraft.ingredients
        .filter((ingredient): ingredient is IngredientDraft & { ref: Ref } => Boolean(ingredient.ref))
        .map((ingredient) => ({
          ref: ingredient.ref,
          roleType: ingredient.roleType,
          measureMode: ingredient.measureMode,
          sourceState: ingredient.sourceState,
          stockConcentration: concentrationFromIngredient(ingredient.stockConcentrationValue, ingredient.stockConcentrationUnit),
          targetContribution: concentrationFromIngredient(ingredient.targetContributionValue, ingredient.targetContributionUnit),
          requiredAmount: ingredient.requiredAmountValue.trim() && ingredient.requiredAmountUnit.trim() && Number.isFinite(Number(ingredient.requiredAmountValue))
            ? { value: Number(ingredient.requiredAmountValue), unit: ingredient.requiredAmountUnit.trim() }
            : undefined,
          molecularWeight: Number.isFinite(Number(ingredient.molecularWeight)) && Number(ingredient.molecularWeight) > 0
            ? { value: Number(ingredient.molecularWeight), unit: 'g/mol' as const }
            : undefined,
          compositionSnapshot: ingredient.compositionSnapshot,
        })),
      ...(Number.isFinite(totalProduced) && totalProduced > 0
        ? { totalOutputQuantity: { value: totalProduced, unit: createDraft.totalProducedUnit } }
        : {}),
    })
  }, [createDraft])

  const handleIngredientRefChange = useCallback(async (index: number, ref: Ref | null) => {
    setCreateDraft((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
        ? {
            ...entry,
            ref,
            sourceState: inferIngredientSourceState(ref),
            compositionSnapshot: ref ? entry.compositionSnapshot : [],
            stockConcentrationValue: ref ? entry.stockConcentrationValue : '',
            targetContributionValue: ref ? entry.targetContributionValue : '',
            molecularWeight: ref ? entry.molecularWeight : '',
          }
        : entry),
    }))

    if (!ref) return

    let nextSourceState = inferIngredientSourceState(ref)
    let nextCompositionSnapshot: CompositionEntryValue[] = []
    let nextStockConcentration: ConcentrationValue | undefined
    let nextMolecularWeight = ''

    try {
      const defaults = await resolveAddMaterialSourceDefaults(ref)
      nextCompositionSnapshot = defaults.compositionSnapshot ?? []
      nextStockConcentration = defaults.concentration

      if (ref.kind === 'record' && ref.type === 'material') {
        const record = await apiClient.getRecord(ref.id)
        const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
          ? record.payload as Record<string, unknown>
          : null
        const domain = typeof payload?.domain === 'string' ? payload.domain : undefined
        nextSourceState = inferIngredientSourceState(ref, domain)
        if (
          payload?.molecular_weight
          && typeof payload.molecular_weight === 'object'
          && !Array.isArray(payload.molecular_weight)
          && typeof (payload.molecular_weight as { value?: unknown }).value === 'number'
          && (payload.molecular_weight as { unit?: unknown }).unit === 'g/mol'
        ) {
          nextMolecularWeight = String((payload.molecular_weight as { value: number }).value)
        }
      } else if (ref.kind === 'ontology' && inferDomainFromNamespace(ref.namespace) === 'chemical') {
        const resolved = await apiClient.resolveOntologyMolecularWeight({
          namespace: ref.namespace,
          id: ref.id,
          label: ref.label,
          uri: ref.uri,
        })
        if (resolved.resolved && resolved.molecularWeight) {
          nextMolecularWeight = formatResolvedMolecularWeightValue(resolved.molecularWeight.value)
        }
        nextSourceState = 'solid'
      }
    } catch {
      // keep authoring usable if defaults cannot be resolved
    }

    setCreateDraft((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((entry, ingredientIndex) => {
        if (ingredientIndex !== index || entry.ref?.id !== ref.id || entry.ref?.kind !== ref.kind) return entry
        return {
          ...entry,
          ref,
          sourceState: nextSourceState,
          stockConcentrationValue: entry.stockConcentrationValue || (nextStockConcentration ? String(nextStockConcentration.value) : ''),
          stockConcentrationUnit: entry.stockConcentrationValue ? entry.stockConcentrationUnit : (nextStockConcentration?.unit || entry.stockConcentrationUnit),
          molecularWeight: entry.molecularWeight || nextMolecularWeight,
          compositionSnapshot: nextCompositionSnapshot.length > 0 ? nextCompositionSnapshot : entry.compositionSnapshot,
        }
      }),
    }))
  }, [])

  const runCopilot = useCallback(async (
    mode: 'draft' | 'explain' | 'suggest' | 'flatten',
  ) => {
    setCopilotBusy(true)
    setError(null)
    try {
      let result: FormulationCopilotResponse
      if (mode === 'draft') {
        const prompt = copilotPrompt.trim()
        if (!prompt) {
          setError('Copilot prompt is required')
          return
        }
        setCopilotMessages((prev) => [...prev, { role: 'user', text: prompt }])
        result = await apiClient.draftFormulationFromText({ prompt })
      } else if (mode === 'explain') {
        result = await apiClient.explainFormulationDraft({ draft: draftToCopilotRequest(createDraft) })
      } else if (mode === 'suggest') {
        result = await apiClient.suggestMissingFormulationFields({ draft: draftToCopilotRequest(createDraft) })
      } else {
        result = await apiClient.flattenFormulationComposition({ draft: draftToCopilotRequest(createDraft) })
      }
      setCopilotResult(result)
      setCopilotMessages((prev) => [...prev, { role: 'assistant', text: summarizeCopilotResponse(result) }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copilot request failed')
    } finally {
      setCopilotBusy(false)
    }
  }, [copilotPrompt, createDraft])

  const applyCopilotSuggestions = useCallback(() => {
    if (!copilotResult?.draftPatch) return
    setCreateDraft((prev) => applyCopilotPatchToDraft(prev, copilotResult.draftPatch))
  }, [copilotResult])

  const openPrepare = useCallback((summary: FormulationSummary) => {
    const recipeInventory = availableInventoryByRecipe.get(summary.recipeId) || inventory
    setPrepareTarget(summary)
    setPrepareDraft(buildPrepareDraft(summary, recipeInventory))
  }, [availableInventoryByRecipe, inventory])

  const jumpToEditor = useCallback((aliquotIds: string[], recipeId?: string) => {
    if (aliquotIds.length === 0) return
    const params = new URLSearchParams()
    params.set('new', '1')
    params.set('source', 'formulations')
    params.set('prefillAliquotIds', aliquotIds.join(','))
    if (recipeId) params.set('recipeId', recipeId)
    navigate(`/labware-editor?${params.toString()}`)
  }, [navigate])

  const handleCreateFormulation = useCallback(async () => {
    const trimmedRecipeName = createDraft.recipeName.trim()
    const totalProduced = Number(createDraft.totalProducedValue)
    const filledIngredientEntries = createDraft.ingredients
      .map((ingredient, originalIndex) => ({ ingredient, originalIndex }))
      .filter((entry) => entry.ingredient.ref)
    const filledIngredients = filledIngredientEntries.map((entry) => entry.ingredient)
    const ingredientRoleIds = buildIngredientRoleIds(filledIngredients)
    const compiledSteps = createDraft.steps
      .map((step, index) => ({
        order: index + 1,
        instruction: step.instruction.trim(),
      }))
      .filter((step) => step.instruction)

    if (!trimmedRecipeName) {
      setError('Recipe name is required')
      return
    }
    if (filledIngredients.length === 0) {
      setError('Add at least one ingredient')
      return
    }
    if (!Number.isFinite(totalProduced) || totalProduced <= 0) {
      setError('Total quantity produced is required')
      return
    }
    if (compiledSteps.length === 0) {
      setError('Add at least one protocol step')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const computedIngredients = createComputation.ingredients
      const outputComposition = buildOutputComposition(createDraft)
      const compiledInputRoles = filledIngredients.map((ingredient, index) => {
        const computedIngredient = computedIngredients[index]
        const stockConcentration = concentrationFromIngredient(ingredient.stockConcentrationValue, ingredient.stockConcentrationUnit)
        const targetContribution = concentrationFromIngredient(ingredient.targetContributionValue, ingredient.targetContributionUnit)
        const manualRequiredAmount = ingredient.requiredAmountValue.trim() && ingredient.requiredAmountUnit.trim() && Number.isFinite(Number(ingredient.requiredAmountValue))
          ? { value: Number(ingredient.requiredAmountValue), unit: ingredient.requiredAmountUnit.trim() }
          : undefined
        const resolvedAmount = manualRequiredAmount || computedIngredient?.resolvedAmount
        return {
          roleId: ingredientRoleIds[index],
          roleType: ingredient.roleType,
          required: true,
          measureMode: ingredient.measureMode,
          sourceState: ingredient.sourceState,
          ...(ingredient.ref?.kind === 'record' && ingredient.ref.type === 'material'
            ? { materialRefId: ingredient.ref.id }
            : {}),
          ...(ingredient.ref?.kind === 'record' && ingredient.ref.type === 'material-spec'
            ? { allowedMaterialSpecRefIds: [ingredient.ref.id] }
            : {}),
          ...(ingredient.ref?.kind === 'record' && ingredient.ref.type === 'vendor-product'
            ? { vendorProductRefId: ingredient.ref.id }
            : {}),
          ...(stockConcentration ? { stockConcentration } : {}),
          ...(targetContribution ? { targetContribution } : {}),
          ...(resolvedAmount ? { requiredAmount: resolvedAmount } : {}),
          ...(Number.isFinite(Number(ingredient.molecularWeight)) && Number(ingredient.molecularWeight) > 0
            ? {
                molecularWeight: {
                  value: Number(ingredient.molecularWeight),
                  unit: 'g/mol' as const,
                },
              }
            : {}),
          ...(ingredient.compositionSnapshot.length > 0 ? { compositionSnapshot: ingredient.compositionSnapshot } : {}),
          ...(resolvedAmount
            ? { quantity: { value: resolvedAmount.value, unit: resolvedAmount.unit } }
            : {}),
        }
      })
      const newMaterialPayload = (() => {
        if (!createDraft.representsMaterial) return undefined
        if (createDraft.representsMaterial.kind !== 'ontology') return undefined
        return {
          id: generateMaterialId(createDraft.representsMaterial.label || createDraft.representsMaterial.id),
          name: createDraft.representsMaterial.label || createDraft.representsMaterial.id,
          domain: inferDomainFromNamespace(createDraft.representsMaterial.namespace),
          ...(Number.isFinite(Number(createDraft.outputMaterialMolecularWeight)) && Number(createDraft.outputMaterialMolecularWeight) > 0
            ? {
                molecularWeight: {
                  value: Number(createDraft.outputMaterialMolecularWeight),
                  unit: 'g/mol' as const,
                },
              }
            : {}),
          classRefs: [{
            kind: createDraft.representsMaterial.kind,
            id: createDraft.representsMaterial.id,
            namespace: createDraft.representsMaterial.namespace,
            label: createDraft.representsMaterial.label,
            ...(createDraft.representsMaterial.uri ? { uri: createDraft.representsMaterial.uri } : {}),
          }],
        }
      })()
      const payload: CreateFormulationRequest = {
        ...(newMaterialPayload ? { material: newMaterialPayload } : {}),
        outputSpec: {
          name: trimmedRecipeName,
          ...(getPrimaryDeclaredConcentration(outputComposition)
            ? { concentration: getPrimaryDeclaredConcentration(outputComposition) }
            : {}),
          ...(createDraft.outputSolventRef ? { solventRef: createDraft.outputSolventRef } : {}),
          ...(outputComposition.length > 0 ? { composition: outputComposition } : {}),
          ...(createDraft.representsMaterial?.kind === 'record' && createDraft.representsMaterial.type === 'material'
            ? { materialRefId: createDraft.representsMaterial.id }
            : {}),
          ...(createDraft.notes.trim() ? { notes: createDraft.notes.trim() } : {}),
          handling: {
            ...(createDraft.storageTemperatureC.trim() && Number.isFinite(Number(createDraft.storageTemperatureC))
              ? { storageTemperatureC: Number(createDraft.storageTemperatureC) }
              : {}),
            ...(createDraft.lightSensitive ? { lightSensitive: true } : {}),
            ...(createDraft.maxFreezeThawCycles.trim() && Number.isFinite(Number(createDraft.maxFreezeThawCycles))
              ? { maxFreezeThawCycles: Number(createDraft.maxFreezeThawCycles) }
              : {}),
            ...(createDraft.stabilityNote.trim() ? { stabilityNote: createDraft.stabilityNote.trim() } : {}),
          },
        },
        recipe: {
          name: trimmedRecipeName,
          inputRoles: compiledInputRoles,
          batch: {
            defaultOutputQuantity: {
              value: totalProduced,
              unit: createDraft.totalProducedUnit,
            },
          },
          scale: {
            defaultBatchVolume: {
              value: totalProduced,
              unit: createDraft.totalProducedUnit,
            },
          },
          preferredSources: filledIngredientEntries
            .map(({ ingredient, originalIndex }, index) => ({
              roleId: ingredientRoleIds[index],
              ...(createDraft.preferredSources[originalIndex]?.vendor.trim()
                ? { vendor: createDraft.preferredSources[originalIndex].vendor.trim() }
                : {}),
              ...(createDraft.preferredSources[originalIndex]?.catalogNumber.trim()
                ? { catalogNumber: createDraft.preferredSources[originalIndex].catalogNumber.trim() }
                : {}),
              ...(ingredient.ref?.kind === 'record' && ingredient.ref.type === 'material'
                ? { materialRefId: ingredient.ref.id }
                : {}),
              ...(ingredient.ref?.kind === 'record' && ingredient.ref.type === 'material-spec'
                ? { materialSpecRefId: ingredient.ref.id }
                : {}),
              ...(ingredient.ref?.kind === 'record' && ingredient.ref.type === 'vendor-product'
                ? { vendorProductRefId: ingredient.ref.id }
                : {}),
            }))
            .filter((source) => source.vendor || source.catalogNumber || source.materialRefId || source.materialSpecRefId || source.vendorProductRefId),
          steps: compiledSteps,
        },
      }

      const result = await apiClient.createFormulation(payload)
      setNotice(`Created formulation ${result.recipeId}`)
      setCreateOpen(false)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create formulation')
    } finally {
      setSaving(false)
    }
  }, [createComputation.ingredients, createDraft, refreshAll])

  const handleAddIngredient = useCallback(() => {
    const nextIndex = createDraft.ingredients.length
    setIngredientFocusTarget({ index: nextIndex, key: Date.now() })
    setCreateDraft((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          ref: null,
          roleType: 'solute',
          measureMode: 'target_concentration',
          sourceState: 'solid',
          stockConcentrationValue: '',
          stockConcentrationUnit: 'mM',
          targetContributionValue: '',
          targetContributionUnit: 'mM',
          requiredAmountValue: '',
          requiredAmountUnit: 'mg',
          molecularWeight: '',
          compositionSnapshot: [],
        },
      ],
      preferredSources: [
        ...prev.preferredSources,
        { vendor: '', catalogNumber: '' },
      ],
    }))
  }, [createDraft.ingredients.length])

  const handleAddStep = useCallback(() => {
    const nextIndex = createDraft.steps.length
    setStepFocusTarget({ index: nextIndex, key: Date.now() })
    setCreateDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { instruction: '' }],
    }))
  }, [createDraft.steps.length])

  const handlePrepareRecipe = useCallback(async () => {
    if (!prepareTarget || !prepareDraft) return
    setPreparing(true)
    setError(null)
    try {
      const result = await apiClient.executeRecipe(prepareTarget.recipeId, {
        scale: Number(prepareDraft.scale || '1'),
        outputCount: Number(prepareDraft.outputCount || '1'),
        outputMode: prepareDraft.outputMode,
        outputVolume: {
          value: Number(prepareDraft.outputVolumeValue || '100'),
          unit: prepareDraft.outputVolumeUnit || 'uL',
        },
        bindings: Object.fromEntries(
          Object.entries(prepareDraft.bindings)
            .filter(([, aliquotId]) => aliquotId)
            .map(([roleId, aliquotId]) => [roleId, { aliquotId }])
        ),
        outputMetadata: {
          ...(prepareDraft.containerType.trim() ? { containerType: prepareDraft.containerType.trim() } : {}),
          ...(prepareDraft.storageLocation.trim() ? { storageLocation: prepareDraft.storageLocation.trim() } : {}),
          ...(prepareDraft.barcodePrefix.trim() ? { barcodePrefix: prepareDraft.barcodePrefix.trim() } : {}),
        },
        ...(prepareDraft.notes.trim() ? { notes: prepareDraft.notes.trim() } : {}),
      })
      setLastPrepared(result)
      setNotice(
        prepareDraft.outputMode === 'batch'
          ? `Prepared parent batch ${result.materialInstanceId} from ${result.recipeName}`
          : `Prepared batch ${result.materialInstanceId} and ${result.createdAliquots.length} aliquot(s) from ${result.recipeName}`,
      )
      setPrepareTarget(null)
      setPrepareDraft(null)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare batch')
    } finally {
      setPreparing(false)
    }
  }, [prepareDraft, prepareTarget, refreshAll])

  return (
    <div className="formulations-page">
      <section className="formulations-hero">
        <div>
          <p className="formulations-eyebrow">Formulations Workspace</p>
          <h1>Recipe cards that mint material instances for the event graph editor.</h1>
          <p className="formulations-hero__copy">
            Define reusable output specs, capture recipe inputs, prepare physical instances, and hand them straight into the event graph editor without dropping down into raw record CRUD.
          </p>
        </div>
        <div className="formulations-hero__actions">
          <button className="btn btn-primary" onClick={() => openCreate()}>
            New Formulation
          </button>
          <button className="btn btn-secondary" onClick={() => refreshAll()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="formulations-toolbar">
        <label className="formulations-field">
          <span>Search recipes</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Clofibrate, DMSO, stock..." />
        </label>
        <label className="formulations-checkbox">
          <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
          <span>Only show formulations with available instances</span>
        </label>
        <label className="formulations-field">
          <span>Inventory search</span>
          <input value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Aliquot ID, storage, recipe..." />
        </label>
        <label className="formulations-field formulations-field--compact">
          <span>Status</span>
          <select value={selectedInventoryStatus} onChange={(e) => setSelectedInventoryStatus(e.target.value)}>
            <option value="available">available</option>
            <option value="reserved">reserved</option>
            <option value="consumed">consumed</option>
            <option value="expired">expired</option>
            <option value="discarded">discarded</option>
          </select>
        </label>
      </section>

      {error && <div className="formulations-banner formulations-banner--error">{error}</div>}
      {notice && <div className="formulations-banner formulations-banner--notice">{notice}</div>}
      {loading && <div className="loading">Loading formulations workspace…</div>}

      {lastPrepared && (
        <section className="formulations-success">
          <div>
            <p className="formulations-success__eyebrow">Preparation Complete</p>
            <h2>{lastPrepared.recipeName}</h2>
            <p>
              Created parent batch <code>{lastPrepared.materialInstanceId}</code>{lastPrepared.createdAliquots.length > 0 ? <> and {lastPrepared.createdAliquots.length} aliquot(s)</> : null}. Provenance event graph: <code>{lastPrepared.preparationEventGraphId}</code>
            </p>
          </div>
          <div className="formulations-success__actions">
            {lastPrepared.createdAliquotIds.length > 0 ? (
              <button
                className="btn btn-primary"
                onClick={() => jumpToEditor(lastPrepared.createdAliquotIds, lastPrepared.recipeId)}
              >
                Use In Event Graph
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate('/materials')}>
                Open Materials
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setLastPrepared(null)}>
              Dismiss
            </button>
          </div>
        </section>
      )}

      <section className="formulations-library">
        <div className="formulations-section-head">
          <div>
            <p className="formulations-section-head__eyebrow">Library</p>
            <h2>Formulation Cards</h2>
          </div>
          <div className="formulations-section-head__meta">{formulations.length} recipe cards</div>
        </div>

        {formulations.length === 0 && !loading ? (
          <div className="empty-state">
            <h2>No formulations yet</h2>
            <p>Create the first recipe card to start minting material instances for downstream event work.</p>
            <button className="btn btn-primary" onClick={() => openCreate()}>
              Create First Formulation
            </button>
          </div>
        ) : (
          <div className="formulations-grid">
            {formulations.map((summary) => (
              <article key={summary.recipeId} className="formulation-card">
                <div className="formulation-card__head">
                  <div>
                    <h3>{summary.recipeName}</h3>
                    {(summary.outputSpec.concentration || summary.outputSpec.solventLabel) && (
                      <p className="formulation-card__target">
                        {[formatConcentration(summary.outputSpec.concentration), summary.outputSpec.solventLabel ? `in ${summary.outputSpec.solventLabel}` : null].filter(Boolean).join(' ') || 'Declared stock details'}
                      </p>
                    )}
                    {summary.outputSpec.composition?.length ? (
                      <p className="formulation-card__target">
                        {formatCompositionSummary(summary.outputSpec.composition, 4)}
                      </p>
                    ) : null}
                  </div>
                  <div className="formulation-card__availability">
                    <span className="formulations-status formulations-status--available">
                      {summary.inventory.availableCount} available
                    </span>
                  </div>
                </div>

                <div className="formulation-card__section">
                  <span className="formulation-card__label">Ingredients</span>
                  <div className="formulation-ingredient-table" role="table" aria-label={`${summary.recipeName} ingredients`}>
                    <div className="formulation-ingredient-table__head" role="row">
                      <span role="columnheader">Ingredient</span>
                      <span role="columnheader">Amount</span>
                      <span role="columnheader">Units</span>
                    </div>
                    {summary.inputRoles.map((role) => {
                      const ingredient = ingredientDisplayParts(role)
                      return (
                        <div key={role.roleId} className="formulation-ingredient-table__row" role="row">
                          <span role="cell">{ingredient.name}</span>
                          <span role="cell">{ingredient.quantity || '—'}</span>
                          <span role="cell">{ingredient.unit || '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="formulation-card__section">
                  <span className="formulation-card__label">Procedure</span>
                  <ol className="formulation-step-list">
                    {summary.steps.slice(0, 3).map((step) => (
                      <li key={`${summary.recipeId}-${step.order}`}>{step.instruction}</li>
                    ))}
                  </ol>
                </div>

                <div className="formulation-card__footer">
                  <div className="formulation-card__footer-meta">
                    <span>Last prepared: {formatDate(summary.inventory.lastPreparedAt)}</span>
                    <span>Total available: {formatQuantity(summary.inventory.totalAvailableVolume)}</span>
                  </div>
                  <div className="formulation-card__actions">
                    <button className="btn btn-primary" onClick={() => openPrepare(summary)}>
                      Prepare
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCreatePreparedFromSummary(summary)}
                    >
                      Create Prepared Material
                    </button>
                    <button className="btn btn-secondary" onClick={() => openCreate(draftFromSummary(summary))}>
                      Duplicate
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={summary.inventory.recentAliquotIds.length === 0}
                      onClick={() => jumpToEditor(summary.inventory.recentAliquotIds, summary.recipeId)}
                    >
                      Use In Event Graph
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="formulations-inventory">
        <div className="formulations-section-head">
          <div>
            <p className="formulations-section-head__eyebrow">Inventory</p>
            <h2>Prepared Material Instances</h2>
          </div>
          <div className="formulations-section-head__meta">{filteredInventory.length} rows</div>
        </div>

        <div className="formulations-inventory-grid">
          {filteredInventory.slice(0, 6).map((item) => (
            <MaterialBadge key={item.aliquotId} item={item} onUse={jumpToEditor} />
          ))}
        </div>

        <div className="formulations-table-wrap">
          <table className="formulations-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Spec</th>
                <th>Recipe</th>
                <th>Volume</th>
                <th>Storage</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <tr key={item.aliquotId}>
                  <td>
                    <div className="formulations-table__strong">{item.name}</div>
                    <span className={`formulations-status formulations-status--${item.status || 'available'}`}>
                      {item.status || 'available'}
                    </span>
                  </td>
                  <td><code>{item.aliquotId}</code></td>
                  <td>{item.materialSpec.name}</td>
                  <td>{item.recipe?.name || 'Manual / legacy'}</td>
                  <td>{formatQuantity(item.volume)}</td>
                  <td>{item.storage?.location || 'Unassigned'}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => jumpToEditor([item.aliquotId], item.recipe?.id)}>
                      Use
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen && (
        <div className="formulations-modal-backdrop" onClick={() => !saving && setCreateOpen(false)}>
          <div className="formulations-modal" onClick={(e) => e.stopPropagation()}>
            <div className="formulations-modal__head">
              <div>
                <p className="formulations-section-head__eyebrow">Create Formulation</p>
                <h2>Author a reusable recipe card</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
                Close
              </button>
            </div>

            <div className="formulations-modal__body">
              <section className="formulations-form-section">
                <h3>Recipe</h3>
                <div className="formulations-recipe-name">
                  <label className="formulations-field">
                    <span>Recipe name</span>
                    <input
                      value={createDraft.recipeName}
                      onChange={(e) => setCreateDraft((prev) => ({ ...prev, recipeName: e.target.value }))}
                      placeholder="1 mM Clofibrate in DMSO"
                    />
                  </label>
                  <label className="formulations-field">
                    <span>Represents material (optional)</span>
                    <MaterialPicker
                      value={createDraft.representsMaterial}
                      onChange={(ref) => {
                        setOutputMaterialMolecularWeightNote(null)
                        setCreateDraft((prev) => ({
                          ...prev,
                          representsMaterial: ref,
                          outputMaterialMolecularWeight: ref?.kind === 'ontology' ? '' : '',
                        }))
                      }}
                      placeholder="Fenofibrate, PBS, HepG2..."
                      localKinds={['material']}
                      allowCreateLocal
                    />
                  </label>
                  <p className="formulations-form-copy">
                    Use this when the recipe is a prepared form of a known material concept. Leave blank for mixed formulations.
                  </p>
                </div>
                <div className="formulations-ingredients-grid" style={{ marginTop: '0.75rem' }}>
                  <label className="formulations-field">
                    <span>Total quantity produced</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={createDraft.totalProducedValue}
                        onChange={(e) => setCreateDraft((prev) => ({ ...prev, totalProducedValue: e.target.value }))}
                        placeholder="10"
                      />
                      <select
                        value={createDraft.totalProducedUnit}
                        onChange={(e) => setCreateDraft((prev) => ({ ...prev, totalProducedUnit: e.target.value }))}
                      >
                        {OUTPUT_QUANTITY_UNITS.map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </label>
                  {createDraft.representsMaterial?.kind === 'ontology' && (
                    <label className="formulations-field">
                      <span>Molecular weight</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: '0.5rem' }}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={createDraft.outputMaterialMolecularWeight}
                          onChange={(e) => setCreateDraft((prev) => ({ ...prev, outputMaterialMolecularWeight: e.target.value }))}
                          placeholder="270.24"
                        />
                        <input value="g/mol" readOnly tabIndex={-1} />
                      </div>
                      {outputMaterialMolecularWeightNote && (
                        <span className="text-[11px] text-gray-500">{outputMaterialMolecularWeightNote}</span>
                      )}
                    </label>
                  )}
                  <label className="formulations-field">
                    <span>Storage temperature (optional)</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                      <input
                        value={createDraft.storageTemperatureC}
                        onChange={(e) => setCreateDraft((prev) => ({ ...prev, storageTemperatureC: e.target.value }))}
                        placeholder="-20"
                      />
                      <input value="C" readOnly tabIndex={-1} />
                    </div>
                  </label>
                  <label className="formulations-field">
                    <span>Solvent (optional)</span>
                    <MaterialPicker
                      value={createDraft.outputSolventRef}
                      onChange={(ref) => setCreateDraft((prev) => ({ ...prev, outputSolventRef: ref }))}
                      placeholder="DMSO, PBS, water..."
                      localKinds={['material', 'material-spec']}
                      primaryKinds={['material-spec']}
                      preparedKinds={[]}
                      secondaryKinds={['material']}
                    />
                  </label>
                  <label className="formulations-field">
                    <span>Stability / storage note</span>
                    <input
                      value={createDraft.stabilityNote}
                      onChange={(e) => setCreateDraft((prev) => ({ ...prev, stabilityNote: e.target.value }))}
                      placeholder="Protect from light, stable 1 month at 4 C..."
                    />
                  </label>
                  <label className="formulations-field" style={{ justifyContent: 'end' }}>
                    <span>Light sensitive</span>
                    <input
                      type="checkbox"
                      checked={createDraft.lightSensitive}
                      onChange={(e) => setCreateDraft((prev) => ({ ...prev, lightSensitive: e.target.checked }))}
                    />
                  </label>
                </div>
              </section>

              <section className="formulations-form-section">
                <div className="formulations-form-section__head">
                  <h3>AI Copilot</h3>
                </div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <textarea
                    rows={3}
                    value={copilotPrompt}
                    onChange={(e) => setCopilotPrompt(e.target.value)}
                    placeholder="Describe a formulation, e.g. make 10 mL of 1 mM clofibrate in DMSO"
                  />
                  <div className="formulations-form-actions">
                    <button className="btn btn-secondary" type="button" disabled={copilotBusy} onClick={() => void runCopilot('draft')}>
                      Draft From Text
                    </button>
                    <button className="btn btn-secondary" type="button" disabled={copilotBusy} onClick={() => void runCopilot('suggest')}>
                      Suggest Missing Fields
                    </button>
                    <button className="btn btn-secondary" type="button" disabled={copilotBusy} onClick={() => void runCopilot('explain')}>
                      Explain Calculations
                    </button>
                    <button className="btn btn-secondary" type="button" disabled={copilotBusy} onClick={() => void runCopilot('flatten')}>
                      Flatten Composition
                    </button>
                    <button className="btn btn-secondary" type="button" disabled={copilotBusy || !copilotResult} onClick={applyCopilotSuggestions}>
                      Apply Suggestions
                    </button>
                  </div>
                  {copilotMessages.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {copilotMessages.slice(-4).map((message, index) => (
                        <div
                          key={`copilot-message-${index}`}
                          style={{
                            padding: '0.6rem 0.75rem',
                            borderRadius: '8px',
                            background: message.role === 'assistant' ? '#f3f4f6' : '#eef2ff',
                            color: '#1f2937',
                            fontSize: '0.9rem',
                          }}
                        >
                          <strong style={{ marginRight: '0.5rem' }}>{message.role === 'assistant' ? 'AI' : 'You'}</strong>
                          {message.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {copilotResult && (
                    <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.9rem', color: '#374151' }}>
                      {copilotResult.assumptions.length > 0 && (
                        <div>Assumptions: {copilotResult.assumptions.join(' | ')}</div>
                      )}
                      {copilotResult.warnings.length > 0 && (
                        <div>Warnings: {copilotResult.warnings.join(' | ')}</div>
                      )}
                      {copilotResult.outputComposition.length > 0 && (
                        <div>Proposed composition: {formatCompositionSummary(copilotResult.outputComposition, 5)}</div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="formulations-form-section">
                <div className="formulations-form-section__head">
                  <h3>Ingredients</h3>
                </div>
                <div className="formulations-ingredients-grid">
                  <div className="formulations-ingredients-head">
                    <span>Ingredient</span>
                    <span>Concentration</span>
                    <span>Amount</span>
                    <span />
                  </div>
                  {createDraft.ingredients.map((ingredient, index) => {
                    const computedIndex = ingredient.ref ? createDraft.ingredients.slice(0, index + 1).filter((entry) => entry.ref).length - 1 : -1
                    const resolvedAmount = computedIndex >= 0 ? createComputation.ingredients[computedIndex]?.resolvedAmount : undefined
                    return (
                      <div key={`ingredient-${index}`} className="formulations-ingredient-row">
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <MaterialPicker
                            value={ingredient.ref}
                            onChange={(ref) => {
                              void handleIngredientRefChange(index, ref)
                            }}
                            placeholder="Search local materials, formulations, or ontologies..."
                            localKinds={['material', 'material-spec', 'vendor-product']}
                            primaryKinds={['material-spec', 'vendor-product']}
                            preparedKinds={[]}
                            secondaryKinds={['material']}
                            allowCreateLocal
                            focusKey={ingredientFocusTarget?.index === index ? ingredientFocusTarget.key : undefined}
                          />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <select
                              value={ingredient.roleType}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => (
                                  ingredientIndex === index
                                    ? { ...entry, roleType: e.target.value as RecipeRoleType }
                                    : entry
                                )),
                              }))}
                            >
                              {RECIPE_ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            <select
                              value={ingredient.sourceState}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, sourceState: e.target.value as IngredientSourceState }
                                  : entry),
                              }))}
                            >
                              {SOURCE_STATE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                            <input
                              value={ingredient.targetContributionValue}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, targetContributionValue: e.target.value }
                                  : entry),
                              }))}
                              placeholder="1"
                            />
                            <select
                              value={ingredient.targetContributionUnit}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, targetContributionUnit: e.target.value }
                                  : entry),
                              }))}
                            >
                              {CONCENTRATION_UNITS.map((unit) => (
                                <option key={unit.value} value={unit.value}>{unit.label}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                            <input
                              value={ingredient.stockConcentrationValue}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, stockConcentrationValue: e.target.value }
                                  : entry),
                              }))}
                              placeholder="Stock"
                            />
                            <select
                              value={ingredient.stockConcentrationUnit}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, stockConcentrationUnit: e.target.value }
                                  : entry),
                              }))}
                            >
                              {CONCENTRATION_UNITS.map((unit) => (
                                <option key={unit.value} value={unit.value}>{unit.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                            <input
                              value={ingredient.requiredAmountValue || (resolvedAmount ? String(resolvedAmount.value) : '')}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, requiredAmountValue: e.target.value }
                                  : entry),
                              }))}
                              placeholder="Auto"
                            />
                            <select
                              value={ingredient.requiredAmountUnit || resolvedAmount?.unit || 'mL'}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, requiredAmountUnit: e.target.value }
                                  : entry),
                              }))}
                            >
                              {ingredientUnitOptions(ingredient.requiredAmountUnit || resolvedAmount?.unit || '').map((unit) => (
                                <option key={unit} value={unit}>{unit}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                            <input
                              value={ingredient.molecularWeight}
                              onChange={(e) => setCreateDraft((prev) => ({
                                ...prev,
                                ingredients: prev.ingredients.map((entry, ingredientIndex) => ingredientIndex === index
                                  ? { ...entry, molecularWeight: e.target.value }
                                  : entry),
                              }))}
                              placeholder="MW"
                            />
                            <input value="g/mol" readOnly tabIndex={-1} />
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary formulations-ingredient-remove"
                          type="button"
                          disabled={createDraft.ingredients.length === 1}
                          onClick={() => setCreateDraft((prev) => ({
                            ...prev,
                            ingredients: prev.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
                            preferredSources: prev.preferredSources.filter((_, ingredientIndex) => ingredientIndex !== index),
                          }))}
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
                {createComputation.warnings.length > 0 && (
                  <p className="formulations-form-copy">
                    {createComputation.warnings[0]}
                  </p>
                )}
                {buildOutputComposition(createDraft).length > 0 && (
                  <p className="formulations-form-copy">
                    Output composition: {formatCompositionSummary(buildOutputComposition(createDraft), 5)}
                  </p>
                )}
                <div className="formulations-form-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleAddIngredient}
                  >
                    Add Ingredient
                  </button>
                </div>
              </section>

              <section className="formulations-form-section">
                <div className="formulations-form-section__head">
                  <h3>Preferred Sources</h3>
                </div>
                <div className="formulations-preferred-grid">
                  <div className="formulations-preferred-head">
                    <span>Ingredient</span>
                    <span>Preferred vendor</span>
                    <span>Catalog number</span>
                  </div>
                  {createDraft.ingredients.map((ingredient, index) => (
                    <div key={`preferred-source-${index}`} className="formulations-preferred-row">
                      <div className="formulations-preferred-label">
                        {ingredient.ref?.label || ingredient.ref?.id || `Ingredient ${index + 1}`}
                      </div>
                      <input
                        value={createDraft.preferredSources[index]?.vendor || ''}
                        onChange={(e) => setCreateDraft((prev) => ({
                          ...prev,
                          preferredSources: prev.preferredSources.map((entry, sourceIndex) => sourceIndex === index ? { ...entry, vendor: e.target.value } : entry),
                        }))}
                        placeholder="Sigma, Thermo, in-house"
                      />
                      <input
                        value={createDraft.preferredSources[index]?.catalogNumber || ''}
                        onChange={(e) => setCreateDraft((prev) => ({
                          ...prev,
                          preferredSources: prev.preferredSources.map((entry, sourceIndex) => sourceIndex === index ? { ...entry, catalogNumber: e.target.value } : entry),
                        }))}
                        placeholder="Optional"
                      />
                    </div>
                  ))}
                </div>
                <p className="formulations-form-copy">
                  Optional. Use this when the lab usually prepares this recipe from the same commercial sources so new instances can default to those choices later.
                </p>
              </section>

              <section className="formulations-form-section">
                <div className="formulations-form-section__head">
                  <h3>Notes</h3>
                </div>
                <textarea
                  rows={3}
                  value={createDraft.notes}
                  onChange={(e) => setCreateDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes about preparation, storage, sterility, or use."
                />
              </section>

              <section className="formulations-form-section">
                <div className="formulations-form-section__head">
                  <h3>Procedure</h3>
                </div>
                <div className="formulations-procedure-grid">
                  <div className="formulations-procedure-head">
                    <span>Step</span>
                    <span>Instruction</span>
                    <span />
                  </div>
                  {createDraft.steps.map((step, index) => (
                    <div key={`step-${index}`} className="formulations-procedure-row">
                      <div className="formulations-procedure-index">{index + 1}</div>
                      <input
                        key={stepFocusTarget?.index === index ? `step-${index}-${stepFocusTarget.key}` : `step-${index}`}
                        autoFocus={stepFocusTarget?.index === index}
                        value={step.instruction}
                        onChange={(e) => setCreateDraft((prev) => ({
                          ...prev,
                          steps: prev.steps.map((entry, stepIndex) => stepIndex === index ? { ...entry, instruction: e.target.value } : entry),
                        }))}
                        placeholder="Add ingredients, mix, incubate, or bring to final volume."
                      />
                      <button
                        className="btn btn-secondary formulations-ingredient-remove"
                        type="button"
                        disabled={createDraft.steps.length === 1}
                        onClick={() => setCreateDraft((prev) => ({
                          ...prev,
                          steps: prev.steps.filter((_, stepIndex) => stepIndex !== index),
                        }))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="formulations-form-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleAddStep}
                  >
                    Add Step
                  </button>
                </div>
              </section>
            </div>

            <div className="formulations-modal__footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateFormulation} disabled={saving}>
                {saving ? 'Saving…' : 'Create Formulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {prepareTarget && prepareDraft && (
        <div className="formulations-drawer-backdrop" onClick={() => !preparing && setPrepareTarget(null)}>
          <aside className="formulations-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="formulations-drawer__head">
              <div>
                <p className="formulations-section-head__eyebrow">Prepare Batch</p>
                <h2>{prepareTarget.recipeName}</h2>
                <p>{prepareTarget.outputSpec.name}</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setPrepareTarget(null)} disabled={preparing}>
                Close
              </button>
            </div>

            <div className="formulations-drawer__body">
              <section className="formulations-form-section">
                <h3>Bind Inputs</h3>
                <div className="formulations-stack">
                  {prepareTarget.inputRoles.map((role) => {
                    const options = inventory.filter((item) => {
                      if (item.status && item.status !== 'available') return false
                      if (role.allowedMaterialSpecRefs.length > 0) {
                        return role.allowedMaterialSpecRefs.some((ref) => ref.id === item.materialSpec.id)
                      }
                      if (role.materialRef?.id) {
                        return item.materialSpec.materialId === role.materialRef.id
                      }
                      return true
                    })
                    return (
                      <label key={role.roleId} className="formulations-field">
                        <span>{ingredientNameFromRole(role)}</span>
                        <select
                          value={prepareDraft.bindings[role.roleId] || ''}
                          onChange={(e) => setPrepareDraft((prev) => prev ? ({
                            ...prev,
                            bindings: { ...prev.bindings, [role.roleId]: e.target.value },
                          }) : prev)}
                        >
                          <option value="">{role.required ? 'Select required instance' : 'Optional'}</option>
                          {options.map((item) => (
                            <option key={item.aliquotId} value={item.aliquotId}>
                              {item.name} · {item.materialSpec.name} · {formatQuantity(item.volume)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  })}
                </div>
              </section>

              <section className="formulations-form-section">
                <h3>Output Settings</h3>
                <div className="formulations-form-grid">
                  <label className="formulations-field">
                    <span>Output mode</span>
                    <select value={prepareDraft.outputMode} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, outputMode: e.target.value as 'batch' | 'batch-and-split' } : prev)}>
                      <option value="batch">Create prepared batch only</option>
                      <option value="batch-and-split">Create prepared batch and split into aliquots</option>
                    </select>
                  </label>
                  <label className="formulations-field">
                    <span>Output count</span>
                    <input value={prepareDraft.outputCount} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, outputCount: e.target.value } : prev)} />
                  </label>
                  <label className="formulations-field">
                    <span>Output volume</span>
                    <input value={prepareDraft.outputVolumeValue} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, outputVolumeValue: e.target.value } : prev)} />
                  </label>
                  <label className="formulations-field">
                    <span>Volume unit</span>
                    <input value={prepareDraft.outputVolumeUnit} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, outputVolumeUnit: e.target.value } : prev)} />
                  </label>
                  <label className="formulations-field">
                    <span>Scale</span>
                    <input value={prepareDraft.scale} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, scale: e.target.value } : prev)} />
                  </label>
                  <label className="formulations-field">
                    <span>Container type</span>
                    <input value={prepareDraft.containerType} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, containerType: e.target.value } : prev)} placeholder="tube, plate well, vial" />
                  </label>
                  <label className="formulations-field">
                    <span>Storage location</span>
                    <input value={prepareDraft.storageLocation} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, storageLocation: e.target.value } : prev)} placeholder="Freezer A / Rack 3" />
                  </label>
                  <label className="formulations-field">
                    <span>Barcode prefix</span>
                    <input value={prepareDraft.barcodePrefix} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, barcodePrefix: e.target.value } : prev)} />
                  </label>
                  <label className="formulations-field formulations-field--wide">
                    <span>Notes</span>
                    <textarea rows={3} value={prepareDraft.notes} onChange={(e) => setPrepareDraft((prev) => prev ? { ...prev, notes: e.target.value } : prev)} />
                  </label>
                </div>
              </section>

              <section className="formulations-form-section">
                <h3>Preview</h3>
                <div className="formulations-preview">
                  {prepareDraft.outputMode === 'batch'
                    ? `Will create one prepared batch of ${prepareTarget.outputSpec.name} with total volume ${prepareDraft.outputVolumeValue || '100'} ${prepareDraft.outputVolumeUnit || 'uL'}.`
                    : `Will create one prepared batch of ${prepareTarget.outputSpec.name} and split it into ${prepareDraft.outputCount || '1'} aliquot(s) at ${prepareDraft.outputVolumeValue || '100'} ${prepareDraft.outputVolumeUnit || 'uL'} each.`}
                </div>
              </section>
            </div>

            <div className="formulations-drawer__footer">
              <button className="btn btn-secondary" onClick={() => setPrepareTarget(null)} disabled={preparing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handlePrepareRecipe} disabled={preparing}>
                {preparing ? 'Preparing…' : 'Prepare Batch'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {createPreparedFromSummary && (
        <MaterialInstanceBuilderModal
          isOpen={true}
          sourceRef={{
            kind: 'record',
            id: createPreparedFromSummary.outputSpec.id,
            type: 'material-spec',
            label: createPreparedFromSummary.outputSpec.name,
          }}
          initialName={createPreparedFromSummary.outputSpec.name}
          onClose={() => setCreatePreparedFromSummary(null)}
          onSave={(ref) => {
            setCreatePreparedFromSummary(null)
            setNotice(`Created prepared material ${ref.id}.`)
            setSplitTarget({ id: ref.id, name: ref.label || ref.id })
          }}
        />
      )}

      <AliquotSplitModal
        isOpen={Boolean(splitTarget)}
        materialInstanceId={splitTarget?.id || null}
        materialName={splitTarget?.name}
        onClose={() => setSplitTarget(null)}
        onSave={(aliquotIds) => {
          setNotice(`Created ${aliquotIds.length} aliquot(s) from ${splitTarget?.name || 'prepared material'}.`)
          setSplitTarget(null)
          refreshAll()
        }}
      />
    </div>
  )
}
