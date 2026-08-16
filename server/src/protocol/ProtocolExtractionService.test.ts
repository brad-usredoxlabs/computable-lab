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

// Mock node:fs/promises for vendor-pdf candidate loading
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock VendorProtocolCandidateService
vi.mock('../ingestion/vendor-protocol/VendorProtocolCandidateService.js', () => ({
  extractVendorProtocolCandidateFromInput: vi.fn(),
}));

import * as fs from 'node:fs/promises';
import { extractVendorProtocolCandidateFromInput } from '../ingestion/vendor-protocol/VendorProtocolCandidateService.js';

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

  describe('createDraftFromVendorPdf', () => {
    const vendorPdfId = 'VPF-000001';
    const documentId = 'DOC-ABC-123';

    const mockCandidate: Record<string, unknown> = {
      kind: 'vendor-protocol-candidate',
      title: 'Test Kit Protocol',
      scope: 'A test protocol for validation',
      source: {
        documentId,
        filename: 'test-protocol.pdf',
        pageCount: 10,
      },
      materials: [
        {
          id: 'mat-1',
          label: 'Buffer A',
          sourceText: 'Add 200 µL Buffer A',
          confidence: 0.95,
          provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
        },
      ],
      labware: [
        {
          id: 'lw-1',
          label: '96-well plate',
          sourceText: '96-well reaction plate',
          confidence: 0.9,
          provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
        },
      ],
      equipment: [],
      steps: [
        {
          id: 'step-1',
          stepNumber: 1,
          sourceText: 'Add 200 µL Buffer A to each well',
          actions: [
            {
              actionKind: 'add' as const,
              sourceText: 'Add 200 µL Buffer A',
              target: '96-well plate',
              material: 'Buffer A',
              volume: { raw: '200 µL', value: 200, unit: 'µL' },
              provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
            },
          ],
          conditions: {},
          materials: ['Buffer A'],
          labware: ['96-well plate'],
          equipment: [],
          notes: [],
          branches: [],
          provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
          confidence: 0.9,
        },
      ],
      tables: [],
      notes: [],
      outputs: [],
      diagnostics: [],
      sections: [],
    };

    const mockVendorPdfEnvelope: RecordEnvelope = {
      recordId: vendorPdfId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/lab/vendor-pdf.schema.yaml',
      payload: {
        kind: 'vendor-pdf',
        recordId: vendorPdfId,
        title: 'Test Kit Protocol PDF',
        file: { name: 'test-protocol.pdf', sha256: 'abc123' },
        source: { vendor: 'Test Vendor', catalogNumber: 'TK-001' },
        vendorProtocolCandidateRef: {
          kind: 'record',
          type: 'vendor-protocol-candidate',
          id: documentId,
        },
        extractedText: [{ text: 'Page 1 text' }, { text: 'Page 2 text' }],
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockStore.get.mockReset();
      mockStore.list.mockReset().mockResolvedValue([]);
      mockStore.create.mockReset().mockResolvedValue({ success: true, envelope: {} });
      mockStore.update.mockReset().mockResolvedValue({ success: true });
      (fs.access as ReturnType<typeof vi.fn>).mockReset();
      (fs.readFile as ReturnType<typeof vi.fn>).mockReset();
      (extractVendorProtocolCandidateFromInput as ReturnType<typeof vi.fn>).mockReset();

      ctx = {
        store: mockStore as unknown as AppContext['store'],
        workspaceRoot: '/tmp/test-workspace',
      } as unknown as AppContext;

      service = new ProtocolExtractionService(ctx);

      vi.spyOn(service as any, 'nextExtractionDraftId').mockResolvedValue('XDR-000001');
    });

    it('should create a draft from a vendor-pdf record when the candidate JSON exists', async () => {
      // Mock store.get to return the vendor-pdf
      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);

      // Mock fs.access to succeed (file exists)
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Mock fs.readFile to return the candidate JSON
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify(mockCandidate)
      );

      const result = await service.createDraftFromVendorPdf({ vendorPdfId });

      expect(result.recordId).toBe('XDR-000001');
      expect(result.draft.kind).toBe('extraction-draft');
      expect(result.draft.source_artifact.id).toBe(vendorPdfId);
      expect(result.draft.source_artifact.kind).toBe('file');
      expect(result.draft.candidates).toHaveLength(1);
      expect(result.draft.candidates[0].target_kind).toBe('protocol');
      expect(result.draft.status).toBe('pending_review');

      // The draft body should have the expected universal-protocol shape
      const draftBody = result.draft.candidates[0].draft as Record<string, unknown>;
      expect(draftBody.protocolLayer).toBe('universal');
      expect(draftBody.kind).toBe('protocol');
      // protocol.schema.yaml requires top-level recordId — the promote path validates
      // candidate.draft against the real schema, so the vendor mapper MUST emit it.
      expect(draftBody.recordId).toBeDefined();
      expect(draftBody.recordId).toMatch(/^PRT-/);
      expect(draftBody.title).toBe('Test Kit Protocol');
      expect(draftBody.state).toBe('draft');
      expect(draftBody.tags).toContain('autogenerated');
      expect(draftBody.tags).toContain('source:vendor');
      expect(draftBody.source).toEqual({
        type: 'vendor',
        ref: {
          kind: 'record',
          type: 'vendor-pdf',
          id: vendorPdfId,
        },
      });

      // Verify steps are mapped correctly
      const steps = draftBody.steps as Array<Record<string, unknown>>;
      expect(steps.length).toBe(1);
      expect(steps[0].kind).toBe('add_material');

      // Verify roles are populated
      const roles = draftBody.roles as Record<string, unknown>;
      expect(Array.isArray(roles.materialRoles as unknown[])).toBe(true);
      expect((roles.materialRoles as unknown[]).length).toBe(1);
      expect(((roles.materialRoles as unknown[])[0] as Record<string, unknown>).roleId).toBe('material_buffer_a');
      expect(Array.isArray(roles.labwareRoles as unknown[])).toBe(true);
      expect((roles.labwareRoles as unknown[]).length).toBe(1);

      // Should NOT have called extractVendorProtocolCandidateFromInput (file was found)
      expect(extractVendorProtocolCandidateFromInput).not.toHaveBeenCalled();

      // Verify the draft was persisted via store.create
      expect(mockStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          envelope: expect.objectContaining({
            recordId: 'XDR-000001',
            schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
          }),
        })
      );
    });

    it('should re-extract (regenerate) when requested', async () => {
      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);

      const mockExtractionResult = {
        kind: 'vendor-protocol-candidate-extraction',
        candidate: mockCandidate,
        source: { inputKind: 'text' as const },
        document: { pageCount: 2 },
      };

      (extractVendorProtocolCandidateFromInput as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockExtractionResult);

      const result = await service.createDraftFromVendorPdf({
        vendorPdfId,
        regenerate: true,
      });

      expect(result.recordId).toBe('XDR-000001');
      expect(result.draft.status).toBe('pending_review');

      // Should have called extractVendorProtocolCandidateFromInput
      expect(extractVendorProtocolCandidateFromInput).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceRoot: '/tmp/test-workspace',
          text: 'Page 1 text\n\nPage 2 text',
          documentId,
          persist: true,
        })
      );
    });

    it('should fall back to re-extraction when candidate JSON is missing', async () => {
      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);

      // Mock fs.access to throw (file not found)
      (fs.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const mockExtractionResult = {
        kind: 'vendor-protocol-candidate-extraction',
        candidate: mockCandidate,
        source: { inputKind: 'text' as const },
        document: { pageCount: 2 },
      };

      (extractVendorProtocolCandidateFromInput as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockExtractionResult);

      const result = await service.createDraftFromVendorPdf({ vendorPdfId });

      expect(result.recordId).toBe('XDR-000001');
      expect(result.draft.candidates[0].target_kind).toBe('protocol');

      // Should have fallen back to re-extraction
      expect(extractVendorProtocolCandidateFromInput).toHaveBeenCalled();
    });

    it('should throw 404 when the vendor-pdf is missing', async () => {
      mockStore.get.mockResolvedValueOnce(null);

      await expect(
        service.createDraftFromVendorPdf({ vendorPdfId })
      ).rejects.toThrow(ProtocolExtractionError);

      // Verify error details
      try {
        await service.createDraftFromVendorPdf({ vendorPdfId });
      } catch (err: any) {
        expect(err.code).toBe('NOT_FOUND');
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain('Vendor PDF not found');
      }
    });

    it('should use documentId from vendorProtocolCandidateRef.id', async () => {
      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify(mockCandidate)
      );

      await service.createDraftFromVendorPdf({ vendorPdfId });

      // The fs.access should have been called with the path containing the documentId
      expect(fs.access).toHaveBeenCalledWith(
        expect.stringContaining('DOC-ABC-123')
      );
    });

    it('should throw 400 when vendorPdfId is empty', async () => {
      await expect(
        service.createDraftFromVendorPdf({ vendorPdfId: '' })
      ).rejects.toThrow('vendorPdfId is required');
    });

    it('should produce "other" step kind for unmappable action kinds', async () => {
      const candidateWithCentrifuge: Record<string, unknown> = {
        ...mockCandidate,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            sourceText: 'Centrifuge for 5 min at 1000xg',
            actions: [
              {
                actionKind: 'centrifuge' as const,
                sourceText: 'Centrifuge',
                provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
                duration: { raw: '5 min', value: 5, unit: 'min' },
              },
            ],
            conditions: {},
            materials: [],
            labware: [],
            equipment: [],
            notes: [],
            branches: [],
            provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
            confidence: 0.8,
          },
        ],
      };

      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify(candidateWithCentrifuge)
      );

      const result = await service.createDraftFromVendorPdf({ vendorPdfId });

      const steps = result.draft.candidates[0].draft.steps as Array<Record<string, unknown>>;
      expect(steps[0].kind).toBe('other');
      expect(steps[0].description).toBe('Centrifuge for 5 min at 1000xg');
    });

    it('should use custom title when provided', async () => {
      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify(mockCandidate)
      );

      const result = await service.createDraftFromVendorPdf({
        vendorPdfId,
        title: 'My Custom Protocol Title',
      });

      const draftBody = result.draft.candidates[0].draft as Record<string, unknown>;
      expect(draftBody.title).toBe('My Custom Protocol Title');
    });

    it('emits working_concentration instead of volume_uL when the action carries a final concentration', async () => {
      const candidateWithConc: Record<string, unknown> = {
        ...mockCandidate,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            sourceText: 'Add fenofibrate to a final concentration of 10 nM in each well',
            actions: [
              {
                actionKind: 'add' as const,
                sourceText: 'Add fenofibrate to a final concentration of 10 nM',
                target: '96-well plate',
                material: 'Buffer A',
                concentration: { raw: '10 nM', value: 10, unit: 'nM' },
                provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
              },
            ],
            conditions: {},
            materials: ['Buffer A'],
            labware: ['96-well plate'],
            equipment: [],
            notes: [],
            branches: [],
            provenance: { documentId: 'DOC-ABC-123', pageStart: 1 },
            confidence: 0.9,
          },
        ],
      };

      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify(candidateWithConc)
      );

      const result = await service.createDraftFromVendorPdf({ vendorPdfId });

      const steps = result.draft.candidates[0].draft.steps as Array<Record<string, unknown>>;
      const step = steps[0];
      expect(step.kind).toBe('add_material');
      // concentration-first north star: no baked volume; working_concentration emitted
      expect(step).not.toHaveProperty('volume_uL');
      expect(step.working_concentration).toEqual({ value: 10, unit: 'nM', basis: 'molar' });
    });

    it('still emits legacy volume_uL when the action has a volume but no concentration (back-compat)', async () => {
      // mockCandidate's single step has action.volume only — no concentration
      mockStore.get.mockResolvedValueOnce(mockVendorPdfEnvelope);
      (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify(mockCandidate)
      );

      const result = await service.createDraftFromVendorPdf({ vendorPdfId });

      const steps = result.draft.candidates[0].draft.steps as Array<Record<string, unknown>>;
      expect(steps[0].kind).toBe('add_material');
      expect(steps[0]).toHaveProperty('volume_uL');
      expect(steps[0]).not.toHaveProperty('working_concentration');
    });
  });
});
