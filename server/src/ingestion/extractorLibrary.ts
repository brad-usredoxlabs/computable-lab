import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

/**
 * Match result from the extractor library scanner
 */
export interface LibraryMatch {
  spec: Record<string, unknown>;
  confidence: number;
  specFile: string;
  vendor?: string;
  description?: string;
}

/**
 * Match configuration from an extraction spec
 */
interface MatchConfig {
  filePatterns: string[];
  contentSignals: string[];
  minConfidence?: number;
}

/**
 * Extraction spec structure (minimal interface for matching)
 */
interface ExtractionSpec {
  match?: {
    filePatterns?: string[];
    contentSignals?: string[];
    minConfidence?: number;
  };
  vendor?: string;
  description?: string;
  tableExtraction?: unknown;
  targets?: unknown[];
}

/**
 * Simple glob pattern matcher
 * Supports basic patterns like *.pdf, *.xlsx, etc.
 */
function matchesGlobPattern(filename: string, pattern: string): boolean {
  const lowerFilename = filename.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Handle simple wildcard patterns
  if (lowerPattern.startsWith('*.')) {
    const ext = lowerPattern.slice(1); // e.g., '.pdf'
    return lowerFilename.endsWith(ext);
  }

  // Handle patterns like 'cayman_*.pdf'
  if (lowerPattern.includes('*')) {
    const parts = lowerPattern.split('*');
    if (parts.length === 2) {
      const prefix = parts[0] ?? '';
      const suffix = parts[1] ?? '';
      return lowerFilename.startsWith(prefix) && lowerFilename.endsWith(suffix);
    }
  }

  // Exact match
  return lowerFilename === lowerPattern;
}

/**
 * Check if content contains a signal (case-insensitive)
 */
function containsSignal(content: string, signal: string): boolean {
  return content.toLowerCase().includes(signal.toLowerCase());
}

/**
 * Calculate confidence score based on content signals
 */
function calculateConfidence(contentSignals: string[], contentPreview: string): number {
  if (contentSignals.length === 0) return 1.0;

  let foundCount = 0;
  for (const signal of contentSignals) {
    if (containsSignal(contentPreview, signal)) {
      foundCount++;
    }
  }

  return foundCount / contentSignals.length;
}

/**
 * Load all extraction specs from the library directory
 */
function loadSpecsFromDirectory(libraryDir: string): Array<{ file: string; spec: ExtractionSpec }> {
  const specs: Array<{ file: string; spec: ExtractionSpec }> = [];

  if (!fs.existsSync(libraryDir)) {
    return specs;
  }

  const files = fs.readdirSync(libraryDir);
  for (const file of files) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
      continue;
    }

    const filePath = path.join(libraryDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = yaml.load(content) as ExtractionSpec;
      specs.push({ file, spec });
    } catch (error) {
      console.warn(`Failed to load extraction spec from ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return specs;
}

/**
 * Score a spec against a file based on match configuration
 */
function scoreSpec(
  spec: ExtractionSpec,
  filename: string,
  contentPreview: string,
): { score: number; matchesFilePattern: boolean } {
  const matchConfig = spec.match as MatchConfig | undefined;

  if (!matchConfig) {
    // No match config means it doesn't match
    return { score: 0, matchesFilePattern: false };
  }

  // Check file patterns
  let matchesFilePattern = false;
  if (matchConfig.filePatterns && matchConfig.filePatterns.length > 0) {
    matchesFilePattern = matchConfig.filePatterns.some(pattern =>
      matchesGlobPattern(filename, pattern)
    );
  } else {
    // If no file patterns specified, assume it matches
    matchesFilePattern = true;
  }

  if (!matchesFilePattern) {
    return { score: 0, matchesFilePattern: false };
  }

  // Calculate confidence based on content signals
  const confidence = calculateConfidence(
    matchConfig.contentSignals || [],
    contentPreview
  );

  return { score: confidence, matchesFilePattern: true };
}

/**
 * Find the best matching extraction spec for a given file
 * 
 * @param filename - The name of the file to match
 * @param contentPreview - First ~4000 characters of the file content
 * @param libraryDir - Directory containing extraction spec YAML files
 * @returns The best matching spec, or null if no match found
 */
export async function findMatchingSpec(
  filename: string,
  contentPreview: string,
  libraryDir: string,
): Promise<LibraryMatch | null> {
  const specs = loadSpecsFromDirectory(libraryDir);

  if (specs.length === 0) {
    return null;
  }

  let bestMatch: { spec: ExtractionSpec; confidence: number; file: string } | null = null;

  for (const { file, spec } of specs) {
    const { score } = scoreSpec(spec, filename, contentPreview);

    const minConfidence = (spec.match as MatchConfig | undefined)?.minConfidence ?? 1.0;

    if (score >= minConfidence) {
      if (!bestMatch || score > bestMatch.confidence) {
        bestMatch = {
          spec,
          confidence: score,
          file,
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  const result: LibraryMatch = {
    spec: bestMatch.spec as Record<string, unknown>,
    confidence: bestMatch.confidence,
    specFile: bestMatch.file,
  };
  
  if (bestMatch.spec.vendor) {
    result.vendor = bestMatch.spec.vendor;
  }
  if (bestMatch.spec.description) {
    result.description = bestMatch.spec.description;
  }
  
  return result;
}

/**
 * Get the default library directory path
 */
export function getDefaultLibraryDir(): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  return path.join(repoRoot, 'specs', 'extractors');
}

export default findMatchingSpec;
