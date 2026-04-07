/**
 * TypeScript types for JSON Schema (Draft 2020-12 and Draft-07 compatible).
 * 
 * These are minimal types covering the subset of JSON Schema used in computable-lab.
 * We don't use a full library type to avoid unnecessary dependencies.
 */

/**
 * JSON Schema type values.
 */
export type JSONSchemaType = 
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/**
 * JSON Schema format values (common subset).
 */
export type JSONSchemaFormat =
  | 'date-time'
  | 'date'
  | 'time'
  | 'duration'
  | 'email'
  | 'uri'
  | 'uri-reference'
  | 'uuid'
  | 'regex'
  | string; // Allow custom formats

/**
 * JSON Schema definition (Draft 2020-12 / Draft-07 compatible subset).
 */
export interface JSONSchema {
  // Meta
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  definitions?: Record<string, JSONSchema>; // Draft-07 compatibility
  
  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  
  // Type
  type?: JSONSchemaType | JSONSchemaType[];
  const?: unknown;
  enum?: unknown[];
  
  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: JSONSchemaFormat;
  
  // Number
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  
  // Array
  items?: JSONSchema | JSONSchema[];
  prefixItems?: JSONSchema[];
  additionalItems?: JSONSchema | boolean;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchema;
  minContains?: number;
  maxContains?: number;
  
  // Object
  properties?: Record<string, JSONSchema>;
  patternProperties?: Record<string, JSONSchema>;
  additionalProperties?: JSONSchema | boolean;
  required?: string[];
  propertyNames?: JSONSchema;
  minProperties?: number;
  maxProperties?: number;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, JSONSchema>;
  
  // Composition
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  
  // Allow additional properties for extensions
  [key: string]: unknown;
}

/**
 * Check if a value looks like a JSON Schema object.
 */
export function isJSONSchema(value: unknown): value is JSONSchema {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  
  // A JSON Schema is an object that typically has at least one schema keyword
  const schemaKeywords = [
    '$schema', '$id', '$ref', 'type', 'properties', 'items',
    'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
    'const', 'enum', 'title', 'description'
  ];
  
  const obj = value as Record<string, unknown>;
  return schemaKeywords.some(key => key in obj);
}

/**
 * Extract the $id from a schema, or undefined if not present.
 */
export function getSchemaId(schema: JSONSchema): string | undefined {
  return typeof schema.$id === 'string' ? schema.$id : undefined;
}

/**
 * Extract all $ref URIs from a schema (non-recursive, top-level only).
 */
export function extractRefs(schema: JSONSchema): string[] {
  const refs: string[] = [];
  
  function walk(obj: unknown): void {
    if (obj === null || typeof obj !== 'object') {
      return;
    }
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        walk(item);
      }
      return;
    }
    
    const record = obj as Record<string, unknown>;
    
    if (typeof record['$ref'] === 'string') {
      refs.push(record['$ref']);
    }
    
    for (const value of Object.values(record)) {
      walk(value);
    }
  }
  
  walk(schema);
  return [...new Set(refs)]; // Deduplicate
}
