/**
 * Vendor-draft → real protocol schema gate.
 *
 * This test exists because the mocked-store unit tests (ProtocolExtractionService.test.ts)
 * and the in-memory E2E schemas (integration/extractionE2E.test.ts) BOTH miss the failure
 * the live promote path hits: `CandidatePromoter.promoteCandidate` validates the
 * candidate.draft against the REAL `schema/workflow/protocol.schema.yaml`, which requires
 * a top-level `recordId`. If the vendor mapper ever stops emitting a schema-valid draft,
 * promotion can never succeed — so this test builds a real Ajv validator from the repo's
 * actual schema directory and asserts the mapped draft validates.
 *
 * NOTE: This file deliberately does NOT `vi.mock('node:fs/promises')` — loadAllSchemas and
 * the mapper's artifact read both need real fs access.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ProtocolExtractionService } from './ProtocolExtractionService.js';
import { promoteCandidate } from '../extract/CandidatePromoter.js';
import type { SchemaValidator } from '../extract/CandidatePromoter.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

const mockStore = {
  get: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

describe('vendor-draft promotion gate (real protocol schema)', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const schemaDir = resolve(process.cwd(), '../schema');
    const loadResult = await loadAllSchemas({ basePath: schemaDir, recursive: true });
    const hasProtocol = loadResult.entries.some((e) => e.id === PROTOCOL_SCHEMA_ID);
    expect(hasProtocol, `real protocol schema not loaded from ${schemaDir}`).toBe(true);
    const registry = createSchemaRegistry();
    registry.addSchemas(loadResult.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  afterEach(() => {
    mockStore.get.mockReset();
    mockStore.list.mockReset();
    mockStore.create.mockReset();
    mockStore.update.mockReset();
  });

  async function buildDraft(): Promise<{ draft: Record<string, unknown>; workspaceRoot: string }> {
    const documentId = 'DOC-REAL-1';

    // Write a real candidate artifact on disk so createDraftFromVendorPdf loads it (no mock).
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'proto-gate-'));
    const candidateDir = join(workspaceRoot, 'artifacts', 'foundry', 'protocol-candidates');
    await mkdir(candidateDir, { recursive: true });
    await writeFile(join(candidateDir, `${documentId}.json`), JSON.stringify(candidate));

    const vendorPdfId = 'VPF-REAL-1';
    const vendorPdfEnvelope: RecordEnvelope = {
      recordId: vendorPdfId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/lab/vendor-pdf.schema.yaml',
      payload: {
        kind: 'vendor-pdf',
        recordId: vendorPdfId,
        title: 'Real Schema Test Protocol PDF',
        file: { name: 'real.pdf', sha256: 'abc' },
        source: { vendor: 'Test Vendor', catalogNumber: 'TK-001' },
        vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: documentId },
        extractedText: [{ text: 'Page 1' }, { text: 'Page 2' }],
      },
    };

    mockStore.get.mockResolvedValueOnce(vendorPdfEnvelope);
    mockStore.list.mockResolvedValue([]);
    mockStore.create.mockResolvedValue({ success: true, envelope: {} });

    const ctx = { store: mockStore as unknown as AppContext['store'], workspaceRoot } as unknown as AppContext;
    const svc = new ProtocolExtractionService(ctx);
    vi.spyOn(svc as any, 'nextExtractionDraftId').mockResolvedValue('XDR-000001');

    const result = await svc.createDraftFromVendorPdf({ vendorPdfId });
    return { draft: result.draft.candidates[0].draft as Record<string, unknown>, workspaceRoot };
  }

  it('mapped draft from a vendor-pdf candidate validates against protocol.schema.yaml', async () => {
    const { draft, workspaceRoot } = await buildDraft();
    try {
      const v = validator.validate(draft, PROTOCOL_SCHEMA_ID);
      expect(v.valid, `mapped draft failed real-schema validation:\n${JSON.stringify(v.errors, null, 2)}`).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('the real promoteCandidate pipeline accepts the mapped draft (the failing A3 call)', async () => {
    const { draft, workspaceRoot } = await buildDraft();
    try {
      // Replicate ExtractHandlers.promoteCandidate: validate candidate.draft against the
      // target schema (real repo schema) via the CandidatePromoter, then mint record+audit.
      const schemaValidator: SchemaValidator = {
        validate: (d: unknown, schemaId: string) => {
          const res = validator.validate(d, schemaId);
          return res.valid ? { ok: true } : { ok: false, errors: res.errors?.map((e) => e.message) ?? [] };
        },
      };
      const targetSchemaIdByKind = new Map<string, string>([['protocol', PROTOCOL_SCHEMA_ID]]);

      const outcome = promoteCandidate({
        candidate: { target_kind: 'protocol', draft, confidence: 0.7 },
        draftRecordId: 'XDR-000001',
        candidatePath: 'candidates[0]',
        sourceArtifactRef: { kind: 'file', id: 'VPF-REAL-1' },
        targetRecordId: 'CAN-protocol-1',
        targetSchemaIdByKind,
        validator: schemaValidator,
      });

      if (!outcome.ok) {
        throw new Error(`promoteCandidate rejected mapped draft: ${outcome.reason}${outcome.validation_errors ? ' :: ' + outcome.validation_errors.join('; ') : ''}`);
      }
      expect(outcome.record.kind).toBe('protocol');
      expect(outcome.record.recordId).toBe('CAN-protocol-1');
      expect(outcome.promotion.output_ref.id).toBe('CAN-protocol-1');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

const candidate: Record<string, unknown> = {
  kind: 'vendor-protocol-candidate',
  title: 'Real Schema Test Protocol',
  scope: 'Promotion-gate validation',
  source: { documentId: 'DOC-REAL-1', filename: 'real.pdf', pageCount: 2 },
  materials: [
    { id: 'mat-1', label: 'Buffer A', sourceText: 'Add 200 uL Buffer A', confidence: 0.95, provenance: { documentId: 'DOC-REAL-1', pageStart: 1 } },
  ],
  labware: [
    { id: 'lw-1', label: '96-well plate', sourceText: '96-well plate', confidence: 0.9, provenance: { documentId: 'DOC-REAL-1', pageStart: 1 } },
  ],
  equipment: [],
  steps: [
    {
      id: 'step-1', stepNumber: 1, sourceText: 'Add 200 uL Buffer A to each well',
      actions: [{ actionKind: 'add', sourceText: 'Add 200 uL Buffer A', target: '96-well plate', material: 'Buffer A', volume: { raw: '200 uL', value: 200, unit: 'uL' }, provenance: { documentId: 'DOC-REAL-1', pageStart: 1 } }],
      conditions: {}, materials: ['Buffer A'], labware: ['96-well plate'], equipment: [], notes: [], branches: [], provenance: { documentId: 'DOC-REAL-1', pageStart: 1 }, confidence: 0.9,
    },
    {
      id: 'step-2', stepNumber: 2, sourceText: 'Incubate at 37C for 30 minutes',
      actions: [{ actionKind: 'incubate', sourceText: 'Incubate', target: '96-well plate', duration: { raw: '30 min', value: 30, unit: 'min' }, provenance: { documentId: 'DOC-REAL-1', pageStart: 1 } }],
      conditions: {}, materials: [], labware: ['96-well plate'], equipment: [], notes: [], branches: [], provenance: { documentId: 'DOC-REAL-1', pageStart: 1 }, confidence: 0.9,
    },
  ],
  tables: [], notes: [], outputs: [], diagnostics: [], sections: [],
};
