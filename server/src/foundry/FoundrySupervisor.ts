import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  loadOrCreateFoundryLedger,
  markFoundryTask,
  readyTasks,
  saveFoundryLedger,
  scanFoundryLedger,
  type FoundryReadyTask,
} from './FoundryLedger.js';
import { FOUNDRY_VARIANTS, runProtocolFoundryCompile } from './ProtocolFoundryCompileRunner.js';
import { runFoundryBrowserReview } from './FoundryBrowserReview.js';
import { runFoundryArchitectReview } from './FoundryArchitect.js';
import { runPatchAdoption } from './FoundryImprovement.js';
import { runFoundryCoderPatch } from './FoundryCoderPatch.js';
import { runFoundryPatchCritic } from './FoundryCritic.js';
import { ingestFoundryPdfs } from './FoundryPdfIntake.js';
import { writeFoundryReviewIndex } from './FoundryReviewIndex.js';
import {
  fetchModelEndpointUsage,
  writeAllFoundryMetrics,
  writeModelUsageMetrics,
  type ModelEndpointUsage,
} from './FoundryMetrics.js';
import { asRecord, readYamlFile, writeYamlFile, type FoundryLedger } from './FoundryArtifacts.js';

const execFileAsync = promisify(execFile);

export interface FoundryLoopOptions {
  artifactRoot: string;
  repoRoot: string;
  workbenchRoot?: string;
  workerBaseUrl?: string;
  workerModel?: string;
  architectBaseUrl?: string;
  architectModel?: string;
  appBase?: string;
  apiBase?: string;
  maxConcurrency?: number;
  maxCycles?: number;
  watch?: boolean;
  pollMs?: number;
  dryRun?: boolean;
  skipBrowser?: boolean;
  improvementMode?: boolean;
  applyPatches?: boolean;
  autoCommitPatches?: boolean;
  autoPushPatches?: boolean;
  writeReviewIndex?: boolean;
  intakePdfs?: boolean;
  pdfIntakeBatchSize?: number;
}

async function sourceCodeDriftFiles(repoRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', [
    'status',
    '--porcelain',
    '--',
    'server/src',
    'schema',
    'package.json',
    'package-lock.json',
  ], { cwd: repoRoot });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((path) => path.length > 0)
    .sort();
}

