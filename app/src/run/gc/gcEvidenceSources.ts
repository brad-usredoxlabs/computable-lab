/**
 * GC-13 (leg D) — evidence source-type mapping, as DATA (OQ-1 ruling).
 *
 * The OQ-1 ruling adopts the EXISTING EvidenceSource.type enum verbatim
 * (no widening): analysis-output-artifact -> `result`, data-reference ->
 * `file`, measurement-context -> `measurement_context`, context ->
 * `context`, event-graph -> `event_graph`. This table is the declarative
 * mapping the authoring form uses to label a selected record's source
 * entry — a data table, NOT scattered if-chains (bait #4 hardcode
 * boundary).
 *
 * FIX6 (defect 9): this table is the MIRROR of the schema's declared
 * enum. The form reads the REAL enum from the shipped evidence.schema.yaml
 * at runtime (apiClient.getSchema — GcEvidenceHandoff.realEvidenceSourceEnum)
 * and falls back to this table only until the schema loads; the drift test
 * (gcEvidenceSources.test.ts) pins this table against the real YAML so a
 * future schema edit is detected here, and the form's enum guard
 * (evidenceSourceTypeFor refuses values the runtime enum no longer
 * carries) can now see real drift instead of its own mirror.
 */

/** The evidence record schema id (house pattern: the exact /api/schemas id,
 *  as declared data — cf. ReadPlateModal's EVIDENCE_SCHEMA constant). */
export const EVIDENCE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'

/** The EvidenceSource.type enum as declared in evidence.schema.yaml
 *  ($defs.EvidenceSource.properties.type.enum). MIRROR of the schema
 *  (the form reads the real enum at runtime; the drift test pins this
 *  table against the YAML). Kept here as the form's declared twin + the
 *  drift test's comparison table. */
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
