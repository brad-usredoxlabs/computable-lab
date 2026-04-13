/**
 * API client for the computable-lab kernel.
 * All server responses are treated as authoritative.
 */

import type {
  RecordEnvelope,
  RecordResponse,
  RecordsResponse,
  SchemaInfo,
  SchemasResponse,
  WriteResponse,
} from '../../types/kernel'
import type { UISpec, UISpecResponse, RecordWithUIResponse } from '../../types/uiSpec'
import type { PlatformManifest } from '../../types/platformRegistry'
import type {
  ConfigResponse,
  ConfigPatchResponse,
  AiConnectionTestRequest,
  AiConnectionTestResponse,
} from '../../types/config'
import type {
  CreateIngestionJobRequest,
  IngestionJobDetail,
  IngestionJobListResponse,
  IngestionPublishResult,
  SourceKindSuggestion,
  RunMappingResponse,
  IssueExplanation,
} from '../../types/ingestion'
import type {
  PromoteContextRequest,
  PromoteContextResponse,
  LibraryAssetListResponse,
} from '../../types/reuse'
import type {
  ComponentListResponse,
  ComponentCreateRequest,
  ComponentCreateResponse,
  ComponentPublishResponse,
  ComponentInstantiateResponse,
  ComponentInstanceStatusResponse,
  ComponentSuggestionResponse,
} from '../../types/componentGraph'
import type { CompositionEntryValue, ConcentrationValue } from '../../types/material'
import { ApiError, NetworkError } from './errors'
import { API_BASE } from './base'

export interface QuantityValue {
  value: number
  unit: string
}
export type { ConcentrationValue } from '../../types/material'

export interface FlexibleQuantityValue {
  value: number | string
  unit: string
}

export type IngredientMeasureMode = 'target_concentration' | 'fixed_amount' | 'qs_to_final'
export type IngredientSourceState = 'solid' | 'liquid' | 'stock_solution' | 'formulation' | 'cells' | 'other'

export interface RecipeInputRole {
  roleId: string
  roleType: string
  required?: boolean
  materialRefId?: string
  vendorProductRefId?: string
  allowedMaterialSpecRefIds?: string[]
  measureMode?: IngredientMeasureMode
  sourceState?: IngredientSourceState
  stockConcentration?: ConcentrationValue
  targetContribution?: ConcentrationValue
  requiredAmount?: QuantityValue
  molecularWeight?: {
    value: number
    unit: 'g/mol'
  }
  compositionSnapshot?: CompositionEntryValue[]
  quantity?: FlexibleQuantityValue
  constraints?: string[]
}

export interface FormulationCopilotIngredientDraft {
  ref?: MaterialRefInput
  roleType: string
  measureMode?: IngredientMeasureMode
  sourceState?: IngredientSourceState
  stockConcentration?: ConcentrationValue
  targetContribution?: ConcentrationValue
  requiredAmount?: QuantityValue
  molecularWeight?: {
    value: number
    unit: 'g/mol'
  }
  compositionSnapshot?: CompositionEntryValue[]
}

export interface FormulationCopilotDraft {
  recipeName?: string
  representsMaterial?: MaterialRefInput
  totalProduced?: QuantityValue
  outputSolventRef?: MaterialRefInput
  storage?: {
    storageTemperatureC?: number
    lightSensitive?: boolean
    maxFreezeThawCycles?: number
    stabilityNote?: string
  }
  notes?: string
  ingredients: FormulationCopilotIngredientDraft[]
  steps?: Array<{ instruction: string }>
}

export interface FormulationCopilotCalculationSummary {
  label: string
  roleType: string
  measureMode?: IngredientMeasureMode
  sourceState?: IngredientSourceState
  targetContribution?: ConcentrationValue
  stockConcentration?: ConcentrationValue
  requiredAmount?: QuantityValue
  note?: string
}

export interface FormulationCopilotResponse {
  draftPatch: Partial<FormulationCopilotDraft>
  warnings: string[]
  assumptions: string[]
  calculationSummary: FormulationCopilotCalculationSummary[]
  outputComposition: CompositionEntryValue[]
}

export interface MaterialRefInput {
  kind: 'record' | 'ontology'
  id: string
  type?: string
  label?: string
  namespace?: string
  uri?: string
}

export interface MaterialSearchItem {
  recordId: string
  kind: string
  title: string
  category: 'saved-stock' | 'vendor-reagent' | 'prepared-material' | 'biological-derived' | 'concept-only'
  subtitle?: string
}

export interface MaterialDraftResponse {
  proposed: {
    name: string
    kind: string
    category: string
    domain: string
    concentration?: { value: number; unit: string }
    vendor?: string
    cas_number?: string
    molecular_formula?: string
  }
  ontologyMatches: Array<{ id: string; label: string; namespace: string }>
  vendorMatches: Array<{ vendor: string; catalogNumber?: string; query?: string }>
  confidence: number
  unresolvedFields: string[]
}

export interface MaterialSmartSearchResult {
  source: 'local' | 'ontology' | 'vendor'
  record: Record<string, unknown>
  matchReason: string
}

export interface MaterialSmartSearchResponse {
  results: MaterialSmartSearchResult[]
}

export interface MaterialCompositionSuggestion {
  type: 'missing_component' | 'concentration_warning' | 'ontology_issue'
  message: string
  confidence: number
}

export interface MaterialCompositionReviewResponse {
  suggestions: MaterialCompositionSuggestion[]
}

export interface MaterialDuplicateMatch {
  recordId: string
  name: string
  similarity: number
  reason: string
}

export interface MaterialDuplicateCheckResponse {
  potentialDuplicates: MaterialDuplicateMatch[]
}

export interface InstrumentDefinition {
  kind: 'instrument-definition'
  id: string
  name: string
  vendor?: string
  model?: string
  instrument_type: 'plate_reader' | 'qpcr' | 'gc_ms' | 'lc_ms' | 'microscopy' | 'other'
  supported_readout_def_refs?: MaterialRefInput[]
  tags?: string[]
}

export interface ReadoutDefinition {
  kind: 'readout-definition'
  id: string
  name: string
  instrument_type: InstrumentDefinition['instrument_type']
  mode: 'fluorescence' | 'absorbance' | 'luminescence' | 'ct' | 'peak_area' | 'image_feature' | 'other'
  channel_label?: string
  excitation_nm?: number
  emission_nm?: number
  units?: string
  proxy_ref?: MaterialRefInput
  target_ref?: MaterialRefInput
  tags?: string[]
}

export interface AssayDefinition {
  kind: 'assay-definition'
  id: string
  name: string
  assay_type: string
  instrument_type: InstrumentDefinition['instrument_type']
  readout_def_refs: MaterialRefInput[]
  target_refs?: MaterialRefInput[]
  panel_targets?: Array<{
    name: string
    target_ref?: MaterialRefInput
    readout_def_ref: MaterialRefInput
    panel_role: 'target' | 'housekeeping' | 'positive_control' | 'no_template_control' | 'reference' | 'other'
  }>
  expected_role_types?: string[]
  notes?: string
  tags?: string[]
}

export interface MeasurementContextRecord {
  kind: 'measurement-context'
  id: string
  name: string
  title?: string
  source_ref: MaterialRefInput
  instrument_ref: MaterialRefInput
  assay_def_ref?: MaterialRefInput
  readout_def_refs: MaterialRefInput[]
  timepoint?: string
  series_id?: string
  notes?: string
  tags?: string[]
  measurement_count?: number
  linked_measurement_ids?: string[]
}

export interface WellRoleAssignmentRecord {
  kind: 'well-role-assignment'
  id: string
  measurement_context_ref: MaterialRefInput
  subject_refs: MaterialRefInput[]
  role_family: 'sample' | 'control' | 'calibration'
  role_type: string
  readout_def_ref?: MaterialRefInput
  target_ref?: MaterialRefInput
  expected_behavior?: 'increase' | 'decrease' | 'present' | 'absent' | 'range' | 'stable' | 'none'
  calibration?: {
    standard_level?: string
    nominal_value?: number
    nominal_unit?: string
  }
  generated_context_ref?: MaterialRefInput
  generated_claim_ref?: MaterialRefInput
  generated_assertion_ref?: MaterialRefInput
  generated_evidence_ref?: MaterialRefInput
  notes?: string
}

export interface WellGroupRecord {
  kind: 'well-group'
  id: string
  name: string
  source_ref: MaterialRefInput
  well_ids: string[]
  notes?: string
  tags?: string[]
}

