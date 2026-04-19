import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './loader.js';

describe('config loader', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    delete process.env.EXA_API_KEY;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('loads Exa integration settings from env-substituted config', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cl-config-'));
    process.env.EXA_API_KEY = 'exa-env-key';
    const configPath = join(tempDir, 'config.yaml');
    await writeFile(
      configPath,
      [
        'server:',
        '  port: 3001',
        '  host: 0.0.0.0',
        '  logLevel: info',
        '  workspaceDir: /tmp/cl-workspaces',
        '  cors:',
        '    enabled: true',
        '    origins: ["*"]',
        'schemas:',
        '  source: bundled',
        '  bundledDir: ./schema',
        'repositories: []',
        'integrations:',
        '  exa:',
        '    enabled: true',
        '    apiKey: ${EXA_API_KEY}',
        '    userLocation: US',
        '    defaultSearchType: auto',
      ].join('\n'),
      'utf8',
    );

    const config = await loadConfig({ configPath });
    expect(config.integrations?.exa).toMatchObject({
      enabled: true,
      apiKey: 'exa-env-key',
      userLocation: 'US',
      defaultSearchType: 'auto',
    });
  });

  describe('extractor profile defaults', () => {
    it('applies defaults when extractor is absent', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cl-config-'));
      const configPath = join(tempDir, 'config.yaml');
      await writeFile(
        configPath,
        [
          'server:',
          '  port: 3001',
          '  host: 0.0.0.0',
          '  logLevel: info',
          '  workspaceDir: /tmp/cl-workspaces',
          '  cors:',
          '    enabled: true',
          '    origins: ["*"]',
          'schemas:',
          '  source: bundled',
          '  bundledDir: ./schema',
          'repositories: []',
          'ai:',
          '  inference:',
          '    baseUrl: http://localhost:8000/v1',
          '    model: test-model',
          '  agent: {}',
        ].join('\n'),
        'utf8',
      );

      const config = await loadConfig({ configPath });
      expect(config.ai?.extractor).toBeDefined();
      expect(config.ai?.extractor?.enabled).toBe(false);
      expect(config.ai?.extractor?.baseUrl).toBe('http://thunderbeast:8889/v1');
      expect(config.ai?.extractor?.model).toBe('Qwen/Qwen3.5-9B-Instruct');
      expect(config.ai?.extractor?.provider).toBe('openai-compatible');
      expect(config.ai?.extractor?.temperature).toBe(0.0);
      expect(config.ai?.extractor?.max_tokens).toBe(2048);
    });

    it('merges per-field overrides with defaults', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cl-config-'));
      const configPath = join(tempDir, 'config.yaml');
      await writeFile(
        configPath,
        [
          'server:',
          '  port: 3001',
          '  host: 0.0.0.0',
          '  logLevel: info',
          '  workspaceDir: /tmp/cl-workspaces',
          '  cors:',
          '    enabled: true',
          '    origins: ["*"]',
          'schemas:',
          '  source: bundled',
          '  bundledDir: ./schema',
          'repositories: []',
          'ai:',
          '  inference:',
          '    baseUrl: http://localhost:8000/v1',
          '    model: test-model',
          '  agent: {}',
          '  extractor:',
          '    enabled: true',
          '    model: custom-model',
        ].join('\n'),
        'utf8',
      );

      const config = await loadConfig({ configPath });
      expect(config.ai?.extractor).toBeDefined();
      expect(config.ai?.extractor?.enabled).toBe(true);
      expect(config.ai?.extractor?.model).toBe('custom-model');
      // Other fields should be at defaults
      expect(config.ai?.extractor?.baseUrl).toBe('http://thunderbeast:8889/v1');
      expect(config.ai?.extractor?.provider).toBe('openai-compatible');
      expect(config.ai?.extractor?.temperature).toBe(0.0);
      expect(config.ai?.extractor?.max_tokens).toBe(2048);
    });

    it('applies baseUrl override while keeping other defaults', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cl-config-'));
      const configPath = join(tempDir, 'config.yaml');
      await writeFile(
        configPath,
        [
          'server:',
          '  port: 3001',
          '  host: 0.0.0.0',
          '  logLevel: info',
          '  workspaceDir: /tmp/cl-workspaces',
          '  cors:',
          '    enabled: true',
          '    origins: ["*"]',
          'schemas:',
          '  source: bundled',
          '  bundledDir: ./schema',
          'repositories: []',
          'ai:',
          '  inference:',
          '    baseUrl: http://localhost:8000/v1',
          '    model: test-model',
          '  agent: {}',
          '  extractor:',
          '    baseUrl: http://localhost:8000/v1',
        ].join('\n'),
        'utf8',
      );

      const config = await loadConfig({ configPath });
      expect(config.ai?.extractor).toBeDefined();
      expect(config.ai?.extractor?.baseUrl).toBe('http://localhost:8000/v1');
      // enabled should stay at default (false)
      expect(config.ai?.extractor?.enabled).toBe(false);
      expect(config.ai?.extractor?.model).toBe('Qwen/Qwen3.5-9B-Instruct');
    });
  });
});
