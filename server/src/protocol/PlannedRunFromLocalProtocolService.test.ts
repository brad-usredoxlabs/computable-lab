/**
 * Tests for PlannedRunFromLocalProtocolService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlannedRunFromLocalProtocolService } from './PlannedRunFromLocalProtocolService.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';

function makeMockStore(getResult?: RecordEnvelope | null, createResult?: { success: boolean }): RecordStore {
  const records = new Map<string, RecordEnvelope>();
  if (getResult) records.set(getResult.recordId, getResult);
  return makeMockStoreFromRecords(records, createResult);
}

function makeMockStoreFromRecords(
  records: Map<string, RecordEnvelope>,
  createResult?: { success: boolean },
): RecordStore {
  return {
    get: async (recordId: string) => records.get(recordId) ?? null,
    getByPath: async () => null,
    getWithValidation: async () => ({ success: true }),
    list: async () => [],
    create: async ({ envelope }: { envelope: RecordEnvelope }) => { records.set(envelope.recordId, envelope); return { success: createResult?.success ?? true, envelope }; },
    update: async () => ({ success: true }),
    delete: async () => ({ success: true }),
    validate: async () => ({ valid: true, errors: [] }),
    lint: async () => ({ valid: true, errors: [] }),
    exists: async (id: string) => records.has(id),
  } as unknown as RecordStore;
}

function makeMultiRecordStore(
  envelopes: RecordEnvelope[],
  createResult?: { success: boolean },
): RecordStore {
  const records = new Map<string, RecordEnvelope>();
  for (const e of envelopes) records.set(e.recordId, e);
  return makeMockStoreFromRecords(records, createResult);
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
        revisionRef: { kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-/) },
      });
      expect(payload.localProtocolRef).toEqual({
        kind: 'record',
        type: 'local-protocol',
        id: localProtocolId,
        revisionRef: { kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-/) },
      });

      // Empty bindings
      const bindings = payload.bindings as Record<string, unknown> | undefined;
      expect(bindings).toBeDefined();
      expect((bindings as Record<string, unknown>)?.labware).toEqual([]);
      expect((bindings as Record<string, unknown>)?.materials).toEqual([]);
      expect((bindings as Record<string, unknown>)?.contexts).toEqual([]);
    });

    it('inherits source local-protocol project links and allows explicit overrides', async () => {
      const localProtocolId = 'LPR-linked';
      const mockStore = makeMockStore(
        {
          ...makeLocalProtocolEnvelope(localProtocolId, 'Linked method'),
          payload: {
            ...makeLocalProtocolEnvelope(localProtocolId, 'Linked method').payload as Record<string, unknown>,
            links: { studyId: 'STU-1', experimentId: 'EXP-source' },
          },
        },
        { success: true },
      );

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(localProtocolId, {
        links: { experimentId: 'EXP-override', runId: 'RUN-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect((result.envelope.payload as Record<string, unknown>).links).toEqual({
        studyId: 'STU-1',
        experimentId: 'EXP-override',
        runId: 'RUN-1',
      });
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

    /* --- Ordered-list tests (u2) --- */

    it('two protocol refs: payload carries both ids in the supplied order', async () => {
      const protoA = makeLocalProtocolEnvelope('LPR-alpha', 'Alpha Protocol');
      const protoB = makeLocalProtocolEnvelope('LPR-beta', 'Beta Protocol');
      const mockStore = makeMultiRecordStore([protoB, protoA], { success: true });

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(['LPR-beta', 'LPR-alpha']);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      const payload = result.envelope.payload as Record<string, unknown>;
      const refs = payload.localProtocolRefs as Array<{ id: string }> | undefined;
      expect(refs).toBeDefined();
      expect(refs).toHaveLength(2);
      expect(refs![0].id).toBe('LPR-beta');
      expect(refs![1].id).toBe('LPR-alpha');
    });

    it('duplicate protocol refs collapse to one entry keeping the first position', async () => {
      const protoA = makeLocalProtocolEnvelope('LPR-alpha', 'Alpha Protocol');
      const mockStore = makeMockStore(protoA, { success: true });

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(['LPR-alpha', 'LPR-alpha']);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      const payload = result.envelope.payload as Record<string, unknown>;
      const refs = payload.localProtocolRefs as Array<{ id: string }> | undefined;
      expect(refs).toBeDefined();
      expect(refs).toHaveLength(1);
      expect(refs![0].id).toBe('LPR-alpha');
      // When deduped to one, the legacy singular field should also be present
      expect(payload.localProtocolRef).toBeDefined();
    });

    it('single protocol ref via array still writes legacy localProtocolRef', async () => {
      const protoA = makeLocalProtocolEnvelope('LPR-alpha', 'Alpha Protocol');
      const mockStore = makeMockStore(protoA, { success: true });

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(['LPR-alpha']);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      const payload = result.envelope.payload as Record<string, unknown>;
      // Legacy singular must be present for a single-ref list
      expect(payload.localProtocolRef).toBeDefined();
      expect((payload.localProtocolRef as { id: string }).id).toBe('LPR-alpha');
      // And the list must also carry one entry
      const refs = payload.localProtocolRefs as Array<{ id: string }> | undefined;
      expect(refs).toBeDefined();
      expect(refs).toHaveLength(1);
    });

    it('unresolvable ref returns 404 naming the id', async () => {
      const protoA = makeLocalProtocolEnvelope('LPR-alpha', 'Alpha Protocol');
      const mockStore = makeMockStore(protoA, { success: true });

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(['LPR-alpha', 'LPR-nonexistent']);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.status).toBe(404);
      expect(result.reason).toContain('LPR-nonexistent');
    });

    it('non-local-protocol ref returns 400 naming the id and kind', async () => {
      const protoA = makeLocalProtocolEnvelope('LPR-alpha', 'Alpha Protocol');
      const nonProto = makeProtocolEnvelope('PRT-some-protocol', 'Some Protocol');
      const mockStore = makeMultiRecordStore([protoA, nonProto], { success: true });

      const service = new PlannedRunFromLocalProtocolService(mockStore);
      const result = await service.createFromLocalProtocol(['LPR-alpha', 'PRT-some-protocol']);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.status).toBe(400);
      expect(result.reason).toContain('PRT-some-protocol');
      expect(result.reason).toContain('protocol');
    });
  });
});
