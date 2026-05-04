import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export interface PatchAdoptionResult {
  status: 'accepted' | 'blocked' | 'skipped';
  adoptionPath: string;
  message: string;
}

async function listPatchSpecs(root: string, protocolId: string, variant: FoundryVariant): Promise<string[]> {
  const dir = join(root, 'patch-specs', protocolId, variant);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((file) => file.endsWith('.yaml') && file !== 'index.yaml')
    .sort()
    .map((file) => join(dir, file));
}

export async function runPatchAdoption(input: {
  artifactRoot: string;
  protocolId: string;
  variant: FoundryVariant;
  applyPatches?: boolean;
}): Promise<PatchAdoptionResult> {
  const patchSpecs = await listPatchSpecs(input.artifactRoot, input.protocolId, input.variant);
  const adoptionPath = join(input.artifactRoot, 'adoption', input.protocolId, input.variant, 'adoption.yaml');
  const specs = await Promise.all(patchSpecs.map(async (path) => ({
    path,
    spec: asRecord(await readYamlFile(path)),
  })));

  if (specs.length === 0) {
    await writeYamlFile(adoptionPath, {
      kind: 'protocol-foundry-adoption-decision',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'skipped',
      patchSpecs: [],
      message: 'No patch specs were produced for this verdict.',
    });
    return { status: 'skipped', adoptionPath, message: 'no patch specs' };
  }

  const status = input.applyPatches ? 'blocked' : 'accepted';
  const message = input.applyPatches
    ? 'Patch specs require coder execution; automatic code editing is intentionally not performed inside this supervisor yet.'
    : 'Patch specs accepted for improvement backlog. Rerun will measure current behavior until coder execution applies fixes.';
  await writeYamlFile(adoptionPath, {
    kind: 'protocol-foundry-adoption-decision',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    status,
    applyPatches: Boolean(input.applyPatches),
    patchSpecs: specs.map(({ path, spec }) => ({
      id: typeof spec['id'] === 'string' ? spec['id'] : basename(path, '.yaml'),
      path,
      fixClass: typeof spec['fixClass'] === 'string' ? spec['fixClass'] : undefined,
      title: typeof spec['title'] === 'string' ? spec['title'] : undefined,
    })),
    message,
  });
  return { status, adoptionPath, message };
}
