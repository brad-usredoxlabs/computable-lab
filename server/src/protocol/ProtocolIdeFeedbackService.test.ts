import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import {
  ProtocolIdeFeedbackService,
  type SubmitFeedbackRequest,
  type FeedbackComment,
  type Anchor,
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
  it('submits a comment with a node anchor', async () => {
    const nodeAnchor: Anchor = {
      kind: 'node',
      semanticKey: 'add_material-001',
      snapshot: { step: 'add', material: 'buffer' },
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'This step should use a different pipette',
      anchors: [nodeAnchor],
    });

    expect(result.success).toBe(true);
    expect(result.feedbackId).toMatch(/^fb-/);
    expect(result.rollingSummary.commentCount).toBe(1);
    expect(result.rollingSummary.summary).toContain('This step should use a different pipette');
    expect(result.rollingSummary.summary).toContain('[add_material-001]');

    // Verify store.update was called
    expect(store.update).toHaveBeenCalledTimes(1);
    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments.length).toBe(1);
    expect(comments[0].anchors).toEqual([nodeAnchor]);
    expect(comments[0].body).toBe('This step should use a different pipette');
  });

  it('submits a comment with a source anchor', async () => {
    const sourceAnchor: Anchor = {
      kind: 'source',
      documentRef: 'vendor-doc-123',
      page: 3,
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'The wash step volume is too low',
      anchors: [sourceAnchor],
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toContain('The wash step volume is too low');
    expect(result.rollingSummary.summary).toContain('[vendor-doc-123:p3]');

    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].anchors).toEqual([sourceAnchor]);
  });

  it('submits a comment with a phase anchor', async () => {
    const phaseAnchor: Anchor = {
      kind: 'phase',
      phaseId: 'wash-phase-001',
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Wash step needs adjustment',
      anchors: [phaseAnchor],
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toContain('[phase:wash-phase-001]');

    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].anchors).toEqual([phaseAnchor]);
  });

  it('submits a comment with both node and source anchors', async () => {
    const nodeAnchor: Anchor = {
      kind: 'node',
      semanticKey: 'wash-step-001',
      snapshot: { step: 'wash' },
    };
    const sourceAnchor: Anchor = {
      kind: 'source',
      documentRef: 'protocol-pdf',
      page: 5,
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Wash step needs adjustment',
      anchors: [nodeAnchor, sourceAnchor],
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toContain('[wash-step-001]');
    expect(result.rollingSummary.summary).toContain('[protocol-pdf:p5]');
  });

  it('submits a comment with severity', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Critical pipette mismatch',
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
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
  it('rejects submission with empty anchors array', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', {
        body: 'This should be in a 96-well plate layout',
        anchors: [],
      }),
    ).rejects.toThrow('Feedback must include at least one anchor');
  });

  it('rejects submission with undefined anchors', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', {
        body: 'This should be in a 96-well plate layout',
      } as unknown as SubmitFeedbackRequest),
    ).rejects.toThrow('Feedback must include at least one anchor');
  });

  it('preserves anchored comments alongside other anchored ones', async () => {
    const nodeAnchor: Anchor = {
      kind: 'node',
      semanticKey: 'node-1',
      snapshot: { data: 'test' },
    };
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    // First comment: anchored
    await service.submitFeedback('PIS-001', {
      body: 'Anchor this',
      anchors: [nodeAnchor],
    });

    // Second comment: also anchored
    const result = await service.submitFeedback('PIS-001', {
      body: 'Another anchored note',
      anchors: [{ kind: 'phase', phaseId: 'wash-phase-001' }],
    });

    expect(result.success).toBe(true);
    expect(result.rollingSummary.commentCount).toBe(2);
    expect(result.rollingSummary.summary).toContain('Anchor this [node-1]');
    expect(result.rollingSummary.summary).toContain('Another anchored note [phase:wash-phase-001]');
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
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
    });
    expect(r1.rollingSummary.commentCount).toBe(1);
    expect(r1.rollingSummary.summary).toBe('First comment [phase:phase-1]');

    // Submit second comment
    const r2 = await service.submitFeedback('PIS-001', {
      body: 'Second comment',
      anchors: [{ kind: 'phase', phaseId: 'phase-2' }],
    });
    expect(r2.rollingSummary.commentCount).toBe(2);
    expect(r2.rollingSummary.summary).toBe(
      'First comment [phase:phase-1]\nSecond comment [phase:phase-2]',
    );

    // Submit third comment
    const r3 = await service.submitFeedback('PIS-001', {
      body: 'Third comment',
      anchors: [{ kind: 'phase', phaseId: 'phase-3' }],
    });
    expect(r3.rollingSummary.commentCount).toBe(3);
    expect(r3.rollingSummary.summary).toBe(
      'First comment [phase:phase-1]\nSecond comment [phase:phase-2]\nThird comment [phase:phase-3]',
    );
  });

  it('updates the rolling summary timestamp on each submission', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const r1 = await service.submitFeedback('PIS-001', {
      body: 'comment 1',
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
    });
    // Advance time by 1ms to ensure different timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1));
    const r2 = await service.submitFeedback('PIS-001', {
      body: 'comment 2',
      anchors: [{ kind: 'phase', phaseId: 'phase-2' }],
    });
    vi.useRealTimers();

    expect(r2.rollingSummary.updatedAt).not.toBe(r1.rollingSummary.updatedAt);
  });

  it('persists the rolling summary in the session envelope', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await service.submitFeedback('PIS-001', {
      body: 'test comment',
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
    });

    const call = store.update.mock.calls[0][0];
    const summary = call.envelope.payload.rollingIssueSummary as {
      summary: string;
      commentCount: number;
      updatedAt: string;
    };
    expect(summary.summary).toBe('test comment [phase:phase-1]');
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
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
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
      service.submitFeedback('PIS-nonexistent', {
        body: 'test',
        anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
      }),
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
      service.submitFeedback('PIS-001', {
        body: 'test',
        anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
      }),
    ).rejects.toThrow('Failed to persist feedback');
  });
});