export interface FoundryLoopSummary {
  kind: 'protocol-foundry-loop-summary';
  artifactRoot: string;
  cycles: number;
  tasksRun: number;
  status: 'idle' | 'completed' | 'watching' | 'failed';
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function endpointSnapshot(role: string, baseUrl: string | undefined): Promise<{
  role: string;
  baseUrl: string;
  start?: ModelEndpointUsage;
  end?: ModelEndpointUsage;
  error?: string;
} | undefined> {
  if (!baseUrl) return undefined;
  try {
    return { role, baseUrl, start: await fetchModelEndpointUsage(baseUrl) };
  } catch (error) {
    return { role, baseUrl, error: error instanceof Error ? error.message : String(error) };
  }
}

async function closeEndpointSnapshot(endpoint: {
  role: string;
  baseUrl: string;
  start?: ModelEndpointUsage;
  error?: string;
}): Promise<typeof endpoint & { end?: ModelEndpointUsage }> {
  try {
    return { ...endpoint, end: await fetchModelEndpointUsage(endpoint.baseUrl) };
  } catch (error) {
    return {
      ...endpoint,
      error: [endpoint.error, error instanceof Error ? error.message : String(error)].filter(Boolean).join('; '),
    };
  }
}

async function runCompileTask(options: FoundryLoopOptions, ledger: FoundryLedger, protocolId: string): Promise<void> {
  const protocol = ledger.protocol_status[protocolId];
  if (!protocol) throw new Error(`unknown protocol ${protocolId}`);
  for (const variant of FOUNDRY_VARIANTS) {
    markFoundryTask(ledger, { protocolId, variant, stage: 'compile', status: 'running' });
  }
  await saveFoundryLedger(ledger);
  const summary = await runProtocolFoundryCompile({
    artifactRoot: options.artifactRoot,
    segmentPath: protocol.segmentPath,
    ...(protocol.materialContextPath ? { materialContextPath: protocol.materialContextPath } : {}),
    protocolId,
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    inference: {
      ...(options.workerBaseUrl ? { baseUrl: options.workerBaseUrl } : {}),
      ...(options.workerModel ? { model: options.workerModel } : {}),
    },
  });
  for (const variantSummary of summary.variants) {
    markFoundryTask(ledger, {
      protocolId,
      variant: variantSummary.variant,
      stage: 'compile',
      status: variantSummary.outcome === 'complete' ? 'completed' : 'gap',
      artifacts: {
        compiler: variantSummary.compilerArtifact,
        eventGraph: variantSummary.eventGraphArtifact,
        executionScale: variantSummary.executionScaleArtifact,
      },
      metrics: {
        eventCount: variantSummary.eventCount,
        blockerCount: variantSummary.blockerCount,
      },
    });
  }
  await saveFoundryLedger(ledger);
}

async function runBrowserTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  const variantLedger = ledger.protocol_status[task.protocolId]?.variants[task.variant];
  const proposalPath = variantLedger?.artifacts.eventGraph;
  if (!proposalPath) return;
  markFoundryTask(ledger, { protocolId: task.protocolId, variant: task.variant, stage: 'browser_review', status: 'running' });
  await saveFoundryLedger(ledger);
  const result = options.skipBrowser
    ? await (async () => {
        const reportPath = join(options.artifactRoot, 'browser-review', task.protocolId, task.variant, 'report.yaml');
        await writeYamlFile(reportPath, {
          kind: 'protocol-browser-review-report',
          protocolId: task.protocolId,
          variant: task.variant,
          status: 'skipped',
          route: '',
          played_events: false,
          commands: ['foundry:loop --skip-browser'],
          screenshots: [],
          console_errors: [],
          visual_failures: ['browser review skipped by --skip-browser'],
          labware_checks: [],
        });
        return {
          status: 'skipped' as const,
          reportPath,
          message: 'browser review skipped by --skip-browser',
        };
      })()
    : await runFoundryBrowserReview({
        artifactRoot: options.artifactRoot,
        repoRoot: options.repoRoot,
        ...(options.workbenchRoot ? { workbenchRoot: options.workbenchRoot } : {}),
        protocolId: task.protocolId,
        variant: task.variant,
        proposalPath,
        ...(options.apiBase ? { apiBase: options.apiBase } : {}),
        ...(options.appBase ? { appBase: options.appBase } : {}),
        ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
      });
  const browserStatus = result.status === 'pass'
    ? 'completed'
    : result.status === 'fail'
      ? 'failed'
      : result.status;
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'browser_review',
    status: browserStatus,
    artifacts: { browserReport: result.reportPath },
    ...(result.message ? { message: result.message } : {}),
  });
  await saveFoundryLedger(ledger);
}