export interface EventGraphSummaryRecord {
  id?: string
  name?: string
  labwares?: Array<{ labwareId?: string; name?: string; labwareType?: string }>
  events?: Array<{ event_type?: string }>
}

export interface MeasurementRow {
  well: string
  metric: string
  value: number
  channelId?: string
  unit?: string
}

export interface MeasurementRecordPayload {
  kind: 'measurement'
  recordId?: string
  title?: string
  assayType?: 'qpcr' | 'plate_reader' | 'microscopy' | 'gc_ms' | 'flow' | 'other'
  eventGraphRef?: MaterialRefInput
  readEventRef?: string
  instrumentRef?: MaterialRefInput
  labwareInstanceRef?: MaterialRefInput
  measurementContextRef?: MaterialRefInput
  timepoint?: string
  seriesId?: string
  channels?: Array<{ channelId: string }>
  shape?: { wells?: number; channels?: number }
  data?: MeasurementRow[]
  artifacts?: Array<{
    role: string
    fileRef: {
      uri: string
      mimeType: string
      label: string
    }
  }>
  parserInfo?: {
    parserId: string
    parserVersion: string
    parsedAt: string
  }
}

export interface MeasurementParserValidationResult {
  parserId: string
  parserVersion: string
  assayType: string
  path: string
  rows: number
  channels: string[]
  shape?: {
    wells?: number
    channels?: number
  }
  data?: MeasurementRow[]
  preview?: MeasurementRow[]
}

export interface MeasurementUploadResponse {
  success: true
  path: string
  fileName: string
  size: number
}

type TypedRecordEnvelope<TPayload extends object> = Omit<RecordEnvelope, 'payload'> & {
  payload: TPayload
}

export interface RunWorkspaceResponse {
  run: RecordEnvelope
  eventGraph: TypedRecordEnvelope<EventGraphSummaryRecord> | null
  measurementContexts: Array<TypedRecordEnvelope<MeasurementContextRecord>>
  wellGroups: Array<TypedRecordEnvelope<WellGroupRecord>>
  wellRoleAssignmentsByContext: Record<string, Array<TypedRecordEnvelope<WellRoleAssignmentRecord>>>
  measurements: Array<TypedRecordEnvelope<MeasurementRecordPayload>>
  claims: Array<RecordEnvelope>
  evidence: Array<RecordEnvelope>
  assertions: Array<RecordEnvelope>
}

export interface RunAnalysisBundle {
  generatedAt: string
  run: {
    recordId: string
    title?: string
    status: string
    experimentId: string
    studyId?: string
    methodEventGraphId?: string
    methodPlatform?: string
    methodVocabId?: string
  }
  eventGraph: {
    recordId: string
    name?: string
    labwares: Array<{ labwareId?: string; name?: string; labwareType?: string }>
    readEvents: Array<{ eventId: string; instrument?: string; assayRef?: string; labwareId?: string }>
  } | null
  biology: {
    wellGroups: Array<{
      recordId: string
      name: string
      sourceRefId?: string
      wellIds: string[]
      notes?: string
      tags?: string[]
    }>
    assignments: Array<{
      recordId: string
      measurementContextId?: string
      roleFamily?: string
      roleType?: string
      expectedBehavior?: string
      readoutDefRef?: { id: string; type?: string; label?: string }
      targetRef?: { id: string; type?: string; label?: string }
      subjects: Array<{ id: string; labwareId?: string; wellId?: string; label?: string }>
      notes?: string
    }>
  }
  readouts: {
    contexts: Array<{
      recordId: string
      name: string
      sourceRefId?: string
      instrument?: { id: string; type?: string; label?: string }
      assay?: { id: string; type?: string; label?: string }
      readouts: Array<{ id: string; type?: string; label?: string }>
      readEventIds: string[]
      qcControlIds: string[]
      timepoint?: string
      seriesId?: string
      notes?: string
      measurementCount: number
      linkedMeasurementIds: string[]
    }>
  }
  measurements: Array<{
    recordId: string
    title?: string
    measurementContextId?: string
    readEventRef?: string
    eventGraphRef?: string
    labwareInstanceId?: string
    metrics: string[]
    channels: string[]
    rowCount: number
    data: unknown[]
  }>
  claims: {
    bundleCounts: {
      accepted: number
      rejected: number
      draft: number
    }
    bundles: Array<{
      bundleId: string
      status: 'accepted' | 'rejected' | 'draft'
      claim: { recordId: string; statement?: string } | null
      assertions: Array<{ recordId: string; statement?: string; confidence?: unknown }>
      evidence: Array<{ recordId: string; title?: string; quality?: unknown }>
    }>
  }
}

export interface CreateMeasurementContextRequest {
  name?: string
  sourceRef: MaterialRefInput
  instrumentRef: MaterialRefInput
  assayDefRef?: MaterialRefInput
  readoutDefRefs: MaterialRefInput[]
  timepoint?: string
  seriesId?: string
  notes?: string
  tags?: string[]
}

export interface CreateWellRoleAssignmentRequest {
  measurementContextRef: MaterialRefInput
  subjectRefs: MaterialRefInput[]
  roleFamily: 'sample' | 'control' | 'calibration'
  roleType: string
  readoutDefRef?: MaterialRefInput
  targetRef?: MaterialRefInput
  expectedBehavior?: 'increase' | 'decrease' | 'present' | 'absent' | 'range' | 'stable' | 'none'
  calibration?: {
    standardLevel?: string
    nominalValue?: number
    nominalUnit?: string
  }
  notes?: string
}

export interface CreateWellGroupRequest {
  name: string
  sourceRef: MaterialRefInput
  wellIds: string[]
  notes?: string
  tags?: string[]
}

export interface MeasurementIngestRequest {
  instrumentRef?: MaterialRefInput
  labwareInstanceRef?: MaterialRefInput
  eventGraphRef?: MaterialRefInput
  measurementContextRef?: MaterialRefInput
  readEventRef?: string
  timepoint?: string
  seriesId?: string
  parserId?: string
  rawData: {
    path: string
  }
}

export interface MaterialInstanceCreateRequest {
  name?: string
  materialRef?: MaterialRefInput
  materialSpecRef?: MaterialRefInput
  vendorProductRef?: MaterialRefInput
  parentMaterialInstanceRef?: MaterialRefInput
  preparedOn?: string
  concentration?: ConcentrationValue
  volume?: QuantityValue
  lot?: Record<string, unknown>
  storage?: Record<string, unknown>
  status?: string
  tags?: string[]
  biologicalState?: Record<string, unknown>
  derivedState?: Record<string, unknown>
  derivationRef?: MaterialRefInput
}

export interface MaterialDerivationCreateRequest {
  name?: string
  derivationType?: string
  inputs?: MaterialRefInput[]
  protocolRef?: MaterialRefInput
  sourceEventGraphRef?: MaterialRefInput
  conditions?: Record<string, unknown>
  notes?: string
  output?: MaterialInstanceCreateRequest
}

export interface PromoteMaterialFromContextRequest {
  sourceContextIds: string[]
  outputMode?: 'prepared-material' | 'biological-material' | 'derived-material'
  name?: string
  materialRef?: MaterialRefInput
  materialSpecRef?: MaterialRefInput
  vendorProductRef?: MaterialRefInput
  derivationType?: string
  preparedOn?: string
  volume?: QuantityValue
  storage?: Record<string, unknown>
  lot?: Record<string, unknown>
  notes?: string
  biologicalState?: Record<string, unknown>
  derivedState?: Record<string, unknown>
}

export interface LabSettings {
  materialTracking: {
    mode: 'relaxed' | 'tracked'
    allowAdHocEventInstances: boolean
  }
  policyBundleId: string
  activePolicyBundle: {
    id: string
    label: string
    level: number
    description?: string
  } | null
}

