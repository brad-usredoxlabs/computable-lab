/**
 * reloadSchemaSurface — the no-restart YAML reload (Brad 2026-11-12, "pull the two levers").
 *
 * Contract under test:
 *   1. a fresh load populates the LIVE instances the handlers already hold;
 *   2. a second reload is idempotent (no duplicate-schema throw, same counts);
 *   3. an edited schema file is picked up on the next reload;
 *   4. FAIL-SAFE: an empty/broken schema dir must NOT empty a working registry.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { createUISpecLoader } from '../ui/UISpecLoader.js';
import { reloadSchemaSurface } from './reloadSchemaSurface.js';

const schemaYaml = (title: string) => `$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/test/reload-probe.schema.yaml"
title: "${title}"
type: object
additionalProperties: true
properties:
  label:
    type: string
`;

let dir: string;

function wire() {
  return {
    schemaRegistry: createSchemaRegistry(),
    validator: createValidator(),
    lintEngine: createLintEngine(),
    uiSpecLoader: createUISpecLoader(),
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reload-surface-'));
  mkdirSync(join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'test', 'reload-probe.schema.yaml'), schemaYaml('Reload Probe'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('reloadSchemaSurface', () => {
  it('loads schemas into the live registry and validator', async () => {
    const w = wire();
    const res = await reloadSchemaSurface({ schemaDir: dir, ...w });
    expect(res.ok).toBe(true);
    expect(res.schemas.loaded).toBe(1);
    expect(res.schemas.addedToValidator).toBe(1);
    expect(w.schemaRegistry.size).toBe(1);
    expect(Array.isArray(res.requiresRestart)).toBe(true);
    expect(res.errors ?? true).toBeTruthy();
  });

  it('is idempotent — a second reload does not duplicate or throw', async () => {
    const w = wire();
    const first = await reloadSchemaSurface({ schemaDir: dir, ...w });
    const second = await reloadSchemaSurface({ schemaDir: dir, ...w });
    expect(first.ok && second.ok).toBe(true);
    expect(second.schemas.loaded).toBe(first.schemas.loaded);
    expect(w.schemaRegistry.size).toBe(1);
  });

  it('picks up an edited schema on the next reload', async () => {
    const w = wire();
    await reloadSchemaSurface({ schemaDir: dir, ...w });
    expect(w.schemaRegistry.size).toBe(1);

    writeFileSync(join(dir, 'test', 'reload-probe.schema.yaml'), schemaYaml('Reload Probe Renamed'));
    const again = await reloadSchemaSurface({ schemaDir: dir, ...w });
    expect(again.ok).toBe(true);
    const only = w.schemaRegistry.getAll()[0] as unknown as { schema: { title?: string } };
    expect(only.schema.title).toBe('Reload Probe Renamed');
  });

  it('FAIL-SAFE: an empty schema dir refuses and leaves the live registry intact', async () => {
    const w = wire();
    await reloadSchemaSurface({ schemaDir: dir, ...w });
    expect(w.schemaRegistry.size).toBe(1);

    const empty = mkdtempSync(join(tmpdir(), 'reload-empty-'));
    try {
      const res = await reloadSchemaSurface({ schemaDir: empty, ...w });
      expect(res.ok).toBe(false);
      expect(res.warnings.join(' ')).toContain('REFUSED');
      expect(w.schemaRegistry.size).toBe(1); // untouched
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
