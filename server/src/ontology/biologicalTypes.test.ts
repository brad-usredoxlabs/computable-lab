/**
 * BiologicalTypes registry — declarative measure table (phase B).
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBiologicalTypesRegistry, isBiologicalDomain } from './biologicalTypes.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, '../../../schema/registry/biological-types/biological-types.yaml');

describe('BiologicalTypesRegistry', () => {
  it('loads the registry with default + named biological types', () => {
    const registry = loadBiologicalTypesRegistry(REGISTRY_PATH);
    const ids = registry.list().map((rule) => rule.id);
    expect(ids).toEqual(
      expect.arrayContaining(['default', 'cell-line', 'c-elegans', 'yeast', 'e-coli', 'mouse', 'organoid']),
    );
    const cellLine = registry.get('cell-line');
    expect(cellLine?.domains).toContain('cell_line');
    expect(cellLine?.fields.find((f) => f.key === 'count')).toMatchObject({ label: 'Cells per well', required: true });
    expect(cellLine?.verification).toMatchObject({ method: 'hoechst_nuclei', readModality: 'microscopy' });
  });

  it('resolves the rule for a specific organism by label / curie', () => {
    const registry = loadBiologicalTypesRegistry(REGISTRY_PATH);
    expect(registry.lookup({ domain: 'organism', label: 'C. elegans' }).id).toBe('c-elegans');
    expect(registry.lookup({ domain: 'organism', label: 'Saccharomyces cerevisiae' }).id).toBe('yeast');
    expect(registry.lookup({ domain: 'organism', label: 'HepaRG' }).id).toBe('cell-line');
    expect(registry.lookup({ domain: 'organism', curie: 'NCBITaxon:10090' }).id).toBe('mouse');
    expect(registry.lookup({ domain: 'organism', curie: 'NCBITaxon:562' }).id).toBe('e-coli');
  });

  it('gates cell-line domain to the cell-line rule (count + volume)', () => {
    const registry = loadBiologicalTypesRegistry(REGISTRY_PATH);
    const rule = registry.lookup({ domain: 'cell_line' });
    expect(rule.id).toBe('cell-line');
    expect(rule.fields.find((f) => f.key === 'count')).toMatchObject({ required: true });
    expect(rule.fields.find((f) => f.key === 'volume')).toMatchObject({ required: true });
  });

  it('falls back to the generic count+volume default for an unknown biological type', () => {
    const registry = loadBiologicalTypesRegistry(REGISTRY_PATH);
    const rule = registry.lookup({ domain: 'organism', label: 'some-fungus-we-havent-modeled' });
    expect(rule.id).toBe('default');
    expect(rule.fields.find((f) => f.key === 'count')).toMatchObject({ required: true });
    expect(rule.fields.find((f) => f.key === 'volume')).toMatchObject({ required: true });
  });

  it('isBiologicalDomain gates cell_line|organism as biological vs chemical', () => {
    expect(isBiologicalDomain('cell_line')).toBe(true);
    expect(isBiologicalDomain('organism')).toBe(true);
    expect(isBiologicalDomain('chemical')).toBe(false);
    expect(isBiologicalDomain('media')).toBe(false);
    expect(isBiologicalDomain(undefined)).toBe(false);
  });

  it('loads the declarative identity vocabulary (organisms/strains/conditions) with deterministic ids', () => {
    const registry = loadBiologicalTypesRegistry(REGISTRY_PATH);
    const organisms = registry.organisms();
    const strains = registry.strains();
    const conditions = registry.conditions();
    expect(organisms.length).toBeGreaterThanOrEqual(5);
    expect(strains.length).toBeGreaterThanOrEqual(3);
    expect(conditions.length).toBeGreaterThanOrEqual(10);

    // HepaRG is declared as a cell-line organism (domain drives the measure gate).
    const heparg = organisms.find((o) => o.label === 'HepaRG');
    expect(heparg?.domain).toBe('cell_line');
    // Every entry carries a deterministic TERM-<slug>-<hash> id.
    for (const [kind, list] of [['organism', organisms], ['strain', strains], ['condition', conditions]] as const) {
      for (const entry of list) {
        expect(entry.id, `${kind} ${entry.label} id`).toMatch(/^TERM-[A-Za-z0-9-]+-[0-9a-z]{4}$/);
      }
    }
    // Strains declare their species for the strain_of spine.
    expect(strains.find((s) => s.label === 'C57BL/6J')?.species).toBe('Mus musculus');
  });

  it('refuses a registry entry that declares a verification WITHOUT a read modality (fail loudly, no TS guess)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bio-types-'));
    const file = join(dir, 'registry.yaml');
    writeFileSync(file, `version: 1
default:
  label: Bio
  measures: { primary: count, units: [count-per-well], concentrationBasis: count_per_volume }
  verification: { method: manual }
  fields:
    - { key: count, label: Count per well, required: true }
    - { key: volume, label: Final volume, required: true }
types: {}
`);
    expect(() => loadBiologicalTypesRegistry(file)).toThrow(/readModality/);
  });
});