// ---------------------------------------------------------------------------
// submitFeedback — snapshot auto-population from event graph
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — snapshot auto-population', () => {
  it('populates snapshot from event graph when node anchor omits it', async () => {
    const eventGraphPayload = {
      kind: 'event-graph',
      events: [
        {
          semanticKey: 'add_material-001',
          payload: { step: 'add', material: 'buffer', volume: '10uL' },
        },
      ],
    };
    const envelope = makeSessionEnvelope('PIS-001', {
      latestEventGraphRef: 'graph-001',
    });
    const store = makeMockStore(envelope);
    // Override get to return the event-graph for the ref
    const originalGet = store.get.bind(store);
    (store.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === 'PIS-001') {
        return envelope;
      }
      if (id === 'graph-001') {
        return {
          kind: 'event-graph',
          recordId: 'graph-001',
          payload: eventGraphPayload,
          meta: { createdAt: new Date().toISOString() },
        } as RecordEnvelope;
      }
      return null;
    });

    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Wash volume looks wrong',
      anchors: [
        {
          kind: 'node',
          semanticKey: 'add_material-001',
          // snapshot omitted — service should fill it
        },
      ],
    });

    expect(result.success).toBe(true);
    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    expect(comments[0].anchors).toHaveLength(1);
    const anchor = comments[0].anchors[0] as Anchor;
    expect(anchor.kind).toBe('node');
    expect(anchor.semanticKey).toBe('add_material-001');
    expect(anchor.snapshot).toEqual({ step: 'add', material: 'buffer', volume: '10uL' });
  });

  it('returns error when node anchor semanticKey not found in event graph', async () => {
    const envelope = makeSessionEnvelope('PIS-001', {
      latestEventGraphRef: 'graph-001',
    });
    const store = makeMockStore(envelope);
    (store.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === 'PIS-001') {
        return envelope;
      }
      // Return an event-graph with no matching semanticKey
      return {
        kind: 'event-graph',
        recordId: 'graph-001',
        payload: {
          kind: 'event-graph',
          events: [
            { semanticKey: 'other-key', payload: {} },
          ],
        },
        meta: { createdAt: new Date().toISOString() },
      } as RecordEnvelope;
    });

    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', {
        body: 'Wash volume looks wrong',
        anchors: [
          {
            kind: 'node',
            semanticKey: 'nonexistent-key',
          },
        ],
      }),
    ).rejects.toThrow('no event-graph node found for semanticKey nonexistent-key');
  });

  it('returns error when session has no latestEventGraphRef', async () => {
    const envelope = makeSessionEnvelope('PIS-001');
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    await expect(
      service.submitFeedback('PIS-001', {
        body: 'Wash volume looks wrong',
        anchors: [
          {
            kind: 'node',
            semanticKey: 'some-key',
          },
        ],
      }),
    ).rejects.toThrow('no event-graph node found for semanticKey some-key');
  });

  it('uses caller-supplied snapshot when provided', async () => {
    const eventGraphPayload = {
      kind: 'event-graph',
      events: [
        {
          semanticKey: 'add_material-001',
          payload: { step: 'add', material: 'buffer' },
        },
      ],
    };
    const envelope = makeSessionEnvelope('PIS-001', {
      latestEventGraphRef: 'graph-001',
    });
    const store = makeMockStore(envelope);
    (store.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === 'PIS-001') {
        return envelope;
      }
      return {
        kind: 'event-graph',
        recordId: 'graph-001',
        payload: eventGraphPayload,
        meta: { createdAt: new Date().toISOString() },
      } as RecordEnvelope;
    });

    const service = new ProtocolIdeFeedbackService(store);

    const result = await service.submitFeedback('PIS-001', {
      body: 'Wash volume looks wrong',
      anchors: [
        {
          kind: 'node',
          semanticKey: 'add_material-001',
          snapshot: { step: 'add', material: 'buffer', volume: '20uL' },
        },
      ],
    });

    expect(result.success).toBe(true);
    const call = store.update.mock.calls[0][0];
    const comments = call.envelope.payload.feedbackComments as FeedbackComment[];
    const anchor = comments[0].anchors[0] as Anchor;
    expect(anchor.snapshot).toEqual({ step: 'add', material: 'buffer', volume: '20uL' });
  });
});

