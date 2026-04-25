/**
 * Protocol IDE end-to-end fixture — deterministic integration test.
 *
 * Covers the full compiler feedback loop:
 *   1. Bootstrap a session from a source PDF + directive
 *   2. Import source evidence (mocked)
 *   3. Project to the review-only event-graph surface
 *   4. Submit feedback (user comment with source anchor)
 *   5. Rerun with latest-state semantics
 *   6. Generate issue cards (user + system + mixed)
 *   7. Export Ralph-ready spec drafts
 *   8. Clear the cards after export
 *
 * Assertions:
 *   - Source evidence citations reach issue cards
 *   - Deck, tools, reagents, and budget summaries are present
 *   - Reruns mutate latest state (no immutable history accumulation)
 *   - Export clears the issue-card set
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { ProtocolIdeSessionService } from './ProtocolIdeSessionService.js';
import { ProtocolIdeSourceImportService } from './ProtocolIdeSourceImportService.js';
import { ProtocolIdeFeedbackService } from './ProtocolIdeFeedbackService.js';
import { ProtocolIdeProjectionService } from './ProtocolIdeProjectionService.js';
import { ProtocolIdeIssueCardService } from './ProtocolIdeIssueCardService.js';
import { ProtocolIdeRalphExportService } from './ProtocolIdeRalphExportService.js';
import type { IssueCard } from './ProtocolIdeIssueCardService.js';
import type { FeedbackComment } from './ProtocolIdeFeedbackService.js';
import type {
  DeckSummary,
  ToolsSummary,
  ReagentsSummary,
  BudgetSummary,
} from './ProtocolIdeOverlaySummaryService.js';

// ---------------------------------------------------------------------------
// Helpers — mock store
// ---------------------------------------------------------------------------

function makeMockStore(
  initialEnvelope: RecordEnvelope | null = null,
  updateResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  let currentEnvelope: RecordEnvelope | null = initialEnvelope;

  return {
    create: vi.fn().mockImplementation(async (options) => {
      currentEnvelope = options.envelope;
      return { success: true, envelope: options.envelope };
    }),
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

// ---------------------------------------------------------------------------
// Helpers — session envelope builders
// ---------------------------------------------------------------------------

function makeSessionEnvelope(
  sessionId: string,
  extraPayload: Record<string, unknown> = {},
): RecordEnvelope {
  return {
    kind: 'protocol-ide-session',
    recordId: sessionId,
    schemaId:
      'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml',
    payload: {
      kind: 'protocol-ide-session',
      recordId: sessionId,
      sourceMode: 'pdf_url',
      status: 'draft' as const,
      latestDirectiveText: '',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: null,
      extractedTextRef: null,
      evidenceRefs: [],
      latestProtocolRef: null,
      latestEventGraphRef: null,
      latestEventGraphCacheKey: null,
      latestDeckSummaryRef: null,
      latestToolsSummaryRef: null,
      latestReagentsSummaryRef: null,
      latestBudgetSummaryRef: null,
      rollingIssueSummary: '',
      issueCardRefs: [],
      lastExportAt: null,
      lastExportBundleRef: null,
      feedbackComments: [],
      ...extraPayload,
    },
    meta: { createdAt: new Date().toISOString() },
  };
}

// ---------------------------------------------------------------------------
// Helpers — overlay summary builders
// ---------------------------------------------------------------------------

function makeDeckSummary(
  overrides: Partial<DeckSummary> = {},
): DeckSummary {
  return {
    summary: '2 of 12 deck slots in use, 1 slot conflict(s)',
    slotsInUse: 2,
    totalSlots: 12,
    labware: [],
    pinnedSlots: [],
    autoFilledSlots: [],
    conflicts: [{ slot: '1', candidates: ['96-well-plate', 'reservoir'] }],
    evidenceLinks: [
      { nodeId: 'pinned:1', label: 'User-pinned slot 1', kind: 'event' },
    ],
    ...overrides,
  };
}

function makeToolsSummary(
  overrides: Partial<ToolsSummary> = {},
): ToolsSummary {
  return {
    summary: 'Pipettes: p1000_multi',
    pipettes: [
      { type: 'p1000_multi', channels: 8, evidenceLinks: [] },
    ],
    tipRacks: [],
    evidenceLinks: [],
    ...overrides,
  };
}

function makeReagentsSummary(
  overrides: Partial<ReagentsSummary> = {},
): ReagentsSummary {
  return {
    summary: '1 reagent(s), 1 well(s), 100 µL total',
    reagentCount: 1,
    reagents: [
      { kind: 'unknown', totalVolumeUl: 100, wellCount: 1, unit: 'µL', evidenceLinks: [] },
    ],
    evidenceLinks: [],
    ...overrides,
  };
}

function makeBudgetSummary(
  overrides: Partial<BudgetSummary> = {},
): BudgetSummary {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers — issue card builders
// ---------------------------------------------------------------------------

function makeIssueCard(
  overrides: Partial<IssueCard> = {},
): IssueCard {
  return {
    id: `ic-${Date.now().toString(36)}`,
    title: 'Test issue card',
    body: 'This is a test issue card body.',
    origin: 'user',
    evidenceCitations: [],
    suggestedChange: 'User-requested issue: Test issue card. — Consider adding a compiler pass or directive to address this.',
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// =========================================================================
// Fixture: full Protocol IDE compiler feedback loop
// =========================================================================

describe('Protocol IDE — end-to-end compiler feedback loop fixture', () => {
  let store: RecordStore;
  let sessionService: ProtocolIdeSessionService;
  let sourceImportService: ProtocolIdeSourceImportService;
  let feedbackService: ProtocolIdeFeedbackService;
  let projectionService: ProtocolIdeProjectionService;
  let issueCardService: ProtocolIdeIssueCardService;
  let ralphExportService: ProtocolIdeRalphExportService;

  beforeEach(() => {
    store = makeMockStore(null, { success: true });
    sessionService = new ProtocolIdeSessionService(store);
    sourceImportService = new ProtocolIdeSourceImportService(store);
    feedbackService = new ProtocolIdeFeedbackService(store);
    projectionService = new ProtocolIdeProjectionService(store);
    issueCardService = new ProtocolIdeIssueCardService(store);
    ralphExportService = new ProtocolIdeRalphExportService(store);
  });

  // =========================================================================
  // Step 1: Bootstrap session from source PDF + directive
  // =========================================================================

  it('step 1 — bootstraps a session from a PDF URL and directive', async () => {
    const result = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1 of the 96-well plate',
    });

    // bootstrapSession returns ProtocolIdeSessionShellResponse (no success field)
    expect(result.sessionId).toMatch(/^PIS-/);
    expect(result.status).toBe('importing');
    expect(result.sourceSummary).toBe('PDF URL: https://example.com/protocol.pdf');
    expect(result.latestDirectiveText).toBe(
      'Add 10 µL of buffer to well A1 of the 96-well plate',
    );

    // Verify the session was persisted
    const envelope = await store.get(result.sessionId);
    expect(envelope).not.toBeNull();
    expect(envelope!.payload.kind).toBe('protocol-ide-session');
    expect(envelope!.payload.sourceMode).toBe('pdf_url');
    expect(envelope!.payload.status).toBe('importing');
  });

  // =========================================================================
  // Step 2: Import source evidence (mocked)
  // =========================================================================

  it('step 2 — imports source evidence and updates session', async () => {
    // First bootstrap
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });

    const sessionId = bootstrapResult.sessionId;

    // Import source — using the actual SourceImportRequest shape
    const importResult = await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    expect(importResult.sessionId).toBe(sessionId);
    expect(importResult.status).toBe('imported');
    expect(importResult.extractedTextRef).toBeDefined();

    // Verify session was updated with evidence refs
    const envelope = await store.get(sessionId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as Record<string, unknown>;
    expect(payload.status).toBe('imported');
    expect(payload.extractedTextRef).toBeDefined();
    expect(payload.evidenceRefs).toBeDefined();
  });

  // =========================================================================
  // Step 3: Project to review-only event-graph surface
  // =========================================================================

  it('step 3 — projects to the review-only event-graph surface', async () => {
    // Bootstrap + import
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    // Project
    const projectionResult = await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
      overlaySummaryToggles: {
        includeDeckSummary: true,
        includeToolsSummary: true,
        includeReagentsSummary: true,
        includeBudgetSummary: true,
      },
    });

    expect(projectionResult.status).toBe('success');
    expect(projectionResult.eventGraphData.recordId).toMatch(/^graph-/);
    expect(projectionResult.eventGraphData.eventCount).toBeGreaterThan(0);
    expect(projectionResult.projectedProtocolRef).toBeDefined();
    expect(projectionResult.projectedRunRef).toBeDefined();
    expect(projectionResult.evidenceMap).toBeDefined();
    expect(Object.keys(projectionResult.evidenceMap).length).toBeGreaterThan(0);

    // Verify overlay summaries are present
    expect(projectionResult.overlaySummaries.deck).toBeDefined();
    expect(projectionResult.overlaySummaries.tools).toBeDefined();
    expect(projectionResult.overlaySummaries.reagents).toBeDefined();
    expect(projectionResult.overlaySummaries.budget).toBeDefined();

    // Verify session was updated with latest projection data
    const envelope = await store.get(sessionId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as Record<string, unknown>;
    expect(payload.status).toBe('projected');
    expect(payload.latestEventGraphRef).toBeDefined();
    expect(payload.latestDeckSummaryRef).toBeDefined();
    expect(payload.latestToolsSummaryRef).toBeDefined();
    expect(payload.latestReagentsSummaryRef).toBeDefined();
    expect(payload.latestBudgetSummaryRef).toBeDefined();
  });

  // =========================================================================
  // Step 4: Submit feedback with source anchor
  // =========================================================================

  it('step 4 — collects user feedback with source evidence anchor', async () => {
    // Bootstrap + import + project
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    // Submit feedback with source anchor
    const feedbackResult = await feedbackService.submitFeedback(sessionId, {
      body: 'The buffer volume should be 50 µL, not 10 µL',
      sourceAnchor: {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
      severity: 'high',
    });

    expect(feedbackResult.success).toBe(true);
    expect(feedbackResult.feedbackId).toMatch(/^fb-/);
    expect(feedbackResult.rollingSummary.commentCount).toBe(1);
    expect(feedbackResult.rollingSummary.summary).toContain(
      'The buffer volume should be 50 µL, not 10 µL',
    );
    expect(feedbackResult.rollingSummary.summary).toContain(
      '[source:protocol-pdf p.1]',
    );

    // Verify the rolling summary is persisted
    const rollingSummary = await feedbackService.getRollingSummary(sessionId);
    expect(rollingSummary.success).toBe(true);
    expect(rollingSummary.rollingSummary.commentCount).toBe(1);
    expect(rollingSummary.rollingSummary.summary).toContain(
      'The buffer volume should be 50 µL, not 10 µL',
    );

    // Verify comments are retrievable
    const comments = await feedbackService.getFeedbackComments(sessionId);
    expect(comments.length).toBe(1);
    expect(comments[0].body).toBe('The buffer volume should be 50 µL, not 10 µL');
    expect(comments[0].sourceAnchor).toEqual({
      sourceRef: 'protocol-pdf',
      snippet: 'Add 10 µL of buffer to well A1',
      page: 1,
    });
  });

  // =========================================================================
  // Step 5: Rerun with latest-state semantics
  // =========================================================================

  it('step 5 — reruns with latest-state semantics (mutates, does not append)', async () => {
    // Bootstrap + import + project + feedback
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    // First projection
    const projection1 = await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    // Submit feedback
    await feedbackService.submitFeedback(sessionId, {
      body: 'Increase buffer volume to 50 µL',
      sourceAnchor: {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer',
        page: 1,
      },
    });

    // Get rolling summary for the rerun
    const rollingSummary = await feedbackService.getRollingSummary(sessionId);

    // Second projection (rerun) with updated directive and rolling summary
    const projection2 = await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 50 µL of buffer to well A1',
      rollingIssueSummary: rollingSummary.rollingSummary.summary,
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    expect(projection2.status).toBe('success');

    // LATEST-STATE ASSERTION: The session should reflect the second projection,
    // not a history of both projections. The eventGraphCacheKey should be
    // overwritten, not appended.
    const envelope = await store.get(sessionId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as Record<string, unknown>;

    // The latestEventGraphCacheKey should be the second projection's graph
    expect(payload.latestEventGraphCacheKey).toBe(projection2.eventGraphData.recordId);

    // Verify the session status reflects the latest projection
    expect(payload.status).toBe('projected');

    // ASSERTION: No run history array — latest-state semantics means
    // the session is overwritten, not appended to.
    expect(payload.runHistory).toBeUndefined();
    expect(payload.branchSelection).toBeUndefined();
    expect(payload.compareView).toBeUndefined();
    expect(payload.timeline).toBeUndefined();
  });

  // =========================================================================
  // Step 6: Generate issue cards
  // =========================================================================

  it('step 6 — generates issue cards from feedback and diagnostics', async () => {
    // Bootstrap + import + project + feedback
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    // Submit feedback
    await feedbackService.submitFeedback(sessionId, {
      body: 'The buffer volume should be 50 µL, not 10 µL',
      sourceAnchor: {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
    });

    // Add overlay summaries to the session so the issue card service can
    // derive system-origin cards from diagnostics.
    const envelope = await store.get(sessionId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as Record<string, unknown>;
    const updatedPayload: Record<string, unknown> = {
      ...payload,
      latestDeckSummary: makeDeckSummary(),
      latestToolsSummary: makeToolsSummary(),
      latestReagentsSummary: makeReagentsSummary(),
      latestBudgetSummary: makeBudgetSummary(),
    };
    const updatedEnvelope: RecordEnvelope = {
      ...envelope!,
      payload: updatedPayload,
    };
    await store.update({
      envelope: updatedEnvelope,
      message: 'Add overlay summaries for issue card generation',
      skipLint: true,
    });

    // Generate issue cards
    const cardResult = await issueCardService.generateIssueCards(sessionId);

    expect(cardResult.success).toBe(true);
    expect(cardResult.cardCount).toBeGreaterThan(0);

    // ASSERTION: Source evidence citations reach issue cards
    const userCards = cardResult.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBeGreaterThan(0);
    const userCard = userCards[0];
    expect(userCard.evidenceCitations).toEqual([
      {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
    ]);

    // ASSERTION: Deck, tools, reagents, and budget summaries are present
    // (system cards should be generated from diagnostics)
    const systemCards = cardResult.cards.filter((c) => c.origin === 'system');
    expect(systemCards.length).toBeGreaterThan(0);

    // Check that system cards reference the overlay summaries
    const deckCard = systemCards.find((c) => c.title.includes('Deck'));
    expect(deckCard).toBeDefined();
    expect(deckCard!.body).toContain('Slot conflict');

    const toolCard = systemCards.find((c) => c.title.includes('Tool'));
    expect(toolCard).toBeDefined();
    expect(toolCard!.body).toContain('too coarse');

    const reagentCard = systemCards.find((c) => c.title.includes('Reagent'));
    expect(reagentCard).toBeDefined();
    expect(reagentCard!.body).toContain('Unknown reagent kind');

    const budgetCard = systemCards.find((c) => c.title.includes('Budget'));
    expect(budgetCard).toBeDefined();
    expect(budgetCard!.body).toContain('No cost estimate');

    // ASSERTION: Mixed cards when both feedback and diagnostics exist
    const mixedCards = cardResult.cards.filter((c) => c.origin === 'mixed');
    expect(mixedCards.length).toBeGreaterThan(0);
    expect(mixedCards[0].origin).toBe('mixed');
    expect(mixedCards[0].body).toContain('Rolling summary');
    expect(mixedCards[0].body).toContain('System diagnostics');
  });

  // =========================================================================
  // Step 7: Export Ralph-ready spec drafts
  // =========================================================================

  it('step 7 — exports Ralph-ready spec drafts from issue cards', async () => {
    // Bootstrap + import + project + feedback + generate cards
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    await feedbackService.submitFeedback(sessionId, {
      body: 'The buffer volume should be 50 µL, not 10 µL',
      sourceAnchor: {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
    });

    const cardResult = await issueCardService.generateIssueCards(sessionId);
    expect(cardResult.cardCount).toBeGreaterThan(0);

    // Export
    const exportResult = await ralphExportService.exportIssueCards(
      sessionId,
      'https://example.com/protocol.pdf',
      'Add 10 µL of buffer to well A1',
    );

    expect(exportResult.success).toBe(true);
    expect(exportResult.bundle.cardCount).toBe(cardResult.cardCount);
    expect(exportResult.bundle.draftCount).toBe(cardResult.cardCount);
    expect(exportResult.bundle.sessionId).toBe(sessionId);
    expect(exportResult.bundle.exportedAt).toBeDefined();

    // ASSERTION: Each draft carries source context
    for (const draft of exportResult.bundle.drafts) {
      expect(draft.markdown).toContain('Source PDF: https://example.com/protocol.pdf');
      expect(draft.markdown).toContain(`Session: ${sessionId}`);
      expect(draft.markdown).toContain('Latest directive: Add 10 µL of buffer to well A1');
    }

    // ASSERTION: Each draft carries evidence citations
    const userDraft = exportResult.bundle.drafts.find(
      (d) => d.sourceCardId === cardResult.cards.find((c) => c.origin === 'user')?.id,
    );
    if (userDraft) {
      expect(userDraft.evidenceCitations).toEqual([
        {
          sourceRef: 'protocol-pdf',
          snippet: 'Add 10 µL of buffer to well A1',
          page: 1,
        },
      ]);
    }

    // ASSERTION: Each draft is a focused spec, not monolithic
    for (const draft of exportResult.bundle.drafts) {
      expect(draft.markdown).toContain('---');
      expect(draft.markdown).toContain('title:');
      expect(draft.markdown).toContain('priority:');
      expect(draft.markdown).toContain('## Description');
      expect(draft.markdown).toContain('## Requested Compiler Changes');
    }

    // ASSERTION: Sequential priorities
    for (let i = 0; i < exportResult.bundle.drafts.length; i++) {
      expect(exportResult.bundle.drafts[i].priority).toBe(i + 1);
    }
  });

  // =========================================================================
  // Step 8: Clear cards after export
  // =========================================================================

  it('step 8 — clears the issue-card set after export', async () => {
    // Bootstrap + import + project + feedback + generate cards
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });

    await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    await feedbackService.submitFeedback(sessionId, {
      body: 'The buffer volume should be 50 µL, not 10 µL',
      sourceAnchor: {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
    });

    const cardResult = await issueCardService.generateIssueCards(sessionId);
    expect(cardResult.cardCount).toBeGreaterThan(0);

    // Export
    const exportResult = await ralphExportService.exportIssueCards(
      sessionId,
      'https://example.com/protocol.pdf',
      'Add 10 µL of buffer to well A1',
    );

    // ASSERTION: The cleared cards are returned
    expect(exportResult.clearedCards.length).toBe(cardResult.cardCount);

    // ASSERTION: The session's issue-card set is now empty
    const envelope = await store.get(sessionId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as Record<string, unknown>;
    expect(payload.issueCards).toEqual([]);

    // ASSERTION: Export metadata is retained
    expect(payload.lastExportAt).toBeDefined();
    expect(payload.lastExportBundleRef).toBeDefined();
    expect(payload.lastExportBundleRef!.kind).toBe('record');
    expect(payload.lastExportBundleRef!.type).toBe('ralph-export-bundle');

    // ASSERTION: Cannot export again (no cards)
    await expect(
      ralphExportService.exportIssueCards(sessionId),
    ).rejects.toThrow(`No issue cards to export for session '${sessionId}'`);

    // ASSERTION: canExport returns false after clearing
    const canExportResult = await ralphExportService.canExport(sessionId);
    expect(canExportResult.success).toBe(true);
    expect(canExportResult.canExport).toBe(false);
    expect(canExportResult.cardCount).toBe(0);
  });

  // =========================================================================
  // Full workflow: all steps in sequence
  // =========================================================================

  it('full workflow — end-to-end from source PDF to cleared export', async () => {
    // Step 1: Bootstrap
    const bootstrapResult = await sessionService.bootstrapSession({
      source: {
        sourceKind: 'pasted_url',
        url: 'https://example.com/protocol.pdf',
      },
      directiveText: 'Add 10 µL of buffer to well A1',
    });
    const sessionId = bootstrapResult.sessionId;

    // Step 2: Import source evidence
    const importResult = await sourceImportService.importSource({
      sessionId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    });
    expect(importResult.sessionId).toBe(sessionId);
    expect(importResult.status).toBe('imported');

    // Step 3: Project to event-graph surface
    const projectionResult = await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
      overlaySummaryToggles: {
        includeDeckSummary: true,
        includeToolsSummary: true,
        includeReagentsSummary: true,
        includeBudgetSummary: true,
      },
    });
    expect(projectionResult.status).toBe('success');
    expect(projectionResult.overlaySummaries.deck).toBeDefined();
    expect(projectionResult.overlaySummaries.tools).toBeDefined();
    expect(projectionResult.overlaySummaries.reagents).toBeDefined();
    expect(projectionResult.overlaySummaries.budget).toBeDefined();

    // Step 4: Submit feedback
    const feedbackResult = await feedbackService.submitFeedback(sessionId, {
      body: 'The buffer volume should be 50 µL, not 10 µL',
      sourceAnchor: {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
      severity: 'high',
    });
    expect(feedbackResult.success).toBe(true);
    expect(feedbackResult.rollingSummary.commentCount).toBe(1);

    // Step 5: Rerun with latest-state semantics
    const rollingSummary = await feedbackService.getRollingSummary(sessionId);
    const rerunResult = await projectionService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 50 µL of buffer to well A1',
      rollingIssueSummary: rollingSummary.rollingSummary.summary,
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });
    expect(rerunResult.status).toBe('success');

    // Latest-state assertion: session reflects the rerun, not a history
    const envelope = await store.get(sessionId);
    const payload = envelope!.payload as Record<string, unknown>;
    expect(payload.latestEventGraphCacheKey).toBe(rerunResult.eventGraphData.recordId);
    expect(payload.runHistory).toBeUndefined();

    // Add overlay summaries to the session so the issue card service can
    // derive system-origin cards from diagnostics.
    const updatedPayload: Record<string, unknown> = {
      ...payload,
      latestDeckSummary: makeDeckSummary(),
      latestToolsSummary: makeToolsSummary(),
      latestReagentsSummary: makeReagentsSummary(),
      latestBudgetSummary: makeBudgetSummary(),
    };
    const updatedEnvelope: RecordEnvelope = {
      ...envelope!,
      payload: updatedPayload,
    };
    await store.update({
      envelope: updatedEnvelope,
      message: 'Add overlay summaries for issue card generation',
      skipLint: true,
    });

    // Step 6: Generate issue cards
    const cardResult = await issueCardService.generateIssueCards(sessionId);
    expect(cardResult.cardCount).toBeGreaterThan(0);

    // Evidence citations reach cards
    const userCards = cardResult.cards.filter((c) => c.origin === 'user');
    expect(userCards.length).toBeGreaterThan(0);
    expect(userCards[0].evidenceCitations).toEqual([
      {
        sourceRef: 'protocol-pdf',
        snippet: 'Add 10 µL of buffer to well A1',
        page: 1,
      },
    ]);

    // Step 7: Export Ralph-ready drafts
    const exportResult = await ralphExportService.exportIssueCards(
      sessionId,
      'https://example.com/protocol.pdf',
      'Add 50 µL of buffer to well A1',
    );
    expect(exportResult.success).toBe(true);
    expect(exportResult.bundle.draftCount).toBe(cardResult.cardCount);

    // Step 8: Cards are cleared after export
    const clearedEnvelope = await store.get(sessionId);
    const clearedPayload = clearedEnvelope!.payload as Record<string, unknown>;
    expect(clearedPayload.issueCards).toEqual([]);
    expect(clearedPayload.lastExportAt).toBeDefined();

    // Cannot export again
    await expect(
      ralphExportService.exportIssueCards(sessionId),
    ).rejects.toThrow(`No issue cards to export for session '${sessionId}'`);
  });

  // =========================================================================
  // Overlay summary assertions
  // =========================================================================

  it('overlay summaries — deck, tools, reagents, budget are all present', async () => {
    const envelope = makeSessionEnvelope('PIS-001', {
      latestDeckSummary: makeDeckSummary(),
      latestToolsSummary: makeToolsSummary(),
      latestReagentsSummary: makeReagentsSummary(),
      latestBudgetSummary: makeBudgetSummary(),
    });
    const store = makeMockStore(envelope, { success: true });
    const service = new ProtocolIdeIssueCardService(store);

    const result = await service.generateIssueCards('PIS-001');

    // Deck summary → system card
    const deckCards = result.cards.filter((c) => c.body.includes('Slot conflict'));
    expect(deckCards.length).toBeGreaterThan(0);

    // Tools summary → system card
    const toolCards = result.cards.filter((c) => c.body.includes('too coarse'));
    expect(toolCards.length).toBeGreaterThan(0);

    // Reagents summary → system card
    const reagentCards = result.cards.filter((c) => c.body.includes('Unknown reagent kind'));
    expect(reagentCards.length).toBeGreaterThan(0);

    // Budget summary → system card
    const budgetCards = result.cards.filter((c) => c.body.includes('No cost estimate'));
    expect(budgetCards.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // Latest-state semantics — no history accumulation
  // =========================================================================

  it('latest-state semantics — reruns overwrite, not append', async () => {
    const sessionId = 'PIS-001';

    // First projection
    const envelope1 = makeSessionEnvelope(sessionId, {
      status: 'projected',
      latestEventGraphCacheKey: 'graph-first',
      latestDirectiveText: 'Add 10 µL of buffer to well A1',
    });
    const store = makeMockStore(envelope1, { success: true });
    const projService = new ProtocolIdeProjectionService(store);

    const result1 = await projService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 10 µL of buffer to well A1',
      rollingIssueSummary: '',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    // Second projection (rerun)
    const result2 = await projService.executeProjection({
      sessionRef: sessionId,
      directiveText: 'Add 50 µL of buffer to well A1',
      rollingIssueSummary: 'Previous feedback: increase volume',
      sourceRefs: [
        {
          recordId: 'extracted-text-001',
          label: 'Extracted protocol text',
          kind: 'ingestion-artifact',
        },
      ],
    });

    // Verify the session reflects the second projection only
    const finalEnvelope = await store.get(sessionId);
    const finalPayload = finalEnvelope!.payload as Record<string, unknown>;

    // The cache key should be the second projection's graph
    expect(finalPayload.latestEventGraphCacheKey).toBe(result2.eventGraphData.recordId);

    // No history arrays should exist — latest-state semantics means
    // the session is overwritten, not appended to.
    expect(finalPayload.runHistory).toBeUndefined();
    expect(finalPayload.branchSelection).toBeUndefined();
    expect(finalPayload.compareView).toBeUndefined();
    expect(finalPayload.timeline).toBeUndefined();
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  it('error handling — throws when session not found at any step', async () => {
    const brokenStore = makeMockStore(null, { success: true });
    const brokenSessionService = new ProtocolIdeSessionService(brokenStore);
    const brokenImportService = new ProtocolIdeSourceImportService(brokenStore);
    const brokenFeedbackService = new ProtocolIdeFeedbackService(brokenStore);
    const brokenProjectionService = new ProtocolIdeProjectionService(brokenStore);
    const brokenIssueCardService = new ProtocolIdeIssueCardService(brokenStore);
    const brokenRalphExportService = new ProtocolIdeRalphExportService(brokenStore);

    // Session not found for import
    await expect(
      brokenImportService.importSource({
        sessionId: 'PIS-nonexistent',
        sourceKind: 'pasted_url',
        pastedUrl: 'https://example.com/protocol.pdf',
      }),
    ).rejects.toThrow('Session not found: PIS-nonexistent');

    // Session not found for feedback
    await expect(
      brokenFeedbackService.submitFeedback('PIS-nonexistent', { body: 'test' }),
    ).rejects.toThrow("Session 'PIS-nonexistent' not found");

    // Session not found for projection (returns failed response, not throw)
    const projResult = await brokenProjectionService.executeProjection({
      sessionRef: 'PIS-nonexistent',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
    });
    expect(projResult.status).toBe('failed');

    // Session not found for issue cards
    await expect(
      brokenIssueCardService.generateIssueCards('PIS-nonexistent'),
    ).rejects.toThrow("Session 'PIS-nonexistent' not found");

    // Session not found for export
    await expect(
      brokenRalphExportService.exportIssueCards('PIS-nonexistent'),
    ).rejects.toThrow("Session 'PIS-nonexistent' not found");
  });
});
