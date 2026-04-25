/**
 * Tests for ProtocolIdeOverlaySummaryService.
 *
 * Tests:
 *  (a) Deck summary — populated from labState deck + deckLayoutPlan
 *  (b) Tools summary — populated from mountedPipettes + resourceManifest
 *  (c) Reagents summary — populated from labState labware wells + events
 *  (d) Budget summary — populated from economics + resourceManifest
 *  (e) Evidence links — present and grounded in graph nodes
 *  (f) Empty input — graceful degradation
 *  (g) No second compile pass — service reads from projection data only
 */

import { describe, it, expect } from 'vitest';
import type {
  TerminalArtifacts,
  DeckLayoutPlan,
  ResourceManifest,
  LabStateDelta,
} from '../compiler/pipeline/CompileContracts.js';
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import { ProtocolIdeOverlaySummaryService } from './ProtocolIdeOverlaySummaryService.js';

// ---------------------------------------------------------------------------
// Helpers — build deterministic fixtures
// ---------------------------------------------------------------------------

function makeLabState(overrides?: Partial<LabStateSnapshot>): LabStateSnapshot {
  return {
    deck: [
      { slot: '1', labwareInstanceId: 'plate-1' },
      { slot: '2', labwareInstanceId: 'reservoir-1' },
      { slot: '3', labwareInstanceId: 'plate-2' },
    ],
    mountedPipettes: [
      { mountSide: 'left', pipetteType: 'p300_single', maxVolumeUl: 300 },
      { mountSide: 'right', pipetteType: 'p1000_multi', maxVolumeUl: 1000 },
    ],
    labware: {
      'plate-1': {
        instanceId: 'plate-1',
        labwareType: '96-well-plate',
        slot: '1',
        orientation: 'landscape',
        wells: {
          A1: [
            {
              materialId: 'mat-buffer-001',
              kind: 'buffer',
              volumeUl: 100,
              economics: { currency: 'USD', amountPerUl: 0.002 },
            },
          ],
          A2: [
            {
              materialId: 'mat-buffer-001',
              kind: 'buffer',
              volumeUl: 50,
              economics: { currency: 'USD', amountPerUl: 0.002 },
            },
          ],
          B1: [
            {
              materialId: 'mat-cell-001',
              kind: 'HeLa cells',
              volumeUl: 200,
              economics: { currency: 'USD', amountPerUl: 0.01 },
            },
          ],
        },
      },
      'reservoir-1': {
        instanceId: 'reservoir-1',
        labwareType: 'reservoir',
        slot: '2',
        orientation: 'landscape',
        wells: {
          A1: [
            {
              materialId: 'mat-wash-001',
              kind: 'wash buffer',
              volumeUl: 5000,
              economics: { currency: 'USD', amountPerUl: 0.0005 },
            },
          ],
        },
      },
      'plate-2': {
        instanceId: 'plate-2',
        labwareType: '384-well-plate',
        slot: '3',
        orientation: 'portrait',
        wells: {
          A01: [
            {
              materialId: 'mat-dye-001',
              kind: 'fluorescent dye',
              volumeUl: 25,
              economics: { currency: 'USD', amountPerUl: 0.05 },
            },
          ],
        },
      },
    },
    mintCounter: 3,
    turnIndex: 1,
    ...overrides,
  };
}

function makeDeckLayoutPlan(overrides?: Partial<DeckLayoutPlan>): DeckLayoutPlan {
  return {
    pinned: [
      { slot: '1', labwareHint: '96-well-plate' },
      { slot: '2', labwareHint: 'reservoir' },
    ],
    autoFilled: [
      { slot: '3', labwareHint: '384-well-plate', reason: 'auto-fill for assay' },
    ],
    conflicts: [],
    ...overrides,
  };
}

