/**
 * Tests for JSON-LD module.
 */

import { describe, it, expect } from 'vitest';

import {
  deriveId,
  deriveIdFromEnvelope,
  parseId,
  isIdLike,
  refToIdObject,
  inferKindFromRecordId,
  generateBlankNodeId,
} from './IdDeriver.js';

import {
  buildContext,
  buildContextFromSchema,
  mergeContexts,
  simplifyContext,
  DEFAULT_PREFIXES,
} from './ContextBuilder.js';

import {
  JsonLdGenerator,
  createJsonLdGenerator,
  toJsonLd,
} from './JsonLdGenerator.js';

import {
  GraphBuilder,
  createGraphBuilder,
  buildGraph,
} from './GraphBuilder.js';

describe('IdDeriver', () => {
  const namespace = 'https://computable-lab.com/';
  
  describe('deriveId', () => {
    it('derives @id from namespace, kind, and recordId', () => {
      const id = deriveId({
        namespace,
        kind: 'study',
        recordId: 'STU-000001',
      });
      
      expect(id).toBe('https://computable-lab.com/study/STU-000001');
    });
    
    it('normalizes namespace without trailing slash', () => {
      const id = deriveId({
        namespace: 'https://example.com',
        kind: 'material',
        recordId: 'MAT-001',
      });
      
      expect(id).toBe('https://example.com/material/MAT-001');
    });
    
    it('normalizes kind to lowercase', () => {
      const id = deriveId({
        namespace,
        kind: 'LabwareInstance',
        recordId: 'LWI-001',
      });
      
      expect(id).toBe('https://computable-lab.com/labwareinstance/LWI-001');
    });
    
    it('throws on missing namespace', () => {
      expect(() => deriveId({
        namespace: '',
        kind: 'study',
        recordId: 'STU-001',
      })).toThrow('namespace is required');
    });
    
    it('throws on missing kind', () => {
      expect(() => deriveId({
        namespace,
        kind: '',
        recordId: 'STU-001',
      })).toThrow('kind is required');
    });
    
    it('throws on missing recordId', () => {
      expect(() => deriveId({
        namespace,
        kind: 'study',
        recordId: '',
      })).toThrow('recordId is required');
    });
  });
  
  describe('deriveIdFromEnvelope', () => {
    it('extracts kind from payload', () => {
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: { kind: 'study', title: 'Test' },
      };
      
      const id = deriveIdFromEnvelope(envelope, namespace);
      
      expect(id).toBe('https://computable-lab.com/study/STU-001');
    });
    
    it('uses meta.kind as fallback', () => {
      const envelope = {
        recordId: 'EXP-001',
        schemaId: 'test',
        payload: { title: 'Test' },
        meta: { kind: 'experiment' },
      };
      
      const id = deriveIdFromEnvelope(envelope, namespace);
      
      expect(id).toBe('https://computable-lab.com/experiment/EXP-001');
    });
    
    it('throws when kind not found', () => {
      const envelope = {
        recordId: 'XXX-001',
        schemaId: 'test',
        payload: { title: 'No Kind' },
      };
      
      expect(() => deriveIdFromEnvelope(envelope, namespace)).toThrow('kind not found');
    });
  });
  
  describe('parseId', () => {
    it('parses components from @id', () => {
      const result = parseId('https://computable-lab.com/study/STU-001', namespace);
      
      expect(result).toEqual({
        kind: 'study',
        recordId: 'STU-001',
      });
    });
    
    it('returns null for non-matching namespace', () => {
      const result = parseId('https://other.com/study/STU-001', namespace);
      
      expect(result).toBeNull();
    });
    
    it('returns null for malformed @id', () => {
      const result = parseId('https://computable-lab.com/invalid', namespace);
      
      expect(result).toBeNull();
    });
  });
  
  describe('isIdLike', () => {
    it('returns true for http URIs', () => {
      expect(isIdLike('https://example.com/test')).toBe(true);
      expect(isIdLike('http://example.com/test')).toBe(true);
    });
    
    it('returns false for urn URIs (only http/https supported)', () => {
      // Our isIdLike only checks for scheme:// pattern, URNs use scheme: without //
      expect(isIdLike('urn:uuid:123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    });
    
    it('returns false for plain strings', () => {
      expect(isIdLike('STU-001')).toBe(false);
      expect(isIdLike('just text')).toBe(false);
    });
    
    it('returns false for non-strings', () => {
      expect(isIdLike(123)).toBe(false);
      expect(isIdLike(null)).toBe(false);
    });
  });
  
  describe('refToIdObject', () => {
    it('returns existing URI as-is', () => {
      const result = refToIdObject('https://example.com/thing', namespace);
      
      expect(result).toEqual({ '@id': 'https://example.com/thing' });
    });
    
    it('derives @id for known prefix', () => {
      const result = refToIdObject('STU-001', namespace);
      
      expect(result['@id']).toBe('https://computable-lab.com/study/STU-001');
    });
    
    it('uses provided kind', () => {
      const result = refToIdObject('001', namespace, 'material');
      
      expect(result['@id']).toBe('https://computable-lab.com/material/001');
    });
    
    it('falls back to raw ref for unknown prefix', () => {
      const result = refToIdObject('unknown-123', namespace);
      
      expect(result['@id']).toBe('unknown-123');
    });
  });
  
  describe('inferKindFromRecordId', () => {
    it('infers study from STU- prefix', () => {
      expect(inferKindFromRecordId('STU-001')).toBe('study');
    });
    
    it('infers experiment from EXP- prefix', () => {
      expect(inferKindFromRecordId('EXP-001')).toBe('experiment');
    });
    
    it('infers material from MAT- prefix', () => {
      expect(inferKindFromRecordId('MAT-001')).toBe('material');
    });
    
    it('returns undefined for unknown prefix', () => {
      expect(inferKindFromRecordId('XXX-001')).toBeUndefined();
    });
  });
  
  describe('generateBlankNodeId', () => {
    it('generates blank node with prefix', () => {
      const id = generateBlankNodeId('test');
      
      expect(id.startsWith('_:')).toBe(true);
      expect(id).toBe('_:test');
    });
    
    it('generates random blank node without hint', () => {
      const id = generateBlankNodeId();
      
      expect(id.startsWith('_:')).toBe(true);
    });
  });
});

describe('ContextBuilder', () => {
  const config = {
    namespace: 'https://computable-lab.com/',
    vocab: 'https://computable-lab.com/vocab/',
  };
  
  describe('buildContext', () => {
    it('includes default prefixes', () => {
      const context = buildContext(config);
      
      expect(context['schema']).toBe(DEFAULT_PREFIXES.schema);
      expect(context['xsd']).toBe(DEFAULT_PREFIXES.xsd);
    });
    
    it('includes @vocab if provided', () => {
      const context = buildContext(config);
      
      expect(context['@vocab']).toBe(config.vocab);
    });
    
    it('includes namespace as clab prefix', () => {
      const context = buildContext(config);
      
      expect(context['clab']).toBe(config.namespace);
    });
    
    it('allows custom prefix override', () => {
      const context = buildContext({
        ...config,
        prefixes: { schema: 'https://custom.schema.org/' },
      });
      
      expect(context['schema']).toBe('https://custom.schema.org/');
    });
  });
  
  describe('buildContextFromSchema', () => {
    it('includes @base from schema $id', () => {
      const schema = {
        $id: 'https://computable-lab.com/schema/study.schema.yaml',
      };
      
      const context = buildContextFromSchema(schema, config);
      
      expect(context['@base']).toBe('https://computable-lab.com/schema/');
    });
    
    it('adds type coercions for date-time properties', () => {
      const schema = {
        $id: 'https://test.com/test.yaml',
        properties: {
          createdAt: { type: 'string', format: 'date-time' },
        },
      };
      
      const context = buildContextFromSchema(schema, config);
      
      expect(context['createdAt']).toEqual({
        '@id': 'clab:createdAt',
        '@type': 'xsd:dateTime',
      });
    });
  });
  
  describe('mergeContexts', () => {
    it('merges multiple contexts', () => {
      const ctx1 = { a: 'http://a.com/' };
      const ctx2 = { b: 'http://b.com/' };
      
      const merged = mergeContexts(ctx1, ctx2);
      
      expect(merged['a']).toBe('http://a.com/');
      expect(merged['b']).toBe('http://b.com/');
    });
    
    it('later contexts override earlier', () => {
      const ctx1 = { a: 'http://old.com/' };
      const ctx2 = { a: 'http://new.com/' };
      
      const merged = mergeContexts(ctx1, ctx2);
      
      expect(merged['a']).toBe('http://new.com/');
    });
  });
  
  describe('simplifyContext', () => {
    it('keeps @vocab and @base', () => {
      const context = {
        '@vocab': 'http://vocab.com/',
        '@base': 'http://base.com/',
        'unused': 'simple',
      };
      
      const simplified = simplifyContext(context);
      
      expect(simplified['@vocab']).toBe('http://vocab.com/');
      expect(simplified['@base']).toBe('http://base.com/');
    });
    
    it('keeps URI prefixes', () => {
      const context = {
        'schema': 'https://schema.org/',
        'local': 'local-value',
      };
      
      const simplified = simplifyContext(context);
      
      expect(simplified['schema']).toBe('https://schema.org/');
      expect(simplified['local']).toBeUndefined();
    });
  });
});

describe('JsonLdGenerator', () => {
  describe('generate', () => {
    it('generates JSON-LD from envelope', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'https://test.com/study.yaml',
        payload: {
          recordId: 'STU-001',
          $schema: 'https://test.com/study.yaml',
          kind: 'study',
          title: 'Test Study',
          description: 'A test',
        },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.success).toBe(true);
      expect(result.document?.['@id']).toBe('https://computable-lab.com/study/STU-001');
      expect(result.document?.['@type']).toBe('Study');
      expect(result.document?.['title']).toBe('Test Study');
    });
    
    it('derives @type from kind using PascalCase', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'LWI-001',
        schemaId: 'test',
        payload: {
          recordId: 'LWI-001',
          kind: 'labware-instance',
          $schema: 'test',
        },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['@type']).toBe('LabwareInstance');
    });
    
    it('excludes $schema from output', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: {
          recordId: 'STU-001',
          $schema: 'test',
          kind: 'study',
        },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['$schema']).toBeUndefined();
    });
    
    it('excludes recordId from output (in @id)', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: {
          recordId: 'STU-001',
          $schema: 'test',
          kind: 'study',
        },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['recordId']).toBeUndefined();
    });
    
    it('transforms reference properties to @id objects', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'EXP-001',
        schemaId: 'test',
        payload: {
          recordId: 'EXP-001',
          $schema: 'test',
          kind: 'experiment',
          studyId: 'STU-001',
        },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['studyId']).toEqual({
        '@id': 'https://computable-lab.com/study/STU-001',
      });
    });
    
    it('transforms array of references', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: {
          recordId: 'STU-001',
          $schema: 'test',
          kind: 'study',
          claimIds: ['CLM-001', 'CLM-002'],
        },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['claimIds']).toEqual([
        { '@id': 'https://computable-lab.com/claim/CLM-001' },
        { '@id': 'https://computable-lab.com/claim/CLM-002' },
      ]);
    });
    
    it('includes @context when configured', () => {
      const generator = createJsonLdGenerator({ includeContext: true });
      
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: { recordId: 'STU-001', $schema: 'test', kind: 'study' },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['@context']).toBeDefined();
    });
    
    it('excludes @context when configured', () => {
      const generator = createJsonLdGenerator({ includeContext: false });
      
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: { recordId: 'STU-001', $schema: 'test', kind: 'study' },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.document?.['@context']).toBeUndefined();
    });
    
    it('returns error for missing kind', () => {
      const generator = createJsonLdGenerator();
      
      const envelope = {
        recordId: 'XXX-001',
        schemaId: 'test',
        payload: { recordId: 'XXX-001', $schema: 'test' },
      };
      
      const result = generator.generate(envelope);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('kind not found');
    });
  });
  
  describe('generateBatch', () => {
    it('generates JSON-LD for multiple envelopes', () => {
      const generator = createJsonLdGenerator({ includeContext: false });
      
      const envelopes = [
        { recordId: 'STU-001', schemaId: 'test', payload: { recordId: 'STU-001', $schema: 'test', kind: 'study' } },
        { recordId: 'STU-002', schemaId: 'test', payload: { recordId: 'STU-002', $schema: 'test', kind: 'study' } },
      ];
      
      const documents = generator.generateBatch(envelopes);
      
      expect(documents.length).toBe(2);
    });
  });
  
  describe('toJsonLd (helper)', () => {
    it('converts envelope to JSON-LD', () => {
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: { recordId: 'STU-001', $schema: 'test', kind: 'study', title: 'Test' },
      };
      
      const doc = toJsonLd(envelope);
      
      expect(doc?.['@id']).toContain('STU-001');
      expect(doc?.['title']).toBe('Test');
    });
    
    it('returns null on error', () => {
      const envelope = {
        recordId: 'XXX-001',
        schemaId: 'test',
        payload: { recordId: 'XXX-001' }, // Missing kind
      };
      
      const doc = toJsonLd(envelope);
      
      expect(doc).toBeNull();
    });
  });
});