async function runArchitectTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  markFoundryTask(ledger, { protocolId: task.protocolId, variant: task.variant, stage: 'architect_review', status: 'running' });
  await saveFoundryLedger(ledger);
  const driftFiles = options.improvementMode ? [] : await sourceCodeDriftFiles(options.repoRoot);
  if (driftFiles.length > 0) {
    const verdictPath = join(options.artifactRoot, 'architect', task.protocolId, task.variant, 'verdict.yaml');
    // Count consecutive drift detections to prevent infinite recompile loops.
    let driftCount = 1;
    const existing = await readYamlFile<Record<string, unknown>>(verdictPath);
    if (existing && Array.isArray(existing.failureClasses) && existing.failureClasses.includes('source_code_drift')) {
      driftCount = (Number(existing.driftCount) || 0) + 1;
    }
    const MAX_DRIFT = 999; // effectively disabled - be permissive to compiler improvements
    if (driftCount >= MAX_DRIFT) {
      // Too many consecutive drift detections — stall this variant instead of
      // looping endlessly.  The user can resolve the drift manually and resume.
      const stallPath = join(options.artifactRoot, 'stalls', task.protocolId, task.variant, 'stall-report.yaml');
      await writeYamlFile(stallPath, {
        kind: 'protocol-foundry-stall-report',
        protocolId: task.protocolId,
        variant: task.variant,
        generated_at: new Date().toISOString(),
        failureClass: 'source_code_drift',
        driftCount,
        changedFiles: driftFiles,
        message: `Source code drifted ${driftCount} consecutive times. Variant stalled to prevent infinite recompile loop.`,
        recommendations: [
          'Stop modifying server/src/foundry/ files while the loop is running',
          'Or restart the loop after the codebase stabilizes',
        ],
      });
      markFoundryTask(ledger, {
        protocolId: task.protocolId,
        variant: task.variant,
        stage: 'architect_review',
        status: 'gap',
        artifacts: { architectVerdict: verdictPath, stallReport: stallPath },
        message: `stalled: source drift detected ${driftCount} consecutive times`,
      });
      await saveFoundryLedger(ledger);
      return;
    }
    const verdictContent: Record<string, unknown> = {
      kind: 'protocol-foundry-architect-verdict',
      protocolId: task.protocolId,
      variant: task.variant,
      generated_at: new Date().toISOString(),
      accepted: false,
      qualityScore: 0,
      coverageEstimate: 0,
      failureClasses: ['source_code_drift'],
      driftCount,
      missingVerbs: [],
      missingLabware: [],
      missingMaterials: [],
      badEvents: [],
      badScalingAssumptions: [],
      recommendedFixes: [],
      sourceArtifacts: {},
      architectNotes: [
        'Architect review skipped because source files changed before spec generation.',
        'Refresh the protocol run after the codebase is clean so patch specs are based on current code.',
        `Changed source files: ${driftFiles.join(', ')}`,
        `Drift detection count: ${driftCount}/${MAX_DRIFT}`,
      ].join('\n'),
    };
    await writeYamlFile(verdictPath, verdictContent);
    markFoundryTask(ledger, {
      protocolId: task.protocolId,
      variant: task.variant,
      stage: 'architect_review',
      status: 'gap',
      artifacts: { architectVerdict: verdictPath, patchSpecs: [] },
      message: `architect review skipped until source drift is resolved: ${driftFiles.join(', ')} (attempt ${driftCount}/${MAX_DRIFT})`,
    });
    // Also mark this protocol for recompile so that the next cycle produces
    // fresh compiler output against the now-stable codebase.  After the rerun,
    // the stale drift verdict will be superseded and architect_review will be
    // re-offered on clean source.
    const protocol = ledger.protocol_status[task.protocolId];
    if (protocol) {
      for (const v of FOUNDRY_VARIANTS) {
        const vi = protocol.variants[v];
        if (vi.artifacts.compiler) {
          markFoundryTask(ledger, {
            protocolId: task.protocolId,
            variant: v,
            stage: 'rerun',
            status: 'pending',
            artifacts: {},
            message: 'source drift detected during architect review; forcing recompile',
          });
        }
      }
    }
    await saveFoundryLedger(ledger);
    return;
  }
  const verdict = await runFoundryArchitectReview({
    artifactRoot: options.artifactRoot,
    repoRoot: options.repoRoot,
    ...(options.workbenchRoot ? { workbenchRoot: options.workbenchRoot } : {}),
    protocolId: task.protocolId,
    variant: task.variant,
    ...(options.appBase ? { appBase: options.appBase } : {}),
    ...(options.apiBase ? { apiBase: options.apiBase } : {}),
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    inference: {
      ...(options.architectBaseUrl ? { baseUrl: options.architectBaseUrl } : {}),
      ...(options.architectModel ? { model: options.architectModel } : {}),
    },
  });
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'architect_review',
    status: verdict.accepted ? 'accepted' : 'gap',
    artifacts: {
      architectVerdict: join(options.artifactRoot, 'architect', task.protocolId, task.variant, 'verdict.yaml'),
      patchSpecs: verdict.recommendedFixes.map((fix) =>
        join(options.artifactRoot, 'patch-specs', task.protocolId, task.variant, `${fix.id}.yaml`),
      ),
    },
    metrics: {
      qualityScore: verdict.qualityScore,
      coverageEstimate: verdict.coverageEstimate,
    },
  });
  await saveFoundryLedger(ledger);
}

