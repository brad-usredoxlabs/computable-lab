import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
// ABSENT. The two seed definitions that made the entry state false are
// pruned from the lab-layer seed, and nothing binds to their ids.
// This guard is type-level by design: "Identity is a record id, never a
// name" — the ids themselves must not survive in code either, so absence
// is proven where the scenario's invariant actually lives: no seeded
// labware-definition and no app-catalogue definition carries the
// 96-well deepwell legacy type. (Any record that carried those ids
// carried this legacy type, so type-absence implies id-absence.)
// The vendored registry copy (schema/registry/…) is the "not this lab's
// stock" catalogue tier; it is not seeded and is not app-catalogue
// stock, so it is out of scope here.
const DEEPWELL_96 = 'deepwell_96';

const here = fileURLToPath(import.meta.url);
// server/src/seeds/ -> server/src -> server -> repoRoot
const repoRoot = resolve(here, '..', '..', '..', '..');
const defsDir = resolve(repoRoot, 'records', 'seed', 'labware-definition');

describe('labware-definition seed absence (prompt-1 entry state, seeddefs2)', () => {
  it('no seeded labware-definition carries the 96-well deepwell legacy type', () => {
    const files = readdirSync(defsDir).filter((f) => f.endsWith('.yaml'));
    const carrying = files.filter((f) => {
      const r = yamlLoad(readFileSync(resolve(defsDir, f), 'utf8')) as {
        legacy_labware_types?: unknown;
      };
      return Array.isArray(r.legacy_labware_types) && r.legacy_labware_types.includes(DEEPWELL_96);
    });
    expect(carrying, `deepwell_96 definitions still seeded: ${carrying.join(', ')}`).toEqual([]);
  });

  it('the app catalogue offers no 96-well deepwell definition', () => {
    const offering = LABWARE_DEFINITIONS.filter((d) =>
      d.legacy_labware_types.includes(DEEPWELL_96)
    );
    expect(offering.map((d) => d.id), 'deepwell_96 offered by the app catalogue').toEqual([]);
  });
});