export interface FormulationSummary {
  recipeId: string
  recipeName: string
  recipeTags: string[]
  outputSpec: {
    id: string
    name: string
    materialId?: string
    materialName?: string
    vendorProductId?: string
    vendorProductLabel?: string
    concentration?: ConcentrationValue
    composition?: CompositionEntryValue[]
    solventRefId?: string
    solventLabel?: string
    grade?: string
    handling?: {
      storageTemperatureC?: number
      stabilityNote?: string
      maxFreezeThawCycles?: number
      lightSensitive?: boolean
    }
  }
  inputRoles: Array<{
    roleId: string
    roleType: string
    required: boolean
    materialRef?: { id: string; label?: string }
    vendorProductRef?: { id: string; label?: string }
    allowedMaterialSpecRefs: Array<{ id: string; label?: string }>
    measureMode?: IngredientMeasureMode
    sourceState?: IngredientSourceState
    stockConcentration?: ConcentrationValue
    targetContribution?: ConcentrationValue
    requiredAmount?: QuantityValue
    molecularWeight?: QuantityValue
    compositionSnapshot?: CompositionEntryValue[]
    quantity?: FlexibleQuantityValue
    constraints: string[]
  }>
  preferredSources?: Array<{
    roleId: string
      vendor?: string
      catalogNumber?: string
      materialRef?: { id: string; label?: string }
      materialSpecRef?: { id: string; label?: string }
      vendorProductRef?: { id: string; label?: string }
    }>
  steps: Array<{
    order: number
    instruction: string
    parameters?: Record<string, unknown>
  }>
  scale?: {
    defaultBatchVolume?: QuantityValue
    supportedBatchVolumes?: QuantityValue[]
  }
  batch?: {
    defaultOutputQuantity?: QuantityValue
    supportedOutputQuantities?: QuantityValue[]
  }
  inventory: {
    availableCount: number
    totalAvailableVolume?: QuantityValue
    recentAliquotIds: string[]
    lastPreparedAt?: string
  }
}

export interface MaterialInventoryItem {
  aliquotId: string
  name: string
  status?: string
  materialSpec: {
    id: string
    name: string
    materialId?: string
  }
  recipe?: {
    id: string
    name: string
  }
  volume?: QuantityValue
  concentration?: ConcentrationValue
  storage?: {
    temperatureC?: number
    location?: string
  }
  lot?: {
    vendor?: string
    catalogNumber?: string
    lotNumber?: string
    expirationDate?: string
  }
  freezeThawCount?: number
  createdAt?: string
  tags: string[]
}

export interface CreateFormulationRequest {
  material?: {
    id?: string
    name?: string
    domain?: string
    molecularWeight?: {
      value: number
      unit: 'g/mol'
    }
    classRefs?: Array<{
      kind: 'record' | 'ontology'
      id: string
      type?: string
      label?: string
      namespace?: string
      uri?: string
    }>
    definition?: string
    synonyms?: string[]
  }
  outputSpec: {
    id?: string
    name: string
    materialRefId?: string
    vendorProductRefId?: string
    concentration?: ConcentrationValue
    composition?: CompositionEntryValue[]
    solventRef?: MaterialRefInput
    solventRefId?: string
    grade?: string
    ph?: number
    notes?: string
    handling?: {
      storageTemperatureC?: number
      lightSensitive?: boolean
      maxFreezeThawCycles?: number
      stabilityNote?: string
    }
    tags?: string[]
  }
  recipe: {
    id?: string
    name: string
    inputRoles: RecipeInputRole[]
    steps: Array<{
      order?: number
      instruction: string
      parameters?: Record<string, unknown>
    }>
    preferredSources?: Array<{
      roleId: string
      vendor?: string
      catalogNumber?: string
      materialRefId?: string
      materialSpecRefId?: string
      vendorProductRefId?: string
    }>
    scale?: {
      defaultBatchVolume?: QuantityValue
      supportedBatchVolumes?: QuantityValue[]
    }
    batch?: {
      defaultOutputQuantity?: QuantityValue
      supportedOutputQuantities?: QuantityValue[]
    }
    tags?: string[]
  }
}

export type TemplateLabwareBinding =
  | {
      templateLabwareId: string
      kind: 'plate-snapshot'
      snapshotId: string
    }
  | {
      templateLabwareId: string
      kind: 'protocol-template'
      templateId: string
      outputId?: string
      resolvedSnapshotId?: string
    }

export interface TemplateOutputArtifact {
  outputId: string
  label: string
  kind: 'plate-snapshot'
  sourceLabwareId: string
}

export interface TemplateSearchResult {
  templateId: string
  title: string
  description?: string
  state?: string
  sourceEventGraphId?: string
  version?: string
  experimentTypes: string[]
  deck?: {
    platform?: string
    variant?: string
    placementCount: number
  }
  bindableLabwares: Array<{
    labwareId: string
    name: string
    labwareType: string
  }>
  outputs: TemplateOutputArtifact[]
  materials: string[]
  semanticKeywords: string[]
}

export interface MaterializedTemplate {
  templateId: string
  title: string
  experimentTypes: string[]
  outputs: TemplateOutputArtifact[]
  snapshot: {
    version?: string
    sourceEventGraphId?: string | null
    playbackPosition?: number
    anchorLabwareId?: string
    closure?: { labwareIds?: string[]; eventIds?: string[] }
    experimentTypes?: string[]
    outputArtifacts?: TemplateOutputArtifact[]
    events?: unknown[]
    labwares?: unknown[]
    deck?: {
      platform?: string
      variant?: string
      placements?: Array<{ slotId: string; labwareId?: string; moduleId?: string }>
    }
  }
  appliedBindings: TemplateLabwareBinding[]
}

export interface LibrarySearchResult {
  id: string
  type: string
  label: string
  schemaId: string
  keywords?: string[]
}

export interface ExecuteRecipeResponse {
  success: boolean
  recipeId: string
  recipeName: string
  preparationEventGraphId: string
  materialInstanceId: string
  materialInstanceName: string
  createdAliquotIds: string[]
  createdAliquots: Array<{
    aliquotId: string
    name: string
    materialSpecId: string
    materialSpecName?: string
    volume?: QuantityValue
    status?: string
  }>
  bindings: Array<{
    roleId: string
    aliquotId: string
    aliquotName?: string
  }>
}

export interface MaterialLineageResponse {
  material: Record<string, unknown>
  parent?: { recordId: string; kind: string; title: string }
  children: Array<{ recordId: string; kind: string; title: string }>
  derivation?: {
    recordId: string
    derivationType?: string
    inputs: Array<{ recordId: string; kind: string; title: string }>
    outputs: Array<{ recordId: string; kind: string; title: string }>
  }
}

export interface VendorSearchResult {
  vendor: 'thermo' | 'sigma'
  name: string
  catalogNumber: string
  productUrl?: string
  description?: string
  grade?: string
  formulation?: string
  declaredConcentration?: ConcentrationValue
  compositionSourceText?: string
}

export interface VendorSearchResponse {
  items: VendorSearchResult[]
  vendors: Array<{
    vendor: 'thermo' | 'sigma'
    success: boolean
    error?: string
  }>
}

export interface VendorDocumentExtractionRequest {
  fileName: string
  mediaType: string
  contentBase64?: string
  sourceUrl?: string
  title?: string
  documentKind?: 'product_sheet' | 'formulation_sheet' | 'certificate_of_analysis' | 'safety_data_sheet' | 'label' | 'other'
  note?: string
}

export interface VendorDocumentExtractionResponse {
  success: true
  vendorProductId: string
  document: Record<string, unknown>
  draft?: Record<string, unknown>
}

export interface MolecularWeightResolutionResponse {
  resolved: boolean
  source: 'chebi' | 'pubchem' | 'formula' | 'unresolved'
  molecularWeight?: {
    value: number
    unit: 'g/mol'
  }
  formula?: string
  matchedName?: string
  chebiId?: string
  pubchemCid?: number
}

// === AI Ingestion Analyze Types ===

export interface AnalyzeIngestionFileAnalysis {
  fileType: string
  contentSummary: string
  detectedStructure: string
  tableCount?: number
  rowEstimate?: number
}

export interface AnalyzeIngestionDraftSpec {
  targets: Array<{
    targetSchema: string
    recordKind: string
    idPrefix: string
    fieldMappings: Array<{
      targetField: string
      source: string
      transform?: string
    }>
    defaults?: Record<string, unknown>
  }>
  tableExtraction?: {
    method: string
    columns?: string[]
    headerRow?: number
  }
  matching?: {
    ontologyPreferences?: string[]
    batchSize?: number
  }
}

