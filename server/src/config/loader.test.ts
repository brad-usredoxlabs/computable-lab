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

  it('defaults an empty-url repository to embedded local Git', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cl-config-'));
    const configPath = join(tempDir, 'config.yaml');
    await writeFile(
      configPath,
      [
        'server:',
        '  port: 3001',
        '  host: 0.0.0.0',
        '  logLevel: info',
        '  dataDir: ~/.computable-lab',
        '  workspaceDir: ~/.computable-lab/workspaces',
        '  cors:',
        '    enabled: true',
        '    origins: ["*"]',
        'schemas:',
        '  source: bundled',
        '  bundledDir: ./schema',
        'repositories:',
        '- id: main',
        '  default: true',
        '  git:',
        '    url: ""',
        '    branch: main',
        '    auth:',
        '      type: none',
        '  namespace:',
        '    baseUri: http://localhost:3001/records/',
        '    prefix: local',
        '  jsonld:',
        '    context: default',
        '  sync:',
        '    mode: manual',
        '    autoCommit: true',
        '    autoPush: false',
        '  records:',
        '    directory: records',
      ].join('\n'),
      'utf8',
    );

    const config = await loadConfig({ configPath });
    expect(config.server.dataDir).toBe('~/.computable-lab');
    expect(config.repositories[0]?.mode).toBe('embedded-git');
    expect(config.repositories[0]?.git.url).toBe('');
    expect(config.repositories[0]?.sync.autoPush).toBe(false);
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
      expect(config.ai?.extractor?.baseUrl).toBe('http://appliance-2:8000/v1');
      expect(config.ai?.extractor?.model).toBe('Qwen/Qwen3.5-9B-Instruct');
      expect(config.ai?.extractor?.provider).toBe('openai-compatible');
      expect(config.ai?.extractor?.temperature).toBe(0.0);
      expect(config.ai?.extractor?.max_tokens).toBe(2048);
    });

    it('loads the assuranceThreshold from ai config', async () => {
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
          '  assuranceThreshold: 0.85',
        ].join('\n'),
        'utf8',
      );

      const config = await loadConfig({ configPath });
      expect(config.ai?.assuranceThreshold).toBe(0.85);
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
      expect(config.ai?.extractor?.baseUrl).toBe('http://appliance-2:8000/v1');
      expect(config.ai?.extractor?.provider).toBe('openai-compatible');
      expect(config.ai?.extractor?.temperature).toBe(0.0);
      expect(config.ai?.extractor?.max_tokens).toBe(2048);
    });


    it('allows extractor and inference to point at the same local appliance endpoint', async () => {
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
          '    provider: openai-compatible',
          '    baseUrl: http://appliance-2:8000/v1',
          '    model: local-protocol-model',
          '  agent: {}',
          '  extractor:',
          '    enabled: true',
          '    baseUrl: http://appliance-2:8000/v1',
          '    model: local-protocol-model',
        ].join('\n'),
        'utf8',
      );

      const config = await loadConfig({ configPath });
      expect(config.ai?.inference.baseUrl).toBe('http://appliance-2:8000/v1');
      expect(config.ai?.extractor?.baseUrl).toBe('http://appliance-2:8000/v1');
      expect(config.ai?.extractor?.enabled).toBe(true);
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