async function runPatchAdoptionTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  markFoundryTask(ledger, { protocolId: task.protocolId, variant: task.variant, stage: 'patch_adoption', status: 'running' });
  await saveFoundryLedger(ledger);
  const result = await runPatchAdoption({
    artifactRoot: options.artifactRoot,
    protocolId: task.protocolId,
    variant: task.variant,
    ...(options.applyPatches !== undefined ? { applyPatches: options.applyPatches } : {}),
  });
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'patch_adoption',
    status: result.status === 'accepted' ? 'accepted' : result.status,
    artifacts: { adoptionDecision: result.adoptionPath },
    message: result.message,
  });
  await saveFoundryLedger(ledger);
}

async function runCoderPatchTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  markFoundryTask(ledger, { protocolId: task.protocolId, variant: task.variant, stage: 'coder_patch', status: 'running' });
  await saveFoundryLedger(ledger);

  // Load revision feedback if this is a revision run
  let revisionFeedback: string | undefined;
  if (task.revisionMode) {
    const coderPatchPath = join(options.artifactRoot, 'code-patches', task.protocolId, task.variant, 'result.yaml');
    const existing = asRecord(await readYamlFile(coderPatchPath));
    revisionFeedback = (existing['revisionFeedback'] as string) || undefined;
  }

  const result = await runFoundryCoderPatch({
    artifactRoot: options.artifactRoot,
    repoRoot: options.repoRoot,
    ...(options.workbenchRoot ? { workbenchRoot: options.workbenchRoot } : {}),
    protocolId: task.protocolId,
    variant: task.variant,
    ...(options.appBase ? { appBase: options.appBase } : {}),
    ...(options.apiBase ? { apiBase: options.apiBase } : {}),
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    inference: {
      ...(options.architectBaseUrl ? { baseUrl: options.architectBaseUrl } : {}),
      ...(options.architectModel ? { model: options.architectModel } : {}),
    },
    ...(options.autoCommitPatches !== undefined ? { autoCommit: options.autoCommitPatches } : {}),
    ...(options.autoPushPatches !== undefined ? { autoPush: options.autoPushPatches } : {}),
    ...(revisionFeedback ? { revisionFeedback } : {}),
  });
  await writeYamlFile(join(options.artifactRoot, 'patch-reports', `${task.protocolId}-${task.variant}.yaml`), {
    kind: 'protocol-worker-report',
    protocolId: task.protocolId,
    variant: task.variant,
    generated_at: new Date().toISOString(),
    status: result.status,
    coderPatch: result.resultPath,
    touchedFiles: result.touchedFiles,
    message: result.message,
  });
  const status = result.status === 'applied'
    ? 'completed'
    : result.status === 'skipped'
      ? 'blocked'
    : result.status === 'needs-human'
      ? 'blocked'
    : result.status === 'stale'
      ? 'gap'
    : result.status;
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'coder_patch',
    status,
    artifacts: {
      coderPatch: result.resultPath,
      patchReport: join(options.artifactRoot, 'patch-reports', `${task.protocolId}-${task.variant}.yaml`),
    },
    message: result.message,
  });
  await saveFoundryLedger(ledger);
}

async function runPatchCriticTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  markFoundryTask(ledger, { protocolId: task.protocolId, variant: task.variant, stage: 'patch_critic', status: 'running' });
  await saveFoundryLedger(ledger);
  const result = await runFoundryPatchCritic({
    artifactRoot: options.artifactRoot,
    protocolId: task.protocolId,
    variant: task.variant,
    repoRoot: options.repoRoot,
  });

  // Clear patch_critic task from ledger to prevent re-selection.
  // The coder_patch result tracks the actual pipeline state.
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'patch_critic',
    status: 'completed',
    artifacts: {
      criticReport: result.reportPath,
      ...(result.patchFailurePath ? { patchFailure: result.patchFailurePath } : {}),
    },
    message: result.message,
  });

  // If revision is needed, set the flag and write feedback to the coder patch result.
  // The next cycle will inject a revision coder_patch via readyTasks.
  if (result.verdict === 'revision' && result.revisionFeedback) {
    const coderPatchPath = join(options.artifactRoot, 'code-patches', task.protocolId, task.variant, 'result.yaml');
    const existing = asRecord(await readYamlFile(coderPatchPath));
    existing['revisionFeedback'] = result.revisionFeedback;
    await writeYamlFile(coderPatchPath, existing);

    const protocol = ledger.protocol_status[task.protocolId];
    const item = protocol?.variants[task.variant];
    if (item) {
      item.patchRevision = true;
      await saveFoundryLedger(ledger);
      return;
    }
  }

  await saveFoundryLedger(ledger);
}

