/**
 * DerivationBoundary invariant test
 * 
 * Per spec-073, this test asserts that no pass file outside the derive_context
 * family imports or references DerivationEngine. This catches "Issue-2" at the
 * file level - preventing unauthorized access to the derivation engine.
 * 
 * Approach:
 * - Read every .ts file under server/src/compiler/pipeline/passes/
 * - Exclude: this test file, DeriveContextPass.ts, and any *.test.ts files
 * - For each remaining file:
 *   - Extract the `family: '...'` literal
 *   - If no family literal, skip (not a Pass factory)
 *   - If family !== 'derive_context', grep for identifier 'DerivationEngine'
 *   - If found, fail the test with the offending file path + declared family
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const PASSES_DIR = join(__dirname);

/**
 * Get all TypeScript files in the passes directory (excluding tests and this file)
 */
function getPassSourceFiles(): string[] {
  const files = readdirSync(PASSES_DIR, { withFileTypes: true });
  
  return files
    .filter(dirent => {
      const name = dirent.name;
      // Skip directories
      if (!dirent.isFile()) return false;
      // Skip test files
      if (name.endsWith('.test.ts')) return false;
      // Skip this specific file
      if (name === 'DerivationBoundary.invariant.test.ts') return false;
      // Only include .ts files
      return extname(name) === '.ts';
    })
    .map(dirent => join(PASSES_DIR, dirent.name));
}

/**
 * Extract the family declaration from a pass source file
 * Returns the family string if found, null otherwise
 */
function extractFamily(content: string): string | null {
  // Match family: '...' or family: "..."
  const match = content.match(/family:\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Check if a file references DerivationEngine by identifier
 * This looks for the identifier 'DerivationEngine' as a type or import
 */
function referencesDerivationEngine(content: string): boolean {
  // Match DerivationEngine as a word boundary (not part of another identifier)
  // This catches: import ..., DerivationEngine, ...
  //                import { DerivationEngine }
  //                type DerivationEngine
  //                class Foo extends DerivationEngine
  //                const x: DerivationEngine
  const regex = /\bDerivationEngine\b/;
  return regex.test(content);
}

describe('DerivationBoundary invariant', () => {
  it('should fail if any non-derive_context pass imports DerivationEngine', () => {
    const sourceFiles = getPassSourceFiles();
    const violations: Array<{ file: string; family: string; message: string }> = [];

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const fileName = basename(filePath);
      
      const family = extractFamily(content);
      
      // Skip files without a family declaration (not Pass factories)
      if (family === null) {
        continue;
      }
      
      // Only check non-derive_context passes
      if (family !== 'derive_context') {
        if (referencesDerivationEngine(content)) {
          violations.push({
            file: filePath,
            family,
            message: `Pass file '${fileName}' declares family '${family}' but references DerivationEngine. Only derive_context family passes may use DerivationEngine.`,
          });
        }
      }
    }

    // Assert no violations found
    expect(violations).toEqual([]);
  });

  it('should detect a violation when a fixture file with wrong family imports DerivationEngine', () => {
    // This test proves the detector works by creating a temporary fixture
    // that violates the invariant, then checking that our detection logic catches it.
    
    const fixtureContent = `
/**
 * A fake pass that incorrectly tries to use DerivationEngine
 */
import type { DerivationEngine } from '../../derive/DerivationEngine.js';

export function createBadPass(): any {
  return {
    id: 'bad-pass',
    family: 'project',
    run: async () => ({ ok: true }),
  };
}
`;

    // Verify our detection logic would catch this
    const family = extractFamily(fixtureContent);
    const referencesEngine = referencesDerivationEngine(fixtureContent);
    
    expect(family).toBe('project');
    expect(referencesEngine).toBe(true);
    
    // The invariant test should fail for this content
    // (We're not actually writing this file, just proving our detection works)
    expect(family !== 'derive_context' && referencesEngine).toBe(true);
  });
});
