#!/usr/bin/env node
import { resolve } from 'node:path';
import { FOUNDRY_VARIANTS, type FoundryVariant } from '../foundry/ProtocolFoundryCompileRunner.js';
import { runFoundryReviewedSpecBatch } from '../foundry/FoundryReviewedSpecRunner.js';

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function hasFlag(name: string, args: string[]): boolean {
  return args.includes(name);
}

function parseVariant(value: string | undefined): FoundryVariant | undefined {
  if (!value) return undefined;
  if ((FOUNDRY_VARIANTS as readonly string[]).includes(value)) return value as FoundryVariant;
  throw new Error(`unknown variant "${value}"; expected one of ${FOUNDRY_VARIANTS.join(', ')}`);
}

function usage(): string {
  return [
    'Usage: npm run foundry:reviewed-spec-run -w server -- --artifact-root <dir> --repo-root <computable-foundry> [options]',
    '',
    'Options:',
    '  --protocol-id <id>         Run only this queued human-reviewed protocol.',
    '  --variant <variant>        Run only this variant.',
    '  --max-specs <n>            Number of queued reviewed specs to attempt. Default 1.',
    '  --max-attempts <n>         Coder/critic attempts per spec. Default 3.',
    '  --worker-base-url <url>    Junior coder endpoint and worker endpoint used for rerun compile.',
    '  --worker-model <model>     Junior coder model and worker model used for rerun compile.',
    '  --architect-base-url <url> Architect, critic, and senior coder endpoint.',
    '  --architect-model <model>  Architect, critic, and senior coder model.',
    '  --auto-commit-patches      Commit successful coder patches.',
    '  --auto-push-patches        Push successful coder patch commits.',
    '  --dry-run                  Do not call coder endpoints; writes a blocked inspection report.',
    '',
    'Writes artifacts/queues/reviewed-spec-run-latest.yaml.',
  ].join('\n');
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (hasFlag('--help', args) || hasFlag('-h', args)) {
    console.log(usage());
    return 0;
  }
  const artifactRoot = readArg('--artifact-root', args);
  const repoRoot = readArg('--repo-root', args) ?? resolve(process.cwd(), '..');
  if (!artifactRoot) {
    console.error(usage());
    return 2;
  }
  const variant = parseVariant(readArg('--variant', args));
  const protocolId = readArg('--protocol-id', args);
  const workerBaseUrl = readArg('--worker-base-url', args);
  const workerModel = readArg('--worker-model', args);
  const architectBaseUrl = readArg('--architect-base-url', args);
  const architectModel = readArg('--architect-model', args);
  const report = await runFoundryReviewedSpecBatch({
    artifactRoot: resolve(artifactRoot),
    repoRoot: resolve(repoRoot),
    ...(protocolId ? { protocolId } : {}),
    ...(variant ? { variant } : {}),
    maxSpecs: Number(readArg('--max-specs', args) ?? 1),
    maxAttempts: Number(readArg('--max-attempts', args) ?? 3),
    dryRun: hasFlag('--dry-run', args),
    autoCommit: hasFlag('--auto-commit-patches', args) || hasFlag('--auto-push-patches', args),
    autoPush: hasFlag('--auto-push-patches', args),
    ...(workerBaseUrl ? { workerBaseUrl } : {}),
    ...(workerModel ? { workerModel } : {}),
    ...(architectBaseUrl ? { architectBaseUrl } : {}),
    ...(architectModel ? { architectModel } : {}),
  });
  console.log(JSON.stringify({
    kind: report.kind,
    reportPath: report.reportPath,
    dryRun: report.dryRun,
    selectedCount: report.selectedCount,
    items: report.items.map((item) => ({
      protocolId: item.protocolId,
      variant: item.variant,
      status: item.status,
      reviewStatus: item.reviewStatus,
      attempts: item.attempts.length,
      message: item.message,
    })),
    nextTasks: report.nextTasks,
  }, null, 2));
  return report.items.some((item) => item.status === 'implemented') ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  },
);