async function runRerunTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  const protocol = ledger.protocol_status[task.protocolId];
  if (!protocol) throw new Error(`unknown protocol ${task.protocolId}`);
  markFoundryTask(ledger, { protocolId: task.protocolId, variant: task.variant, stage: 'rerun', status: 'running' });
  await saveFoundryLedger(ledger);
  const summary = await runProtocolFoundryCompile({
    artifactRoot: options.artifactRoot,
    segmentPath: protocol.segmentPath,
    ...(protocol.materialContextPath ? { materialContextPath: protocol.materialContextPath } : {}),
    protocolId: task.protocolId,
    variants: [task.variant],
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    inference: {
      ...(options.workerBaseUrl ? { baseUrl: options.workerBaseUrl } : {}),
      ...(options.workerModel ? { model: options.workerModel } : {}),
    },
  });
  const variantSummary = summary.variants[0];
  if (!variantSummary) throw new Error(`rerun produced no summary for ${task.protocolId}/${task.variant}`);
  const rerunReport = join(options.artifactRoot, 'rerun', task.protocolId, task.variant, 'rerun.yaml');
  await writeYamlFile(rerunReport, {
    kind: 'protocol-foundry-rerun-report',
    protocolId: task.protocolId,
    variant: task.variant,
    generated_at: new Date().toISOString(),
    compilerArtifact: variantSummary.compilerArtifact,
    eventGraphArtifact: variantSummary.eventGraphArtifact,
    executionScaleArtifact: variantSummary.executionScaleArtifact,
    outcome: variantSummary.outcome,
    eventCount: variantSummary.eventCount,
    blockerCount: variantSummary.blockerCount,
  });
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'rerun',
    status: variantSummary.outcome === 'complete' ? 'completed' : 'gap',
    artifacts: {
      compiler: variantSummary.compilerArtifact,
      eventGraph: variantSummary.eventGraphArtifact,
      executionScale: variantSummary.executionScaleArtifact,
      rerunReport,
    },
    metrics: {
      eventCount: variantSummary.eventCount,
      blockerCount: variantSummary.blockerCount,
    },
  });
  await saveFoundryLedger(ledger);
}

async function runTask(options: FoundryLoopOptions, ledger: FoundryLedger, task: FoundryReadyTask): Promise<void> {
  if (task.stage === 'compile') {
    await runCompileTask(options, ledger, task.protocolId);
  } else if (task.stage === 'browser_review') {
    await runBrowserTask(options, ledger, task);
  } else if (task.stage === 'architect_review') {
    await runArchitectTask(options, ledger, task);
  } else if (task.stage === 'patch_adoption') {
    await runPatchAdoptionTask(options, ledger, task);
  } else if (task.stage === 'coder_patch') {
    await runCoderPatchTask(options, ledger, task);
  } else if (task.stage === 'patch_critic') {
    await runPatchCriticTask(options, ledger, task);
  } else if (task.stage === 'rerun') {
    await runRerunTask(options, ledger, task);
  }
}

export function selectRunnableTasks(tasks: FoundryReadyTask[]): FoundryReadyTask[] {
  // Stages that MUST be serial (one at a time): coder_patch, patch_critic, patch_adoption.
  // These involve mutable state (git apply, critic review) that conflicts across variants.
  const coderTasks = tasks.filter((task) => task.stage === 'coder_patch');
  if (coderTasks.length > 0) return [coderTasks[0]!];
  const criticTasks = tasks.filter((task) => task.stage === 'patch_critic');
  if (criticTasks.length > 0) return [criticTasks[0]!];
  const adoptionTasks = tasks.filter((task) => task.stage === 'patch_adoption');
  if (adoptionTasks.length > 0) return [adoptionTasks[0]!];

  // Rerun tasks are also serial because they write to shared compiler state.
  const rerunTasks = tasks.filter((task) => task.stage === 'rerun');
  if (rerunTasks.length > 0) return [rerunTasks[0]!];

  // Stages that CAN run in parallel: browser_review, architect_review.
  const browserTasks = tasks.filter((task) => task.stage === 'browser_review');
  if (browserTasks.length > 0) return browserTasks;
  const architectTasks = tasks.filter((task) => task.stage === 'architect_review');
  if (architectTasks.length > 0) return architectTasks;

  // Compile: one task per protocol (all variants compiled together).
  const compileProtocols = new Set<string>();
  const selected: FoundryReadyTask[] = [];
  for (const task of tasks) {
    if (task.stage === 'compile') {
      if (compileProtocols.has(task.protocolId)) continue;
      compileProtocols.add(task.protocolId);
    }
    selected.push(task);
  }
  if (selected.length > 0) {
    const stageOrder: Record<string, number> = {
      patch_adoption: 0, coder_patch: 1, patch_critic: 2, browser_review: 3, architect_review: 4, rerun: 5, compile: 6,
    };
    selected.sort((a, b) => (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99));
    return selected;
  }
  return [];
}

