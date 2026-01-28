/**
 * Tests for SchemaRegistry module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, createSchemaRegistry } from './SchemaRegistry.js';
import type { SchemaEntry } from './types.js';

// Helper to create a mock schema entry
function mockEntry(
  id: string, 
  path: string, 
  dependencies: string[] = []
): SchemaEntry {
  return {
    id,
    path,
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: id,
      type: 'object',
    },
    dependencies,
  };
}

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;
  
  beforeEach(() => {
    registry = createSchemaRegistry();
  });
  
  describe('basic operations', () => {
    it('starts empty', () => {
      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
    
    it('adds a schema', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      expect(registry.size).toBe(1);
      expect(registry.has('https://example.com/schema/test.yaml')).toBe(true);
    });
    
    it('retrieves schema by id', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const retrieved = registry.getById('https://example.com/schema/test.yaml');
      expect(retrieved).toBe(entry);
    });
    
    it('retrieves schema by path', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const retrieved = registry.getByPath('test.yaml');
      expect(retrieved).toBe(entry);
    });
    
    it('returns undefined for unknown id', () => {
      expect(registry.getById('unknown')).toBeUndefined();
    });
    
    it('returns undefined for unknown path', () => {
      expect(registry.getByPath('unknown.yaml')).toBeUndefined();
    });
    
    it('removes a schema', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const removed = registry.removeSchema('https://example.com/schema/test.yaml');
      
      expect(removed).toBe(true);
      expect(registry.size).toBe(0);
      expect(registry.has('https://example.com/schema/test.yaml')).toBe(false);
    });
    
    it('returns false when removing unknown schema', () => {
      const removed = registry.removeSchema('unknown');
      expect(removed).toBe(false);
    });
    
    it('clears all schemas', () => {
      registry.addSchema(mockEntry('https://example.com/a.yaml', 'a.yaml'));
      registry.addSchema(mockEntry('https://example.com/b.yaml', 'b.yaml'));
      
      registry.clear();
      
      expect(registry.size).toBe(0);
    });
    
    it('lists all ids', () => {
      registry.addSchema(mockEntry('https://example.com/a.yaml', 'a.yaml'));
      registry.addSchema(mockEntry('https://example.com/b.yaml', 'b.yaml'));
      
      const ids = registry.getAllIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('https://example.com/a.yaml');
      expect(ids).toContain('https://example.com/b.yaml');
    });
  });
  
  describe('dependency tracking', () => {
    it('tracks schema dependencies', () => {
      const common = mockEntry(
        'https://example.com/common.yaml', 
        'common.yaml'
      );
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['./common.yaml#/$defs/FAIRCommon']
      );
      
      registry.addSchema(common);
      registry.addSchema(study);
      
      const deps = registry.getDependencies('https://example.com/study.yaml');
      expect(deps).toContain('https://example.com/common.yaml');
    });
    
    it('tracks reverse dependencies', () => {
      const common = mockEntry(
        'https://example.com/common.yaml', 
        'common.yaml'
      );
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['https://example.com/common.yaml#/$defs/FAIRCommon']
      );
      
      registry.addSchema(common);
      registry.addSchema(study);
      
      const dependents = registry.getDependents('https://example.com/common.yaml');
      expect(dependents).toContain('https://example.com/study.yaml');
    });
    
    it('ignores local fragment refs in dependency tracking', () => {
      const entry = mockEntry(
        'https://example.com/test.yaml',
        'test.yaml',
        ['#/$defs/LocalDef']
      );
      
      registry.addSchema(entry);
      
      const deps = registry.getDependencies('https://example.com/test.yaml');
      expect(deps).toHaveLength(0);
    });
    
    it('does not add self as dependency', () => {
      const entry = mockEntry(
        'https://example.com/test.yaml',
        'test.yaml',
        ['https://example.com/test.yaml#/$defs/SomeDef']
      );
      
      registry.addSchema(entry);
      
      const deps = registry.getDependencies('https://example.com/test.yaml');
      expect(deps).not.toContain('https://example.com/test.yaml');
    });
  });
  
  describe('reference resolution', () => {
    it('reports all references resolved when complete', () => {
      const common = mockEntry('https://example.com/common.yaml', 'common.yaml');
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['https://example.com/common.yaml']
      );
      
      registry.addSchema(common);
      registry.addSchema(study);
      
      const result = registry.checkResolution();
      expect(result.resolved).toBe(true);
      expect(result.unresolved).toHaveLength(0);
    });
    
    it('reports unresolved references', () => {
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['https://example.com/missing.yaml']
      );
      
      registry.addSchema(study);
      
      const result = registry.checkResolution();
      expect(result.resolved).toBe(false);
      expect(result.unresolved).toContain(
        'https://example.com/study.yaml -> https://example.com/missing.yaml'
      );
    });
  });
  
  describe('topological ordering', () => {
    it('returns schemas in dependency order', () => {
      // C depends on B, B depends on A
      const a = mockEntry('https://example.com/a.yaml', 'a.yaml');
      const b = mockEntry(
        'https://example.com/b.yaml', 
        'b.yaml',
        ['https://example.com/a.yaml']
      );
      const c = mockEntry(
        'https://example.com/c.yaml', 
        'c.yaml',
        ['https://example.com/b.yaml']
      );
      
      // Add in reverse order
      registry.addSchema(c);
      registry.addSchema(b);
      registry.addSchema(a);
      
      const order = registry.getTopologicalOrder();
      
      // A should come before B, B should come before C
      const indexA = order.indexOf('https://example.com/a.yaml');
      const indexB = order.indexOf('https://example.com/b.yaml');
      const indexC = order.indexOf('https://example.com/c.yaml');
      
      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });
    
    it('throws on circular dependencies', () => {
      // A depends on B, B depends on A
      const a = mockEntry(
        'https://example.com/a.yaml', 
        'a.yaml',
        ['https://example.com/b.yaml']
      );
      const b = mockEntry(
        'https://example.com/b.yaml', 
        'b.yaml',
        ['https://example.com/a.yaml']
      );
      
      registry.addSchema(a);
      registry.addSchema(b);
      
      expect(() => registry.getTopologicalOrder()).toThrow(/[Cc]ircular/);
    });
    
    it('handles schemas with no dependencies', () => {
      registry.addSchema(mockEntry('https://example.com/a.yaml', 'a.yaml'));
      registry.addSchema(mockEntry('https://example.com/b.yaml', 'b.yaml'));
      
      const order = registry.getTopologicalOrder();
      expect(order).toHaveLength(2);
    });
  });
  
  describe('toSchemaMap', () => {
    it('returns schemas as plain object map', () => {
      const entry = mockEntry('https://example.com/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const map = registry.toSchemaMap();
      
      expect(map['https://example.com/test.yaml']).toBe(entry.schema);
    });
  });
  
  describe('addSchemas', () => {
    it('adds multiple schemas at once', () => {
      const entries = [
        mockEntry('https://example.com/a.yaml', 'a.yaml'),
        mockEntry('https://example.com/b.yaml', 'b.yaml'),
      ];
      
      registry.addSchemas(entries);
      
      expect(registry.size).toBe(2);
    });
  });
});
