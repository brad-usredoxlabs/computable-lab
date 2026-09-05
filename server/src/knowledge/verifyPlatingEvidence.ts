/**
 * VerifyPlatingEvidence — wire the D3 verification read into the knowledge
 * layer as an EVIDENCE bundle that supports/refutes the seed-count estimate.
 *
 * A biological seed count is an ESTIMATE. When a scientist stages a
 * verification read (Hoechst / total protein / OD600 / CFU), we record a
 * single_context assertion ("~N cells/well est. via <mechanism>") and an
 * `evidence` record whose `sources` point at the read event — so the reading
 * supports or refutes that the plate actually has ~N units per well.
 *
 * Idempotent: the same (eventId, material, count) always maps to the SAME
 * assertion + evidence ids (content-addressed), so re-seeding/staging never
 * duplicates.
 */
import type { RecordStore } from '../store/types.js';
import { labelHash, labelSlug } from '../materials/termId.js';

export interface VerifyPlatingDescriptor {
  /** id of the verification read event (used as an evidence source). */
  eventId: string;
  /** biological type label (e.g. "HepaRG"). */
  materialLabel: string;
  /** optional biological-type term ref. */
  biologicalTypeRef?: { kind: 'record'; id: string; type: string; label?: string };
  /** seed count per well (the estimate being verified). */
  count: number;
  /** mechanism that produced the estimate (hemocytometer/hoechst_nuclei/...). */
  measuredBy: string;
  /** read modality of the verification read (microscopy/absorbance/...). */
  readModality: string;
  wells: string[];
}

export interface VerifyPlatingEvidenceResult {
  assertionId: string;
  evidenceId: string;
  created: boolean;
}

export const ASSERTION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml';
export const EVIDENCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml';

function evidenceKey(desc: VerifyPlatingDescriptor): string {
  return `${desc.eventId}::${desc.materialLabel}::${desc.count}`;
}

function assertionId(desc: VerifyPlatingDescriptor): string {
  const key = evidenceKey(desc);
  return `ASN-verify-${labelSlug(desc.materialLabel)}-${labelHash(key)}`;
}

function evidenceId(desc: VerifyPlatingDescriptor): string {
  const key = evidenceKey(desc);
  return `EVD-verify-${labelSlug(desc.materialLabel)}-${labelHash(key)}`;
}

/**
 * Create (idempotently) an assertion + evidence bundle for a verification read.
 */
export async function createVerifyPlatingEvidence(
  store: RecordStore,
  desc: VerifyPlatingDescriptor,
): Promise<VerifyPlatingEvidenceResult> {
  const aId = assertionId(desc);
  const eId = evidenceId(desc);

  const existingAssertion = await store.get(aId);
  if (existingAssertion) {
    return { assertionId: aId, evidenceId: eId, created: false };
  }

  const wellsStr = desc.wells && desc.wells.length > 0 ? ` ${desc.wells.join(', ')}` : '';
  const statement =
    `Seed plating of ${desc.materialLabel} ≈ ${desc.count} per well (est. via ${desc.measuredBy}) on ${wellsStr || 'wells'} — verification read (${desc.readModality}) supports or refutes this.`;

  const assertionPayload: Record<string, unknown> = {
    kind: 'assertion',
    id: aId,
    status: 'active',
    scope: 'single_context',
    statement,
    outcome: {
      measure: 'count_per_well',
      direction: 'unknown',
      layer: 'event_derived',
    },
    ...(desc.biologicalTypeRef ? { claim_ref: desc.biologicalTypeRef } : {}),
    evidence_refs: [{ kind: 'record', id: eId, type: 'evidence' }],
  };

  const evidencePayload: Record<string, unknown> = {
    kind: 'evidence',
    id: eId,
    status: 'active',
    supports: [{ kind: 'record', id: aId, type: 'assertion' }],
    sources: [
      { type: 'event', ref: { kind: 'record', id: desc.eventId, type: 'event' } },
    ],
    quality: {
      method: desc.measuredBy,
      readModality: desc.readModality,
      seedCount: desc.count,
      seedEstimated: true,
      wells: desc.wells,
    },
  };

  const assertion = await store.create({
    envelope: { recordId: aId, schemaId: ASSERTION_SCHEMA_ID, payload: assertionPayload, meta: { kind: 'assertion' } },
    message: `Create verify-plating assertion ${aId}`,
  });
  if (!assertion.success && !assertion.envelope) {
    return { assertionId: aId, evidenceId: eId, created: false };
  }

  const evidence = await store.create({
    envelope: { recordId: eId, schemaId: EVIDENCE_SCHEMA_ID, payload: evidencePayload, meta: { kind: 'evidence' } },
    message: `Create verify-plating evidence ${eId}`,
  });

  return {
    assertionId: aId,
    evidenceId: eId,
    created: Boolean(evidence.success || evidence.envelope),
  };
}