/**
 * Shared test workspace setup helper.
 *
 * Creates the minimal schema/registry structure that `initializeApp` requires
 * before it can start. Each test that calls `initializeApp` with a temp
 * directory should call `setupTestWorkspace()` before doing so.
 *
 * The single root cause: `initializeApp` (server.ts:363) calls
 * `loadDefaultMaterialProfileRegistry(schemaDir)` which expects
 * `schema/lab/material-profile.registry.yaml` to exist.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Minimal material profile registry content that satisfies the registry loader.
 * Each profile declares 6 domains with a single `name` field.
 */
export const MATERIAL_PROFILE_REGISTRY = [
  'version: 1',
  'profiles:',
  '  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
  '',
].join('\n');

/**
 * Create the schema/registry files that `initializeApp` expects to find in a
 * test workspace. Call this once per test file, after creating `testDir` but
 * before calling `initializeApp`.
 *
 * @param testDir  Root directory of the test workspace (equivalent to the
 *                 `basePath` passed to `initializeApp`).
 * @param schemaDir  Relative or absolute path of the schema directory
 *                    (default: `schema`).
 */
export async function setupTestWorkspace(
  testDir: string,
  schemaDir = 'schema',
): Promise<void> {
  const schemaPath = resolve(testDir, schemaDir);
  const labPath = resolve(schemaPath, 'lab');
  await mkdir(labPath, { recursive: true });
  await writeFile(
    resolve(labPath, 'material-profile.registry.yaml'),
    MATERIAL_PROFILE_REGISTRY,
  );
}
