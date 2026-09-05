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

/** Suggest a read modality for a verification mechanism. */
export function verifyReadModality(method: string | undefined): string {
  switch (method) {
    case 'hoechst_nuclei':
    case 'cell_counter':
    case 'hemocytometer':
    case 'manual':
      return 'microscopy'
    case 'total_protein':
    case 'od600':
      return 'absorbance'
    case 'cfu':
      return 'absorbance'
    default:
      return 'other'
  }
}

export function buildVerifyPlatingReadEvent(input: VerifyPlatingInput): PlateEvent {
  const { details, rule } = input
  const wells = Array.isArray(details.wells) ? details.wells : []
  const method = rule.verification?.method
  const ruleModality = rule.verification?.readModality
  const modality = ruleModality ?? verifyReadModality(method)
  const safeModality = READ_MODALITIES.has(modality) ? modality : 'other'
  const materialLabel = input.materialLabel ?? (typeof details.biological_type === 'object' && details.biological_type ? (details.biological_type as { label?: string }).label : undefined)

  const notes = [
    `Verify plating of ${materialLabel ?? 'biological material'}`,
    method ? `by ${method}` : '',
    `seed count was ${typeof details.count === 'number' ? details.count : '?'} per well (${details.count_estimate?.measuredBy ?? 'estimate'}) — this read supports or refutes it.`,
  ].filter(Boolean).join(' · ')

  const detailsOut: ReadDetails = {
    wells,
    modality: safeModality,
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