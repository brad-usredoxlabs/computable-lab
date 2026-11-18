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
// L2-P1-SEED-ENTRY-1 (unit seedreg): the surviving store record's recordId —
// the ONE identity for the 96-well deepwell concept (see the registry guard
// below). The registry's deepwell entry must carry THIS recordId, never a
// slug minted from the display name.
const DEEPWELL_CANONICAL = 'lbw-def-generic-96-well-deep-plate';

const here = fileURLToPath(import.meta.url);
// server/src/seeds/ -> server/src -> server -> repoRoot
const repoRoot = resolve(here, '..', '..', '..', '..');
const defsDir = resolve(repoRoot, 'records', 'seed', 'labware-definition');
// The vendored catalogue tier the seed-reg unit opens: the registry that
// seeddefs2 left with the deepwell slug still on it.
const registryDir = resolve(repoRoot, 'schema', 'registry', 'labware-definitions');

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

  // L2-P1-SEED-ENTRY-1 (unit seedreg) — the registry half of the identity
  // ruling (DEFINITION-IDENTITY-UNIQUENESS-l2-20261113): "A registry may not
  // invent an identity. If the registry needs an entry for a store record,
  // that entry's id IS the store recordId." Test the registry tier as a set
  // relation, not a spot check: the surviving store record's recordId
  // (DEEPWELL_CANONICAL) is claimed by EXACTLY ONE registry file — the
  // surviving deepwell geometry reference — and no registry file mints a
  // recordId a second time. The slug identity must not survive here either;
  // this guard is keyed on the surviving recordId and the definition id, so
  // it fails loudly the moment a slug twin or a second claimant appears.
  it('the registry carries the surviving deepwell recordId exactly once (no second identity, no slug minting)', () => {
    const files = readdirSync(registryDir).filter((f) => f.endsWith('.yaml'));
    const entries = files.map((f) => {
      const r = yamlLoad(readFileSync(resolve(registryDir, f), 'utf8')) as {
        id?: unknown;
        recordId?: unknown;
      };
      return { file: f, id: r.id, recordId: r.recordId };
    });
    // No slug minting: every registry recordId is distinct.
    const recordIds = entries.map((e) => e.recordId);
    const mintedTwice = recordIds.filter((rid, i) => recordIds.indexOf(rid) !== i);
    expect(
      mintedTwice,
      `registry recordId minted more than once: ${[...new Set(mintedTwice)].join(', ')}`,
    ).toEqual([]);
    // The surviving identity is claimed by exactly one registry file.
    const claimants = entries.filter((e) => e.recordId === DEEPWELL_CANONICAL);
    expect(
      claimants.map((e) => e.file),
      `recordId ${DEEPWELL_CANONICAL} claimed by: ${claimants.map((e) => e.file).join(', ') || '(nobody)'}`,
    ).toHaveLength(1);
    // …and that claimant is the surviving deepwell geometry reference
    // (definition id 96-well-deepwell-plate) carrying the surviving store
    // recordId — never a slug minted from the display name.
    const deepwell = entries.find((e) => e.id === '96-well-deepwell-plate');
    expect(deepwell, 'registry file with definition id 96-well-deepwell-plate is missing').toBeDefined();
    expect(
      deepwell?.recordId,
      'the registry deepwell entry does not carry the surviving store recordId (it still carries a slug identity)',
    ).toBe(DEEPWELL_CANONICAL);
  });
});
