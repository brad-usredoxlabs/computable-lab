// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { UISpecLoader } from './UISpecLoader.js';

const MANIFEST_SCHEMA_ID = 'https://computable-lab.com/schema/ui/surface-manifest.schema.yaml';

function resolvePath(doc: unknown, path: string): unknown {
  const segs: string[] = [];
  let i = 0;
  const p = path.startsWith('$') ? path.slice(1) : path;
  for (let j = 0; j < p.length; j++) {
    if (p[j] === '.') { if (i < j) segs.push(p.slice(i, j)); i = j + 1; }
    else if (p[j] === '[') {
      const end = p.indexOf(']', j);
      if (i < j) segs.push(p.slice(i, j));
      segs.push(p.slice(j + 1, end));
      i = end + 1;
    }
  }
  if (i < p.length) segs.push(p.slice(i));
  let cur: unknown = doc;
  for (const s of segs) {
    if (s === '*') return Array.isArray(cur) ? cur : undefined;
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

function assertResolved(doc: unknown, path: string) {
  expect(resolvePath(doc, path), `path ${path}`).not.toBeUndefined();
}

describe('Surface manifest UI spec', () => {
  it('loads via UISpecLoader, pins schemaId, and resolves all JSONPaths', async () => {
    const loader = new UISpecLoader();
    const uiPath = join(process.cwd(), '..', 'schema', 'ui', 'surface-manifest.ui.yaml');
    const content = await readFile(uiPath, 'utf8');
    const result = loader.load(content, uiPath);
    expect(result.success).toBe(true);
    expect(result.spec!.schemaId).toBe(MANIFEST_SCHEMA_ID);

    const manifest = parseYaml(
      await readFile(join(process.cwd(), '..', 'config', 'ui', 'surfaces.yaml'), 'utf8')
    );
    const spec = result.spec! as unknown as Record<string, any>;

    if (spec.display?.titleField) assertResolved(manifest, spec.display.titleField);
    if (spec.display?.subtitleField) assertResolved(manifest, spec.display.subtitleField);

    expect(spec.list).toBeDefined();
    expect(spec.list!.columns!.length).toBeGreaterThan(0);
    for (const col of spec.list!.columns!) assertResolved(manifest, col.path);

    for (const sec of spec.form?.sections ?? [])
      for (const f of sec.fields) assertResolved(manifest, f.path);

    expect(Object.keys(spec.display).length).toBeGreaterThan(0);
  });
});