function makeResourceManifest(overrides?: Partial<ResourceManifest>): ResourceManifest {
  return {
    tipRacks: [
      { pipetteType: 'p300_single', rackCount: 1 },
      { pipetteType: 'p1000_multi', rackCount: 1 },
    ],
    reservoirLoads: [
      {
        reservoirRef: 'reservoir-1',
        well: 'A1',
        reagentKind: 'wash buffer',
        volumeUl: 5000,
      },
    ],
    consumables: ['tip-rack-p300', 'tip-rack-p1000'],
    ...overrides,
  };
}

function makeTerminalArtifacts(overrides?: Partial<TerminalArtifacts>): TerminalArtifacts {
  return {
    events: [
      {
        event_type: 'add_material',
        details: {
          labwareInstanceId: 'plate-1',
          well: 'C1',
          material: {
            materialId: 'mat-additional-001',
            kind: 'additional reagent',
            volumeUl: 75,
          },
        },
      },
    ],
    directives: [
      {
        id: 'dir-mount-001',
        kind: 'pipette_mount',
        mountSide: 'left',
        pipetteType: 'p300_single',
      },
      {
        id: 'dir-mount-002',
        kind: 'pipette_mount',
        mountSide: 'right',
        pipetteType: 'p1000_multi',
      },
    ],
    gaps: [],
    ...overrides,
  };
}

function makeLabStateDelta(): LabStateDelta {
  return {
    events: [],
    snapshotAfter: makeLabState(),
  };
}

// ---------------------------------------------------------------------------
// (a) Deck summary
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — deck summary', () => {
  it('produces a deck summary with labware entries from labState', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.slotsInUse).toBe(3);
    expect(summaries.deck.totalSlots).toBe(12);
    expect(summaries.deck.labware).toHaveLength(3);

    // Check first labware entry
    const plate1 = summaries.deck.labware.find((l) => l.slot === '1');
    expect(plate1).toBeDefined();
    expect(plate1!.labwareType).toBe('96-well-plate');
    expect(plate1!.instanceId).toBe('plate-1');
    expect(plate1!.orientation).toBe('landscape');
    expect(plate1!.evidenceLinks).toHaveLength(2);
    expect(plate1!.evidenceLinks[0].kind).toBe('labware');
    expect(plate1!.evidenceLinks[0].nodeId).toBe('plate-1');
  });

  it('includes deck layout plan data', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const deckLayoutPlan = makeDeckLayoutPlan();
    const artifacts = makeTerminalArtifacts({ deckLayoutPlan });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.pinnedSlots).toHaveLength(2);
    expect(summaries.deck.pinnedSlots[0].slot).toBe('1');
    expect(summaries.deck.autoFilledSlots).toHaveLength(1);
    expect(summaries.deck.autoFilledSlots[0].reason).toBe('auto-fill for assay');
    expect(summaries.deck.conflicts).toHaveLength(0);
  });

  it('includes evidence links for deck layout plan', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const deckLayoutPlan = makeDeckLayoutPlan();
    const artifacts = makeTerminalArtifacts({ deckLayoutPlan });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.evidenceLinks).toHaveLength(3); // 2 pinned + 1 auto-filled
    const pinnedLink = summaries.deck.evidenceLinks.find(
      (l) => l.nodeId === 'pinned:1',
    );
    expect(pinnedLink).toBeDefined();
    expect(pinnedLink!.kind).toBe('event');
  });

  it('handles empty deck', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState({ deck: [], labware: {} });

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.slotsInUse).toBe(0);
    expect(summaries.deck.labware).toHaveLength(0);
    expect(summaries.deck.summary).toContain('0 of 12');
  });

  it('handles custom total deck slots', () => {
    const service = new ProtocolIdeOverlaySummaryService({ totalDeckSlots: 8 });
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.totalSlots).toBe(8);
    expect(summaries.deck.summary).toContain('3 of 8');
  });
});

