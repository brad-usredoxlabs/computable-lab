import { join } from 'node:path';
import {
  collectFoundryPdfs,
  type FoundryPdfCollectionCandidate,
  type FoundryPdfCollectionReport,
} from './FoundryPdfCollector.js';
import { readyTasks, scanFoundryLedger } from './FoundryLedger.js';
import {
  writeFoundryManifests,
  writeFoundryOperationalStatus,
  type FoundryOperationalStatus,
} from './FoundryManifest.js';
import { runFoundryLoop, type FoundryLoopSummary } from './FoundrySupervisor.js';
import { writeYamlFile } from './FoundryArtifacts.js';
import { FoundryHumanReviewService } from './FoundryHumanReview.js';
import { FOUNDRY_VARIANTS } from './ProtocolFoundryCompileRunner.js';

export interface FoundrySmallBatchAcceptanceOptions {
  artifactRoot: string;
  repoRoot: string;
  candidates: FoundryPdfCollectionCandidate[];
  targetCount?: number;
  maxCycles?: number;
  maxConcurrency?: number;
  dryRun?: boolean;
  skipBrowser?: boolean;
}

export interface FoundrySmallBatchAcceptanceReport {
  kind: 'protocol-foundry-small-batch-acceptance-report';
  generated_at: string;
  artifactRoot: string;
  repoRoot: string;
  targetCount: number;
  acceptance: {
    passed: boolean;
    collectedPdfs: number;
    protocolCount: number;
    compiledVariants: number;
    architectReviewedVariants: number;
    reviewableVariants: number;
    requiredArchitectReviews: number;
  };
  collection: FoundryPdfCollectionReport;
  loop: FoundryLoopSummary;
  operationalStatus: FoundryOperationalStatus;
  reportPath: string;
  notes: string[];
}

function countCompiledVariants(ledger: Awaited<ReturnType<typeof scanFoundryLedger>>): number {
  let count = 0;
  for (const protocol of Object.values(ledger.protocol_status)) {
    for (const variant of Object.values(protocol.variants)) {
      if (variant.artifacts.compiler && variant.artifacts.eventGraph) count += 1;
    }
  }
  return count;
}

function countArchitectReviewedVariants(ledger: Awaited<ReturnType<typeof scanFoundryLedger>>): number {
  let count = 0;
  for (const protocol of Object.values(ledger.protocol_status)) {
    for (const variant of Object.values(protocol.variants)) {
      if (variant.artifacts.architectVerdict) count += 1;
    }
  }
  return count;
}

export async function runFoundrySmallBatchAcceptance(
  options: FoundrySmallBatchAcceptanceOptions,
): Promise<FoundrySmallBatchAcceptanceReport> {
  const targetCount = Math.max(1, Math.min(options.targetCount ?? 3, 3));
  const candidates = options.candidates.slice(0, targetCount);
  const collection = await collectFoundryPdfs({
    artifactRoot: options.artifactRoot,
    candidates,
    targetCount,
  });
  const loop = await runFoundryLoop({
    artifactRoot: options.artifactRoot,
    repoRoot: options.repoRoot,
    maxCycles: options.maxCycles ?? 8,
    maxConcurrency: options.maxConcurrency ?? 4,
    dryRun: options.dryRun ?? true,
    skipBrowser: options.skipBrowser ?? true,
    improvementMode: true,
    intakePdfs: true,
    pdfIntakeBatchSize: targetCount,
    writeReviewIndex: true,
  });
  const ledger = await scanFoundryLedger(options.artifactRoot);
  await writeFoundryManifests(ledger);
  const operationalStatus = await writeFoundryOperationalStatus(ledger, readyTasks(ledger));
  const reviews = await new FoundryHumanReviewService({
    artifactRoot: options.artifactRoot,
    workspaceRoot: options.repoRoot,
  }).listReviews();
  const collectedPdfs = collection.counts.downloaded + collection.counts.skippedDuplicate;
  const compiledVariants = countCompiledVariants(ledger);
  const architectReviewedVariants = countArchitectReviewedVariants(ledger);
  const requiredArchitectReviews = ledger.protocols.length * FOUNDRY_VARIANTS.length;
  const passed = collectedPdfs >= targetCount
    && ledger.protocols.length >= targetCount
    && compiledVariants >= requiredArchitectReviews
    && architectReviewedVariants >= requiredArchitectReviews
    && reviews.reviews.length >= requiredArchitectReviews;
  const reportPath = join(options.artifactRoot, 'queues', 'small-batch-acceptance-latest.yaml');
  const report: FoundrySmallBatchAcceptanceReport = {
    kind: 'protocol-foundry-small-batch-acceptance-report',
    generated_at: new Date().toISOString(),
    artifactRoot: options.artifactRoot,
    repoRoot: options.repoRoot,
    targetCount,
    acceptance: {
      passed,
      collectedPdfs,
      protocolCount: ledger.protocols.length,
      compiledVariants,
      architectReviewedVariants,
      reviewableVariants: reviews.reviews.length,
      requiredArchitectReviews,
    },
    collection,
    loop,
    operationalStatus,
    reportPath,
    notes: [
      'Small-batch acceptance is intentionally dry-run friendly: it verifies artifact flow from PDF collection through architect-review visibility before live endpoints are used.',
      'Use this before scaling the same collector contract to 50 vendor PDFs.',
    ],
  };
  await writeYamlFile(reportPath, report);
  return report;
}
