#!/usr/bin/env node
import { resolve } from 'node:path';
import { runFoundryLoop } from '../foundry/FoundrySupervisor.js';

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function hasFlag(name: string, args: string[]): boolean {
  return args.includes(name);
}

function usage(): string {
  return [
    'Usage: npm --prefix server run foundry:loop -- --artifact-root <dir> --repo-root <computable-foundry> [options]',
    '',
    'Options:',
    '  --workbench-root <dir>       agent-workbench root for browser review script.',
    '  --worker-base-url <url>      OpenAI-compatible worker/coder endpoint.',
    '  --worker-model <model>       Worker/coder model.',
    '  --architect-base-url <url>   OpenAI-compatible architect endpoint.',
    '  --architect-model <model>    Architect model.',
    '  --api-base <url>             computable-lab API base for browser review.',
    '  --app-base <url>             computable-lab app base for browser review.',
    '  --max-concurrency <n>        Default 4.',
    '  --max-cycles <n>             Default 1 unless --watch.',
    '  --watch                      Keep polling for new ready work.',
    '  --poll-ms <n>                Poll interval for --watch. Default 30000.',
    '  --skip-browser               Mark browser review skipped instead of launching Playwright.',
  '  --improvement-mode           Run patch adoption and affected-protocol rerun stages.',
  '  --apply-patches              Let the coder endpoint apply guarded source patches from architect specs.',
  '  --auto-commit-patches        Commit verified coder patches.',
  '  --auto-push-patches          Push verified coder-patch commits after committing.',
  '  --no-pdf-intake              Do not convert new artifacts/pdfs/*.pdf files into segment inputs.',
  '  --pdf-intake-batch-size <n>  Number of new PDFs to ingest per watch cycle. Default 4.',
  '  --no-review-index            Do not generate artifacts/review-index/index.html.',
    '  --dry-run                    Use null LLM/dry browser behavior where supported.',
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
  const workbenchRoot = readArg('--workbench-root', args);
  const workerBaseUrl = readArg('--worker-base-url', args) ?? process.env['PI_WORKER_BASE_URL'] ?? process.env['OPENAI_BASE_URL'];
  const workerModel = readArg('--worker-model', args) ?? process.env['PI_WORKER_MODEL'] ?? process.env['OPENAI_MODEL'];
  const architectBaseUrl = readArg('--architect-base-url', args) ?? process.env['PI_ARCHITECT_BASE_URL'];
  const architectModel = readArg('--architect-model', args) ?? process.env['PI_ARCHITECT_MODEL'];
  const apiBase = readArg('--api-base', args);
  const appBase = readArg('--app-base', args);
  const maxCycles = readArg('--max-cycles', args);
  const pollMs = readArg('--poll-ms', args);
  const pdfIntakeBatchSize = readArg('--pdf-intake-batch-size', args);

  const summary = await runFoundryLoop({
    artifactRoot,
    repoRoot,
    ...(workbenchRoot ? { workbenchRoot } : {}),
    ...(workerBaseUrl ? { workerBaseUrl } : {}),
    ...(workerModel ? { workerModel } : {}),
    ...(architectBaseUrl ? { architectBaseUrl } : {}),
    ...(architectModel ? { architectModel } : {}),
    ...(apiBase ? { apiBase } : {}),
    ...(appBase ? { appBase } : {}),
    maxConcurrency: Number(readArg('--max-concurrency', args) ?? 4),
    ...(maxCycles ? { maxCycles: Number(maxCycles) } : {}),
    watch: hasFlag('--watch', args),
    ...(pollMs ? { pollMs: Number(pollMs) } : {}),
    dryRun: hasFlag('--dry-run', args),
    skipBrowser: hasFlag('--skip-browser', args),
    improvementMode: hasFlag('--improvement-mode', args),
    applyPatches: hasFlag('--apply-patches', args),
    autoCommitPatches: hasFlag('--auto-commit-patches', args) || hasFlag('--auto-push-patches', args),
    autoPushPatches: hasFlag('--auto-push-patches', args),
    writeReviewIndex: !hasFlag('--no-review-index', args),
    intakePdfs: !hasFlag('--no-pdf-intake', args),
    ...(pdfIntakeBatchSize ? { pdfIntakeBatchSize: Number(pdfIntakeBatchSize) } : {}),
  });
  console.log(JSON.stringify(summary, null, 2));
  return 0;
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
