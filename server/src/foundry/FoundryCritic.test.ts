import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runFoundryPatchCritic } from './FoundryCritic.js';

describe('FoundryCritic', () => {
  async function createArtifactRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-critic-'));
    return root;
  }

  it('passes when patch is applied', async () => {
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
});
