import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import {
  ProtocolIdeFeedbackService,
  type SubmitFeedbackRequest,
  type FeedbackComment,
  type GraphAnchor,
  type SourceAnchor,
} from './ProtocolIdeFeedbackService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(
  getResponse: RecordEnvelope | null = null,
  updateResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  let currentEnvelope: RecordEnvelope | null = getResponse;

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
  sessionId: string,
  extraPayload: Record<string, unknown> = {},
): RecordEnvelope {
  return {
    kind: 'protocol-ide-session',
    recordId: sessionId,
    payload: {
      kind: 'protocol-ide-session',
      status: 'reviewing',
      ...extraPayload,
    },
    meta: { createdAt: new Date().toISOString() },
  } as RecordEnvelope;
}

function makeValidFeedbackRequest(
  overrides: Partial<SubmitFeedbackRequest> = {},
): SubmitFeedbackRequest {
  return {
    body: 'This is a feedback comment',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// submitFeedback — anchored feedback
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — anchored feedback', () => {
  it('submits a comment with a graph anchor', async () => {
    const graphAnchor: GraphAnchor = {
      nodeId: 'add_material-001',
      label: 'Add buffer to A1',
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'This step should use a different pipette',
      graphAnchor,
    });

    expect(result.success).toBe(true);
    expect(result.feedbackId).toMatch(/^fb-/);
    expect(result.rollingSummary.commentCount).toBe(1);
    expect(result.rollingSummary.summary).toContain('This step should use a different pipette');
    expect(result.rollingSummary.summary).toContain('[graph:add_material-001 (Add buffer to A1)]');

    // Verify store.update was called
    expect(store.update).toHaveBeenCalledTimes(1);
    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments.length).toBe(1);
    expect(comments[0].graphAnchor).toEqual(graphAnchor);
    expect(comments[0].body).toBe('This step should use a different pipette');
  });

  it('submits a comment with a source anchor', async () => {
    const sourceAnchor: SourceAnchor = {
      sourceRef: 'vendor-doc-123',
      snippet: 'Use 10uL for the wash step',
      page: 3,
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'The wash step volume is too low',
      sourceAnchor,
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toContain('The wash step volume is too low');
    expect(result.rollingSummary.summary).toContain('[source:vendor-doc-123 p.3]');

    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].sourceAnchor).toEqual(sourceAnchor);
  });

  it('submits a comment with both graph and source anchors', async () => {
    const graphAnchor: GraphAnchor = {
      nodeId: 'wash-step-001',
      label: 'Wash step',
    };
    const sourceAnchor: SourceAnchor = {
      sourceRef: 'protocol-pdf',
      page: 5,
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Wash step needs adjustment',
      graphAnchor,
      sourceAnchor,
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toContain('[graph:wash-step-001 (Wash step)]');
    expect(result.rollingSummary.summary).toContain('[source:protocol-pdf p.5]');
  });

  it('submits a comment with severity', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Critical pipette mismatch',
      severity: 'critical',
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toContain('[critical] Critical pipette mismatch');

    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// submitFeedback — unanchored session-level feedback
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — unanchored session-level feedback', () => {
  it('attaches unanchored comments to the session iteration', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'This should be in a 96-well plate layout',
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.commentCount).toBe(1);
    expect(result.rollingSummary.summary).toBe('This should be in a 96-well plate layout');

    // Verify no anchors in the comment
    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].graphAnchor).toBeUndefined();
    expect(comments[0].sourceAnchor).toBeUndefined();
  });

  it('preserves unanchored comments alongside anchored ones', async () => {
    const graphAnchor: GraphAnchor = { nodeId: 'node-1' };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    // First comment: anchored
    await service.submitFeedback('PIS-001', {
      body: 'Anchor this',
      graphAnchor,
    });

    // Second comment: unanchored
    const result = await service.submitFeedback('PIS-001', {
      body: 'General session note',
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.commentCount).toBe(2);
    expect(result.rollingSummary.summary).toContain('Anchor this [graph:node-1]');
    expect(result.rollingSummary.summary).toContain('General session note');
  });
});

