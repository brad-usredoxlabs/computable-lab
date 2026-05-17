#!/usr/bin/env node
import { resolve } from 'node:path';
import {
  collectFoundryPdfs,
  readFoundryPdfCollectionCandidates,
} from '../foundry/FoundryPdfCollector.js';
import { asRecord, readYamlFile } from '../foundry/FoundryArtifacts.js';
import { protocolIdeDocumentsToFoundryPdfCandidates } from '../vendor-documents/service.js';
import type { ProtocolIdeDocumentResult } from '../vendor-documents/protocolIdeVendors.js';

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function hasFlag(name: string, args: string[]): boolean {
  return args.includes(name);
}

function usage(): string {
  return [
    'Usage: npm run foundry:collect -w server -- --artifact-root <dir> --candidates <yaml> [options]',
    '       npm run foundry:collect -w server -- --artifact-root <dir> --documents <yaml> --search-query <query> [options]',
    '',
    'Options:',
    '  --target-count <n>  Target collection contract size. Default 50.',
    '',
    'Candidate YAML may be an array or an object with a candidates/items array.',
    'Each candidate needs vendor, title, sourceUrl/url/pdfUrl, and searchQuery/query.',
    'Document YAML may be a Protocol IDE document-search response with an items array.',
  ].join('\n');
}

function readDocuments(value: unknown): ProtocolIdeDocumentResult[] {
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray(asRecord(value)['items'])
      ? asRecord(value)['items'] as unknown[]
      : [];
  const documents: ProtocolIdeDocumentResult[] = [];
  for (const item of rawItems) {
    const record = asRecord(item);
    const vendor = typeof record['vendor'] === 'string' ? record['vendor'] : undefined;
    const title = typeof record['title'] === 'string' ? record['title'] : undefined;
    const landingUrl = typeof record['landingUrl'] === 'string' ? record['landingUrl'] : '';
    const documentType = typeof record['documentType'] === 'string' ? record['documentType'] : 'other';
    if (!vendor || !title) continue;
    if (!['protocol', 'application_note', 'white_paper', 'manual', 'other'].includes(documentType)) continue;
    const document: ProtocolIdeDocumentResult = {
      vendor: vendor as ProtocolIdeDocumentResult['vendor'],
      title,
      landingUrl,
      documentType: documentType as ProtocolIdeDocumentResult['documentType'],
    };
    if (typeof record['pdfUrl'] === 'string') document.pdfUrl = record['pdfUrl'];
    if (typeof record['snippet'] === 'string') document.snippet = record['snippet'];
    if (typeof record['sessionIdHint'] === 'string') document.sessionIdHint = record['sessionIdHint'];
    documents.push(document);
  }
  return documents;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (hasFlag('--help', args) || hasFlag('-h', args)) {
    console.log(usage());
    return 0;
  }
  const artifactRoot = readArg('--artifact-root', args);
  const candidatesPath = readArg('--candidates', args);
  const documentsPath = readArg('--documents', args);
  if (!artifactRoot || (!candidatesPath && !documentsPath)) {
    console.error(usage());
    return 2;
  }
  const targetCount = Number(readArg('--target-count', args) ?? 50);
  const candidates = candidatesPath
    ? await readFoundryPdfCollectionCandidates(resolve(candidatesPath))
    : protocolIdeDocumentsToFoundryPdfCandidates(
        readDocuments(await readYamlFile(resolve(documentsPath!))),
        {
          searchQuery: readArg('--search-query', args) ?? '',
          provenance: {
            source_file: resolve(documentsPath!),
          },
        },
      );
  const report = await collectFoundryPdfs({
    artifactRoot: resolve(artifactRoot),
    candidates,
    targetCount,
  });
  console.log(JSON.stringify({
    kind: report.kind,
    found: report.found,
    targetCount: report.targetCount,
    counts: report.counts,
    reportPath: `${resolve(artifactRoot)}/queues/pdf-collection-latest.yaml`,
  }, null, 2));
  return report.counts.failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  },
);
