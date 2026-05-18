import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  createVendorProtocolDocumentFromText,
  decodeVendorProtocolPdf,
  extractVendorProtocolCandidate,
} from './VendorProtocolPdf.js';
import type { ProtocolCandidate, VendorProtocolDocument } from './types.js';

export interface ExtractVendorProtocolCandidateInput {
  workspaceRoot: string;
  artifactPath?: string;
  contentBase64?: string;
  text?: string;
  fileName?: string;
  documentId?: string;
  vendor?: string;
  persist?: boolean;
}

export interface ExtractVendorProtocolCandidateResult {
  kind: 'vendor-protocol-candidate-extraction';
  source: {
    inputKind: 'text' | 'pdf';
    artifactPath?: string;
    fileName: string;
    sha256: string;
  };
  document: {
    source: VendorProtocolDocument['source'];
    pageCount: number;
    sectionCount: number;
    tableCount: number;
    diagnostics: VendorProtocolDocument['diagnostics'];
  };
  candidate: ProtocolCandidate;
  candidatePath?: string;
}

export async function extractVendorProtocolCandidateFromInput(
  input: ExtractVendorProtocolCandidateInput,
): Promise<ExtractVendorProtocolCandidateResult> {
  const loaded = await loadProtocolSource(input);
  const document = loaded.inputKind === 'text'
    ? createVendorProtocolDocumentFromText(loaded.text, {
        filename: loaded.fileName,
        ...(input.documentId ? { documentId: input.documentId } : {}),
        ...(input.vendor ? { vendor: input.vendor } : {}),
      })
    : await decodeVendorProtocolPdf(loaded.buffer, {
        filename: loaded.fileName,
        ...(input.documentId ? { documentId: input.documentId } : {}),
        ...(input.vendor ? { vendor: input.vendor } : {}),
      });

  const candidate = extractVendorProtocolCandidate(document);
  const result: ExtractVendorProtocolCandidateResult = compact({
    kind: 'vendor-protocol-candidate-extraction' as const,
    source: compact({
      inputKind: loaded.inputKind,
      ...(loaded.artifactPath ? { artifactPath: loaded.artifactPath } : {}),
      fileName: loaded.fileName,
      sha256: loaded.sha256,
    }),
    document: {
      source: document.source,
      pageCount: document.pages.length,
      sectionCount: document.sections.length,
      tableCount: document.tables.length,
      diagnostics: document.diagnostics,
    },
    candidate,
  });

  if (input.persist !== false) {
    const candidatePath = await writeCandidateArtifact(input.workspaceRoot, candidate, document.source.documentId);
    result.candidatePath = candidatePath;
  }
  return result;
}

async function loadProtocolSource(input: ExtractVendorProtocolCandidateInput): Promise<
  | { inputKind: 'text'; text: string; fileName: string; sha256: string; artifactPath?: string }
  | { inputKind: 'pdf'; buffer: Buffer; fileName: string; sha256: string; artifactPath?: string }
> {
  if (input.text) {
    return {
      inputKind: 'text',
      text: input.text,
      fileName: input.fileName ?? 'vendor-protocol.txt',
      sha256: createHash('sha256').update(input.text).digest('hex'),
    };
  }
  if (input.contentBase64) {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    return {
      inputKind: 'pdf',
      buffer,
      fileName: input.fileName ?? 'vendor-protocol.pdf',
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }
  if (!input.artifactPath) {
    throw new Error('artifactPath, contentBase64, or text is required');
  }
  const artifactPath = resolveInsidePdfArtifacts(input.workspaceRoot, input.artifactPath);
  const buffer = await readFile(artifactPath);
  return {
    inputKind: 'pdf',
    buffer,
    fileName: input.fileName ?? basename(artifactPath),
    sha256: createHash('sha256').update(buffer).digest('hex'),
    artifactPath,
  };
}

async function writeCandidateArtifact(
  workspaceRoot: string,
  candidate: ProtocolCandidate,
  documentId: string,
): Promise<string> {
  const candidateRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'protocol-candidates');
  const path = join(candidateRoot, `${safeFileName(documentId)}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(candidate, null, 2)}\n`, 'utf-8');
  return relative(workspaceRoot, path);
}

function resolveInsidePdfArtifacts(workspaceRoot: string, path: string): string {
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'pdfs');
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(artifactRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`artifactPath must be inside ${artifactRoot}`);
}

function safeFileName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'vendor-protocol-candidate';
}

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}