export interface AnalyzeIngestionResponse {
  success: boolean
  analysis?: AnalyzeIngestionFileAnalysis
  draftSpec?: AnalyzeIngestionDraftSpec
  questions?: string[]
  confidence?: number
  error?: string
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`

  // Only set Content-Type: application/json when there's actually a body —
  // otherwise Fastify rejects the request with "Body cannot be empty when
  // content-type is set to 'application/json'".
  const hasBody = options.body != null
  const baseHeaders: Record<string, string> = hasBody
    ? { 'Content-Type': 'application/json' }
    : {}

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...baseHeaders,
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw await ApiError.fromResponse(response)
    }

    return await response.json() as T
  } catch (error) {
    if (ApiError.isApiError(error)) {
      throw error
    }
    if (error instanceof TypeError) {
      throw new NetworkError(`Failed to connect to server (${path}): ${error.message}`)
    }
    throw error
  }
}

/**
 * API client methods for kernel endpoints.
 */
export const apiClient = {
  /**
   * Get all available schemas.
   */
  async getSchemas(): Promise<SchemaInfo[]> {
    const response = await request<SchemasResponse>('/schemas')
    return response.schemas
  },

  /**
   * Get a specific schema by ID.
   */
  async getSchema(schemaId: string): Promise<SchemaInfo> {
    return request<SchemaInfo>(`/schemas/${encodeURIComponent(schemaId)}`)
  },

  /**
   * Get UI spec for a schema. Returns null if no spec exists.
   */
  async getUiSpec(schemaId: string): Promise<UISpec | null> {
    try {
      const response = await request<UISpecResponse>(`/ui/schema/${encodeURIComponent(schemaId)}`)
      return response.spec
    } catch (error) {
      if (ApiError.isApiError(error) && error.status === 404) {
        return null
      }
      throw error
    }
  },

  /** @deprecated Use getUiSpec instead */
  async getUiHints(schemaId: string): Promise<UISpec | null> {
    return this.getUiSpec(schemaId)
  },

  /**
   * Get a record with its UI spec and schema in a single call.
   */
  async getRecordWithUI(recordId: string): Promise<RecordWithUIResponse> {
    return request<RecordWithUIResponse>(`/ui/record/${encodeURIComponent(recordId)}`)
  },

  /**
   * Get records, optionally filtered by schema.
   */
  async getRecords(schemaId?: string): Promise<RecordEnvelope[]> {
    const params = schemaId ? `?schemaId=${encodeURIComponent(schemaId)}` : ''
    const response = await request<RecordsResponse>(`/records${params}`)
    return response.records
  },

  /**
   * List records filtered by kind (type).
   * Calls GET /records?kind=<kind>&limit=<limit>&offset=<offset>
   */
  async listRecordsByKind(
    kind: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ records: RecordEnvelope[]; total: number }> {
    const params = new URLSearchParams({
      kind,
      limit: String(limit),
      offset: String(offset),
    })
    const response = await request<RecordsResponse>(`/records?${params.toString()}`)
    return {
      records: response.records,
      total: response.total ?? response.records.length,
    }
  },

  /**
   * Get all UI specs.
   * Calls GET /ui/specs and returns the array of specs.
   */
  async getAllUiSpecs(): Promise<Array<{ schemaId: string; spec: UISpec }>> {
    const response = await request<{ specs: Array<{ schemaId: string; spec: UISpec }> }>('/ui/specs')
    return response.specs
  },

  /**
   * Get a specific record by ID.
   */
  async getRecord(recordId: string): Promise<RecordEnvelope> {
    const response = await request<RecordResponse>(`/records/${encodeURIComponent(recordId)}`)
    return response.record
  },

  /**
   * Create a new record.
   * Payload must include an 'id' or 'recordId' field.
   */
  async createRecord(
    schemaId: string,
    payload: Record<string, unknown>
  ): Promise<WriteResponse> {
    return request<WriteResponse>('/records', {
      method: 'POST',
      body: JSON.stringify({ schemaId, payload }),
    })
  },

  /**
   * Update an existing record.
   */
  async updateRecord(
    recordId: string,
    payload: Record<string, unknown>
  ): Promise<WriteResponse> {
    return request<WriteResponse>(`/records/${encodeURIComponent(recordId)}`, {
      method: 'PUT',
      body: JSON.stringify({ payload }),
    })
  },

  // === Event Graph API ===

  /**
   * Save an event graph (create or update).
   */
  async saveEventGraph(
    eventGraphId: string | null,
    payload: {
      events: unknown[]
      labwares: unknown[]
      runId?: string
      name?: string
    }
  ): Promise<WriteResponse> {
    const recordId = eventGraphId || generateEventGraphId()
    const body = {
      schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
      payload: {
        id: recordId,
        ...payload,
      },
    }

    if (eventGraphId) {
      // Update existing
      return request<WriteResponse>(`/records/${encodeURIComponent(eventGraphId)}`, {
        method: 'PUT',
        body: JSON.stringify({ payload: body.payload }),
      })
    } else {
      // Create new
      return request<WriteResponse>('/records', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    }
  },

  /**
   * Load an event graph by ID.
   */
  async loadEventGraph(eventGraphId: string): Promise<{
    id: string
    events: unknown[]
    labwares: unknown[]
    runId?: string
    name?: string
  }> {
    const response = await request<RecordResponse>(`/records/${encodeURIComponent(eventGraphId)}`)
    return response.record.payload as {
      id: string
      events: unknown[]
      labwares: unknown[]
      runId?: string
      name?: string
    }
  },

  /**
   * List all event graphs.
   */
  async listEventGraphs(): Promise<RecordEnvelope[]> {
    const schemaId = encodeURIComponent('https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml')
    const response = await request<RecordsResponse>(`/records?schemaId=${schemaId}`)
    return response.records
  },

  async getPlatforms(): Promise<PlatformManifest[]> {
    const response = await request<{ platforms: PlatformManifest[] }>('/platforms')
    return response.platforms
  },

  async getPlatform(platformId: string): Promise<PlatformManifest> {
    const response = await request<{ platform: PlatformManifest }>(`/platforms/${encodeURIComponent(platformId)}`)
    return response.platform
  },

  async getFormulationsSummary(params: {
    q?: string
    outputSpecId?: string
    hasAvailableInstances?: boolean
    limit?: number
  } = {}): Promise<FormulationSummary[]> {
    const search = new URLSearchParams()
    if (params.q) search.set('q', params.q)
    if (params.outputSpecId) search.set('outputSpecId', params.outputSpecId)
    if (params.hasAvailableInstances !== undefined) search.set('hasAvailableInstances', String(params.hasAvailableInstances))
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    const response = await request<{ items: FormulationSummary[] }>(`/materials/formulations/summary${suffix}`)
    return response.items
  },

  async getMaterialInventory(params: {
    recipeId?: string
    materialSpecId?: string
    status?: string
    q?: string
    limit?: number
  } = {}): Promise<MaterialInventoryItem[]> {
    const search = new URLSearchParams()
    if (params.recipeId) search.set('recipeId', params.recipeId)
    if (params.materialSpecId) search.set('materialSpecId', params.materialSpecId)
    if (params.status) search.set('status', params.status)
    if (params.q) search.set('q', params.q)
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    const response = await request<{ items: MaterialInventoryItem[] }>(`/materials/inventory${suffix}`)
    return response.items
  },

  async createFormulation(payload: CreateFormulationRequest): Promise<{
    success: boolean
    materialId?: string
    materialSpecId: string
    recipeId: string
  }> {
    return request('/materials/formulations', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async draftFormulationFromText(payload: {
    prompt: string
  }): Promise<FormulationCopilotResponse> {
    return request('/materials/formulations/copilot/draft-from-text', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async explainFormulationDraft(payload: {
    draft: FormulationCopilotDraft
  }): Promise<FormulationCopilotResponse> {
    return request('/materials/formulations/copilot/explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async suggestMissingFormulationFields(payload: {
    draft: FormulationCopilotDraft
  }): Promise<FormulationCopilotResponse> {
    return request('/materials/formulations/copilot/suggest-missing', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async flattenFormulationComposition(payload: {
    draft: FormulationCopilotDraft
  }): Promise<FormulationCopilotResponse> {
    return request('/materials/formulations/copilot/flatten', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async executeRecipe(
    recipeId: string,
    payload: {
      scale?: number
      outputCount?: number
      outputMode?: 'batch' | 'batch-and-split'
      outputVolume?: { value: number; unit: string }
      bindings?: Record<string, { aliquotId: string }>
      outputMetadata?: {
        containerType?: string
        storageLocation?: string
        barcodePrefix?: string
      }
      notes?: string
    } = {}
  ): Promise<ExecuteRecipeResponse> {
    return request(`/materials/recipes/${encodeURIComponent(recipeId)}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async searchVendorProducts(params: {
    q: string
    vendors?: Array<'thermo' | 'sigma'>
    limit?: number
  }): Promise<VendorSearchResponse> {
    const qs = new URLSearchParams({ q: params.q })
    if (params.vendors?.length) qs.set('vendors', params.vendors.join(','))
    if (typeof params.limit === 'number') qs.set('limit', String(params.limit))
    return request<VendorSearchResponse>(`/vendors/search?${qs.toString()}`)
  },

