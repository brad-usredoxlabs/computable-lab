/**
 * HARNESS-SEQ-2 (OQ1 ruling) — the tab-vocabulary drift fence.
 *
 * Three places name the sequences tabs:
 *   1. the DECLARED registry list  — schema/registry/surfaces/surfaces.yaml
 *      (`sequences.tabs`), the single source of truth;
 *   2. the agent-action schema fence — schema/workflow/agent-action.schema.yaml
 *      (`target.oneOf` sequence-tab arm's `tab` enum);
 *   3. the page constant — app/src/sequences/SequencesPage.tsx `tabs`.
 *
 * YAML is king: the registry list is the authority the compiler validates
 * against; the schema enum is a fast fence; the page const is the thing being
 * checked. If any two disagree, THIS test fails loud — that is the drift class
 * the fence exists to kill (a comment would not).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadDefaultSurfacesRegistry } from './surfaces.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');
const APP_SRC = resolve(__dirname, '../../../app/src');

function registryTabs(): string[] {
  const registry = loadDefaultSurfacesRegistry(SCHEMA_DIR);
  const sequences = registry.get('sequences');
  expect(sequences, 'the sequences surface must be declared').not.toBeNull();
  return (sequences!.tabs ?? []).slice();
}

function schemaTabs(): string[] {
  type TargetArm = { properties?: { tab?: { enum?: string[] } } };
  const raw = parse(readFileSync(join(SCHEMA_DIR, 'workflow/agent-action.schema.yaml'), 'utf8')) as {
    properties: { target: { oneOf: TargetArm[] } };
  };
  const arm = raw.properties.target.oneOf.find((candidate) => candidate.properties?.tab?.enum);
  expect(arm, 'the agent-action schema must declare a sequence-tab arm with a tab enum').toBeDefined();
  return (arm?.properties?.tab?.enum ?? []).slice();
}

function pageTabs(): string[] {
  const src = readFileSync(join(APP_SRC, 'sequences/SequencesPage.tsx'), 'utf8');
  const match = src.match(/const tabs\s*=\s*\[([^\]]*)\]\s*as const/);
  expect(match, 'SequencesPage.tsx must keep its declared `tabs` const').not.toBeNull();
  return (match![1] ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry.length > 0);
}

describe('sequences tab vocabulary — registry ≡ schema fence ≡ page const', () => {
  it('the surfaces registry DECLARES the sequences tabs (YAML is king)', () => {
    expect(registryTabs().length).toBeGreaterThan(0);
  });

  it('the agent-action schema fence and the registry list are SET-identical', () => {
    expect(schemaTabs().slice().sort()).toEqual(registryTabs().slice().sort());
  });

  it('the page constant matches the declared registry list byte-for-byte', () => {
    expect(pageTabs()).toEqual(registryTabs());
  });

  it('the declared list is ORDER-preserved everywhere (the fence is a list, not a bag)', () => {
    expect(pageTabs()).toEqual(schemaTabs());
  });
});
