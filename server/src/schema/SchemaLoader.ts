/**
 * SchemaLoader — Loads JSON Schema files from the file system.
 * 
 * This module handles:
 * - Reading YAML and JSON schema files
 * - Parsing and validating basic structure
 * - Extracting $id and $ref dependencies
 * 
 * It does NOT handle:
 * - Schema validation (that's AjvValidator's job)
 * - $ref resolution (that's SchemaRegistry's job)
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { 
  type JSONSchema, 
  isJSONSchema, 
  getSchemaId, 
  extractRefs 
} from './json-schema.js';
import type { 
  SchemaEntry, 
  SchemaLoadResult, 
  SchemaLoadAllResult,
  SchemaLoadOptions 
} from './types.js';

/**
 * Default file patterns for schema files.
 */
const DEFAULT_PATTERNS = ['*.schema.yaml', '*.schema.json'];

/**
 * Check if a filename matches any of the patterns.
 */
function matchesPattern(filename: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    // Simple glob matching: *.schema.yaml -> ends with .schema.yaml
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return filename.endsWith(suffix);
    }
    return filename === pattern;
  });
}

/**
 * Parse a schema file content (YAML or JSON).
 */
function parseSchemaContent(content: string, filePath: string): unknown {
  const ext = extname(filePath).toLowerCase();
  
  if (ext === '.json') {
    return JSON.parse(content);
  }
  
  // Default to YAML for .yaml, .yml, or any other extension
  return parseYaml(content);
}

/**
 * Load a single schema file.
 * 
 * @param filePath - Absolute path to the schema file
 * @param basePath - Base directory for computing relative paths
 * @returns SchemaLoadResult with the loaded entry or error
 */
export async function loadSchemaFile(
  filePath: string,
  basePath: string
): Promise<SchemaLoadResult> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = parseSchemaContent(content, filePath);
    
    if (!isJSONSchema(parsed)) {
      return {
        success: false,
        error: `File does not contain a valid JSON Schema: ${filePath}`,
      };
    }
    
    const schema = parsed as JSONSchema;
    const id = getSchemaId(schema);
    
    if (id === undefined) {
      return {
        success: false,
        error: `Schema missing $id: ${filePath}`,
      };
    }
    
    const relativePath = relative(basePath, filePath);
    const dependencies = extractRefs(schema);
    
    const entry: SchemaEntry = {
      id,
      path: relativePath,
      schema,
      dependencies,
    };
    
    return { success: true, entry };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to load schema ${filePath}: ${message}`,
    };
  }
}

/**
 * Recursively find all schema files in a directory.
 * 
 * @param dirPath - Directory to search
 * @param patterns - File patterns to match
 * @param recursive - Whether to search recursively
 * @returns Array of absolute file paths
 */
async function findSchemaFiles(
  dirPath: string,
  patterns: string[],
  recursive: boolean
): Promise<string[]> {
  const files: string[] = [];
  
  const entries = await readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      if (recursive) {
        const subFiles = await findSchemaFiles(fullPath, patterns, recursive);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && matchesPattern(entry.name, patterns)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Load all schemas from a directory.
 * 
 * @param options - Loading options
 * @returns SchemaLoadAllResult with loaded entries and any errors
 */
export async function loadAllSchemas(
  options: SchemaLoadOptions
): Promise<SchemaLoadAllResult> {
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const recursive = options.recursive ?? true;
  
  // Verify base path exists and is a directory
  try {
    const stats = await stat(options.basePath);
    if (!stats.isDirectory()) {
      return {
        entries: [],
        errors: [{ path: options.basePath, error: 'Not a directory' }],
      };
    }
  } catch {
    return {
      entries: [],
      errors: [{ path: options.basePath, error: 'Directory does not exist' }],
    };
  }
  
  const filePaths = await findSchemaFiles(options.basePath, patterns, recursive);
  
  const entries: SchemaEntry[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  
  for (const filePath of filePaths) {
    const result = await loadSchemaFile(filePath, options.basePath);
    
    if (result.success && result.entry !== undefined) {
      entries.push(result.entry);
    } else if (result.error !== undefined) {
      errors.push({ 
        path: relative(options.basePath, filePath), 
        error: result.error 
      });
    }
  }
  
  return { entries, errors };
}

/**
 * Load schemas from content strings (for testing or in-memory use).
 * 
 * @param schemas - Map of path to content string
 * @returns SchemaLoadAllResult with loaded entries and any errors
 */
export function loadSchemasFromContent(
  schemas: Map<string, string>
): SchemaLoadAllResult {
  const entries: SchemaEntry[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  
  for (const [path, content] of schemas) {
    try {
      const parsed = parseSchemaContent(content, path);
      
      if (!isJSONSchema(parsed)) {
        errors.push({ path, error: 'Not a valid JSON Schema' });
        continue;
      }
      
      const schema = parsed as JSONSchema;
      const id = getSchemaId(schema);
      
      if (id === undefined) {
        errors.push({ path, error: 'Schema missing $id' });
        continue;
      }
      
      const dependencies = extractRefs(schema);
      
      entries.push({
        id,
        path,
        schema,
        dependencies,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ path, error: message });
    }
  }
  
  return { entries, errors };
}
