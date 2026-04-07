/**
 * Types mirroring the computable-lab kernel models.
 * The UI treats these as canonical - no local derivation or validation.
 */

/**
 * The envelope wrapping all records in the kernel.
 */
export interface RecordEnvelope {
  recordId: string
  schemaId: string
  payload: Record<string, unknown>
  meta?: {
    kind?: string
    path?: string
    commitSha?: string
  }
}

/**
 * Schema metadata returned from the kernel.
 */
export interface SchemaInfo {
  id: string
  path: string
  title: string
  description?: string
  dependencyCount?: number
  schema?: JsonSchema
}

/**
 * Response from GET /schemas endpoint.
 */
export interface SchemasResponse {
  schemas: SchemaInfo[]
  total: number
}

/**
 * Response from GET /records endpoint.
 */
export interface RecordsResponse {
  records: RecordEnvelope[]
  total: number
}

/**
 * Response from GET /records/:id endpoint.
 */
export interface RecordResponse {
  record: RecordEnvelope
}

/**
 * JSON Schema structure (simplified for UI use).
 */
export interface JsonSchema {
  $id?: string
  $schema?: string
  title?: string
  description?: string
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  [key: string]: unknown
}

/**
 * Validation result from kernel AJV validation.
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  path: string
  message: string
  keyword?: string
  params?: Record<string, unknown>
}

/**
 * Lint result from kernel linting rules.
 */
export interface LintResult {
  passed: boolean
  diagnostics: LintDiagnostic[]
}

export interface LintDiagnostic {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  message: string
  path?: string
}

/**
 * @deprecated Use UISpec from './uiSpec' instead. Kept for backward compat.
 */
export type { UISpec as UiHints } from './uiSpec'

/**
 * Response from write operations (POST/PUT).
 */
export interface WriteResponse {
  record: RecordEnvelope
  validation: ValidationResult
  lint: LintResult
}
