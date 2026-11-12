// @vitest-environment node
/**
 * L2-JOURNEY-PORTS-1 (unit ports2): binding-time port validator, RED-first.
 * Acceptance (a)-(d) are relationships between a producer and a consumer port,
 * so they are pinned against ONE pure function, never a lint triplet
 * (schema/workflow/journey-port.schema.yaml:10: vocabulary only, no lint host).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  MATERIAL_PROVENANCE_LAYERS, PORT_TYPES, validatePortBinding,
  type PortBindingErrorCode, type PortReference, type PortRequirement,
} from './ports.js';
const SCHEMA_PATH = join(fileURLToPath(new URL('.', import.meta.url)),
  '../../../../schema/workflow/journey-port.schema.yaml');

interface Rejection {
  label: string; producer: PortReference; consumer: PortRequirement;
  code: PortBindingErrorCode; needles: string[];
}

const REJECTIONS: Rejection[] = [
  {
    label: '(a) refuses a material layer collapse, naming both layers',
    producer: { port_type: 'MaterialReference', version: 'v1', material_id: 'MAT-1', provenance_layer: 'material' },
    consumer: { port_type: 'MaterialReference', provenance_layer: 'material-instance' },
    // 'declares material:' (word + colon) is the producer-layer interpolation itself:
    // a substring of 'material-instance' cannot satisfy it, so dropping the
    // ${producer.provenance_layer} interpolation goes RED here.
    code: 'provenance_layer_collapse', needles: ['declares material:', 'material-instance'],
  },
  {
    label: '(b) refuses a staged draft bound to a committed requirement',
    producer: { port_type: 'StagedDraftReference', version: 'v1', draft_id: 'DRAFT-1' },
    consumer: { port_type: 'CommittedRecordReference' },
    code: 'staged_bound_to_committed',
    needles: ['StagedDraftReference', 'CommittedRecordReference'],
  },
  {
    label: '(c) refuses a committed reference with no receipt, naming receipt_id and the record',
    producer: { port_type: 'CommittedRecordReference', version: 'v1', record_id: 'REC-1', record_type: 'material-instance' },
    consumer: { port_type: 'CommittedRecordReference' },
    code: 'committed_reference_without_receipt', needles: ['receipt_id', 'REC-1'],
  },
  {
    // Whitespace-only receipt: separating the `trim() === ''` arm from the
    // `=== undefined` arm, so deleting either one goes RED.
    label: '(c) refuses a whitespace-only receipt, naming receipt_id and the record',
    producer: {
      port_type: 'CommittedRecordReference', version: 'v1', record_id: 'REC-2',
      record_type: 'material-instance', receiptId: '   ',
    },
    consumer: { port_type: 'CommittedRecordReference' },
    code: 'committed_reference_without_receipt', needles: ['receipt_id', 'REC-2'],
  },
  {
    label: '(d-negative) refuses a labware INSTANCE smuggled into a definition requirement',
    producer: {
      port_type: 'CommittedRecordReference', version: 'v1', record_id: 'LBI-1',
      record_type: 'labware-instance', receipt_id: 'RCPT-9',
    },
    consumer: { port_type: 'LabwareDefinitionReference', labware_reference: 'definition' },
    code: 'labware_instance_for_definition_requirement',
    needles: ['labware-instance', 'LabwareDefinitionReference'],
  },
  {
    // The `labware_reference === undefined` arm of rule 3: a requirement that
    // omits the field still means "definition", so an instance producer is refused.
    label: '(d-negative) refuses a labware INSTANCE when the requirement omits labware_reference',
    producer: {
      port_type: 'CommittedRecordReference', version: 'v1', record_id: 'LBI-2',
      record_type: 'labware-instance', receipt_id: 'RCPT-9',
    },
    consumer: { port_type: 'LabwareDefinitionReference' },
    code: 'labware_instance_for_definition_requirement',
    needles: ['labware-instance', 'LBI-2'],
  },
  {
    label: 'guard: unrelated port families fall back to port_type_mismatch',
    producer: { port_type: 'SequenceSetReference', version: 'v1', sequence_set_id: 'SS-1' },
    consumer: { port_type: 'AlignmentReference' },
    code: 'port_type_mismatch', needles: ['SequenceSetReference', 'AlignmentReference'],
  },
];

describe('validatePortBinding', () => {
  for (const { label, producer, consumer, code, needles } of REJECTIONS) {
    it(label, () => {
      const result = validatePortBinding(producer, consumer);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('binding accepted, expected a named rejection');
      expect(result.diagnostic.code).toBe(code);
      for (const needle of needles) expect(result.diagnostic.message).toContain(needle);
      // The diagnostic must carry the exact ports it judged, not a paraphrase.
      expect(result.diagnostic.producer_port).toEqual(producer);
      expect(result.diagnostic.consumer_port).toEqual(consumer);
    });
  }

  it('(d) accepts an instance requirement, so rule 3 fires on definition only', () => {
    const result = validatePortBinding(
      {
        port_type: 'CommittedRecordReference', version: 'v1', record_id: 'LBI-3',
        record_type: 'labware-instance', receipt_id: 'RCPT-9',
      },
      { port_type: 'CommittedRecordReference', labware_reference: 'instance' });
    expect(result.ok).toBe(true);
  });

  it('(a-positive) accepts a matching material layer', () => {
    const result = validatePortBinding(
      { port_type: 'MaterialReference', version: 'v1', material_id: 'MAT-1', provenance_layer: 'aliquot' },
      { port_type: 'MaterialReference', provenance_layer: 'aliquot' });
    expect(result.ok).toBe(true);
  });

  it('(d) accepts a labware definition where a definition is required', () => {
    const result = validatePortBinding(
      { port_type: 'LabwareDefinitionReference', version: 'v1', labware_definition_id: 'lbw-seed-plate-96-flat' },
      { port_type: 'LabwareDefinitionReference', labware_reference: 'definition' });
    expect(result.ok).toBe(true);
  });
});

describe('port vocabulary authority pins', () => {
  const vocabulary = async (): Promise<Record<string, any>> =>
    parseYaml(await readFile(SCHEMA_PATH, 'utf8')) as Record<string, any>;

  it('PORT_TYPES deep-equals the schema $defs keys', async () => {
    expect([...PORT_TYPES]).toEqual(Object.keys((await vocabulary()).$defs ?? {}));
  });

  it('MATERIAL_PROVENANCE_LAYERS deep-equals the schema provenance_layer enum', async () => {
    const def = (await vocabulary()).$defs?.MaterialReference?.properties?.provenance_layer;
    expect([...MATERIAL_PROVENANCE_LAYERS]).toEqual(def?.enum);
  });
});
