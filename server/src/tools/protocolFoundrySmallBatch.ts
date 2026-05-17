#!/usr/bin/env node
import { resolve } from 'node:path';
import {
  readFoundryPdfCollectionCandidates,
} from '../foundry/FoundryPdfCollector.js';
import { runFoundrySmallBatchAcceptance } from '../foundry/FoundrySmallBatchAcceptance.js';

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
    'Usage: npm run foundry:small-batch -w server -- --artifact-root <dir> --repo-root <computable-foundry> --candidates <yaml> [options]',
    '',
    'Options:',
    '  --target-count <n>    Number of PDFs to run. Default 3; maximum 3.',
    '  --max-cycles <n>      Foundry loop cycles. Default 8.',
    '  --max-concurrency <n> Foundry loop concurrency. Default 4.',
    '  --live                Use configured live model/browser behavior instead of dry-run + skip-browser.',
    '',
    'Writes artifacts/queues/small-batch-acceptance-latest.yaml.',
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
  const candidatesPath = readArg('--candidates', args);
  if (!artifactRoot || !candidatesPath) {
    console.error(usage());
    return 2;
  }
  const candidates = await readFoundryPdfCollectionCandidates(resolve(candidatesPath));
  const targetCount = Number(readArg('--target-count', args) ?? 3);
  const maxCycles = Number(readArg('--max-cycles', args) ?? 8);
  const maxConcurrency = Number(readArg('--max-concurrency', args) ?? 4);
  const live = hasFlag('--live', args);
  const report = await runFoundrySmallBatchAcceptance({
    artifactRoot: resolve(artifactRoot),
    repoRoot: resolve(repoRoot),
    candidates,
    targetCount,
    maxCycles,
    maxConcurrency,
    dryRun: !live,
    skipBrowser: !live,
  });
  console.log(JSON.stringify({
    kind: report.kind,
    reportPath: report.reportPath,
    acceptance: report.acceptance,
    loop: report.loop,
  }, null, 2));
  return report.acceptance.passed ? 0 : 1;
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
