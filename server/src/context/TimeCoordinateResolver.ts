/**
 * TimeCoordinateResolver
 *
 * Resolves context time queries with precedence:
 * iso_datetime > event_sequence_index > named_phase > duration_offset
 *
 * Pure function - no IO, no Date.now(), no side effects.
 */

export interface TimeCoordinateQuery {
  iso_datetime?: string;              // e.g. "2026-04-17T13:00:00Z"
  event_sequence_index?: number;      // 0-based index into graph.events
  named_phase?: string;               // phase name defined on an event
  duration_offset?: { from: string; iso_duration: string }; // e.g. {from: "run_start", iso_duration: "PT24H"}
}

export interface EventGraphSlice {
  events: ReadonlyArray<{
    event_index: number;
    event_id: string;
    iso_datetime?: string;
    phase?: string;
  }>;
  run_start_iso?: string;
}

export interface ResolvedTimeCoordinate {
  ok: true;
  event_index: number;
  iso_datetime: string | undefined;
  phase: string | undefined;
  source: 'iso_datetime' | 'event_sequence_index' | 'named_phase' | 'duration_offset';
}

export interface ResolveError {
  ok: false;
  reason: string;
}

/**
 * Parse an ISO 8601 duration string.
 * Supports: PT<N>H, PT<N>M, P<N>D, and combinations like PT24H, PT30M, P1D, PT1H30M
 * Returns milliseconds or null if invalid.
 */
function parseIsoDuration(duration: string): number | null {
  // ISO 8601 duration regex: P[nD][T[nH][nM][nS]]
  const regex = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
  const match = duration.match(regex);

  if (!match) {
    return null;
  }

  const days = match[1] ? parseInt(match[1], 10) : 0;
  const hours = match[2] ? parseInt(match[2], 10) : 0;
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  const seconds = match[4] ? parseInt(match[4], 10) : 0;

  // Must have at least one component
  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
    // Check if the format was actually valid (e.g., "P" alone is invalid)
    if (duration === 'P' || duration === 'PT') {
      return null;
    }
  }

  const totalMs =
    days * 24 * 60 * 60 * 1000 +
    hours * 60 * 60 * 1000 +
    minutes * 60 * 1000 +
    seconds * 1000;

  return totalMs;
}

/**
 * Parse an ISO 8601 datetime string to a Date object.
 * Returns null if invalid.
 */
function parseIsoDateTime(iso: string): Date | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/**
 * Find the event with the closest iso_datetime <= targetIso.
 * Returns the event or null if none found.
 */
function findEventAtOrBefore(
  graph: EventGraphSlice,
  targetIso: string
): { event_index: number; iso_datetime: string | undefined; phase: string | undefined } | null {
  const targetDate = parseIsoDateTime(targetIso);
  if (!targetDate) {
    return null;
  }

  let bestEvent: { event_index: number; iso_datetime: string | undefined; phase: string | undefined } | null = null;
  let bestDate: Date | null = null;

  for (const event of graph.events) {
    if (!event.iso_datetime) {
      continue;
    }
    const eventDate = parseIsoDateTime(event.iso_datetime);
    if (!eventDate) {
      continue;
    }

    if (eventDate <= targetDate) {
      if (bestDate === null || eventDate > bestDate) {
        bestEvent = {
          event_index: event.event_index,
          iso_datetime: event.iso_datetime,
          phase: event.phase,
        };
        bestDate = eventDate;
      }
    }
  }

  return bestEvent;
}

/**
 * Find the first event with the given phase name.
 */
function findEventByPhase(
  graph: EventGraphSlice,
  phaseName: string
): { event_index: number; iso_datetime: string | undefined; phase: string | undefined } | null {
  for (const event of graph.events) {
    if (event.phase === phaseName) {
      return {
        event_index: event.event_index,
        iso_datetime: event.iso_datetime,
        phase: event.phase,
      };
    }
  }
  return null;
}

/**
 * Resolve a time coordinate query against an event graph.
 */
export function resolveTimeCoordinate(
  query: TimeCoordinateQuery,
  graph: EventGraphSlice
): ResolvedTimeCoordinate | ResolveError {
  // Check for empty query
  if (
    query.iso_datetime === undefined &&
    query.event_sequence_index === undefined &&
    query.named_phase === undefined &&
    query.duration_offset === undefined
  ) {
    return { ok: false, reason: 'empty query' };
  }

  // Rank 1: iso_datetime
  if (query.iso_datetime !== undefined) {
    const result = findEventAtOrBefore(graph, query.iso_datetime);
    if (!result) {
      return { ok: false, reason: `no event at or before ${query.iso_datetime}` };
    }
    return {
      ok: true,
      event_index: result.event_index,
      iso_datetime: result.iso_datetime,
      phase: result.phase,
      source: 'iso_datetime',
    };
  }

  // Rank 2: event_sequence_index
  if (query.event_sequence_index !== undefined) {
    const idx = query.event_sequence_index;
    if (idx < 0 || idx >= graph.events.length) {
      return { ok: false, reason: `event_sequence_index ${idx} out of range [0, ${graph.events.length})` };
    }
    const event = graph.events[idx]!;
    return {
      ok: true,
      event_index: event.event_index,
      iso_datetime: event.iso_datetime,
      phase: event.phase,
      source: 'event_sequence_index',
    };
  }

  // Rank 3: named_phase
  if (query.named_phase !== undefined) {
    const result = findEventByPhase(graph, query.named_phase);
    if (!result) {
      return { ok: false, reason: `no event with phase '${query.named_phase}'` };
    }
    return {
      ok: true,
      event_index: result.event_index,
      iso_datetime: result.iso_datetime,
      phase: result.phase,
      source: 'named_phase',
    };
  }

  // Rank 4: duration_offset
  if (query.duration_offset !== undefined) {
    const { from, iso_duration } = query.duration_offset;

    // Parse the duration
    const durationMs = parseIsoDuration(iso_duration);
    if (durationMs === null) {
      return { ok: false, reason: 'invalid duration' };
    }

    // Determine anchor ISO
    let anchorIso: string | null = null;

    if (from === 'run_start') {
      anchorIso = graph.run_start_iso ?? null;
    } else {
      // from is a phase name - find the event with that phase
      const anchorEvent = findEventByPhase(graph, from);
      if (anchorEvent && anchorEvent.iso_datetime) {
        anchorIso = anchorEvent.iso_datetime;
      }
    }

    if (!anchorIso) {
      return { ok: false, reason: `no anchor for duration_offset from '${from}'` };
    }

    // Compute target ISO
    const anchorDate = parseIsoDateTime(anchorIso);
    if (!anchorDate) {
      return { ok: false, reason: `invalid anchor ISO datetime '${anchorIso}'` };
    }

    const targetDate = new Date(anchorDate.getTime() + durationMs);
    const targetIso = targetDate.toISOString();

    // Resolve via the same rule as iso_datetime (closest event <= target)
    const result = findEventAtOrBefore(graph, targetIso);
    if (!result) {
      return { ok: false, reason: `no event at or before computed target ${targetIso}` };
    }

    return {
      ok: true,
      event_index: result.event_index,
      iso_datetime: result.iso_datetime,
      phase: result.phase,
      source: 'duration_offset',
    };
  }

  // Should not reach here due to empty query check, but handle gracefully
  return { ok: false, reason: 'unhandled query type' };
}
