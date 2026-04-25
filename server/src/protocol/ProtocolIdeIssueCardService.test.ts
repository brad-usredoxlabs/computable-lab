import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { ProtocolIdeIssueCardService } from './ProtocolIdeIssueCardService.js';
import type { FeedbackComment } from './ProtocolIdeFeedbackService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeedbackMockStore(
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

function makeSessionEnvelope(overrides: Record<string, unknown> = {}): RecordEnvelope {
  return {
    kind: 'protocol-ide-session',
    recordId: 'PIS-001',
    payload: {
      kind: 'protocol-ide-session',
      status: 'reviewing',
      ...overrides,
    },
    meta: { createdAt: new Date().toISOString() },
  };
}

// ---------------------------------------------------------------------------
// User-only card generation
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — user-only card generation', () => {
  it('generates a user-origin card from a single feedback comment', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-001',
          body: 'The wash step is missing from the protocol',
          submittedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    expect(result.success).toBe(true);
    expect(result.cardCount).toBeGreaterThan(0);

    const userCards = result.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBeGreaterThan(0);

    const card = userCards[0];
    expect(card.origin).toBe('user');
    expect(card.title).toContain('User feedback');
    expect(card.body).toBe('The wash step is missing from the protocol');
    expect(card.suggestedChange).toBeDefined();
    expect(card.suggestedChange).toContain('User-requested');
    expect(card.evidenceCitations).toBeDefined();
  });

  it('generates a user-origin card with a graph anchor', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-002',
          body: 'This should be in a 96-well plate layout',
          graphAnchor: { nodeId: 'add_material-001', label: 'Add material step' },
          submittedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const userCards = result.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBe(1);
    expect(userCards[0].graphAnchor).toEqual({
      nodeId: 'add_material-001',
      label: 'Add material step',
    });
  });

  it('generates a user-origin card with a source citation', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-003',
          body: 'Volume is too low for this reaction',
          sourceAnchor: {
            sourceRef: 'vendor-doc-123',
            snippet: 'Add 50 µL of buffer',
            page: 3,
          },
          submittedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const userCards = result.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBe(1);
    expect(userCards[0].evidenceCitations).toEqual([
      {
        sourceRef: 'vendor-doc-123',
        snippet: 'Add 50 µL of buffer',
        page: 3,
      },
    ]);
  });

  it('skips empty feedback comments', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-004',
          body: '',
          submittedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const userCards = result.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBe(0);
  });

  it('generates cards for multiple feedback comments', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-005',
          body: 'First issue',
          submittedAt: new Date().toISOString(),
        },
        {
          id: 'fb-006',
          body: 'Second issue',
          submittedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const userCards = result.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// System-diagnostic card generation
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — system-diagnostic card generation', () => {
  it('generates a system-origin card for a deck conflict', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      latestDeckSummary: {
        summary: '2 of 12 deck slots in use, 1 slot conflict(s)',
        slotsInUse: 2,
        totalSlots: 12,
        labware: [],
        pinnedSlots: [],
        autoFilledSlots: [],
        conflicts: [
          { slot: '1', candidates: ['96-well-plate', 'reservoir'] },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const systemCards = result.cards.filter((c) => c.origin === 'system');
    expect(systemCards.length).toBeGreaterThan(0);

    const deckCard = systemCards.find((c) => c.title.includes('Deck layout'));
    expect(deckCard).toBeDefined();
    expect(deckCard!.origin).toBe('system');
    expect(deckCard!.body).toContain('Slot conflict at 1');
  });

  it('generates a system-origin card for a pipette-too-coarse issue', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      latestToolsSummary: {
        summary: 'Pipettes: p1000_multi',
        pipettes: [
          { type: 'p1000_multi', channels: 8, evidenceLinks: [] },
        ],
        tipRacks: [],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const systemCards = result.cards.filter((c) => c.origin === 'system');
    const toolCard = systemCards.find((c) => c.title.includes('Tool'));
    expect(toolCard).toBeDefined();
    expect(toolCard!.origin).toBe('system');
    expect(toolCard!.body).toContain('too coarse');
  });

  it('generates a system-origin card for an unknown reagent kind', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      latestReagentsSummary: {
        summary: '1 reagent(s), 1 well(s), 100 µL total',
        reagentCount: 1,
        reagents: [
          { kind: 'unknown', totalVolumeUl: 100, wellCount: 1, unit: 'µL', evidenceLinks: [] },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const systemCards = result.cards.filter((c) => c.origin === 'system');
    const reagentCard = systemCards.find((c) => c.title.includes('Reagent'));
    expect(reagentCard).toBeDefined();
    expect(reagentCard!.origin).toBe('system');
    expect(reagentCard!.body).toContain('Unknown reagent kind');
  });

  it('generates a system-origin card for a missing budget estimate', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      latestBudgetSummary: {
        summary: '1 line(s) across reagent (costs not yet estimated)',
        totalCost: undefined,
        currency: 'USD',
        lines: [
          {
            description: 'Reagent: buffer',
            category: 'reagent',
            estimatedCost: 0,
            currency: 'USD',
            evidenceLinks: [],
          },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const systemCards = result.cards.filter((c) => c.origin === 'system');
    const budgetCard = systemCards.find((c) => c.title.includes('Budget'));
    expect(budgetCard).toBeDefined();
    expect(budgetCard!.origin).toBe('system');
    expect(budgetCard!.body).toContain('No cost estimate');
  });

  it('generates no system cards when diagnostics are empty', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      latestDeckSummary: {
        summary: '2 of 12 deck slots in use',
        slotsInUse: 2,
        totalSlots: 12,
        labware: [],
        pinnedSlots: [],
        autoFilledSlots: [],
        conflicts: [],
        evidenceLinks: [],
      },
      latestToolsSummary: {
        summary: 'Pipettes: p300_single',
        pipettes: [
          { type: 'p300_single', channels: 1, evidenceLinks: [] },
        ],
        tipRacks: [],
        evidenceLinks: [],
      },
      latestReagentsSummary: {
        summary: '1 reagent(s), 1 well(s), 100 µL total',
        reagentCount: 1,
        reagents: [
          { kind: 'buffer', totalVolumeUl: 100, wellCount: 1, unit: 'µL', evidenceLinks: [] },
        ],
        evidenceLinks: [],
      },
      latestBudgetSummary: {
        summary: '1 line(s) across reagent, ~$0.10 estimated',
        totalCost: 0.1,
        currency: 'USD',
        lines: [
          {
            description: 'Reagent: buffer',
            category: 'reagent',
            estimatedCost: 0.1,
            currency: 'USD',
            evidenceLinks: [],
          },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const systemCards = result.cards.filter((c) => c.origin === 'system');
    expect(systemCards.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mixed-origin card generation with evidence links
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — mixed-origin card generation', () => {
  it('generates a mixed-origin card when both feedback and diagnostics exist', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-007',
          body: 'Need to add a wash step',
          submittedAt: new Date().toISOString(),
        },
      ],
      rollingIssueSummary: {
        summary: 'Need to add a wash step',
        updatedAt: new Date().toISOString(),
        commentCount: 1,
      },
      latestDeckSummary: {
        summary: '2 of 12 deck slots in use, 1 slot conflict(s)',
        slotsInUse: 2,
        totalSlots: 12,
        labware: [],
        pinnedSlots: [],
        autoFilledSlots: [],
        conflicts: [
          { slot: '1', candidates: ['96-well-plate', 'reservoir'] },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const mixedCards = result.cards.filter((c) => c.origin === 'mixed');
    expect(mixedCards.length).toBeGreaterThan(0);

    const mixedCard = mixedCards[0];
    expect(mixedCard.origin).toBe('mixed');
    expect(mixedCard.title).toContain('Mixed');
    expect(mixedCard.body).toContain('Rolling summary');
    expect(mixedCard.body).toContain('System diagnostics');
    expect(mixedCard.suggestedChange).toContain('User-and-system');
  });

  it('does not generate mixed cards when rolling summary is empty', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-008',
          body: 'Some feedback',
          submittedAt: new Date().toISOString(),
        },
      ],
      rollingIssueSummary: {
        summary: '',
        updatedAt: new Date().toISOString(),
        commentCount: 0,
      },
      latestDeckSummary: {
        summary: '2 of 12 deck slots in use, 1 slot conflict(s)',
        slotsInUse: 2,
        totalSlots: 12,
        labware: [],
        pinnedSlots: [],
        autoFilledSlots: [],
        conflicts: [
          { slot: '1', candidates: ['96-well-plate', 'reservoir'] },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const mixedCards = result.cards.filter((c) => c.origin === 'mixed');
    expect(mixedCards.length).toBe(0);
  });

  it('does not generate mixed cards when diagnostics are empty', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-009',
          body: 'Some feedback',
          submittedAt: new Date().toISOString(),
        },
      ],
      rollingIssueSummary: {
        summary: 'Some feedback',
        updatedAt: new Date().toISOString(),
        commentCount: 1,
      },
      latestDeckSummary: {
        summary: '2 of 12 deck slots in use',
        slotsInUse: 2,
        totalSlots: 12,
        labware: [],
        pinnedSlots: [],
        autoFilledSlots: [],
        conflicts: [],
        evidenceLinks: [],
      },
      latestToolsSummary: {
        summary: 'Pipettes: p300_single',
        pipettes: [
          { type: 'p300_single', channels: 1, evidenceLinks: [] },
        ],
        tipRacks: [],
        evidenceLinks: [],
      },
      latestReagentsSummary: {
        summary: '1 reagent(s)',
        reagentCount: 1,
        reagents: [
          { kind: 'buffer', totalVolumeUl: 100, wellCount: 1, unit: 'µL', evidenceLinks: [] },
        ],
        evidenceLinks: [],
      },
      latestBudgetSummary: {
        summary: '1 line(s)',
        totalCost: 0.1,
        currency: 'USD',
        lines: [
          {
            description: 'Reagent: buffer',
            category: 'reagent',
            estimatedCost: 0.1,
            currency: 'USD',
            evidenceLinks: [],
          },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const mixedCards = result.cards.filter((c) => c.origin === 'mixed');
    expect(mixedCards.length).toBe(0);
  });

  it('generates user, system, and mixed cards together', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-010',
          body: 'Missing wash step',
          submittedAt: new Date().toISOString(),
        },
      ],
      rollingIssueSummary: {
        summary: 'Missing wash step',
        updatedAt: new Date().toISOString(),
        commentCount: 1,
      },
      latestDeckSummary: {
        summary: '2 of 12 deck slots in use, 1 slot conflict(s)',
        slotsInUse: 2,
        totalSlots: 12,
        labware: [],
        pinnedSlots: [],
        autoFilledSlots: [],
        conflicts: [
          { slot: '1', candidates: ['96-well-plate', 'reservoir'] },
        ],
        evidenceLinks: [],
      },
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    const userCards = result.cards.filter((c) => c.origin === 'user');
    const systemCards = result.cards.filter((c) => c.origin === 'system');
    const mixedCards = result.cards.filter((c) => c.origin === 'mixed');

    expect(userCards.length).toBe(1);
    expect(systemCards.length).toBeGreaterThan(0);
    expect(mixedCards.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Latest-state replacement behavior
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — latest-state replacement', () => {
  it('replaces the current card set instead of accreting', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-011',
          body: 'New feedback',
          submittedAt: new Date().toISOString(),
        },
      ],
      issueCards: [
        {
          id: 'ic-old-001',
          title: 'Old card',
          body: 'This should be replaced',
          origin: 'user',
          evidenceCitations: [],
          generatedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    // The result should contain the newly generated cards
    expect(result.cardCount).toBeGreaterThan(0);

    // Verify the old card is NOT in the result
    const oldCard = result.cards.find((c) => c.id === 'ic-old-001');
    expect(oldCard).toBeUndefined();

    // Verify the persisted envelope has the new cards
    const persistedEnvelope = (store.get as ReturnType<typeof vi.fn>).mock.results[0].value;
    // The store's get was called once at the start, so we need to check the update was called
    expect(store.update).toHaveBeenCalled();
    const updateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const persistedCards = (updateCall.envelope.payload as Record<string, unknown>).issueCards as Array<{ id: string }>;
    const oldPersistedCard = persistedCards.find((c) => c.id === 'ic-old-001');
    expect(oldPersistedCard).toBeUndefined();
  });

  it('returns empty cards when session has no feedback or diagnostics', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({});
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    expect(result.success).toBe(true);
    expect(result.cardCount).toBe(0);
    expect(result.cards).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — error handling', () => {
  it('throws when session is not found', async () => {
    const store = makeFeedbackMockStore(null, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    await expect(service.generateIssueCards('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });

  it('throws when store update fails', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      feedbackComments: [
        {
          id: 'fb-012',
          body: 'Some feedback',
          submittedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, {
      success: false,
      error: 'database error',
    });
    const service = new ProtocolIdeIssueCardService(store);

    await expect(service.generateIssueCards('PIS-001')).rejects.toThrow(
      'Failed to persist issue cards for session PIS-001',
    );
  });
});

// ---------------------------------------------------------------------------
// getIssueCards
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — getIssueCards', () => {
  it('returns the current issue cards for a session', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      issueCards: [
        {
          id: 'ic-001',
          title: 'Test card',
          body: 'Test body',
          origin: 'user',
          evidenceCitations: [],
          generatedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope);
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.getIssueCards('PIS-001');

    expect(result.success).toBe(true);
    expect(result.cardCount).toBe(1);
    expect(result.cards[0].id).toBe('ic-001');
    expect(result.cards[0].title).toBe('Test card');
  });

  it('returns empty cards when none exist', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({});
    const store = makeFeedbackMockStore(mockEnvelope);
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.getIssueCards('PIS-001');

    expect(result.success).toBe(true);
    expect(result.cardCount).toBe(0);
    expect(result.cards).toEqual([]);
  });

  it('throws when session is not found', async () => {
    const store = makeFeedbackMockStore(null);
    const service = new ProtocolIdeIssueCardService(store);

    await expect(service.getIssueCards('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });
});

// ---------------------------------------------------------------------------
// replaceIssueCards
// ---------------------------------------------------------------------------

describe('ProtocolIdeIssueCardService — replaceIssueCards', () => {
  it('replaces the current card set with a new set', async () => {
    const mockEnvelope: RecordEnvelope = makeSessionEnvelope({
      issueCards: [
        {
          id: 'ic-old',
          title: 'Old card',
          body: 'Old body',
          origin: 'user',
          evidenceCitations: [],
          generatedAt: new Date().toISOString(),
        },
      ],
    });
    const store = makeFeedbackMockStore(mockEnvelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const newCards: Array<{
      id: string;
      title: string;
      body: string;
      origin: 'user' | 'system' | 'mixed';
      evidenceCitations: Array<{ sourceRef: string }>;
      generatedAt: string;
    }> = [
      {
        id: 'ic-new-001',
        title: 'New card 1',
        body: 'New body 1',
        origin: 'system',
        evidenceCitations: [{ sourceRef: 'deck-layout' }],
        generatedAt: new Date().toISOString(),
      },
    ];

    const result = await service.replaceIssueCards('PIS-001', newCards);

    expect(result.success).toBe(true);
    expect(result.cardCount).toBe(1);
    expect(result.cards[0].id).toBe('ic-new-001');

    // Verify the old card is gone
    const oldCard = result.cards.find((c) => c.id === 'ic-old');
    expect(oldCard).toBeUndefined();
  });

  it('throws when session is not found', async () => {
    const store = makeFeedbackMockStore(null);
    const service = new ProtocolIdeIssueCardService(store);

    await expect(
      service.replaceIssueCards('PIS-nonexistent', []),
    ).rejects.toThrow("Session 'PIS-nonexistent' not found");
  });
});
