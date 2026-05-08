import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import { meaningfulPatchFiles } from './FoundryCoderPatch.js';
import { join } from 'node:path';

export interface FoundryCriticResult {
  kind: 'protocol-foundry-critic-report';
  protocolId: string;
  variant: string;
  generated_at: string;
  verdict: 'pass' | 'block';
  reportPath: string;
  reviewDurationMs: number;
  message: string;
  notes: string[];
  touchedFiles: string[];
  diffWarningCount: number;
  diffWarnings: string[];
  verificationOk: boolean;
  patchFailurePath?: string;
}

export interface FoundryPatchCriticOptions {
  artifactRoot: string;
  protocolId: string;
  variant: string;
  repoRoot?: string;
}

export async function runFoundryPatchCritic(input: FoundryPatchCriticOptions): Promise<FoundryCriticResult> {
  const startedAt = Date.now();
  const patchResultPath = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant, 'result.yaml');
  const reportPath = join(input.artifactRoot, 'patch-critic', input.protocolId, input.variant, 'report.yaml');
  const patchResult = asRecord(await readYamlFile(patchResultPath));
  const status = patchResult['status'];
  const touchedFiles = meaningfulPatchFiles(
    (Array.isArray(patchResult['touchedFiles']) ? patchResult['touchedFiles'] : []).filter((f: string) => typeof f === 'string'),
  );

  // If patch is applied, we pass. No gates.
  if (status === 'applied') {
    const result: FoundryCriticResult = {
      kind: 'protocol-foundry-critic-report',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      verdict: 'pass',
      reportPath,
      reviewDurationMs: Date.now() - startedAt,
      message: `Patch applied: ${touchedFiles.length} file(s) changed.`,
      notes: ['Patch landed — proceeding to rerun'],
      touchedFiles,
      diffWarningCount: 0,
      diffWarnings: [],
      verificationOk: true,
    };
    await writeYamlFile(reportPath, result);
    return result;
  }

  // Patch is not applied — block and let the pipeline stall
  const message = status === 'needs-human'
    ? 'Patch blocked: needs human intervention.'
    : status === 'blocked'
      ? 'Patch blocked: coder could not produce a valid patch.'
      : status === 'failed'
        ? 'Patch blocked: failed to apply or compile.'
        : status === 'stale'
          ? 'Patch blocked: specs are stale.'
          : `Patch blocked: status=${status}.`;

  const result: FoundryCriticResult = {
    kind: 'protocol-foundry-critic-report',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    verdict: 'block',
    reportPath,
    reviewDurationMs: Date.now() - startedAt,
    message,
    notes: [`Patch status: ${status}`],
    touchedFiles: [],
    diffWarningCount: 0,
    diffWarnings: [],
    verificationOk: false,
  };
  await writeYamlFile(reportPath, result);
  return result;
}