// ---------------------------------------------------------------------------
// extractCommentsFromEnvelope — malformed entries
// ---------------------------------------------------------------------------

describe('ProtocolIdeFeedbackService — extractCommentsFromEnvelope', () => {
  it('skips comments without anchors field', async () => {
    const envelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: {
        kind: 'protocol-ide-session',
        status: 'reviewing',
        feedbackComments: [
          {
            id: 'fb-old-001',
            body: 'Old comment without anchors',
            submittedAt: new Date().toISOString(),
          } as unknown as FeedbackComment,
          {
            id: 'fb-new-001',
            body: 'New comment with anchors',
            anchors: [{ kind: 'node', semanticKey: 'key-1', snapshot: {} }],
            submittedAt: new Date().toISOString(),
          } as unknown as FeedbackComment,
        ],
      },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeMockStore(envelope);
    const service = new ProtocolIdeFeedbackService(store);

    const comments = await service.getFeedbackComments('PIS-001');
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe('fb-new-001');
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

    await service.submitFeedback('PIS-001', {
      body: 'test comment',
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
    });
    const result = await service.getRollingSummary('PIS-001');

    expect(result.success).toBe(true);
    expect(result.rollingSummary.summary).toBe('test comment [phase:phase-1]');
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

    await service.submitFeedback('PIS-001', {
      body: 'comment 1',
      anchors: [{ kind: 'phase', phaseId: 'phase-1' }],
    });
    await service.submitFeedback('PIS-001', {
      body: 'comment 2',
      anchors: [{ kind: 'phase', phaseId: 'phase-2' }],
    });

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
