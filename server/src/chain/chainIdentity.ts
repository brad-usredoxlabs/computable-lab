/**
 * chainIdentity — MATRES-CHAIN D4: the deterministic id law for the chain
 * draft's planned writes.
 *
 * Every id is a seed-hash over (draft content, plan coordinate) — the
 * AddMaterialSupport implicit-id law (ALQ-IMPLICIT- seed-hashed,
 * AddMaterialSupport.ts:154-164) and the RECV receivingRecordIdOf precedent.
 * NEVER token() (the MaterialLifecycleHandlers trap, §5 A2), NEVER
 * randomUUID, NEVER Date.now() (bait 3): a re-draft of identical content lands
 * the SAME record ids, which is what makes the shipped accept loop's
 * prior-scan (equal modulo the declared volatile fields) land ONE chain.
 *
 * `attestedAt` is EXCLUDED from the hashed core (the RECV law): it is the
 * server's acceptance stamp, not claim content — the same claim lands the same
 * record whichever clock value stamps the accept. The compiler-injected
 * requestId (the draft coordinate) is likewise EXCLUDED from the hashed core;
 * the plan coordinate (pinned plan recordId) IS part of it: the same sentence
 * drafted against a different plan is a different chain.
 *
 * No kind-dispatch lives here; this module is imported BY the chain writer.
 */

import { contentHash } from '../revisions/RecordRevisionService.js';

export const CHAIN_DRAFT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/chain-draft.schema.yaml';
export const ATTESTATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/attestation.schema.yaml';
export const MATERIAL_DERIVATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml';
export const MATERIAL_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml';
export const ALIQUOT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml';
export const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

/** The ONE seed-hash formula (termId/content-hash law): 32 hex chars upper. */
export function chainSeedHash(core: Record<string, unknown>): string {
  return contentHash(core).slice(0, 32).toUpperCase();
}

/** The prepared material-instance id: hashed over the preparation facts + the
 *  plan coordinate. A re-draft of the same sentence lands the same entity. */
export function chainInstanceId(core: Record<string, unknown>): string {
  return `MINST-${chainSeedHash(core)}`;
}

/** The derivation id: hashed over (preparation facts, instance id) — the
 *  derivation is the act that produced THIS entity. */
export function chainDerivationId(core: Record<string, unknown>): string {
  return `MDER-${chainSeedHash(core)}`;
}

/** An aliquot id: hashed over (instance id, ordinal, declared disposition,
 *  volume, storage) — deterministic per position in the composite (the
 *  ALQ-IMPLICIT- seed-hash law). */
export function chainAliquotId(core: Record<string, unknown>): string {
  return `ALQ-${chainSeedHash(core)}`;
}

/** The chain attestation id: content hash of the ENVELOPE core, attestedAt +
 *  recordId excluded (the receivingRecordIdOf law — an id never hashes itself
 *  and never hashes the acceptance stamp). */
export function chainAttestationId(envelope: Record<string, unknown>): string {
  const core = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== 'attestedAt' && key !== 'recordId'));
  return `ATT-${chainSeedHash(core)}`;
}

/** Person ref id from a declared label (the RECV receivedBy mint law): a
 *  label hash, never a lookup, never a presumed identity (P3). */
export function chainPersonId(label: string): string {
  return `PER-${chainSeedHash({ label })}`;
}
