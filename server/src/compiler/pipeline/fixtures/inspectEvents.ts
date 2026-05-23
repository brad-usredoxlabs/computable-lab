/**
 * inspectEvents — worktree harness for the Fix-it coder's `inspect_events`
 * tool. Dumps terminalArtifacts.events for a prompt in a scannable shape.
 *
 * NOTE: events in this codebase carry NO explicit dependency edges
 * (PlateEventPrimitive = { eventId, event_type, details, labwareId?,
 * t_offset? }). Ordering is array-position; deps are implicit through
 * labStateDelta + resolvedRefs / resolvedLabwareRefs. This harness exposes
 * the sequence plus those colocated structures so the coder can cross-
 * reference manually; it does NOT pretend to emit an adjacency list.
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/inspectEvents.ts --prompt "..."
 *     → list mode: per-event summary
 *
 *   npx tsx ... --prompt "..." --position N
 *     → detail mode: full event at position N + labStateDelta + resolved refs
 *
 * Position is used as the lookup key (not eventId) because eventIds are
 * randomised per compile — a cross-call lookup by id would fail. Position is
 * stable across runs of the same prompt.
 */
import { runFixture } from './FixtureRunner.js';

function argOf(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

interface EventLike {
  eventId?: string;
  event_type?: string;
  labwareId?: string;
  t_offset?: string;
  details?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const prompt = argOf('--prompt') ?? '';
  if (!prompt) {
    process.stderr.write('inspectEvents: --prompt is required\n');
    process.exit(2);
  }
  const positionRaw = argOf('--position');
  const position = positionRaw !== undefined ? Number.parseInt(positionRaw, 10) : NaN;
  const result = (await runFixture({
    name: 'inspect-events',
    deterministicOnly: true,
    input: { prompt },
  } as never)) as unknown as {
    outcome?: string;
    terminalArtifacts?: {
      events?: EventLike[];
      labStateDelta?: unknown;
      resolvedLabwareRefs?: unknown;
      resolvedRefs?: unknown;
    };
  };
  const ta = result.terminalArtifacts ?? {};
  const events = ta.events ?? [];

  if (positionRaw !== undefined) {
    if (!Number.isInteger(position) || position < 0 || position >= events.length) {
      process.stdout.write(
        JSON.stringify({
          prompt,
          outcome: result.outcome,
          mode: 'detail',
          position,
          found: false,
          totalEvents: events.length,
          reason: `position must be an integer in [0, ${events.length})`,
        }) + '\n',
      );
      return;
    }
    process.stdout.write(
      JSON.stringify({
        prompt,
        outcome: result.outcome,
        mode: 'detail',
        position,
        found: true,
        event: events[position],
        labStateDelta: ta.labStateDelta ?? null,
        resolvedLabwareRefs: ta.resolvedLabwareRefs ?? null,
        resolvedRefs: ta.resolvedRefs ?? null,
      }) + '\n',
    );
    return;
  }

  const summary = events.map((e, i) => ({
    position: i,
    eventId: e.eventId ?? null,
    event_type: e.event_type ?? null,
    labwareId: e.labwareId ?? null,
    t_offset: e.t_offset ?? null,
    detailKeys: e.details ? Object.keys(e.details) : [],
  }));
  process.stdout.write(
    JSON.stringify({
      prompt,
      outcome: result.outcome,
      mode: 'list',
      totalEvents: events.length,
      events: summary,
      labStateDeltaPresent: ta.labStateDelta !== undefined && ta.labStateDelta !== null,
      resolvedLabwareRefsPresent: ta.resolvedLabwareRefs !== undefined && ta.resolvedLabwareRefs !== null,
      resolvedRefsPresent: ta.resolvedRefs !== undefined && ta.resolvedRefs !== null,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`inspectEvents failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
