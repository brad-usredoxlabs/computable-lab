import type { MolecularWeightResolutionResponse } from '../../shared/api/client'

export function formatResolvedMolecularWeightValue(value: number): string {
  return Number(value.toFixed(4)).toString()
}

export function formatMolecularWeightResolutionNote(result: MolecularWeightResolutionResponse): string {
  if (result.resolved && result.molecularWeight) {
    const formulaSuffix = result.formula ? ` (${result.formula})` : ''
    if (result.source === 'chebi') return `Auto-filled from ChEBI${formulaSuffix}.`
    if (result.source === 'pubchem') return `Auto-filled from PubChem${formulaSuffix}.`
    return `Computed locally from formula${formulaSuffix}.`
  }
  if (result.formula) return `Could not find a direct molecular weight. Formula available: ${result.formula}.`
  return 'Could not resolve molecular weight automatically.'
}