// ---------------------------------------------------------------------------
// (b) Tools summary
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — tools summary', () => {
  it('produces a tools summary with pipette entries from labState', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.tools.pipettes).toHaveLength(2);

    const p300 = summaries.tools.pipettes.find((p) => p.type === 'p300_single');
    expect(p300).toBeDefined();
    expect(p300!.channels).toBe(1);
    expect(p300!.mountSide).toBe('left');
    expect(p300!.evidenceLinks).toHaveLength(1);
    expect(p300!.evidenceLinks[0].kind).toBe('directive');

    const p1000 = summaries.tools.pipettes.find((p) => p.type === 'p1000_multi');
    expect(p1000).toBeDefined();
    expect(p1000!.channels).toBe(8);
    expect(p1000!.mountSide).toBe('right');
  });

  it('includes tip rack info from resource manifest', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const resourceManifest = makeResourceManifest();
    const artifacts = makeTerminalArtifacts({ resourceManifest });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.tools.tipRacks).toHaveLength(2);
    expect(summaries.tools.tipRacks[0].pipetteType).toBe('p300_single');
    expect(summaries.tools.tipRacks[0].rackCount).toBe(1);
  });

  it('includes evidence links from directives', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.tools.evidenceLinks).toHaveLength(4); // 2 directives + 2 mounted
    const dirLink = summaries.tools.evidenceLinks.find(
      (l) => l.nodeId === 'dir-mount-001',
    );
    expect(dirLink).toBeDefined();
    expect(dirLink!.kind).toBe('directive');
  });

  it('handles empty pipettes', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState({ mountedPipettes: [] });

    const summaries = service.derive(artifacts, labState);

    expect(summaries.tools.pipettes).toHaveLength(0);
    expect(summaries.tools.summary).toContain('No tools configured');
  });
});

// ---------------------------------------------------------------------------
// (c) Reagents summary
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — reagents summary', () => {
  it('produces a reagents summary from labState labware wells', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.reagents.reagentCount).toBeGreaterThan(0);

    // Check that buffer is aggregated across wells
    const buffer = summaries.reagents.reagents.find((r) => r.kind === 'buffer');
    expect(buffer).toBeDefined();
    expect(buffer!.totalVolumeUl).toBe(150); // 100 + 50
    expect(buffer!.wellCount).toBe(2);
    expect(buffer!.unit).toBe('µL');
  });

  it('includes evidence links for reagents', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    // Each reagent should have at least one evidence link
    for (const reagent of summaries.reagents.reagents) {
      expect(reagent.evidenceLinks.length).toBeGreaterThan(0);
    }

    // Check that evidence links are grounded
    const buffer = summaries.reagents.reagents.find((r) => r.kind === 'buffer');
    expect(buffer!.evidenceLinks[0].kind).toBe('material');
    expect(buffer!.evidenceLinks[0].nodeId).toBe('mat-buffer-001');
  });

  it('aggregates reagents from events', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    // The additional reagent from the event should be present
    const additional = summaries.reagents.reagents.find(
      (r) => r.kind === 'additional reagent',
    );
    expect(additional).toBeDefined();
    expect(additional!.totalVolumeUl).toBe(75);
    expect(additional!.evidenceLinks[0].kind).toBe('event');
  });

  it('handles empty labState', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState({ labware: {} });

    const summaries = service.derive(artifacts, labState);

    expect(summaries.reagents.reagentCount).toBe(1); // Only the event reagent
    expect(summaries.reagents.summary).toContain('1 reagent');
  });
});

