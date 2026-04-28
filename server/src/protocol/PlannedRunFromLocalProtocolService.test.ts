/**
 * Tests for PlannedRunFromLocalProtocolService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlannedRunFromLocalProtocolService } from './PlannedRunFromLocalProtocolService.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';

function makeMockStore(getResult?: RecordEnvelope | null, createResult?: { success: boolean }): RecordStore {
  return {
    get: async (recordId: string) => getResult ?? null,
    getByPath: async () => null,
    getWithValidation: async () => ({ success: true }),
    list: async () => [],
    create: async () => ({ success: createResult?.success ?? true }),
    update: async () => ({ success: true }),
    delete: async () => ({ success: true }),
    validate: async () => ({ valid: true, errors: [] }),
    lint: async () => ({ valid: true, errors: [] }),
    exists: async () => getResult !== null,
  } as unknown as RecordStore;
}

function makeLocalProtocolEnvelope(recordId: string, title: string): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml',
    payload: {
      kind: 'local-protocol',
      recordId,
      title,
    },
  };
}

function makeProtocolEnvelope(recordId: string, title: string): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
    payload: {
      kind: 'protocol',
      recordId,
      title,
    },
  };
}

describe('PlannedRunFromLocalProtocolService', () => {
  describe('createFromLocalProtocol', () => {
    it('happy path: creates a planned-run draft with correct shape', async () => {
      const localProtocolId = 'LPR-test-zymo-extract';
      const localProtocolTitle = 'Zymo DNA Extraction (Cell Culture)';
      const mockStore = makeMockStore(
        makeLocalProtocolEnvelope(localProtocolId, localProtocolTitle),
        { success: true },
      );

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(localProtocolId);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      const { plannedRunRef, envelope } = result;

      // recordId matches pattern
      expect(plannedRunRef).toMatch(/^PLR-[a-z0-9-]+$/);

      // Envelope payload shape
      const payload = envelope.payload as Record<string, unknown>;
      expect(payload.kind).toBe('planned-run');
      expect(payload.recordId).toBe(plannedRunRef);
      expect(payload.title).toBe(`Plan: ${localProtocolTitle}`);
      expect(payload.protocolLayer).toBe('lab');
      expect(payload.sourceType).toBe('local-protocol');
      expect(payload.state).toBe('draft');

      // References
      expect(payload.sourceRef).toEqual({
        kind: 'record',
        type: 'local-protocol',
        id: localProtocolId,
      });
      expect(payload.localProtocolRef).toEqual({
        kind: 'record',
        type: 'local-protocol',
        id: localProtocolId,
      });

      // Empty bindings
      const bindings = payload.bindings as Record<string, unknown> | undefined;
      expect(bindings).toBeDefined();
      expect((bindings as Record<string, unknown>)?.labware).toEqual([]);
      expect((bindings as Record<string, unknown>)?.materials).toEqual([]);
      expect((bindings as Record<string, unknown>)?.contexts).toEqual([]);
    });

    it('happy path: uses custom title when provided', async () => {
      const localProtocolId = 'LPR-test-custom';
      const mockStore = makeMockStore(
        makeLocalProtocolEnvelope(localProtocolId, 'Source Title'),
        { success: true },
      );

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(localProtocolId, {
        title: 'My Custom Plan',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      const payload = result.envelope.payload as Record<string, unknown>;
      expect(payload.title).toBe('My Custom Plan');
    });

    it('returns 400 when localProtocolRef is empty', async () => {
      const mockStore = makeMockStore();
      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol('');

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.status).toBe(400);
      expect(result.reason).toBe('localProtocolRef required');
    });

    it('returns 404 when local-protocol is not found', async () => {
      const mockStore = makeMockStore(null);
      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol('LPR-nonexistent');

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.status).toBe(404);
      expect(result.reason).toBe('local-protocol not found');
    });

    it('returns 400 when resolved record is not a local-protocol', async () => {
      const mockStore = makeMockStore(
        makeProtocolEnvelope('PRT-some-protocol', 'Some Protocol'),
        { success: true },
      );
      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol('PRT-some-protocol');

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.status).toBe(400);
      expect(result.reason).toContain('not a local-protocol');
      expect(result.reason).toContain('kind=protocol');
    });

    it('uses default title when local-protocol has no title', async () => {
      const mockStore = makeMockStore(
        {
          recordId: 'LPR-no-title',
          schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml',
          payload: {
            kind: 'local-protocol',
            recordId: 'LPR-no-title',
          },
        },
        { success: true },
      );
      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol('LPR-no-title');

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');

      const payload = result.envelope.payload as Record<string, unknown>;
      expect(payload.title).toBe('Plan: Untitled local-protocol');
    });
  });
});
