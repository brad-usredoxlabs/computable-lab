/**
 * Tests that OpenAICompatibleExtractor forwards config.max_tokens to the LLM.
 *
 * Spec: spec-025-settings-override-audit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleExtractor } from './OpenAICompatibleExtractor.js';
import type { ExtractorProfileConfig } from '../config/types.js';

describe('OpenAICompatibleExtractor forwards config.max_tokens', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends config.max_tokens in the request body', async () => {
    let capturedBody: Record<string, unknown> = {};

    const config: ExtractorProfileConfig = {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:8889/v1',
      model: 'qwen3.5-9b',
      temperature: 0.1,
      max_tokens: 4242,
    };

    const mockResponse = {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }],
        }),
    };

    const extractor = new OpenAICompatibleExtractor({
      config,
      fetchImpl: async (url, options) => {
        capturedBody = JSON.parse((options?.body as string) || '{}');
        return mockResponse as unknown as Response;
      },
    });

    await extractor.extract({ text: 'Test input' });

    expect(capturedBody.max_tokens).toBe(4242);
  });

  it('uses the configured max_tokens value, not a hardcoded default', async () => {
    let capturedBody: Record<string, unknown> = {};

    const config: ExtractorProfileConfig = {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:8889/v1',
      model: 'qwen3.5-9b',
      temperature: 0.7,
      max_tokens: 9999,
    };

    const mockResponse = {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }],
        }),
    };

    const extractor = new OpenAICompatibleExtractor({
      config,
      fetchImpl: async (url, options) => {
        capturedBody = JSON.parse((options?.body as string) || '{}');
        return mockResponse as unknown as Response;
      },
    });

    await extractor.extract({ text: 'Test input' });

    expect(capturedBody.max_tokens).toBe(9999);
  });
});
