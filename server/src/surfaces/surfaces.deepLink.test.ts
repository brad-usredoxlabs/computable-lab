/**
 * Deep-linkability is declared, not hardcoded (plan 2026-09-19_092150, task 5).
 *
 * `params` binds every `:token` in a surface's `path` to the objectType that
 * fills it, so a route can be built from ANY surface context. A surface with no
 * params is an AI-context surface reached through its collection route.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { loadDefaultSurfacesRegistry } from './surfaces.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');

describe('surfaces registry — deep-linkability is declared, not hardcoded', () => {
  const reg = loadDefaultSurfacesRegistry(SCHEMA_DIR);

  it('binds every :token in path to an objectType via params', () => {
    for (const s of reg.list()) {
      if (!s.params) continue;
      const tokens = [...s.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!);
      expect(Object.keys(s.params).sort()).toEqual(tokens.sort());
    }
  });

  it('points the run surfaces at the real /runs/:runId route', () => {
    for (const id of ['run-plan', 'run-design', 'run-execute', 'results']) {
      expect(reg.get(id)!.path).toBe('/runs/:runId');
      expect(reg.get(id)!.params).toEqual({ runId: 'run' });
    }
  });

  it('leaves the AI-context surfaces without params (not deep-linkable)', () => {
    for (const id of ['find', 'analysis', 'knowledge']) {
      expect(reg.get(id)!.params).toBeUndefined();
    }
    expect(reg.get('project')!.params).toEqual({ studyId: 'project' });
  });
});
