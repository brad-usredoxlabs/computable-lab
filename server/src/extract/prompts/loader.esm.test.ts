/**
 * Real-ESM subprocess regression for the bare-__dirname class (ESM-DIRNAME-1).
 *
 * server/ is "type": "module" — native ESM has no __dirname. Vitest transforms
 * modules CJS-ish and INJECTS __dirname, so an in-vitest import of these
 * modules can NEVER observe the ReferenceError the live tsx server hits on
 * POST /api/extraction/vendor-candidates/:recordId/semantic-draft.
 *
 * This test therefore spawns a REAL `tsx` subprocess (the same runtime the
 * server runs under) against a generated .mts fixture that imports the
 * production modules and exercises their directory-resolution paths.
 *
 * Covers the three bare-__dirname users verified on trunk 0814cd6a:
 *   - extract/prompts/loader.ts      (loadExtractionPrompt, getAvailablePromptKinds)
 *   - compiler/derive/seedModels.ts  (loadSeedModel repo-root resolution)
 *   - ingestion/extractorLibrary.ts  (getDefaultLibraryDir repo-root resolution)
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
// .../server/src/extract/prompts -> .../server
const serverDir = join(testDir, '..', '..', '..');
// .../server -> repo root
const repoRoot = join(serverDir, '..');

const loaderModule = join(serverDir, 'src', 'extract', 'prompts', 'loader.js');
const seedModelsModule = join(serverDir, 'src', 'compiler', 'derive', 'seedModels.js');
const extractorLibraryModule = join(serverDir, 'src', 'ingestion', 'extractorLibrary.js');

/**
 * Run `fixtureSource` under real tsx (same invocation shape as the server's
 * own dev script: `npx tsx <file>`), cwd pinned inside the repo so tsx
 * resolves the repo's own dependencies. Returns the captured output streams.
 */
function runUnderRealTsx(fixtureSource: string): { stdout: string; stderr: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'esm-dirname-1-'));
  try {
    const fixturePath = join(tmp, 'esm-dirname-fixture.mts');
    writeFileSync(fixturePath, fixtureSource, 'utf-8');
    const stdout = execFileSync('npx', ['tsx', fixturePath], {
      cwd: serverDir,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    return { stdout, stderr: '' };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Fixture preamble: each check prints `OK <name> <detail>` or `FAIL <name>: <Error>: <message>`. */
const CHECK_HELPER = `let failures = 0;
const check = (name: string, fn: () => string): void => {
  try {
    console.log(\`OK \${name} \${fn()}\`);
  } catch (e) {
    failures += 1;
    console.error(\`FAIL \${name}: \${e instanceof Error ? \`\${e.constructor.name}: \${e.message}\` : String(e)}\`);
  }
};
`;

const LOADER_FIXTURE = `import { loadExtractionPrompt, getAvailablePromptKinds } from ${JSON.stringify(loaderModule)};
${CHECK_HELPER}
check('loadExtractionPrompt', () => loadExtractionPrompt('observation').path);
check('getAvailablePromptKinds', () => String(getAvailablePromptKinds().length));
process.exit(failures > 0 ? 1 : 0);
`;

const REPO_ROOT_FIXTURE = `import { loadSeedModel } from ${JSON.stringify(seedModelsModule)};
import { getDefaultLibraryDir } from ${JSON.stringify(extractorLibraryModule)};
${CHECK_HELPER}
check('loadSeedModel', () => loadSeedModel('schema/knowledge/derivation-models/DM-dilution-serial.yaml').id);
check('getDefaultLibraryDir', () => getDefaultLibraryDir());
process.exit(failures > 0 ? 1 : 0);
`;

function okLine(stdout: string, name: string): string | undefined {
  return stdout.split('\n').find((line) => line.startsWith(`OK ${name} `));
}

describe('loader.esm (real tsx subprocess — no vitest-injected __dirname)', () => {
  it('loadExtractionPrompt resolves its prompt directory under the real ESM loader', () => {
    const { stdout, stderr } = runUnderRealTsx(LOADER_FIXTURE);
    const output = `${stdout}\n${stderr}`;

    // The exact live failure pinned from the :3092 500 response body.
    expect(output).not.toContain('__dirname is not defined');

    const loadedLine = okLine(stdout, 'loadExtractionPrompt');
    expect(loadedLine).toBeDefined();
    expect(loadedLine!.slice('OK loadExtractionPrompt '.length).trim())
      .toBe(join(serverDir, 'src', 'extract', 'prompts', 'observation.md'));
  }, 120_000);

  it('getAvailablePromptKinds lists prompt kinds under the real ESM loader', () => {
    const { stdout, stderr } = runUnderRealTsx(LOADER_FIXTURE);
    const output = `${stdout}\n${stderr}`;

    expect(output).not.toContain('__dirname is not defined');

    const kindsLine = okLine(stdout, 'getAvailablePromptKinds');
    expect(kindsLine).toBeDefined();
    expect(Number(kindsLine!.slice('OK getAvailablePromptKinds '.length).trim())).toBeGreaterThan(0);
  }, 120_000);

  it('seedModels and extractorLibrary resolve repo-root paths under the real ESM loader', () => {
    const { stdout, stderr } = runUnderRealTsx(REPO_ROOT_FIXTURE);
    const output = `${stdout}\n${stderr}`;

    expect(output).not.toContain('__dirname is not defined');

    const seedLine = okLine(stdout, 'loadSeedModel');
    expect(seedLine).toBeDefined();
    expect(seedLine!.slice('OK loadSeedModel '.length).trim()).toBe('DM-dilution-serial');

    const libLine = okLine(stdout, 'getDefaultLibraryDir');
    expect(libLine).toBeDefined();
    expect(libLine!.slice('OK getDefaultLibraryDir '.length).trim())
      .toBe(join(repoRoot, 'specs', 'extractors'));
  }, 120_000);
});
