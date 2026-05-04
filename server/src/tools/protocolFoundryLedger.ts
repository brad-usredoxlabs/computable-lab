#!/usr/bin/env node
import {
  loadOrCreateFoundryLedger,
  markFoundryTask,
  readyTasks,
  saveFoundryLedger,
  scanFoundryLedger,
} from '../foundry/FoundryLedger.js';
import type { FoundryWorkStage, FoundryWorkStatus } from '../foundry/FoundryArtifacts.js';
import type { FoundryVariant } from '../foundry/ProtocolFoundryCompileRunner.js';

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function usage(): string {
  return [
    'Usage: npm --prefix server run foundry:ledger -- <scan|summary|next|mark> --artifact-root <dir>',
    '',
    'Commands:',
    '  scan                         Scan durable artifacts and update queues/stage-ledger.yaml.',
    '  summary                      Print protocol/variant status counts.',
    '  next                         Print currently runnable tasks.',
    '  mark --protocol-id <id> --variant <variant> --stage <stage> --status <status>',
  ].join('\n');
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const command = args[0];
  const artifactRoot = readArg('--artifact-root', args);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return 0;
  }
  if (!command || !artifactRoot) {
    console.log(usage());
    return 2;
  }

  if (command === 'scan') {
    const ledger = await scanFoundryLedger(artifactRoot);
    console.log(JSON.stringify({ ledger: `${artifactRoot}/queues/stage-ledger.yaml`, protocols: ledger.protocols.length }, null, 2));
    return 0;
  }

  if (command === 'next') {
    const ledger = await scanFoundryLedger(artifactRoot);
    console.log(JSON.stringify(readyTasks(ledger), null, 2));
    return 0;
  }

  if (command === 'summary') {
    const ledger = await scanFoundryLedger(artifactRoot);
    const counts: Record<string, number> = {};
    for (const protocol of Object.values(ledger.protocol_status)) {
      for (const variant of Object.values(protocol.variants)) {
        counts[variant.status] = (counts[variant.status] ?? 0) + 1;
      }
    }
    console.log(JSON.stringify({ protocolCount: ledger.protocols.length, variantStatusCounts: counts }, null, 2));
    return 0;
  }

  if (command === 'mark') {
    const protocolId = readArg('--protocol-id', args);
    const variant = readArg('--variant', args);
    const stage = readArg('--stage', args);
    const status = readArg('--status', args);
    if (!protocolId || !variant || !stage || !status) {
      console.error(usage());
      return 2;
    }
    const ledger = await loadOrCreateFoundryLedger(artifactRoot);
    const message = readArg('--message', args);
    markFoundryTask(ledger, {
      protocolId,
      variant: variant as FoundryVariant,
      stage: stage as FoundryWorkStage,
      status: status as FoundryWorkStatus,
      ...(message ? { message } : {}),
    });
    await saveFoundryLedger(ledger);
    console.log(JSON.stringify({ marked: { protocolId, variant, stage, status } }, null, 2));
    return 0;
  }

  console.error(usage());
  return 2;
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
