/**
 * Tests for ProtocolExtractionService
 * 
 * These tests verify the two-step extraction flow:
 * 1. extractDraftFromEventGraph - creates an extraction-draft with candidates
 * 2. promoteDraft - promotes a candidate to canonical protocol + audit record
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolExtractionService, ProtocolExtractionError } from './ProtocolExtractionService.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

// Mock the store
const mockStore = {
  get: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ success: true, envelope: {} }),
  update: vi.fn().mockResolvedValue({ success: true }),
  delete: vi.fn(),
};

// Mock runPromotionCompile
vi.mock('../compiler/pipeline/PromotionCompileRunner.js', () => ({
  runPromotionCompile: vi.fn(),
}));

import { runPromotionCompile } from '../compiler/pipeline/PromotionCompileRunner.js';

describe('ProtocolExtractionService', () => {
  let service: ProtocolExtractionService;
  let ctx: AppContext;

  beforeEach(() => {
    // Don't clear all mocks - we need to preserve the spies
    // vi.clearAllMocks();
    
    ctx = {
      store: mockStore as unknown as AppContext['store'],
    } as unknown as AppContext;

    service = new ProtocolExtractionService(ctx);
    
    // Mock the nextProtocolId and nextExtractionDraftId methods to return predictable values
    vi.spyOn(service as any, 'nextProtocolId').mockResolvedValue('PRT-000001');
    vi.spyOn(service as any, 'nextExtractionDraftId').mockResolvedValue('XDR-000001');
  });

  describe('extractDraftFromEventGraph', () => {
    it('should create an extraction-draft from an event graph', async () => {
      const eventGraphId = 'EG-000001';
      const eventGraphEnvelope: RecordEnvelope = {
        recordId: eventGraphId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          recordId: eventGraphId,
          name: 'Test Protocol',
          description: 'A test protocol',
          events: [
            {
              eventId: 'step-001',
              event_type: 'add_material',
              t_offset: '00:00:00',
              details: {
                labwareInstanceId: 'plate-1',
                labwareType: '96-well-plate',
                wells: ['A1', 'A2'],
                volume_uL: 100,
              },
            },
          ],
          labwares: [
            {
              labwareId: 'plate-1',
              labwareType: '96-well-plate',
            },
          ],
        },
      };

      mockStore.get.mockResolvedValueOnce(eventGraphEnvelope);
      mockStore.list.mockResolvedValueOnce([]); // No existing extraction-drafts
      mockStore.create.mockResolvedValueOnce({
        success: true,
        envelope: {
          recordId: 'XDR-000001',
          schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
          payload: {
            kind: 'extraction-draft',
            recordId: 'XDR-000001',
            source_artifact: { kind: 'file', id: eventGraphId },
            candidates: [],
            status: 'pending_review',
          },
        },
      });

      const result = await service.extractDraftFromEventGraph({
        eventGraphId,
        title: 'Test Protocol',
      });

      expect(result.recordId).toBe('XDR-000001');
      expect(result.draft.kind).toBe('extraction-draft');
      expect(result.draft.target_kind).toBeUndefined(); // Draft itself doesn't have target_kind
      expect(result.draft.candidates).toHaveLength(1);
      expect(result.draft.candidates[0].target_kind).toBe('protocol');
      expect(result.draft.candidates[0].draft).toBeDefined();
      expect(result.draft.status).toBe('pending_review');
    });

    it('should throw error if event graph not found', async () => {
      mockStore.get.mockResolvedValueOnce(null);

      await expect(
        service.extractDraftFromEventGraph({ eventGraphId: 'EG-000001' })
      ).rejects.toThrow(ProtocolExtractionError);
    });

    it('should throw error if event graph has no events', async () => {
      const eventGraphEnvelope: RecordEnvelope = {
        recordId: 'EG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          recordId: 'EG-000001',
          name: 'Test Protocol',
          events: undefined, // No events
        },
      };

      mockStore.get.mockResolvedValueOnce(eventGraphEnvelope);

      await expect(
        service.extractDraftFromEventGraph({ eventGraphId: 'EG-000001' })
      ).rejects.toThrow('does not contain an events array');
    });

    it('should build protocol with correct structure from event graph', async () => {
      const eventGraphId = 'EG-000001';
      const eventGraphEnvelope: RecordEnvelope = {
        recordId: eventGraphId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          recordId: eventGraphId,
          name: 'Transfer Protocol',
          events: [
            {
              eventId: 'transfer-1',
              event_type: 'transfer',
              t_offset: '00:05:00',
              details: {
                source: { labwareInstanceId: 'source-plate', wells: ['A1'] },
                target: { labwareInstanceId: 'target-plate', wells: ['B1'] },
                volume_uL: 50,
              },
            },
          ],
          labwares: [],
        },
      };

      mockStore.get.mockResolvedValueOnce(eventGraphEnvelope);
      mockStore.list.mockResolvedValueOnce([]);
      mockStore.create.mockResolvedValueOnce({
        success: true,
        envelope: {
          recordId: 'XDR-000001',
          schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
          payload: {
            kind: 'extraction-draft',
            recordId: 'XDR-000001',
            source_artifact: { kind: 'file', id: eventGraphId },
            candidates: [],
            status: 'pending_review',
          },
        },
      });

      const result = await service.extractDraftFromEventGraph({ eventGraphId });

      const candidate = result.draft.candidates[0];
      const protocolBody = candidate.draft as Record<string, unknown>;

      expect(protocolBody.kind).toBe('protocol');
      expect(typeof protocolBody.recordId).toBe('string');
      expect((protocolBody.recordId as string)).toMatch(/^PRT-/);
      expect(protocolBody.title).toBe('Transfer Protocol Protocol');
      expect(protocolBody.steps).toBeDefined();
      expect((protocolBody.steps as unknown[]).length).toBe(1);
    });
  });

  describe('promoteDraft', () => {
    it('should promote a candidate and create canonical + audit records', async () => {
      const draftId = 'XDR-000001';
      const canonicalRecordId = 'PRT-000001';
      const auditRecordId = 'XPR-000001';

      const draftEnvelope: RecordEnvelope = {
        recordId: draftId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
        payload: {
          kind: 'extraction-draft',
          recordId: draftId,
          source_artifact: { kind: 'file', id: 'EG-000001' },
          candidates: [
            {
              target_kind: 'protocol',
              draft: {
                kind: 'protocol',
                recordId: canonicalRecordId,
                title: 'Test Protocol',
                steps: [],
                roles: {},
              },
              confidence: 0.95,
            },
          ],
          status: 'pending_review',
        },
      };

      const mockCanonical = {
        recordId: canonicalRecordId,
        kind: 'protocol',
        title: 'Test Protocol',
        steps: [],
        roles: {},
      };

      const mockAudit = {
        recordId: auditRecordId,
        kind: 'extraction-promotion',
        source_draft_id: draftId,
        promoted_at: new Date().toISOString(),
      };

      mockStore.get.mockResolvedValueOnce(draftEnvelope); // Load draft
      (runPromotionCompile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        canonicalRecord: mockCanonical,
        auditRecord: mockAudit,
        diagnostics: [],
        passStatuses: [],
      });
      mockStore.create.mockResolvedValueOnce({
        success: true,
        envelope: { recordId: canonicalRecordId, payload: mockCanonical },
      }); // Create canonical
      mockStore.create.mockResolvedValueOnce({
        success: true,
        envelope: { recordId: auditRecordId, payload: mockAudit },
      }); // Create audit
      mockStore.update.mockResolvedValueOnce({ success: true });

      const result = await service.promoteDraft(draftId, 0);

      expect(result.canonicalRecordId).toBe(canonicalRecordId);
      expect(result.auditRecordId).toBe(auditRecordId);
      expect(result.draftStatus).toBe('promoted');

      // Verify runPromotionCompile was called
      expect(runPromotionCompile).toHaveBeenCalled();

      // Verify canonical was created
      expect(mockStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          envelope: expect.objectContaining({
            recordId: canonicalRecordId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
          }),
        })
      );

      // Verify audit was created
      expect(mockStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          envelope: expect.objectContaining({
            recordId: auditRecordId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-promotion.schema.yaml',
          }),
        })
      );
    });

    it('should throw error if draft not found', async () => {
      mockStore.get.mockResolvedValueOnce(null);

      await expect(service.promoteDraft('XDR-000001', 0)).rejects.toThrow(ProtocolExtractionError);
    });

    it('should throw error if candidate index out of range', async () => {
      const draftEnvelope: RecordEnvelope = {
        recordId: 'XDR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
        payload: {
          kind: 'extraction-draft',
          recordId: 'XDR-000001',
          source_artifact: { kind: 'file', id: 'EG-000001' },
          candidates: [
            { target_kind: 'protocol', draft: {}, confidence: 0.9 },
          ],
          status: 'pending_review',
        },
      };

      mockStore.get.mockResolvedValueOnce(draftEnvelope);

      await expect(service.promoteDraft('XDR-000001', 5)).rejects.toThrow('out of range');
    });

    it('should throw error if candidate target_kind is not protocol', async () => {
      const draftEnvelope: RecordEnvelope = {
        recordId: 'XDR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
        payload: {
          kind: 'extraction-draft',
          recordId: 'XDR-000001',
          source_artifact: { kind: 'file', id: 'EG-000001' },
          candidates: [
            { target_kind: 'equipment', draft: {}, confidence: 0.9 },
          ],
          status: 'pending_review',
        },
      };

      mockStore.get.mockResolvedValueOnce(draftEnvelope);

      await expect(service.promoteDraft('XDR-000001', 0)).rejects.toThrow("target_kind 'equipment'");
    });

    it('should set draft status to partially_promoted if more candidates remain', async () => {
      const draftId = 'XDR-000001';
      const canonicalRecordId = 'PRT-000001';
      const auditRecordId = 'XPR-000001';

      const draftEnvelope: RecordEnvelope = {
        recordId: draftId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
        payload: {
          kind: 'extraction-draft',
          recordId: draftId,
          source_artifact: { kind: 'file', id: 'EG-000001' },
          candidates: [
            { target_kind: 'protocol', draft: { kind: 'protocol', recordId: 'PRT-000001' }, confidence: 0.9 },
            { target_kind: 'protocol', draft: { kind: 'protocol', recordId: 'PRT-000002' }, confidence: 0.8 },
          ],
          status: 'pending_review',
        },
      };

      const mockCanonical = { recordId: canonicalRecordId, kind: 'protocol' };
      const mockAudit = { recordId: auditRecordId, kind: 'extraction-promotion' };

      mockStore.get.mockResolvedValueOnce(draftEnvelope);
      (runPromotionCompile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        canonicalRecord: mockCanonical,
        auditRecord: mockAudit,
        diagnostics: [],
        passStatuses: [],
      });
      mockStore.create.mockResolvedValue({ success: true, envelope: {} });
      mockStore.update.mockResolvedValue({ success: true });

      const result = await service.promoteDraft(draftId, 0);

      expect(result.draftStatus).toBe('partially_promoted');
    });

    it('should throw error if promotion fails', async () => {
      const draftEnvelope: RecordEnvelope = {
        recordId: 'XDR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
        payload: {
          kind: 'extraction-draft',
          recordId: 'XDR-000001',
          source_artifact: { kind: 'file', id: 'EG-000001' },
          candidates: [
            { target_kind: 'protocol', draft: { kind: 'protocol' }, confidence: 0.9 },
          ],
          status: 'pending_review',
        },
      };

      mockStore.get.mockResolvedValueOnce(draftEnvelope);
      (runPromotionCompile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        diagnostics: [
          { severity: 'error', code: 'VALIDATION_ERROR', message: 'Invalid candidate schema' },
        ],
        passStatuses: [],
      });

      await expect(service.promoteDraft('XDR-000001', 0)).rejects.toThrow('Promotion failed');
    });
  });

  describe('saveFromEventGraph', () => {
    it('should use the two-step flow (extractDraft + promoteDraft)', async () => {
      const eventGraphId = 'EG-000001';
      const draftId = 'XDR-000001';
      const canonicalRecordId = 'PRT-000001';

      const eventGraphEnvelope: RecordEnvelope = {
        recordId: eventGraphId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          recordId: eventGraphId,
          name: 'Test Protocol',
          events: [{ eventId: 'step-1', event_type: 'add_material', details: {} }],
          labwares: [],
        },
      };

      const canonicalEnvelope: RecordEnvelope = {
        recordId: canonicalRecordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: { kind: 'protocol', recordId: canonicalRecordId },
      };

      mockStore.get.mockImplementation((id: string) => {
        if (id === eventGraphId) return Promise.resolve(eventGraphEnvelope);
        if (id === canonicalRecordId) return Promise.resolve(canonicalEnvelope);
        return Promise.resolve({
          recordId: draftId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
          payload: {
            kind: 'extraction-draft',
            recordId: draftId,
            source_artifact: { kind: 'file', id: eventGraphId },
            candidates: [{ target_kind: 'protocol', draft: {}, confidence: 0.9 }],
            status: 'pending_review',
          },
        });
      });

      mockStore.list.mockResolvedValue([]);
      mockStore.create.mockResolvedValue({ success: true, envelope: {} });
      mockStore.update.mockResolvedValue({ success: true });
      (runPromotionCompile as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        canonicalRecord: { recordId: canonicalRecordId, kind: 'protocol' },
        auditRecord: { recordId: 'XPR-000001', kind: 'extraction-promotion' },
        diagnostics: [],
        passStatuses: [],
      });

      const result = await service.saveFromEventGraph({ eventGraphId });

      expect(result.recordId).toBe(canonicalRecordId);
      expect(result.envelope).toEqual(canonicalEnvelope);

      // Verify it called extractDraftFromEventGraph
      expect(mockStore.get).toHaveBeenCalledWith(eventGraphId);
      // Verify it called promoteDraft
      expect(runPromotionCompile).toHaveBeenCalled();
    });
  });
});
