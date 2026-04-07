/**
 * Material domain types, constants, and helpers.
 * Pure-data module — no React dependencies.
 */

/** Material domain classification */
export type MaterialDomain = 'cell_line' | 'chemical' | 'media' | 'reagent' | 'organism' | 'sample' | 'other'

export type ConcentrationBasis =
  | 'molar'
  | 'mass_per_volume'
  | 'activity_per_volume'
  | 'count_per_volume'
  | 'volume_fraction'
  | 'mass_fraction'

export interface ConcentrationValue {
  value: number
  unit: string
  basis?: ConcentrationBasis
}

export interface MaterialRefValue {
  kind: 'record' | 'ontology'
  id: string
  type?: string
  label?: string
  namespace?: string
  uri?: string
}

export type CompositionRole =
  | 'solute'
  | 'solvent'
  | 'buffer_component'
  | 'additive'
  | 'activity_source'
  | 'cells'
  | 'other'

export interface CompositionEntryValue {
  componentRef: MaterialRefValue
  role: CompositionRole
  concentration?: ConcentrationValue
  source?: string
}

export type RecipeRoleType =
  | 'solute'
  | 'solvent'
  | 'diluent'
  | 'additive'
  | 'buffer_component'
  | 'activity_source'
  | 'cells'
  | 'matrix'
  | 'other'

export interface CompositionProvenanceValue {
  sourceType?: 'vendor_catalog' | 'vendor_search' | 'vendor_page' | 'manual'
  vendor?: string
  sourceUrl?: string
  sourceText?: string
  capturedAt?: string
}

export interface FileRefValue {
  fileName: string
  mediaType: string
  sourceUrl?: string
  sizeBytes?: number
  sha256?: string
  pageCount?: number
}

export interface VendorDocumentValue {
  id: string
  title?: string
  documentKind?: 'product_sheet' | 'formulation_sheet' | 'certificate_of_analysis' | 'safety_data_sheet' | 'label' | 'other'
  fileRef: FileRefValue
  provenance: {
    sourceType: 'upload' | 'url' | 'vendor_page' | 'manual'
    addedAt: string
    note?: string
  }
  extraction?: {
    method?: 'plain_text' | 'pdf_text' | 'ocr' | 'html_section_parser' | 'unsupported' | 'failed'
    extractedAt?: string
    pageCount?: number
    ocrAttempted?: boolean
    ocrAvailable?: boolean
    textExcerpt?: string
  }
}

export interface CompositionDraftItemValue {
  componentName: string
  role: CompositionRole
  concentration?: ConcentrationValue
  confidence?: number
  sourcePage?: number
  sourceText?: string
}

export interface CompositionDraftValue {
  id: string
  sourceDocumentId: string
  extractionMethod: 'plain_text' | 'pdf_text' | 'ocr' | 'html_section_parser'
  status: 'draft' | 'reviewed' | 'rejected' | 'applied'
  overallConfidence?: number
  createdAt: string
  notes?: string
  extractedTextExcerpt?: string
  items: CompositionDraftItemValue[]
}

export const CONCENTRATION_UNITS: readonly { value: string; label: string; basis: ConcentrationBasis }[] = [
  { value: 'M', label: 'M', basis: 'molar' },
  { value: 'mM', label: 'mM', basis: 'molar' },
  { value: 'uM', label: 'uM', basis: 'molar' },
  { value: 'nM', label: 'nM', basis: 'molar' },
  { value: 'pM', label: 'pM', basis: 'molar' },
  { value: 'fM', label: 'fM', basis: 'molar' },
  { value: 'g/L', label: 'g/L', basis: 'mass_per_volume' },
  { value: 'mg/mL', label: 'mg/mL', basis: 'mass_per_volume' },
  { value: 'ug/mL', label: 'ug/mL', basis: 'mass_per_volume' },
  { value: 'ng/mL', label: 'ng/mL', basis: 'mass_per_volume' },
  { value: 'U/mL', label: 'U/mL', basis: 'activity_per_volume' },
  { value: 'U/uL', label: 'U/uL', basis: 'activity_per_volume' },
  { value: 'cells/mL', label: 'cells/mL', basis: 'count_per_volume' },
  { value: 'cells/uL', label: 'cells/uL', basis: 'count_per_volume' },
  { value: '% v/v', label: '% v/v', basis: 'volume_fraction' },
  { value: '% w/v', label: '% w/v', basis: 'mass_fraction' },
] as const

const CONCENTRATION_BASIS_BY_UNIT = Object.fromEntries(
  CONCENTRATION_UNITS.map((entry) => [entry.value, entry.basis]),
) as Record<string, ConcentrationBasis>

