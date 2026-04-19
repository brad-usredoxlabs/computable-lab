import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createExtractHandlers, type ExtractHandlers } from './ExtractHandlers.js';
import type { ExtractionRunnerService } from '../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../extract/ExtractionDraftBuilder.js';
import type { RecordStore } from '../../store/types.js';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import type { AjvValidator } from '../../validation/AjvValidator.js';

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
