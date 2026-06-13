import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmbeddedGitRepoAdapter } from './EmbeddedGitRepoAdapter.js';

async function makeAdapter(dataDir: string) {
  const adapter = createEmbeddedGitRepoAdapter({
    repoId: 'main',
    dataDir,
    branch: 'main',
    recordsDir: 'records',
    authorName: 'Test User',
    authorEmail: 'test@example.org',
  });
  await adapter.initialize();
  return adapter;
}

describe('EmbeddedGitRepoAdapter', () => {
  let dataDir: string | undefined;

  afterEach(async () => {
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
      dataDir = undefined;
    }
  });

  it('commits records into a durable local bare repository and reopens them', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cl-embedded-git-'));
    const adapter = await makeAdapter(dataDir);

    const created = await adapter.createFile({
      path: 'records/studies/STU-001.yaml',
      content: [
        'kind: study',
        'recordId: STU-001',
        'title: Durable Study',
        'shortSlug: durable-study',
        '',
      ].join('\n'),
      message: 'Create durable study',
    });

    expect(created.success).toBe(true);
    expect(created.commit?.sha).toMatch(/^[a-f0-9]{40}$/);

    const reopened = await makeAdapter(dataDir);
    const file = await reopened.getFile('records/studies/STU-001.yaml');
    expect(file?.content).toContain('Durable Study');

    const history = await reopened.getHistory({ path: 'records/studies/STU-001.yaml', limit: 5 });
    expect(history.map((entry) => entry.message)).toContain('Create durable study');
  });
});
