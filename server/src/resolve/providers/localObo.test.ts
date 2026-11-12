// @vitest-environment node
/**
 * local-obo provider — RED-first pins for L2-ONTOLOGY-ANCHOR-SOURCES-1 (o2b).
 *
 * (a) a discriminating labware phrase returns an in-house hit whose
 *     curie/label/namespace come from the OBO file, not from a literal;
 * (b) a multi-word query returns several hits, and nothing is pre-selected
 *     or auto-ranked (no tier/score/selected on a raw ProviderHit);
 * (c) a registry row whose path does not exist yields a NAMED failure for
 *     that source id while the surviving sources still return hits.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalOboSources, searchLocalObo } from './localObo.js';

const tmp = mkdtempSync(join(tmpdir(), 'cl-localobo-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const GOOD_OBO = [
  'format-version: 1.2',
  '',
  '[Term]',
  'id: TST:0000001',
  'name: deep-well plate',
  'def: "A plate with deep, narrow wells for sample storage." [TST:0000001]',
  'synonym: "deep well plate" EXACT []',
  '',
  '[Term]',
  'id: TST:0000002',
  'name: 96-well plate',
  'def: "A plate with 96 shallow wells." [TST:0000002]',
  'synonym: "96 well plate" EXACT []',
  '',
  '[Typedef]',
  'id: TST:0000009',
  'name: not a term',
  '',
].join('\n');

function registry(name: string, sources: string): string {
  const path = join(tmp, `${name}.yaml`);
  writeFileSync(path, `version: "1.0"\nsources:\n${sources}`);
  return path;
}

const GOOD_ROW = `  - id: "good"\n    prefix: "ZZTOP"\n    namespace_iri: "http://example.org/good"\n    display_name: "Good"\n    loader: "local-obo"\n    enabled: true\n    path: "${join(tmp, 'good.obo')}"\n    root: "TST:0000001"\n`;

describe('localObo provider', () => {
  it('(a) serves shipped local-obo sources: "deep well" returns file-backed CURIE/label/namespace', async () => {
    const report = await searchLocalObo('deep well', 10);
    expect(report.failures, 'shipped registry sources load').toEqual([]);
    expect(report.hits.length).toBeGreaterThanOrEqual(1);
    const hit = report.hits.find((h) => h.label.toLowerCase().includes('deep-well')) ?? report.hits[0]!;
    expect(hit.curie).toMatch(/^[A-Za-z][A-Za-z0-9]*:\d+$/);
    expect(hit.namespace).toBe(hit.curie.split(':')[0]);
    expect(hit.uri ?? '').toContain(hit.curie.replace(':', '_'));
    expect(hit.label.length).toBeGreaterThan(0);
    expect(hit.definition ?? '').toContain('well');
  });

  it('(b) multi-word query returns several candidates with nothing pre-selected', async () => {
    writeFileSync(join(tmp, 'good.obo'), GOOD_OBO);
    const path = registry('multi', GOOD_ROW);
    const report = await searchLocalObo('well plate', 10, { registryPath: path });
    expect(report.failures).toEqual([]);
    expect(report.hits.length).toBeGreaterThanOrEqual(2);
    for (const hit of report.hits) {
      expect(hit).not.toHaveProperty('score');
      expect(hit).not.toHaveProperty('tier');
      expect(hit).not.toHaveProperty('selected');
    }
    const restricted = await searchLocalObo('well plate', 10, { registryPath: path, ontologies: ['nope'] });
    expect(restricted.hits).toEqual([]);
  });

  it('(c) a missing source path is a NAMED failure and does not empty the surviving hits', async () => {
    writeFileSync(join(tmp, 'good.obo'), GOOD_OBO);
    const path = registry(
      'broken',
      GOOD_ROW +
        `\n  - id: "broken"\n    prefix: "BKN"\n    namespace_iri: "http://example.org/broken"\n    display_name: "Broken"\n    loader: "local-obo"\n    enabled: true\n    path: "${join(tmp, 'absent.obo')}"\n    root: "BKN:0000001"\n`,
    );
    const sources = loadLocalOboSources(path);
    expect(sources.map((s) => s.id)).toEqual(['good', 'broken']);
    const report = await searchLocalObo('well plate', 10, { registryPath: path });
    expect(report.failures.map((f) => f.source)).toEqual(['broken']);
    expect(report.failures[0]!.error).toContain('absent.obo');
    expect(report.hits.length).toBeGreaterThanOrEqual(2);
    // namespace is derived from the parsed CURIE, never from the registry prefix literal.
    expect(report.hits[0]!.namespace).toBe('TST');
  });
});
