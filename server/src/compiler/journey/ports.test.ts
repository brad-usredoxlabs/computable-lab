// @vitest-environment node
/**
 * L2-JOURNEY-PORTS-1 (unit ports2): binding-time port validator.
 *
 * Acceptance (a)-(d) are relationships between a producer port and a consumer
 * port, so they are pinned here against ONE pure function, not a lint triplet
 * (schema/workflow/journey-port.schema.yaml:10 states it is vocabulary only).
 *
 * The two authority pins at the bottom read the shipped vocabulary YAML and
 * prove PORT_TYPES / MATERIAL_PROVENANCE_LAYERS are derived from it rather than
 * restated: no second authority for ports or provenance layers.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  MATERIAL_PROVENANCE_LAYERS,
  PORT_TYPES,
  validatePortBinding,
  type PortReference,
  type PortRequirement,
} from './ports.js';

const SCHEMA_PATH = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../schema/workflow/journey-port.schema.yaml',
);

/** Rejection helper: never narrows past the union by throwing instead of asserting. */
function diagnosticOf(producer: PortReference, consumer: PortRequirement) {
  const result = validatePortBinding(producer, consumer);
  if (result.ok) throw new Error('binding was accepted, expected a named rejection');
  return result.diagnostic;
}

describe('validatePortBinding', () => {
  it('(a) refuses a material layer collapse, naming both layers', () => {
    const diagnostic = diagnosticOf(
      { port_type: 'MaterialReference', version: 'v1', material_id: 'MAT-1', provenance_layer: 'material' },
      { port_type: 'MaterialReference', provenance_layer: 'material-instance' },
    );
    expect(diagnostic.code).toBe('provenance_layer_collapse');
    expect(diagnostic.message).toContain('material');
    expect(diagnostic.message).toContain('material-instance');
  });

  it('(b) refuses a staged draft bound to a committed requirement', () => {
    const diagnostic = diagnosticOf(
      { port_type: 'StagedDraftReference', version: 'v1', draft_id: 'DRAFT-1' },
      { port_type: 'CommittedRecordReference' },
    );
    expect(diagnostic.code).toBe('staged_bound_to_committed');
    expect(diagnostic.message).toContain('StagedDraftReference');
    expect(diagnostic.message).toContain('CommittedRecordReference');
  });

  it('(c) refuses a committed reference with no receipt, naming receipt_id and the record', () => {
    const diagnostic = diagnosticOf(
      { port_type: 'CommittedRecordReference', version: 'v1', record_id: 'REC-1', record_type: 'material-instance' },
      { port_type: 'CommittedRecordReference' },
    );
    expect(diagnostic.code).toBe('committed_reference_without_receipt');
    expect(diagnostic.message).toContain('receipt_id');
    expect(diagnostic.message).toContain('REC-1');
  });

  it('(d) accepts a labware definition where a definition is required', () => {
    const result = validatePortBinding(
      { port_type: 'LabwareDefinitionReference', version: 'v1', labware_definition_id: 'lbw-seed-plate-96-flat' },
      { port_type: 'LabwareDefinitionReference', labware_reference: 'definition' },
    );
    expect(result.ok).toBe(true);
  });

  it('(d-negative) refuses a labware INSTANCE smuggled into a definition requirement', () => {
    const diagnostic = diagnosticOf(
      {
        port_type: 'CommittedRecordReference',
        version: 'v1',
        record_id: 'LBI-1',
        record_type: 'labware-instance',
        receipt_id: 'RCPT-9',
      },
      { port_type: 'LabwareDefinitionReference', labware_reference: 'definition' },
    );
    expect(diagnostic.code).toBe('labware_instance_for_definition_requirement');
    expect(diagnostic.message).toContain('labware-instance');
    expect(diagnostic.message).toContain('LabwareDefinitionReference');
  });

  it('guard: falls back to port_type_mismatch for unrelated port families', () => {
    const diagnostic = diagnosticOf(
      { port_type: 'SequenceSetReference', version: 'v1', sequence_set_id: 'SS-1' },
      { port_type: 'AlignmentReference' },
    );
    expect(diagnostic.code).toBe('port_type_mismatch');
    expect(diagnostic.message).toContain('SequenceSetReference');
    expect(diagnostic.message).toContain('AlignmentReference');
  });
});

describe('port vocabulary authority pins', () => {
  const vocabulary = async (): Promise<Record<string, any>> =>
    parseYaml(await readFile(SCHEMA_PATH, 'utf8')) as Record<string, any>;

  it('PORT_TYPES deep-equals the schema $defs keys', async () => {
    const doc = await vocabulary();
    expect([...PORT_TYPES]).toEqual(Object.keys(doc.$defs ?? {}));
  });

  it('MATERIAL_PROVENANCE_LAYERS deep-equals the schema provenance_layer enum', async () => {
    const doc = await vocabulary();
    const declared = doc.$defs?.MaterialReference?.properties?.provenance_layer?.enum;
    expect([...MATERIAL_PROVENANCE_LAYERS]).toEqual(declared);
  });
});
