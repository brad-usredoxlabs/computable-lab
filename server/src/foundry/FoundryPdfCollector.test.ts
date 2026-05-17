import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  collectFoundryPdfs,
  readFoundryPdfCollectionCandidates,
  readFoundryPdfCollectionReport,
} from './FoundryPdfCollector.js';

describe('FoundryPdfCollector', () => {
  async function makeRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-pdf-collector-'));
    await mkdir(join(root, 'fixtures'), { recursive: true });
    await writeFile(join(root, 'fixtures', 'vendor-protocol.pdf'), '%PDF fixture\nStep 1. Add buffer.', 'utf-8');
    return root;
  }

  it('reads candidate YAML, copies PDFs into the foundry contract, and writes provenance sidecars', async () => {
    const root = await makeRoot();
    const fixturePdf = join(root, 'fixtures', 'vendor-protocol.pdf');
    const candidatesPath = join(root, 'candidates.yaml');
    await writeFile(candidatesPath, YAML.stringify({
      kind: 'protocol-foundry-pdf-candidates',
      candidates: [
        {
          vendor: 'Acme Bio',
          title: 'Acme Cleanup Protocol',
          sourceUrl: pathToFileURL(fixturePdf).toString(),
          searchQuery: 'site:acme.example cleanup protocol filetype:pdf',
          fileName: 'acme-cleanup.pdf',
          provenance: {
            collector: 'fixture',
            evidence: 'curated smoke-test candidate',
          },
        },
        {
          vendor: 'Acme Bio',
          title: 'Acme Cleanup Protocol Duplicate',
          sourceUrl: pathToFileURL(fixturePdf).toString(),
          searchQuery: 'duplicate smoke test',
          fileName: 'acme-cleanup.pdf',
        },
      ],
    }), 'utf-8');

    const candidates = await readFoundryPdfCollectionCandidates(candidatesPath);
    const report = await collectFoundryPdfs({
      artifactRoot: root,
      candidates,
      targetCount: 50,
      now: '2026-05-10T12:00:00.000Z',
    });

    expect(report.found).toBe(2);
    expect(report.counts).toEqual({ downloaded: 1, skippedDuplicate: 1, failed: 0 });
    expect(report.records.map((record) => record.status)).toEqual(['downloaded', 'skipped_duplicate']);
    await expect(readFile(join(root, 'pdfs', 'acme-cleanup.pdf'), 'utf-8')).resolves.toContain('Step 1');
    const sidecar = YAML.parse(await readFile(join(root, 'pdfs', 'acme-cleanup.pdf.procurement.yaml'), 'utf-8'));
    expect(sidecar).toMatchObject({
      kind: 'protocol-pdf-procurement',
      vendor: 'Acme Bio',
      title: 'Acme Cleanup Protocol',
      url: pathToFileURL(fixturePdf).toString(),
      search_query: 'site:acme.example cleanup protocol filetype:pdf',
      collection_status: 'downloaded',
      provenance: {
        collection_contract: 'protocol-foundry-vendor-pdf-v1',
        collector: 'fixture',
      },
    });
    await expect(readFoundryPdfCollectionReport(root)).resolves.toMatchObject({
      kind: 'protocol-foundry-pdf-collection-report',
      targetCount: 50,
      counts: { downloaded: 1, skippedDuplicate: 1, failed: 0 },
    });
  });

  it('keeps failures in the collection report without blocking other candidates', async () => {
    const root = await makeRoot();
    const missingPdf = join(root, 'fixtures', 'missing.pdf');

    const report = await collectFoundryPdfs({
      artifactRoot: root,
      candidates: [{
        vendor: 'Missing Vendor',
        title: 'Missing Protocol',
        sourceUrl: pathToFileURL(missingPdf).toString(),
        searchQuery: 'missing file fixture',
      }],
    });

    expect(report.counts.failed).toBe(1);
    expect(report.records[0]).toMatchObject({
      status: 'failed',
      vendor: 'Missing Vendor',
      title: 'Missing Protocol',
    });
    await expect(readFile(join(root, 'queues', 'pdf-collection-latest.yaml'), 'utf-8')).resolves.toContain('failed: 1');
  });
});
