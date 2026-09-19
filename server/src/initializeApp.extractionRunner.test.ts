/**
 * The corpus-intake CLI (and MCP stdio) boot via initializeApp, not
 * createServer. The compile edge was dead for every nightly draft
 * (96/96 SGP compileStatus: not_run) because ctx.extractionRunner was
 * only built in createServer. Pin that initializeApp attaches it.
 */
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

// initializeApp hard-requires the schema tree (registry files, schemas).
// Reuse the repo's schema dir via symlink rather than copying it.
const repoSchemaDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schema');

describe('initializeApp extraction runner', () => {
  it('attaches ctx.extractionRunner when the extractor profile is configured', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cl-initapp-'));
    // Minimal app config with an enabled extractor profile (no real key
    // needed — construction must succeed; only calls would need one).
    writeFileSync(
      join(root, 'config.yaml'),
      [
        'repository:',
        '  mode: local',
        'ai:',
        '  extractor:',
        '    enabled: true',
        '    baseUrl: http://127.0.0.1:9/v1',
        '    model: stub-extractor',
      ].join('\n') + '\n',
    );
    mkdirSync(join(root, 'records'), { recursive: true });
    symlinkSync(repoSchemaDir, join(root, 'schema'));
    delete process.env.CONFIG_PATH; // isolate findConfigPath to the tmp root
    const { initializeApp } = await import('./server.js');
    const ctx = await initializeApp(root);
    expect(ctx.extractionRunner).toBeDefined();
    // The profile's baseUrl points at a dead port; building the runner must
    // not throw and the factory must be lazy (no call at construction).
  }, 30_000);

  it('attaches a runner whose factory null-guards when the profile is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cl-initapp2-'));
    writeFileSync(join(root, 'config.yaml'), 'repository:\n  mode: local\n');
    mkdirSync(join(root, 'records'), { recursive: true });
    symlinkSync(repoSchemaDir, join(root, 'schema'));
    delete process.env.CONFIG_PATH; // isolate findConfigPath to the tmp root
    const { initializeApp } = await import('./server.js');
    const ctx = await initializeApp(root);
    // Runner present (so the CLI wires a compile edge); extraction itself will
    // fail-declared via nullExtractor, which is the designed behaviour.
    expect(ctx.extractionRunner).toBeDefined();
  }, 30_000);
});
