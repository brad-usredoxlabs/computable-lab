/**
 * Tests for PromptTemplateHandlers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPromptTemplateHandlers } from './PromptTemplateHandlers.js';
import { getPromptTemplateRegistry } from '../../registry/PromptTemplateRegistry.js';

describe('PromptTemplateHandlers', () => {
  let handlers: ReturnType<typeof createPromptTemplateHandlers>;

  beforeEach(() => {
    const registry = getPromptTemplateRegistry();
    registry.reload();
    handlers = createPromptTemplateHandlers(registry);
  });

  it('getPromptTemplate returns the template for a valid id', async () => {
    const mockRequest = {
      params: { id: 'chatbot-compile.precompile.system' },
    } as any;
    const mockReply = {
      status: vi.fn().mockReturnThis(),
    } as any;

    const result = await handlers.getPromptTemplate(mockRequest, mockReply);

    expect(result).toHaveProperty('success', true);
    expect((result as any).id).toBe('chatbot-compile.precompile.system');
    expect((result as any).prompt_kind).toBe('compiler.precompile.system');
    expect((result as any).content_format).toBe('markdown');
    expect((result as any).content).toContain('You are the AI-precompile stage');
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it('getPromptTemplate returns 404 for unknown id', async () => {
    const mockRequest = {
      params: { id: 'nonexistent.template' },
    } as any;
    const mockReply = {
      status: vi.fn().mockReturnThis(),
    } as any;

    const result = await handlers.getPromptTemplate(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(404);
    expect((result as any).error).toBe('NOT_FOUND');
    expect((result as any).message).toContain('nonexistent.template');
  });
});
