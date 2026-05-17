/**
 * Fix-it fixture discovery test.
 *
 * Scans this directory for `spec-fix-*.yaml` files and runs each one
 * through the deterministic precompile via FixtureRunner. New fix-it
 * sessions land their failing-prompt fixture here as part of the spec
 * synthesis step; the coder agent must make all of them pass before
 * its patch is committed.
 *
 * Run a specific fixture with:
 *   npx vitest run server/src/compiler/pipeline/fixtures/FixItFixtures.test.ts -t '<fixture-name>'
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { diffFixture } from './FixtureDiff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPEC_FIX_PATTERN = /^spec-fix-.+\.yaml$/;

const fixtureFiles = readdirSync(__dirname)
  .filter((name) => SPEC_FIX_PATTERN.test(name))
  .sort();

// If there are no fix-it fixtures yet, the suite still defines a single test
// so it's discoverable in CI output. (vitest dislikes empty describe blocks.)
describe('FixItFixtures', () => {
  if (fixtureFiles.length === 0) {
    it('no spec-fix-*.yaml fixtures yet (this is fine; nothing to run)', () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const fileName of fixtureFiles) {
    const yamlText = readFileSync(join(__dirname, fileName), 'utf-8');
    const fixture = parseFixture(yamlText);

    // The test name == fixture name so the coder agent can target a single
    // fixture from the spec via `-t '<fixture-name>'`.
    it(fixture.name, async () => {
      const result = await runFixture(fixture);
      const diff = diffFixture(result, fixture.expected);
      // Missing keys = expected fields the actual output doesn't have.
      // Treat any missing as a hard fail; partial/extra are advisory.
      expect(diff.missing, `missing keys: ${diff.missing.join(', ')}`).toEqual([]);
    });
  }
});
