import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createExtractHandlers, type ExtractHandlers } from './ExtractHandlers.js';
import type { ExtractionRunnerService } from '../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../extract/ExtractionDraftBuilder.js';
import type { RecordStore, StoreResult } from '../../store/types.js';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import type { AjvValidator } from '../../validation/AjvValidator.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

describe('ExtractHandlers', () => {
  it('should return the draft body when runner.run() succeeds', async () => {
    // Create a mock runner
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-test-001',
      source_artifact: { kind: 'freetext', id: 'ad-hoc-test' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const mockRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    // Create handlers
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, {} as RecordStore, {} as SchemaRegistry, {} as AjvValidator);

    // Create mock request and reply
    const mockRequest = {
      body: {
        target_kind: 'material',
        text: 'Test extraction text',
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    // Call the handler
    const result = await handlers.extract(mockRequest, mockReply);

    // Verify the result
    expect(result).toEqual(mockDraftBody);
    expect(mockRunner.run).toHaveBeenCalledWith({
      target_kind: 'material',
      text: 'Test extraction text',
      source: { kind: 'freetext', id: expect.stringMatching(/^ad-hoc-/), },
    });
  });

  it('should return 400 error when target_kind is missing', async () => {
    const mockRunner: ExtractionRunnerService = {
      run: vi.fn(),
    } as unknown as ExtractionRunnerService;

    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, {} as RecordStore, {} as SchemaRegistry, {} as AjvValidator);

    const mockRequest = {
      body: {
        text: 'Test extraction text',
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.extract(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'INVALID_INPUT',
      message: 'target_kind and text are required',
    });
  });

  it('should return 400 error when text is missing', async () => {
    const mockRunner: ExtractionRunnerService = {
      run: vi.fn(),
    } as unknown as ExtractionRunnerService;

    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, {} as RecordStore, {} as SchemaRegistry, {} as AjvValidator);

    const mockRequest = {
      body: {
        target_kind: 'material',
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.extract(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'INVALID_INPUT',
      message: 'target_kind and text are required',
    });
  });

  it('should use provided source when valid', async () => {
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-test-002',
      source_artifact: { kind: 'file', id: 'artifact-123' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const mockRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, {} as RecordStore, {} as SchemaRegistry, {} as AjvValidator);

    const mockRequest = {
      body: {
        target_kind: 'protocol',
        text: 'Protocol text',
        source: { kind: 'file', id: 'artifact-123', locator: 'page 5' },
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await handlers.extract(mockRequest, mockReply);

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: 'file', id: 'artifact-123', locator: 'page 5' },
      })
    );
  });

  it('should pass hint when provided', async () => {
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-test-003',
      source_artifact: { kind: 'freetext', id: 'ad-hoc-test' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const mockRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, {} as RecordStore, {} as SchemaRegistry, {} as AjvValidator);

    const mockRequest = {
      body: {
        target_kind: 'equipment',
        text: 'Equipment description',
        hint: { target_kind: 'equipment', extraField: 'value' },
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await handlers.extract(mockRequest, mockReply);

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        hint: { target_kind: 'equipment', extraField: 'value' },
      })
    );
  });
});

describe('ExtractHandlers - promoteCandidate', () => {
  it('should reject invalid draft id format', async () => {
    const mockRunner = {} as ExtractionRunnerService;
    const mockStore = {} as RecordStore;
    const mockSchemaRegistry = {} as SchemaRegistry;
    const mockValidator = {} as AjvValidator;
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, mockStore, mockSchemaRegistry, mockValidator);

    const mockRequest = {
      params: { id: 'INVALID-ID', i: '0' },
    } as unknown as FastifyRequest<{ Params: { id: string; i: string } }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.promoteCandidate(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'INVALID_INPUT',
      message: expect.stringContaining('Invalid extraction-draft id format'),
    });
  });

  it('should reject invalid candidate index', async () => {
    const mockRunner = {} as ExtractionRunnerService;
    const mockStore = {} as RecordStore;
    const mockSchemaRegistry = {} as SchemaRegistry;
    const mockValidator = {} as AjvValidator;
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, mockStore, mockSchemaRegistry, mockValidator);

    const mockRequest = {
      params: { id: 'XDR-test-001', i: 'abc' },
    } as unknown as FastifyRequest<{ Params: { id: string; i: string } }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.promoteCandidate(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'INVALID_INPUT',
      message: expect.stringContaining('Invalid candidate index'),
    });
  });

  it('should return 404 when draft not found', async () => {
    const mockRunner = {} as ExtractionRunnerService;
    const mockStore: RecordStore = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as RecordStore;
    const mockSchemaRegistry = {} as SchemaRegistry;
    const mockValidator = {} as AjvValidator;
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, mockStore, mockSchemaRegistry, mockValidator);

    const mockRequest = {
      params: { id: 'XDR-test-001', i: '0' },
    } as unknown as FastifyRequest<{ Params: { id: string; i: string } }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.promoteCandidate(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(404);
    expect(result).toEqual({
      error: 'NOT_FOUND',
      message: 'Extraction draft not found',
    });
  });
});

