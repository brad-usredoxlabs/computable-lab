/**
 * Tests for PanelConstraintChecks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getValidationChecks,
} from '../ValidationCheck.js';
import type { ValidationContext } from '../ValidationCheck.js';
import type { TerminalArtifacts } from '../../pipeline/CompileContracts.js';
import type { LabStateSnapshot } from '../../state/LabState.js';
import { getAssaySpecRegistry } from '../../../registry/AssaySpecRegistry.js';

// Side-effect import registers checks on module load
import './PanelConstraintChecks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  events: TerminalArtifacts['events'] = [],
  resolvedRefs?: TerminalArtifacts['resolvedRefs'],
): ValidationContext {
  return {
    artifacts: {
      events,
      directives: [],
      gaps: [],
      resolvedRefs,
    },
    priorLabState: {
      deck: [],
      mountedPipettes: [],
      labware: {},
      reservoirs: {},
      mintCounter: 0,
      turnIndex: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// assay-edge-exclusion
// ---------------------------------------------------------------------------

describe('assay-edge-exclusion', () => {
  function findCheck(): ReturnType<typeof getValidationChecks>[number] | undefined {
    return getValidationChecks().find((c) => c.id === 'assay-edge-exclusion');
  }

  it('registers the check', () => {
    expect(findCheck()).toBeDefined();
  });

  it('returns empty findings when no assay refs are resolved', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: { well: 'A1' },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns empty findings when resolved assay has no edgeExclusion', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: { well: 'A1' },
        },
      ],
      [{ kind: 'assay', label: 'test', resolvedId: '16S-qPCR-panel' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns error when events target edge wells on a FIRE assay', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: { well: 'A1' },
        },
        {
          eventId: 'evt-2',
          event_type: 'add_material',
          details: { well: 'H12' },
        },
        {
          eventId: 'evt-3',
          event_type: 'add_material',
          details: { well: 'B2' },
        },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.category).toBe('panel-constraint');
    expect(findings[0]!.message).toContain('2 events target edge wells');
    expect(findings[0]!.suggestion).toContain('Move events to the interior');
    expect(findings[0]!.affectedIds).toEqual(['evt-1', 'evt-2']);
  });

  it('returns empty findings when all events are in interior wells', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: { well: 'B2' },
        },
        {
          eventId: 'evt-2',
          event_type: 'add_material',
          details: { well: 'G11' },
        },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('detects edge wells on all four edges', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        { eventId: 'e1', event_type: 'add_material', details: { well: 'A1' } },
        { eventId: 'e2', event_type: 'add_material', details: { well: 'A12' } },
        { eventId: 'e3', event_type: 'add_material', details: { well: 'H1' } },
        { eventId: 'e4', event_type: 'add_material', details: { well: 'H12' } },
        { eventId: 'e5', event_type: 'add_material', details: { well: 'B1' } },
        { eventId: 'e6', event_type: 'add_material', details: { well: 'G12' } },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.affectedIds).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('triggers edge exclusion for MOCK-edge-only assay (stubbed registry)', () => {
    const check = findCheck()!;
    // Stub the registry to return a custom assay spec with edgeExclusion
    const registry = getAssaySpecRegistry();
    const originalGet = registry.get.bind(registry);
    registry.get = (id: string) => {
      if (id === 'MOCK-edge-only') {
        return {
          id: 'MOCK-edge-only',
          name: 'Mock edge-only assay',
          description: 'Test assay',
          panelConstraints: { edgeExclusion: true },
        } as any;
      }
      return originalGet(id);
    };

    try {
      const ctx = makeContext(
        [
          { eventId: 'e1', event_type: 'add_material', details: { well: 'A1' } },
          { eventId: 'e2', event_type: 'add_material', details: { well: 'B2' } },
        ],
        [{ kind: 'assay', label: 'mock', resolvedId: 'MOCK-edge-only' }],
      );
      const findings = check.run(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.message).toContain('1 events target edge wells');
      expect(findings[0]!.affectedIds).toEqual(['e1']);
    } finally {
      registry.get = originalGet;
    }
  });

  it('produces no findings when assay spec is missing from registry', () => {
    const check = findCheck()!;
    const registry = getAssaySpecRegistry();
    const originalGet = registry.get.bind(registry);
    registry.get = () => undefined;

    try {
      const ctx = makeContext(
        [
          { eventId: 'e1', event_type: 'add_material', details: { well: 'A1' } },
        ],
        [{ kind: 'assay', label: 'ghost', resolvedId: 'nonexistent-assay' }],
      );
      const findings = check.run(ctx);
      expect(findings).toHaveLength(0);
    } finally {
      registry.get = originalGet;
    }
  });
});

// ---------------------------------------------------------------------------
// assay-cell-region
// ---------------------------------------------------------------------------

describe('assay-cell-region', () => {
  function findCheck(): ReturnType<typeof getValidationChecks>[number] | undefined {
    return getValidationChecks().find((c) => c.id === 'assay-cell-region');
  }

  it('registers the check', () => {
    expect(findCheck()).toBeDefined();
  });

  it('returns empty findings when no assay refs are resolved', () => {
    const check = findCheck()!;
    const ctx = makeContext([
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: { well: 'A1' },
      },
    ]);
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns empty findings when resolved assay has no cellRegion', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: { well: 'A1' },
        },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-other-assay' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('returns warning when events are outside the cellRegion', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: { well: 'A1' },
        },
        {
          eventId: 'evt-2',
          event_type: 'add_material',
          details: { well: 'B2' },
        },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.category).toBe('panel-constraint');
    expect(findings[0]!.message).toContain('1 events are outside');
    expect(findings[0]!.affectedIds).toEqual(['evt-1']);
  });

  it('returns empty findings when all events are inside the cellRegion', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: { well: 'B2' },
        },
        {
          eventId: 'evt-2',
          event_type: 'add_material',
          details: { well: 'G11' },
        },
        {
          eventId: 'evt-3',
          event_type: 'add_material',
          details: { well: 'D6' },
        },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it('flags events on edge rows A and H', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        { eventId: 'e1', event_type: 'add_material', details: { well: 'A5' } },
        { eventId: 'e2', event_type: 'add_material', details: { well: 'H5' } },
        { eventId: 'e3', event_type: 'add_material', details: { well: 'C6' } },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.affectedIds).toEqual(['e1', 'e2']);
  });

  it('flags events in columns 1 and 12', () => {
    const check = findCheck()!;
    const ctx = makeContext(
      [
        { eventId: 'e1', event_type: 'add_material', details: { well: 'B1' } },
        { eventId: 'e2', event_type: 'add_material', details: { well: 'G12' } },
        { eventId: 'e3', event_type: 'add_material', details: { well: 'D6' } },
      ],
      [{ kind: 'assay', label: 'FIRE', resolvedId: 'FIRE-cellular-redox' }],
    );
    const findings = check.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.affectedIds).toEqual(['e1', 'e2']);
  });
});
