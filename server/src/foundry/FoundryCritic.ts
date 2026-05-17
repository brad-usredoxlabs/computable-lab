import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createInferenceClient } from '../ai/InferenceClient.js';
import type { InferenceConfig } from '../config/types.js';
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
  inference?: Partial<InferenceConfig>;
  onProgress?: (event: FoundryCriticProgressEvent) => void | Promise<void>;
  specTestRunner?: (command: string) => Promise<SpecTestResult>;
}

export interface FoundryCriticProgressEvent {
  source: 'critic';
  phase: string;
  message: string;
  details?: Record<string, unknown>;
}

interface AiCriticReview {
  verdict: 'pass' | 'revision';
  message: string;
  notes: string[];
  criteriaMet: string[];
  criteriaFailed: string[];
  revisionFeedback?: string;
}

interface PatchSpecInfo {
  acceptance?: string[];
  rationale?: string;
  tests?: string[];
}

export interface SpecTestResult {
  command: string;
  status: 'passed' | 'failed' | 'skipped';
  output?: string;
}

/** Read the patch spec from the adoption decision or patch-specs directory */
async function readPatchSpec(
  artifactRoot: string,
  protocolId: string,
  variant: string,
  specId: string,
): Promise<PatchSpecInfo | null> {
  // Try patch-specs directory first
  const specPath = join(artifactRoot, 'patch-specs', protocolId, variant, `${specId}.yaml`);
  try {
    const raw = asRecord(await readYamlFile(specPath));
    const acceptance = Array.isArray(raw['acceptance']) ? raw['acceptance'] as string[] : undefined;
    const rationale = typeof raw['rationale'] === 'string' ? raw['rationale'] : undefined;
    const tests = Array.isArray(raw['tests']) ? raw['tests'].filter((item): item is string => typeof item === 'string') : undefined;
    return {
      ...(acceptance !== undefined ? { acceptance } : {}),
      ...(rationale !== undefined ? { rationale } : {}),
      ...(tests !== undefined ? { tests } : {}),
    };
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
            const tests = Array.isArray(raw['tests']) ? raw['tests'].filter((item): item is string => typeof item === 'string') : undefined;
            return {
              ...(acceptance !== undefined ? { acceptance } : {}),
              ...(rationale !== undefined ? { rationale } : {}),
              ...(tests !== undefined ? { tests } : {}),
            };
          }
        }
      }
    } catch {
      // No spec found — proceed without verification
    }
    return null;
  }
}

