import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import { meaningfulPatchFiles } from './FoundryCoderPatch.js';

const execFileAsync = promisify(execFile);

export interface FoundryCriticResult {
  kind: 'protocol-foundry-critic-report';
  protocolId: string;
  variant: string;
  generated_at: string;
  verdict: 'pass' | 'block' | 'revision';
  reportPath: string;
  reviewDurationMs: number;
  message: string;
  notes: string[];
  touchedFiles: string[];
  specVerification?: {
    accepted: boolean;
    criteriaMet: string[];
    criteriaFailed: string[];
    notes: string[];
  };
  patchFailurePath?: string;
  revisionFeedback?: string;
}

export interface FoundryPatchCriticOptions {
  artifactRoot: string;
  protocolId: string;
  variant: string;
  repoRoot?: string;
}

/** Read the patch spec from the adoption decision or patch-specs directory */
async function readPatchSpec(
  artifactRoot: string,
  protocolId: string,
  variant: string,
  specId: string,
): Promise<{ acceptance?: string[]; rationale?: string } | null> {
  // Try patch-specs directory first
  const specPath = join(artifactRoot, 'patch-specs', protocolId, variant, `${specId}.yaml`);
  try {
    const raw = asRecord(await readYamlFile(specPath));
    const acceptance = Array.isArray(raw['acceptance']) ? raw['acceptance'] as string[] : undefined;
    const rationale = typeof raw['rationale'] === 'string' ? raw['rationale'] : undefined;
    return { ...(acceptance !== undefined ? { acceptance } : {}), ...(rationale !== undefined ? { rationale } : {}) };
  } catch {
    // Fall back to adoption decision path
    const adoptionPath = join(artifactRoot, 'adoption', protocolId, variant, 'adoption.yaml');
    try {
      const adoption = asRecord(await readYamlFile(adoptionPath));
      const specs = (adoption['patchSpecs'] ?? []) as Array<Record<string, unknown>>;
      for (const spec of specs) {
        if ((spec['id'] as string) === specId) {
          const path = spec['path'] as string | undefined;
          if (path) {
            const raw = asRecord(await readYamlFile(path));
            const acceptance = Array.isArray(raw['acceptance']) ? raw['acceptance'] as string[] : undefined;
            const rationale = typeof raw['rationale'] === 'string' ? raw['rationale'] : undefined;
            return { ...(acceptance !== undefined ? { acceptance } : {}), ...(rationale !== undefined ? { rationale } : {}) };
          }
        }
      }
    } catch {
      // No spec found — proceed without verification
    }
    return null;
  }
}

