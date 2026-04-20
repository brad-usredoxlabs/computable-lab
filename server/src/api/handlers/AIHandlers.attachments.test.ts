import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createAIHandlers, type AIHandlers } from './AIHandlers.js';
import type { AgentOrchestrator, AgentResult, AgentEvent } from '../../ai/types.js';

describe('AIHandlers - draftEventsStream with attachments', () => {
  it('should pass attachments to orchestrator.run when multipart upload is provided', async () => {
    // Mock orchestrator
    const mockOrchestrator: AgentOrchestrator = {
      run: vi.fn().mockResolvedValue({
        success: true,
        events: [],
      } as AgentResult),
    };

    const handlers: AIHandlers = createAIHandlers(mockOrchestrator);

    // Create mock request with multipart body
    const mockPdfContent = Buffer.from('%PDF-1.4 test pdf content');
    const mockRequest = {
      body: {
        prompt: 'Test prompt with attachment',
        context: {
          labwares: [],
          eventSummary: '',
          vocabPackId: 'general',
          availableVerbs: [],
        },
        attachments: [
          {
            name: 'test-document.pdf',
            mime_type: 'application/pdf',
            content: mockPdfContent,
          },
        ],
      },
      headers: {
        origin: 'http://localhost:5173',
      },
    } as unknown as FastifyRequest<{ Body: { prompt: string; context: unknown; attachments?: unknown[] } }>;

    // Mock reply with SSE streaming
    const mockReply = {
      raw: {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      },
    } as unknown as FastifyReply;

    // Call the handler
    await handlers.draftEventsStream(mockRequest, mockReply);

    // Verify orchestrator was called with attachments
    expect(mockOrchestrator.run).toHaveBeenCalledTimes(1);
    const callArgs = mockOrchestrator.run.mock.calls[0][0];
    expect(callArgs.attachments).toBeDefined();
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments[0].name).toBe('test-document.pdf');
    expect(callArgs.attachments[0].mime_type).toBe('application/pdf');
    expect(callArgs.attachments[0].content).toEqual(mockPdfContent);
  });

  it('should handle multiple attachments', async () => {
    const mockOrchestrator: AgentOrchestrator = {
      run: vi.fn().mockResolvedValue({
        success: true,
        events: [],
      } as AgentResult),
    };

    const handlers: AIHandlers = createAIHandlers(mockOrchestrator);

    const mockPdfContent = Buffer.from('%PDF-1.4 test');
    const mockXlsxContent = Buffer.from('PK test xlsx');

    const mockRequest = {
      body: {
        prompt: 'Test prompt with multiple attachments',
        context: {
          labwares: [],
          eventSummary: '',
          vocabPackId: 'general',
          availableVerbs: [],
        },
        attachments: [
          {
            name: 'protocol.pdf',
            mime_type: 'application/pdf',
            content: mockPdfContent,
          },
          {
            name: 'data.xlsx',
            mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            content: mockXlsxContent,
          },
        ],
      },
      headers: {
        origin: 'http://localhost:5173',
      },
    } as unknown as FastifyRequest<{ Body: { prompt: string; context: unknown; attachments?: unknown[] } }>;

    const mockReply = {
      raw: {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      },
    } as unknown as FastifyReply;

    await handlers.draftEventsStream(mockRequest, mockReply);

    expect(mockOrchestrator.run).toHaveBeenCalledTimes(1);
    const callArgs = mockOrchestrator.run.mock.calls[0][0];
    expect(callArgs.attachments).toBeDefined();
    expect(callArgs.attachments).toHaveLength(2);
    expect(callArgs.attachments[0].name).toBe('protocol.pdf');
    expect(callArgs.attachments[0].mime_type).toBe('application/pdf');
    expect(callArgs.attachments[1].name).toBe('data.xlsx');
    expect(callArgs.attachments[1].mime_type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('should work without attachments (backward compatibility)', async () => {
    const mockOrchestrator: AgentOrchestrator = {
      run: vi.fn().mockResolvedValue({
        success: true,
        events: [],
      } as AgentResult),
    };

    const handlers: AIHandlers = createAIHandlers(mockOrchestrator);

    const mockRequest = {
      body: {
        prompt: 'Test prompt without attachments',
        context: {
          labwares: [],
          eventSummary: '',
          vocabPackId: 'general',
          availableVerbs: [],
        },
      },
      headers: {
        origin: 'http://localhost:5173',
      },
    } as unknown as FastifyRequest<{ Body: { prompt: string; context: unknown; attachments?: unknown[] } }>;

    const mockReply = {
      raw: {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      },
    } as unknown as FastifyReply;

    await handlers.draftEventsStream(mockRequest, mockReply);

    expect(mockOrchestrator.run).toHaveBeenCalledTimes(1);
    const callArgs = mockOrchestrator.run.mock.calls[0][0];
    expect(callArgs.attachments).toBeUndefined();
  });

  it('should pass attachments to draftEvents handler', async () => {
    const mockOrchestrator: AgentOrchestrator = {
      run: vi.fn().mockResolvedValue({
        success: true,
        events: [],
      } as AgentResult),
    };

    const handlers: AIHandlers = createAIHandlers(mockOrchestrator);

    const mockPdfContent = Buffer.from('%PDF-1.4 test');

    const mockRequest = {
      body: {
        prompt: 'Test prompt',
        context: {
          labwares: [],
          eventSummary: '',
          vocabPackId: 'general',
          availableVerbs: [],
        },
        attachments: [
          {
            name: 'test.pdf',
            mime_type: 'application/pdf',
            content: mockPdfContent,
          },
        ],
      },
    } as unknown as FastifyRequest<{ Body: { prompt: string; context: unknown; attachments?: unknown[] } }>;

    const mockReply = {
      status: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    const result = await handlers.draftEvents(mockRequest, mockReply);

    expect(mockOrchestrator.run).toHaveBeenCalledTimes(1);
    const callArgs = mockOrchestrator.run.mock.calls[0][0];
    expect(callArgs.attachments).toBeDefined();
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments[0].name).toBe('test.pdf');
    expect(callArgs.attachments[0].mime_type).toBe('application/pdf');
  });
});
