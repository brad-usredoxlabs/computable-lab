import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  existingFileAdditionViolations,
  collectSourceAnchorContext,
  patchSpecSupersededByCompilerArtifact,
  recordSchemaPolicyViolations,
  selectPatchSpecIdForRun,
  structuredEditsToUnifiedDiff,
} from './FoundryCoderPatch.js';

const execFileAsync = promisify(execFile);

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

describe('FoundryCoderPatch structured edits', () => {
  it('collects exact source anchors past the broad file excerpt limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-coder-anchors-'));
    await mkdir(join(root, 'server/src/compiler/pipeline/passes'), { recursive: true });
    const rel = 'server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts';
    const filler = Array.from({ length: 700 }, (_, index) => `const filler${index} = ${index};`);
    await writeFile(join(root, rel), [
      ...filler,
      'export function createAiPrecompilePass(deps: CreateAiPrecompilePassDeps): Pass {',
      '  return {',
      "    id: 'ai_precompile',",
      '  };',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const context = await collectSourceAnchorContext(root, [{
      id: 'spec-1',
      fixClass: 'precompiler_reference_shape_gap',
      title: 'Fix AI precompile shape handling',
      rationale: '',
      ownedFiles: [rel],
      acceptance: [],
      raw: {},
      path: 'spec.yaml',
    }], 'precompiler_reference_shape_gap');

    expect(context).toContain('anchor:ai-precompile-pass');
    expect(context).toContain(`file:${rel}`);
    expect(context).toContain('export function createAiPrecompilePass');
    expect(context).toMatch(/\d+ \| export function createAiPrecompilePass/);
  });

  it('turns exact search/replace edits into a git-applicable unified diff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-coder-edits-'));
    const tournamentDir = join(root, 'artifacts');
    await mkdir(join(root, 'server/src/example'), { recursive: true });
    const rel = 'server/src/example/value.ts';
    await writeFile(join(root, rel), [
      'export function value(): number {',
      '  return 1;',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const diff = await structuredEditsToUnifiedDiff({
      repoRoot: root,
      tournamentDir,
      edits: [{
        path: rel,
        search: '  return 1;',
        replace: '  return 2;',
      }],
    });

    expect(diff).toContain(`--- a/${rel}`);
    expect(diff).toContain(`+++ b/${rel}`);
    expect(diff).toContain(`diff --git a/${rel} b/${rel}`);
    expect(diff).toContain('-  return 1;');
    expect(diff).toContain('+  return 2;');
  });

  it('emits git headers so multi-file structured diffs are git-applicable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-coder-edits-'));
    const tournamentDir = join(root, 'artifacts');
    await mkdir(join(root, 'server/src/example'), { recursive: true });
    const first = 'server/src/example/first.ts';
    const second = 'server/src/example/second.ts';
    await writeFile(join(root, first), 'export const first = 1;\n', 'utf-8');
    await writeFile(join(root, second), 'export const second = 1;\n', 'utf-8');

    const diff = await structuredEditsToUnifiedDiff({
      repoRoot: root,
      tournamentDir,
      edits: [
        {
          path: first,
          search: 'export const first = 1;',
          replace: 'export const first = 2;',
        },
        {
          path: second,
          search: 'export const second = 1;',
          replace: 'export const second = 2;',
        },
      ],
    });
    const diffPath = join(tournamentDir, 'multi.diff');
    await writeFile(diffPath, diff, 'utf-8');

    expect(diff.match(/^diff --git /gm)).toHaveLength(2);
    await expect(execFileAsync('git', ['apply', '--check', diffPath], { cwd: root })).resolves.toBeDefined();
  });

  it('requires ambiguous search blocks to include an occurrence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-coder-edits-'));
    const tournamentDir = join(root, 'artifacts');
    await mkdir(join(root, 'server/src/example'), { recursive: true });
    const rel = 'server/src/example/value.ts';
    await writeFile(join(root, rel), [
      'const item = 1;',
      'const item = 1;',
      '',
    ].join('\n'), 'utf-8');

    await expect(structuredEditsToUnifiedDiff({
      repoRoot: root,
      tournamentDir,
      edits: [{
        path: rel,
        search: 'const item = 1;',
        replace: 'const item = 2;',
      }],
    })).rejects.toThrow('matched 2 times');
  });

  it('reports failed structured edit index and anchor for repair', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-coder-edits-'));
    const tournamentDir = join(root, 'artifacts');
    await mkdir(join(root, 'server/src/example'), { recursive: true });
    const rel = 'server/src/example/value.ts';
    await writeFile(join(root, rel), [
      'export function value(): number {',
      '  return 1;',
      '}',
      '',
    ].join('\n'), 'utf-8');

    await expect(structuredEditsToUnifiedDiff({
      repoRoot: root,
      tournamentDir,
      edits: [{
        path: rel,
        search: '  return 42;',
        replace: '  return 2;',
        anchorId: 'value-function',
      }],
    })).rejects.toThrow('edit #1 server/src/example/value.ts anchor:value-function: search block not found');
  });
});
