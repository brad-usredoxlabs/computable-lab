/**
 * Smoke test for the Artifact record concept landing on top of the generic
 * RecordStore + PathConvention. Verifies that:
 *   1. `ART-...` record IDs satisfy `isValidRecordId`.
 *   2. `generatePath` nests artifacts under `records/studies/{studyId}/artifacts/`
 *      when the artifact carries a studyId link.
 *   3. `RecordStoreImpl.list({ kind: 'artifact' })` finds artifacts written
 *      to nested paths (the recursive sweep + envelope.kind post-filter).
 *
 * No new HTTP router exists for artifacts — they ride the generic /records
 * endpoints. This test exercises the storage path the API would take.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

import { createRecordStore, RecordStoreImpl } from './RecordStoreImpl.js';
import {
  createLocalRepoAdapter,
  LocalRepoAdapter,
} from '../repo/LocalRepoAdapter.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import {
  generatePath,
  isValidRecordId,
  isNestedKind,
} from '../repo/PathConvention.js';

describe('Artifact storage smoke', () => {
  describe('PathConvention', () => {
    it('accepts ART-XXXXXX as a valid record id', () => {
      expect(isValidRecordId('ART-000001')).toBe(true);
      expect(isValidRecordId('ART-42')).toBe(true);
    });

    it('marks artifact as a nested kind', () => {
      expect(isNestedKind('artifact')).toBe(true);
      expect(isNestedKind('study')).toBe(false);
    });

    it('nests artifact files under the parent study folder', () => {
      const path = generatePath({
        recordId: 'ART-000001',
        kind: 'artifact',
        slug: 'vendor-pdf-buffer-prep',
        links: { studyId: 'STU-000001' },
      });
      expect(path).toBe(
        'records/studies/STU-000001/artifacts/ART-000001__vendor-pdf-buffer-prep.yaml',
      );
    });

    it('falls back to the flat path when no studyId is supplied', () => {
      const path = generatePath({
        recordId: 'ART-000002',
        kind: 'artifact',
        slug: 'orphan',
      });
      expect(path).toBe('records/artifact/ART-000002__orphan.yaml');
    });
  });

  describe('RecordStore listing', () => {
    let store: RecordStoreImpl;
    let repo: LocalRepoAdapter;
    let testDir: string;
    let validator: AjvValidator;
    let lintEngine: LintEngine;

    // Permissive schema — the full artifact schema lives in
    // schema/studies/artifact.schema.yaml and is auto-loaded by the server.
    // This test focuses on storage mechanics, not schema validation.
    const artifactSchema = {
      $id: 'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
      type: 'object',
      properties: {
        recordId: { type: 'string' },
        $schema: { type: 'string' },
        kind: { const: 'artifact' },
        artifactKind: { type: 'string' },
        studyId: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['recordId', '$schema', 'kind', 'artifactKind', 'studyId'],
    };

    beforeEach(async () => {
      testDir = join(tmpdir(), `artifact-smoke-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
      repo = createLocalRepoAdapter({ basePath: testDir });
      validator = new AjvValidator();
      validator.addSchema(artifactSchema);
      lintEngine = new LintEngine();
      store = createRecordStore(repo, validator, lintEngine);
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('round-trips a nested artifact through create → list → get', async () => {
      const envelope = {
        recordId: 'ART-000001',
        schemaId:
          'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
        payload: {
          recordId: 'ART-000001',
          $schema:
            'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
          kind: 'artifact' as const,
          artifactKind: 'protocol',
          studyId: 'STU-000001',
          title: 'Buffer prep protocol',
        },
      };

      const created = await store.create({
        envelope,
        skipLint: true,
      });
      expect(created.success).toBe(true);
      expect(created.envelope?.meta?.path).toContain(
        'records/studies/STU-000001/artifacts/ART-000001',
      );

      // list({ kind: 'artifact' }) must find the nested artifact. Before the
      // nested-kind support this returned [] because it only scanned
      // records/artifact/ non-recursively.
      const listed = await store.list({ kind: 'artifact' });
      expect(listed.map((e) => e.recordId)).toContain('ART-000001');

      const fetched = await store.get('ART-000001');
      expect(fetched).not.toBeNull();
      expect((fetched?.payload as { artifactKind: string }).artifactKind).toBe(
        'protocol',
      );
    });

    it('list does not surface non-artifact records when kind=artifact', async () => {
      // Write an unrelated record into the same repo so we know the kind
      // filter is doing its job, not just returning everything under baseDir.
      const studyEnv = {
        recordId: 'STU-000099',
        schemaId: 'https://example.com/study.schema.yaml',
        payload: {
          recordId: 'STU-000099',
          $schema: 'https://example.com/study.schema.yaml',
          kind: 'study',
          title: 'Some study',
        },
      };
      validator.addSchema({
        $id: 'https://example.com/study.schema.yaml',
        type: 'object',
        properties: {
          recordId: { type: 'string' },
          $schema: { type: 'string' },
          kind: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['recordId', '$schema', 'kind'],
      });
      await store.create({ envelope: studyEnv, skipLint: true });

      const artifactEnv = {
        recordId: 'ART-000002',
        schemaId:
          'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
        payload: {
          recordId: 'ART-000002',
          $schema:
            'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
          kind: 'artifact' as const,
          artifactKind: 'writeup',
          studyId: 'STU-000099',
          title: 'Findings',
        },
      };
      await store.create({ envelope: artifactEnv, skipLint: true });

      const artifacts = await store.list({ kind: 'artifact' });
      expect(artifacts.every((e) => e.meta?.kind === 'artifact')).toBe(true);
      expect(artifacts.map((e) => e.recordId)).toEqual(['ART-000002']);
    });
  });

  describe('Schema file', () => {
    it('is well-formed YAML and declares the expected $id', async () => {
      const path =
        '/home/brad/git/computable-lab/schema/studies/artifact.schema.yaml';
      const text = await readFile(path, 'utf-8');
      const parsed = parseYaml(text) as Record<string, unknown>;
      expect(parsed['$id']).toBe(
        'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
      );
      expect(parsed['title']).toBe('Artifact');
      // Required fields locked in so future edits don't accidentally remove
      // any of them.
      expect(parsed['required']).toEqual([
        'kind',
        'recordId',
        'title',
        'studyId',
        'artifactKind',
      ]);
      const properties = parsed['properties'] as Record<string, unknown>;
      expect(properties['artifactKind']).toBeDefined();
      const artifactKindProp = properties['artifactKind'] as Record<
        string,
        unknown
      >;
      expect(artifactKindProp['enum']).toEqual([
        'pdf',
        'protocol',
        'writeup',
        'training',
        'saved-prompt',
        'conclusion',
      ]);
    });
  });
});
