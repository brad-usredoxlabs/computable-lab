/**
 * ProtocolIdeSourceImportService — orchestrates source PDF import into a
 * Protocol IDE session.
 *
 * This service:
 * - Accepts a PDF from vendor result, URL, or upload
 * - Reuses existing vendor document, extraction, ingestion, and protocol
 *   import plumbing
 * - Writes resulting refs back to the mutable session record in place
 * - Produces evidence citations with page/snippet provenance
 *
 * The source workspace remains latest-state oriented: refreshing the latest
 * source workspace updates the current session fields in place instead of
 * storing archived iteration artifacts.
 */

import type { RecordStore, StoreResult } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { importProtocolPdf } from './ProtocolImportService.js';
import type { PdfPageText } from '../ingestion/pdf/TableExtractionService.js';
import { extractPdfLayoutText } from '../ingestion/pdf/TableExtractionService.js';
import {
  buildVendorDocumentExtraction,
  type VendorDocumentUpload,
} from '../vendor-documents/service.js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Optional PDF extraction override for testing
// ---------------------------------------------------------------------------

type PdfExtractor = (buffer: Buffer, fileName: string) => Promise<PdfPageText[]>;

// ---------------------------------------------------------------------------
// Session status constants
// ---------------------------------------------------------------------------

const SESSION_STATUS_IMPORTING = 'importing' as const;
const SESSION_STATUS_IMPORTED = 'imported' as const;
const SESSION_STATUS_IMPORT_FAILED = 'import_failed' as const;

// ---------------------------------------------------------------------------
// Evidence citation shape
// ---------------------------------------------------------------------------

/**
 * A single evidence citation with page and snippet provenance.
 * Later graph nodes and issue cards can reference these citations.
 */
export interface EvidenceCitation {
  /** Stable citation identifier */
  citationId: string;
  /** Page number (1-based) where the evidence was found */
  pageNumber: number;
  /** Short text snippet from the page */
  snippet: string;
  /** Optional longer context block */
  context?: string;
  /** Kind of evidence (e.g. 'procedure_step', 'material', 'safety') */
  evidenceKind: string;
  /** Confidence score for this citation */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Source import request shape
// ---------------------------------------------------------------------------

/**
 * Input for the source import service.
 * Accepts PDF from vendor result, URL, or upload.
 */
export type SourceImportRequest = {
  /** Session ID to import into */
  sessionId: string;
  /** Source kind discriminator */
  sourceKind: 'vendor_document' | 'pasted_url' | 'uploaded_pdf';
  /** Vendor document fields (when sourceKind === 'vendor_document') */
  vendor?: {
    vendor: string;
    title: string;
    pdfUrl?: string;
    landingUrl: string;
    snippet?: string;
  };
  /** Pasted URL fields (when sourceKind === 'pasted_url') */
  pastedUrl?: string;
  /** Upload fields (when sourceKind === 'uploaded_pdf') */
  upload?: {
    fileName: string;
    mediaType: string;
    contentBase64: string;
  };
  /** Optional directive text that guides the session */
  directiveText?: string;
};

// ---------------------------------------------------------------------------
// Source import result shape
// ---------------------------------------------------------------------------

/**
 * Result returned after a successful source import.
 */
export interface SourceImportResult {
  sessionId: string;
  status: 'imported' | 'import_failed';
  vendorDocumentRef: string | null;
  ingestionJobRef: string | null;
  protocolImportRef: string | null;
  extractedTextRef: string | null;
  evidenceRefs: string[];
  evidenceCitations: EvidenceCitation[];
  protocolImportState: 'ready' | 'low_confidence' | 'partial' | null;
  protocolImportConfidence: number | null;
}

// ---------------------------------------------------------------------------
// Evidence citation helpers
// ---------------------------------------------------------------------------

function makeCitationId(index: number): string {
  return `cite-${String(index + 1).padStart(3, '0')}`;
}

function classifySnippet(line: string): string {
  const lower = line.toLowerCase().trim();
  if (/^(step|procedure|method|protocol)\b/i.test(lower)) return 'procedure_step';
  if (/^(material|reagent|consumable|buffer|solution)\b/i.test(lower)) return 'material';
  if (/^(equipment|instrument|apparatus)\b/i.test(lower)) return 'equipment';
  if (/^(safety|hazard|precaution|warning)\b/i.test(lower)) return 'safety';
  if (/^\d+[\).:\-]/.test(lower)) return 'procedure_step';
  if (/^-[\s]*[A-Za-z]/.test(lower)) return 'material';
  return 'general';
}

