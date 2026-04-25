import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { ProtocolIdeRalphExportService } from './ProtocolIdeRalphExportService.js';
import type { IssueCard } from './ProtocolIdeIssueCardService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(
  initialEnvelope: RecordEnvelope | null = null,
  updateResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  let currentEnvelope: RecordEnvelope | null = initialEnvelope;

  return {
    create: vi.fn().mockResolvedValue({ success: true }),
    get: vi.fn().mockImplementation(() => {
      return Promise.resolve(currentEnvelope);
    }),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation((options) => {
      currentEnvelope = options.envelope;
      return Promise.resolve(updateResult);
    }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

function makeSessionEnvelope(
  issueCards: IssueCard[] = [],
  overrides: Record<string, unknown> = {},
): RecordEnvelope {
  return {
    kind: 'protocol-ide-session',
    recordId: 'PIS-001',
    payload: {
      kind: 'protocol-ide-session',
      status: 'reviewing',
      latestDirectiveText: 'Add 10uL buffer to A1',
      ...overrides,
      issueCards,
    },
    meta: { createdAt: new Date().toISOString() },
  };
}

function makeIssueCards(): IssueCard[] {
  return [
    {
      id: 'ic-001',
      title: 'Pipette too coarse for single-well transfer',
      body: 'The P200 pipette is being used for a 1uL transfer. This should use a P20 instead.',
      origin: 'system',
      evidenceCitations: [
        { sourceRef: 'tools-summary', snippet: 'P200 pipette used for 1uL transfer' },
      ],
      graphAnchor: { nodeId: 'transfer-001', label: 'Transfer step' },
      suggestedChange:
        'System-detected issue: Pipette too coarse for single-well transfer. The P200 pipette is being used for a 1uL transfer. This should use a P20 instead. — Consider adding a compiler pass or directive to address this.',
      generatedAt: new Date().toISOString(),
    },
    {
      id: 'ic-002',
      title: 'Missing compound-class entry for AhR-activator',
      body: 'The compound AhR-activator is referenced but not found in the compound-class registry.',
      origin: 'user',
      evidenceCitations: [
        {
          sourceRef: 'vendor-doc-123',
          snippet: 'AhR-activator compound details',
          page: 5,
        },
      ],
      suggestedChange:
        'User-requested issue: Missing compound-class entry for AhR-activator. The compound AhR-activator is referenced but not found in the compound-class registry. — Consider adding a compiler pass or directive to address this.',
      generatedAt: new Date().toISOString(),
    },
    {
      id: 'ic-003',
      title: 'Deck slot conflict at position 1',
      body: 'Two labware types are assigned to deck slot 1: 96-well-plate and reservoir.',
      origin: 'system',
      evidenceCitations: [
        { sourceRef: 'deck-layout', snippet: 'Slot conflict at 1' },
      ],
      graphAnchor: { nodeId: 'deck-001', label: 'Deck layout' },
      suggestedChange:
        'System-detected issue: Deck slot conflict at position 1. Two labware types are assigned to deck slot 1: 96-well-plate and reservoir. — Consider adding a compiler pass or directive to address this.',
      generatedAt: new Date().toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// canExport
// ---------------------------------------------------------------------------

describe('ProtocolIdeRalphExportService — canExport', () => {
  it('returns canExport=true when cards exist', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope);
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.canExport('PIS-001');

    expect(result.success).toBe(true);
    expect(result.canExport).toBe(true);
    expect(result.cardCount).toBe(3);
  });

  it('returns canExport=false when no cards exist', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope([]);
    const store = makeMockStore(mockEnvelope);
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.canExport('PIS-001');

    expect(result.success).toBe(true);
    expect(result.canExport).toBe(false);
    expect(result.cardCount).toBe(0);
  });

  it('throws when session is not found', async () => {
    const store = makeMockStore(null);
    const service = new ProtocolIdeRalphExportService(store);

    await expect(service.canExport('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });
});

// ---------------------------------------------------------------------------
// exportIssueCards — multi-spec generation
// ---------------------------------------------------------------------------

describe('ProtocolIdeRalphExportService — multi-spec export', () => {
  it('exports each card as a separate spec draft', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001', 'https://example.com/protocol.pdf');

    expect(result.success).toBe(true);
    expect(result.bundle.draftCount).toBe(3);
    expect(result.bundle.cardCount).toBe(3);
    expect(result.bundle.sessionId).toBe('PIS-001');
    expect(result.bundle.exportedAt).toBeDefined();
  });

  it('produces multiple smaller candidate specs, not one monolithic report', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    // Each draft should be a focused spec, not a monolithic report
    expect(result.bundle.drafts.length).toBe(3);

    // Each draft should have its own front matter and title
    for (const draft of result.bundle.drafts) {
      expect(draft.markdown).toContain('---');
      expect(draft.markdown).toContain('title:');
      expect(draft.markdown).toContain('priority:');
      expect(draft.markdown).toContain('## Description');
    }

    // Drafts should be different from each other
    const titles = result.bundle.drafts.map((d) => d.title);
    expect(titles[0]).not.toBe(titles[1]);
    expect(titles[1]).not.toBe(titles[2]);
  });

  it('each draft carries source context', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards(
      'PIS-001',
      'https://example.com/protocol.pdf',
      'Add 10uL buffer to A1',
    );

    for (const draft of result.bundle.drafts) {
      expect(draft.markdown).toContain('Source PDF: https://example.com/protocol.pdf');
      expect(draft.markdown).toContain('Session: PIS-001');
      expect(draft.markdown).toContain('Latest directive: Add 10uL buffer to A1');
    }
  });

  it('each draft carries evidence citations', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    // Draft 0 should have tools-summary citation
    expect(result.bundle.drafts[0].evidenceCitations).toEqual([
      { sourceRef: 'tools-summary', snippet: 'P200 pipette used for 1uL transfer' },
    ]);

    // Draft 1 should have vendor-doc-123 citation with page
    expect(result.bundle.drafts[1].evidenceCitations).toEqual([
      { sourceRef: 'vendor-doc-123', snippet: 'AhR-activator compound details', page: 5 },
    ]);

    // Draft 2 should have deck-layout citation
    expect(result.bundle.drafts[2].evidenceCitations).toEqual([
      { sourceRef: 'deck-layout', snippet: 'Slot conflict at 1' },
    ]);
  });

  it('each draft carries requested compiler changes', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    for (const draft of result.bundle.drafts) {
      expect(draft.markdown).toContain('## Requested Compiler Changes');
      expect(draft.markdown).toContain('Consider adding a compiler pass or directive');
    }
  });

  it('each draft carries graph anchor when present', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    // Drafts 0 and 2 have graph anchors
    expect(result.bundle.drafts[0].markdown).toContain('## Graph Anchor');
    expect(result.bundle.drafts[0].markdown).toContain('Node ID: transfer-001');
    expect(result.bundle.drafts[0].markdown).toContain('Label: Transfer step');

    expect(result.bundle.drafts[2].markdown).toContain('## Graph Anchor');
    expect(result.bundle.drafts[2].markdown).toContain('Node ID: deck-001');
  });

  it('assigns sequential priorities to drafts', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    expect(result.bundle.drafts[0].priority).toBe(1);
    expect(result.bundle.drafts[1].priority).toBe(2);
    expect(result.bundle.drafts[2].priority).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// exportIssueCards — clearing the canvas
// ---------------------------------------------------------------------------

describe('ProtocolIdeRalphExportService — clearing cards after export', () => {
  it('clears the issue-card set from the session after export', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    // The cleared cards should be returned
    expect(result.clearedCards.length).toBe(3);

    // Verify the persisted envelope has cleared cards
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const persistedCards = (updateCall.envelope.payload as Record<string, unknown>).issueCards as IssueCard[];
    expect(persistedCards).toEqual([]);
  });

  it('retains export metadata on the session after clearing', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    await service.exportIssueCards('PIS-001');

    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const persistedPayload = updateCall.envelope.payload as Record<string, unknown>;

    expect(persistedPayload.lastExportAt).toBeDefined();
    expect(persistedPayload.lastExportBundleRef).toBeDefined();
    expect(persistedPayload.lastExportBundleRef.kind).toBe('record');
    expect(persistedPayload.lastExportBundleRef.type).toBe('ralph-export-bundle');
  });

  it('returns the cleared cards in the response', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    expect(result.clearedCards.length).toBe(3);
    expect(result.clearedCards[0].id).toBe('ic-001');
    expect(result.clearedCards[1].id).toBe('ic-002');
    expect(result.clearedCards[2].id).toBe('ic-003');
  });

  it('throws when there are no cards to export', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope([]);
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    await expect(service.exportIssueCards('PIS-001')).rejects.toThrow(
      "No issue cards to export for session 'PIS-001'",
    );
  });

  it('throws when session is not found', async () => {
    const store = makeMockStore(null, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    await expect(service.exportIssueCards('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });

  it('throws when store update fails', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, {
      success: false,
      error: 'database error',
    });
    const service = new ProtocolIdeRalphExportService(store);

    await expect(service.exportIssueCards('PIS-001')).rejects.toThrow(
      'Failed to persist export metadata for session PIS-001',
    );
  });
});

// ---------------------------------------------------------------------------
// getLastExportMetadata
// ---------------------------------------------------------------------------

describe('ProtocolIdeRalphExportService — getLastExportMetadata', () => {
  it('returns null metadata when no export has been done', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope([]);
    const store = makeMockStore(mockEnvelope);
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.getLastExportMetadata('PIS-001');

    expect(result.success).toBe(true);
    expect(result.lastExportAt).toBeUndefined();
    expect(result.lastExportBundleRef).toBeUndefined();
  });

  it('returns export metadata after a successful export', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(makeIssueCards());
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    await service.exportIssueCards('PIS-001');
    const result = await service.getLastExportMetadata('PIS-001');

    expect(result.success).toBe(true);
    expect(result.lastExportAt).toBeDefined();
    expect(result.lastExportBundleRef).toBeDefined();
    expect(result.lastExportBundleRef!.kind).toBe('record');
    expect(result.lastExportBundleRef!.type).toBe('ralph-export-bundle');
  });

  it('throws when session is not found', async () => {
    const store = makeMockStore(null);
    const service = new ProtocolIdeRalphExportService(store);

    await expect(service.getLastExportMetadata('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('ProtocolIdeRalphExportService — edge cases', () => {
  it('exports a single card as a single spec draft', async () => {
    const singleCard: IssueCard[] = [
      {
        id: 'ic-single',
        title: 'Single issue',
        body: 'One issue to fix',
        origin: 'user',
        evidenceCitations: [],
        suggestedChange: 'User-requested issue: Single issue. — Consider adding a compiler pass or directive to address this.',
        generatedAt: new Date().toISOString(),
      },
    ];
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(singleCard);
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    expect(result.bundle.draftCount).toBe(1);
    expect(result.bundle.cardCount).toBe(1);
    expect(result.bundle.drafts[0].title).toBe('Single issue');
  });

  it('exports cards with no evidence citations', async () => {
    const cards: IssueCard[] = [
      {
        id: 'ic-no-evidence',
        title: 'No evidence card',
        body: 'This card has no evidence',
        origin: 'user',
        evidenceCitations: [],
        suggestedChange: 'User-requested issue: No evidence card. — Consider adding a compiler pass or directive to address this.',
        generatedAt: new Date().toISOString(),
      },
    ];
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(cards);
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    expect(result.bundle.drafts[0].evidenceCitations).toEqual([]);
    // Should still have the markdown
    expect(result.bundle.drafts[0].markdown).toContain('## Description');
    expect(result.bundle.drafts[0].markdown).toContain('No evidence card');
  });

  it('exports cards with no graph anchor', async () => {
    const cards: IssueCard[] = [
      {
        id: 'ic-no-anchor',
        title: 'No anchor card',
        body: 'This card has no graph anchor',
        origin: 'system',
        evidenceCitations: [{ sourceRef: 'tools-summary', snippet: 'test' }],
        suggestedChange: 'System-detected issue: No anchor card. — Consider adding a compiler pass or directive to address this.',
        generatedAt: new Date().toISOString(),
      },
    ];
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope(cards);
    const store = makeMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeRalphExportService(store);

    const result = await service.exportIssueCards('PIS-001');

    expect(result.bundle.drafts[0].markdown).not.toContain('## Graph Anchor');
  });
});
