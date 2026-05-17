import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { runFoundrySmallBatchAcceptance } from './FoundrySmallBatchAcceptance.js';

describe('FoundrySmallBatchAcceptance', () => {
  it('runs three collected PDFs through dry-run compile/browser/architect artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-small-batch-'));
    const fixtureDir = join(root, 'fixtures');
    await mkdir(fixtureDir, { recursive: true });
    const candidates = [];
    for (let i = 1; i <= 3; i += 1) {
      const pdfPath = join(fixtureDir, `vendor-protocol-${i}.pdf`);
      await writeFile(pdfPath, `%PDF fixture ${i}\nStep 1. Add buffer to sample ${i}.`, 'utf-8');
      candidates.push({
        vendor: `Vendor ${i}`,
        title: `Vendor Protocol ${i}`,
        sourceUrl: pathToFileURL(pdfPath).toString(),
        searchQuery: 'fixture protocol filetype:pdf',
        fileName: `vendor-protocol-${i}.pdf`,
        provenance: { fixture: true },
      });
    }

    const report = await runFoundrySmallBatchAcceptance({
      artifactRoot: root,
      repoRoot: root,
      candidates,
      targetCount: 3,
      maxCycles: 5,
      maxConcurrency: 6,
    });

    expect(report.acceptance).toMatchObject({
      passed: true,
      collectedPdfs: 3,
      protocolCount: 3,
      compiledVariants: 9,
      architectReviewedVariants: 9,
      reviewableVariants: 9,
      requiredArchitectReviews: 9,
    });
    await expect(readFile(join(root, 'queues', 'small-batch-acceptance-latest.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-small-batch-acceptance-report');
    await expect(readFile(join(root, 'manifests', 'status.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-operational-status');
    const reportYaml = YAML.parse(await readFile(report.reportPath, 'utf-8'));
    expect(reportYaml.acceptance.passed).toBe(true);
  }, 30_000);
});
