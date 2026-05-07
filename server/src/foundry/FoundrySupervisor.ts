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
import { writeYamlFile, type FoundryLedger } from './FoundryArtifacts.js';

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

async function writeSourceDriftArchitectVerdict(
  options: FoundryLoopOptions,
  task: FoundryReadyTask,
  driftFiles: string[],
): Promise<string> {
  const verdictPath = join(options.artifactRoot, 'architect', task.protocolId, task.variant, 'verdict.yaml');
  await writeYamlFile(verdictPath, {
    kind: 'protocol-foundry-architect-verdict',
    protocolId: task.protocolId,
    variant: task.variant,
    generated_at: new Date().toISOString(),
    accepted: false,
    qualityScore: 0,
    coverageEstimate: 0,
    failureClasses: ['source_code_drift'],
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
    ].join('\n'),
  });
  return verdictPath;
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
  const driftFiles = await sourceCodeDriftFiles(options.repoRoot);
  if (driftFiles.length > 0) {
    const verdictPath = await writeSourceDriftArchitectVerdict(options, task, driftFiles);
    markFoundryTask(ledger, {
      protocolId: task.protocolId,
      variant: task.variant,
      stage: 'architect_review',
      status: 'gap',
      artifacts: { architectVerdict: verdictPath, patchSpecs: [] },
      message: `architect review skipped until source drift is resolved: ${driftFiles.join(', ')}`,
    });
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
      ...(options.workerBaseUrl ? { baseUrl: options.workerBaseUrl } : {}),
      ...(options.workerModel ? { model: options.workerModel } : {}),
    },
    ...(options.autoCommitPatches !== undefined ? { autoCommit: options.autoCommitPatches } : {}),
    ...(options.autoPushPatches !== undefined ? { autoPush: options.autoPushPatches } : {}),
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
  });
  markFoundryTask(ledger, {
    protocolId: task.protocolId,
    variant: task.variant,
    stage: 'patch_critic',
    status: result.verdict === 'pass' ? 'accepted' : 'blocked',
    artifacts: {
      criticReport: result.reportPath,
      ...(result.patchFailurePath ? { patchFailure: result.patchFailurePath } : {}),
    },
    message: result.message,
  });
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
  const coderTasks = tasks.filter((task) => task.stage === 'coder_patch');
  if (coderTasks.length > 0) return [coderTasks[0]!];
  const criticTasks = tasks.filter((task) => task.stage === 'patch_critic');
  if (criticTasks.length > 0) return [criticTasks[0]!];
  const adoptionTasks = tasks.filter((task) => task.stage === 'patch_adoption');
  if (adoptionTasks.length > 0) return [adoptionTasks[0]!];
  const rerunTasks = tasks.filter((task) => task.stage === 'rerun');
  if (rerunTasks.length > 0) return [rerunTasks[0]!];
  const browserTasks = tasks.filter((task) => task.stage === 'browser_review');
  if (browserTasks.length > 0) return [browserTasks[0]!];
  const architectTasks = tasks.filter((task) => task.stage === 'architect_review');
  if (architectTasks.length > 0) return [architectTasks[0]!];
  const compileProtocols = new Set<string>();
  const selected: FoundryReadyTask[] = [];
  for (const task of tasks) {
    if (task.stage === 'compile') {
      if (compileProtocols.has(task.protocolId)) continue;
      compileProtocols.add(task.protocolId);
    }
    selected.push(task);
  }
  const stageOrder = new Map<string, number>([
    ['patch_adoption', 0],
    ['coder_patch', 1],
    ['patch_critic', 2],
    ['browser_review', 3],
    ['architect_review', 4],
    ['rerun', 5],
    ['compile', 6],
  ]);
  const [nextTask] = selected.sort((a, b) => (stageOrder.get(a.stage) ?? 99) - (stageOrder.get(b.stage) ?? 99));
  return nextTask ? [nextTask] : [];
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
      if (runnableTasks.length === 0) {
        await writeAllFoundryMetrics(ledger);
        if (options.writeReviewIndex !== false) await writeFoundryReviewIndex(ledger);
        if (!options.watch) break;
        await sleep(options.pollMs ?? 30_000);
        continue;
      }
      await runLimited(runnableTasks, options.maxConcurrency ?? 4, async (task) => {
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
