import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  asRecord,
  nowIso,
  readYamlFile,
  writeYamlFile,
  type FoundryLedger,
  type FoundryWorkStatus,
} from './FoundryArtifacts.js';
import {
  loadOrCreateFoundryLedger,
  markFoundryTask,
  readyTasks,
  saveFoundryLedger,
  scanFoundryLedger,
} from './FoundryLedger.js';
import { runFoundryCoderPatch, type FoundryCoderPatchResult } from './FoundryCoderPatch.js';
import { runFoundryPatchCritic } from './FoundryCritic.js';
import { syncFoundryReviewImplementationStatus } from './FoundryHumanReview.js';
import { runProtocolFoundryCompile, FOUNDRY_VARIANTS, type FoundryVariant } from './ProtocolFoundryCompileRunner.js';
import { writeFoundryManifests, writeFoundryOperationalStatus } from './FoundryManifest.js';

export interface FoundryReviewedSpecRunOptions {
  artifactRoot: string;
  repoRoot: string;
  protocolId?: string;
  variant?: FoundryVariant;
  maxSpecs?: number;
  maxAttempts?: number;
  dryRun?: boolean;
  autoCommit?: boolean;
  autoPush?: boolean;
  workerBaseUrl?: string;
  workerModel?: string;
  architectBaseUrl?: string;
  architectModel?: string;
}

export interface FoundryReviewedSpecRunItem {
  protocolId: string;
  variant: FoundryVariant;
  status: 'implemented' | 'blocked' | 'revision' | 'failed' | 'skipped';
  attempts: Array<{
    attempt: number;
    coder: {
      status: string;
      resultPath: string;
      message: string;
      touchedFiles: string[];
    };
    critic?: {
      verdict: string;
      reportPath: string;
      message: string;
    };
    rerun?: {
      outcome: string;
      reportPath: string;
    };
  }>;
  reviewStatus?: string;
  message: string;
}

export interface FoundryReviewedSpecRunReport {
  kind: 'protocol-foundry-reviewed-spec-run-report';
  generated_at: string;
  artifactRoot: string;
  repoRoot: string;
  dryRun: boolean;
  selectedCount: number;
  items: FoundryReviewedSpecRunItem[];
  nextTasks: ReturnType<typeof readyTasks>;
  reportPath: string;
}

function reviewPath(artifactRoot: string, protocolId: string, variant: FoundryVariant): string {
  return join(artifactRoot, 'human-review', protocolId, variant, 'review.yaml');
}

function coderStatus(status: FoundryCoderPatchResult['status']): FoundryWorkStatus {
  if (status === 'applied') return 'completed';
  if (status === 'skipped' || status === 'needs-human') return 'blocked';
  if (status === 'stale') return 'gap';
  return status;
}

async function ensureCoderResultArtifact(input: {
  result: FoundryCoderPatchResult;
  protocolId: string;
  variant: FoundryVariant;
}): Promise<void> {
  if (existsSync(input.result.resultPath)) return;
  await writeYamlFile(input.result.resultPath, {
    kind: 'protocol-foundry-coder-patch-result',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    status: input.result.status,
    message: input.result.message,
    touchedFiles: input.result.touchedFiles,
  });
}

async function queuedHumanReviewedSpecs(input: {
  artifactRoot: string;
  protocolId?: string;
  variant?: FoundryVariant;
  maxSpecs: number;
}): Promise<Array<{ protocolId: string; variant: FoundryVariant }>> {
  const ledger = await scanFoundryLedger(input.artifactRoot);
  const out: Array<{ protocolId: string; variant: FoundryVariant }> = [];
  for (const protocolId of ledger.protocols) {
    if (input.protocolId && input.protocolId !== protocolId) continue;
    for (const variant of FOUNDRY_VARIANTS) {
      if (input.variant && input.variant !== variant) continue;
      const review = asRecord(await readYamlFile(reviewPath(input.artifactRoot, protocolId, variant)));
      if (review['status'] !== 'queued') continue;
      if (typeof review['livePatchSpecPath'] !== 'string') continue;
      out.push({ protocolId, variant });
      if (out.length >= input.maxSpecs) return out;
    }
  }
  return out;
}

