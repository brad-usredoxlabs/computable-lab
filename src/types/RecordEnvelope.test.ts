/**
 * Tests for RecordEnvelope module.
 */

import { describe, it, expect } from 'vitest';
import { 
  extractRecordId, 
  extractKind, 
  createEnvelope,
  type RecordEnvelope,
  type RecordMeta 
} from './RecordEnvelope.js';

describe('extractRecordId', () => {
  it('extracts recordId from payload with recordId field', () => {
    const payload = { kind: 'study', recordId: 'STU-000001', title: 'Test Study' };
    expect(extractRecordId(payload)).toBe('STU-000001');
  });
  
  it('extracts id from payload with id field (fallback)', () => {
    const payload = { kind: 'material', id: 'MAT-HEPG2', name: 'HepG2' };
    expect(extractRecordId(payload)).toBe('MAT-HEPG2');
  });
  
  it('prefers recordId over id when both present', () => {
    const payload = { kind: 'study', recordId: 'STU-000001', id: 'other-id' };
    expect(extractRecordId(payload)).toBe('STU-000001');
  });
  
  it('returns undefined for null payload', () => {
    expect(extractRecordId(null)).toBeUndefined();
  });
  
  it('returns undefined for non-object payload', () => {
    expect(extractRecordId('string')).toBeUndefined();
    expect(extractRecordId(123)).toBeUndefined();
    expect(extractRecordId(undefined)).toBeUndefined();
  });
  
  it('returns undefined for empty object', () => {
    expect(extractRecordId({})).toBeUndefined();
  });
  
  it('returns undefined for empty string recordId', () => {
    const payload = { recordId: '' };
    expect(extractRecordId(payload)).toBeUndefined();
  });
  
  it('returns undefined for non-string recordId', () => {
    const payload = { recordId: 123 };
    expect(extractRecordId(payload)).toBeUndefined();
  });
});

describe('extractKind', () => {
  it('extracts kind from payload', () => {
    const payload = { kind: 'study', recordId: 'STU-000001' };
    expect(extractKind(payload)).toBe('study');
  });
  
  it('returns undefined for null payload', () => {
    expect(extractKind(null)).toBeUndefined();
  });
  
  it('returns undefined for non-object payload', () => {
    expect(extractKind('string')).toBeUndefined();
  });
  
  it('returns undefined for missing kind', () => {
    expect(extractKind({ recordId: 'STU-000001' })).toBeUndefined();
  });
  
  it('returns undefined for empty string kind', () => {
    expect(extractKind({ kind: '' })).toBeUndefined();
  });
  
  it('returns undefined for non-string kind', () => {
    expect(extractKind({ kind: 123 })).toBeUndefined();
  });
});

describe('createEnvelope', () => {
  const schemaId = 'https://computable-lab.com/schema/study.schema.yaml';
  
  it('creates envelope from payload with recordId', () => {
    const payload = { kind: 'study', recordId: 'STU-000001', title: 'Test Study' };
    const envelope = createEnvelope(payload, schemaId);
    
    expect(envelope).not.toBeNull();
    expect(envelope?.recordId).toBe('STU-000001');
    expect(envelope?.schemaId).toBe(schemaId);
    expect(envelope?.payload).toBe(payload);
    expect(envelope?.meta).toBeUndefined();
  });
  
  it('creates envelope from payload with id (fallback)', () => {
    const payload = { kind: 'material', id: 'MAT-HEPG2', name: 'HepG2' };
    const envelope = createEnvelope(payload, schemaId);
    
    expect(envelope).not.toBeNull();
    expect(envelope?.recordId).toBe('MAT-HEPG2');
  });
  
  it('includes meta when provided', () => {
    const payload = { kind: 'study', recordId: 'STU-000001' };
    const meta: RecordMeta = {
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 'test-user',
    };
    
    const envelope = createEnvelope(payload, schemaId, meta);
    
    expect(envelope).not.toBeNull();
    expect(envelope?.meta).toEqual(meta);
  });
  
  it('returns null when recordId cannot be extracted', () => {
    const payload = { kind: 'study', title: 'No ID' };
    const envelope = createEnvelope(payload, schemaId);
    
    expect(envelope).toBeNull();
  });
  
  it('does not include meta key when meta is undefined', () => {
    const payload = { kind: 'study', recordId: 'STU-000001' };
    const envelope = createEnvelope(payload, schemaId, undefined);
    
    expect(envelope).not.toBeNull();
    // Check that 'meta' key is not present at all
    expect('meta' in (envelope as RecordEnvelope)).toBe(false);
  });
});
