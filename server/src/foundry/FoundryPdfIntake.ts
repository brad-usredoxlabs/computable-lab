import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { asRecord, nowIso, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';

const execFileAsync = promisify(execFile);

export interface FoundryPdfIntakeResult {
  ingested: number;
  skipped: number;
  failed: number;
  records: Array<{
    protocolId: string;
    pdfPath: string;
    textPath?: string;
    segmentPath?: string;
    materialContextPath?: string;
    status: 'ingested' | 'skipped' | 'failed';
    message?: string;
  }>;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'protocol';
}

async function listPdfs(artifactRoot: string): Promise<string[]> {
  const dir = join(artifactRoot, 'pdfs');
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((file) => file.toLowerCase().endsWith('.pdf'))
    .sort()
    .map((file) => join(dir, file));
}

async function readProcurementSidecar(pdfPath: string): Promise<Record<string, unknown>> {
  const sidecar = `${pdfPath}.procurement.yaml`;
  if (!existsSync(sidecar)) return {};
  return asRecord(await readYamlFile(sidecar));
}

async function extractPdfText(pdfPath: string, textPath: string): Promise<void> {
  await mkdir(dirname(textPath), { recursive: true });
  await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, textPath], {
    maxBuffer: 1024 * 1024 * 16,
  });
}

async function writeTextFallback(pdfPath: string, textPath: string, error: unknown): Promise<void> {
  await mkdir(dirname(textPath), { recursive: true });
  await writeFile(
    textPath,
    [
      `PDF text extraction failed for ${pdfPath}.`,
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    ].join('\n'),
    'utf-8',
  );
}

export async function ingestFoundryPdfs(input: {
  artifactRoot: string;
  batchSize?: number;
}): Promise<FoundryPdfIntakeResult> {
  const records: FoundryPdfIntakeResult['records'] = [];
  const pdfs = await listPdfs(input.artifactRoot);
  let remaining = Math.max(1, input.batchSize ?? 4);
  for (const pdfPath of pdfs) {
    if (remaining <= 0) break;
    const protocolId = slugify(basename(pdfPath));
    const textPath = join(input.artifactRoot, 'text', `${protocolId}.txt`);
    const segmentPath = join(input.artifactRoot, 'segments', `${protocolId}.yaml`);
    const materialContextPath = join(input.artifactRoot, 'material-context', `${protocolId}.yaml`);
    if (existsSync(segmentPath)) {
      records.push({ protocolId, pdfPath, status: 'skipped', message: 'segment already exists' });
      continue;
    }
    remaining -= 1;
    const procurement = await readProcurementSidecar(pdfPath);
    try {
      try {
        await extractPdfText(pdfPath, textPath);
      } catch (error) {
        await writeTextFallback(pdfPath, textPath, error);
      }
      const protocolText = await readFile(textPath, 'utf-8');
      await writeYamlFile(segmentPath, {
        kind: 'protocol-foundry-segment',
        protocolId,
        generated_at: nowIso(),
        sourcePdf: pdfPath,
        sourceText: textPath,
        title: typeof procurement['title'] === 'string' && procurement['title'].trim()
          ? procurement['title']
          : basename(pdfPath, '.pdf'),
        sourceDomain: typeof procurement['source_domain'] === 'string' ? procurement['source_domain'] : undefined,
        sourceUrl: typeof procurement['url'] === 'string' ? procurement['url'] : undefined,
        protocol_text: protocolText,
      });
      await writeYamlFile(materialContextPath, {
        kind: 'protocol-foundry-material-context',
        protocolId,
        generated_at: nowIso(),
        sourcePdf: pdfPath,
        materials: [],
        materialSpecs: [],
        vendorProducts: [],
        labwareHints: [],
        notes: [
          'PDF intake creates protocol text and provenance only. Material/material-spec/vendor-product records must be justified by compiler or architect evidence.',
        ],
      });
      records.push({ protocolId, pdfPath, textPath, segmentPath, materialContextPath, status: 'ingested' });
    } catch (error) {
      records.push({
        protocolId,
        pdfPath,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result: FoundryPdfIntakeResult = {
    ingested: records.filter((record) => record.status === 'ingested').length,
    skipped: records.filter((record) => record.status === 'skipped').length,
    failed: records.filter((record) => record.status === 'failed').length,
    records,
  };
  const reportPath = join(input.artifactRoot, 'queues', 'pdf-intake-latest.yaml');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    YAML.stringify({
      kind: 'protocol-foundry-pdf-intake-report',
      generated_at: nowIso(),
      ...result,
    }),
    'utf-8',
  );
  return result;
}
