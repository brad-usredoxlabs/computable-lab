import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  existingFileAdditionViolations,
  patchSpecSupersededByCompilerArtifact,
  recordSchemaPolicyViolations,
  selectPatchSpecIdForRun,
} from './FoundryCoderPatch.js';

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

  it('rejects add-from-empty patches against files that already exist', async () => {
    const root = await makeRepo();
    const rel = 'records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml';
    await writeFile(join(root, rel), 'kind: labware-definition\n', 'utf-8');
    const diff = [
      `--- a/${rel}`,
      `+++ b/${rel}`,
      '@@ -0,0 +1,3 @@',
      '+kind: labware-definition',
      '+recordId: lbw-def-generic-96-well-plate',
      '+type: labware_definition',
    ].join('\n');

    expect(existingFileAdditionViolations(root, diff)).toEqual([
      expect.stringContaining('file already exists'),
    ]);
  });

  it('allows add-from-empty patches for genuinely new files', async () => {
    const root = await makeRepo();
    const rel = 'records/seed/labware-definition/lbw-def-new.yaml';
    const diff = [
      '--- /dev/null',
      `+++ b/${rel}`,
      '@@ -0,0 +1,3 @@',
      '+kind: labware-definition',
      '+recordId: lbw-def-new',
      '+type: labware_definition',
    ].join('\n');

    expect(existingFileAdditionViolations(root, diff)).toEqual([]);
  });
});

describe('FoundryCoderPatch patch scheduling', () => {
  it('selects exactly one pending patch spec for a coder run', () => {
    const selected = selectPatchSpecIdForRun([
      { id: 'protocol/manual/fix-material', fixClass: 'material_catalog_or_spec_gap' },
      { id: 'protocol/manual/fix-runtime', fixClass: 'foundry_runtime_wiring_gap' },
      { id: 'protocol/manual/fix-reference-shape', fixClass: 'precompiler_reference_shape_gap' },
    ]);

    expect(selected).toBe('protocol/manual/fix-runtime');
  });

  it('breaks same-priority ties deterministically by spec id', () => {
    const selected = selectPatchSpecIdForRun([
      { id: 'protocol/manual/fix-runtime-b', fixClass: 'foundry_runtime_wiring_gap' },
      { id: 'protocol/manual/fix-runtime-a', fixClass: 'foundry_runtime_wiring_gap' },
    ]);

    expect(selected).toBe('protocol/manual/fix-runtime-a');
  });

  it('keeps runtime-wiring specs active while runtime wiring evidence remains', () => {
    const reason = patchSpecSupersededByCompilerArtifact(
      { fixClass: 'foundry_runtime_wiring_gap' },
      {
        diagnostics: [
          {
            code: 'PASS_EXCEPTION',
            pass_id: 'deterministic_precompile',
            message: "Cannot read properties of undefined (reading 'name')",
          },
        ],
      },
    );

    expect(reason).toBeUndefined();
  });

  it('supersedes runtime-wiring specs once current diagnostics move to later gaps', () => {
    const reason = patchSpecSupersededByCompilerArtifact(
      { fixClass: 'foundry_runtime_wiring_gap' },
      {
        diagnostics: [
          {
            code: 'ai_precompile_shape_mismatch',
            pass_id: 'ai_precompile',
            message: 'ai_precompile output shape mismatch',
          },
          {
            code: 'execution_scale_plan_blocked',
            pass_id: 'derive_execution_scale_plan',
            message: 'Execution scaling plan has 1 blocker(s).',
          },
        ],
      },
    );

    expect(reason).toContain('no longer show Foundry runtime-wiring failure evidence');
  });

  it('does not supersede unrelated fix classes from compiler diagnostics', () => {
    const reason = patchSpecSupersededByCompilerArtifact(
      { fixClass: 'precompiler_reference_shape_gap' },
      {
        diagnostics: [
          {
            code: 'ai_precompile_shape_mismatch',
            pass_id: 'ai_precompile',
            message: 'ai_precompile output shape mismatch',
          },
        ],
      },
    );

    expect(reason).toBeUndefined();
  });
});
