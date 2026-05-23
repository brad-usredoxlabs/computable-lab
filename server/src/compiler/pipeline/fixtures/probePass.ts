/**
 * probePass — worktree harness for the Fix-it coder's `probe_pass` tool.
 * Runs the deterministic compile on a prompt and emits per-pass intermediate
 * output, so the coder can locate WHICH pipeline stage owns a diverging
 * value (not just see the final terminal state via `probe`).
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/probePass.ts --prompt "..."
 *     → list mode: prints { passNames: [...] }
 *
 *   npx tsx ... --prompt "..." --pass <name>
 *     → detail mode: prints { passName, output, exists }
 */
import { runFixture } from './FixtureRunner.js';

function argOf(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const prompt = argOf('--prompt') ?? '';
  if (!prompt) {
    process.stderr.write('probePass: --prompt is required\n');
    process.exit(2);
  }
  const passName = (argOf('--pass') ?? '').trim();
  const result = (await runFixture({
    name: 'probe-pass',
    deterministicOnly: true,
    input: { prompt },
  } as never)) as unknown as {
    outcome?: string;
    raw?: { passOutputs?: Record<string, unknown> };
  };
  const passOutputs = result.raw?.passOutputs ?? {};
  const passNames = Object.keys(passOutputs).sort();
  if (!passName) {
    process.stdout.write(
      JSON.stringify({ prompt, outcome: result.outcome, mode: 'list', passNames }) + '\n',
    );
    return;
  }
  const exists = Object.prototype.hasOwnProperty.call(passOutputs, passName);
  process.stdout.write(
    JSON.stringify({
      prompt,
      outcome: result.outcome,
      mode: 'detail',
      passName,
      exists,
      output: exists ? passOutputs[passName] : null,
      availablePassNames: exists ? undefined : passNames,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`probePass failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
