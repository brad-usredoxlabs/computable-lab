/**
 * Surfaces registry — declarative work-surface registry (phase 2, Task 2.2).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDefaultSurfacesRegistry } from './surfaces.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');

describe('SurfacesRegistry', () => {
  it('loads find + run-design and resolves getSurface(id)', () => {
    const registry = loadDefaultSurfacesRegistry(SCHEMA_DIR);
    expect(registry.get('find')).toMatchObject({ id: 'find', label: 'Find / Search' });
    expect(registry.get('run-design')).toMatchObject({ id: 'run-design', label: 'Run · Design' });
  });

  it('lists all declared surfaces', () => {
    const registry = loadDefaultSurfacesRegistry(SCHEMA_DIR);
    const ids = registry.list().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['find', 'run-plan', 'run-design', 'run-execute', 'results', 'analysis', 'knowledge', 'project']));
  });

  it('get(surface) returns null for unknown id', () => {
    const registry = loadDefaultSurfacesRegistry(SCHEMA_DIR);
    expect(registry.get('does-not-exist')).toBeNull();
  });

  it('run surfaces declare selectableKinds for AI actions', () => {
    const registry = loadDefaultSurfacesRegistry(SCHEMA_DIR);
    const find = registry.get('find')!;
    expect(find.selectableKinds).toContain('well');
    expect(find.aiRole).toBe('search selection → AI context');
  });
});