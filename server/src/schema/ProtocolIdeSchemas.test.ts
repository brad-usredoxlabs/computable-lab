/**
 * Tests for Protocol IDE session and issue-card schema contracts.
 *
 * Validates:
 *  - one valid mutable session payload
 *  - one valid issue-card payload
 *  - one invalid payload that wrongly tries to model immutable rerun history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('ProtocolIdeSchemas', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(process.cwd(), 'schema');
    const paths = [
      'core/datatypes/ref.schema.yaml',
      'core/datatypes/file-ref.schema.yaml',
      'core/common.schema.yaml',
      'workflow/protocol-ide-session.schema.yaml',
      'workflow/protocol-ide-issue-card.schema.yaml',
    ];

    const contents = new Map<string, string>();
    for (const path of paths) {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    }

    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);

    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema, entry.id);
      }
    }
  });

  // ── protocol-ide-session ────────────────────────────────────────────

  describe('protocol-ide-session', () => {
    it('accepts a valid mutable session with vendor_search source', () => {
      const valid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000001',
        sourceMode: 'vendor_search',
        vendor: 'Cayman Chemical',
        title: 'AhR activator protocol',
        pdfUrl: 'https://cayman.com/product/12345.pdf',
        landingUrl: 'https://cayman.com/product/12345',
        latestDirectiveText: 'Run the AhR activation protocol with 96-well plate.',
        latestProtocolRef: {
          kind: 'record',
          id: 'PROT-000001',
          type: 'protocol',
          label: 'AhR activation protocol',
        },
        latestEventGraphRef: {
          kind: 'record',
          id: 'EG-000001',
          type: 'event-graph',
          label: 'AhR event graph',
        },
        rollingIssueSummary: '1 issue: wash-step volume mismatch.',
        issueCardRefs: [
          {
            kind: 'record',
            id: 'PIC-000001',
            type: 'protocol-ide-issue-card',
            label: 'Wash-step volume mismatch',
          },
        ],
        status: 'reviewing',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
        ).valid
      ).toBe(true);
    });

    it('accepts a valid session with upload source mode', () => {
      const valid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000002',
        sourceMode: 'upload',
        title: 'Custom protocol from uploaded PDF',
        uploadedAssetRef: {
          file_name: 'custom-protocol.pdf',
          media_type: 'application/pdf',
          size_bytes: 204800,
          source_url: 'https://example.com/uploads/custom-protocol.pdf',
        },
        vendorDocumentRef: {
          kind: 'record',
          id: 'IAR-000001',
          type: 'ingestion-artifact',
          label: 'custom-protocol.pdf',
        },
        ingestionJobRef: {
          kind: 'record',
          id: 'ING-000001',
          type: 'ingestion-job',
          label: 'Custom PDF ingestion',
        },
        protocolImportRef: {
          kind: 'record',
          id: 'XDR-000001',
          type: 'extraction-draft',
          label: 'Custom protocol draft',
        },
        extractedTextRef: {
          kind: 'record',
          id: 'DOC-000001',
          type: 'document',
          label: 'Extracted text',
        },
        evidenceRefs: [
          {
            kind: 'record',
            id: 'EVD-000001',
            type: 'evidence',
            label: 'Wash step evidence',
          },
        ],
        latestDirectiveText: 'Add a 50 uL wash step after incubation.',
        latestProtocolRef: {
          kind: 'record',
          id: 'PROT-000002',
          type: 'protocol',
          label: 'Custom protocol v2',
        },
        latestEventGraphCacheKey: 'eg-cache-abc123',
        latestDeckSummaryRef: {
          kind: 'record',
          id: 'DS-000001',
          type: 'overlay-summary',
          label: 'Deck layout',
        },
        latestToolsSummaryRef: {
          kind: 'record',
          id: 'TS-000001',
          type: 'overlay-summary',
          label: 'Tools',
        },
        latestReagentsSummaryRef: {
          kind: 'record',
          id: 'RS-000001',
          type: 'overlay-summary',
          label: 'Reagents',
        },
        latestBudgetSummaryRef: {
          kind: 'record',
          id: 'BS-000001',
          type: 'overlay-summary',
          label: 'Budget',
        },
        rollingIssueSummary: 'No issues.',
        issueCardRefs: [],
        lastExportAt: '2026-04-25T12:00:00.000Z',
        lastExportBundleRef: {
          kind: 'record',
          id: 'EXP-000001',
          type: 'export-bundle',
          label: 'Export bundle',
        },
        status: 'ready',
        notes: 'User uploaded a custom protocol PDF.',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
        ).valid
      ).toBe(true);
    });

    it('rejects a session missing required fields', () => {
      const invalid = {
        kind: 'protocol-ide-session',
        // missing recordId, sourceMode, status
        latestDirectiveText: 'test',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
        ).valid
      ).toBe(false);
    });

    it('rejects a session with an invalid status enum', () => {
      const invalid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000003',
        sourceMode: 'vendor_search',
        status: 'completed', // not in enum
        latestDirectiveText: 'test',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
        ).valid
      ).toBe(false);
    });

    it('rejects a session that wrongly models immutable rerun history', () => {
      // This payload tries to store an immutable run-history array,
      // which violates the mutable-latest-state contract.
      const invalid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000004',
        sourceMode: 'vendor_search',
        status: 'draft',
        latestDirectiveText: 'test',
        // These fields are NOT part of the session schema — they model
        // immutable run history, which is explicitly forbidden.
        runHistory: [
          {
            runId: 'RUN-001',
            timestamp: '2026-04-25T10:00:00.000Z',
            protocolRef: { kind: 'record', id: 'PROT-001', type: 'protocol' },
            outcome: 'success',
          },
          {
            runId: 'RUN-002',
            timestamp: '2026-04-25T11:00:00.000Z',
            protocolRef: { kind: 'record', id: 'PROT-002', type: 'protocol' },
            outcome: 'failed',
          },
        ],
        branchingBases: [
          {
            baseId: 'BASE-001',
            timestamp: '2026-04-25T09:00:00.000Z',
            protocolRef: { kind: 'record', id: 'PROT-000', type: 'protocol' },
          },
        ],
        compareTimeline: {
          leftRef: { kind: 'record', id: 'PROT-001', type: 'protocol' },
          rightRef: { kind: 'record', id: 'PROT-002', type: 'protocol' },
        },
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });

  // ── protocol-ide-issue-card ─────────────────────────────────────────

  describe('protocol-ide-issue-card', () => {
    it('accepts a valid user-origin issue card with evidence and graph anchor', () => {
      const valid = {
        kind: 'protocol-ide-issue-card',
        recordId: 'PIC-000001',
        sessionRef: {
          kind: 'record',
          id: 'PIS-000001',
          type: 'protocol-ide-session',
          label: 'AhR activator session',
        },
        origin: 'user',
        title: 'Wash-step volume mismatch',
        body: 'The wash step specifies 100 uL but the pipette is set to 50 uL max volume. Need to split into two dispense operations.',
        evidenceCitations: [
          {
            sourceRef: {
              kind: 'record',
              id: 'XDR-000001',
              type: 'extraction-draft',
              label: 'AhR protocol draft',
            },
            snippet: 'Add 100 uL wash buffer to each well and incubate for 5 minutes.',
            page: 3,
            locator: 'section 2.1',
          },
        ],
        graphAnchor: 'event:wash-01',
        notes: 'User flagged during review.',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-issue-card.schema.yaml'
        ).valid
      ).toBe(true);
    });

    it('accepts a system-origin issue card without evidence citations', () => {
      const valid = {
        kind: 'protocol-ide-issue-card',
        recordId: 'PIC-000002',
        sessionRef: {
          kind: 'record',
          id: 'PIS-000001',
          type: 'protocol-ide-session',
          label: 'AhR activator session',
        },
        origin: 'system',
        title: 'Pipette too coarse for well volume',
        body: 'The 300 uL pipette channel_map cannot accurately dispense 5 uL volumes in the 96-well plate.',
        evidenceCitations: [],
        graphAnchor: 'event:dispense-03',
        exportedAt: '2026-04-25T14:00:00.000Z',
        exportBundleRef: {
          kind: 'record',
          id: 'EXP-000001',
          type: 'export-bundle',
          label: 'Export bundle',
        },
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-issue-card.schema.yaml'
        ).valid
      ).toBe(true);
    });

    it('accepts a mixed-origin issue card', () => {
      const valid = {
        kind: 'protocol-ide-issue-card',
        recordId: 'PIC-000003',
        sessionRef: {
          kind: 'record',
          id: 'PIS-000001',
          type: 'protocol-ide-session',
          label: 'AhR activator session',
        },
        origin: 'mixed',
        title: 'Compound-class gap: no AhR antagonist available',
        body: 'The protocol references an AhR antagonist but no matching compound-class record exists.',
        evidenceCitations: [
          {
            sourceRef: {
              kind: 'record',
              id: 'XDR-000001',
              type: 'extraction-draft',
              label: 'AhR protocol draft',
            },
            snippet: 'Include AhR antagonist at 10 uM as negative control.',
            page: 2,
          },
        ],
        graphAnchor: 'event:read-01',
      };

      expect(
        validator.validate(
          valid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-issue-card.schema.yaml'
        ).valid
      ).toBe(true);
    });

    it('rejects an issue card missing required fields', () => {
      const invalid = {
        kind: 'protocol-ide-issue-card',
        // missing sessionRef, origin, title, body
        recordId: 'PIC-000004',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-issue-card.schema.yaml'
        ).valid
      ).toBe(false);
    });

    it('rejects an issue card with an invalid origin enum', () => {
      const invalid = {
        kind: 'protocol-ide-issue-card',
        recordId: 'PIC-000005',
        sessionRef: {
          kind: 'record',
          id: 'PIS-000001',
          type: 'protocol-ide-session',
        },
        origin: 'pending', // not in enum
        title: 'Bad origin',
        body: 'This should fail.',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-issue-card.schema.yaml'
        ).valid
      ).toBe(false);
    });

    it('rejects an issue card with workflow-state enum (open/resolved)', () => {
      // Issue cards must NOT carry workflow-state enums like open/resolved.
      // This test ensures the schema does not accept such fields.
      const invalid = {
        kind: 'protocol-ide-issue-card',
        recordId: 'PIC-000006',
        sessionRef: {
          kind: 'record',
          id: 'PIS-000001',
          type: 'protocol-ide-session',
        },
        origin: 'user',
        title: 'Test',
        body: 'Test',
        // These fields are NOT part of the issue-card schema — they model
        // workflow states, which is explicitly forbidden.
        status: 'open',
        resolvedAt: '2026-04-25T12:00:00.000Z',
        verdict: 'accepted',
      };

      expect(
        validator.validate(
          invalid,
          'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-issue-card.schema.yaml'
        ).valid
      ).toBe(false);
    });
  });
});
