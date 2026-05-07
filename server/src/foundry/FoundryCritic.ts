import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export interface FoundryCriticResult {
  verdict: 'pass' | 'fail';
  reportPath: string;
  patchFailurePath?: string;
  message: string;
  findings?: string[];
}

function verificationPassed(verification: unknown): boolean {
  return Array.isArray(verification)
    && verification.length > 0
    && verification.every((item) => asRecord(item)['status'] === 'pass');
}

/**
 * Check a unified diff for corruption patterns that indicate LLM-generated
 * syntax errors. Returns an array of human-readable findings (empty = clean).
 */
export function detectDiffCorruption(diff: string): string[] {
  const findings: string[] = [];
  const lines = diff.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Literal \n in added lines (double-escaped newline from LLM)
    if (line.startsWith('+') && line.includes('\\n') && !line.startsWith('+++')) {
      findings.push(`line ${i + 1}: literal \\n in added code (possible double-escaped newline): ${line.slice(1, 100)}`);
    }

    // Floating case/default/break outside switch context
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const code = line.slice(1).trim();
      if (/^(case\s|default:|break;|return;)/.test(code)) {
        // Check that there's a nearby `switch` in the context
        const contextBefore = lines.slice(Math.max(0, i - 8), i).join('\n');
        if (!contextBefore.includes('switch')) {
          findings.push(`line ${i + 1}: floating control-flow token without nearby switch: ${code}`);
        }
      }
    }
  }

  return findings;
}

/**
 * Check balanced braces/parens/brackets in the added lines of a diff.
 * Only counts lines starting with '+' (excludes '+++').
 */
export function checkDiffBalance(diff: string): string[] {
  const findings: string[] = [];
  const addedContent = diff.split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');

  const pairs: Array<[string, string, string]> = [
    ['{', '}', 'curly braces'],
    ['(', ')', 'parentheses'],
    ['[', ']', 'square brackets'],
  ];

  for (const [open, close, name] of pairs) {
    const openCount = (addedContent.match(new RegExp(`\\${open}`, 'g')) ?? []).length;
    const closeCount = (addedContent.match(new RegExp(`\\${close}`, 'g')) ?? []).length;
    if (openCount !== closeCount) {
      findings.push(`unbalanced ${name} in added code: ${openCount} '${open}' vs ${closeCount} '${close}'`);
    }
  }

  return findings;
}

/**
 * Count the number of changed (added + removed) non-context lines in a unified diff.
 */
export function countChangedLines(diff: string): number {
  return diff.split('\n')
    .filter((line) => (line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith('-') && !line.startsWith('---')))
    .length;
}

/**
 * Check whether all touched files in the diff are within the architect's
 * `ownedFiles` bounds. Returns non-bound files (empty = all within bounds).
 */
export function filesOutsideBounds(touchedFiles: string[], ownedFiles: string[]): string[] {
  const ownedSet = new Set(ownedFiles);
  return touchedFiles.filter((file) => !ownedSet.has(file));
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
  const verification = coderPatch['verification'];
  const verificationOk = verificationPassed(verification);

  // Read the winning attempt's diff for content checks
  const tournamentDir = typeof coderPatch['tournamentDir'] === 'string' ? coderPatch['tournamentDir'] : undefined;
  const winningAttempt = typeof coderPatch['winningAttempt'] === 'number' ? coderPatch['winningAttempt'] : undefined;
  let diffContent = '';
  let diffFindings: string[] = [];
  let balanceFindings: string[] = [];
  let changedLines = 0;

  if (tournamentDir && winningAttempt && status === 'applied') {
    const diffPath = join(tournamentDir, `attempt-${winningAttempt}.diff`);
    if (existsSync(diffPath)) {
      diffContent = readFileSync(diffPath, 'utf-8');
      diffFindings = detectDiffCorruption(diffContent);
      balanceFindings = checkDiffBalance(diffContent);
      changedLines = countChangedLines(diffContent);
    }
  }

  const allFindings = [...diffFindings, ...balanceFindings];

  const pass = status === 'applied'
    && touchedFiles.length > 0
    && verificationOk
    && allFindings.length === 0; // Reject patches with corruption patterns

  const reason = pass
    ? 'Coder patch applied, touched source files, and verification passed.'
    : allFindings.length > 0
      ? `Diff corruption detected: ${allFindings.join('; ')}`
      : `Coder patch is not critic-passable: status=${status}, touchedFiles=${touchedFiles.length}, verificationPassed=${verificationOk}.`;

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
    ...(allFindings.length > 0 ? { findings: allFindings } : {}),
    changedLines,
  };
  await writeYamlFile(reportPath, report);
  await writeYamlFile(flatReportPath, report);

  if (pass) {
    return { verdict: 'pass', reportPath, message: reason, findings: [] };
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
    ...(allFindings.length > 0 ? { findings: allFindings } : {}),
  });
  return { verdict: 'fail', reportPath, patchFailurePath, message: reason, findings: allFindings };
}

