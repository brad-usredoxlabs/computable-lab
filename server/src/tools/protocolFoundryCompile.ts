#!/usr/bin/env node
import { runProtocolFoundryCompile, FOUNDRY_VARIANTS, type FoundryVariant } from '../foundry/ProtocolFoundryCompileRunner.js';

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function hasFlag(name: string, args: string[]): boolean {
  return args.includes(name);
}

function parseVariants(value: string | undefined): FoundryVariant[] | undefined {
  if (!value) return undefined;
  const variants = value.split(',').map((item) => item.trim()).filter(Boolean);
  const allowed = new Set<string>(FOUNDRY_VARIANTS);
  for (const variant of variants) {
    if (!allowed.has(variant)) {
      throw new Error(`unknown variant "${variant}"; expected one of ${FOUNDRY_VARIANTS.join(', ')}`);
    }
  }
  return variants as FoundryVariant[];
}

function usage(): string {
  return [
    'Usage: npm --prefix server run foundry:compile -- --artifact-root <dir> --segment <segments/protocol.yaml> [options]',
    '',
    'Options:',
    '  --material-context <path>       YAML material/labware context packet.',
    '  --protocol-id <id>             Stable protocol id. Defaults to segment recordId/id/filename.',
    '  --variants <csv>               manual_tubes,bench_plate_multichannel,robot_deck by default.',
    '  --base-url <url>               OpenAI-compatible LLM base URL. Defaults to PI_WORKER_BASE_URL or OPENAI_BASE_URL.',
    '  --model <model>                Model id. Defaults to PI_WORKER_MODEL or OPENAI_MODEL.',
    '  --dry-run                      Use null LLM client; useful for adapter smoke tests.',
  ].join('\n');
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (hasFlag('--help', args) || hasFlag('-h', args)) {
    console.log(usage());
    return 0;
  }

  const artifactRoot = readArg('--artifact-root', args);
  const segmentPath = readArg('--segment', args);
  if (!artifactRoot || !segmentPath) {
    console.error(usage());
    return 2;
  }
  const baseUrl = readArg('--base-url', args);
  const model = readArg('--model', args);
  const apiKey = process.env['OPENAI_API_KEY'];
  const materialContextPath = readArg('--material-context', args);
  const protocolId = readArg('--protocol-id', args);
  const variants = parseVariants(readArg('--variants', args));

  const summary = await runProtocolFoundryCompile({
    artifactRoot,
    segmentPath,
    ...(materialContextPath ? { materialContextPath } : {}),
    ...(protocolId ? { protocolId } : {}),
    ...(variants ? { variants } : {}),
    dryRun: hasFlag('--dry-run', args),
    inference: {
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
      ...(apiKey ? { apiKey } : {}),
    },
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
