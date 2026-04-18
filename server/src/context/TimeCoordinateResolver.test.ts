import { describe, it, expect } from 'vitest';
import { resolveTimeCoordinate, TimeCoordinateQuery, EventGraphSlice } from './TimeCoordinateResolver';

describe('TimeCoordinateResolver', () => {
  // Test fixture: 3-event graph
  const baseGraph: EventGraphSlice = {
    run_start_iso: '2026-04-17T00:00:00Z',
    events: [
      {
        event_index: 0,
        event_id: 'evt-001',
        iso_datetime: '2026-04-17T00:00:00Z',
        phase: 'run_start',
      },
      {
        event_index: 1,
        event_id: 'evt-002',
        iso_datetime: '2026-04-17T12:00:00Z',
        phase: 'mid_point',
      },
      {
        event_index: 2,
        event_id: 'evt-003',
        iso_datetime: '2026-04-17T24:00:00Z',
        phase: 'post_seed',
      },
    ],
  };

  describe('iso_datetime precedence', () => {
    it('returns event at or before the query iso_datetime', () => {
      const query: TimeCoordinateQuery = {
        iso_datetime: '2026-04-17T13:00:00Z',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(1);
        expect(result.iso_datetime).toBe('2026-04-17T12:00:00Z');
        expect(result.phase).toBe('mid_point');
        expect(result.source).toBe('iso_datetime');
      }
    });

    it('returns exact match when iso_datetime equals an event', () => {
      const query: TimeCoordinateQuery = {
        iso_datetime: '2026-04-17T12:00:00Z',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(1);
        expect(result.iso_datetime).toBe('2026-04-17T12:00:00Z');
        expect(result.source).toBe('iso_datetime');
      }
    });

    it('returns error when no event at or before iso_datetime', () => {
      const query: TimeCoordinateQuery = {
        iso_datetime: '2026-04-16T00:00:00Z',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('no event at or before');
      }
    });
  });

  describe('event_sequence_index precedence', () => {
    it('returns event at the given index', () => {
      const query: TimeCoordinateQuery = {
        event_sequence_index: 2,
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(2);
        expect(result.iso_datetime).toBe('2026-04-17T24:00:00Z');
        expect(result.phase).toBe('post_seed');
        expect(result.source).toBe('event_sequence_index');
      }
    });

    it('returns first event when index is 0', () => {
      const query: TimeCoordinateQuery = {
        event_sequence_index: 0,
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(0);
        expect(result.source).toBe('event_sequence_index');
      }
    });

    it('returns error when index is out of range (too high)', () => {
      const query: TimeCoordinateQuery = {
        event_sequence_index: 99,
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('out of range');
      }
    });

    it('returns error when index is negative', () => {
      const query: TimeCoordinateQuery = {
        event_sequence_index: -1,
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('out of range');
      }
    });
  });

  describe('named_phase precedence', () => {
    it('returns first event with matching phase', () => {
      const query: TimeCoordinateQuery = {
        named_phase: 'post_seed',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(2);
        expect(result.phase).toBe('post_seed');
        expect(result.source).toBe('named_phase');
      }
    });

    it('returns error when no event has the named phase', () => {
      const query: TimeCoordinateQuery = {
        named_phase: 'nonexistent_phase',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("no event with phase");
        expect(result.reason).toContain('nonexistent_phase');
      }
    });
  });

  describe('duration_offset precedence', () => {
    it('resolves from run_start with PT24H', () => {
      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'run_start',
          iso_duration: 'PT24H',
        },
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(2);
        expect(result.iso_datetime).toBe('2026-04-17T24:00:00Z');
        expect(result.source).toBe('duration_offset');
      }
    });

    it('resolves from run_start with PT12H', () => {
      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'run_start',
          iso_duration: 'PT12H',
        },
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(1);
        expect(result.iso_datetime).toBe('2026-04-17T12:00:00Z');
        expect(result.source).toBe('duration_offset');
      }
    });

    it('resolves from a named phase', () => {
      // Create graph with a phase we can anchor from
      const graph: EventGraphSlice = {
        run_start_iso: '2026-04-17T00:00:00Z',
        events: [
          {
            event_index: 0,
            event_id: 'evt-001',
            iso_datetime: '2026-04-17T00:00:00Z',
            phase: 'start',
          },
          {
            event_index: 1,
            event_id: 'evt-002',
            iso_datetime: '2026-04-17T06:00:00Z',
            phase: 'mid',
          },
          {
            event_index: 2,
            event_id: 'evt-003',
            iso_datetime: '2026-04-17T12:00:00Z',
            phase: 'end',
          },
        ],
      };

      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'mid',
          iso_duration: 'PT6H',
        },
      };
      const result = resolveTimeCoordinate(query, graph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(2);
        expect(result.source).toBe('duration_offset');
      }
    });

    it('returns error for invalid duration format', () => {
      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'run_start',
          iso_duration: 'INVALID',
        },
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid duration');
      }
    });

    it('returns error when anchor phase not found', () => {
      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'nonexistent_phase',
          iso_duration: 'PT1H',
        },
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("no anchor for duration_offset");
      }
    });

    it('supports P1D duration format', () => {
      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'run_start',
          iso_duration: 'P1D',
        },
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event_index).toBe(2);
        expect(result.source).toBe('duration_offset');
      }
    });
  });

  describe('precedence ordering', () => {
    it('iso_datetime takes precedence over named_phase', () => {
      const query: TimeCoordinateQuery = {
        iso_datetime: '2026-04-17T13:00:00Z',
        named_phase: 'post_seed',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe('iso_datetime');
        expect(result.event_index).toBe(1); // mid_point event, not post_seed
      }
    });

    it('event_sequence_index takes precedence over named_phase', () => {
      const query: TimeCoordinateQuery = {
        event_sequence_index: 0,
        named_phase: 'post_seed',
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe('event_sequence_index');
        expect(result.event_index).toBe(0);
      }
    });

    it('named_phase takes precedence over duration_offset', () => {
      const query: TimeCoordinateQuery = {
        named_phase: 'mid_point',
        duration_offset: {
          from: 'run_start',
          iso_duration: 'PT24H',
        },
      };
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe('named_phase');
        expect(result.event_index).toBe(1);
      }
    });
  });

  describe('empty query', () => {
    it('returns error when query has no fields', () => {
      const query: TimeCoordinateQuery = {};
      const result = resolveTimeCoordinate(query, baseGraph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('empty query');
      }
    });
  });

  describe('edge cases', () => {
    it('handles graph with no run_start_iso for duration_offset', () => {
      const graph: EventGraphSlice = {
        run_start_iso: undefined,
        events: [
          {
            event_index: 0,
            event_id: 'evt-001',
            iso_datetime: '2026-04-17T00:00:00Z',
            phase: 'start',
          },
        ],
      };

      const query: TimeCoordinateQuery = {
        duration_offset: {
          from: 'run_start',
          iso_duration: 'PT1H',
        },
      };
      const result = resolveTimeCoordinate(query, graph);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("no anchor for duration_offset");
      }
    });

    it('handles events without iso_datetime', () => {
      const graph: EventGraphSlice = {
        run_start_iso: '2026-04-17T00:00:00Z',
        events: [
          {
            event_index: 0,
            event_id: 'evt-001',
            iso_datetime: undefined,
            phase: 'start',
          },
          {
            event_index: 1,
            event_id: 'evt-002',
            iso_datetime: '2026-04-17T12:00:00Z',
            phase: 'mid',
          },
        ],
      };

      const query: TimeCoordinateQuery = {
        iso_datetime: '2026-04-17T10:00:00Z',
      };
      const result = resolveTimeCoordinate(query, graph);

      // Should skip event 0 (no iso_datetime) and return event 1 if it's <= target
      // Actually event 1 is at 12:00 which is > 10:00, so no event at or before
      expect(result.ok).toBe(false);
    });
  });
});