async function runRerun(input: {
  options: FoundryReviewedSpecRunOptions;
  ledger: FoundryLedger;
  protocolId: string;
  variant: FoundryVariant;
}): Promise<{ outcome: string; reportPath: string } | undefined> {
  const protocol = input.ledger.protocol_status[input.protocolId];
  if (!protocol) return undefined;
  const summary = await runProtocolFoundryCompile({
    artifactRoot: input.options.artifactRoot,
    segmentPath: protocol.segmentPath,
    ...(protocol.materialContextPath ? { materialContextPath: protocol.materialContextPath } : {}),
    protocolId: input.protocolId,
    variants: [input.variant],
    ...(input.options.dryRun !== undefined ? { dryRun: input.options.dryRun } : {}),
    inference: {
      ...(input.options.workerBaseUrl ? { baseUrl: input.options.workerBaseUrl } : {}),
      ...(input.options.workerModel ? { model: input.options.workerModel } : {}),
    },
  });
  const variantSummary = summary.variants[0];
  if (!variantSummary) return undefined;
  const reportPath = join(input.options.artifactRoot, 'rerun', input.protocolId, input.variant, 'rerun.yaml');
  await writeYamlFile(reportPath, {
    kind: 'protocol-foundry-rerun-report',
    protocolId: input.protocolId,
    variant: input.variant,
    generated_at: nowIso(),
    compilerArtifact: variantSummary.compilerArtifact,
    eventGraphArtifact: variantSummary.eventGraphArtifact,
    executionScaleArtifact: variantSummary.executionScaleArtifact,
    outcome: variantSummary.outcome,
    eventCount: variantSummary.eventCount,
    blockerCount: variantSummary.blockerCount,
  });
  markFoundryTask(input.ledger, {
    protocolId: input.protocolId,
    variant: input.variant,
    stage: 'rerun',
    status: variantSummary.outcome === 'complete' ? 'completed' : 'gap',
    artifacts: {
      compiler: variantSummary.compilerArtifact,
      eventGraph: variantSummary.eventGraphArtifact,
      executionScale: variantSummary.executionScaleArtifact,
      rerunReport: reportPath,
    },
    metrics: {
      eventCount: variantSummary.eventCount,
      blockerCount: variantSummary.blockerCount,
    },
  });
  return { outcome: variantSummary.outcome, reportPath };
}