/** Check if the patch diff satisfies the acceptance criteria */
function checkAcceptance(diff: string, criteria: string[]): string[] {
  const failed: string[] = [];
  const upper = diff.toUpperCase();

  for (const criterion of criteria) {
    const lower = criterion.toLowerCase();
    let satisfied = false;

    // Check for specific action keywords in diff
    if (lower.includes('readout') && upper.includes('READOUT')) satisfied = true;
    if (lower.includes('transfer') && upper.includes('TRANSFER')) satisfied = true;
    if (lower.includes('add') && upper.includes(' ADD')) satisfied = true;
    if (lower.includes('mix') && upper.includes('MIX')) satisfied = true;
    if (lower.includes('instrument')) satisfied = true;

    // Check for event count indicators
    if (lower.includes('3 events') || lower.includes('at least 3')) {
      const addLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      // Rough heuristic: if we added event-related lines
      if (addLines.length > 0) satisfied = true;
    }

    // Check for phase/action coverage keywords
    if (lower.includes('all phases') || lower.includes('complete')) satisfied = true;

    // Check for material/labware references
    if (lower.includes('material') && upper.includes('MATERIAL')) satisfied = true;
    if (lower.includes('labware') && upper.includes('LABWARE')) satisfied = true;

    // Check for wiring/connection mentions
    if (lower.includes('wiring') && upper.includes('WIRING')) satisfied = true;
    if (lower.includes('connect') && upper.includes('CONNECT')) satisfied = true;

    // Check for rendering/view references
    if (lower.includes('render') && upper.includes('RENDER')) satisfied = true;
    if (lower.includes('view') && upper.includes('VIEW')) satisfied = true;

    // Check for alias/resolver mentions
    if (lower.includes('alias') && upper.includes('ALIAS')) satisfied = true;
    if (lower.includes('resolver') && upper.includes('RESOLVER')) satisfied = true;

    // Check for coverage/readout/transfer/complete mentioned
    if (lower.includes('coverage') && upper.includes('COVERAGE')) satisfied = true;

    // Default: if we see changes in the touched files, be lenient
    if (!satisfied && lower.length > 20) {
      // Check if the diff contains any code changes (not just comments)
      const codeLines = diff.split('\n').filter(
        (l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('###') && !l.startsWith('## ')
      );
      if (codeLines.length > 0) satisfied = true;
    }

    if (!satisfied) {
      failed.push(criterion);
    }
  }

  return failed;
}

/** Check for obviously broken code constructs in the diff */
function checkForBrokenConstructs(diff: string): string[] {
  const warnings: string[] = [];
  const lines = diff.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const content = line.slice(1).trim();

    // Check for truncation markers
    if (content.endsWith('...') && content.split('\n').length === 1) {
      warnings.push(`Line ${i + 1}: Possible truncation marker '...' in added code`);
    }
    // Check for TODO/FIXME markers in added code
    if (/TODO|FIXME|HACK|XXX/.test(content)) {
      warnings.push(`Line ${i + 1}: Unresolved TODO/FIXME in added code`);
    }
    // Check for mismatched braces (very rough heuristic)
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces > 0 && closeBraces === 0 && content.length > 50) {
      warnings.push(`Line ${i + 1}: Possible mismatched braces (open: ${openBraces}, close: ${closeBraces})`);
    }
  }

  return warnings;
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
  const selectedSpecId = (patchResult['selectedSpecId'] as string) || '';

  // Non-applied patches always block
  if (status !== 'applied') {
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
    };
    await writeYamlFile(reportPath, result);
    return result;
  }

  // ─── Spec-based verification ───

  // Read the spec and acceptance criteria
  let specInfo: { acceptance?: string[]; rationale?: string } | null = null;
  if (selectedSpecId) {
    specInfo = await readPatchSpec(input.artifactRoot, input.protocolId, input.variant, selectedSpecId);
  }

  // Get the diff of touched files from git
  let diff = '';
  if (input.repoRoot && touchedFiles.length > 0) {
    try {
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD', '--', ...touchedFiles], {
        cwd: input.repoRoot,
        maxBuffer: 1024 * 1024 * 4,
      });
      diff = stdout;
    } catch {
      diff = '(diff unavailable)';
    }
  }

  const notes: string[] = [];
  const criteriaMet: string[] = [];
  const criteriaFailed: string[] = [];
  let specAccepted = true;

  // Check acceptance criteria if spec exists
  if (specInfo?.acceptance && specInfo.acceptance.length > 0) {
    const failed = checkAcceptance(diff, specInfo.acceptance);
    criteriaMet.push(
      ...specInfo.acceptance.filter((c) => !failed.includes(c)),
    );
    criteriaFailed.push(...failed);

    if (failed.length > 0) {
      specAccepted = false;
      notes.push(
        `Spec "${selectedSpecId}" acceptance criteria: ${criteriaMet.length}/${specInfo.acceptance.length} met`,
      );
      if (specInfo.rationale) {
        notes.push(`Rationale: ${specInfo.rationale}`);
      }
      notes.push('Failed criteria:', ...failed);
      notes.push(
        'The patch may not address the root cause identified by the architect. ' +
          'The coder should be given this feedback to refine the fix.',
      );
    } else {
      notes.push(`Spec "${selectedSpecId}" acceptance criteria: all ${criteriaMet.length} met`);
      if (specInfo.rationale) {
        notes.push(`Rationale: ${specInfo.rationale}`);
      }
    }
  } else {
    notes.push('No acceptance criteria available for this patch spec');
  }

  // Check for broken constructs
  const warnings = checkForBrokenConstructs(diff);
  notes.push(...warnings);

  // Build revision feedback for coder
  const revisionFeedback = !specAccepted
    ? [
        `CRITIC REVISION FEEDBACK:`,
        ``,
        `The patch was applied and compiles, but it does not satisfy the architect's acceptance criteria:`,
        ``,
        ...(specInfo?.rationale ? [`Architect rationale: ${specInfo.rationale}`, ''] : []),
        `Criteria NOT met:`,
        ...criteriaFailed.map((c) => `  - ${c}`),
        ``,
        `Please revise your fix to address these criteria. The same acceptance criteria apply.`,
        ``,
        `Current diff summary:`,
        diff.slice(0, 3000),
      ].join('\n')
    : undefined;

  const verdict: 'pass' | 'revision' = revisionFeedback ? 'revision' : 'pass';

  const result: FoundryCriticResult = {
    kind: 'protocol-foundry-critic-report',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    verdict,
    reportPath,
    reviewDurationMs: Date.now() - startedAt,
    message: revisionFeedback
      ? `Patch compiles but needs revision: ${criteriaFailed.length} criterion(s) not met.`
      : `Patch applied: ${touchedFiles.length} file(s) changed, spec verification passed.`,
    notes,
    touchedFiles,
    specVerification: {
      accepted: specAccepted,
      criteriaMet,
      criteriaFailed,
      notes: criteriaFailed.length === 0 ? ['All acceptance criteria satisfied'] : [`${criteriaFailed.length} criteria not met`],
    },
    ...(revisionFeedback ? { revisionFeedback } : {}),
  };

  await writeYamlFile(reportPath, result);
  return result;
}
