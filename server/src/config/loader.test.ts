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
});
