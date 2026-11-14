import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

// Cross-package test-only import. This file is excluded from tsc
// --noEmit by server/tsconfig.json ("exclude": ["**/*.test.ts"]), so
// the import is resolved at runtime by vitest/vite-node and does not
// affect the production build graph.
// @ts-expect-error cross-package import is test-only and outside rootDir
import { LABWARE_DEFINITIONS } from '../../../app/src/types/labwareDefinition';

// L2-P1-SEED-ENTRY-1 (unit seeddefs2) — prompt-1 entry state.
// Ruling: .hermes/plans/decisions/PROMPT1-ENTRY-STATE-l2-20261113.md
// (Brad option (b)): the lab's stock must not already contain a generic
// 96-well deepwell plate, so scenario 1 can begin with the plate type
// ABSENT. The two seed definitions that make the entry state false must
// be pruned from the lab-layer seed, and nothing may still bind to their
// ids. "Identity is a record id, never a name" — after the change the ids
// below have no live binding anywhere. The vendored registry copy
// (schema/registry/labware-definitions/96-well-deepwell-plate.yaml) is the
// "not this lab's stock" catalogue tier and intentionally stays; it is not
// seeded, so it is out of scope for this guard.
const REMOVED_RECORD_IDS = [
  'lbw-def-generic-96-well-deep-plate',
  'lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1',
] as const;

// Definition ids the removed records carried (same slug rule the parity
// test pins: /, _, @ -> -).
const REMOVED_DEF_IDS = [
  'generic/96_well_deep_plate@v1',
  'opentrons/nest_96_wellplate_2ml_deep@v1',
] as const;

const here = fileURLToPath(import.meta.url);
// server/src/seeds/ -> server/src -> server -> repoRoot
const repoRoot = resolve(here, '..', '..', '..', '..');
const defsDir = resolve(repoRoot, 'records', 'seed', 'labware-definition');

describe('labware-definition seed absence (prompt-1 entry state, seeddefs2)', () => {
  for (const recordId of REMOVED_RECORD_IDS) {
    it(`seed store does not contain a file for ${recordId}`, () => {
      expect(existsSync(resolve(defsDir, `${recordId}.yaml`))).toBe(false);
    });

    it(`no labware-definition seed record carries recordId ${recordId}`, () => {
      const files = readdirSync(defsDir).filter((f) => f.endsWith('.yaml'));
      const carrying = files.filter((f) => {
        const r = yamlLoad(readFileSync(resolve(defsDir, f), 'utf8')) as { recordId?: unknown };
        return r.recordId === recordId;
      });
      expect(carrying, `recordId ${recordId} still present in: ${carrying.join(', ')}`).toEqual([]);
    });
  }

  for (const id of REMOVED_DEF_IDS) {
    it(`app catalogue does not offer ${id} (the deleted seed's definition id)`, () => {
      expect(LABWARE_DEFINITIONS.some((d) => d.id === id)).toBe(false);
    });
  }
});
