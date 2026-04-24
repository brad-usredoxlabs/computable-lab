/**
 * BaselineFixtures.test - Load and validate the four game-prompt fixtures.
 *
 * Verifies that each YAML fixture parses without error and has the
 * required top-level fields (name, input.prompt, mocked_ai_precompile_output,
 * expected).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFixture } from './FixtureTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_FILES = [
  'prompt-01-mint-samples.yaml',
  'prompt-02-zymo-magbead.yaml',
  'prompt-03-quadrant-qpcr.yaml',
  'prompt-04-fire-assay.yaml',
];

describe('BaselineFixtures', () => {
  for (const fileName of FIXTURE_FILES) {
    describe(fileName, () => {
      const yamlText = readFileSync(join(__dirname, fileName), 'utf-8');

      it('parses without throwing', () => {
        expect(() => parseFixture(yamlText)).not.toThrow();
      });

      it('has required fields', () => {
        const fixture = parseFixture(yamlText);

        expect(fixture.name).toBeDefined();
        expect(typeof fixture.name).toBe('string');
        expect(fixture.name.length).toBeGreaterThan(0);

        expect(fixture.input).toBeDefined();
        expect(typeof fixture.input.prompt).toBe('string');
        expect(fixture.input.prompt.length).toBeGreaterThan(0);

        expect(fixture.mocked_ai_precompile_output).toBeDefined();
        expect(Array.isArray(fixture.mocked_ai_precompile_output.candidateEvents)).toBe(true);
        expect(Array.isArray(fixture.mocked_ai_precompile_output.candidateLabwares)).toBe(true);
        expect(Array.isArray(fixture.mocked_ai_precompile_output.unresolvedRefs)).toBe(true);

        expect(fixture.expected).toBeDefined();
        expect(typeof fixture.expected.outcome).toBe('string');
        expect(['complete', 'gap']).toContain(fixture.expected.outcome);
        expect(Array.isArray(fixture.expected.terminalArtifacts?.events)).toBe(true);
        expect(Array.isArray(fixture.expected.terminalArtifacts?.gaps)).toBe(true);
      });
    });
  }
});
