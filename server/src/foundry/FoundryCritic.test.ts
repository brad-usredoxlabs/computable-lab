import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runFoundryPatchCritic } from './FoundryCritic.js';

describe('FoundryCritic', () => {
  async function createArtifactRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-critic-'));
    return root;
  }

  it('passes when patch is applied and no acceptance criteria', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: applied\ntouchedFiles:\n  - server/src/compiler/ChatbotCompilePasses.ts\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('pass');
    expect(result.message).toContain('Patch applied');
    expect(result.touchedFiles).toContain('server/src/compiler/ChatbotCompilePasses.ts');
  });

  it('passes when patch is applied and acceptance criteria met', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: applied\ntouchedFiles:\n  - server/src/compiler/ChatbotCompilePasses.ts\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('pass');
  });

  it('returns revision when acceptance criteria not met', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    const specPath = join(artifactRoot, 'patch-specs', 'test-protocol', 'standard', 'fix-thing.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await mkdir(join(artifactRoot, 'patch-specs', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: applied\ntouchedFiles:\n  - server/src/compiler/ChatbotCompilePasses.ts\nselectedSpecId: fix-thing\n', 'utf-8');
    await writeFile(specPath, 'id: fix-thing\nrationale: Compiler should produce readout actions\nacceptance:\n  - contains readout action\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('revision');
    expect(result.revisionFeedback).toBeDefined();
    expect(result.revisionFeedback).toContain('CRITIC REVISION FEEDBACK');
    expect(result.specVerification?.accepted).toBe(false);
    expect(result.specVerification?.criteriaFailed.length).toBeGreaterThan(0);
  });

  it('returns revision when the generated spec test fails', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    const specPath = join(artifactRoot, 'patch-specs', 'test-protocol', 'standard', 'fix-fixture.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await mkdir(join(artifactRoot, 'patch-specs', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: applied\ntouchedFiles:\n  - server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts\nselectedSpecId: fix-fixture\n', 'utf-8');
    await writeFile(
      specPath,
      [
        'id: fix-fixture',
        'rationale: The generated fixture is the source of truth.',
        'acceptance: []',
        'tests:',
        "  - cd server && npx vitest run src/compiler/pipeline/fixtures/FixItFixtures.test.ts -t 'fix-fixture'",
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
      specTestRunner: async (command) => ({
        command,
        status: 'failed',
        output: 'expected pinned placement, got []',
      }),
    });

    expect(result.verdict).toBe('revision');
    expect(result.specVerification?.accepted).toBe(false);
    expect(result.specVerification?.criteriaFailed).toContain(
      "Regression test failed: cd server && npx vitest run src/compiler/pipeline/fixtures/FixItFixtures.test.ts -t 'fix-fixture'",
    );
    expect(result.notes).toContain('AI critic skipped because one or more generated regression tests failed.');
    expect(result.revisionFeedback).toContain('expected pinned placement, got []');
  });

  it('blocks when patch is failed', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: failed\ntouchedFiles: []\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('block');
    expect(result.message).toContain('failed to apply or compile');
  });

  it('blocks when patch needs human', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: needs-human\ntouchedFiles: []\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('block');
    expect(result.message).toContain('needs human intervention');
  });

  it('blocks when patch is stale', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: stale\ntouchedFiles: []\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('block');
    expect(result.message).toContain('specs are stale');
  });

  it('blocks when patch is blocked', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: blocked\ntouchedFiles: []\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.verdict).toBe('block');
    expect(result.message).toContain('coder could not produce a valid patch');
  });

  it('reads acceptance criteria from adoption decision fallback', async () => {
    const artifactRoot = await createArtifactRoot();
    const patchResultPath = join(artifactRoot, 'code-patches', 'test-protocol', 'standard', 'result.yaml');
    const adoptionPath = join(artifactRoot, 'adoption', 'test-protocol', 'standard', 'adoption.yaml');
    await mkdir(join(artifactRoot, 'code-patches', 'test-protocol', 'standard'), { recursive: true });
    await mkdir(join(artifactRoot, 'adoption', 'test-protocol', 'standard'), { recursive: true });
    await writeFile(patchResultPath, 'status: applied\ntouchedFiles:\n  - server/src/compiler/ChatbotCompilePasses.ts\nselectedSpecId: fix-thing\n', 'utf-8');
    await writeFile(adoptionPath, 'status: accepted\npatchSpecs:\n  - id: fix-thing\n    path: /some/path/fixed.yaml\n', 'utf-8');

    const result = await runFoundryPatchCritic({
      artifactRoot,
      protocolId: 'test-protocol',
      variant: 'standard',
    });

    expect(result.specVerification).toBeDefined();
  });
});
