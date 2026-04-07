import type { IngestionArtifactRecord, IngestionBundleRecord, IngestionCandidateRecord, IngestionIssueRecord } from '../../types/ingestion'

export type IngestionMaterialStatus = 'existing_local' | 'new_clean' | 'new_with_issues'

export interface CaymanReviewCompound {
  materialId: string
  normalizedName: string
  sourceName: string
  catalogNumber?: string
  vendorProductId?: string
  definition?: string
  synonyms?: string[]
  molecularWeight?: { value: number; unit: 'g/mol' }
  chemicalProperties?: {
    molecularFormula?: string
    casNumber?: string
    solubility?: string
  }
  chemistryEnrichmentSources: Array<{
    artifactId: string
    fileName: string
    mediaType?: string
    note?: string
  }>
  localMatches: Array<{
    id: string
    label: string
    matchType: string
    score: number
  }>
  ontologyMatches: Array<{
    id: string
    label: string
    namespace: string
    ontology: string
    uri?: string
    description?: string
    synonyms?: string[]
    matchType: string
    score: number
  }>
  issueCount: number
  issues: IngestionIssueRecord[]
  status: IngestionMaterialStatus
}

export interface CaymanReviewPlate {
  plateNumber: number
  title: string
  assignmentCount: number
  unusedWellCount: number
  unusedWells: string[]
  assignments: CaymanReviewPlateAssignment[]
}

export interface CaymanReviewPlateAssignment {
  well: string
  itemNumber?: string
  contents: string
  materialId: string
  compound?: CaymanReviewCompound
}

