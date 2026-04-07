/**
 * Tests for AjvValidator module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AjvValidator, createValidator } from './AjvValidator.js';

describe('AjvValidator', () => {
  let validator: AjvValidator;
  
  beforeEach(() => {
    validator = createValidator();
  });
  
  describe('validate with registered schema', () => {
    const testSchemaId = 'https://example.com/test.schema.yaml';
    const testSchema = {
      $id: testSchemaId,
      type: 'object',
      required: ['title', 'kind'],
      properties: {
        kind: { type: 'string', const: 'test' },
        title: { type: 'string', minLength: 1 },
        count: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    };
    
    beforeEach(() => {
      validator.addSchema(testSchema);
    });
    
    it('validates conforming data', () => {
      const data = { kind: 'test', title: 'Hello World' };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('rejects data missing required field', () => {
      const data = { kind: 'test' };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.keyword === 'required')).toBe(true);
    });
    
    it('rejects data with wrong type', () => {
      const data = { kind: 'test', title: 123 };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'type')).toBe(true);
    });
    
    it('rejects data with wrong const value', () => {
      const data = { kind: 'wrong', title: 'Test' };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'const')).toBe(true);
    });
    
    it('rejects data with additional properties', () => {
      const data = { kind: 'test', title: 'Test', extra: 'field' };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'additionalProperties')).toBe(true);
    });
    
    it('rejects data violating minimum constraint', () => {
      const data = { kind: 'test', title: 'Test', count: -1 };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'minimum')).toBe(true);
    });
    
    it('rejects data violating minLength constraint', () => {
      const data = { kind: 'test', title: '' };
      const result = validator.validate(data, testSchemaId);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'minLength')).toBe(true);
    });
    
    it('returns error for unknown schema', () => {
      const data = { title: 'Test' };
      const result = validator.validate(data, 'https://example.com/unknown.yaml');
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain('Schema not found');
    });
  });
  
  describe('validateWithSchema (inline)', () => {
    it('validates against inline schema', () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      };
      
      const result = validator.validateWithSchema({ name: 'Test' }, schema);
      
      expect(result.valid).toBe(true);
    });
    
    it('rejects invalid data against inline schema', () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      };
      
      const result = validator.validateWithSchema({ name: 123 }, schema);
      
      expect(result.valid).toBe(false);
    });
  });
  
  describe('schema management', () => {
    it('adds schema with explicit id', () => {
      const schema = { type: 'string' };
      validator.addSchema(schema, 'https://example.com/custom-id');
      
      expect(validator.hasSchema('https://example.com/custom-id')).toBe(true);
    });
    
    it('adds schema using $id from schema', () => {
      const schema = {
        $id: 'https://example.com/from-schema',
        type: 'string',
      };
      validator.addSchema(schema);
      
      expect(validator.hasSchema('https://example.com/from-schema')).toBe(true);
    });
    
    it('removes schema', () => {
      const schema = {
        $id: 'https://example.com/removable',
        type: 'string',
      };
      validator.addSchema(schema);
      validator.removeSchema('https://example.com/removable');
      
      expect(validator.hasSchema('https://example.com/removable')).toBe(false);
    });
    
    it('gets compiled schema', () => {
      const schema = {
        $id: 'https://example.com/get-test',
        type: 'string',
      };
      validator.addSchema(schema);
      
      const compiled = validator.getSchema('https://example.com/get-test');
      expect(compiled).toBeDefined();
      expect(typeof compiled).toBe('function');
    });
    
    it('returns undefined for missing schema', () => {
      expect(validator.getSchema('https://example.com/missing')).toBeUndefined();
    });
    
    it('adds multiple schemas', () => {
      const schemas = [
        { $id: 'https://example.com/s1', type: 'string' },
        { $id: 'https://example.com/s2', type: 'number' },
      ];
      validator.addSchemas(schemas);
      
      expect(validator.hasSchema('https://example.com/s1')).toBe(true);
      expect(validator.hasSchema('https://example.com/s2')).toBe(true);
    });
  });
  
  describe('format validation', () => {
    it('validates date-time format', () => {
      const schema = {
        $id: 'https://example.com/datetime-test',
        type: 'string',
        format: 'date-time',
      };
      validator.addSchema(schema);
      
      const valid = validator.validate('2024-01-15T10:30:00Z', schema.$id);
      expect(valid.valid).toBe(true);
      
      const invalid = validator.validate('not-a-date', schema.$id);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.some(e => e.keyword === 'format')).toBe(true);
    });
    
    it('validates uri format', () => {
      const schema = {
        $id: 'https://example.com/uri-test',
        type: 'string',
        format: 'uri',
      };
      validator.addSchema(schema);
      
      const valid = validator.validate('https://example.com/path', schema.$id);
      expect(valid.valid).toBe(true);
      
      const invalid = validator.validate('not-a-uri', schema.$id);
      expect(invalid.valid).toBe(false);
    });
    
    it('validates email format', () => {
      const schema = {
        $id: 'https://example.com/email-test',
        type: 'string',
        format: 'email',
      };
      validator.addSchema(schema);
      
      const valid = validator.validate('test@example.com', schema.$id);
      expect(valid.valid).toBe(true);
      
      const invalid = validator.validate('not-an-email', schema.$id);
      expect(invalid.valid).toBe(false);
    });
  });
  
  describe('enum validation', () => {
    it('validates enum values', () => {
      const schema = {
        $id: 'https://example.com/enum-test',
        type: 'string',
        enum: ['draft', 'published', 'archived'],
      };
      validator.addSchema(schema);
      
      expect(validator.validate('draft', schema.$id).valid).toBe(true);
      expect(validator.validate('published', schema.$id).valid).toBe(true);
      expect(validator.validate('invalid', schema.$id).valid).toBe(false);
    });
  });
  
  describe('array validation', () => {
    it('validates array items', () => {
      const schema = {
        $id: 'https://example.com/array-test',
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        uniqueItems: true,
      };
      validator.addSchema(schema);
      
      expect(validator.validate(['a', 'b'], schema.$id).valid).toBe(true);
      expect(validator.validate([], schema.$id).valid).toBe(false); // minItems
      expect(validator.validate(['a', 'a'], schema.$id).valid).toBe(false); // uniqueItems
      expect(validator.validate([1, 2], schema.$id).valid).toBe(false); // wrong type
    });
  });
  
  describe('error messages', () => {
    it('provides path in error', () => {
      const schema = {
        $id: 'https://example.com/error-test',
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
          },
        },
      };
      validator.addSchema(schema);
      
      const result = validator.validate(
        { nested: { value: 123 } },
        schema.$id
      );
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.path).toContain('/nested/value');
    });
    
    it('provides keyword in error', () => {
      const schema = {
        $id: 'https://example.com/keyword-test',
        type: 'string',
        minLength: 5,
      };
      validator.addSchema(schema);
      
      const result = validator.validate('ab', schema.$id);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.keyword).toBe('minLength');
    });
  });
  
  describe('compile', () => {
    it('compiles a schema to a validate function', () => {
      const schema = {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      };
      
      const validate = validator.compile(schema);
      
      expect(typeof validate).toBe('function');
      expect(validate({ id: 'test' })).toBe(true);
      expect(validate({})).toBe(false);
    });
  });
  
  describe('options', () => {
    it('respects addFormats: false option', () => {
      // When addFormats is false, we need strict: false to ignore unknown formats
      const noFormatsValidator = createValidator({ addFormats: false, strict: false });
      const schema = {
        $id: 'https://example.com/no-format',
        type: 'string',
        format: 'email',
      };
      noFormatsValidator.addSchema(schema);
      
      // Without formats registered and strict: false, 'email' format is ignored
      const result = noFormatsValidator.validate('not-an-email', schema.$id);
      // This should pass because format isn't validated without addFormats
      expect(result.valid).toBe(true);
    });
  });
});