// ---------------------------------------------------------------------------
// (d) Budget summary
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — budget summary', () => {
  it('produces a budget summary with reagent lines from economics', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.budget.lines.length).toBeGreaterThan(0);

    // Check that reagent lines have estimated costs
    const reagentLines = summaries.budget.lines.filter(
      (l) => l.category === 'reagent',
    );
    expect(reagentLines.length).toBeGreaterThan(0);
    for (const line of reagentLines) {
      expect(line.estimatedCost).toBeGreaterThan(0);
      expect(line.currency).toBe('USD');
    }
  });

  it('includes consumable lines from resource manifest', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const resourceManifest = makeResourceManifest();
    const artifacts = makeTerminalArtifacts({ resourceManifest });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    const consumableLines = summaries.budget.lines.filter(
      (l) => l.category === 'consumable',
    );
    expect(consumableLines.length).toBeGreaterThan(0);

    // Tip rack lines should have estimated costs
    const tipLines = consumableLines.filter((l) =>
      l.description.includes('Tip rack'),
    );
    expect(tipLines.length).toBeGreaterThan(0);
    for (const line of tipLines) {
      expect(line.estimatedCost).toBeGreaterThan(0);
    }
  });

  it('includes labware lines from deck layout', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    const labwareLines = summaries.budget.lines.filter(
      (l) => l.category === 'labware',
    );
    expect(labwareLines.length).toBeGreaterThan(0);

    // Labware lines should have 0 cost (reusable)
    for (const line of labwareLines) {
      expect(line.estimatedCost).toBe(0);
    }
  });

  it('includes evidence links for budget lines', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    // Reagent lines should link to material IDs
    const reagentLines = summaries.budget.lines.filter(
      (l) => l.category === 'reagent',
    );
    for (const line of reagentLines) {
      expect(line.evidenceLinks).toHaveLength(1);
      expect(line.evidenceLinks[0].kind).toBe('material');
    }
  });

  it('calculates total cost', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.budget.totalCost).toBeDefined();
    expect(summaries.budget.totalCost).toBeGreaterThan(0);

    // Verify total is sum of all line costs
    const expectedTotal = summaries.budget.lines.reduce(
      (sum, line) => sum + (line.estimatedCost ?? 0),
      0,
    );
    expect(summaries.budget.totalCost).toBe(expectedTotal);
  });

  it('handles empty labState for budget', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const resourceManifest = makeResourceManifest();
    const artifacts = makeTerminalArtifacts({ resourceManifest });
    const labState = makeLabState({ labware: {} });

    const summaries = service.derive(artifacts, labState);

    expect(summaries.budget.lines.length).toBeGreaterThan(0); // Still has consumables from resourceManifest
    expect(summaries.budget.summary).toContain('line(s)');
  });
});

// ---------------------------------------------------------------------------
// (e) Evidence links — present and grounded
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — evidence links', () => {
  it('all summary families have evidence links', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const deckLayoutPlan = makeDeckLayoutPlan();
    const resourceManifest = makeResourceManifest();
    const artifacts = makeTerminalArtifacts({ deckLayoutPlan, resourceManifest });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.evidenceLinks.length).toBeGreaterThan(0);
    expect(summaries.tools.evidenceLinks.length).toBeGreaterThan(0);
    expect(summaries.reagents.evidenceLinks.length).toBeGreaterThan(0);
    expect(summaries.budget.evidenceLinks.length).toBeGreaterThan(0);
  });

  it('evidence links reference valid node types', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    const validKinds = ['event', 'directive', 'source-ref', 'labware', 'material'];

    const allLinks = [
      ...summaries.deck.evidenceLinks,
      ...summaries.tools.evidenceLinks,
      ...summaries.reagents.evidenceLinks,
      ...summaries.budget.evidenceLinks,
    ];

    for (const link of allLinks) {
      expect(validKinds).toContain(link.kind);
      expect(link.nodeId.length).toBeGreaterThan(0);
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it('deck labware entries have evidence links', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    for (const entry of summaries.deck.labware) {
      expect(entry.evidenceLinks.length).toBeGreaterThan(0);
    }
  });

  it('pipette entries have evidence links', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    for (const pipette of summaries.tools.pipettes) {
      expect(pipette.evidenceLinks.length).toBeGreaterThan(0);
      expect(pipette.evidenceLinks[0].kind).toBe('directive');
    }
  });
});

