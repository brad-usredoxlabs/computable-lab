/**
 * Tests for protocol-ide-session feedbackComments with polymorphic anchors[].
 *
 * Validates:
 *  - Valid case 1: session with one comment containing only a node anchor
 *  - Valid case 2: session with one comment containing node + source anchors
 *  - Backward compat: session with no feedbackComments field
 *  - Invalid 1: comment with empty anchors array → schema validation fails
 *  - Invalid 2: node anchor with malformed semanticKey → schema validation fails
 *  - Invalid 3: anchor with unknown kind → schema validation fails (oneOf)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('ProtocolIdeSessionAnchors', () => {
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

  // ── Valid case 1: node-only comment ─────────────────────────────────

  describe('valid case 1: node-only comment', () => {
    it('accepts a session with one comment containing only a node anchor', () => {
      const valid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000010',
        sourceMode: 'vendor_search',
        status: 'reviewing',
        latestDirectiveText: 'Review the wash step.',
        feedbackComments: [
          {
            id: 'cmt-001',
            body: 'Wash volume seems too low here.',
            anchors: [
              {
                kind: 'node',
                semanticKey: 'EVT-wash-cell-plate-prep-1',
                snapshot: {
                  kind: 'wash',
                  target: { labwareInstanceId: 'cell-plate' },
                  volume_uL: 100,
                },
              },
            ],
            submittedAt: '2026-04-26T10:00:00Z',
          },
        ],
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Valid case 2: node + source anchors ─────────────────────────────

  describe('valid case 2: node + source anchors', () => {
    it('accepts a session with one comment containing node (primary) and source (auxiliary) anchors', () => {
      const valid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000011',
        sourceMode: 'pdf_url',
        status: 'reviewing',
        latestDirectiveText: 'Review the protocol.',
        feedbackComments: [
          {
            id: 'cmt-002',
            body: 'Should be 200 µL per protocol p.3.',
            anchors: [
              {
                kind: 'node',
                semanticKey: 'EVT-wash-cell-plate-prep-1',
                snapshot: {
                  kind: 'wash',
                  target: { labwareInstanceId: 'cell-plate' },
                  volume_uL: 100,
                },
              },
              {
                kind: 'source',
                documentRef: 'VDOC-12345',
                page: 3,
                region: { x: 0.1, y: 0.4, width: 0.8, height: 0.05 },
              },
            ],
            submittedAt: '2026-04-26T10:00:01Z',
          },
        ],
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Backward compat: no feedbackComments ────────────────────────────

  describe('backward compat: no feedbackComments', () => {
    it('accepts a session without the feedbackComments field', () => {
      const valid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000012',
        sourceMode: 'upload',
        status: 'draft',
        latestDirectiveText: 'Initial directive.',
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Invalid 1: empty anchors array ──────────────────────────────────

  describe('invalid 1: empty anchors array', () => {
    it('rejects a comment with anchors: [] (minItems: 1)', () => {
      const invalid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000020',
        sourceMode: 'vendor_search',
        status: 'reviewing',
        latestDirectiveText: 'test',
        feedbackComments: [
          {
            id: 'cmt-bad',
            body: 'This comment has no anchors.',
            anchors: [],
            submittedAt: '2026-04-26T10:00:02Z',
          },
        ],
      };

      const result = validator.validate(
        invalid,
        'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
      );
      expect(result.valid).toBe(false);
    });
  });

  // ── Invalid 2: malformed semanticKey ────────────────────────────────

  describe('invalid 2: malformed semanticKey', () => {
    it('rejects a node anchor with semanticKey that does not match ^EVT-[a-z0-9-]+$', () => {
      const invalid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000021',
        sourceMode: 'vendor_search',
        status: 'reviewing',
        latestDirectiveText: 'test',
        feedbackComments: [
          {
            id: 'cmt-bad',
            body: 'Bad semantic key.',
            anchors: [
              {
                kind: 'node',
                semanticKey: 'no-prefix',
                snapshot: {
                  kind: 'wash',
                  target: { labwareInstanceId: 'cell-plate' },
                },
              },
            ],
            submittedAt: '2026-04-26T10:00:03Z',
          },
        ],
      };

      const result = validator.validate(
        invalid,
        'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
      );
      expect(result.valid).toBe(false);
    });
  });

  // ── Invalid 3: unknown anchor kind ──────────────────────────────────

  describe('invalid 3: unknown anchor kind', () => {
    it('rejects an anchor with kind: unknown (oneOf)', () => {
      const invalid = {
        kind: 'protocol-ide-session',
        recordId: 'PIS-000022',
        sourceMode: 'vendor_search',
        status: 'reviewing',
        latestDirectiveText: 'test',
        feedbackComments: [
          {
            id: 'cmt-bad',
            body: 'Unknown anchor kind.',
            anchors: [
              {
                kind: 'unknown',
                someField: 'value',
              },
            ],
            submittedAt: '2026-04-26T10:00:04Z',
          },
        ],
      };

      const result = validator.validate(
        invalid,
        'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml'
      );
      expect(result.valid).toBe(false);
    });
  });
});
