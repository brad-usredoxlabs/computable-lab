/**
 * VerbActionMapHandlers tests — happy path and 404.
 */

import { describe, it, expect } from 'vitest';
import { createVerbActionMapHandlers } from './VerbActionMapHandlers.js';
import { getVerbActionMap } from '../../registry/VerbActionMapRegistry.js';

describe('VerbActionMapHandlers', () => {
  const registry = getVerbActionMap();
  const handlers = createVerbActionMapHandlers(registry);

  it('returns mapping for known verb "incubate"', async () => {
    const mockRequest = {
      query: { verb: 'incubate' },
    } as any;
    const mockReply = {
      status: (code: number) => mockReply,
      send: (body: unknown) => body,
    } as any;

    const result = await handlers.getVerbActionMapping(mockRequest, mockReply);
    expect(result).toHaveProperty('success', true);
    expect((result as any).mapping.verb).toBe('incubate');
    expect((result as any).mapping.notes).toBeDefined();
  });

  it('returns mapping for known verb "create_container"', async () => {
    const mockRequest = {
      query: { verb: 'create_container' },
    } as any;
    const mockReply = {
      status: (code: number) => mockReply,
      send: (body: unknown) => body,
    } as any;

    const result = await handlers.getVerbActionMapping(mockRequest, mockReply);
    expect(result).toHaveProperty('success', true);
    expect((result as any).mapping.verb).toBe('create_container');
    expect((result as any).mapping.notes).toBeDefined();
  });

  it('returns 404 for unknown verb', async () => {
    const mockRequest = {
      query: { verb: 'nonexistent_verb' },
    } as any;
    const mockReply = {
      status: (code: number) => mockReply,
      send: (body: unknown) => body,
    } as any;

    const result = await handlers.getVerbActionMapping(mockRequest, mockReply);
    expect(result).toHaveProperty('error', 'NOT_FOUND');
  });
});
