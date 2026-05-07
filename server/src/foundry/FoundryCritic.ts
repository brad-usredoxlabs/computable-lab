import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export interface FoundryCriticResult {
  verdict: 'pass' | 'fail';
  reportPath: string;
  patchFailurePath?: string;
  message: string;
}

function verificationPassed(verification: unknown): boolean {
  return Array.isArray(verification)
    && verification.length > 0
    && verification.every((item) => asRecord(item)['status'] === 'pass');
}

export async function runFoundryPatchCritic(input: {
  artifactRoot: string;
  protocolId: string;
  variant: FoundryVariant;
}): Promise<FoundryCriticResult> {
  const coderPatchPath = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant, 'result.yaml');
  const reportPath = join(input.artifactRoot, 'critic-reports', input.protocolId, input.variant, 'report.yaml');
  const flatReportPath = join(input.artifactRoot, 'critic-reports', `${input.protocolId}-${input.variant}.yaml`);
  const patchFailurePath = join(input.artifactRoot, 'patch-failures', `${input.protocolId}-${input.variant}.yaml`);

  if (!existsSync(coderPatchPath)) {
    const report = {
      kind: 'protocol-critic-report',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      verdict: 'fail',
      coderPatch: coderPatchPath,
      reason: 'No coder patch result exists.',
    };
    await writeYamlFile(reportPath, report);
    await writeYamlFile(flatReportPath, report);
    await writeYamlFile(patchFailurePath, {
      kind: 'protocol-foundry-patch-failure',
      protocolId: input.protocolId,
      variant: input.variant,
      generated_at: nowIso(),
      status: 'failed',
      reason: report.reason,
      criticReport: reportPath,
    });
    return { verdict: 'fail', reportPath, patchFailurePath, message: report.reason };
  }

  const coderPatch = asRecord(await readYamlFile(coderPatchPath));
  const status = String(coderPatch['status'] ?? 'unknown');
  const touchedFiles = Array.isArray(coderPatch['touchedFiles'])
    ? coderPatch['touchedFiles'].filter((item): item is string => typeof item === 'string')
    : [];
  const pass = status === 'applied' && touchedFiles.length > 0 && verificationPassed(coderPatch['verification']);
  const reason = pass
    ? 'Coder patch applied, touched source files, and verification passed.'
    : `Coder patch is not critic-passable: status=${status}, touchedFiles=${touchedFiles.length}, verificationPassed=${verificationPassed(coderPatch['verification'])}.`;
  const report = {
    kind: 'protocol-critic-report',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    verdict: pass ? 'pass' : 'fail',
    coderPatch: coderPatchPath,
    statusReviewed: status,
    touchedFiles,
    reason,
  };
  await writeYamlFile(reportPath, report);
  await writeYamlFile(flatReportPath, report);

  if (pass) {
    return { verdict: 'pass', reportPath, message: reason };
  }

  await writeYamlFile(patchFailurePath, {
    kind: 'protocol-foundry-patch-failure',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    status: 'failed',
    reason,
    coderPatch: coderPatchPath,
    criticReport: reportPath,
  });
  return { verdict: 'fail', reportPath, patchFailurePath, message: reason };
}

