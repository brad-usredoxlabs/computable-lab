import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initializeApp, type AppContext } from '../../server.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerVendorDocumentTools } from './vendorDocumentTools.js';

const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';
const VENDOR_PRODUCT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';

describe('vendor document MCP tools', () => {
  let ctx: AppContext;
  let registry: ToolRegistry;
  const repoRoot = resolve(process.cwd());
  const originalConfigPath = process.env.CONFIG_PATH;

  beforeAll(async () => {
    process.env.CONFIG_PATH = resolve(repoRoot, 'tmp/vendor-document-tools-test/missing-config.yaml');
    await mkdir(resolve(repoRoot, 'tmp/vendor-document-tools-test/records'), { recursive: true });

    ctx = await initializeApp(repoRoot, {
      recordsDir: 'tmp/vendor-document-tools-test/records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'MAT-TEST-RPMI',
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: 'MAT-TEST-RPMI',
          name: 'RPMI 1640',
          domain: 'media',
        },
      },
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'VPR-TEST-RPMI',
        schemaId: VENDOR_PRODUCT_SCHEMA_ID,
        payload: {
          kind: 'vendor-product',
          id: 'VPR-TEST-RPMI',
          name: 'RPMI 1640',
          vendor: 'Thermo Fisher',
          catalog_number: '11875093',
          material_ref: { kind: 'record', id: 'MAT-TEST-RPMI', type: 'material', label: 'RPMI 1640' },
        },
      },
      skipLint: true,
    });

    registry = new ToolRegistry();
    const mcp = new McpServer({ name: 'test', version: '0.0.0' });
    registerVendorDocumentTools(mcp, ctx, registry);
  });

  afterAll(async () => {
    if (originalConfigPath === undefined) delete process.env.CONFIG_PATH;
    else process.env.CONFIG_PATH = originalConfigPath;
    await rm(resolve(repoRoot, 'tmp/vendor-document-tools-test'), { recursive: true, force: true });
  });

  it('attaches a document and creates a draft', async () => {
    const tool = registry.get('vendor_document_extract');
    expect(tool).toBeDefined();
    const contentBase64 = Buffer.from('Glucose 2 g/L\nL-Glutamine 2 mM', 'utf8').toString('base64');
    const result = await tool!.handler({
      vendorProductId: 'VPR-TEST-RPMI',
      fileName: 'rpmi.txt',
      mediaType: 'text/plain',
      contentBase64,
      documentKind: 'formulation_sheet',
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.success).toBe(true);
    expect(body.document.file_ref.file_name).toBe('rpmi.txt');
    expect(body.draft.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component_name: 'Glucose' }),
      ]),
    );
  });
});
