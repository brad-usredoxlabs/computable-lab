import { RecordEnvelope, JsonLdFields, JSONSchema } from '../types/common';

/**
 * JSON-LD utility functions for deriving fields from record data
 * These are pure functions that produce derived fields without storing them
 */
export class JsonLdUtils {
  /**
   * Generate JSON-LD context from schema
   */
  static generateContext(schema: JSONSchema): Record<string, string> {
    const context: Record<string, string> = {};
    
    // Extract @context from schema if present
    if (schema.$id) {
      context['@id'] = schema.$id;
    }
    
    // Extract vocabulary from schema
    if (schema.$schema) {
      context['@vocab'] = schema.$schema;
    }
    
    // Extract properties from schema definitions
    if (schema.definitions) {
      for (const [key, definition] of Object.entries(schema.definitions)) {
        if (definition.$id) {
          context[key] = definition.$id;
        }
      }
    }
    
    // Extract properties from schema properties
    if (schema.properties) {
      for (const [key, property] of Object.entries(schema.properties)) {
        if (property.$id) {
          context[key] = property.$id;
        }
      }
    }
    
    return context;
  }

  /**
   * Generate JSON-LD IRI for record
   */
  static generateId(recordId: string, schemaId: string): string {
    // Create a deterministic IRI based on record and schema IDs
    const normalizedSchemaId = schemaId.replace(/[^a-zA-Z0-9]/g, '-');
    return `urn:computable-lab:${normalizedSchemaId}:${recordId}`;
  }

  /**
   * Generate JSON-LD type array for record
   */
  static generateTypes(schemaId: string): string[] {
    // Create type IRIs based on schema ID
    const normalizedSchemaId = schemaId.replace(/[^a-zA-Z0-9]/g, '-');
    return [
      `https://computable-lab.com/types/${normalizedSchemaId}`,
      schemaId
    ];
  }

  /**
   * Convert record envelope to JSON-LD format
   */
  static toJsonLd(record: RecordEnvelope): JsonLdFields & {
    '@id': string;
    '@type': string[];
    [key: string]: any;
  } {
    const context = this.generateContext({} as JSONSchema); // Would get actual schema
    const id = this.generateId(record.recordId, record.schemaId);
    const types = this.generateTypes(record.schemaId);
    
    // Create JSON-LD object with derived fields
    const jsonld: any = {
      '@context': context,
      '@id': id,
      '@type': types
    };

    // Only add data properties if they exist (section 7.2 compliance)
    if (record.data !== undefined) {
      Object.assign(jsonld, record.data);
    }

    return jsonld;
  }

  /**
   * Convert JSON-LD to record envelope
   */
  static fromJsonLd(jsonld: any): RecordEnvelope {
    // Extract required fields
    const recordId = jsonld['@id']?.split(':').pop() || `rec_${Date.now()}`;
    const schemaId = jsonld['@type']?.[0] || 'unknown';
    
    // Remove JSON-LD specific fields
    const { '@context': context, '@id': id, '@type': type, ...data } = jsonld;
    
    const record: RecordEnvelope = {
      recordId,
      schemaId,
      data
    };

    // Only add meta if it's defined (section 7.2 compliance)
    if (jsonld.meta !== undefined) {
      record.meta = {
        createdAt: jsonld.meta.createdAt || new Date().toISOString(),
        createdBy: jsonld.meta.createdBy || 'system'
      };
    }

    return record;
  }

  /**
   * Extract JSON-LD context from record
   */
  static extractContext(record: RecordEnvelope): Record<string, string> {
    return this.toJsonLd(record)['@context'];
  }

  /**
   * Extract JSON-LD ID from record
   */
  static extractId(record: RecordEnvelope): string {
    return this.toJsonLd(record)['@id'];
  }

  /**
   * Extract JSON-LD types from record
   */
  static extractTypes(record: RecordEnvelope): string[] {
    return this.toJsonLd(record)['@type'];
  }

  /**
   * Validate JSON-LD structure
   */
  static validateJsonLd(jsonld: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required fields
    if (!jsonld['@context']) {
      errors.push('Missing @context field');
    }
    
    if (!jsonld['@id']) {
      errors.push('Missing @id field');
    }
    
    if (!jsonld['@type']) {
      errors.push('Missing @type field');
    }
    
    // Check @id is a string
    if (jsonld['@id'] && typeof jsonld['@id'] !== 'string') {
      errors.push('@id must be a string');
    }
    
    // Check @type is an array
    if (jsonld['@type'] && !Array.isArray(jsonld['@type'])) {
      errors.push('@type must be an array');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Flatten JSON-LD object for easier processing
   */
  static flattenJsonLd(jsonld: any): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    function flatten(obj: any, prefix = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          flatten(value, fullKey);
        } else {
          flattened[fullKey] = value;
        }
      }
    }
    
    // Remove JSON-LD specific fields before flattening
    const { '@context': context, '@id': id, '@type': type, ...data } = jsonld;
    flatten(data);
    
    return flattened;
  }

  /**
   * Unflatten object to nested structure
   */
  static unflattenObject(flattened: Record<string, any>): any {
    const result: any = {};
    
    for (const [key, value] of Object.entries(flattened)) {
      const parts = key.split('.');
      let current = result;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }
      
      current[parts[parts.length - 1]] = value;
    }
    
    return result;
  }

  /**
   * Compare two JSON-LD objects for equality
   */
  static jsonLdEqual(a: any, b: any): boolean {
    // Remove JSON-LD specific fields for comparison
    const cleanA = { ...a };
    const cleanB = { ...b };
    
    delete cleanA['@context'];
    delete cleanA['@id'];
    delete cleanA['@type'];
    delete cleanB['@context'];
    delete cleanB['@id'];
    delete cleanB['@type'];
    
    return JSON.stringify(cleanA) === JSON.stringify(cleanB);
  }

  /**
   * Get all properties from JSON-LD object
   */
  static getProperties(jsonld: any): string[] {
    const properties: string[] = [];
    
    function extractProperties(obj: any, prefix = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('@')) continue; // Skip JSON-LD keywords
        
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          extractProperties(value, fullKey);
        } else {
          properties.push(fullKey);
        }
      }
    }
    
    extractProperties(jsonld);
    return properties;
  }

  /**
   * Get all values from JSON-LD object
   */
  static getValues(jsonld: any): any[] {
    const values: any[] = [];
    
    function extractValues(obj: any): void {
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          extractValues(value);
        } else {
          values.push(value);
        }
      }
    }
    
    extractValues(jsonld);
    return values;
  }

  /**
   * Check if JSON-LD object has a specific property
   */
  static hasProperty(jsonld: any, property: string): boolean {
    const properties = this.getProperties(jsonld);
    return properties.includes(property);
  }

  /**
   * Get value of specific property from JSON-LD object
   */
  static getProperty(jsonld: any, property: string): any {
    const parts = property.split('.');
    let current: any = jsonld;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
}