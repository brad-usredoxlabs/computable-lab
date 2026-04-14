import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

// Cross-package test-only import. This file is excluded from tsc
// --noEmit by server/tsconfig.json ("exclude": ["**/*.test.ts"]), so
// the import is resolved at runtime by vitest/vite-node and does not
// affect the production build graph.
// @ts-expect-error cross-package import is test-only and outside rootDir
import { LABWARE_DEFINITIONS } from '../../../app/src/types/labwareDefinition';

const here = fileURLToPath(import.meta.url);
// server/src/seeds/ -> server/src -> server -> repoRoot
const repoRoot = resolve(here, '..', '..', '..', '..');
const defsDir = resolve(repoRoot, 'records', 'seed', 'labware-definition');

// Slugify rule (must match spec-016 and the on-disk files)
// Replace /, _, and @ with -, but keep dots (e.g., 3.4ml stays as 3.4ml)
function slugify(id: string): string {
  return id.replace(/[\/_@]/g, '-').toLowerCase();
}

type Yaml = Record<string, unknown>;

function loadRecord(recordId: string): Yaml {
  const path = resolve(defsDir, `${recordId}.yaml`);
  return yamlLoad(readFileSync(path, 'utf8')) as Yaml;
}

describe('labware-definition record parity', () => {
  it('records directory exists', () => {
    expect(existsSync(defsDir)).toBe(true);
  });

  for (const def of LABWARE_DEFINITIONS) {
    const recordId = `lbw-def-${slugify(def.id)}`;

    it(`has a matching record for ${def.id}`, () => {
      const path = resolve(defsDir, `${recordId}.yaml`);
      expect(existsSync(path), `missing ${recordId}.yaml for ${def.id}`).toBe(true);

      const record = loadRecord(recordId);

      // Identity fields
      expect(record.id).toBe(def.id);
      expect(record.kind).toBe('labware-definition');
      expect(record.recordId).toBe(recordId);
      expect(record.type).toBe('labware_definition');
      expect(record.display_name).toBe(def.display_name);

      // Optional scalar fields — assert presence iff present on TS
      for (const field of ['vendor', 'source', 'specificity', 'read_only'] as const) {
        if (def[field] !== undefined) {
          expect(record[field], `${field} missing from ${recordId}`).toEqual(def[field]);
        } else {
          expect(record[field]).toBeUndefined();
        }
      }

      // Platform aliases (array deep-equal)
      if (def.platform_aliases) {
        expect(record.platform_aliases).toEqual(def.platform_aliases);
      } else {
        expect(record.platform_aliases).toBeUndefined();
      }

      // Legacy labware types (required on TS)
      expect(record.legacy_labware_types).toEqual(def.legacy_labware_types);

      // Topology (nested deep-equal on every sub-field the TS entry populates)
      expect(record.topology).toEqual(def.topology);

      // Capacity
      expect(record.capacity).toEqual(def.capacity);

      // Aspiration hints (optional)
      if (def.aspiration_hints) {
        expect(record.aspiration_hints).toEqual(def.aspiration_hints);
      } else {
        expect(record.aspiration_hints).toBeUndefined();
      }

      // Render hints (optional)
      if (def.render_hints) {
        expect(record.render_hints).toEqual(def.render_hints);
      } else {
        expect(record.render_hints).toBeUndefined();
      }
    });
  }

  it('covers every spec-012 tube rack legacy type', () => {
    const required = [
      'tubeset_6x15ml',
      'tubeset_4x50ml',
      'tubeset_50x1p5ml',
      'tubeset_96x0p2ml',
      'tubeset_mixed_4x50ml_6x15ml',
    ];
    const files = readdirSync(defsDir).filter((f) => f.endsWith('.yaml'));
    const seen = new Set<string>();
    for (const f of files) {
      const r = loadRecord(f.replace(/\.yaml$/, ''));
      const lt = (r.legacy_labware_types as string[] | undefined) ?? [];
      for (const t of lt) seen.add(t);
    }
    for (const t of required) {
      expect(seen.has(t), `no record covers legacy type ${t}`).toBe(true);
    }
  });
});