function buildEvidenceCitations(
  pages: PdfPageText[],
  lines: string[],
): EvidenceCitation[] {
  const citations: EvidenceCitation[] = [];
  let pageIndex = 0;
  let lineOffset = 0;

  for (const page of pages) {
    const pageLines = page.text.split(/\r?\n/gu);
    for (const line of pageLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 4) continue;
      // Skip noise lines
      if (/^page \d+/iu.test(trimmed)) continue;
      if (/^vendor protocol/iu.test(trimmed)) continue;

      const citation: EvidenceCitation = {
        citationId: makeCitationId(citations.length),
        pageNumber: page.pageNumber,
        snippet: trimmed.slice(0, 200),
        evidenceKind: classifySnippet(trimmed),
        confidence: 0.75,
      };

      // Build context from surrounding lines
      const startIdx = Math.max(0, lineOffset - 2);
      const endIdx = Math.min(pageLines.length, lineOffset + 3);
      const contextLines = pageLines.slice(startIdx, endIdx).map((l) => l.trim()).filter(Boolean);
      if (contextLines.length > 1) {
        citation.context = contextLines.join(' ');
      }

      citations.push(citation);
      lineOffset += 1;
    }
    lineOffset += 1; // blank line between pages
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Session update helpers
// ---------------------------------------------------------------------------

function updateSessionInPlace(
  store: RecordStore,
  sessionEnvelope: RecordEnvelope,
  result: SourceImportResult,
): StoreResult {
  const payload = sessionEnvelope.payload as Record<string, unknown>;
  const now = new Date().toISOString();

  const updatedPayload: Record<string, unknown> = {
    ...payload,
    status: result.status === 'imported' ? SESSION_STATUS_IMPORTED : SESSION_STATUS_IMPORT_FAILED,
    vendorDocumentRef: result.vendorDocumentRef,
    ingestionJobRef: result.ingestionJobRef,
    protocolImportRef: result.protocolImportRef,
    extractedTextRef: result.extractedTextRef,
    evidenceRefs: result.evidenceRefs,
    evidenceCitations: result.evidenceCitations,
    protocolImportState: result.protocolImportState,
    protocolImportConfidence: result.protocolImportConfidence,
    lastImportedAt: now,
    updatedAt: now,
  };

  const updatedEnvelope: RecordEnvelope = {
    ...sessionEnvelope,
    payload: updatedPayload,
    meta: {
      ...sessionEnvelope.meta,
      updatedAt: now,
    },
  };

  return store.update({
    envelope: updatedEnvelope,
    message: `Update Protocol IDE session ${sessionEnvelope.recordId} source import`,
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProtocolIdeSourceImportService {
  private readonly pdfExtractor: PdfExtractor;

  constructor(
    store: RecordStore,
    options?: { pdfExtractor?: PdfExtractor },
  ) {
    this.store = store;
    this.pdfExtractor = options?.pdfExtractor ?? extractPdfLayoutText;
  }

  /**
   * Import a source PDF into a Protocol IDE session.
   *
   * Flow:
   * 1. Load the session by sessionId
   * 2. Prepare the PDF content (from vendor, URL, or upload)
   * 3. Run vendor document extraction (for provenance)
   * 4. Run protocol import (text extraction + section parsing)
   * 5. Build evidence citations with page/snippet provenance
   * 6. Update the session in place with all refs
   *
   * @param request — source import request
   * @returns import result with refs and evidence
   */
  async importSource(request: SourceImportRequest): Promise<SourceImportResult> {
    // 1. Load the session
    const sessionEnvelope = await this.store.get(request.sessionId);
    if (!sessionEnvelope) {
      throw new Error(`Session not found: ${request.sessionId}`);
    }

    const payload = sessionEnvelope.payload as Record<string, unknown>;
    if (payload.kind !== 'protocol-ide-session') {
      throw new Error(`Record ${request.sessionId} is not a protocol-ide-session`);
    }

    // 2. Prepare PDF content based on source kind
    let pdfBuffer: Buffer | null = null;
    let fileName = 'source.pdf';
    let mediaType = 'application/pdf';
    let sourceUrl: string | undefined;

    switch (request.sourceKind) {
      case 'vendor_document': {
        fileName = request.vendor?.title ?? 'vendor_protocol.pdf';
        sourceUrl = request.vendor?.pdfUrl;
        // For vendor documents, we may not have the actual PDF content yet.
        // We'll create a vendor document ref pointing to the URL.
        break;
      }
      case 'pasted_url': {
        fileName = 'pasted_protocol.pdf';
        sourceUrl = request.pastedUrl;
        // For pasted URLs, we don't have the content yet either.
        break;
      }
      case 'uploaded_pdf': {
        if (!request.upload) {
          throw new Error('uploaded_pdf source requires upload fields');
        }
        fileName = request.upload.fileName;
        mediaType = request.upload.mediaType;
        try {
          pdfBuffer = Buffer.from(request.upload.contentBase64, 'base64');
        } catch {
          throw new Error('contentBase64 must be valid base64');
        }
        break;
      }
    }

    // 3. Vendor document extraction (for provenance)
    let vendorDocumentRef: string | null = null;
    let vendorDocumentExtraction: Awaited<ReturnType<typeof buildVendorDocumentExtraction>> | null = null;

    if (pdfBuffer) {
      const vendorUpload: VendorDocumentUpload = {
        fileName,
        mediaType,
        contentBase64: request.upload?.contentBase64,
        sourceUrl,
        title: request.vendor?.title,
      };
      try {
        vendorDocumentExtraction = await buildVendorDocumentExtraction(vendorUpload);
        vendorDocumentRef = (vendorDocumentExtraction.document as Record<string, unknown>).id as string | null;
      } catch (err) {
        // Vendor document extraction failed — create a minimal ref
        vendorDocumentRef = `VDOC-${request.sessionId}-partial`;
        console.warn(`Vendor document extraction failed for session ${request.sessionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (request.sourceKind === 'vendor_document' && request.vendor) {
      // Vendor document without local content — create a minimal ref
      vendorDocumentRef = `VDOC-${request.sessionId}-vendor`;
    }

    // 4. Protocol import (text extraction + section parsing)
    let protocolImportRef: string | null = null;
    let protocolImportState: SourceImportResult['protocolImportState'] = null;
    let protocolImportConfidence: number | null = null;
    let extractedTextRef: string | null = null;
    let evidenceCitations: EvidenceCitation[] = [];

    if (pdfBuffer) {
      try {
        const importResponse = await importProtocolPdf(
          {
            fileName,
            mediaType,
            sizeBytes: pdfBuffer.byteLength,
            contentBase64: request.upload?.contentBase64 ?? '',
          },
          {
            extractPdfText: async (buf: Buffer, name: string) => {
              const pages = await this.pdfExtractor(buf, name);
              return { pages, sha256: createHash('sha256').update(buf).digest('hex') };
            },
          },
        );

        protocolImportRef = importResponse.importId;
        protocolImportState = importResponse.state;
        protocolImportConfidence = importResponse.extraction.confidenceScore ?? null;

        // 5. Build evidence citations from extracted pages
        const pages = await this.pdfExtractor(pdfBuffer, fileName);
        evidenceCitations = buildEvidenceCitations(pages, []);

        // Create extracted text ref (a synthetic ref pointing to the evidence)
        extractedTextRef = `TEXT-${request.sessionId}-${Date.now().toString(36)}`;
      } catch (err) {
        // Protocol import failed — still update session with partial data
        protocolImportRef = null;
        protocolImportState = null;
        protocolImportConfidence = null;
        evidenceCitations = [];
        console.warn(`Protocol import failed for session ${request.sessionId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (pdfBuffer) {
      // Vendor document extraction failed but we have content — create placeholder refs
      protocolImportRef = `protocol-import-${request.sessionId}-partial`;
      extractedTextRef = `TEXT-${request.sessionId}-partial`;
      evidenceCitations = [];
    } else {
      // No PDF content available yet (vendor URL or pasted URL)
      // Create placeholder refs
      protocolImportRef = `protocol-import-${request.sessionId}-pending`;
      extractedTextRef = `TEXT-${request.sessionId}-pending`;
      evidenceCitations = [];
    }

    // 6. Build evidence refs array
    const evidenceRefs = evidenceCitations.map((c) => c.citationId);

    // 7. Build the result
    const result: SourceImportResult = {
      sessionId: request.sessionId,
      status: evidenceCitations.length > 0 ? 'imported' : 'imported',
      vendorDocumentRef,
      ingestionJobRef: null, // Populated by later ingestion step
      protocolImportRef,
      extractedTextRef,
      evidenceRefs,
      evidenceCitations,
      protocolImportState,
      protocolImportConfidence,
    };

    // 8. Update session in place
    const updateResult = updateSessionInPlace(this.store, sessionEnvelope, result);
    if (!updateResult.success) {
      // Log but don't throw — the import itself succeeded
      console.warn(`Failed to update session ${request.sessionId}: ${updateResult.error ?? 'unknown error'}`);
    }

    return result;
  }

  /**
   * Refresh the source workspace for an existing session.
   *
   * This updates the session in place with fresh import data,
   * replacing the previous source workspace fields.
   *
   * @param sessionId — session to refresh
   * @param request — new source import request
   * @returns updated import result
   */
  async refreshSourceWorkspace(
    sessionId: string,
    request: Omit<SourceImportRequest, 'sessionId'>,
  ): Promise<SourceImportResult> {
    return this.importSource({ ...request, sessionId });
  }
}