export interface CaymanReviewModel {
  bundle: IngestionBundleRecord
  spreadsheetArtifacts: IngestionArtifactRecord[]
  compounds: CaymanReviewCompound[]
  plates: CaymanReviewPlate[]
  stats: {
    totalCompounds: number
    enrichedCompounds: number
    existingLocal: number
    newClean: number
    newWithIssues: number
    totalPlates: number
  }
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function issueTouchesMaterial(issue: IngestionIssueRecord, names: string[]): boolean {
  const haystack = [
    issue.payload.title,
    issue.payload.detail,
  ].filter(Boolean).join(' ').toLowerCase()
  return names.some((name) => {
    const normalized = normalize(name)
    return normalized.length > 2 && haystack.includes(normalized)
  })
}

export function buildCaymanReviewModel(args: {
  artifacts: IngestionArtifactRecord[]
  bundle: IngestionBundleRecord
  candidates: IngestionCandidateRecord[]
  issues: IngestionIssueRecord[]
}): CaymanReviewModel | null {
  const { artifacts, bundle, candidates, issues } = args
  if (bundle.payload.bundle_type !== 'screening_library') return null

  const spreadsheetArtifacts = artifacts.filter((artifact) => {
    const mediaType = artifact.payload.file_ref?.media_type || artifact.payload.media_type || ''
    const fileName = artifact.payload.file_ref?.file_name || ''
    return mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || fileName.toLowerCase().endsWith('.xlsx')
  })

  const materialCandidate = candidates.find((candidate) => candidate.payload.candidate_type === 'material')
  const vendorCandidate = candidates.find((candidate) => candidate.payload.candidate_type === 'vendor_product')
  const plateCandidates = candidates.filter((candidate) => candidate.payload.candidate_type === 'plate_layout')
  if (!materialCandidate) return null

  const materialItems = Array.isArray((materialCandidate.payload.payload as { items?: unknown[] }).items)
    ? ((materialCandidate.payload.payload as { items?: unknown[] }).items as unknown[])
    : []
  const vendorItems = Array.isArray((vendorCandidate?.payload.payload as { items?: unknown[] } | undefined)?.items)
    ? ((((vendorCandidate?.payload.payload as { items?: unknown[] } | undefined)?.items) ?? []) as unknown[])
    : []

  const vendorByMaterialId = new Map<string, { id?: string; catalogNumber?: string }>()
  for (const entry of vendorItems) {
    if (!entry || typeof entry !== 'object') continue
    const materialId = toText((entry as Record<string, unknown>).material_id)
    if (!materialId) continue
    vendorByMaterialId.set(materialId, {
      id: toText((entry as Record<string, unknown>).id),
      catalogNumber: toText((entry as Record<string, unknown>).catalog_number),
    })
  }

  const compounds = materialItems
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Record<string, unknown>
      const materialId = toText(item.id)
      const normalizedName = toText(item.name)
      const sourceName = toText(item.source_name) ?? normalizedName
      if (!materialId || !normalizedName || !sourceName) return null
      const localMatches = Array.isArray(item.matches)
        ? item.matches
            .filter((match): match is Record<string, unknown> => Boolean(match) && typeof match === 'object')
            .map((match) => ({
              id: toText(match.term_id) ?? '',
              label: toText(match.label) ?? toText(match.term_id) ?? 'Matched material',
              matchType: toText(match.match_type) ?? 'match',
              score: typeof match.score === 'number' ? match.score : 0,
            }))
            .filter((match) => match.id)
        : Array.isArray(item.local_matches)
          ? item.local_matches
              .filter((match): match is Record<string, unknown> => Boolean(match) && typeof match === 'object')
              .map((match) => ({
                id: toText(match.term_id) ?? '',
                label: toText(match.label) ?? toText(match.term_id) ?? 'Matched material',
                matchType: toText(match.match_type) ?? 'match',
                score: typeof match.score === 'number' ? match.score : 0,
              }))
              .filter((match) => match.id)
          : []
      const ontologyMatches = Array.isArray(item.ontology_matches)
        ? item.ontology_matches
            .filter((match): match is Record<string, unknown> => Boolean(match) && typeof match === 'object')
            .map((match) => ({
              id: toText(match.term_id) ?? '',
              label: toText(match.label) ?? toText(match.term_id) ?? 'Ontology term',
              namespace: toText(match.namespace) ?? 'UNKNOWN',
              ontology: toText(match.ontology) ?? toText(match.namespace) ?? 'unknown',
              ...(toText(match.uri) ? { uri: toText(match.uri) } : {}),
              ...(toText(match.description) ? { description: toText(match.description) } : {}),
              ...(Array.isArray(match.synonyms)
                ? {
                    synonyms: match.synonyms
                      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                      .slice(0, 12),
                  }
                : {}),
              matchType: toText(match.match_type) ?? 'match',
              score: typeof match.score === 'number' ? match.score : 0,
            }))
            .filter((match) => match.id)
        : []
      const matchingIssues = issues.filter((issue) => issueTouchesMaterial(issue, [sourceName, normalizedName]))
      const status: IngestionMaterialStatus = localMatches.length > 0
        ? 'existing_local'
        : matchingIssues.length > 0
          ? 'new_with_issues'
          : 'new_clean'
      const hasChemistryEnrichment = Boolean(
        (item.molecular_weight && typeof item.molecular_weight === 'object')
        || (item.chemical_properties && typeof item.chemical_properties === 'object'),
      )
      const compound: CaymanReviewCompound = {
        materialId,
        normalizedName,
        sourceName,
        ...(vendorByMaterialId.get(materialId)?.catalogNumber ?? toText(item.item_number)
          ? { catalogNumber: vendorByMaterialId.get(materialId)?.catalogNumber ?? toText(item.item_number) }
          : {}),
        ...(vendorByMaterialId.get(materialId)?.id ? { vendorProductId: vendorByMaterialId.get(materialId)?.id } : {}),
        ...(toText(item.definition) ? { definition: toText(item.definition) } : {}),
        ...(Array.isArray(item.synonyms)
          ? {
              synonyms: item.synonyms
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                .slice(0, 20),
            }
          : {}),
        ...(item.molecular_weight && typeof item.molecular_weight === 'object'
          && typeof (item.molecular_weight as { value?: unknown }).value === 'number'
          && (item.molecular_weight as { unit?: unknown }).unit === 'g/mol'
          ? {
              molecularWeight: {
                value: (item.molecular_weight as { value: number }).value,
                unit: 'g/mol' as const,
              },
            }
          : {}),
        ...(item.chemical_properties && typeof item.chemical_properties === 'object'
          ? {
              chemicalProperties: {
                ...(toText((item.chemical_properties as Record<string, unknown>).molecular_formula)
                  ? { molecularFormula: toText((item.chemical_properties as Record<string, unknown>).molecular_formula) }
                  : {}),
                ...(toText((item.chemical_properties as Record<string, unknown>).cas_number)
                  ? { casNumber: toText((item.chemical_properties as Record<string, unknown>).cas_number) }
                  : {}),
                ...(toText((item.chemical_properties as Record<string, unknown>).solubility)
                  ? { solubility: toText((item.chemical_properties as Record<string, unknown>).solubility) }
                  : {}),
              },
            }
          : {}),
        chemistryEnrichmentSources: hasChemistryEnrichment
          ? spreadsheetArtifacts.map((artifact) => ({
              artifactId: artifact.recordId,
              fileName: artifact.payload.file_ref?.file_name || artifact.recordId,
              ...(artifact.payload.file_ref?.media_type || artifact.payload.media_type
                ? { mediaType: artifact.payload.file_ref?.media_type || artifact.payload.media_type }
                : {}),
              ...(typeof artifact.payload.provenance?.note === 'string' && artifact.payload.provenance.note.trim()
                ? { note: artifact.payload.provenance.note.trim() }
                : {}),
            }))
          : [],
        localMatches,
        ontologyMatches,
        issueCount: matchingIssues.length,
        issues: matchingIssues,
        status,
      }
      return compound
    })
    .filter((value): value is CaymanReviewCompound => value !== null)
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName))

  const compoundsByMaterialId = new Map(compounds.map((compound) => [compound.materialId, compound]))

  const plates = plateCandidates
    .map((candidate) => {
      const payload = candidate.payload.payload as {
        plate_number?: number
        title?: string
        assignments?: unknown[]
        unused_wells?: unknown[]
      }
      if (typeof payload.plate_number !== 'number') return null
      const assignments = Array.isArray(payload.assignments)
        ? payload.assignments
            .map((entry) => {
              if (!entry || typeof entry !== 'object') return null
              const assignment = entry as Record<string, unknown>
              const well = toText(assignment.well)
              const contents = toText(assignment.contents)
              const materialId = toText(assignment.material_id)
              if (!well || !contents || !materialId) return null
              const compound = compoundsByMaterialId.get(materialId)
              const reviewAssignment: CaymanReviewPlateAssignment = {
                well,
                ...(toText(assignment.item_number) ? { itemNumber: toText(assignment.item_number) } : {}),
                contents,
                materialId,
                ...(compound ? { compound } : {}),
              }
              return reviewAssignment
            })
            .filter((value): value is CaymanReviewPlateAssignment => value !== null)
            .sort((left, right) => left.well.localeCompare(right.well, undefined, { numeric: true }))
        : []
      const plate: CaymanReviewPlate = {
        plateNumber: payload.plate_number,
        title: toText(payload.title) ?? candidate.payload.title,
        assignmentCount: assignments.length,
        unusedWellCount: Array.isArray(payload.unused_wells) ? payload.unused_wells.length : 0,
        unusedWells: Array.isArray(payload.unused_wells)
          ? payload.unused_wells
              .map((value) => toText(value))
              .filter((value): value is string => Boolean(value))
              .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
          : [],
        assignments,
      }
      return plate
    })
    .filter((value): value is CaymanReviewPlate => value !== null)
    .sort((left, right) => left.plateNumber - right.plateNumber)

  return {
    bundle,
    spreadsheetArtifacts,
    compounds,
    plates,
    stats: {
      totalCompounds: compounds.length,
      enrichedCompounds: compounds.filter((compound) =>
        Boolean(
          compound.molecularWeight
          || compound.chemicalProperties?.molecularFormula
          || compound.chemicalProperties?.casNumber
          || compound.chemicalProperties?.solubility,
        )).length,
      existingLocal: compounds.filter((item) => item.status === 'existing_local').length,
      newClean: compounds.filter((item) => item.status === 'new_clean').length,
      newWithIssues: compounds.filter((item) => item.status === 'new_with_issues').length,
      totalPlates: plates.length,
    },
  }
}
