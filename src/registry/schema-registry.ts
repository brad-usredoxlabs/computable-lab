import { JSONSchema, ValidationResult, SchemaRegistry as ISchemaRegistry, Validator, SchemaLoader } from '../types/common';
import { createAjvValidator } from '../validation/ajv-validator';

// Type aliases for compatibility
type AjvValidatorLike = {
  addSchema: (schema: JSONSchema, uri?: string) => void;
  removeSchema: (uri: string) => void;
  getSchema: (uri: string) => any;
};

interface SchemaRegistrationError {
  uri: string;
  reason: string;
  ajvErrors?: any[];
}

interface MissingDependencyError {
  uri: string;
  missing: string[];
  requiredBy: Record<string, string[]>;
}

/**
 * Schema Registry - Central registry for managing JSON schemas
 * Implements identity, lifecycle, dependency graph, and deterministic loading rules
 */
export class SchemaRegistry implements ISchemaRegistry {
  private schemas = new Map<string, { schema: JSONSchema; hash: string }>();
  private validators = new Map<string, Validator>();
  private loader: SchemaLoader;
  private ajvValidator: Validator;

  constructor(loader: SchemaLoader, ajvValidator?: Validator) {
    this.loader = loader;
    this.ajvValidator = ajvValidator || createAjvValidator();
  }

  /**
   * Register a schema in the registry
   * @param uri - Canonical schema identifier
   * @param schema - JSON schema to register
   * @param options - Registration options
   * @throws SchemaRegistrationError if validation fails or schema already exists with different content
   */
  register(uri: string, schema: JSONSchema, options: { allowOverride?: boolean } = {}): void {
    // Validate schema before registration using AJV meta-schema validation
    const validation = this.ajvValidator.validateSchema(schema);
    if (!validation.valid) {
      throw new Error(`Schema validation failed for ${uri}: ${validation.errors.map((e: any) => e.message).join(', ')}`);
    }

    // Check if schema has $id and ensure it matches uri
    if (schema.$id && schema.$id !== uri) {
      throw new Error(`Schema $id "${schema.$id}" does not match registration URI "${uri}"`);
    }

    // Compute canonical hash for drift detection
    const canonical = this.canonicalizeSchema(schema);
    const hash = this.computeHash(canonical);

    // Check for existing schema
    const existing = this.schemas.get(uri);
    if (existing) {
      if (existing.hash !== hash) {
        if (!options.allowOverride) {
          throw new Error('Schema with same URI already exists with different content');
        }
        // Override existing schema
        this.schemas.set(uri, { schema, hash });
        this.validators.delete(uri); // Clear cached validator
      }
      // No-op if identical
      return;
    }

    // Register new schema
    this.schemas.set(uri, { schema, hash });
    this.validators.delete(uri); // Clear cached validator
  }

  /**
   * Unregister a schema from the registry
   */
  unregister(uri: string): void {
    this.schemas.delete(uri);
    this.validators.delete(uri);
  }

  /**
   * Get a schema by URI
   */
  get(uri: string): JSONSchema | undefined {
    return this.schemas.get(uri)?.schema;
  }

  /**
   * Check if a schema is registered
   */
  has(uri: string): boolean {
    return this.schemas.has(uri);
  }

  /**
   * Get all registered schema URIs
   */
  list(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate a schema against the JSON Schema meta-schema
   */
  validateSchema(schema: JSONSchema): ValidationResult {
    return this.ajvValidator.validateSchema(schema);
  }

  /**
   * Get a validator for a specific schema
   * Throws error if no validator backend is configured
   */
  getValidator(uri: string): Validator | undefined {
    // If not cached, create and cache it
    if (!this.validators.has(uri)) {
      const schema = this.get(uri);
      if (schema) {
        const validator = this.ajvValidator;
        this.validators.set(uri, validator);
      }
    }
    return this.validators.get(uri);
  }

  /**
   * Add all schemas to validator
   */
  addAllToValidator(validator: AjvValidatorLike): void {
    // Add all registered schemas to the AJV instance
    for (const [uri, { schema }] of this.schemas) {
      validator.addSchema(schema, uri);
    }
  }

  /**
   * Resolve reference to absolute URI
   */
  resolveRef(fromUri: string, ref: string): string {
    if (ref.startsWith('#')) {
      // Internal reference - resolve relative to fromUri
      return `${fromUri}${ref}`;
    }
    
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      // Absolute URI
      return ref;
    }
    
    // Relative URI - resolve against fromUri's base
    // Simple approach: assume ref is relative to fromUri
    if (fromUri.endsWith('/')) {
      return fromUri + ref;
    } else {
      const lastSlash = fromUri.lastIndexOf('/');
      if (lastSlash > 0) {
        return fromUri.substring(0, lastSlash + 1) + ref;
      }
      return ref;
    }
  }

