/**
 * PathConvention — File path conventions for records.
 * 
 * Convention:
 * - Records live under `records/{kind}/`
 * - Filename: `{recordId}__{slug}.yaml`
 * - Example: `records/study/STU-000003__hepatocyte-viability.yaml`
 */

/**
 * Result of parsing a record path.
 */
export interface ParsedPath {
  /** Record ID extracted from filename */
  recordId: string;
  /** Record kind (directory name) */
  kind: string;
  /** Human-readable slug from filename */
  slug: string;
  /** Full relative path */
  path: string;
  /** File extension */
  extension: string;
}

/**
 * Options for generating a path.
 */
export interface PathGenerationOptions {
  /** Record ID */
  recordId: string;
  /** Record kind */
  kind: string;
  /** Human-readable slug (optional, derived from title if not provided) */
  slug?: string;
  /** File extension (default: 'yaml') */
  extension?: string;
  /** Base directory (default: 'records') */
  baseDir?: string;
}

/**
 * Path separator pattern.
 */
const PATH_SEPARATOR = '__';

/**
 * Valid record ID patterns (common prefixes).
 */
const RECORD_ID_PATTERNS = [
  /^STU-\d+$/,      // Study
  /^EXP-\d+$/,      // Experiment
  /^RUN-\d+$/,      // Run
  /^PRO-\d+$/,      // Protocol
  /^MAT-[\w-]+$/,   // Material
  /^INS-[\w-]+$/,   // Instrument
  /^LW-[\w-]+$/,    // Labware
  /^LWI-[\w-]+$/,   // Labware Instance
  /^CLM-\d+$/,      // Claim
  /^AST-\d+$/,      // Assertion
  /^EVD-\d+$/,      // Evidence
  /^NAR-\d+$/,      // Narrative
  /^TML-\d+$/,      // Timeline
  /^WCX-\d+$/,      // Well Context
  /^[\w]+-[\w-]+$/, // Generic pattern (prefix-identifier)
];

/**
 * Slugify a string for use in filenames.
 * 
 * @param text - Text to slugify
 * @returns URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/\s+/g, '-')      // Replace spaces with dashes
    .replace(/-+/g, '-')       // Collapse multiple dashes
    .replace(/^-+|-+$/g, '');  // Trim leading/trailing dashes
}

/**
 * Generate a canonical file path for a record.
 * 
 * @param options - Path generation options
 * @returns Generated path (e.g., "records/study/STU-000001__my-study.yaml")
 */
export function generatePath(options: PathGenerationOptions): string {
  const {
    recordId,
    kind,
    slug,
    extension = 'yaml',
    baseDir = 'records',
  } = options;
  
  // Validate recordId
  if (!recordId || recordId.trim().length === 0) {
    throw new Error('recordId is required');
  }
  
  // Validate kind
  if (!kind || kind.trim().length === 0) {
    throw new Error('kind is required');
  }
  
  // Generate or use provided slug
  const safeSlug = slug ? slugify(slug) : 'untitled';
  
  // Build filename
  const filename = `${recordId}${PATH_SEPARATOR}${safeSlug}.${extension}`;
  
  // Build full path
  return `${baseDir}/${kind}/${filename}`;
}

/**
 * Parse a record file path into components.
 * 
 * @param path - File path to parse (e.g., "records/study/STU-000001__my-study.yaml")
 * @returns ParsedPath or null if path doesn't match convention
 */
export function parseRecordPath(path: string): ParsedPath | null {
  // Normalize path separators
  const normalizedPath = path.replace(/\\/g, '/');
  
  // Extract filename
  const parts = normalizedPath.split('/');
  const filename = parts[parts.length - 1];
  
  if (!filename) {
    return null;
  }
  
  // Check for path separator in filename
  if (!filename.includes(PATH_SEPARATOR)) {
    return null;
  }
  
  // Split filename by separator
  const separatorIndex = filename.indexOf(PATH_SEPARATOR);
  const recordId = filename.slice(0, separatorIndex);
  const rest = filename.slice(separatorIndex + PATH_SEPARATOR.length);
  
  // Extract slug and extension
  const dotIndex = rest.lastIndexOf('.');
  if (dotIndex === -1) {
    return null;
  }
  
  const slug = rest.slice(0, dotIndex);
  const extension = rest.slice(dotIndex + 1);
  
  // Extract kind from path (second-to-last component)
  const kind = parts.length >= 2 ? parts[parts.length - 2] : '';
  
  if (!kind) {
    return null;
  }
  
  return {
    recordId,
    kind,
    slug,
    path: normalizedPath,
    extension,
  };
}

/**
 * Validate that a path follows the naming convention.
 * 
 * @param path - Path to validate
 * @returns true if path follows convention
 */
export function isValidPath(path: string): boolean {
  return parseRecordPath(path) !== null;
}

/**
 * Extract recordId from a file path.
 * 
 * @param path - File path
 * @returns recordId or null if path doesn't match convention
 */
export function extractRecordIdFromPath(path: string): string | null {
  const parsed = parseRecordPath(path);
  return parsed?.recordId ?? null;
}

/**
 * Extract kind from a file path.
 * 
 * @param path - File path
 * @returns kind or null if path doesn't match convention
 */
export function extractKindFromPath(path: string): string | null {
  const parsed = parseRecordPath(path);
  return parsed?.kind ?? null;
}

/**
 * Validate that a record ID matches expected patterns.
 * 
 * @param recordId - Record ID to validate
 * @returns true if recordId matches a known pattern
 */
export function isValidRecordId(recordId: string): boolean {
  return RECORD_ID_PATTERNS.some(pattern => pattern.test(recordId));
}

/**
 * Get the directory for a record kind.
 * 
 * @param kind - Record kind
 * @param baseDir - Base directory (default: 'records')
 * @returns Directory path (e.g., "records/study")
 */
export function getKindDirectory(kind: string, baseDir: string = 'records'): string {
  return `${baseDir}/${kind}`;
}

/**
 * Generate a glob pattern for listing records of a kind.
 * 
 * @param kind - Record kind (optional, all kinds if not provided)
 * @param baseDir - Base directory (default: 'records')
 * @returns Glob pattern
 */
export function getGlobPattern(kind?: string, baseDir: string = 'records'): string {
  if (kind) {
    return `${baseDir}/${kind}/*${PATH_SEPARATOR}*.yaml`;
  }
  return `${baseDir}/**/*${PATH_SEPARATOR}*.yaml`;
}

/**
 * Build a path filter function for a specific kind.
 * 
 * @param kind - Record kind to filter by
 * @returns Filter function
 */
export function kindFilter(kind: string): (path: string) => boolean {
  return (path: string) => {
    const parsed = parseRecordPath(path);
    return parsed?.kind === kind;
  };
}

/**
 * Build a path filter function for a record ID prefix.
 * 
 * @param prefix - Record ID prefix (e.g., "STU-")
 * @returns Filter function
 */
export function prefixFilter(prefix: string): (path: string) => boolean {
  return (path: string) => {
    const parsed = parseRecordPath(path);
    return parsed?.recordId.startsWith(prefix) ?? false;
  };
}
