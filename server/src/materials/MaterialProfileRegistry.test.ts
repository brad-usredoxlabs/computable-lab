import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadMaterialProfileRegistry } from './MaterialProfileRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, '../../../schema/lab/material-profile.registry.yaml');

describe('MaterialProfileRegistry', () => {
  it('loads the v1 material profile registry', () => {
    const registry = loadMaterialProfileRegistry(REGISTRY_PATH);
    expect(registry.list().map((profile) => profile.id)).toEqual([
      'chemical',
      'cell_line',
      'media_composition',
      'single_active_formulation',
      'sample',
      'other',
      'vendor-product',
    ]);
    expect(registry.get('chemical')?.fields.find((field) => field.path === 'status')).toMatchObject({
      control: 'app-owned',
      default: 'proposed',
    });
  });

  it('fails on invalid control mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'material-profiles-'));
    const file = join(dir, 'registry.yaml');
    writeFileSync(file, `version: 1
profiles:
  chemical:
    label: Chemical
    applies_when: { domain: [chemical] }
    layers: [concept]
    fields:
    - path: name
      layer: concept
      label: Name
      widget: text
      control: bad-control
    quick_add: [name]
  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }
  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
`);
    expect(() => loadMaterialProfileRegistry(file)).toThrow(/invalid control: bad-control/);
  });

  it('looks up profiles by domain and formulation kind', () => {
    const registry = loadMaterialProfileRegistry(REGISTRY_PATH);
    expect(registry.lookup({ domain: 'cell_line' }).id).toBe('cell_line');
    expect(registry.lookup({ domain: 'media', formulationKind: 'complex_composition' }).id).toBe('media_composition');
    expect(registry.lookup({ formulationKind: 'single_active' }).id).toBe('single_active_formulation');
    expect(registry.lookup({ domain: 'unknown' }).id).toBe('other');
  });

  it('normalizes the declared candidate_ranking block (L2-CLARIFY-PICKER-1 P1)', () => {
    const registry = loadMaterialProfileRegistry(REGISTRY_PATH);
    const ranking = registry.candidateRanking();
    expect(ranking).not.toBeNull();
    expect(ranking!.containsSectionLabel).toBe('contains "{label}" ({count})');
    // The five search categories + the composition pseudo-family, data-declared.
    expect(ranking!.families['saved-stock']).toEqual({ rank: 0, canBeDefault: true });
    expect(ranking!.families['vendor-reagent']).toEqual({ rank: 1, canBeDefault: true });
    expect(ranking!.families['prepared-material']).toEqual({ rank: 2, canBeDefault: true });
    expect(ranking!.families['biological-derived']).toEqual({ rank: 3, canBeDefault: true });
    expect(ranking!.families['concept-only']).toEqual({ rank: 4, canBeDefault: true });
    // The composition pseudo-family can NEVER be the focused default.
    expect(ranking!.families.composition).toEqual({ rank: 4, canBeDefault: false });
    // clarificationPolicy() carries the same declaration (the data surface).
    expect(registry.clarificationPolicy().candidateRanking?.families.composition).toEqual({ rank: 4, canBeDefault: false });
  });

  it('throws naming the path for a malformed candidate_ranking (rank not an integer)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'material-profiles-'));
    const file = join(dir, 'registry.yaml');
    writeFileSync(file, `version: 1
clarification:
  layers:
    material: { label: "the compound", field: material_ref, question: 'Which material?', requires: [] }
  candidate_ranking:
    contains_section_label: 'contains "{label}" ({count})'
    families:
      concept-only: { rank: not-a-number, can_be_default: true }
profiles:
  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }
  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
`);
    expect(() => loadMaterialProfileRegistry(file)).toThrow(
      /clarification\.candidate_ranking\.families\.concept-only\.rank must be an integer/,
    );
  });

  it('throws naming the path for a malformed candidate_ranking (can_be_default not a boolean)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'material-profiles-'));
    const file = join(dir, 'registry.yaml');
    writeFileSync(file, `version: 1
clarification:
  layers:
    material: { label: "the compound", field: material_ref, question: 'Which material?', requires: [] }
  candidate_ranking:
    contains_section_label: 'contains "{label}" ({count})'
    families:
      concept-only: { rank: 4, can_be_default: yes }
profiles:
  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }
  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
`);
    expect(() => loadMaterialProfileRegistry(file)).toThrow(
      /clarification\.candidate_ranking\.families\.concept-only\.can_be_default must be a boolean/,
    );
  });

  it('candidateRanking() is ABSENT (null) when the registry declares none (eOPT)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'material-profiles-'));
    const file = join(dir, 'registry.yaml');
    writeFileSync(file, `version: 1
profiles:
  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }
  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
`);
    const registry = loadMaterialProfileRegistry(file);
    // Honest absent: null, and the policy object carries NO candidateRanking key.
    expect(registry.candidateRanking()).toBeNull();
    expect(registry.clarificationPolicy()).not.toHaveProperty('candidateRanking');
  });

  it('vendor-product profile is declared and every field path matches the schema (drift guard)', () => {
    const registry = loadMaterialProfileRegistry(REGISTRY_PATH);
    const schemaPath = resolve(__dirname, '../../../schema/lab/vendor-product.schema.yaml');
    const schema = parse(readFileSync(schemaPath, 'utf8')) as { properties?: Record<string, unknown> };
    const schemaProps = new Set(Object.keys(schema.properties || {}));

    // (a) profile exists and has a label
    const profile = registry.get('vendor-product');
    expect(profile).not.toBeNull();
    expect(profile!.label).toBeTruthy();

    // (b) layers list and field layers are consistent
    expect(profile!.layers).toEqual(['vendor-product']);
    for (const field of profile!.fields) {
      expect(profile!.layers).toContain(field.layer);
    }

    // (c) drift guard: every declared path is a property in the schema
    for (const field of profile!.fields) {
      expect(schemaProps).toContain(field.path);
    }

    // (d) no only/default/selection/policy field
    const forbiddenPaths = ['only', 'default', 'selection', 'selected', 'policy'];
    for (const field of profile!.fields) {
      expect(forbiddenPaths).not.toContain(field.path);
    }

    // (e) existing lookups are unaffected
    expect(registry.lookup({ domain: 'media', formulationKind: 'complex_composition' }).id).toBe('media_composition');
    expect(registry.lookup({ domain: 'chemical' }).id).toBe('chemical');
  });
});