export function normalizeConcentrationUnit(unit: string): string {
  if (unit === 'µM') return 'uM'
  return unit
}

export function inferConcentrationBasis(unit: string): ConcentrationBasis | undefined {
  return CONCENTRATION_BASIS_BY_UNIT[normalizeConcentrationUnit(unit)]
}

export function withInferredConcentrationBasis(
  concentration: Pick<ConcentrationValue, 'value' | 'unit' | 'basis'> | undefined | null,
): ConcentrationValue | undefined {
  if (!concentration || typeof concentration.value !== 'number' || !Number.isFinite(concentration.value)) return undefined
  const unit = normalizeConcentrationUnit(concentration.unit)
  const basis = concentration.basis || inferConcentrationBasis(unit)
  return {
    value: concentration.value,
    unit,
    ...(basis ? { basis } : {}),
  }
}

export function concentrationToCanonicalBase(concentration: ConcentrationValue): number | undefined {
  const normalized = withInferredConcentrationBasis(concentration)
  if (!normalized) return undefined
  switch (normalized.basis) {
    case 'molar':
      switch (normalized.unit) {
        case 'M': return normalized.value
        case 'mM': return normalized.value * 1e-3
        case 'uM': return normalized.value * 1e-6
        case 'nM': return normalized.value * 1e-9
        case 'pM': return normalized.value * 1e-12
        case 'fM': return normalized.value * 1e-15
        default: return undefined
      }
    case 'mass_per_volume':
      switch (normalized.unit) {
        case 'g/L': return normalized.value
        case 'mg/mL': return normalized.value
        case 'ug/mL': return normalized.value * 1e-3
        case 'ng/mL': return normalized.value * 1e-6
        default: return undefined
      }
    case 'activity_per_volume':
      switch (normalized.unit) {
        case 'U/mL': return normalized.value * 1e3
        case 'U/uL': return normalized.value * 1e6
        default: return undefined
      }
    case 'count_per_volume':
      switch (normalized.unit) {
        case 'cells/mL': return normalized.value * 1e3
        case 'cells/uL': return normalized.value * 1e6
        default: return undefined
      }
    case 'volume_fraction':
    case 'mass_fraction':
      return normalized.value / 100
    default:
      return undefined
  }
}

