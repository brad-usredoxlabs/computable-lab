import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asRecord,
  nowIso,
  readYamlFile,
  slugify,
  writeYamlFile,
} from './FoundryArtifacts.js';

export type FoundryPdfCollectionStatus = 'downloaded' | 'skipped_duplicate' | 'failed';

export interface FoundryPdfCollectionCandidate {
  vendor: string;
  title: string;
  sourceUrl: string;
  searchQuery: string;
  provenance?: Record<string, unknown>;
  fileName?: string;
  documentType?: string;
}

export interface FoundryPdfCollectionRecord {
  vendor: string;
  title: string;
  sourceUrl: string;
  searchQuery: string;
  status: FoundryPdfCollectionStatus;
  pdfPath?: string;
  sidecarPath?: string;
  protocolId?: string;
  duplicateOf?: string;
  message?: string;
}

export interface FoundryPdfCollectionReport {
  kind: 'protocol-foundry-pdf-collection-report';
  generated_at: string;
  artifactRoot: string;
  targetCount: number;
  found: number;
  counts: {
    downloaded: number;
    skippedDuplicate: number;
    failed: number;
  };
  records: FoundryPdfCollectionRecord[];
}

export interface FoundryPdfCollectionOptions {
  artifactRoot: string;
  candidates: FoundryPdfCollectionCandidate[];
  targetCount?: number;
  now?: string;
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = firstString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function candidateFromRecord(record: Record<string, unknown>): FoundryPdfCollectionCandidate | undefined {
  const vendor = optionalString(record, 'vendor', 'vendorName');
  const title = optionalString(record, 'title', 'name');
  const sourceUrl = optionalString(record, 'sourceUrl', 'url', 'pdfUrl');
  const searchQuery = optionalString(record, 'searchQuery', 'query') ?? '';
  if (!vendor || !title || !sourceUrl) return undefined;
  const provenance = asRecord(record['provenance']);
  const candidate: FoundryPdfCollectionCandidate = {
    vendor,
    title,
    sourceUrl,
    searchQuery,
  };
  const fileName = optionalString(record, 'fileName', 'filename');
  const documentType = optionalString(record, 'documentType', 'document_type');
  if (Object.keys(provenance).length > 0) candidate.provenance = provenance;
  if (fileName) candidate.fileName = fileName;
  if (documentType) candidate.documentType = documentType;
  return candidate;
}

export async function readFoundryPdfCollectionCandidates(path: string): Promise<FoundryPdfCollectionCandidate[]> {
  const data = await readYamlFile(path);
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)['candidates'])
      ? asRecord(data)['candidates'] as unknown[]
      : Array.isArray(asRecord(data)['items'])
        ? asRecord(data)['items'] as unknown[]
        : [];
  return rawItems
    .map((item) => candidateFromRecord(asRecord(item)))
    .filter((item): item is FoundryPdfCollectionCandidate => Boolean(item));
}

function sourceDomain(sourceUrl: string): string | undefined {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.hostname || undefined;
  } catch {
    return undefined;
  }
}

function sourceFilePath(sourceUrl: string): string | undefined {
  if (sourceUrl.startsWith('file://')) return fileURLToPath(sourceUrl);
  if (!sourceUrl.includes('://')) return resolve(sourceUrl);
  return undefined;
}

function destinationFileName(candidate: FoundryPdfCollectionCandidate): string {
  if (candidate.fileName && candidate.fileName.toLowerCase().endsWith('.pdf')) return basename(candidate.fileName);
  const parsedName = sourceFilePath(candidate.sourceUrl)
    ? basename(sourceFilePath(candidate.sourceUrl) ?? '')
    : (() => {
        try {
          return basename(new URL(candidate.sourceUrl).pathname);
        } catch {
          return '';
        }
      })();
  if (parsedName.toLowerCase().endsWith('.pdf')) return basename(parsedName);
  return `${slugify(`${candidate.vendor}-${candidate.title}`)}.pdf`;
}

