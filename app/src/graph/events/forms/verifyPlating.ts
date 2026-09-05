/**
 * verifyPlating — the D3 verification-read seam.
 *
 * A biological seed count is an estimate. "Verify plating" stages a follow-up
 * `read` event on the SAME wells whose modality comes from the type's registry
 * verification rule (cell line → hoechst_nuclei / microscopy; e-coli → cfu /
 * absorbance; yeast → od600 / absorbance). The resulting reading supports or
 * refutes that the plate actually has ~N units per well. Pure builder, no I/O.
 */
import type { PlateEvent, AddMaterialDetails, ReadDetails } from '../../../types/events'
import { generateEventId } from '../../../types/events'
import type { BiologicalTypeRule } from '../../../shared/bioTypes'

const READ_MODALITIES = new Set(['fluorescence', 'absorbance', 'luminescence', 'microscopy', 'ms', 'qpcr', 'other'])

export interface VerifyPlatingInput {
  details: AddMaterialDetails
  rule: BiologicalTypeRule
  materialLabel?: string
}

export function buildVerifyPlatingReadEvent(input: VerifyPlatingInput): PlateEvent {
  const { details, rule } = input
  const wells = Array.isArray(details.wells) ? details.wells : []
  const method = rule.verification?.method
  // The read modality is DECLARED in the registry (data). The loader enforces
  // it is present whenever a verification is declared — TS never guesses here.
  if (!rule.verification?.readModality) {
    throw new Error('Cannot build verify-plating read: registry rule has no verification.readModality')
  }
  const modality = READ_MODALITIES.has(rule.verification.readModality)
    ? rule.verification.readModality
    : 'other'
  const materialLabel = input.materialLabel ?? (typeof details.biological_type === 'object' && details.biological_type ? (details.biological_type as { label?: string }).label : undefined)

  const notes = [
    `Verify plating of ${materialLabel ?? 'biological material'}`,
    method ? `by ${method}` : '',
    `seed count was ${typeof details.count === 'number' ? details.count : '?'} per well (${details.count_estimate?.measuredBy ?? 'estimate'}) — this read supports or refutes it.`,
  ].filter(Boolean).join(' · ')

  const detailsOut: ReadDetails = {
    wells,
    modality,
    ...(method ? { channels: [method] } : {}),
    notes,
  }

  return {
    eventId: generateEventId(),
    event_type: 'read',
    t_offset: 'PT0M',
    notes: `Verify plating — ${materialLabel ?? 'seed count'}`,
    details: detailsOut,
  }
}

/**
 * The evidence descriptor for a verification read — consumed by the backend
 * `/biological-types/verify-plating` endpoint to create the assertion + evidence
 * bundle that "supports/refutes that the plate actually has ~N units/well".
 */
export function buildVerifyPlatingEvidenceDescriptor(
  details: AddMaterialDetails,
  rule: BiologicalTypeRule,
  eventId: string,
): {
  eventId: string
  materialLabel: string
  biologicalTypeRef?: { kind: 'record'; id: string; type: string; label?: string }
  count: number
  measuredBy: string
  readModality: string
  wells: string[]
} {
  const materialLabel =
    (typeof details.biological_type === 'object' && details.biological_type
      ? (details.biological_type as { label?: string }).label
      : undefined) ?? 'biological material'
  const bioType = typeof details.biological_type === 'object' && details.biological_type
    ? details.biological_type as { kind: 'record'; id: string; type: string; label?: string }
    : undefined
  return {
    eventId,
    materialLabel,
    ...(bioType?.id ? { biologicalTypeRef: bioType } : {}),
    count: typeof details.count === 'number' ? details.count : 0,
    measuredBy: details.count_estimate?.measuredBy ?? rule.verification?.method ?? 'manual',
    readModality: rule.verification?.readModality ?? 'other',
    wells: Array.isArray(details.wells) ? details.wells : [],
  }
}