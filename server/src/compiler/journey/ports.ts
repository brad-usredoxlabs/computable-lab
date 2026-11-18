/**
 * L2-JOURNEY-PORTS-1 (unit ports2): binding-time port validator. The journey port
 * schema is VOCABULARY, not a record kind (journey-port.schema.yaml:10), so the
 * item's (a)-(d) are relationships between a producer and a consumer port.
 * ARCHITECT RULING 2026-11-12T06:19 puts them here as ONE pure function returning
 * `ok` or a NAMED diagnostic; no throw, no shape re-validation (Ajv owns that), no
 * normalisation. L2-JOURNEY-COMPILER-1 calls it for every step binding.
 */

export const PORT_TYPES = [
  'SequenceSetReference', 'AlignmentReference', 'MaterialReference',
  'LabwareDefinitionReference', 'CommittedRecordReference', 'StagedDraftReference',
] as const;
export type PortType = (typeof PORT_TYPES)[number];
export const MATERIAL_PROVENANCE_LAYERS = [
  'material', 'material-spec', 'material-instance', 'aliquot', 'vendor-product',
] as const;
export type MaterialProvenanceLayer = (typeof MATERIAL_PROVENANCE_LAYERS)[number];
/** A physical container is a CommittedRecordReference of this kind. Authority: schema/lab/labware-instance.schema.yaml ($id). */
export const LABWARE_INSTANCE_RECORD_TYPE = 'labware-instance';

/** One member per schema $def; fields mirror that $def's required list. */
export interface SequenceSetReference {
  port_type: 'SequenceSetReference'; version: string; sequence_set_id: string;
}
export interface AlignmentReference {
  port_type: 'AlignmentReference'; version: string; alignment_id: string;
}
export interface MaterialReference {
  port_type: 'MaterialReference'; version: string; material_id: string;
  provenance_layer: MaterialProvenanceLayer;
}
export interface LabwareDefinitionReference {
  port_type: 'LabwareDefinitionReference'; version: string; labware_definition_id: string;
}
export interface CommittedRecordReference {
  port_type: 'CommittedRecordReference'; version: string; record_id: string; record_type: string;
  /** Optional in the TYPE only, so an unreceipted reference is expressible input for rule 1. */
  receipt_id?: string;
}
export interface StagedDraftReference {
  port_type: 'StagedDraftReference'; version: string; draft_id: string;
}
export type PortReference = SequenceSetReference | AlignmentReference | MaterialReference
  | LabwareDefinitionReference | CommittedRecordReference | StagedDraftReference;
/** What a consumer port requires of whatever is bound to it. */
export interface PortRequirement {
  port_type: PortType;
  provenance_layer?: MaterialProvenanceLayer;
  labware_reference?: 'definition' | 'instance';
}
export type PortBindingErrorCode = 'committed_reference_without_receipt' | 'staged_bound_to_committed'
  | 'labware_instance_for_definition_requirement' | 'provenance_layer_collapse' | 'port_type_mismatch';

export interface PortBindingDiagnostic {
  code: PortBindingErrorCode;
  message: string;
  producer_port: PortReference;
  consumer_port: PortRequirement;
}
export type PortBindingResult = { ok: true } | { ok: false; diagnostic: PortBindingDiagnostic };

function reject(
  code: PortBindingErrorCode, message: string,
  producer: PortReference, consumer: PortRequirement,
): PortBindingResult {
  return { ok: false, diagnostic: { code, message, producer_port: producer, consumer_port: consumer } };
}

/** Evaluate one producer port against one consumer requirement. Evaluation order
 * is deliberate: a NAMED rejection must win over the generic mismatch, or the
 * diagnostic would not say what is actually wrong. */
export function validatePortBinding(
  producer: PortReference, consumer: PortRequirement,
): PortBindingResult {
  switch (producer.port_type) {
    case 'CommittedRecordReference': {
      // 1. A committed reference without a receipt is a surface, not a record.
      const receipt = producer.receipt_id;
      if (receipt === undefined || receipt.trim() === '') {
        return reject('committed_reference_without_receipt',
          `producer port CommittedRecordReference for record ${producer.record_id} carries no receipt_id: a committed reference must name the governed-write receipt that committed it`,
          producer, consumer);
      }
      // 3. A physical container may never satisfy a definition requirement.
      const needsDefinition = consumer.port_type === 'LabwareDefinitionReference' &&
        (consumer.labware_reference === undefined || consumer.labware_reference === 'definition');
      if (needsDefinition && producer.record_type === LABWARE_INSTANCE_RECORD_TYPE) {
        return reject('labware_instance_for_definition_requirement',
          `consumer port LabwareDefinitionReference requires a labware definition, but producer port CommittedRecordReference names a ${LABWARE_INSTANCE_RECORD_TYPE} record (${producer.record_id})`,
          producer, consumer);
      }
      break;
    }
    case 'StagedDraftReference': {
      // 2. A staged draft is not a committed record.
      if (consumer.port_type === 'CommittedRecordReference') {
        return reject('staged_bound_to_committed',
          'consumer port CommittedRecordReference cannot be bound to producer port StagedDraftReference: a staged draft is not a committed record',
          producer, consumer);
      }
      break;
    }
    case 'MaterialReference': {
      // 4. Provenance layers must never be collapsed.
      if (consumer.port_type === 'MaterialReference' && consumer.provenance_layer !== undefined &&
        consumer.provenance_layer !== producer.provenance_layer) {
        return reject('provenance_layer_collapse',
          `consumer port MaterialReference requires provenance_layer ${consumer.provenance_layer} but producer port MaterialReference declares ${producer.provenance_layer}: material layers must never be collapsed`,
          producer, consumer);
      }
      break;
    }
    // No rule of their own: fall through to the type check.
    case 'SequenceSetReference':
    case 'AlignmentReference':
    case 'LabwareDefinitionReference':
      break;
  }
  // 5. Generic fallback. A port type outside PORT_TYPES lands here too, so an
  // unknown producer is refused rather than silently accepted.
  if (producer.port_type !== consumer.port_type) {
    return reject('port_type_mismatch',
      `consumer port ${consumer.port_type} cannot be bound to producer port ${producer.port_type}`,
      producer, consumer);
  }
  // 6.
  return { ok: true };
}
