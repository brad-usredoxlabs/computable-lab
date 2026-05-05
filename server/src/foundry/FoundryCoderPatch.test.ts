import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { recordSchemaPolicyViolations } from './FoundryCoderPatch.js';

describe('FoundryCoderPatch record schema policy', () => {
  async function makeRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-coder-policy-'));
    await mkdir(join(root, 'records/seed/materials'), { recursive: true });
    await mkdir(join(root, 'records/seed/labware-definition'), { recursive: true });
    await mkdir(join(root, 'records/seed/labware-definitions'), { recursive: true });
    return root;
  }

  it('rejects labware-like records in material YAML', async () => {
    const root = await makeRepo();
    const rel = 'records/seed/materials/bad-labware-material.yaml';
    await writeFile(join(root, rel), [
      '$schema: https://computable-lab.com/schema/computable-lab/material.schema.yaml',
      'kind: material',
      'id: mat-seed-test-tube',
      'recordId: mat-seed-test-tube',
      'name: Test Tube',
      'domain: other',
      'definition: A tube used as a sample container.',
      'tags:',
      '  - labware',
      '  - tube',
    ].join('\n'), 'utf-8');

    await expect(recordSchemaPolicyViolations(root, [rel])).resolves.toEqual([
      expect.stringContaining('looks like labware/container data'),
    ]);
  });

  it('accepts reagent-like material YAML', async () => {
    const root = await makeRepo();
    const rel = 'records/seed/materials/elisa-reagent.yaml';
    await writeFile(join(root, rel), [
      '$schema: https://computable-lab.com/schema/computable-lab/material.schema.yaml',
      'kind: material',
      'id: mat-seed-tmb-solution',
      'recordId: mat-seed-tmb-solution',
      'name: TMB Solution',
      'domain: reagent',
      'definition: Chromogenic substrate solution used in ELISA.',
      'tags:',
      '  - substrate',
      '  - elisa',
    ].join('\n'), 'utf-8');

    await expect(recordSchemaPolicyViolations(root, [rel])).resolves.toEqual([]);
  });

  it('rejects legacy plural labware-definition paths', async () => {
    const root = await makeRepo();
    const rel = 'records/seed/labware-definitions/generic_96_well_plate.yaml';
    await writeFile(join(root, rel), 'kind: labware-definition\n', 'utf-8');

    await expect(recordSchemaPolicyViolations(root, [rel])).resolves.toEqual([
      expect.stringContaining('canonical records/seed/labware-definition'),
    ]);
  });

  it('accepts canonical labware-definition YAML', async () => {
    const root = await makeRepo();
    const rel = 'records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml';
    await writeFile(join(root, rel), [
      '$schema: https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
      'kind: labware-definition',
      'recordId: lbw-def-generic-96-well-plate',
      'type: labware_definition',
      'id: generic/96_well_plate@v1',
      'display_name: Generic 96-Well Plate',
      'topology:',
      '  addressing: grid',
      '  rows: 8',
      '  columns: 12',
      'render_hints:',
      '  profile: plate',
    ].join('\n'), 'utf-8');

    await expect(recordSchemaPolicyViolations(root, [rel])).resolves.toEqual([]);
  });
});