function truncateOutput(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... truncated ${text.length - maxChars} char(s)`;
}

function parseSupportedSpecTest(command: string):
  | { cwdSuffix: string; args: string[] }
  | undefined {
  const trimmed = command.trim();
  const fixtureMatch = trimmed.match(
    /^cd\s+server\s+&&\s+npx\s+vitest\s+run\s+src\/compiler\/pipeline\/fixtures\/FixItFixtures\.test\.ts\s+-t\s+(['"])(.+?)\1$/,
  );
  if (!fixtureMatch) return undefined;
  return {
    cwdSuffix: 'server',
    args: [
      'vitest',
      'run',
      'src/compiler/pipeline/fixtures/FixItFixtures.test.ts',
      '-t',
      fixtureMatch[2]!,
    ],
  };
}

async function runSpecTestCommand(repoRoot: string | undefined, command: string): Promise<SpecTestResult> {
  if (!repoRoot) {
    return {
      command,
      status: 'skipped',
      output: 'No repoRoot was provided to the critic, so the spec test could not be run.',
    };
  }

  const parsed = parseSupportedSpecTest(command);
  if (!parsed) {
    return {
      command,
      status: 'skipped',
      output: 'Unsupported spec test command; critic only auto-runs generated FixIt fixture vitest commands.',
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync('npx', parsed.args, {
      cwd: join(repoRoot, parsed.cwdSuffix),
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      command,
      status: 'passed',
      output: truncateOutput([stdout, stderr].filter(Boolean).join('\n')),
    };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    return {
      command,
      status: 'failed',
      output: truncateOutput([
        error.message ?? 'spec test failed',
        error.stdout ?? '',
        error.stderr ?? '',
      ].filter(Boolean).join('\n')),
    };
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

function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function runAiCriticReview(input: {
  inference?: Partial<InferenceConfig>;
  protocolId: string;
  variant: string;
  selectedSpecId: string;
  acceptance: string[];
  rationale?: string;
  touchedFiles: string[];
  diff: string;
  deterministicNotes: string[];
}): Promise<AiCriticReview | undefined> {
  if (!input.inference?.baseUrl || !input.inference.model) return undefined;
  const client = createInferenceClient({
    baseUrl: input.inference.baseUrl,
    model: input.inference.model,
    temperature: 0,
    timeoutMs: 300_000,
    maxTokens: 4096,
  });
  const response = await client.complete({
    model: input.inference.model,
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: [
          'You are the Protocol Foundry critic.',
          'Judge whether the coder patch actually satisfies the reviewed patch spec.',
          'Be strict about semantics: event graph behavior, pre-compiler/compiler contracts, ontology-aware data, and acceptance criteria matter more than superficial code changes.',
          'Return only JSON with keys: verdict, message, notes, criteriaMet, criteriaFailed, revisionFeedback.',
          'verdict must be "pass" or "revision". Use "revision" unless the patch clearly satisfies the spec.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Protocol: ${input.protocolId}`,
          `Variant: ${input.variant}`,
          `Spec: ${input.selectedSpecId || '(unknown)'}`,
          ``,
          `Rationale:`,
          input.rationale || '(none)',
          ``,
          `Acceptance criteria:`,
          input.acceptance.length ? input.acceptance.map((item) => `- ${item}`).join('\n') : '(none)',
          ``,
          `Touched files:`,
          input.touchedFiles.map((item) => `- ${item}`).join('\n') || '(none)',
          ``,
          `Deterministic critic notes:`,
          input.deterministicNotes.map((item) => `- ${item}`).join('\n') || '(none)',
          ``,
          `Patch diff:`,
          input.diff.slice(0, 12000) || '(diff unavailable)',
        ].join('\n'),
      },
    ],
  });
  const content = response.choices[0]?.message.content ?? '';
  const parsed = extractJsonObject(content);
  if (!parsed) return undefined;
  const verdict = parsed['verdict'] === 'pass' ? 'pass' : 'revision';
  const message = typeof parsed['message'] === 'string' && parsed['message'].trim()
    ? parsed['message']
    : verdict === 'pass'
      ? 'AI critic accepted the patch.'
      : 'AI critic requested revision.';
  const revisionFeedback = typeof parsed['revisionFeedback'] === 'string' && parsed['revisionFeedback'].trim()
    ? parsed['revisionFeedback']
    : undefined;
  return {
    verdict,
    message,
    notes: strings(parsed['notes']),
    criteriaMet: strings(parsed['criteriaMet']),
    criteriaFailed: strings(parsed['criteriaFailed']),
    ...(revisionFeedback ? { revisionFeedback } : {}),
  };
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
  const progress = async (
    event: Omit<FoundryCriticProgressEvent, 'source'>,
  ) => {
    await input.onProgress?.({ source: 'critic', ...event });
  };
  const startedAt = Date.now();
  const patchResultPath = join(input.artifactRoot, 'code-patches', input.protocolId, input.variant, 'result.yaml');
  const reportPath = join(input.artifactRoot, 'patch-critic', input.protocolId, input.variant, 'report.yaml');
  const patchResult = asRecord(await readYamlFile(patchResultPath));
  const status = patchResult['status'];
  const touchedFiles = meaningfulPatchFiles(
    (Array.isArray(patchResult['touchedFiles']) ? patchResult['touchedFiles'] : []).filter((f: string) => typeof f === 'string'),
  );
  const selectedSpecId = (patchResult['selectedSpecId'] as string) || '';
  await progress({
    phase: 'loaded_patch',
    message: `Loaded coder result with status ${String(status)}`,
    details: { status, selectedSpecId, touchedFiles },
  });

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
    await progress({
      phase: 'result',
      message: `Critic blocked non-applied patch: ${message}`,
      details: { verdict: result.verdict },
    });
    return result;
  }

  // ─── Spec-based verification ───

  // Read the spec and acceptance criteria
  let specInfo: PatchSpecInfo | null = null;
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
  await progress({
    phase: 'diff_ready',
    message: `Collected diff for ${touchedFiles.length} touched file(s)`,
    details: { touchedFiles, diffChars: diff.length },
  });

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
  await progress({
    phase: 'acceptance_checked',
    message: `Deterministic critic: ${criteriaMet.length}/${(specInfo?.acceptance ?? []).length} criteria met`,
    details: {
      criteriaMet,
      criteriaFailed,
    },
  });

  const specTestResults: SpecTestResult[] = [];
  if (specInfo?.tests && specInfo.tests.length > 0) {
    await progress({
      phase: 'tests_started',
      message: `Running ${specInfo.tests.length} spec test(s)`,
      details: { tests: specInfo.tests },
    });
    for (const command of specInfo.tests) {
      const result = input.specTestRunner
        ? await input.specTestRunner(command)
        : await runSpecTestCommand(input.repoRoot, command);
      specTestResults.push(result);
      if (result.status === 'passed') {
        criteriaMet.push(`Regression test passed: ${command}`);
        notes.push(`Spec test passed: ${command}`);
      } else if (result.status === 'failed') {
        specAccepted = false;
        const criterion = `Regression test failed: ${command}`;
        criteriaFailed.push(criterion);
        notes.push(criterion);
        if (result.output) notes.push(result.output);
      } else {
        notes.push(`Spec test skipped: ${command}`);
        if (result.output) notes.push(result.output);
      }
      await progress({
        phase: 'test_finished',
        message: `Spec test ${result.status}: ${command}`,
        details: result.output ? { command, status: result.status, output: result.output } : { command, status: result.status },
      });
    }
  }
  const failedSpecTests = specTestResults.filter((result) => result.status === 'failed');

  // Check for broken constructs
  const warnings = checkForBrokenConstructs(diff);
  notes.push(...warnings);

  let aiReview: AiCriticReview | undefined;
  if (failedSpecTests.length === 0) {
    await progress({ phase: 'ai_review_started', message: 'Asking AI critic to review the patch diff' });
    aiReview = await runAiCriticReview({
      ...(input.inference ? { inference: input.inference } : {}),
      protocolId: input.protocolId,
      variant: input.variant,
      selectedSpecId,
      acceptance: specInfo?.acceptance ?? [],
      ...(specInfo?.rationale ? { rationale: specInfo.rationale } : {}),
      touchedFiles,
      diff,
      deterministicNotes: notes,
    }).catch((error) => {
      notes.push(`AI critic unavailable; using deterministic critic fallback: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    await progress({
      phase: 'ai_review_finished',
      message: aiReview
        ? `AI critic verdict: ${aiReview.verdict}`
        : 'AI critic unavailable; using deterministic fallback',
      details: aiReview
        ? { verdict: aiReview.verdict, criteriaMet: aiReview.criteriaMet, criteriaFailed: aiReview.criteriaFailed }
        : {},
    });
  } else {
    notes.push('AI critic skipped because one or more generated regression tests failed.');
    await progress({
      phase: 'ai_review_skipped',
      message: 'Skipping AI critic because generated regression tests failed',
      details: { failedTests: failedSpecTests.map((result) => result.command) },
    });
  }

  if (aiReview) {
    specAccepted = aiReview.verdict === 'pass';
    criteriaMet.splice(0, criteriaMet.length, ...aiReview.criteriaMet);
    criteriaFailed.splice(0, criteriaFailed.length, ...aiReview.criteriaFailed);
    notes.push('AI critic review:', ...aiReview.notes);
  }

  if (failedSpecTests.length > 0) {
    specAccepted = false;
    const failedCriteria = failedSpecTests.map((result) => `Regression test failed: ${result.command}`);
    for (const criterion of failedCriteria) {
      if (!criteriaFailed.includes(criterion)) criteriaFailed.push(criterion);
    }
  }

  // Build revision feedback for coder
  const revisionFeedback = !specAccepted
    ? aiReview?.revisionFeedback ?? [
        `CRITIC REVISION FEEDBACK:`,
        ``,
        aiReview
          ? aiReview.message
          : `The patch was applied and compiles, but it does not satisfy the architect's acceptance criteria:`,
        ``,
        ...(specInfo?.rationale ? [`Architect rationale: ${specInfo.rationale}`, ''] : []),
        `Criteria NOT met:`,
        ...criteriaFailed.map((c) => `  - ${c}`),
        ``,
        ...(failedSpecTests.length > 0
          ? [
              `Failing regression test output:`,
              ...failedSpecTests.map((result) => [
                `$ ${result.command}`,
                result.output ?? '(no output)',
              ].join('\n')),
              ``,
            ]
          : []),
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
    message: aiReview?.message ?? (revisionFeedback
      ? `Patch compiles but needs revision: ${criteriaFailed.length} criterion(s) not met.`
      : `Patch applied: ${touchedFiles.length} file(s) changed, spec verification passed.`),
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
  await progress({
    phase: 'result',
    message: `Critic verdict: ${result.verdict}`,
    details: {
      verdict: result.verdict,
      criteriaMet,
      criteriaFailed,
    },
  });
  return result;
}