  /**
   * Get schema dependencies
   */
  getDependencies(uri: string): string[] {
    const schema = this.get(uri);
    if (!schema) return [];

    const dependencies: string[] = [];
    
    // Extract $ref dependencies
    const extractRefs = (obj: any): void => {
      if (typeof obj === 'object' && obj !== null) {
        if (obj.$ref && typeof obj.$ref === 'string') {
          const resolvedRef = this.resolveRef(uri, obj.$ref);
          if (resolvedRef !== uri) { // Exclude self-references
            // Strip fragment for dependency tracking
            const baseUri = resolvedRef.split('#')[0];
            if (baseUri && baseUri !== uri) {
              dependencies.push(baseUri);
            }
          }
        }
        Object.values(obj).forEach(value => {
          if (typeof value === 'object') {
            extractRefs(value);
          }
        });
      }
    };

    extractRefs(schema);
    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Validate schema dependencies
   */
  validateDependencies(uri: string): { valid: boolean; missing: string[] } {
    const dependencies = this.getDependencies(uri);
    const missing = dependencies.filter(dep => !this.has(dep));
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Load schema graph
   */
  async loadGraph(entryUris: string[]): Promise<void> {
    const loaded = new Set<string>();
    const toLoad = [...entryUris];
    const missingDeps = new Map<string, string[]>();

    while (toLoad.length > 0) {
      const uri = toLoad.shift()!;
      
      if (loaded.has(uri)) continue;
      if (this.has(uri)) {
        loaded.add(uri);
        continue;
      }

      try {
        const schema = await this.loader.load(uri);
        this.register(uri, schema);
        loaded.add(uri);
      } catch (error) {
        // Track missing dependencies
        if (!missingDeps.has(uri)) {
          missingDeps.set(uri, []);
        }
        missingDeps.get(uri)!.push(uri);
        throw new Error(`Failed to load schema from ${uri}: ${error}`);
      }
    }
  }

  /**
   * Canonicalize schema for deterministic comparison
   */
  private canonicalizeSchema(schema: any): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.canonicalizeSchema(item));
    }

    const canonical: any = {};
    const keys = Object.keys(schema).sort();
    
    for (const key of keys) {
      canonical[key] = this.canonicalizeSchema(schema[key]);
    }
    
    return canonical;
  }

  /**
   * Compute hash of canonical schema
   */
  private computeHash(data: any): string {
    // Simple hash function for now
    let hash = 0;
    const dataString = JSON.stringify(data);
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Load schemas from a directory or file
   */
  async loadFromDirectory(dirPath: string): Promise<void> {
    // This would implement directory scanning and schema loading
    // For now, this is a placeholder
    throw new Error('Directory loading not implemented yet');
  }

  /**
   * Load schemas from multiple URIs
   */
  async loadMultiple(uris: string[]): Promise<void> {
    const loadPromises = uris.map(async (uri) => {
      try {
        const schema = await this.loader.load(uri);
        this.register(uri, schema);
      } catch (error) {
        // Skip console error handling
        throw error;
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Clear all registered schemas
   */
  clear(): void {
    this.schemas.clear();
    this.validators.clear();
  }
}

/**
 * Factory function to create a schema registry
 */
export function createSchemaRegistry(loader: SchemaLoader, ajvValidator?: Validator): SchemaRegistry {
  return new SchemaRegistry(loader, ajvValidator);
}