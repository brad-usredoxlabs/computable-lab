import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  createVendorProtocolDocumentFromText,
  decodeVendorProtocolPdf,
  extractVendorProtocolCandidate,
} from './VendorProtocolPdf.js';
import type { ProtocolCandidate, VendorProtocolDocument } from './types.js';
import type { RecordStore } from '../../store/types.js';

export interface ExtractVendorProtocolCandidateInput {
  workspaceRoot: string;
  artifactPath?: string;
  contentBase64?: string;
  text?: string;
  fileName?: string;
  /** The vendor-pdf record's own title, when the caller has the record. */
  title?: string;
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
        ...(input.title ? { title: input.title } : {}),
        ...(input.documentId ? { documentId: input.documentId } : {}),
        ...(input.vendor ? { vendor: input.vendor } : {}),
      })
    : await decodeVendorProtocolPdf(loaded.buffer, {
        filename: loaded.fileName,
        ...(input.title ? { title: input.title } : {}),
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

export async function writeCandidateArtifact(
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

/** Workspace-relative path of the stored candidate for a document (one rule). */
export function candidateArtifactRelPath(documentId: string): string {
  return join('artifacts', 'foundry', 'protocol-candidates', `${safeFileName(documentId)}.json`);
}

/**
 * Read back the vendor-protocol candidate the extractor already persisted for a
 * document. The review surface renders the SAME steps the decision tree gates
 * on, so it must not re-extract them through another path (the AI extraction
 * candidate has different step ids). Returns null when no candidate was stored.
 */
export async function readCandidateArtifact(
  workspaceRoot: string,
  documentId: string,
): Promise<ProtocolCandidate | null> {
  const names = [safeFileName(documentId), legacySafeFileName(documentId)];
  for (const name of new Set(names)) {
    try {
      const raw = await readFile(resolve(workspaceRoot, 'artifacts/foundry/protocol-candidates', `${name}.json`), 'utf-8');
      const parsed = JSON.parse(raw) as ProtocolCandidate;
      if (parsed?.kind === 'vendor-protocol-candidate' && typeof parsed.source?.documentId === 'string' && safeFileName(parsed.source.documentId) === safeFileName(documentId)) return parsed;
    } catch { /* Try the legacy filename for existing artifacts. */ }
  }
  return null;
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

function artifactKey(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'vendor-protocol-candidate';
}

function legacySafeFileName(value: string): string {
  return artifactKey(value).slice(0, 100);
}

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

function safeFileName(value: string): string {
  const key = artifactKey(value);
  if (key.length <= 100) return key;
  return `${key.slice(0, 80)}-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// VPDF-3 — the RECORD side of the candidate (store upsert-by-documentId).
//
// The filesystem artifact above is the intake runner's read path; the record
// is the SAID the review surface joins on. Extraction remains the SOLE writer
// of vendor-protocol-candidate records (rung-vocabulary VENDOR mints_on): the
// mint goes through store.create with validation ON — POST /records cannot
// mint this kind (the handler's FAIR stamping collides with the closed
// schema; recorded finding in Wave2SemanticPassE2E). Re-extract UPDATES the
// existing record in place (Brad 2026-10-20 ruling; the append-only wall
// dropped this kind through its DATA list, OQ-1).
// ---------------------------------------------------------------------------

export const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';

/**
 * Deterministic candidate record id: sha256 over the documentId — one candidate
 * per document BY CONSTRUCTION. Never Date.now(): a retry must not accumulate.
 * Matches the semantic-draft route's `^CAN-[A-Za-z0-9_-]+$` gate.
 */
export function candidateRecordIdForDocument(documentId: string): string {
  return `CAN-vendorpdf-${createHash('sha256').update(documentId).digest('hex').slice(0, 16)}`;
}

/** Structural mirror of the stream handler's merged AI chunk summary (the
 *  adapter's input; kept here so the service owns the candidate shape). */
export type AiChunkDiagnosticEntry =
  | { code?: string; severity?: string; message?: string }
  | string
  | number
  | boolean
  | null;

/** Raw model shape for a step's notes: the real model emits a bare string
 *  (or null) where the schema requires an array of strings. */
export type AiChunkStepNotes = string[] | string | null;

export interface AiChunkCandidateSummary {
  kind?: string;
  title?: string;
  scope?: string;
  materials?: Array<{ label: string; role?: string; confidence?: number }>;
  labware?: Array<{ label: string; role?: string }>;
  equipment?: Array<{ label: string }>;
  steps?: Array<{
    stepNumber?: number;
    text: string;
    materials?: string[];
    labware?: string[];
    equipment?: string[];
    notes?: AiChunkStepNotes;
    confidence?: number;
  }>;
  diagnostics?: AiChunkDiagnosticEntry[];
}

export interface CandidateRecordSourceMeta {
  documentId: string;
  filename: string;
  pageCount: number;
  vendor?: string;
  /** Title fallback: the VPDF record's own title, never 'Untitled Protocol'. */
  fallbackTitle: string;
}

/** Declared honesty marker (OQ-2): AI chunk extraction anchors facts at the
 *  document level; pageStart:1 is a conservative floor, not an observed page. */
export const AI_CHUNK_ANCHORS_APPROXIMATE = 'AI_CHUNK_ANCHORS_APPROXIMATE';

function clampConfidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/**
 * VPDF-3 fix2 (live-lap finding): the real model emits a step's `notes` as a
 * BARE STRING where the schema requires an array of strings (Ajv2020:
 * /steps/N notes "must be array" for every real step). Same adapter seam as
 * normalizeDiagnosticEntry: a non-empty string becomes a one-element array
 * with the model's text verbatim; empty/null/missing becomes [] (no fabricated
 * content); a real array passes through.
 */
function normalizeStepNotes(notes: AiChunkStepNotes | undefined): string[] {
  if (Array.isArray(notes)) return notes.filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  if (typeof notes === 'string') return notes.trim() ? [notes] : [];
  return [];
}

/** Shape-filler constant (NOT domain policy): the code the adapter gives a
 *  diagnostic the model emitted without one. */
const MODEL_DIAGNOSTIC_CODE = 'MODEL_DIAGNOSTIC';

/**
 * VPDF-3 fix2: the real inference model emits top-level `diagnostics` as an
 * array of BARE STRINGS (live defect: chunk parsed cleanly, persist died with
 * /diagnostics/N "must be object" under Ajv2020 vs the schema's object-item
 * contract). mergeChunkResults copies them verbatim, so the adapter — which
 * owns candidate-shape normalization — normalizes every entry into a
 * schema-legal {severity, code, message} object. No schema loosening, no
 * kind-branching. Honesty rule: fillers describe the SHAPE failure only;
 * protocol truth is never fabricated, and the model's own strings survive
 * verbatim as message.
 */
function normalizeDiagnosticEntry(
  entry: AiChunkDiagnosticEntry,
): { severity: 'info' | 'warning' | 'error'; code: string; message: string } | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') {
    return entry.trim()
      ? { severity: 'warning', code: MODEL_DIAGNOSTIC_CODE, message: entry }
      : null;
  }
  if (typeof entry === 'number' || typeof entry === 'boolean') {
    return { severity: 'warning', code: MODEL_DIAGNOSTIC_CODE, message: String(entry) };
  }
  if (typeof entry !== 'object' || Array.isArray(entry)) {
    return { severity: 'warning', code: MODEL_DIAGNOSTIC_CODE, message: 'Model diagnostic (malformed)' };
  }
  const raw = entry as Record<string, unknown>;
  const severity = raw.severity === 'error' || raw.severity === 'warning' || raw.severity === 'info'
    ? raw.severity
    : 'warning';
  const code = typeof raw.code === 'string' && raw.code.trim() ? raw.code : MODEL_DIAGNOSTIC_CODE;
  const message = typeof raw.message === 'string' && raw.message.trim()
    ? raw.message
    : (code !== MODEL_DIAGNOSTIC_CODE ? `Model diagnostic (${code})` : 'Model diagnostic (malformed)');
  // Well-formed entries pass through as-is — extra properties the schema
  // allows (additionalProperties: true, e.g. details) are preserved.
  if (
    raw.severity === severity &&
    raw.code === code &&
    raw.message === message
  ) {
    return entry as { severity: 'info' | 'warning' | 'error'; code: string; message: string };
  }
  return { ...raw, severity, code, message };
}

/**
 * Pure adapter: AI chunk summary → schema-legal vendor-protocol-candidate
 * payload (vendor-protocol-candidate.schema.yaml, additionalProperties:false,
 * steps minItems 1). The schema is NOT loosened for the adapter.
 *
 * OQ-2 (adopted): every fact carries the document-level anchor the VENDOR
 * rung's lineage requires (provenance.documentId = the real VPDF documentId)
 * plus pageStart:1 as a DECLARED conservative floor — the chunk stream merges
 * per-chunk JSON with no per-page offsets, so no page is ever fabricated
 * beyond that floor. The floor is announced by the AI_CHUNK_ANCHORS_APPROXIMATE
 * diagnostic, which SaidFactsPane renders honestly.
 */
export function adaptAiChunkCandidateToRecordPayload(
  summary: AiChunkCandidateSummary,
  meta: CandidateRecordSourceMeta,
): Record<string, unknown> {
  const provenance = { documentId: meta.documentId, pageStart: 1 };
  const steps = (summary.steps ?? []).map((step, i) => {
    const stepNumber = typeof step.stepNumber === 'number' && step.stepNumber >= 1 ? step.stepNumber : i + 1;
    const sourceText = step.text ?? '';
    return {
      id: `step-${stepNumber}`,
      stepNumber,
      sourceText,
      actions: [{ actionKind: 'other' as const, sourceText, provenance: { ...provenance } }],
      conditions: {},
      materials: step.materials ?? [],
      labware: step.labware ?? [],
      equipment: step.equipment ?? [],
      notes: normalizeStepNotes(step.notes),
      branches: [],
      provenance: { ...provenance },
      confidence: clampConfidence(step.confidence),
    };
  });
  const extractedItems = (
    items: Array<{ label: string; role?: string; confidence?: number }> | undefined,
    prefix: string,
  ) => (items ?? []).map((item, i) => ({
    id: `${prefix}-${i + 1}`,
    label: item.label,
    // The model's label IS the extracted text for a chunk candidate.
    sourceText: item.label,
    provenance: { ...provenance },
    confidence: clampConfidence(item.confidence),
    ...(item.role ? { role: item.role } : {}),
  }));
  return {
    kind: 'vendor-protocol-candidate',
    source: {
      documentId: meta.documentId,
      filename: meta.filename,
      ...(meta.vendor ? { vendor: meta.vendor } : {}),
      pageCount: meta.pageCount,
    },
    title: summary.title?.trim() || meta.fallbackTitle,
    ...(summary.scope?.trim() ? { scope: summary.scope } : {}),
    sections: [],
    materials: extractedItems(summary.materials, 'mat'),
    equipment: extractedItems(summary.equipment, 'eq'),
    labware: extractedItems(summary.labware, 'lw'),
    steps,
    tables: [],
    notes: [],
    outputs: [],
    diagnostics: [
      ...(summary.diagnostics ?? [])
        .map(normalizeDiagnosticEntry)
        .filter((d): d is { severity: 'info' | 'warning' | 'error'; code: string; message: string } => d !== null),
      {
        severity: 'warning' as const,
        code: AI_CHUNK_ANCHORS_APPROXIMATE,
        message: 'Page anchors are document-level under AI chunk extraction: provenance.pageStart is a conservative floor (1), not an observed page.',
      },
    ],
  };
}

async function findCandidateRecordForDocument(
  store: RecordStore,
  documentId: string,
): Promise<{ recordId: string; schemaId: string } | null> {
  const candidates = await store.list({ kind: 'vendor-protocol-candidate' });
  for (const env of candidates) {
    const payload = env.payload as Record<string, unknown> | undefined;
    const source = payload?.source as Record<string, unknown> | undefined;
    if (source?.documentId === documentId) return { recordId: env.recordId, schemaId: env.schemaId };
  }
  return null;
}

export interface UpsertCandidateRecordInput {
  store: RecordStore;
  documentId: string;
  summary: AiChunkCandidateSummary;
  sourceMeta: CandidateRecordSourceMeta;
  message: string;
}

export type UpsertCandidateRecordResult =
  | { ok: true; recordId: string; updatedExisting: boolean }
  | { ok: false; error: string };

/**
 * Upsert-by-documentId (built new — VendorProtocolCandidateService had no
 * store persist to reuse, Recon §d). None → store.create the deterministic
 * CAN-vendorpdf-<hash> id; existing → store.update the SAME recordId with the
 * new payload. Validation/lint stay ON (skipValidation is banned in this leg:
 * a candidate that fails validation must fail honestly).
 */
export async function upsertVendorProtocolCandidateRecord(
  input: UpsertCandidateRecordInput,
): Promise<UpsertCandidateRecordResult> {
  const payload = adaptAiChunkCandidateToRecordPayload(input.summary, input.sourceMeta);
  const existing = await findCandidateRecordForDocument(input.store, input.documentId);
  if (existing) {
    const result = await input.store.update({
      envelope: { recordId: existing.recordId, schemaId: existing.schemaId, payload },
      message: input.message,
    });
    if (!result.success) return { ok: false, error: result.error ?? 'candidate update failed' };
    return { ok: true, recordId: existing.recordId, updatedExisting: true };
  }
  const recordId = candidateRecordIdForDocument(input.documentId);
  const result = await input.store.create({
    envelope: { recordId, schemaId: VPC_SCHEMA_ID, payload },
    message: input.message,
  });
  if (!result.success) {
    // Concurrent first-mint race: two extracts both missed the list and both
    // reached store.create for the SAME deterministic id; the loser gets
    // 'Record already exists'. That is not a persist failure — the winner's
    // record IS the candidate for this document. Re-list and update the
    // winner in place (updatedExisting: true, so the supersede/staleness leg
    // fires honestly). Deterministic id and the sole-writer contract are kept.
    if (/already exists/i.test(result.error ?? '')) {
      const winner = await findCandidateRecordForDocument(input.store, input.documentId);
      if (winner) {
        const retry = await input.store.update({
          envelope: { recordId: winner.recordId, schemaId: winner.schemaId, payload },
          message: input.message,
        });
        if (!retry.success) return { ok: false, error: retry.error ?? 'candidate update failed' };
        return { ok: true, recordId: winner.recordId, updatedExisting: true };
      }
    }
    return { ok: false, error: result.error ?? 'candidate create failed' };
  }
  return { ok: true, recordId, updatedExisting: false };
}

/** The ONE staleness mechanism (D2): a data flag written at re-extract time.
 *  The UI only READS it — no recomputation, no timestamps to disagree. */
export const CANDIDATE_SUPERSEDED_BY_REEXTRACT = 'CANDIDATE_SUPERSEDED_BY_REEXTRACT';

/**
 * Flag every non-promoted extraction-draft joined to this document that its
 * candidate was superseded by a re-extract. Dedupe by code: two re-extracts
 * against one XDR yield ONE diagnostic, never accumulated copies.
 *
 * Honesty note (spec D2): this is a service-level store.update, so it does
 * NOT capture a record-revision — revisionOnEditKinds fires in the API handler
 * layer. That is acceptable for an append-only diagnostic; no second revision
 * path is invented.
 */
export async function flagDraftsSupersededByReextract(
  store: RecordStore,
  documentId: string,
  candidateRecordId: string,
  supersededAt: string,
): Promise<number> {
  const drafts = await store.list({ kind: 'extraction-draft' });
  let flagged = 0;
  for (const env of drafts) {
    const payload = env.payload as Record<string, unknown> | undefined;
    if (!payload || payload.kind !== 'extraction-draft') continue;
    if (payload.status === 'promoted') continue;
    const source = payload.source_artifact as Record<string, unknown> | undefined;
    if (!source || source.id !== documentId) continue;
    const diagnostics = Array.isArray(payload.diagnostics)
      ? (payload.diagnostics as Array<Record<string, unknown>>)
      : [];
    if (diagnostics.some((d) => d?.code === CANDIDATE_SUPERSEDED_BY_REEXTRACT)) continue;
    const nextPayload = {
      ...payload,
      diagnostics: [
        ...diagnostics,
        {
          severity: 'warning' as const,
          code: CANDIDATE_SUPERSEDED_BY_REEXTRACT,
          message: 'The candidate this draft was built from was re-extracted — re-run the semantic pass to refresh it.',
          details: { candidateRecordId, supersededAt },
        },
      ],
    };
    const result = await store.update({
      envelope: { recordId: env.recordId, schemaId: env.schemaId, payload: nextPayload },
      message: `VPDF-3: candidate ${candidateRecordId} re-extracted — flagged draft ${env.recordId} as built from a superseded candidate`,
    });
    if (result.success) flagged++;
  }
  return flagged;
}
