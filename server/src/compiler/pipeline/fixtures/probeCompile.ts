/**
 * probeCompile — worktree harness for the Fix-it coder's `probe` tool. Runs
 * the deterministic compile on an arbitrary prompt and prints the relevant
 * terminalArtifacts as JSON, so the coder can isolate variables by varying
 * the prompt instead of reading code blindly.
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/probeCompile.ts --prompt "..."
 */
import { runFixture } from './FixtureRunner.js';

function promptArg(): string {
  const idx = process.argv.indexOf('--prompt');
  return idx >= 0 ? process.argv[idx + 1] ?? '' : '';
}

async function main(): Promise<void> {
  const prompt = promptArg();
  if (!prompt) {
    process.stderr.write('probeCompile: --prompt is required\n');
    process.exit(2);
  }
  const result = (await runFixture({
    name: 'probe',
    deterministicOnly: true,
    input: { prompt },
  } as never)) as {
    outcome?: string;
    terminalArtifacts?: {
      deckLayoutPlan?: { pinned?: Array<{ slot?: string; labwareHint?: string }> };
      events?: Array<{ type?: string }>;
    };
  };
  const ta = result.terminalArtifacts ?? {};
  const pinned = (ta.deckLayoutPlan?.pinned ?? []).map((p) => ({
    slot: p?.slot,
    labwareHint: p?.labwareHint,
  }));
  const events = ta.events ?? [];
  const eventTypes: Record<string, number> = {};
  for (const e of events) {
    const t = e?.type ?? '(unknown)';
    eventTypes[t] = (eventTypes[t] ?? 0) + 1;
  }
  process.stdout.write(
    JSON.stringify({
      prompt,
      outcome: result.outcome,
      pinned,
      eventCount: events.length,
      eventTypes,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`probeCompile failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