async function writeCandidatePdf(candidate: FoundryPdfCollectionCandidate, pdfPath: string): Promise<void> {
  await mkdir(dirname(pdfPath), { recursive: true });
  const localPath = sourceFilePath(candidate.sourceUrl);
  if (localPath) {
    await copyFile(localPath, pdfPath);
    return;
  }
  const response = await fetch(candidate.sourceUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeYamlFile(`${pdfPath}.download.yaml`, {
    kind: 'protocol-pdf-download-observation',
    sourceUrl: candidate.sourceUrl,
    collected_at: nowIso(),
    bytes: buffer.length,
    contentType: response.headers.get('content-type') ?? undefined,
  });
  await mkdir(dirname(pdfPath), { recursive: true });
  await writeFile(pdfPath, buffer);
}

async function writeProcurementSidecar(input: {
  candidate: FoundryPdfCollectionCandidate;
  pdfPath: string;
  sidecarPath: string;
  collectedAt: string;
  status: FoundryPdfCollectionStatus;
}): Promise<void> {
  const { candidate, pdfPath, sidecarPath, collectedAt, status } = input;
  await writeYamlFile(sidecarPath, {
    kind: 'protocol-pdf-procurement',
    vendor: candidate.vendor,
    title: candidate.title,
    url: candidate.sourceUrl,
    sourceUrl: candidate.sourceUrl,
    source_domain: sourceDomain(candidate.sourceUrl),
    search_query: candidate.searchQuery,
    document_type: candidate.documentType ?? 'vendor_protocol_pdf',
    collected_at: collectedAt,
    pdfPath,
    file_name: basename(pdfPath),
    collection_status: status,
    provenance: {
      collection_contract: 'protocol-foundry-vendor-pdf-v1',
      ...candidate.provenance,
    },
  });
}

export async function collectFoundryPdfs(options: FoundryPdfCollectionOptions): Promise<FoundryPdfCollectionReport> {
  const targetCount = Math.max(1, options.targetCount ?? 50);
  const selected = options.candidates.slice(0, targetCount);
  const collectedAt = options.now ?? nowIso();
  const records: FoundryPdfCollectionRecord[] = [];
  for (const candidate of selected) {
    const pdfPath = join(options.artifactRoot, 'pdfs', destinationFileName(candidate));
    const protocolId = slugify(basename(pdfPath, extname(pdfPath)));
    const sidecarPath = `${pdfPath}.procurement.yaml`;
    if (existsSync(pdfPath)) {
      if (!existsSync(sidecarPath)) {
        await writeProcurementSidecar({
          candidate,
          pdfPath,
          sidecarPath,
          collectedAt,
          status: 'skipped_duplicate',
        });
      }
      records.push({
        vendor: candidate.vendor,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        searchQuery: candidate.searchQuery,
        status: 'skipped_duplicate',
        pdfPath,
        sidecarPath,
        protocolId,
        duplicateOf: pdfPath,
      });
      continue;
    }
    try {
      await writeCandidatePdf(candidate, pdfPath);
      await writeProcurementSidecar({
        candidate,
        pdfPath,
        sidecarPath,
        collectedAt,
        status: 'downloaded',
      });
      records.push({
        vendor: candidate.vendor,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        searchQuery: candidate.searchQuery,
        status: 'downloaded',
        pdfPath,
        sidecarPath,
        protocolId,
      });
    } catch (error) {
      records.push({
        vendor: candidate.vendor,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl,
        searchQuery: candidate.searchQuery,
        status: 'failed',
        protocolId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report: FoundryPdfCollectionReport = {
    kind: 'protocol-foundry-pdf-collection-report',
    generated_at: collectedAt,
    artifactRoot: options.artifactRoot,
    targetCount,
    found: options.candidates.length,
    counts: {
      downloaded: records.filter((record) => record.status === 'downloaded').length,
      skippedDuplicate: records.filter((record) => record.status === 'skipped_duplicate').length,
      failed: records.filter((record) => record.status === 'failed').length,
    },
    records,
  };
  await writeYamlFile(join(options.artifactRoot, 'queues', 'pdf-collection-latest.yaml'), report);
  return report;
}

export async function readFoundryPdfCollectionReport(artifactRoot: string): Promise<FoundryPdfCollectionReport | undefined> {
  return readYamlFile<FoundryPdfCollectionReport>(join(artifactRoot, 'queues', 'pdf-collection-latest.yaml'));
}