describe('GraphBuilder', () => {
  describe('addRecord', () => {
    it('adds node for record', () => {
      const builder = createGraphBuilder();
      
      builder.addRecord({
        recordId: 'STU-001',
        schemaId: 'test',
        payload: { recordId: 'STU-001', kind: 'study' },
      });
      
      expect(builder.hasNode('STU-001')).toBe(true);
      const node = builder.getNode('STU-001');
      expect(node?.kind).toBe('study');
    });
    
    it('extracts references as edges', () => {
      const builder = createGraphBuilder();
      
      builder.addRecord({
        recordId: 'EXP-001',
        schemaId: 'test',
        payload: {
          recordId: 'EXP-001',
          kind: 'experiment',
          studyId: 'STU-001',
        },
      });
      
      const edges = builder.getOutgoingEdges('EXP-001');
      
      // Finds studyId and also recordId (both end in 'Id')
      expect(edges.length).toBeGreaterThanOrEqual(1);
      expect(edges.some(e => e.to === 'STU-001' && e.predicate === 'studyId')).toBe(true);
    });
    
    it('creates nodes for referenced records', () => {
      const builder = createGraphBuilder();
      
      builder.addRecord({
        recordId: 'EXP-001',
        schemaId: 'test',
        payload: {
          recordId: 'EXP-001',
          kind: 'experiment',
          studyId: 'STU-001',
        },
      });
      
      expect(builder.hasNode('STU-001')).toBe(true);
      expect(builder.getNode('STU-001')?.kind).toBe('study'); // Inferred
    });
    
    it('extracts array references', () => {
      const builder = createGraphBuilder();
      
      builder.addRecord({
        recordId: 'STU-001',
        schemaId: 'test',
        payload: {
          recordId: 'STU-001',
          kind: 'study',
          claimIds: ['CLM-001', 'CLM-002'],
        },
      });
      
      const edges = builder.getOutgoingEdges('STU-001');
      
      // Finds claimIds array + recordId
      expect(edges.length).toBeGreaterThanOrEqual(2);
      expect(edges.map(e => e.to)).toContain('CLM-001');
      expect(edges.map(e => e.to)).toContain('CLM-002');
    });
  });
  
  describe('query', () => {
    it('queries outgoing edges', () => {
      const builder = buildGraph([
        { recordId: 'STU-001', schemaId: 'test', payload: { recordId: 'STU-001', kind: 'study' } },
        { recordId: 'EXP-001', schemaId: 'test', payload: { recordId: 'EXP-001', kind: 'experiment', studyId: 'STU-001' } },
        { recordId: 'EXP-002', schemaId: 'test', payload: { recordId: 'EXP-002', kind: 'experiment', studyId: 'STU-001' } },
      ]);
      
      const result = builder.query({
        startId: 'STU-001',
        direction: 'incoming',
      });
      
      expect(result.nodes.length).toBe(2);
    });
    
    it('queries with kind filter', () => {
      const builder = buildGraph([
        { recordId: 'STU-001', schemaId: 'test', payload: { recordId: 'STU-001', kind: 'study' } },
        { recordId: 'EXP-001', schemaId: 'test', payload: { recordId: 'EXP-001', kind: 'experiment', studyId: 'STU-001' } },
        { recordId: 'CLM-001', schemaId: 'test', payload: { recordId: 'CLM-001', kind: 'claim', studyId: 'STU-001' } },
      ]);
      
      const result = builder.query({
        startId: 'STU-001',
        direction: 'incoming',
        kind: 'experiment',
      });
      
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].kind).toBe('experiment');
    });
    
    it('handles cycles gracefully', () => {
      const builder = createGraphBuilder();
      
      builder.addEdge('A', 'B', 'refId');
      builder.addEdge('B', 'C', 'refId');
      builder.addEdge('C', 'A', 'refId'); // Cycle
      
      const result = builder.query({
        startId: 'A',
        direction: 'outgoing',
        depth: 5,
      });
      
      // Should not infinite loop
      expect(result.nodes.length).toBe(2); // B and C (A is start)
    });
  });
  
  describe('getStats', () => {
    it('returns graph statistics', () => {
      const builder = buildGraph([
        { recordId: 'STU-001', schemaId: 'test', payload: { recordId: 'STU-001', kind: 'study' } },
        { recordId: 'EXP-001', schemaId: 'test', payload: { recordId: 'EXP-001', kind: 'experiment', studyId: 'STU-001' } },
      ]);
      
      const stats = builder.getStats();
      
      expect(stats.nodeCount).toBe(2);
      // Will have edges for studyId plus recordId references
      expect(stats.edgeCount).toBeGreaterThanOrEqual(1);
      expect(stats.kinds).toContain('study');
      expect(stats.kinds).toContain('experiment');
    });
  });
  
  describe('clear', () => {
    it('clears the graph', () => {
      const builder = createGraphBuilder();
      builder.addRecord({ recordId: 'STU-001', schemaId: 'test', payload: { recordId: 'STU-001', kind: 'study' } });
      
      expect(builder.hasNode('STU-001')).toBe(true);
      
      builder.clear();
      
      expect(builder.hasNode('STU-001')).toBe(false);
      expect(builder.getStats().nodeCount).toBe(0);
    });
  });
});
