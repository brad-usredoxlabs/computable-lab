/**
 * Tests for OpenAICompatibleExtractor.
 * 
 * Spec: spec-055-extractor-adapter-interface-and-qwen-impl
 */

import { describe, it, expect, vi } from 'vitest';
import { OpenAICompatibleExtractor } from './OpenAICompatibleExtractor.js';
import type { ExtractorProfileConfig } from '../config/types.js';

describe('OpenAICompatibleExtractor', () => {
  describe('disabled config', () => {
    it('should return empty candidates and extractor_disabled warning when enabled is false', async () => {
      const config: ExtractorProfileConfig = {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const extractor = new OpenAICompatibleExtractor({ config });
      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        code: 'extractor_disabled',
        message: 'extractor backend disabled in config'
      });
    });
  });

  describe('successful extraction', () => {
    it('should parse well-formed JSON response with multiple candidates', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      target_kind: 'material-spec',
                      draft: { name: 'H2O2', concentration: '3%' },
                      confidence: 0.95
                    },
                    {
                      target_kind: 'event',
                      draft: { verb: 'add', material: 'H2O2' },
                      confidence: 0.87
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Add 3% H2O2 solution' });

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]).toMatchObject({
        target_kind: 'material-spec',
        draft: { name: 'H2O2', concentration: '3%' },
        confidence: 0.95
      });
      expect(result.candidates[1]).toMatchObject({
        target_kind: 'event',
        draft: { verb: 'add', material: 'H2O2' },
        confidence: 0.87
      });
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('HTTP errors', () => {
    it('should return extractor_http_error diagnostic on HTTP 500', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'error',
        code: 'extractor_http_error',
        message: 'HTTP 500',
        details: 'Internal Server Error'
      });
    });

    it('should return extractor_http_error diagnostic on HTTP 401', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        apiKey: 'invalid-key',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: false,
        status: 401,
        text: async () => '{"error": "Unauthorized"}'
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'error',
        code: 'extractor_http_error',
        message: 'HTTP 401',
        details: '{"error": "Unauthorized"}'
      });
    });
  });

  describe('parse errors', () => {
    it('should return extractor_parse_error diagnostic on non-JSON response body', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => 'This is not JSON at all'
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'error',
        code: 'extractor_parse_error',
        message: expect.stringContaining('Failed to parse extractor response as JSON')
      });
    });

    it('should return extractor_parse_error diagnostic when content is not valid JSON', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: 'This is not JSON'
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'error',
        code: 'extractor_parse_error',
        message: expect.stringContaining('Failed to parse extractor content as JSON')
      });
    });
  });

  describe('partially malformed candidates', () => {
    it('should return valid candidates and warning diagnostics for malformed ones', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      target_kind: 'material-spec',
                      draft: { name: 'H2O2' },
                      confidence: 0.95
                    },
                    {
                      target_kind: 'event',
                      draft: { verb: 'add' },
                      // missing confidence
                    },
                    {
                      target_kind: 'protocol',
                      draft: { name: 'test' },
                      confidence: 0.75
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]).toMatchObject({
        target_kind: 'material-spec',
        confidence: 0.95
      });
      expect(result.candidates[1]).toMatchObject({
        target_kind: 'protocol',
        confidence: 0.75
      });
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        code: 'candidate_malformed',
        message: expect.stringContaining('confidence')
      });
    });

    it('should validate ambiguity_spans structure', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      target_kind: 'material-spec',
                      draft: { name: 'H2O2' },
                      confidence: 0.95,
                      ambiguity_spans: [
                        {
                          path: '$.name',
                          reason: 'material name matched 3 records'
                        }
                      ]
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        target_kind: 'material-spec',
        confidence: 0.95,
        ambiguity_spans: [
          {
            path: '$.name',
            reason: 'material name matched 3 records'
          }
        ]
      });
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('authentication', () => {
    it('should include Authorization header when apiKey is set', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        apiKey: 'test-api-key-123',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      let capturedHeaders: Record<string, string> = {};

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      target_kind: 'material-spec',
                      draft: { name: 'H2O2' },
                      confidence: 0.95
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async (url, options) => {
          capturedHeaders = (options?.headers as Record<string, string>) || {};
          return mockResponse as unknown as Response;
        }
      });

      await extractor.extract({ text: 'Some text' });

      expect(capturedHeaders['Authorization']).toBe('Bearer test-api-key-123');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('should not include Authorization header when apiKey is not set', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      let capturedHeaders: Record<string, string> = {};

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ candidates: [] })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async (url, options) => {
          capturedHeaders = (options?.headers as Record<string, string>) || {};
          return mockResponse as unknown as Response;
        }
      });

      await extractor.extract({ text: 'Some text' });

      expect(capturedHeaders['Authorization']).toBeUndefined();
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });
  });

  describe('request body', () => {
    it('should send correct request body structure', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.7,
        max_tokens: 2048
      };

      let capturedBody: unknown;

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async (url, options) => {
          capturedBody = JSON.parse((options?.body as string) || '{}');
          return mockResponse as unknown as Response;
        }
      });

      await extractor.extract({ text: 'Test input' });

      expect(capturedBody).toMatchObject({
        model: 'qwen3.5-9b',
        temperature: 0.7,
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      });
      expect(capturedBody.messages).toHaveLength(2);
      expect(capturedBody.messages[0].role).toBe('system');
      expect(capturedBody.messages[1].role).toBe('user');
      expect(capturedBody.messages[1].content).toBe('Test input');
    });

    it('should include hint in user message when provided', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      let capturedUserMessage: string;

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async (url, options) => {
          const body = JSON.parse((options?.body as string) || '{}');
          capturedUserMessage = body.messages[1].content;
          return mockResponse as unknown as Response;
        }
      });

      await extractor.extract({
        text: 'Test input',
        hint: {
          target_kinds: ['material-spec', 'event']
        }
      });

      expect(capturedUserMessage).toContain('Hint:');
      expect(capturedUserMessage).toContain('target_kinds');
      expect(capturedUserMessage).toContain('["material-spec","event"]');
    });
  });

  describe('validation edge cases', () => {
    it('should reject candidate with confidence out of range', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      target_kind: 'material-spec',
                      draft: { name: 'H2O2' },
                      confidence: 1.5  // out of range
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        code: 'candidate_malformed',
        message: expect.stringContaining('confidence out of range')
      });
    });

    it('should reject candidate with missing target_kind', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      draft: { name: 'H2O2' },
                      confidence: 0.95
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        code: 'candidate_malformed',
        message: expect.stringContaining('target_kind')
      });
    });

    it('should reject candidate with non-object draft', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      target_kind: 'material-spec',
                      draft: 'not an object',
                      confidence: 0.95
                    }
                  ]
                })
              }
            }
          ]
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        code: 'candidate_malformed',
        message: expect.stringContaining('draft object')
      });
    });
  });

  describe('network errors', () => {
    it('should return extractor_http_error diagnostic on network failure', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => {
          throw new Error('Network timeout');
        }
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'error',
        code: 'extractor_http_error',
        message: expect.stringContaining('Network timeout')
      });
    });
  });

  describe('empty responses', () => {
    it('should handle empty choices array gracefully', async () => {
      const config: ExtractorProfileConfig = {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:8889/v1',
        model: 'qwen3.5-9b',
        temperature: 0.1,
        max_tokens: 4096
      };

      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: []
        })
      };

      const extractor = new OpenAICompatibleExtractor({
        config,
        fetchImpl: async () => mockResponse as unknown as Response
      });

      const result = await extractor.extract({ text: 'Some text' });

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('validation-repair (spec-027)', () => {
    it('appends prev_validation_error block to the user message on retry', async () => {
      let capturedBody: { messages: Array<{ role: string; content: string }> } | null = null;
      const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse((init?.body as string) ?? '{}');
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      const extractor = new OpenAICompatibleExtractor({
        config: {
          enabled: true,
          provider: 'openai-compatible',
          baseUrl: 'http://x',
          model: 'm',
          temperature: 0,
          max_tokens: 100,
        } as ExtractorProfileConfig,
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });

      await extractor.extract({
        text: 'sample input',
        hint: { prev_validation_error: 'Expected number, got string at .candidates[0].confidence' },
      });

      const userMsg = capturedBody!.messages.find((m) => m.role === 'user')!.content;
      expect(userMsg).toContain('Your previous response failed schema validation');
      expect(userMsg).toContain('Expected number, got string');
    });

    it('surfaces rawResponse in candidate_malformed diagnostic details', async () => {
      const rawText = JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ candidates: [{ target_kind: 'x' /* missing draft */ }] }) } }],
      });
      const fakeFetch = vi.fn(
        async () => new Response(rawText, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      const extractor = new OpenAICompatibleExtractor({
        config: {
          enabled: true,
          provider: 'openai-compatible',
          baseUrl: 'http://x',
          model: 'm',
          temperature: 0,
          max_tokens: 100,
        } as ExtractorProfileConfig,
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });

      const result = await extractor.extract({ text: 'sample' });
      const malformed = result.diagnostics.find((d) => d.code === 'candidate_malformed');
      expect(malformed).toBeDefined();
      const details = malformed!.details as Record<string, unknown> | undefined;
      expect(typeof details?.rawResponse).toBe('string');
      expect((details!.rawResponse as string).length).toBeGreaterThan(0);
    });
  });
});
