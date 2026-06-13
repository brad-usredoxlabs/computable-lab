import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
});
