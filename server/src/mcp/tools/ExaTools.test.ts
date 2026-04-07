import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { registerExaTools } from './exaTools.js';

function createContext(): AppContext {
  return {
    schemaRegistry: {} as AppContext['schemaRegistry'],
    validator: {} as AppContext['validator'],
    lintEngine: {} as AppContext['lintEngine'],
    repoAdapter: {} as AppContext['repoAdapter'],
    store: {} as AppContext['store'],
    indexManager: {} as AppContext['indexManager'],
    uiSpecLoader: {} as AppContext['uiSpecLoader'],
    platformRegistry: {} as AppContext['platformRegistry'],
    appConfig: {
      ...DEFAULT_CONFIG,
      integrations: {
        exa: {
          enabled: true,
          apiKey: 'exa-test-key',
          userLocation: 'US',
          defaultSearchType: 'auto',
          defaultContentMode: 'highlights',
          defaultMaxCharacters: 4000,
        },
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Exa MCP tools', () => {
  it('searches via Exa with server-side API key', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Cayman product',
            url: 'https://www.caymanchem.com/product/10506',
            highlights: ['1.0 mM solution in DMSO'],
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const registry = new ToolRegistry();
    const mcp = new McpServer({ name: 'test', version: '0.0.0' });
    registerExaTools(mcp, createContext(), registry);

    const tool = registry.get('web_search_exa');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      query: 'Cayman Bio-Active Lipid I Screening Library 96 well',
      includeDomains: ['caymanchem.com'],
      numResults: 5,
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.results).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exa.ai/search');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'exa-test-key',
    });
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody).toMatchObject({
      query: 'Cayman Bio-Active Lipid I Screening Library 96 well',
      type: 'auto',
      numResults: 5,
      userLocation: 'US',
      includeDomains: ['caymanchem.com'],
      contents: {
        highlights: {
          maxCharacters: 4000,
        },
      },
    });
  });

  it('fetches known URL contents via Exa', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://example.com/rpmi',
            text: 'RPMI 1640 medium contains glucose and sodium bicarbonate.',
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const registry = new ToolRegistry();
    const mcp = new McpServer({ name: 'test', version: '0.0.0' });
    registerExaTools(mcp, createContext(), registry);

    const tool = registry.get('web_get_contents_exa');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      urls: ['https://example.com/rpmi'],
      contentMode: 'text',
      maxCharacters: 8000,
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.results[0].url).toBe('https://example.com/rpmi');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exa.ai/contents');
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody).toMatchObject({
      urls: ['https://example.com/rpmi'],
      text: {
        maxCharacters: 8000,
      },
    });
  });

  it('returns a useful error when Exa is not configured', async () => {
    const registry = new ToolRegistry();
    const mcp = new McpServer({ name: 'test', version: '0.0.0' });
    const ctx = createContext();
    ctx.appConfig = { ...DEFAULT_CONFIG };
    registerExaTools(mcp, ctx, registry);

    const tool = registry.get('web_search_exa');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ query: 'apigenin' });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Exa is not configured');
  });
});
