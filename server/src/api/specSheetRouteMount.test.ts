/**
 * L2-SPEC-SHEET-INGEST-1 u2fix1 — route-mount + honest-config seams.
 *
 * The Extractor engine is already unit-tested; these tests cover the two
 * wiring defects from advc c1: (1) server.ts never mounted the handler, so
 * POST /ingestion/spec-sheet/extract 404'd, and (2) createSpecSheetHandlers
 * ignored the live app config when resolving Exa credentials.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AppConfig } from '../config/types.js';

const { extractFromUrlMock } = vi.hoisted(() => ({
  extractFromUrlMock: vi.fn(async () => ({
    configured: false as const,
    reason: 'not_configured' as const,
    proposals: [],
  })),
}));

vi.mock('../ingestion/SpecSheetExtractor.js', () => ({
  extractFromUrl: extractFromUrlMock,
}));

import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { createSpecSheetHandlers } from './handlers/SpecSheetHandlers.js';

describe('spec-sheet route mount (u2fix1)', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const repoRoot = resolve(process.cwd());
  const testRoot = resolve(repoRoot, 'tmp/spec-sheet-route-mount-test');
  const originalConfigPath = process.env.CONFIG_PATH;

  beforeAll(async () => {
    process.env.CONFIG_PATH = resolve(testRoot, 'missing-config.yaml');
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(resolve(testRoot, 'records'), { recursive: true });
    ctx = await initializeApp(repoRoot, {
      recordsDir: 'tmp/spec-sheet-route-mount-test/records',
      logLevel: 'silent',
    });
    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (originalConfigPath === undefined) delete process.env.CONFIG_PATH;
    else process.env.CONFIG_PATH = originalConfigPath;
    await rm(testRoot, { recursive: true, force: true });
  }, 30000);

  it('mounts POST /ingestion/spec-sheet/extract (400-shaped, not 404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingestion/spec-sheet/extract',
      payload: {},
    });
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error?: string };
    expect(body.error).toBe('BAD_REQUEST');
  });
});

describe('spec-sheet handler honest config (u2fix1)', () => {
  it('threads getAppConfig() into extractFromUrl', async () => {
    extractFromUrlMock.mockClear();
    const appConfig = { exaApiKey: 'test-key' } as unknown as AppConfig;
    const handlers = createSpecSheetHandlers({ getAppConfig: () => appConfig });
    const reply = { status: vi.fn() } as never;
    const request = {
      body: { url: 'https://example.test/spec', recordKind: 'labware' },
    } as never;

    await handlers.extractSpecSheet(request, reply);

    expect(extractFromUrlMock).toHaveBeenCalledWith('labware', 'https://example.test/spec', appConfig);
  });
});
