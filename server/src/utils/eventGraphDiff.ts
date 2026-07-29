/**
 * Event Graph Diff Engine
 *
 * Compare planned vs executed event graphs to detect deviations:
 * - Modified events (fields changed between planned and executed)
 * - Added events (present in executed but not in planned)
 * - Removed events (present in planned but not in executed)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single event node from an event graph.
 * Minimal shape matching the PlateEvent $def in event-graph.schema.yaml.
 */
export interface GraphEvent {
  /** Unique event identifier. */
  id: string;
  /** Event type (e.g., incubate, transfer, add-material). */
  type?: string;
  /** Human-readable label. */
  label?: string;
  /** Labware this event operates on. */
  labwareId?: string;
  /** Well range for plate events. */
  wellRange?: string;
  /** Timestamps. */
  startedAt?: string;
  completedAt?: string;
  /** Arbitrary properties for deep comparison. */
  [key: string]: unknown;
}

/**
 * Field-level change between planned and executed versions of an event.
 */
export interface FieldChange {
  /** Field path that changed (e.g., "wellRange", "duration"). */
  field: string;
  /** Value in the planned graph. */
  planned: unknown;
  /** Value in the executed graph. */
  executed: unknown;
}

/**
 * Diff result for a single event.
 */
export interface EventDiff {
  /** The event identifier. */
  eventId: string;
  /** Status of this event in the diff. */
  status: 'modified' | 'added' | 'removed';
  /** List of field-level changes (only for modified events). */
  changes: FieldChange[];
  /** Full planned event snapshot (only for removed/modified). */
  planned?: GraphEvent;
  /** Full executed event snapshot (only for added/modified). */
  executed?: GraphEvent;
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

/**
 * Compute field-level differences between two objects.
 * Compares only keys present in either object; ignores keys where values are equal.
 */
function objectDiff(a: Record<string, unknown>, b: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([
    ...Object.keys(a),
    ...Object.keys(b),
  ]);

  // Skip structural/identity keys that shouldn't trigger diffs
  const skipKeys = new Set(['recordId', 'createdAt', 'updatedAt']);

  for (const key of allKeys) {
    if (skipKeys.has(key)) continue;

    const valA = a[key];
    const valB = b[key];

    // Both undefined — no change
    if (valA === undefined && valB === undefined) continue;

    // One side missing
    if (valA === undefined) {
      changes.push({ field: key, planned: null, executed: valB });
      continue;
    }
    if (valB === undefined) {
      changes.push({ field: key, planned: valA, executed: null });
      continue;
    }

    // Deep equality check
    if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      changes.push({ field: key, planned: valA, executed: valB });
    }
  }

  return changes;
}

/**
 * Build a map from event id to event for fast lookup.
 */
function buildEventMap(events: GraphEvent[]): Map<string, GraphEvent> {
  const map = new Map<string, GraphEvent>();
  for (const ev of events) {
    map.set(ev.id, ev);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare two event graphs and return an array of event-level diffs.
 *
 * @param plannedEventGraph - The planned event graph with `events` array.
 * @param executedEventGraph - The executed event graph with `events` array.
 * @returns Array of EventDiff entries. Empty array means graphs are identical.
 */
export function computeDiff(
  plannedEventGraph: { events?: GraphEvent[] } | null,
  executedEventGraph: { events?: GraphEvent[] } | null,
): EventDiff[] {
  const plannedEvents = plannedEventGraph?.events ?? [];
  const executedEvents = executedEventGraph?.events ?? [];

  // Fast path: both empty
  if (plannedEvents.length === 0 && executedEvents.length === 0) {
    return [];
  }

  const plannedMap = buildEventMap(plannedEvents);
  const executedMap = buildEventMap(executedEvents);

  const diffs: EventDiff[] = [];

  // Find modified and removed events
  for (const [id, plannedEv] of plannedMap) {
    const executedEv = executedMap.get(id);

    if (!executedEv) {
      // Event removed
      diffs.push({
        eventId: id,
        status: 'removed',
        changes: [],
        planned: plannedEv,
      });
      continue;
    }

    // Event exists in both — compare fields
    const plannedRecord = plannedEv as Record<string, unknown>;
    const executedRecord = executedEv as Record<string, unknown>;
    const changes = objectDiff(plannedRecord, executedRecord);

    if (changes.length > 0) {
      diffs.push({
        eventId: id,
        status: 'modified',
        changes,
        planned: plannedEv,
        executed: executedEv,
      });
    }
  }

  // Find added events
  for (const [id, executedEv] of executedMap) {
    if (!plannedMap.has(id)) {
      diffs.push({
        eventId: id,
        status: 'added',
        changes: [],
        executed: executedEv,
      });
    }
  }

  return diffs;
}

/**
 * Convenience wrapper: given event arrays directly (no graph wrapper).
 */
export function computeEventDiff(
  plannedEvents: GraphEvent[],
  executedEvents: GraphEvent[],
): EventDiff[] {
  return computeDiff({ events: plannedEvents }, { events: executedEvents });
}
