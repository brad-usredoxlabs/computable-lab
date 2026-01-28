/**
 * PathResolver — Resolves JSONPath-like paths in record data.
 * 
 * Supports a simplified subset of JSONPath:
 * - `$.foo` or `foo` — access property 'foo' from root
 * - `$.foo.bar` or `foo.bar` — nested property access
 * - `$[0]` or `[0]` — array index access
 * - `$.foo[0].bar` — combined property and array access
 * 
 * This is a pure, deterministic function with no external dependencies.
 */

/**
 * Result of resolving a path.
 */
export interface PathResolutionResult {
  /** Whether the path was successfully resolved */
  found: boolean;
  /** The resolved value (undefined if not found) */
  value: unknown;
  /** The parent object containing the final property (useful for checking existence) */
  parent?: unknown;
  /** The final property key */
  key?: string | number;
}

/**
 * Parse a JSONPath-like string into segments.
 * 
 * @param path - Path string (e.g., "$.foo.bar[0].baz" or "foo.bar")
 * @returns Array of path segments
 */
export function parsePath(path: string): Array<string | number> {
  // Normalize: remove leading $. if present
  let normalized = path.trim();
  if (normalized.startsWith('$.')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('$')) {
    normalized = normalized.slice(1);
  }
  
  // Empty path means root
  if (normalized === '' || normalized === '.') {
    return [];
  }
  
  const segments: Array<string | number> = [];
  let current = '';
  let i = 0;
  
  while (i < normalized.length) {
    const char = normalized[i];
    
    if (char === '.') {
      // Property separator
      if (current.length > 0) {
        segments.push(current);
        current = '';
      }
      i++;
    } else if (char === '[') {
      // Array index or bracket notation
      if (current.length > 0) {
        segments.push(current);
        current = '';
      }
      
      // Find closing bracket
      const closeIdx = normalized.indexOf(']', i);
      if (closeIdx === -1) {
        throw new Error(`Invalid path: unclosed bracket at position ${i}`);
      }
      
      const content = normalized.slice(i + 1, closeIdx);
      
      // Check if it's a number (array index) or string (property)
      if (/^\d+$/.test(content)) {
        segments.push(parseInt(content, 10));
      } else {
        // Remove quotes if present
        let key = content;
        if ((key.startsWith('"') && key.endsWith('"')) ||
            (key.startsWith("'") && key.endsWith("'"))) {
          key = key.slice(1, -1);
        }
        segments.push(key);
      }
      
      i = closeIdx + 1;
    } else {
      current += char;
      i++;
    }
  }
  
  // Don't forget the last segment
  if (current.length > 0) {
    segments.push(current);
  }
  
  return segments;
}

/**
 * Resolve a path in an object/array.
 * 
 * @param data - The data to resolve the path in
 * @param path - Path string or pre-parsed segments
 * @returns PathResolutionResult with found status and value
 */
export function resolvePath(
  data: unknown, 
  path: string | Array<string | number>
): PathResolutionResult {
  const segments = typeof path === 'string' ? parsePath(path) : path;
  
  // Empty path returns the root
  if (segments.length === 0) {
    return { found: true, value: data };
  }
  
  let current: unknown = data;
  let parent: unknown = undefined;
  let key: string | number | undefined = undefined;
  
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return { found: false, value: undefined };
    }
    
    parent = current;
    key = segment;
    
    if (typeof segment === 'number') {
      // Array index access
      if (!Array.isArray(current)) {
        return { found: false, value: undefined };
      }
      if (segment < 0 || segment >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[segment];
    } else {
      // Property access
      if (typeof current !== 'object') {
        return { found: false, value: undefined };
      }
      const obj = current as Record<string, unknown>;
      if (!(segment in obj)) {
        return { found: false, value: undefined };
      }
      current = obj[segment];
    }
  }
  
  // key will always be defined if we entered the loop (segments.length > 0)
  return {
    found: true,
    value: current,
    ...(parent !== undefined ? { parent } : {}),
    ...(key !== undefined ? { key } : {}),
  };
}

/**
 * Check if a path exists in the data.
 * 
 * @param data - The data to check
 * @param path - Path string
 * @returns true if the path exists
 */
export function pathExists(data: unknown, path: string): boolean {
  return resolvePath(data, path).found;
}

/**
 * Get the value at a path, or undefined if not found.
 * 
 * @param data - The data to get from
 * @param path - Path string
 * @returns The value at the path, or undefined
 */
export function getPath(data: unknown, path: string): unknown {
  return resolvePath(data, path).value;
}

/**
 * Check if a value is "empty" for lint purposes.
 * Empty means: undefined, null, empty string, empty array, or empty object.
 * 
 * @param value - The value to check
 * @returns true if the value is considered empty
 */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  
  return false;
}

/**
 * Check if a path has a non-empty value.
 * 
 * @param data - The data to check
 * @param path - Path string
 * @returns true if the path exists and has a non-empty value
 */
export function pathIsNonEmpty(data: unknown, path: string): boolean {
  const result = resolvePath(data, path);
  if (!result.found) {
    return false;
  }
  return !isEmpty(result.value);
}

/**
 * Extract paths from a message template.
 * Finds all {{path}} placeholders.
 * 
 * @param template - Message template string
 * @returns Array of paths found in the template
 */
export function extractTemplatePaths(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const paths: string[] = [];
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    const path = match[1];
    if (path !== undefined) {
      paths.push(path.trim());
    }
  }
  
  return paths;
}

/**
 * Interpolate paths in a message template.
 * Replaces {{path}} with the resolved value.
 * 
 * @param template - Message template string
 * @param data - Data to resolve paths from
 * @param paths - Optional explicit list of paths to use
 * @returns Interpolated message string
 */
export function interpolateTemplate(
  template: string, 
  data: unknown, 
  paths?: string[]
): string {
  const pathList = paths ?? extractTemplatePaths(template);
  
  let result = template;
  
  for (const path of pathList) {
    const value = getPath(data, path);
    const placeholder = `{{${path}}}`;
    const replacement = value !== undefined ? String(value) : `<${path}>`;
    result = result.replace(placeholder, replacement);
  }
  
  return result;
}
