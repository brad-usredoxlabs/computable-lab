/**
 * GC-13 (leg D) — evidence source-type mapping, as DATA (OQ-1 ruling).
 *
 * The OQ-1 ruling adopts the EXISTING EvidenceSource.type enum verbatim
 * (no widening): analysis-output-artifact -> `result`, data-reference ->
 * `file`, measurement-context -> `measurement_context`, context ->
 * `context`, event-graph -> `event_graph`. This table is the declarative
 * mapping the authoring form uses to label a selected record's source
 * entry — a data table, NOT scattered if-chains (bait #4 hardcode
 * boundary). The enum itself is read from the shipped
 * evidence.schema.yaml at runtime (getSchema), so a future enum change
 * flows from the schema, not from this file.
 */

/** The evidence record schema id (house pattern: the exact /api/schemas id,
 *  as declared data — cf. ReadPlateModal's EVIDENCE_SCHEMA constant). */
export const EVIDENCE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'

/** The EvidenceSource.type enum as declared in evidence.schema.yaml
 *  ($defs.EvidenceSource.properties.type.enum). Declared here as data (the
 *  form's drift guard: evidenceSourceTypeFor refuses to emit a value the
 *  enum no longer carries). */
export const EVIDENCE_SOURCE_TYPE_ENUM: readonly string[] = [
  'result',
  'context',
  'measurement_context',
  'event',
  'publication',
  'file',
  'event_graph',
]

/** The stance target kinds the evd-*-target-shape lint rules accept
 *  (mirrors the YAML rule values — both sides of the contract). */
export const EVIDENCE_TARGET_TYPES = ['assertion', 'claim'] as const

/** The record-kind -> EvidenceSource.type mapping (OQ-1, adopted). */
export const EVIDENCE_SOURCE_TYPE_BY_RECORD_TYPE: Record<string, string> = {
  'analysis-output-artifact': 'result',
  'analysis-run': 'result',
  'data-reference': 'file',
  'measurement-context': 'measurement_context',
  context: 'context',
  'event-graph': 'event_graph',
}

/** The enum values that count as the WHY arm (a context-typed source) —
 *  the complement of the non-context set used by the
 *  evd-sources-need-context-arm lint rule. Kept here as the UI's
 *  declarative twin of the YAML rule (both sides of the contract). */
export const CONTEXT_SOURCE_TYPES = ['context', 'measurement_context'] as const

/** Map a record type to its EvidenceSource.type; unmapped kinds get no
 *  source entry (the form never invents a type). */
export function evidenceSourceTypeFor(
  recordType: string,
  enumValues: readonly string[],
): string | null {
  const mapped = EVIDENCE_SOURCE_TYPE_BY_RECORD_TYPE[recordType]
  if (mapped === undefined) return null
  // Guard against schema drift: if the enum no longer carries the mapped
  // value, refuse to emit it (loud, not silent).
  return enumValues.includes(mapped) ? mapped : null
}