export async function runFoundryReviewedSpecBatch(
  options: FoundryReviewedSpecRunOptions,
): Promise<FoundryReviewedSpecRunReport> {
  const maxSpecs = Math.max(1, options.maxSpecs ?? 1);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const selected = await queuedHumanReviewedSpecs({
    artifactRoot: options.artifactRoot,
    ...(options.protocolId ? { protocolId: options.protocolId } : {}),
    ...(options.variant ? { variant: options.variant } : {}),
    maxSpecs,
  });
  const items: FoundryReviewedSpecRunItem[] = [];
  let ledger = await loadOrCreateFoundryLedger(options.artifactRoot);

  for (const selectedItem of selected) {
    const attempts: FoundryReviewedSpecRunItem['attempts'] = [];
    let revisionFeedback: string | undefined;
    let itemStatus: FoundryReviewedSpecRunItem['status'] = 'blocked';
    let message = 'No patch attempt completed.';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      markFoundryTask(ledger, {
        protocolId: selectedItem.protocolId,
        variant: selectedItem.variant,
        stage: 'coder_patch',
        status: 'running',
      });
      await saveFoundryLedger(ledger);
      const coder = await runFoundryCoderPatch({
        artifactRoot: options.artifactRoot,
        repoRoot: options.repoRoot,
        protocolId: selectedItem.protocolId,
        variant: selectedItem.variant,
        attempt,
        coderRole: attempt === 1 ? 'junior' : 'senior',
        ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
        ...(options.autoCommit !== undefined ? { autoCommit: options.autoCommit } : {}),
        ...(options.autoPush !== undefined ? { autoPush: options.autoPush } : {}),
        ...(revisionFeedback ? { revisionFeedback } : {}),
        inference: {
          ...(options.architectBaseUrl ? { baseUrl: options.architectBaseUrl } : {}),
          ...(options.architectModel ? { model: options.architectModel } : {}),
        },
        workerInference: {
          ...(options.workerBaseUrl ? { baseUrl: options.workerBaseUrl } : {}),
          ...(options.workerModel ? { model: options.workerModel } : {}),
        },
      });
      await ensureCoderResultArtifact({
        result: coder,
        protocolId: selectedItem.protocolId,
        variant: selectedItem.variant,
      });
      markFoundryTask(ledger, {
        protocolId: selectedItem.protocolId,
        variant: selectedItem.variant,
        stage: 'coder_patch',
        status: coderStatus(coder.status),
        artifacts: {
          coderPatch: coder.resultPath,
          patchReport: join(options.artifactRoot, 'patch-reports', `${selectedItem.protocolId}-${selectedItem.variant}.yaml`),
        },
        message: coder.message,
      });
      await saveFoundryLedger(ledger);

      const attemptRecord: FoundryReviewedSpecRunItem['attempts'][number] = {
        attempt,
        coder: {
          status: coder.status,
          resultPath: coder.resultPath,
          message: coder.message,
          touchedFiles: coder.touchedFiles,
        },
      };
      const critic = await runFoundryPatchCritic({
        artifactRoot: options.artifactRoot,
        protocolId: selectedItem.protocolId,
        variant: selectedItem.variant,
        repoRoot: options.repoRoot,
        inference: {
          ...(options.architectBaseUrl ? { baseUrl: options.architectBaseUrl } : {}),
          ...(options.architectModel ? { model: options.architectModel } : {}),
        },
      });
      attemptRecord.critic = {
        verdict: critic.verdict,
        reportPath: critic.reportPath,
        message: critic.message,
      };
      markFoundryTask(ledger, {
        protocolId: selectedItem.protocolId,
        variant: selectedItem.variant,
        stage: 'patch_critic',
        status: 'completed',
        artifacts: {
          criticReport: critic.reportPath,
          ...(critic.patchFailurePath ? { patchFailure: critic.patchFailurePath } : {}),
        },
        message: critic.message,
      });
      await saveFoundryLedger(ledger);

      if (critic.verdict === 'pass') {
        const rerun = await runRerun({
          options,
          ledger,
          protocolId: selectedItem.protocolId,
          variant: selectedItem.variant,
        });
        if (rerun) attemptRecord.rerun = rerun;
        itemStatus = rerun?.outcome === 'complete' ? 'implemented' : 'failed';
        message = rerun?.outcome === 'complete'
          ? 'Patch passed critic and rerun completed.'
          : 'Patch passed critic but rerun did not complete.';
        attempts.push(attemptRecord);
        break;
      }
      attempts.push(attemptRecord);
      if (!options.dryRun && attempt < maxAttempts) {
        revisionFeedback = critic.revisionFeedback ?? [
          'CRITIC REVISION FEEDBACK:',
          '',
          critic.message,
          '',
          ...critic.notes.map((note) => `- ${note}`),
        ].join('\n');
        itemStatus = 'revision';
        message = attempt === 1
          ? 'Critic rejected junior attempt; senior retry scheduled within this bounded run.'
          : 'Critic rejected senior attempt; final senior retry scheduled within this bounded run.';
        continue;
      }
      itemStatus = 'blocked';
      message = 'All coder attempts failed critic review; moving on with no patch.';
      break;
    }
    await syncFoundryReviewImplementationStatus({
      artifactRoot: options.artifactRoot,
      protocolId: selectedItem.protocolId,
      variant: selectedItem.variant,
      workspaceRoot: options.repoRoot,
    });
    ledger = await scanFoundryLedger(options.artifactRoot);
    const review = asRecord(await readYamlFile(reviewPath(options.artifactRoot, selectedItem.protocolId, selectedItem.variant)));
    items.push({
      protocolId: selectedItem.protocolId,
      variant: selectedItem.variant,
      status: itemStatus,
      attempts,
      ...(typeof review['status'] === 'string' ? { reviewStatus: review['status'] } : {}),
      message,
    });
  }

  ledger = await scanFoundryLedger(options.artifactRoot);
  await writeFoundryManifests(ledger);
  await writeFoundryOperationalStatus(ledger, readyTasks(ledger));
  const reportPath = join(options.artifactRoot, 'queues', 'reviewed-spec-run-latest.yaml');
  const report: FoundryReviewedSpecRunReport = {
    kind: 'protocol-foundry-reviewed-spec-run-report',
    generated_at: nowIso(),
    artifactRoot: options.artifactRoot,
    repoRoot: options.repoRoot,
    dryRun: options.dryRun ?? false,
    selectedCount: selected.length,
    items,
    nextTasks: readyTasks(ledger),
    reportPath,
  };
  await writeYamlFile(reportPath, report);
  return report;
}