  async extractVendorProductDocument(
    vendorProductId: string,
    payload: VendorDocumentExtractionRequest,
  ): Promise<VendorDocumentExtractionResponse> {
    return request<VendorDocumentExtractionResponse>(`/vendors/${encodeURIComponent(vendorProductId)}/documents/extract`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async resolveOntologyMolecularWeight(params: {
    namespace?: string
    id?: string
    label?: string
    uri?: string
  }): Promise<MolecularWeightResolutionResponse> {
    const search = new URLSearchParams()
    if (params.namespace) search.set('namespace', params.namespace)
    if (params.id) search.set('id', params.id)
    if (params.label) search.set('label', params.label)
    if (params.uri) search.set('uri', params.uri)
    return request<MolecularWeightResolutionResponse>(`/chemistry/molecular-weight?${search.toString()}`)
  },

  async searchMaterials(params: {
    q?: string
    limit?: number
    category?: string
    status?: string
    vendor?: string
    derivationType?: string
  } = {}): Promise<{ items: MaterialSearchItem[] }> {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (typeof params.limit === 'number') qs.set('limit', String(params.limit))
    if (params.category) qs.set('category', params.category)
    if (params.status) qs.set('status', params.status)
    if (params.vendor) qs.set('vendor', params.vendor)
    if (params.derivationType) qs.set('derivationType', params.derivationType)
    const suffix = qs.toString()
    return request(`/materials/search${suffix ? `?${suffix}` : ''}`)
  },

  async getMaterial(recordId: string): Promise<RecordEnvelope> {
    const response = await request<{ record: RecordEnvelope }>(`/materials/${encodeURIComponent(recordId)}`)
    return response.record
  },

  async updateMaterialStatus(recordId: string, body: { status: string; note?: string; changedAt?: string }): Promise<{ success: true; status: string }> {
    return request(`/materials/${encodeURIComponent(recordId)}/status`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getMaterialLineage(recordId: string): Promise<MaterialLineageResponse> {
    return request(`/materials/${encodeURIComponent(recordId)}/lineage`)
  },

  async createMaterialInstance(body: MaterialInstanceCreateRequest): Promise<{ success: true; materialInstanceId: string }> {
    return request('/materials/instances', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async splitMaterialInstance(
    materialInstanceId: string,
    body: {
      items?: Array<{
        id?: string
        name?: string
        volume?: QuantityValue
        lot?: Record<string, unknown>
        storage?: Record<string, unknown>
        tags?: string[]
      }>
      count?: number
      defaultVolume?: QuantityValue
    },
  ): Promise<{ success: true; aliquotIds: string[] }> {
    return request(`/materials/instances/${encodeURIComponent(materialInstanceId)}/split`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async createMaterialDerivation(body: MaterialDerivationCreateRequest): Promise<{ success: true; derivationId: string; materialInstanceId: string }> {
    return request('/materials/derivations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async promoteMaterialFromContext(body: PromoteMaterialFromContextRequest): Promise<{ success: true; materialInstanceId: string; derivationId?: string }> {
    return request('/materials/promote-from-context', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getLabSettings(): Promise<LabSettings> {
    return request<LabSettings>('/settings/lab')
  },

  async patchLabSettings(patch: Partial<LabSettings>): Promise<LabSettings> {
    return request<LabSettings>('/settings/lab', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  async listSemanticsInstruments(params: {
    instrumentType?: string
  } = {}): Promise<{ items: InstrumentDefinition[] }> {
    const qs = new URLSearchParams()
    if (params.instrumentType) qs.set('instrumentType', params.instrumentType)
    return request(`/semantics/instruments${qs.toString() ? `?${qs.toString()}` : ''}`)
  },

  async listSemanticsReadouts(params: {
    instrumentType?: string
  } = {}): Promise<{ items: ReadoutDefinition[] }> {
    const qs = new URLSearchParams()
    if (params.instrumentType) qs.set('instrumentType', params.instrumentType)
    return request(`/semantics/readouts${qs.toString() ? `?${qs.toString()}` : ''}`)
  },

  async listSemanticsAssays(params: {
    instrumentType?: string
  } = {}): Promise<{ items: AssayDefinition[] }> {
    const qs = new URLSearchParams()
    if (params.instrumentType) qs.set('instrumentType', params.instrumentType)
    return request(`/semantics/assays${qs.toString() ? `?${qs.toString()}` : ''}`)
  },

  async listMeasurementContexts(sourceRef: string): Promise<{ items: MeasurementContextRecord[] }> {
    const qs = new URLSearchParams({ sourceRef })
    return request(`/semantics/measurement-contexts?${qs.toString()}`)
  },

  async listWellGroups(sourceRef: string): Promise<{ items: WellGroupRecord[] }> {
    const qs = new URLSearchParams({ sourceRef })
    return request(`/semantics/well-groups?${qs.toString()}`)
  },

  async createWellGroup(body: CreateWellGroupRequest): Promise<{ success: true; wellGroupId: string }> {
    return request('/semantics/well-groups', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async createMeasurementContext(body: CreateMeasurementContextRequest): Promise<{ success: true; measurementContextId: string }> {
    return request('/semantics/measurement-contexts', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async listWellRoleAssignments(measurementContextRef: string): Promise<{ items: WellRoleAssignmentRecord[] }> {
    const qs = new URLSearchParams({ measurementContextRef })
    return request(`/semantics/well-role-assignments?${qs.toString()}`)
  },

  async createWellRoleAssignment(body: CreateWellRoleAssignmentRequest): Promise<{ success: true; assignmentId: string; generatedRecordIds: string[] }> {
    return request('/semantics/well-role-assignments', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getRunWorkspace(runId: string): Promise<RunWorkspaceResponse> {
    return request(`/runs/${encodeURIComponent(runId)}/workspace`)
  },

  async getRunAnalysisBundle(runId: string): Promise<RunAnalysisBundle> {
    return request(`/runs/${encodeURIComponent(runId)}/analysis-bundle`)
  },

  async getRunAiContext(runId: string, tab: string): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/ai-context?tab=${encodeURIComponent(tab)}`)
  },

  // === Result-to-Evidence Pipeline ===

  interpretResults(runId: string, body: { measurementContextIds?: string[] }): { url: string; init: RequestInit } {
    return {
      url: `${API_BASE}/runs/${encodeURIComponent(runId)}/results/interpret`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    }
  },

  assembleEvidence(runId: string, body: { measurementContextIds?: string[]; includeWellGrouping?: boolean }): { url: string; init: RequestInit } {
    return {
      url: `${API_BASE}/runs/${encodeURIComponent(runId)}/evidence/assemble`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    }
  },

  draftAssertions(runId: string, body: { evidenceIds?: string[]; checkContradictions?: boolean }): { url: string; init: RequestInit } {
    return {
      url: `${API_BASE}/runs/${encodeURIComponent(runId)}/assertions/draft`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    }
  },

  checkContradictions(runId: string, body: { statement: string; scope?: string }): { url: string; init: RequestInit } {
    return {
      url: `${API_BASE}/runs/${encodeURIComponent(runId)}/assertions/check-contradictions`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    }
  },

  async validateMeasurementParser(body: { parserId: string; path: string }): Promise<{ result: MeasurementParserValidationResult }> {
    return request('/measurements/validate-parser', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async uploadRawMeasurementFile(body: { runId?: string; fileName: string; contentBase64: string }): Promise<MeasurementUploadResponse> {
    return request('/measurements/upload-raw', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async ingestMeasurement(body: MeasurementIngestRequest): Promise<{ success: boolean; recordId?: string }> {
    return request('/measurements/ingest', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // === Knowledge/Semantic API ===

  /**
   * Save multiple knowledge records (claims, assertions, evidence, contexts).
   * Used by the semantic compiler to persist compiled intents.
   * 
   * NOTE: Knowledge records need schema IDs. We infer from the 'kind' field.
   */
  async saveKnowledgeRecords(records: Array<{ id: string; record: Record<string, unknown> }>): Promise<{
    success: boolean
    saved: string[]
    failed: Array<{ id: string; error: string }>
  }> {
    const results = {
      success: true,
      saved: [] as string[],
      failed: [] as Array<{ id: string; error: string }>,
    }

    // Map kind to schema ID (exact IDs from backend /api/schemas)
    const schemaMap: Record<string, string> = {
      'claim': 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
      'assertion': 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml',
      'evidence': 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml',
      'context': 'computable-lab/context',
    }

    // Save records sequentially to maintain dependencies
    for (const { id, record } of records) {
      try {
        // Determine schema from record kind (or lack thereof for context)
        const kind = (record as { kind?: string }).kind || 'context'
        const schemaId = schemaMap[kind]
        
        if (!schemaId) {
          throw new Error(`Unknown record kind: ${kind}`)
        }

        console.log(`Saving ${kind} record ${id} with schema ${schemaId}`)
        console.log('Record data:', JSON.stringify(record, null, 2))

        // Use createRecord (POST) for new records
        await this.createRecord(schemaId, record)
        results.saved.push(id)
        console.log(`✅ Successfully saved ${id}`)
      } catch (error) {
        results.success = false
        const errorMsg = error instanceof ApiError 
          ? `${error.message} (${error.status}): ${JSON.stringify(error.details)}`
          : error instanceof Error ? error.message : String(error)
        
        console.error(`❌ Failed to save ${id}:`, errorMsg)
        console.error('Record that failed:', record)
        
        results.failed.push({
          id,
          error: errorMsg,
        })
      }
    }

    return results
  },

  // === Config API ===

  /**
   * Get editable config (repositories + ai, secrets redacted).
   */
  async getConfig(): Promise<ConfigResponse> {
    return request<ConfigResponse>('/config')
  },

  /**
   * Sparse-update config. Returns updated config on success.
   */
  async patchConfig(patch: Record<string, unknown>): Promise<ConfigPatchResponse> {
    return request<ConfigPatchResponse>('/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  /**
   * Test AI settings and optionally discover provider models.
   */
  async testAiConfig(req: AiConnectionTestRequest): Promise<AiConnectionTestResponse> {
    return request<AiConnectionTestResponse>('/config/ai/test', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  /**
   * List saved AI profiles.
   */
  async listAiProfiles(): Promise<{
    profiles: Array<{ name: string; provider: string; baseUrl: string; model: string; active: boolean }>;
    activeProfile: string | null;
  }> {
    return request('/config/ai/profiles')
  },

  /**
   * Save an AI profile (create or update).
   */
  async saveAiProfile(name: string, profile: { inference: Record<string, unknown>; agent?: Record<string, unknown> }): Promise<{ success: boolean; message?: string }> {
    return request(`/config/ai/profiles/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    })
  },

  /**
   * Activate an AI profile — copies its settings into the active inference config.
   */
  async activateAiProfile(name: string): Promise<{ success: boolean; message?: string; config?: unknown }> {
    return request(`/config/ai/profiles/${encodeURIComponent(name)}/activate`, {
      method: 'POST',
    })
  },

  /**
   * Delete an AI profile.
   */
  async deleteAiProfile(name: string): Promise<{ success: boolean; message?: string }> {
    return request(`/config/ai/profiles/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
  },

  async listIngestionJobs(): Promise<IngestionJobListResponse> {
    return request<IngestionJobListResponse>('/ingestion/jobs')
  },

  async getIngestionJob(id: string): Promise<IngestionJobDetail> {
    return request<IngestionJobDetail>(`/ingestion/jobs/${encodeURIComponent(id)}`)
  },

  async createIngestionJob(body: CreateIngestionJobRequest): Promise<IngestionJobDetail> {
    return request<IngestionJobDetail>('/ingestion/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async runIngestionJob(id: string, body: { source?: CreateIngestionJobRequest['source'] }): Promise<IngestionJobDetail> {
    return request<IngestionJobDetail>(`/ingestion/jobs/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async approveIngestionBundle(jobId: string, bundleId: string): Promise<IngestionJobDetail> {
    return request<IngestionJobDetail>(`/ingestion/jobs/${encodeURIComponent(jobId)}/bundles/${encodeURIComponent(bundleId)}/approve`, {
      method: 'POST',
    })
  },

  async publishIngestionBundle(jobId: string, bundleId: string): Promise<{ detail: IngestionJobDetail; publishResult: IngestionPublishResult }> {
    return request<{ detail: IngestionJobDetail; publishResult: IngestionPublishResult }>(`/ingestion/jobs/${encodeURIComponent(jobId)}/bundles/${encodeURIComponent(bundleId)}/publish`, {
      method: 'POST',
    })
  },

  // === AI Ingestion ===

  async inferSourceKind(body: { fileName: string; mimeType: string; preview: string }): Promise<SourceKindSuggestion> {
    return request<SourceKindSuggestion>('/ai/infer-source-kind', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async suggestIngestionMapping(body: { jobId: string; suggestedKind: string }): Promise<RunMappingResponse> {
    return request<RunMappingResponse>('/ai/suggest-ingestion-mapping', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async explainIngestionIssue(body: { issueId: string; jobId: string }): Promise<IssueExplanation> {
    return request<IssueExplanation>('/ai/explain-ingestion-issue', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async analyzeIngestion(file: File, prompt: string): Promise<AnalyzeIngestionResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('prompt', prompt)
    
    const url = `${API_BASE}/ai/analyze-ingestion`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw await ApiError.fromResponse(response)
      }

      return await response.json() as AnalyzeIngestionResponse
    } catch (error) {
      if (ApiError.isApiError(error)) {
        throw error
      }
      if (error instanceof TypeError) {
        throw new NetworkError(`Failed to connect to server (/ai/analyze-ingestion): ${error.message}`)
      }
      throw error
    }
  },

  // === Git API ===

  /**
   * Get git status (branch, modified files, etc).
   */
  async getGitStatus(): Promise<{
    success: boolean
    status?: {
      branch: string
      ahead: number
      behind: number
      modified: string[]
      staged: string[]
      untracked: string[]
      isClean: boolean
    }
    error?: string
  }> {
    return request('/git/status')
  },

  /**
   * Commit changes and push to remote.
   */
  async commitAndPush(message: string): Promise<{
    success: boolean
    commit?: {
      sha: string
      message: string
      author: string
      timestamp: string
    }
    error?: string
    pushed?: boolean
  }> {
    return request('/git/commit-push', {
      method: 'POST',
      body: JSON.stringify({ message, push: true }),
    })
  },

  /**
   * Pull latest changes from remote.
   */
  async gitSync(): Promise<{
    success: boolean
    result?: {
      success: boolean
      pulledCommits?: number
      status?: string
      error?: string
    }
    error?: string
  }> {
    return request('/git/sync', {
      method: 'POST',
    })
  },

  /**
   * Promote context(s) to reusable artifact(s) with provenance.
   */
  async promoteContext(requestBody: PromoteContextRequest): Promise<PromoteContextResponse> {
    return request<PromoteContextResponse>('/library/promote-context', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },

  /**
   * List assets from a specific library category.
   */
  async getLibraryAssets(type: string, limit: number = 100): Promise<LibraryAssetListResponse> {
    return request<LibraryAssetListResponse>(`/library/${encodeURIComponent(type)}?limit=${limit}`)
  },

  async searchLibrary(params: {
    q?: string
    types?: string[]
    limit?: number
  } = {}): Promise<{ results: LibrarySearchResult[]; total: number }> {
    const search = new URLSearchParams()
    if (params.q) search.set('q', params.q)
    if (params.types?.length) search.set('types', params.types.join(','))
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request(`/library/search${suffix}`)
  },

  // === Component Graph API ===

  async listComponents(state?: 'draft' | 'published' | 'deprecated', limit: number = 100): Promise<ComponentListResponse> {
    const params = new URLSearchParams()
    if (state) params.set('state', state)
    params.set('limit', String(limit))
    const suffix = params.toString()
    return request<ComponentListResponse>(`/components${suffix ? `?${suffix}` : ''}`)
  },

  async createComponent(body: ComponentCreateRequest): Promise<ComponentCreateResponse> {
    return request<ComponentCreateResponse>('/components', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async updateComponent(componentId: string, body: Record<string, unknown>): Promise<ComponentCreateResponse> {
    return request<ComponentCreateResponse>(`/components/${encodeURIComponent(componentId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  async getComponent(componentId: string): Promise<{ component: RecordEnvelope }> {
    return request<{ component: RecordEnvelope }>(`/components/${encodeURIComponent(componentId)}`)
  },

  async searchTemplates(params: {
    q?: string
    platform?: string
    deckVariant?: string
    experimentType?: string
    material?: string
    semantic?: string
    limit?: number
  } = {}): Promise<{ items: TemplateSearchResult[]; total: number }> {
    const search = new URLSearchParams()
    if (params.q) search.set('q', params.q)
    if (params.platform) search.set('platform', params.platform)
    if (params.deckVariant) search.set('deckVariant', params.deckVariant)
    if (params.experimentType) search.set('experimentType', params.experimentType)
    if (params.material) search.set('material', params.material)
    if (params.semantic) search.set('semantic', params.semantic)
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request(`/templates/search${suffix}`)
  },

  async materializeTemplate(
    templateId: string,
    bindings: TemplateLabwareBinding[] = []
  ): Promise<MaterializedTemplate> {
    return request(`/templates/${encodeURIComponent(templateId)}/materialize`, {
      method: 'POST',
      body: JSON.stringify({ bindings }),
    })
  },

  async publishComponent(componentId: string, version?: string, notes?: string): Promise<ComponentPublishResponse> {
    return request<ComponentPublishResponse>(`/components/${encodeURIComponent(componentId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({
        ...(version ? { version } : {}),
        ...(notes ? { notes } : {}),
      }),
    })
  },

  async instantiateComponent(
    componentId: string,
    body: {
      sourceRef?: Record<string, unknown>
      componentVersionRef?: Record<string, unknown>
      bindings?: Record<string, unknown>
      renderMode?: 'collapsed' | 'expanded'
      notes?: string
    } = {}
  ): Promise<ComponentInstantiateResponse> {
    return request<ComponentInstantiateResponse>(`/components/${encodeURIComponent(componentId)}/instantiate`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getComponentInstanceStatus(instanceId: string): Promise<ComponentInstanceStatusResponse> {
    return request<ComponentInstanceStatusResponse>(`/components/instances/${encodeURIComponent(instanceId)}/status`)
  },

  async upgradeComponentInstance(instanceId: string): Promise<ComponentInstantiateResponse> {
    return request<ComponentInstantiateResponse>(`/components/instances/${encodeURIComponent(instanceId)}/upgrade`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  async suggestComponentsFromEventGraph(eventGraphId: string, minOccurrences: number = 2): Promise<ComponentSuggestionResponse> {
    return request<ComponentSuggestionResponse>('/components/suggest-from-event-graph', {
      method: 'POST',
      body: JSON.stringify({ eventGraphId, minOccurrences }),
    })
  },

  // === Protocol API ===

  async saveProtocolFromEventGraph(eventGraphId: string, title?: string, tags?: string[]): Promise<{ success: boolean; recordId: string }> {
    return request<{ success: boolean; recordId: string }>('/protocols/from-event-graph', {
      method: 'POST',
      body: JSON.stringify({
        eventGraphId,
        ...(title ? { title } : {}),
        ...(tags ? { tags } : {}),
      }),
    })
  },

  async listProtocols(limit: number = 200): Promise<RecordEnvelope[]> {
    const schemaId = encodeURIComponent('https://computable-lab.com/schema/computable-lab/protocol.schema.yaml')
    const response = await request<RecordsResponse>(`/records?schemaId=${schemaId}&limit=${limit}`)
    return response.records
  },

  // === Tag Suggestion API ===

  /**
   * Get tag/keyword suggestions from existing records.
   */
  async suggestTags(
    query: string,
    field: 'keywords' | 'tags',
    limit: number = 20,
  ): Promise<{ suggestions: Array<{ value: string; count: number }>; total: number }> {
    const params = new URLSearchParams({ q: query, field, limit: String(limit) })
    return request(`/tags/suggest?${params.toString()}`)
  },

  /**
   * Draft a record using AI from natural language prompt.
   * POSTs to /ai/draft-record with schemaId and prompt.
   */
  async draftRecord(
    schemaId: string,
    prompt: string
  ): Promise<{ success: boolean; payload?: Record<string, unknown>; error?: string; notes?: string[] }> {
    return request('/ai/draft-record', {
      method: 'POST',
      body: JSON.stringify({ schemaId, prompt }),
    })
  },

  /**
   * Precompile a record from search result context.
   * Takes a schema ID and search result context to produce a pre-filled record payload.
   * POSTs to /ai/precompile-record with schemaId, title, snippet, and optional url.
   */
  async precompileRecord(
    schemaId: string,
    title: string,
    snippet: string,
    url?: string
  ): Promise<{ success: boolean; payload?: Record<string, unknown>; error?: string; notes?: string[] }> {
    return request('/ai/precompile-record', {
      method: 'POST',
      body: JSON.stringify({ schemaId, title, snippet, url }),
    })
  },

  /**
   * Get related records (reverse references) for a given record.
   * Calls GET /records/:id/related?limit=<limit>
   */
  async getRelatedRecords(
    recordId: string,
    limit?: number
  ): Promise<{ related: Array<{ recordId: string; schemaId: string; kind: string; title: string; refField: string }> }> {
    const params = new URLSearchParams({ limit: String(limit || 50) })
    const response = await request<{ related: Array<{ recordId: string; schemaId: string; kind: string; title: string; refField: string }> }>(
      `/records/${encodeURIComponent(recordId)}/related?${params.toString()}`
    )
    return response
  },

  /**
   * Advance a record's lifecycle state by triggering an event.
   * Calls PUT /records/:recordId with the new state.
   */
  async advanceRecordState(
    recordId: string,
    event: string,
    actorId?: string
  ): Promise<WriteResponse> {
    return request<WriteResponse>(`/records/${encodeURIComponent(recordId)}/lifecycle/advance`, {
      method: 'PUT',
      body: JSON.stringify({ event, actorId }),
    })
  },

  /**
   * Add a term to the local vocabulary.
   * This is a stub method that logs a warning and returns a resolved promise.
   * TODO: Implement actual API endpoint for local vocabulary management.
   */
  async addLocalVocabTerm(
    refKind: string,
    term: { value: string; iri: string }
  ): Promise<{ success: boolean; termId?: string }> {
    console.warn('addLocalVocabTerm is a stub - no backend endpoint implemented yet', { refKind, term });
    return { success: true };
  },

  /**
   * Search records by kind (type).
   * Calls GET /tree/search?q=<query>&kind=<kind>&limit=<limit>
   */
  async searchRecordsByKind(
    query: string,
    kind: string,
    limit: number = 15
  ): Promise<{ records: Array<{ recordId: string; title: string; kind: string }>; total: number }> {
    const params = new URLSearchParams({ q: query, kind, limit: String(limit) });
    const response = await fetch(`${API_BASE}/tree/search?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    return response.json() as Promise<{ records: Array<{ recordId: string; title: string; kind: string }>; total: number }>;
  },

  async bindProtocol(
    protocolId: string,
    bindings?: Record<string, unknown> & {
      executionPlanRef?: string | { kind?: string; id?: string; type?: string }
    }
  ): Promise<{ success: boolean; plannedRunId: string }> {
    return request<{ success: boolean; plannedRunId: string }>(`/protocols/${encodeURIComponent(protocolId)}/bind`, {
      method: 'POST',
      body: JSON.stringify({
        ...(bindings ? { bindings } : {}),
      }),
    })
  },

  // === Execution Planning API ===

  async validateExecutionPlan(executionPlanId: string): Promise<{
    success: boolean
    executionPlanId: string
    executionEnvironmentId: string
    eventGraphId: string
    validation: {
      valid: boolean
      issues: Array<{
        severity: 'error' | 'warning'
        code: string
        path: string
        message: string
      }>
    }
  }> {
    return request('/execution-plans/validate', {
      method: 'POST',
      body: JSON.stringify({ executionPlanId }),
    })
  },

  async emitExecutionPlan(
    executionPlanId: string,
    targetPlatform: string,
    options?: { assistEmitter?: 'default' | 'local' | 'pyalab' }
  ): Promise<{
    success: boolean
    executionPlanId: string
    robotPlanId: string
    emitter?: string
    emitterVersion?: string
    artifacts: Array<{
      target: 'pylabrobot' | 'pyalab' | 'opentrons_api'
      path: string
      sha256: string
      generator_version: string
    }>
  }> {
    return request(`/execution-plans/${encodeURIComponent(executionPlanId)}/emit`, {
      method: 'POST',
      body: JSON.stringify({
        targetPlatform,
        ...(options?.assistEmitter ? { assistEmitter: options.assistEmitter } : {}),
      }),
    })
  },

  getRobotPlanArtifactUrl(
    robotPlanId: string,
    role?: string
  ): string {
    const query = role ? `?role=${encodeURIComponent(role)}` : ''
    return `${API_BASE}/robot-plans/${encodeURIComponent(robotPlanId)}/artifact${query}`
  },

  async saveExecutionPlan(
    executionPlanRecordId: string | null,
    payload: Record<string, unknown>
  ): Promise<WriteResponse> {
    const schemaId = 'https://computable-lab.com/schema/computable-lab/execution-plan.schema.yaml'
    if (executionPlanRecordId) {
      try {
        return await request<WriteResponse>(`/records/${encodeURIComponent(executionPlanRecordId)}`, {
          method: 'PUT',
          body: JSON.stringify({ payload }),
        })
      } catch (error) {
        // Upsert behavior: new plan IDs are user-editable and may not exist yet.
        // If update misses, create with the same payload/recordId.
        if (ApiError.isApiError(error) && error.status === 404) {
          return request<WriteResponse>('/records', {
            method: 'POST',
            body: JSON.stringify({ schemaId, payload }),
          })
        }
        throw error
      }
    }
    return request<WriteResponse>('/records', {
      method: 'POST',
      body: JSON.stringify({ schemaId, payload }),
    })
  },

  async listExecutionEnvironments(limit: number = 200): Promise<RecordEnvelope[]> {
    const schemaId = encodeURIComponent('https://computable-lab.com/schema/computable-lab/execution-environment.schema.yaml')
    const response = await request<RecordsResponse>(`/records?schemaId=${schemaId}&limit=${limit}`)
    return response.records
  },

  async saveExecutionEnvironment(
    executionEnvironmentRecordId: string | null,
    payload: Record<string, unknown>
  ): Promise<WriteResponse> {
    const schemaId = 'https://computable-lab.com/schema/computable-lab/execution-environment.schema.yaml'
    if (executionEnvironmentRecordId) {
      try {
        return await request<WriteResponse>(`/records/${encodeURIComponent(executionEnvironmentRecordId)}`, {
          method: 'PUT',
          body: JSON.stringify({ payload }),
        })
      } catch (error) {
        if (ApiError.isApiError(error) && error.status === 404) {
          return request<WriteResponse>('/records', {
            method: 'POST',
            body: JSON.stringify({ schemaId, payload }),
          })
        }
        throw error
      }
    }
    return request<WriteResponse>('/records', {
      method: 'POST',
      body: JSON.stringify({ schemaId, payload }),
    })
  },

  async listExecutionPlans(limit: number = 200): Promise<RecordEnvelope[]> {
    const schemaId = encodeURIComponent('https://computable-lab.com/schema/computable-lab/execution-plan.schema.yaml')
    const response = await request<RecordsResponse>(`/records?schemaId=${schemaId}&limit=${limit}`)
    return response.records
  },

  async createPlannedRun(body: {
    title: string
    sourceType: 'protocol' | 'event-graph'
    sourceRef: { kind: 'record'; id: string; type?: string }
    bindings?: Record<string, unknown>
  }): Promise<{ success: boolean; recordId?: string }> {
    return request('/planned-runs', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async orchestrateExecution(body: {
    plannedRunId?: string
    robotPlanId?: string
    targetPlatform?: 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex'
    parameters?: Record<string, unknown>
    dryRun?: boolean
  }): Promise<{
    success: boolean
    plannedRunId?: string
    robotPlanId?: string
    targetPlatform?: string
    normalizedParameters?: Record<string, unknown>
    executionRunId?: string
    logId?: string
    status?: 'queued' | 'completed' | 'error'
    taskId?: string
    dryRun?: boolean
  }> {
    return request('/execution/orchestrate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // === AI Material Endpoints ===

  async draftMaterialFromText(body: { prompt: string }): Promise<MaterialDraftResponse> {
    return request<MaterialDraftResponse>('/ai/draft-material', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async smartSearchMaterials(body: {
    query: string
    includeOntology?: boolean
    includeVendor?: boolean
  }): Promise<MaterialSmartSearchResponse> {
    return request<MaterialSmartSearchResponse>('/ai/search-materials', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async reviewMaterialComposition(body: { materialId: string }): Promise<MaterialCompositionReviewResponse> {
    return request<MaterialCompositionReviewResponse>('/ai/review-material-composition', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async checkMaterialDuplicate(body: { name: string; kind?: string }): Promise<MaterialDuplicateCheckResponse> {
    return request<MaterialDuplicateCheckResponse>('/ai/check-material-duplicate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // === Run-Centered Draft/Accept APIs ===

  async draftRunEventGraph(runId: string, body: { prompt: string; editorContext?: Record<string, unknown> }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/event-graph/draft`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async acceptRunEventGraph(runId: string, body: { events: Array<Record<string, unknown>>; resolutions?: Record<string, string> }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/event-graph/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getRunMeaning(runId: string): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/meaning`)
  },

  async draftRunMeaning(runId: string, body: { prompt: string }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/meaning/draft`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async acceptRunMeaning(runId: string, body: { changes: Array<{ changeType: string; record: Record<string, unknown> }> }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/meaning/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getRunReadouts(runId: string): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/readouts`)
  },

  async createRunResults(runId: string, body: { fileName?: string; fileRef?: string; suggestedParser?: string; measurementContextId?: string }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/results`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getRunResults(runId: string): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/results`)
  },

  async approveRunResults(runId: string, jobId: string, body: { mappings: Record<string, unknown> }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/results/${encodeURIComponent(jobId)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async draftRunEvidence(runId: string, body: { prompt: string; measurementContextFilter?: string; literatureSourceIds?: string[] }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/evidence/draft`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async acceptRunEvidence(runId: string, body: { records: Array<{ kind: 'claim' | 'assertion' | 'evidence'; record: Record<string, unknown> }> }): Promise<Record<string, unknown>> {
    return request(`/runs/${encodeURIComponent(runId)}/evidence/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async getReadinessReport(plannedRunId: string): Promise<{
    plannedRunId: string
    overallStatus: 'ready' | 'warnings' | 'blocked'
    operator: {
      personId: string | null
      authorization: {
        status: string
        matchingAuthorizations: Array<{ id: string; status: string; expiresAt?: string }>
        trainingGaps: Array<{ trainingMaterialId: string; reason: string }>
      } | null
    }
    equipment: Array<{
      equipmentId: string
      name: string
      calibration: { status: string; dueAt: string | null; daysSinceLast: number | null }
    }>
    summary: { totalEquipment: number; calibrationIssues: number; authorizationIssues: number; trainingGaps: number }
  }> {
    const response = await request<{
      plannedRunId: string
      overallStatus: 'ready' | 'warnings' | 'blocked'
      operator: {
        personId: string | null
        authorization: {
          status: string
          matchingAuthorizations: Array<{ id: string; status: string; expiresAt?: string }>
          trainingGaps: Array<{ trainingMaterialId: string; reason: string }>
        } | null
      }
      equipment: Array<{
        equipmentId: string
        name: string
        calibration: { status: string; dueAt: string | null; daysSinceLast: number | null }
      }>
      summary: { totalEquipment: number; calibrationIssues: number; authorizationIssues: number; trainingGaps: number }
    }>(`/execution/readiness?plannedRunId=${encodeURIComponent(plannedRunId)}`)
    return response
  },

  /**
   * Get valid transitions for a record in a lifecycle.
   * Calls GET /lifecycle/:lifecycleId/transitions?state=:currentState&actorId=:actorId
   * Returns empty array if endpoint not available (404).
   */
  async getValidTransitions(
    _recordId: string,
    lifecycleId: string,
    actorId?: string
  ): Promise<{
    transitions: Array<{
      event: string
      targetState: string
      label: string
      role: string
      allowed: boolean
    }>
  }> {
    const params = new URLSearchParams({ state: 'draft' })
    if (actorId) params.set('actorId', actorId)
    
    try {
      const response = await request<{
        transitions: Array<{
          event: string
          targetState: string
          label: string
          role: string
          allowed: boolean
        }>
      }>(`/lifecycle/${encodeURIComponent(lifecycleId)}/transitions?${params.toString()}`)
      return response
    } catch (error) {
      if (ApiError.isApiError(error) && error.status === 404) {
        return { transitions: [] }
      }
      throw error
    }
  },

  /**
   * Search records by query and kinds.
   * Calls POST /ai/search-records with { query, kinds }.
   * Returns combined local and web (Exa) search results.
   */
  async searchRecords(
    query: string,
    kinds: string[]
  ): Promise<{
    results: Array<{
      origin: 'local' | 'web'
      recordId?: string
      title: string
      snippet: string
      url?: string
      kind?: string
      schemaId?: string
    }>
    sources: string[]
  }> {
    return request('/ai/search-records', {
      method: 'POST',
      body: JSON.stringify({ query, kinds }),
    })
  },
}

/**
 * Generate a unique event graph ID.
 */
function generateEventGraphId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)
  return `EVG-${timestamp}-${random}`
}

export type ApiClient = typeof apiClient
