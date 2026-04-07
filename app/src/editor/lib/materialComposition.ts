import { apiClient, type FormulationSummary } from '../../shared/api/client'
import type { Ref } from '../../types/ref'
import {
  getPrimaryDeclaredConcentration,
  parseCompositionEntries,
  withInferredConcentrationBasis,
  type CompositionEntryValue,
  type ConcentrationValue,
} from '../../types/material'

type SourceDefaults = {
  concentration?: ConcentrationValue
  compositionSnapshot?: CompositionEntryValue[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function materialSpecCompositionFromPayload(payload: Record<string, unknown> | null): CompositionEntryValue[] {
  return parseCompositionEntries(asRecord(payload?.formulation)?.composition)
}

function materialSpecConcentrationFromPayload(payload: Record<string, unknown> | null): ConcentrationValue | undefined {
  const formulation = asRecord(payload?.formulation)
  const concentration = asRecord(formulation?.concentration)
  if (!concentration) return undefined
  return withInferredConcentrationBasis(concentration as unknown as ConcentrationValue)
}

async function loadMaterialSpecDefaults(materialSpecId: string): Promise<SourceDefaults> {
  const record = await apiClient.getRecord(materialSpecId)
  const payload = asRecord(record.payload)
  const compositionSnapshot = materialSpecCompositionFromPayload(payload)
  const concentration = materialSpecConcentrationFromPayload(payload)
  return {
    ...(concentration ? { concentration } : {}),
    ...(compositionSnapshot.length > 0 ? { compositionSnapshot } : {}),
  }
}

export async function resolveAddMaterialSourceDefaults(
  ref: Ref | null,
  formulationSummary?: Pick<FormulationSummary, 'outputSpec'> | null,
): Promise<SourceDefaults> {
  if (!ref || ref.kind !== 'record') return {}

  if (ref.type === 'material-spec') {
    if (formulationSummary?.outputSpec) {
      const concentration = withInferredConcentrationBasis(formulationSummary.outputSpec.concentration)
      const compositionSnapshot = formulationSummary.outputSpec.composition ?? []
      return {
        ...(concentration ? { concentration } : {}),
        ...(compositionSnapshot.length > 0 ? { compositionSnapshot } : {}),
      }
    }
    return loadMaterialSpecDefaults(ref.id)
  }

  const record = await apiClient.getRecord(ref.id)
  const payload = asRecord(record.payload)
  if (!payload) return {}

  if (ref.type === 'vendor-product' || payload.kind === 'vendor-product') {
    const compositionSnapshot = parseCompositionEntries(payload.declared_composition)
    const concentration = withInferredConcentrationBasis(getPrimaryDeclaredConcentration(payload.declared_composition))
    return {
      ...(concentration ? { concentration } : {}),
      ...(compositionSnapshot.length > 0 ? { compositionSnapshot } : {}),
    }
  }

  if (ref.type === 'aliquot' || ref.type === 'material-instance' || payload.kind === 'aliquot' || payload.kind === 'material-instance') {
    const explicitConcentrationRecord = asRecord(payload.concentration)
    const explicitConcentration = explicitConcentrationRecord
      ? withInferredConcentrationBasis(explicitConcentrationRecord as unknown as ConcentrationValue)
      : undefined
    const specRef = asRecord(payload.material_spec_ref)
    const materialSpecId = typeof specRef?.id === 'string' && specRef.id.trim() ? specRef.id.trim() : undefined
    if (!materialSpecId) {
      return explicitConcentration ? { concentration: explicitConcentration } : {}
    }
    const inherited = await loadMaterialSpecDefaults(materialSpecId)
    return {
      ...(explicitConcentration || inherited.concentration ? { concentration: explicitConcentration || inherited.concentration } : {}),
      ...(inherited.compositionSnapshot?.length ? { compositionSnapshot: inherited.compositionSnapshot } : {}),
    }
  }

  return {}
}