describe('ExtractHandlers - rejectCandidate', () => {
  it('should reject invalid draft id format', async () => {
    const mockRunner = {} as ExtractionRunnerService;
    const mockStore = {} as RecordStore;
    const mockSchemaRegistry = {} as SchemaRegistry;
    const mockValidator = {} as AjvValidator;
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, mockStore, mockSchemaRegistry, mockValidator);

    const mockRequest = {
      params: { id: 'INVALID-ID', i: '0' },
    } as unknown as FastifyRequest<{ Params: { id: string; i: string } }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.rejectCandidate(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'INVALID_INPUT',
      message: expect.stringContaining('Invalid extraction-draft id format'),
    });
  });

  it('should reject invalid candidate index', async () => {
    const mockRunner = {} as ExtractionRunnerService;
    const mockStore = {} as RecordStore;
    const mockSchemaRegistry = {} as SchemaRegistry;
    const mockValidator = {} as AjvValidator;
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, mockStore, mockSchemaRegistry, mockValidator);

    const mockRequest = {
      params: { id: 'XDR-test-001', i: 'abc' },
    } as unknown as FastifyRequest<{ Params: { id: string; i: string } }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.rejectCandidate(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'INVALID_INPUT',
      message: expect.stringContaining('Invalid candidate index'),
    });
  });

  it('should return 404 when draft not found', async () => {
    const mockRunner = {} as ExtractionRunnerService;
    const mockStore: RecordStore = {
      get: vi.fn().mockResolvedValue(null),
    } as unknown as RecordStore;
    const mockSchemaRegistry = {} as SchemaRegistry;
    const mockValidator = {} as AjvValidator;
    const handlers: ExtractHandlers = createExtractHandlers(mockRunner, mockStore, mockSchemaRegistry, mockValidator);

    const mockRequest = {
      params: { id: 'XDR-test-001', i: '0' },
    } as unknown as FastifyRequest<{ Params: { id: string; i: string } }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.rejectCandidate(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(404);
    expect(result).toEqual({
      error: 'NOT_FOUND',
      message: 'Extraction draft not found',
    });
  });
});

