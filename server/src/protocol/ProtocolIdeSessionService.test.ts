import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import {
  ProtocolIdeSessionService,
  type ProtocolIdeSessionShellResponse,
} from './ProtocolIdeSessionService.js';
import { validateIntakeRequest } from './ProtocolIdeIntakeContracts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidVendorIntake(): ReturnType<typeof validateIntakeRequest> {
  const input = {
    directiveText: 'extract the DNA extraction protocol and extend it to a 96-well format',
    source: {
      sourceKind: 'vendor_document',
      vendor: 'thermo',
      title: 'DNA Extraction Protocol v2',
      pdfUrl: 'https://example.com/protocol.pdf',
      landingUrl: 'https://example.com/protocol',
      snippet: 'A comprehensive DNA extraction protocol.',
      documentType: 'protocol',
    },
  };
  return validateIntakeRequest(input);
}

function makeValidPastedUrlIntake(): ReturnType<typeof validateIntakeRequest> {
  const input = {
    directiveText: 'extract the protocol from this URL',
    source: {
      sourceKind: 'pasted_url',
      url: 'https://example.com/protocol.pdf',
    },
  };
  return validateIntakeRequest(input);
}

function makeValidUploadedPdfIntake(): ReturnType<typeof validateIntakeRequest> {
  const input = {
    directiveText: 'extract the protocol from this PDF',
    source: {
      sourceKind: 'uploaded_pdf',
      uploadId: 'upload-abc123',
      fileName: 'protocol.pdf',
      mediaType: 'application/pdf',
    },
  };
  return validateIntakeRequest(input);
}

function makeMockStore(
  createResult: { success: boolean; error?: string } = { success: true },
): RecordStore {
  return {
    create: vi.fn().mockResolvedValue(createResult),
    get: vi.fn().mockResolvedValue(null),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

// ---------------------------------------------------------------------------
// bootstrapSession — success cases
// ---------------------------------------------------------------------------

describe('ProtocolIdeSessionService — bootstrapSession', () => {
  it('creates a session from vendor_document source', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const intake = makeValidVendorIntake();
    expect(intake.valid).toBe(true);
    if (!intake.valid) throw new Error('intake should be valid');

    const result = await service.bootstrapSession(intake.request);

    expect(result.sessionId).toMatch(/^PIS-/);
    expect(result.status).toBe('importing');
    expect(result.sourceSummary).toContain('thermo');
    expect(result.sourceSummary).toContain('DNA Extraction Protocol v2');
    expect(result.latestDirectiveText).toBe(
      'extract the DNA extraction protocol and extend it to a 96-well format',
    );
    expect(result.sourceEvidenceRef).toBeNull();
    expect(result.graphReviewRef).toBeNull();
    expect(result.issueCardsRef).toBeNull();

    // Verify store.create was called
    expect(store.create).toHaveBeenCalledTimes(1);
    const call = store.create.mock.calls[0][0];
    expect(call.envelope.kind).toBe('protocol-ide-session');
    expect(call.envelope.payload.sourceMode).toBe('vendor_search');
    expect(call.envelope.payload.status).toBe('importing');
    expect(call.envelope.payload.latestDirectiveText).toBe(
      'extract the DNA extraction protocol and extend it to a 96-well format',
    );
  });

  it('creates a session from pasted_url source', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const intake = makeValidPastedUrlIntake();
    expect(intake.valid).toBe(true);
    if (!intake.valid) throw new Error('intake should be valid');

    const result = await service.bootstrapSession(intake.request);

    expect(result.status).toBe('importing');
    expect(result.sourceSummary).toContain('PDF URL');
    expect(result.sourceSummary).toContain('https://example.com/protocol.pdf');

    const call = store.create.mock.calls[0][0];
    expect(call.envelope.payload.sourceMode).toBe('pdf_url');
  });

  it('creates a session from uploaded_pdf source', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const intake = makeValidUploadedPdfIntake();
    expect(intake.valid).toBe(true);
    if (!intake.valid) throw new Error('intake should be valid');

    const result = await service.bootstrapSession(intake.request);

    expect(result.status).toBe('importing');
    expect(result.sourceSummary).toContain('Uploaded: protocol.pdf');

    const call = store.create.mock.calls[0][0];
    expect(call.envelope.payload.sourceMode).toBe('upload');
  });

  it('returns shell-ready metadata with empty refs', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const intake = makeValidVendorIntake();
    expect(intake.valid).toBe(true);
    if (!intake.valid) throw new Error('intake should be valid');

    const result = await service.bootstrapSession(intake.request);

    expect(result.sourceEvidenceRef).toBeNull();
    expect(result.graphReviewRef).toBeNull();
    expect(result.issueCardsRef).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// bootstrapSession — failure cases
// ---------------------------------------------------------------------------

describe('ProtocolIdeSessionService — bootstrapSession failures', () => {
  it('throws when store.create fails', async () => {
    const store = makeMockStore({
      success: false,
      error: 'duplicate key',
    });
    const service = new ProtocolIdeSessionService(store);
    const intake = makeValidVendorIntake();
    expect(intake.valid).toBe(true);
    if (!intake.valid) throw new Error('intake should be valid');

    await expect(service.bootstrapSession(intake.request)).rejects.toThrow(
      'Failed to persist session',
    );
  });
});

// ---------------------------------------------------------------------------
// getSessionByHint
// ---------------------------------------------------------------------------

describe('ProtocolIdeSessionService — getSessionByHint', () => {
  it('returns null when no hint is provided', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const result = await service.getSessionByHint(undefined);
    expect(result).toBeNull();
  });

  it('returns null when no matching session exists', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const result = await service.getSessionByHint('nonexistent');
    expect(result).toBeNull();
  });

  it('returns the matching session when found', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-matched-001',
      payload: { status: 'importing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeMockStore();
    (store.list as ReturnType<typeof vi.fn>).mockResolvedValue([mockEnvelope]);
    const service = new ProtocolIdeSessionService(store);
    const result = await service.getSessionByHint('PIS-matched');
    expect(result).toEqual(mockEnvelope);
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('ProtocolIdeSessionService — getSession', () => {
  it('returns null when session does not exist', async () => {
    const store = makeMockStore();
    const service = new ProtocolIdeSessionService(store);
    const result = await service.getSession('PIS-nonexistent');
    expect(result).toBeNull();
  });

  it('returns the session when found', async () => {
    const mockEnvelope: RecordEnvelope = {
      kind: 'protocol-ide-session',
      recordId: 'PIS-001',
      payload: { status: 'reviewing' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeMockStore();
    (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnvelope);
    const service = new ProtocolIdeSessionService(store);
    const result = await service.getSession('PIS-001');
    expect(result).toEqual(mockEnvelope);
  });
});
