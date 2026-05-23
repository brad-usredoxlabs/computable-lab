/**
 * probeCompile — worktree harness for the Fix-it coder's `probe` tool. Runs
 * the deterministic compile on an arbitrary prompt and emits a structured
 * JSON dump of selected TerminalArtifacts fields, so the coder can isolate
 * variables by varying the prompt instead of reading code blindly.
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/probeCompile.ts --prompt "..." [--fields events,gaps,...]
 *
 * --fields is a comma-separated list of TerminalArtifacts top-level keys.
 * "all" returns every supported field. Omitted = DEFAULT_FIELDS (the set most
 * load-bearing for fix-it bug classes).
 */
import { runFixture } from './FixtureRunner.js';

const DEFAULT_FIELDS = [
  'events',
  'directives',
  'gaps',
  'deckLayoutPlan',
  'labStateDelta',
  'resolvedRefs',
  'resolvedLabwareRefs',
  'resourceManifest',
  'executionScalePlan',
  'deterministicProtocolPlan',
  'protocolIntent',
  'validationReport',
] as const;

const ALL_FIELDS = [
  ...DEFAULT_FIELDS,
  'protocolIntentStatePlan',
  'protocolIntentValidation',
  'protocolIntentLowering',
  'instrumentRunFiles',
  'instrumentApplianceJobs',
  'instrumentExecutionReadiness',
  'downstreamQueue',
] as const;

function argOf(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function resolveFields(raw: string | undefined): readonly string[] {
  if (!raw) return DEFAULT_FIELDS;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'all') return ALL_FIELDS;
  const allowed = new Set<string>(ALL_FIELDS);
  const requested = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const valid = requested.filter((f) => allowed.has(f));
  return valid.length > 0 ? valid : DEFAULT_FIELDS;
}

async function main(): Promise<void> {
  const prompt = argOf('--prompt') ?? '';
  if (!prompt) {
    process.stderr.write('probeCompile: --prompt is required\n');
    process.exit(2);
  }
  const fields = resolveFields(argOf('--fields'));
  const result = (await runFixture({
    name: 'probe',
    deterministicOnly: true,
    input: { prompt },
  } as never)) as unknown as {
    outcome?: string;
    terminalArtifacts?: Record<string, unknown>;
  };
  const ta = result.terminalArtifacts ?? {};
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    data[f] = (ta as Record<string, unknown>)[f];
  }
  process.stdout.write(
    JSON.stringify({
      prompt,
      outcome: result.outcome,
      fields,
      data,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`probeCompile failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
