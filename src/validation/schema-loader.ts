import { JSONSchema, SchemaLoader } from './types';

/**
 * Schema loader implementation
 */
export class SchemaLoaderImpl implements SchemaLoader {
  private cache = new Map<string, JSONSchema>();

  /**
   * Load schema by URI or path
   */
  async load(uri: string): Promise<JSONSchema> {
    // Check cache first
    if (this.cache.has(uri)) {
      return this.cache.get(uri)!;
    }

    try {
      // For file URIs, read from file system
      if (uri.startsWith('file://') || uri.startsWith('./') || uri.startsWith('../')) {
        const fs = await import('fs');
        const path = await import('path');
        
        const filePath = uri.startsWith('file://') 
          ? uri.substring(7) 
          : path.resolve(uri);
        
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Try to parse as JSON first, then YAML
        let schema: JSONSchema;
        try {
          schema = JSON.parse(content);
        } catch {
          const yaml = await import('js-yaml');
          schema = yaml.load(content) as JSONSchema;
        }
        
        this.cache.set(uri, schema);
        return schema;
      }

      // For HTTP/HTTPS URIs, fetch from web
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        const response = await fetch(uri);
        const content = await response.text();
        
        let schema: JSONSchema;
        try {
          schema = JSON.parse(content);
        } catch {
          const yaml = await import('js-yaml');
          schema = yaml.load(content) as JSONSchema;
        }
        
        this.cache.set(uri, schema);
        return schema;
      }

      // For local files without URI prefix
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(uri);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      let schema: JSONSchema;
      try {
        schema = JSON.parse(content);
      } catch {
        const yaml = await import('js-yaml');
        schema = yaml.load(content) as JSONSchema;
      }
      
      this.cache.set(uri, schema);
      return schema;
    } catch (error) {
      throw new Error(`Failed to load schema from ${uri}: ${error}`);
    }
  }

  /**
   * Load multiple schemas
   */
  async loadMultiple(uris: string[]): Promise<JSONSchema[]> {
    const schemas = await Promise.all(uris.map(uri => this.load(uri)));
    return schemas;
  }

  /**
   * Check if schema is loaded
   */
  isLoaded(uri: string): boolean {
    return this.cache.has(uri);
  }

  /**
   * Get loaded schema
   */
  get(uri: string): JSONSchema | undefined {
    return this.cache.get(uri);
  }

  /**
   * Unload schema
   */
  unload(uri: string): void {
    this.cache.delete(uri);
  }

  /**
   * Clear all loaded schemas
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Factory function to create schema loader
 */
export function createSchemaLoader(): SchemaLoaderImpl {
  return new SchemaLoaderImpl();
}