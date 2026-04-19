import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { findMatchingLibraryExtractor } from './LibraryExtractorMatcher.js';

describe('LibraryExtractorMatcher', () => {
  let tempDir: string;

  afterEach(() => {
    // Clean up temp directory after each test
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('findMatchingLibraryExtractor', () => {
    it('returns non-null adapter when a matching spec is found', async () => {
      // Create a temporary library directory with a matching YAML spec
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
      
      const specContent = `
vendor: TestVendor
description: Test extraction spec
match:
  filePatterns:
    - '*.pdf'
  contentSignals:
    - 'test signal'
  minConfidence: 0.8
`;
      fs.writeFileSync(path.join(tempDir, 'test-spec.yaml'), specContent, 'utf8');

      // Call the function with a matching file and content
      const adapter = await findMatchingLibraryExtractor({
        fileName: 'test-document.pdf',
        contentPreview: 'This contains the test signal',
        libraryDir: tempDir,
      });

      // Assert that an adapter is returned
      expect(adapter).not.toBeNull();
      expect(adapter).toBeDefined();
    });

    it('returns null when no spec matches', async () => {
      // Create a temporary library directory with a non-matching YAML spec
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
      
      const specContent = `
vendor: TestVendor
description: Test extraction spec
match:
  filePatterns:
    - '*.xlsx'
  contentSignals:
    - 'different signal'
  minConfidence: 0.9
`;
      fs.writeFileSync(path.join(tempDir, 'test-spec.yaml'), specContent, 'utf8');

      // Call the function with a non-matching file and content
      const adapter = await findMatchingLibraryExtractor({
        fileName: 'test-document.pdf',
        contentPreview: 'Some random content without signals',
        libraryDir: tempDir,
      });

      // Assert that null is returned
      expect(adapter).toBeNull();
    });

    it('returned adapter\'s extract() method produces expected diagnostic', async () => {
      // Create a temporary library directory with a matching YAML spec
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
      
      const specContent = `
vendor: TestVendor
description: Test extraction spec
match:
  filePatterns:
    - '*.pdf'
  contentSignals:
    - 'test signal'
  minConfidence: 0.8
`;
      const specFile = 'test-spec.yaml';
      fs.writeFileSync(path.join(tempDir, specFile), specContent, 'utf8');

      // Call the function with a matching file and content
      const adapter = await findMatchingLibraryExtractor({
        fileName: 'test-document.pdf',
        contentPreview: 'This contains the test signal',
        libraryDir: tempDir,
      });

      // Assert that an adapter is returned
      expect(adapter).not.toBeNull();
      
      // Call the adapter's extract method
      const result = await adapter!.extract({ text: 'ignored content' });

      // Assert the result contains the expected diagnostic
      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'info',
        code: 'LIBRARY_SPEC_STUB',
        message: expect.stringContaining('test-spec.yaml'),
        details: { specFile: 'test-spec.yaml' },
      });
    });

    it('returned adapter never throws from extract()', async () => {
      // Create a temporary library directory with a matching YAML spec
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
      
      const specContent = `
vendor: TestVendor
description: Test extraction spec
match:
  filePatterns:
    - '*.pdf'
  contentSignals:
    - 'test signal'
`;
      fs.writeFileSync(path.join(tempDir, 'test-spec.yaml'), specContent, 'utf8');

      const adapter = await findMatchingLibraryExtractor({
        fileName: 'test-document.pdf',
        contentPreview: 'This contains the test signal',
        libraryDir: tempDir,
      });

      expect(adapter).not.toBeNull();
      
      // This should not throw
      expect(async () => {
        await adapter!.extract({ text: 'any content' });
      }).not.toThrow();
    });
  });
});