export async function runFoundryLoop(options: FoundryLoopOptions): Promise<FoundryLoopSummary> {
  const startedAt = new Date().toISOString();
  const endpointStarts = (await Promise.all([
    endpointSnapshot('worker', options.workerBaseUrl),
    endpointSnapshot('architect', options.architectBaseUrl),
  ])).filter((item): item is NonNullable<typeof item> => Boolean(item));

  let cycles = 0;
  let tasksRun = 0;
  let ledger = await scanFoundryLedger(options.artifactRoot);
  const maxCycles = options.maxCycles ?? (options.watch ? Number.POSITIVE_INFINITY : 1);
  try {
    while (cycles < maxCycles) {
      cycles += 1;
      if (options.intakePdfs !== false) {
        await ingestFoundryPdfs({
          artifactRoot: options.artifactRoot,
          ...(options.pdfIntakeBatchSize !== undefined ? { batchSize: options.pdfIntakeBatchSize } : {}),
        });
      }
      ledger = await scanFoundryLedger(options.artifactRoot);
      const tasks = selectRunnableTasks(readyTasks(ledger));
      const runnableTasks = tasks.filter((task) => {
        if (!options.improvementMode && (task.stage === 'patch_adoption' || task.stage === 'coder_patch' || task.stage === 'rerun')) return false;
        if (task.stage === 'coder_patch' && !options.applyPatches) return false;
        return true;
      });
      // Serialize coder_patch: only one at a time to avoid merge conflicts on the same files
      const coderPatchTasks = runnableTasks.filter((t) => t.stage === 'coder_patch');
      const otherTasks = runnableTasks.filter((t) => t.stage !== 'coder_patch');
      const limitedTasks = otherTasks.concat(coderPatchTasks.slice(0, 1));
      if (runnableTasks.length === 0) {
        await writeAllFoundryMetrics(ledger);
        if (options.writeReviewIndex !== false) await writeFoundryReviewIndex(ledger);
        if (!options.watch) break;
        await sleep(options.pollMs ?? 30_000);
        continue;
      }
      await runLimited(limitedTasks, options.maxConcurrency ?? 4, async (task) => {
        await runTask(options, ledger, task);
        tasksRun += 1;
      });
      ledger = await scanFoundryLedger(options.artifactRoot);
      await writeAllFoundryMetrics(ledger);
      if (options.writeReviewIndex !== false) await writeFoundryReviewIndex(ledger);
      if (!options.watch && cycles >= maxCycles) break;
    }

    const completedAt = new Date().toISOString();
    const endpoints = await Promise.all(endpointStarts.map((endpoint) => closeEndpointSnapshot(endpoint)));
    await writeModelUsageMetrics({
      artifactRoot: options.artifactRoot,
      startedAt,
      completedAt,
      endpoints,
    });
    return {
      kind: 'protocol-foundry-loop-summary',
      artifactRoot: options.artifactRoot,
      cycles,
      tasksRun,
      status: options.watch ? 'watching' : tasksRun > 0 ? 'completed' : 'idle',
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const endpoints = await Promise.all(endpointStarts.map((endpoint) => closeEndpointSnapshot(endpoint)));
    await writeModelUsageMetrics({
      artifactRoot: options.artifactRoot,
      startedAt,
      completedAt,
      endpoints,
    });
    const latest = await loadOrCreateFoundryLedger(options.artifactRoot);
    await writeAllFoundryMetrics(latest);
    throw error;
  }
}