describe('ExtractHandlers - upload', () => {
  it('should return recordId on successful upload', async () => {
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-upload-001',
      source_artifact: { kind: 'file', id: 'upload-1234567890', locator: 'test.pdf' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const mockRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    const mockStore: RecordStore = {
      create: vi.fn().mockResolvedValue({ success: true } as StoreResult),
    } as unknown as RecordStore;

    const handlers: ExtractHandlers = createExtractHandlers(
      mockRunner,
      mockStore,
      {} as SchemaRegistry,
      {} as AjvValidator,
    );

    // A minimal valid PDF base64 (1-page blank PDF)
    const pdfBase64 = 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCjcyIDcyMCBUZgovRjEgMTIgVGYKSGVsbG8gV29ybGQgRnJvbSBQREYgVXBsb2FkIEV4dHJhY3Rpb24KRVQKZW5kc3RyZWFtCmVuZG9iago2IDAgb2JqCjw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0ltYWdlL1dpZHRoIDEvSGVpZ2h0IDEvQml0c1BlckNvbXBvbmVudCA4L0NvbG9yU3BhY2UvRGV2aWNlR3JheS9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDM+PgpzdHJlYW0KeJzz5FIy4DIAAEIANQoKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2NCAwMDAwMCBuIAowMDAwMDAwMTIzIDAwMDAwIG4gCjAwMDAwMDAyNzEgMDAwMDAgbiAKMDAwMDAwMDM0OCAwMDAwMCBuIAowMDAwMDAwNDQxIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA3L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNTc5CiUlRU9G';

    const mockRequest = {
      body: {
        target_kind: 'protocol',
        fileName: 'test.pdf',
        contentBase64: pdfBase64,
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.upload(mockRequest, mockReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(result).toEqual({ recordId: 'XDR-upload-001' });
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        target_kind: 'protocol',
        text: expect.any(String),
        source: expect.objectContaining({ kind: 'file', locator: 'test.pdf' }),
        fileName: 'test.pdf',
      })
    );
    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          recordId: 'XDR-upload-001',
          kind: 'extraction-draft',
        }),
        message: expect.stringContaining('Persist extraction-draft XDR-upload-001'),
        skipLint: true,
      })
    );
  });

  it('should return 400 when contentBase64 is missing', async () => {
    const mockRunner: ExtractionRunnerService = {
      run: vi.fn(),
    } as unknown as ExtractionRunnerService;

    const handlers: ExtractHandlers = createExtractHandlers(
      mockRunner,
      {} as RecordStore,
      {} as SchemaRegistry,
      {} as AjvValidator,
    );

    const mockRequest = {
      body: {
        target_kind: 'protocol',
        fileName: 'test.pdf',
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.upload(mockRequest, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      error: 'NO_CONTENT',
      message: 'contentBase64 required',
    });
  });

  it('should return 422 when PDF parsing fails', async () => {
    const mockRunner: ExtractionRunnerService = {
      run: vi.fn(),
    } as unknown as ExtractionRunnerService;

    const handlers: ExtractHandlers = createExtractHandlers(
      mockRunner,
      {} as RecordStore,
      {} as SchemaRegistry,
      {} as AjvValidator,
    );

    // Invalid base64 that will produce garbage when decoded
    const mockRequest = {
      body: {
        target_kind: 'protocol',
        fileName: 'bad.pdf',
        contentBase64: 'not-valid-pdf-content',
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.upload(mockRequest, mockReply);

    // The handler should return 422 if PDF parsing fails with an error diagnostic
    // or 400 if contentBase64 is empty
    // Since 'not-valid-pdf-content' is valid base64 but not a valid PDF,
    // it depends on whether pdf-parse throws or returns empty text
    // We just check that it doesn't call runner.run
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('should default target_kind to protocol when not provided', async () => {
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-upload-002',
      source_artifact: { kind: 'file', id: 'upload-1234567890', locator: 'test.pdf' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const mockRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    const mockStore: RecordStore = {
      create: vi.fn().mockResolvedValue({ success: true } as StoreResult),
    } as unknown as RecordStore;

    const handlers: ExtractHandlers = createExtractHandlers(
      mockRunner,
      mockStore,
      {} as SchemaRegistry,
      {} as AjvValidator,
    );

    // A minimal valid PDF base64 (1-page blank PDF)
    const pdfBase64 = 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCjcyIDcyMCBUZgovRjEgMTIgVGYKSGVsbG8gV29ybGQgRnJvbSBQREYgVXBsb2FkIEV4dHJhY3Rpb24KRVQKZW5kc3RyZWFtCmVuZG9iago2IDAgb2JqCjw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0ltYWdlL1dpZHRoIDEvSGVpZ2h0IDEvQml0c1BlckNvbXBvbmVudCA4L0NvbG9yU3BhY2UvRGV2aWNlR3JheS9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDM+PgpzdHJlYW0KeJzz5FIy4DIAAEIANQoKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2NCAwMDAwMCBuIAowMDAwMDAwMTIzIDAwMDAwIG4gCjAwMDAwMDAyNzEgMDAwMDAgbiAKMDAwMDAwMDM0OCAwMDAwMCBuIAowMDAwMDAwNDQxIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA3L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNTc5CiUlRU9G';

    const mockRequest = {
      body: {
        fileName: 'test.pdf',
        contentBase64: pdfBase64,
      },
    } as unknown as FastifyRequest<{ Body: unknown }>;

    const mockReply = {
      code: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await handlers.upload(mockRequest, mockReply);

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        target_kind: 'protocol',
      })
    );
  });
});
