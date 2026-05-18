import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { registerVendorPdfTools } from './vendorPdfTools.js';

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
}

function createContext(workspaceRoot: string): AppContext {
  return {
    schemaRegistry: {} as AppContext['schemaRegistry'],
    validator: {} as AppContext['validator'],
    lintEngine: {} as AppContext['lintEngine'],
    repoAdapter: {} as AppContext['repoAdapter'],
    store: {} as AppContext['store'],
    indexManager: {} as AppContext['indexManager'],
    uiSpecLoader: {} as AppContext['uiSpecLoader'],
    platformRegistry: {} as AppContext['platformRegistry'],
    lifecycleEngine: {} as AppContext['lifecycleEngine'],
    policyBundleService: {} as AppContext['policyBundleService'],
    workspaceRoot,
    recordsDir: join(workspaceRoot, 'records'),
    schemaDir: join(workspaceRoot, 'schema'),
    appConfig: DEFAULT_CONFIG,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('vendor PDF MCP tools', () => {
  it('registers PDF download and extraction tools with ToolRegistry', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-pdf-tools-'));
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(pdfBytes(), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })) as unknown as typeof fetch);

      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerVendorPdfTools(mcp, createContext(workspaceRoot), registry);

      const download = registry.get('vendor_pdf_download');
      const extract = registry.get('vendor_pdf_extract_text');
      expect(download).toBeDefined();
      expect(extract).toBeDefined();

      const result = await download!.handler({
        url: 'https://vendor.example/spec.pdf',
        outputName: 'spec.pdf',
      });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.relativePath).toBe('artifacts/foundry/pdfs/spec.pdf');
      expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