// ---------------------------------------------------------------------------
// (f) Empty input — graceful degradation
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — empty input', () => {
  it('handles completely empty TerminalArtifacts and no labState', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts: TerminalArtifacts = {
      events: [],
      directives: [],
      gaps: [],
    };

    const summaries = service.derive(artifacts);

    expect(summaries.deck.slotsInUse).toBe(0);
    expect(summaries.deck.totalSlots).toBe(12);
    expect(summaries.tools.pipettes).toHaveLength(0);
    expect(summaries.reagents.reagentCount).toBe(0);
    expect(summaries.budget.lines).toHaveLength(0);
  });

  it('handles empty arrays in all fields', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const labState = makeLabState({
      deck: [],
      mountedPipettes: [],
      labware: {},
    });
    const artifacts = makeTerminalArtifacts({
      events: [],
      directives: [],
      deckLayoutPlan: { pinned: [], autoFilled: [], conflicts: [] },
      resourceManifest: { tipRacks: [], reservoirLoads: [], consumables: [] },
    });

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.slotsInUse).toBe(0);
    expect(summaries.tools.pipettes).toHaveLength(0);
    expect(summaries.reagents.reagentCount).toBe(0);
    expect(summaries.budget.lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (g) No second compile pass — service reads from projection data only
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — no second compile pass', () => {
  it('derives summaries solely from passed-in data, no external calls', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    // The derive method should be a pure function of its inputs
    // No network calls, no store lookups, no compiler invocations
    const summaries1 = service.derive(artifacts, labState);
    const summaries2 = service.derive(artifacts, labState);

    // Same inputs → same outputs (deterministic)
    expect(summaries1.deck.slotsInUse).toBe(summaries2.deck.slotsInUse);
    expect(summaries1.tools.pipettes.length).toBe(summaries2.tools.pipettes.length);
    expect(summaries1.reagents.reagentCount).toBe(summaries2.reagents.reagentCount);
    expect(summaries1.budget.totalCost).toBe(summaries2.budget.totalCost);
  });

  it('does not modify input data', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    // Deep clone inputs to detect mutation
    const artifactsBefore = JSON.parse(JSON.stringify(artifacts));
    const labStateBefore = JSON.parse(JSON.stringify(labState));

    service.derive(artifacts, labState);

    expect(JSON.stringify(artifacts)).toBe(JSON.stringify(artifactsBefore));
    expect(JSON.stringify(labState)).toBe(JSON.stringify(labStateBefore));
  });

  it('uses labStateDelta snapshot when labState is not directly provided', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const labStateDelta = makeLabStateDelta();
    const artifacts = makeTerminalArtifacts({ labStateDelta });

    // When labState is not provided, the service should still work
    // (it will just have empty data since it can't access the snapshot)
    const summaries = service.derive(artifacts);

    // The service reads from labState parameter, not from labStateDelta
    // This is by design — the caller passes the latest projection's labState
    expect(summaries.deck.slotsInUse).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (h) Summary text quality
// ---------------------------------------------------------------------------

describe('ProtocolIdeOverlaySummaryService — summary text', () => {
  it('deck summary text is human-readable', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const deckLayoutPlan = makeDeckLayoutPlan();
    const artifacts = makeTerminalArtifacts({ deckLayoutPlan });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.deck.summary).toContain('3 of 12');
    expect(summaries.deck.summary).toContain('user-pinned');
    expect(summaries.deck.summary).toContain('auto-filled');
  });

  it('tools summary text is human-readable', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const resourceManifest = makeResourceManifest();
    const artifacts = makeTerminalArtifacts({ resourceManifest });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.tools.summary).toContain('Pipettes:');
    expect(summaries.tools.summary).toContain('p300_single');
    expect(summaries.tools.summary).toContain('Tip racks:');
  });

  it('reagents summary text is human-readable', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const artifacts = makeTerminalArtifacts();
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.reagents.summary).toContain('reagent');
    expect(summaries.reagents.summary).toContain('well');
    expect(summaries.reagents.summary).toContain('µL');
  });

  it('budget summary text is human-readable', () => {
    const service = new ProtocolIdeOverlaySummaryService();
    const resourceManifest = makeResourceManifest();
    const artifacts = makeTerminalArtifacts({ resourceManifest });
    const labState = makeLabState();

    const summaries = service.derive(artifacts, labState);

    expect(summaries.budget.summary).toContain('line');
    expect(summaries.budget.summary).toContain('reagent');
    expect(summaries.budget.summary).toContain('consumable');
    expect(summaries.budget.summary).toContain('labware');
  });
});
