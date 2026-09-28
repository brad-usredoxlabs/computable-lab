/**
 * Typed fixture for a valid `tyf.evidence/1` document, plus a helper to
 * derive mutated variants (version mismatches, injection payloads) without
 * a JSON loader.
 */
import type { TyfEvidenceDocument, UntrustedEvidenceDocument } from '../types'

export const evidenceV1: TyfEvidenceDocument = {
  schema_version: 'tyf.evidence/1',
  viewer_version: 1,
  sample_id: 'SAMPLE-042',
  barcode: 'BX-9912-XY',
  events: [
    {
      id: 'evt-1',
      type: 'plate-read',
      occurred_at: '2026-03-01T10:15:00Z',
      sample_id: 'SAMPLE-042',
      record_ids: ['rec-1', 'rec-2'],
    },
    {
      id: 'evt-2',
      type: 'treatment',
      occurred_at: '2026-02-28T09:00:00Z',
      sample_id: 'SAMPLE-042',
      record_ids: ['rec-3'],
    },
  ],
  records: [
    {
      id: 'rec-1',
      type: 'fluorescence-read',
      sample_id: 'SAMPLE-042',
      data: {
        well: 'A1',
        rfu: 4213,
        instrument: 'Tecar Spark',
      },
    },
    {
      id: 'rec-2',
      type: 'norm-normalization',
      sample_id: 'SAMPLE-042',
      data: {
        normalized: 0.62,
        method: 'robust-z',
      },
    },
    {
      id: 'rec-3',
      type: 'treatment-record',
      sample_id: 'SAMPLE-042',
      data: {
        compound: 'rotenone',
        concentration_uM: 10,
      },
    },
  ],
  source_revisions: [
    { record_id: 'rec-1', commit: 'abc1234' },
    { record_id: 'rec-2', commit: 'abc1234' },
    { record_id: 'rec-3', commit: 'def5678' },
  ],
  artifacts: [
    { id: 'art-graph', kind: 'graph', name: 'evidence-graph.json', sha256: 'a'.repeat(64), size: 20480 },
    { id: 'art-pdf', kind: 'pdf', name: 'report.pdf', sha256: 'b'.repeat(64), size: 1048576 },
    { id: 'evil', kind: 'zip', name: 'not-authorized.zip', sha256: 'c'.repeat(64), size: 666 },
  ],
}

/** Deep-clone with overrides, for version-mismatch / injection variants. */
export function evidenceV1With(
  overrides: Partial<UntrustedEvidenceDocument>,
): UntrustedEvidenceDocument {
  return JSON.parse(JSON.stringify({ ...evidenceV1, ...overrides }))
}