export function formatConcentration(concentration?: Pick<ConcentrationValue, 'value' | 'unit'> | null): string | null {
  if (!concentration) return null
  if (typeof concentration.value !== 'number' || !Number.isFinite(concentration.value)) return null
  if (!concentration.unit) return null
  return `${concentration.value} ${normalizeConcentrationUnit(concentration.unit)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseRef(value: unknown): MaterialRefValue | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind === 'ontology' ? 'ontology' : value.kind === 'record' ? 'record' : undefined
  if (!kind || typeof value.id !== 'string' || !value.id.trim()) return undefined
  return {
    kind,
    id: value.id.trim(),
    ...(typeof value.type === 'string' && value.type.trim() ? { type: value.type.trim() } : {}),
    ...(typeof value.label === 'string' && value.label.trim() ? { label: value.label.trim() } : {}),
    ...(typeof value.namespace === 'string' && value.namespace.trim() ? { namespace: value.namespace.trim() } : {}),
    ...(typeof value.uri === 'string' && value.uri.trim() ? { uri: value.uri.trim() } : {}),
  }
}

export function parseCompositionEntries(value: unknown): CompositionEntryValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const componentRef = parseRef(entry.component_ref)
    if (!componentRef) return []
    const role = typeof entry.role === 'string' ? entry.role.trim() as CompositionRole : undefined
    if (!role) return []
    const rawConcentration = isRecord(entry.concentration)
      && typeof entry.concentration.value === 'number'
      && Number.isFinite(entry.concentration.value)
      && typeof entry.concentration.unit === 'string'
      && entry.concentration.unit.trim()
      ? {
          value: entry.concentration.value,
          unit: entry.concentration.unit,
          ...(typeof entry.concentration.basis === 'string' ? { basis: entry.concentration.basis as ConcentrationBasis } : {}),
        }
      : undefined
    const concentration = withInferredConcentrationBasis(rawConcentration)
    return [{
      componentRef,
      role,
      ...(concentration ? { concentration } : {}),
      ...(typeof entry.source === 'string' && entry.source.trim() ? { source: entry.source.trim() } : {}),
    }]
  })
}

export function parseCompositionProvenance(value: unknown): CompositionProvenanceValue | undefined {
  if (!isRecord(value)) return undefined
  return {
    ...(typeof value.source_type === 'string' && value.source_type.trim() ? { sourceType: value.source_type.trim() as CompositionProvenanceValue['sourceType'] } : {}),
    ...(typeof value.vendor === 'string' && value.vendor.trim() ? { vendor: value.vendor.trim() } : {}),
    ...(typeof value.source_url === 'string' && value.source_url.trim() ? { sourceUrl: value.source_url.trim() } : {}),
    ...(typeof value.source_text === 'string' && value.source_text.trim() ? { sourceText: value.source_text.trim() } : {}),
    ...(typeof value.captured_at === 'string' && value.captured_at.trim() ? { capturedAt: value.captured_at.trim() } : {}),
  }
}

export function parseVendorDocuments(value: unknown): VendorDocumentValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.file_ref) || !isRecord(entry.provenance)) return []
    if (typeof entry.id !== 'string' || !entry.id.trim()) return []
    if (typeof entry.file_ref.file_name !== 'string' || !entry.file_ref.file_name.trim()) return []
    if (typeof entry.file_ref.media_type !== 'string' || !entry.file_ref.media_type.trim()) return []
    if (typeof entry.provenance.source_type !== 'string' || typeof entry.provenance.added_at !== 'string') return []
    return [{
      id: entry.id.trim(),
      ...(typeof entry.title === 'string' && entry.title.trim() ? { title: entry.title.trim() } : {}),
      ...(typeof entry.document_kind === 'string' ? { documentKind: entry.document_kind as VendorDocumentValue['documentKind'] } : {}),
      fileRef: {
        fileName: entry.file_ref.file_name,
        mediaType: entry.file_ref.media_type,
        ...(typeof entry.file_ref.source_url === 'string' && entry.file_ref.source_url.trim() ? { sourceUrl: entry.file_ref.source_url.trim() } : {}),
        ...(typeof entry.file_ref.size_bytes === 'number' ? { sizeBytes: entry.file_ref.size_bytes } : {}),
        ...(typeof entry.file_ref.sha256 === 'string' && entry.file_ref.sha256.trim() ? { sha256: entry.file_ref.sha256.trim() } : {}),
        ...(typeof entry.file_ref.page_count === 'number' ? { pageCount: entry.file_ref.page_count } : {}),
      },
      provenance: {
        sourceType: entry.provenance.source_type as VendorDocumentValue['provenance']['sourceType'],
        addedAt: entry.provenance.added_at,
        ...(typeof entry.provenance.note === 'string' && entry.provenance.note.trim() ? { note: entry.provenance.note.trim() } : {}),
      },
      ...(isRecord(entry.extraction)
        ? {
            extraction: {
              ...(typeof entry.extraction.method === 'string' ? { method: entry.extraction.method as NonNullable<VendorDocumentValue['extraction']>['method'] } : {}),
              ...(typeof entry.extraction.extracted_at === 'string' ? { extractedAt: entry.extraction.extracted_at } : {}),
              ...(typeof entry.extraction.page_count === 'number' ? { pageCount: entry.extraction.page_count } : {}),
              ...(typeof entry.extraction.ocr_attempted === 'boolean' ? { ocrAttempted: entry.extraction.ocr_attempted } : {}),
              ...(typeof entry.extraction.ocr_available === 'boolean' ? { ocrAvailable: entry.extraction.ocr_available } : {}),
              ...(typeof entry.extraction.text_excerpt === 'string' && entry.extraction.text_excerpt.trim() ? { textExcerpt: entry.extraction.text_excerpt.trim() } : {}),
            },
          }
        : {}),
    }]
  })
}

export function parseCompositionDrafts(value: unknown): CompositionDraftValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.items)) return []
    if (typeof entry.id !== 'string' || typeof entry.source_document_id !== 'string' || typeof entry.extraction_method !== 'string' || typeof entry.status !== 'string' || typeof entry.created_at !== 'string') return []
    const items = entry.items.flatMap((item) => {
      if (!isRecord(item) || typeof item.component_name !== 'string' || typeof item.role !== 'string') return []
      const rawConcentration = isRecord(item.concentration)
        && typeof item.concentration.value === 'number'
        && Number.isFinite(item.concentration.value)
        && typeof item.concentration.unit === 'string'
        && item.concentration.unit.trim()
        ? {
            value: item.concentration.value,
            unit: item.concentration.unit,
            ...(typeof item.concentration.basis === 'string' ? { basis: item.concentration.basis as ConcentrationBasis } : {}),
          }
        : undefined
      return [{
        componentName: item.component_name.trim(),
        role: item.role as CompositionRole,
        ...(withInferredConcentrationBasis(rawConcentration) ? { concentration: withInferredConcentrationBasis(rawConcentration) } : {}),
        ...(typeof item.confidence === 'number' ? { confidence: item.confidence } : {}),
        ...(typeof item.source_page === 'number' ? { sourcePage: item.source_page } : {}),
        ...(typeof item.source_text === 'string' && item.source_text.trim() ? { sourceText: item.source_text.trim() } : {}),
      }]
    })
    return [{
      id: entry.id,
      sourceDocumentId: entry.source_document_id,
      extractionMethod: entry.extraction_method as CompositionDraftValue['extractionMethod'],
      status: entry.status as CompositionDraftValue['status'],
      ...(typeof entry.overall_confidence === 'number' ? { overallConfidence: entry.overall_confidence } : {}),
      createdAt: entry.created_at,
      ...(typeof entry.notes === 'string' && entry.notes.trim() ? { notes: entry.notes.trim() } : {}),
      ...(typeof entry.extracted_text_excerpt === 'string' && entry.extracted_text_excerpt.trim() ? { extractedTextExcerpt: entry.extracted_text_excerpt.trim() } : {}),
      items,
    }]
  })
}

export function getPrimaryDeclaredConcentration(value: unknown): ConcentrationValue | undefined {
  const entries = parseCompositionEntries(value)
  for (const preferredRole of ['solute', 'activity_source', 'cells', 'other'] as const) {
    const match = entries.find((entry) => entry.role === preferredRole && entry.concentration)
    if (match?.concentration) return match.concentration
  }
  return entries.find((entry) => entry.concentration)?.concentration
}

export const RECIPE_ROLE_OPTIONS: readonly { value: RecipeRoleType; label: string }[] = [
  { value: 'solute', label: 'Solute' },
  { value: 'solvent', label: 'Solvent' },
  { value: 'diluent', label: 'Diluent' },
  { value: 'buffer_component', label: 'Buffer Component' },
  { value: 'additive', label: 'Additive' },
  { value: 'activity_source', label: 'Activity Source' },
  { value: 'cells', label: 'Cells' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'other', label: 'Other' },
] as const

export function recipeRoleToCompositionRole(role: string | undefined): CompositionRole {
  switch (role) {
    case 'solute':
      return 'solute'
    case 'solvent':
    case 'diluent':
      return 'solvent'
    case 'buffer_component':
    case 'matrix':
      return 'buffer_component'
    case 'activity_source':
      return 'activity_source'
    case 'additive':
      return 'additive'
    case 'cells':
      return 'cells'
    default:
      return 'other'
  }
}

export function formatCompositionSummary(entries: CompositionEntryValue[], limit = 3): string | null {
  if (!entries.length) return null
  const rendered = entries.slice(0, limit).map((entry) => {
    const label = entry.componentRef.label || entry.componentRef.id
    const concentration = formatConcentration(entry.concentration)
    return concentration ? `${label} @ ${concentration}` : label
  })
  return `${rendered.join(', ')}${entries.length > limit ? ` +${entries.length - limit} more` : ''}`
}

/** Domain options for dropdown rendering */
export const MATERIAL_DOMAINS: readonly { value: MaterialDomain; label: string }[] = [
  { value: 'chemical', label: 'Chemical' },
  { value: 'cell_line', label: 'Cell Line' },
  { value: 'media', label: 'Media' },
  { value: 'reagent', label: 'Reagent' },
  { value: 'organism', label: 'Organism' },
  { value: 'sample', label: 'Sample' },
  { value: 'other', label: 'Other' },
] as const

/** Map OLS namespace prefix → material domain (UI hint, user can override) */
const NAMESPACE_DOMAIN_MAP: Record<string, MaterialDomain> = {
  CHEBI: 'chemical',
  NCBITaxon: 'organism',
  CL: 'cell_line',
  UBERON: 'sample',
  GO: 'other',
  NCIT: 'other',
}

/** Infer a material domain from an ontology namespace prefix */
export function inferDomainFromNamespace(namespace: string): MaterialDomain {
  return NAMESPACE_DOMAIN_MAP[namespace] ?? 'other'
}

/** Schema ID for material records */
export const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml'
export const VENDOR_PRODUCT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml'
export const MATERIAL_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml'

/** OLS ontologies to search for materials */
export const MATERIAL_OLS_ONTOLOGIES = ['chebi', 'ncbitaxon', 'uberon', 'go', 'ncit', 'cl']

/** Generate a material record ID from a name */
export function generateMaterialId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20)
  const rand = Math.random().toString(36).substring(2, 6)
  return `MAT-${slug}-${rand}`
}

export function generateVendorProductId(vendor: string, catalogNumber: string): string {
  const slug = `${vendor}-${catalogNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 28)
  const rand = Math.random().toString(36).substring(2, 6)
  return `VPR-${slug}-${rand}`
}
