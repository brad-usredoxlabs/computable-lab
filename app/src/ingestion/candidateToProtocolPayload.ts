/**
 * candidateToProtocolPayload — pure mapper from an AiProtocolCandidateSummary
 * (the extraction output) to the protocol.schema.yaml record payload, so the
 * vendor-PDF review page can render the candidate into the TapTab protocol
 * authoring surface.
 *
 * Pure + side-effect-free (no client/api imports) so it is trivially testable.
 */

import type {
  AiProtocolCandidateSummary,
  AiProtocolCandidateItemSummary,
  AiProtocolCandidateStepSummary,
  AiProtocolCandidateEvidenceAnchor,
} from '../types/ai'

/** A protocol step "kind" — the union in protocol.schema.yaml. */
export type ProtocolStepKind =
  | 'add_material'
  | 'transfer'
  | 'mix'
  | 'wash'
  | 'incubate'
  | 'read'
  | 'harvest'
  | 'other'

export interface MappedProtocolStep {
  stepId: string
  ordinal: number
  kind: ProtocolStepKind
  label: string
  description: string
  notes?: string
  isOptional?: boolean
  provenance?: MappedProvenanceAnchor[]
}

/** App-prefilled source anchor for a step (page/section), shown collapsed. */
export interface MappedProvenanceAnchor {
  anchorId: string
  pageNumber?: number
  sectionId?: string
  snippet?: string
}

export interface MappedProtocolPayload {
  kind: 'protocol'
  recordId: string
  title: string
  steps: MappedProtocolStep[]
  roles: {
    materialRoles: Array<{ roleId: string; description: string; allowedMaterialIds?: string[] }>
    labwareRoles: Array<{ roleId: string; description: string; expectedLabwareKinds?: string[] }>
    instrumentRoles: Array<{ roleId: string; description: string; allowedInstrumentIds?: string[] }>
  }
  humanStepsText?: string
}

function slugId(label: string | undefined): string {
  const s = (label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'role'
}

function stepKindFrom(title: string | undefined, text: string): ProtocolStepKind {
  // NOTE: every structured step kind (add_material/transfer/mix/wash/incubate/
  // read/harvest) requires variant-specific fields (target/wells/material/cycles)
  // that the extraction candidate does not produce. A bare step must therefore
  // be `other` or it fails Ajv. The biologist reclassifies in the editor.
  void title; void text
  return 'other'
}

function provenanceFrom(evidence: AiProtocolCandidateEvidenceAnchor[] | undefined, stepIndex: number): MappedProvenanceAnchor[] {
  return (evidence ?? []).map((e, idx) => ({
    anchorId: `src-${stepIndex + 1}-${idx + 1}`,
    ...(typeof e.pageNumber === 'number' ? { pageNumber: e.pageNumber } : {}),
    ...(typeof e.sectionId === 'string' ? { sectionId: e.sectionId } : {}),
    ...(typeof e.snippet === 'string' ? { snippet: e.snippet } : {}),
  }))
}

type MaterialRole = { roleId: string; description: string; allowedMaterialIds?: string[] }
type LabwareRole = { roleId: string; description: string; expectedLabwareKinds?: string[] }
type InstrumentRole = { roleId: string; description: string; allowedInstrumentIds?: string[] }

function mapItem(
  it: AiProtocolCandidateItemSummary,
  idKey: 'allowedMaterialIds' | 'expectedLabwareKinds' | 'allowedInstrumentIds',
): MaterialRole | LabwareRole | InstrumentRole {
  const roleId = slugId(it.normalizedId ?? it.role ?? it.label)
  const base: { roleId: string; description: string } = { roleId, description: it.label }
  if (!it.normalizedId) return base
  // distribute the normalized id into the right id-key per idKey
  if (idKey === 'allowedMaterialIds') return { ...base, allowedMaterialIds: [it.normalizedId] }
  if (idKey === 'expectedLabwareKinds') return { ...base, expectedLabwareKinds: [it.normalizedId] }
  return { ...base, allowedInstrumentIds: [it.normalizedId] }
}

function mapStep(st: AiProtocolCandidateStepSummary, i: number): MappedProtocolStep {
  const label = st.title?.trim()
    ? st.title.trim()
    : st.text?.trim()
      ? st.text.trim().slice(0, 80)
      : `Step ${i + 1}`
  const authorNotes = Array.isArray(st.notes) && st.notes.length > 0 ? st.notes.join('. ') : undefined
  return {
    stepId: `step-${i + 1}`,
    ordinal: i + 1,
    kind: stepKindFrom(st.title, st.text),
    label,
    description: st.text,
    ...(authorNotes ? { notes: authorNotes } : {}),
    ...((st.evidence?.length ?? 0) > 0 ? { provenance: provenanceFrom(st.evidence, i) } : {}),
  }
}

export function candidateToProtocolPayload(
  candidate: AiProtocolCandidateSummary,
  recordId: string,
  humanStepsText?: string,
): MappedProtocolPayload {
  const roles = {
    materialRoles: (candidate.materials ?? []).map((it) => mapItem(it, 'allowedMaterialIds')) as MaterialRole[],
    labwareRoles: (candidate.labware ?? []).map((it) => mapItem(it, 'expectedLabwareKinds')) as LabwareRole[],
    instrumentRoles: (candidate.equipment ?? []).map((it) => mapItem(it, 'allowedInstrumentIds')) as InstrumentRole[],
  }

  return {
    kind: 'protocol',
    recordId,
    title: candidate.title?.trim() ? candidate.title.trim() : 'Untitled protocol',
    steps: (candidate.steps ?? []).map(mapStep),
    roles,
    ...(humanStepsText?.trim() ? { humanStepsText } : {}),
  }
}