// ---------------------------------------------------------------------------
// submitFeedback — rolling summary updates
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — rolling summary updates', () => {
  it('recomputes the rolling summary after multiple comments', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    // Submit first comment
    const r1 = await service.submitFeedback('PIS-001', {
      body: 'First comment',
    });
    expect(r1.rollingSummary.commentCount).toBe(1);
    expect(r1.rollingSummary.summary).toBe('First comment');

    // Submit second comment
    const r2 = await service.submitFeedback('PIS-001', {
      body: 'Second comment',
    });
    expect(r2.rollingSummary.commentCount).toBe(2);
    expect(r2.rollingSummary.summary).toBe('First comment\nSecond comment');

    // Submit third comment
    const r3 = await service.submitFeedback('PIS-001', {
      body: 'Third comment',
    });
    expect(r3.rollingSummary.commentCount).toBe(3);
    expect(r3.rollingSummary.summary).toBe(
      'First comment\nSecond comment\nThird comment',
    );
  });

  it('updates the rolling summary timestamp on each submission', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const r1 = await service.submitFeedback('PIS-001', { body: 'comment 1' });
    // Advance time by 1ms to ensure different timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1));
    const r2 = await service.submitFeedback('PIS-001', { body: 'comment 2' });
    vi.useRealTimers();

    expect(r2.rollingSummary.updatedAt).not.toBe(r1.rollingSummary.updatedAt);
  });

  it('persists the rolling summary in the session envelope', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await service.submitFeedback('PIS-001', { body: 'test comment' });

    const call = store.update.mock.calls[0][0];
    const summary = call.envelope.payload.rollingIssueSummary as {
      summary: string;
      commentCount: number;
      updatedAt: string;
    };
    expect(summary.summary).toBe('test comment');
    expect(summary.commentCount).toBe(1);
    expect(summary.updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// submitFeedback — validation and error cases
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — validation and errors', () => {
  it('rejects empty body', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', { body: '' }),
    ).rejects.toThrow('Feedback body must be a non-empty string');
  });

  it('rejects whitespace-only body', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', { body: '   ' }),
    ).rejects.toThrow('Feedback body must be a non-empty string');
  });

  it('trims whitespace from body before storing', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: '  trimmed comment  ',
    });

    expect(result.success).toBe(true);
    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].body).toBe('trimmed comment');
  });

  it('throws when session is not found', async () => {
    const store = makeMockStore(null);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-nonexistent', { body: 'test' }),
    ).rejects.toThrow("Session 'PIS-nonexistent' not found");
  });

  it('throws when store.update fails', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope, {
      success: false,
      error: 'database error',
    });
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', { body: 'test' }),
    ).rejects.toThrow('Failed to persist feedback');
  });
});

// ---------------------------------------------------------------------------
// getRollingSummary
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — getRollingSummary', () => {
  it('returns an empty summary when no feedback exists', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.getRollingSummary('PIS-001');

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toBe('');
    expect(result.rollingSummary.commentCount).toBe(0);
  });

  it('returns the rolling summary after feedback is submitted', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await service.submitFeedback('PIS-001', { body: 'test comment' });
    const result = await service.getRollingSummary('PIS-001');

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toBe('test comment');
    expect(result.rollingSummary.commentCount).toBe(1);
  });

  it('throws when session is not found', async () => {
    const store = makeMockStore(null);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(service.getRollingSummary('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });
});

// ---------------------------------------------------------------------------
// getFeedbackComments
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — getFeedbackComments', () => {
  it('returns empty array when no feedback exists', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const comments = await service.getFeedbackComments('PIS-001');
    expect(comments).toEqual([]);
  });

  it('returns all submitted comments', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await service.submitFeedback('PIS-001', { body: 'comment 1' });
    await service.submitFeedback('PIS-001', { body: 'comment 2' });

    const comments = await service.getFeedbackComments('PIS-001');
    expect(comments.length).toBe(2);
    expect(comments[0].body).toBe('comment 1');
    expect(comments[1].body).toBe('comment 2');
  });

  it('throws when session is not found', async () => {
    const store = makeMockStore(null);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(service.getFeedbackComments('PIS-nonexistent')).rejects.toThrow(
      "Session 'PIS-nonexistent' not found",
    );
  });
});
