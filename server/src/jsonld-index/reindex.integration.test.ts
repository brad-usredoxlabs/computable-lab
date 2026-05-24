/**
 * Cold-reindex integration test — exercises the full pipeline against the
 * repo's real records corpus. Establishes the §6 "Done when" gate from
 * `specifications/lab-appliance-ui-plan.md`: a cold rebuild must finish in
 * under 30 seconds on appliance-class hardware. The corpus is currently
 * small (~166 records) so this measures the projector + index hot path,
 * not raw I/O scaling.
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonLdIndex } from './JsonLdIndex.js';
import { JsonLdProjector } from '../jsonld/JsonLdProjector.js';
import { LocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';

const COLD_REINDEX_BUDGET_MS = 30_000;

const repoRoot = resolve(__dirname, '..', '..', '..');
const recordsRoot = resolve(repoRoot, 'records');

describe.skipIf(!existsSync(recordsRoot))(
  'JsonLdIndex cold reindex against records/',
  () => {
    it(`finishes within the ${COLD_REINDEX_BUDGET_MS}ms budget`, async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'jsonld-reindex-'));
      const index = new JsonLdIndex({ dbPath: join(tmp, 'index.sqlite') });
      const projector = new JsonLdProjector();

      try {
        const repo = new LocalRepoAdapter({ basePath: repoRoot });
        const validator = new AjvValidator();
        const lintEngine = new LintEngine();
        const store = createRecordStore(repo, validator, lintEngine, {
          baseDir: 'records',
        });

        const records = await store.list();
        // Sanity — the repo currently ships ~166 records; we just want a
        // non-trivial corpus, not an exact count.
        expect(records.length).toBeGreaterThan(50);

        const start = Date.now();
        for (const env of records) {
          index.upsert(projector.project(env));
        }
        const elapsed = Date.now() - start;

        expect(index.size()).toBe(records.length);
        expect(elapsed).toBeLessThan(COLD_REINDEX_BUDGET_MS);
      } finally {
        index.close();
        rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  },
);
