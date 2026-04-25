/**
 * TerminalArtifactsShape.test.ts — structural coherence tests for the
 * canonical TerminalArtifacts interface declared in CompileContracts.ts.
 *
 * Verifies:
 *  (a) Every field can be populated without type errors.
 *  (b) Minimal shape (required fields only) is accepted.
 */

import { describe, it, expect } from 'vitest';
import type {
  TerminalArtifacts,
  LabStateDelta,
  DeckLayoutPlan,
  ResourceManifest,
  ValidationReport,
} from './CompileContracts.js';
import type { LabStateSnapshot } from '../state/LabState.js';

describe('TerminalArtifacts canonical shape', () => {
  it('accepts every field populated', () => {
    const emptyLabState = {} as LabStateSnapshot;

    const ta: TerminalArtifacts = {
      events: [],
      directives: [],
      gaps: [],
      labStateDelta: { events: [], snapshotAfter: emptyLabState },
      deckLayoutPlan: {
        pinned: [{ slot: 'A1', labwareHint: '96-well-plate' }],
        autoFilled: [{ slot: 'B1', labwareHint: 'reservoir', reason: 'auto-fill' }],
        conflicts: [{ slot: 'C1', candidates: ['plate-a', 'plate-b'] }],
      },
      resolvedRefs: [{ kind: 'protocol', label: 'test-wash', resolvedId: 'test-wash-protocol' }],
      resolvedLabwareRefs: [{ hint: 'that plate', matched: { instanceId: 'plate-1', labwareType: '96-well-plate' } }],
      resourceManifest: {
        tipRacks: [{ pipetteType: 'p300_single', rackCount: 1 }],
        reservoirLoads: [{ reservoirRef: 'reservoir-1', well: 'A1', reagentKind: 'buffer', volumeUl: 500 }],
        consumables: ['tip-rack-p300'],
      },
      instrumentRunFiles: [],
      downstreamQueue: [{ kind: 'qPCR', description: 'run qPCR on plate' }],
      validationReport: { findings: [] },
    };

    expect(ta.events.length).toBe(0);
    expect(ta.directives.length).toBe(0);
    expect(ta.gaps.length).toBe(0);
    expect(ta.labStateDelta).toBeDefined();
    expect(ta.deckLayoutPlan).toBeDefined();
    expect(ta.resolvedRefs).toBeDefined();
    expect(ta.resolvedLabwareRefs).toBeDefined();
    expect(ta.resourceManifest).toBeDefined();
    expect(ta.instrumentRunFiles).toBeDefined();
    expect(ta.downstreamQueue).toBeDefined();
    expect(ta.validationReport).toBeDefined();
  });

  it('accepts minimal (required fields only)', () => {
    const ta: TerminalArtifacts = { events: [], directives: [], gaps: [] };
    expect(ta).toBeDefined();
    expect(ta.events.length).toBe(0);
    expect(ta.directives.length).toBe(0);
    expect(ta.gaps.length).toBe(0);
  });

  it('accepts partial optional fields', () => {
    const ta: TerminalArtifacts = {
      events: [],
      directives: [],
      gaps: [],
      deckLayoutPlan: { pinned: [], autoFilled: [], conflicts: [] },
      validationReport: { findings: [] },
    };
    expect(ta.deckLayoutPlan).toBeDefined();
    expect(ta.validationReport).toBeDefined();
    expect(ta.labStateDelta).toBeUndefined();
    expect(ta.resolvedRefs).toBeUndefined();
  });
});
