import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RecordStore } from '../store/types.js';
import { createEnvelope } from '../types/RecordEnvelope.js';
import { parseConcentration, type Concentration } from '../materials/concentration.js';
import { extractVendorFormulationHtml } from '../ingestion/adapters/vendorFormulationHtml.js';
import type { ProtocolIdeDocumentResult, ProtocolIdeVendorId } from './protocolIdeVendors.js';
import { PROTOCOL_IDE_VENDORS, isCuratedVendor } from './protocolIdeVendors.js';

const execFileAsync = promisify(execFile);
const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';
const CONCENTRATION_PATTERN = /(\d+(?:\.\d+)?)\s*(µM|uM|mM|nM|pM|fM|M|mg\s*\/\s*mL|ug\s*\/\s*mL|ng\s*\/\s*mL|g\s*\/\s*L|U\s*\/\s*mL|U\s*\/\s*uL|cells\s*\/\s*mL|cells\s*\/\s*uL|%\s*v\s*\/\s*v|%\s*w\s*\/\s*v)\b/i;

type DraftRole = 'solute' | 'solvent' | 'buffer_component' | 'additive' | 'activity_source' | 'cells' | 'other';
type ExtractionMethod = 'plain_text' | 'pdf_text' | 'ocr' | 'html_section_parser' | 'unsupported' | 'failed';
type DocumentKind = 'product_sheet' | 'formulation_sheet' | 'certificate_of_analysis' | 'safety_data_sheet' | 'label' | 'other';

export type VendorDocumentUpload = {
  fileName: string;
  mediaType: string;
  contentBase64?: string;
  sourceUrl?: string;
  title?: string;
  documentKind?: DocumentKind;
  note?: string;
};

type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type CompositionDraftItem = {
  component_name: string;
  role: DraftRole;
  concentration?: Concentration;
  confidence: number;
  source_page: number;
  source_text: string;
};

export type VendorDocumentExtractionResult = {
  document: Record<string, unknown>;
  draft?: Record<string, unknown>;
  drafts?: Record<string, unknown>[];
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function canonicalUnit(unit: string): string {
  const trimmed = unit.replace(/\s+/g, '').replace('µ', 'u').toLowerCase();
  switch (trimmed) {
    case 'm': return 'M';
    case 'mm': return 'mM';
    case 'um': return 'uM';
    case 'nm': return 'nM';
    case 'pm': return 'pM';
    case 'fm': return 'fM';
    case 'mg/ml': return 'mg/mL';
    case 'ug/ml': return 'ug/mL';
    case 'ng/ml': return 'ng/mL';
    case 'g/l': return 'g/L';
    case 'u/ml': return 'U/mL';
    case 'u/ul': return 'U/uL';
    case 'cells/ml': return 'cells/mL';
    case 'cells/ul': return 'cells/uL';
    case '%v/v': return '% v/v';
    case '%w/v': return '% w/v';
    default: return unit.trim();
  }
}

function parseConcentrationText(text: string): Concentration | undefined {
  const match = text.match(CONCENTRATION_PATTERN);
  if (!match) return undefined;
  return parseConcentration({
    value: Number(match[1]),
    unit: canonicalUnit(match[2] || ''),
  });
}

function inferDraftRole(name: string): DraftRole {
  const normalized = name.toLowerCase();
  if (/(water|dmso|ethanol|methanol|saline|vehicle)$/.test(normalized)) return 'solvent';
  if (/(buffer|pbs|hbss|tris|hepes|bicarbonate)/.test(normalized)) return 'buffer_component';
  if (/(serum|albumin|insulin|antibiotic|supplement)/.test(normalized)) return 'additive';
  if (/(cell|cells)\b/.test(normalized)) return 'cells';
  return 'solute';
}

function cleanComponentName(line: string, concentration: Concentration): string {
  return line
    .replace(CONCENTRATION_PATTERN, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:;,.|]+/, '')
    .replace(/[\s\-–—:;,.|]+$/, '')
    .replace(/\b(concentration|contains|with|page \d+)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim() || `${concentration.value} ${concentration.unit}`;
}

function confidenceForLine(line: string, componentName: string): number {
  let score = 0.6;
  if (line.includes('\t') || /\s{2,}/.test(line)) score += 0.1;
  if (componentName.length >= 4 && componentName.length <= 80) score += 0.1;
  if (/^[A-Za-z0-9]/.test(componentName)) score += 0.05;
  if (!/^\d+$/.test(componentName)) score += 0.05;
  return Math.min(0.95, Number(score.toFixed(2)));
}

function buildDraftItems(pages: ExtractedPage[]): CompositionDraftItem[] {
  const items: CompositionDraftItem[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const concentration = parseConcentrationText(line);
      if (!concentration) continue;
      const componentName = cleanComponentName(line, concentration);
      if (!componentName || componentName.length < 2 || componentName.length > 120) continue;
      const dedupeKey = `${componentName.toLowerCase()}::${concentration.value}::${concentration.unit}::${page.pageNumber}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push({
        component_name: componentName,
        role: inferDraftRole(componentName),
        concentration,
        confidence: confidenceForLine(line, componentName),
        source_page: page.pageNumber,
        source_text: line,
      });
    }
  }
  return items.slice(0, 50);
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function extractPdfPages(tempFile: string): Promise<{ pages: ExtractedPage[]; method: ExtractionMethod; ocrAttempted: boolean; ocrAvailable: boolean }> {
  const pdfInfoStdout = await execFileAsync('pdfinfo', [tempFile]).then((result) => result.stdout).catch(() => '');
  const pageCountMatch = pdfInfoStdout.match(/^Pages:\s+(\d+)/m);
  const pageCount = pageCountMatch ? Number(pageCountMatch[1]) : 1;
  const pages: ExtractedPage[] = [];
  for (let page = 1; page <= Math.max(1, pageCount); page += 1) {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', '-f', String(page), '-l', String(page), tempFile, '-']);
    pages.push({ pageNumber: page, text: stdout || '' });
  }
  const mergedTextLength = pages.reduce((sum, page) => sum + page.text.trim().length, 0);
  if (mergedTextLength > 40) {
    return { pages, method: 'pdf_text', ocrAttempted: false, ocrAvailable: await commandAvailable('tesseract') };
  }
  const tesseractAvailable = await commandAvailable('tesseract');
  const pdftoppmAvailable = await commandAvailable('pdftoppm');
  if (!tesseractAvailable || !pdftoppmAvailable) {
    return { pages, method: 'pdf_text', ocrAttempted: false, ocrAvailable: tesseractAvailable };
  }
  const tempDir = await mkdtemp(join(tmpdir(), 'vendor-doc-ocr-'));
  try {
    const prefix = join(tempDir, 'page');
    await execFileAsync('pdftoppm', ['-png', tempFile, prefix]);
    const imagePages: ExtractedPage[] = [];
    for (let page = 1; page <= Math.max(1, pageCount); page += 1) {
      const fileName = `${prefix}-${page}.png`;
      const { stdout } = await execFileAsync('tesseract', [fileName, 'stdout']);
      imagePages.push({ pageNumber: page, text: stdout || '' });
    }
    return { pages: imagePages, method: 'ocr', ocrAttempted: true, ocrAvailable: true };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractTextPages(upload: VendorDocumentUpload): Promise<{ pages: ExtractedPage[]; method: ExtractionMethod; ocrAttempted: boolean; ocrAvailable: boolean }> {
  const buffer = upload.contentBase64 ? Buffer.from(upload.contentBase64, 'base64') : null;
  const mediaType = upload.mediaType.toLowerCase();
  const extension = extname(upload.fileName).toLowerCase();
  if (!buffer) {
    return { pages: [], method: 'unsupported', ocrAttempted: false, ocrAvailable: await commandAvailable('tesseract') };
  }
  if (mediaType.startsWith('text/') || ['.txt', '.csv', '.tsv', '.md'].includes(extension)) {
    return {
      pages: [{ pageNumber: 1, text: buffer.toString('utf8') }],
      method: 'plain_text',
      ocrAttempted: false,
      ocrAvailable: await commandAvailable('tesseract'),
    };
  }
  if (mediaType === 'application/pdf' || extension === '.pdf') {
    const tempDir = await mkdtemp(join(tmpdir(), 'vendor-doc-pdf-'));
    const tempFile = join(tempDir, upload.fileName || 'document.pdf');
    try {
      await writeFile(tempFile, buffer);
      return await extractPdfPages(tempFile);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
  if (mediaType.startsWith('image/')) {
    const tesseractAvailable = await commandAvailable('tesseract');
    if (!tesseractAvailable) {
      return { pages: [], method: 'unsupported', ocrAttempted: false, ocrAvailable: false };
    }
    const tempDir = await mkdtemp(join(tmpdir(), 'vendor-doc-img-'));
    const tempFile = join(tempDir, upload.fileName || 'image');
    try {
      await writeFile(tempFile, buffer);
      const { stdout } = await execFileAsync('tesseract', [tempFile, 'stdout']);
      return { pages: [{ pageNumber: 1, text: stdout || '' }], method: 'ocr', ocrAttempted: true, ocrAvailable: true };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
  return { pages: [], method: 'unsupported', ocrAttempted: false, ocrAvailable: await commandAvailable('tesseract') };
}

function documentId(fileName: string): string {
  return `VDOC-${Date.now().toString(36).toUpperCase()}-${createHash('sha1').update(fileName).digest('hex').slice(0, 6).toUpperCase()}`;
}

function draftId(documentRefId: string): string {
  return `VDRAFT-${documentRefId}`;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function excerpt(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, 500);
}

function isHtmlUpload(upload: VendorDocumentUpload): boolean {
  const mediaType = upload.mediaType.toLowerCase();
  const extension = extname(upload.fileName).toLowerCase();
  return mediaType.includes('text/html')
    || mediaType.includes('application/xhtml+xml')
    || extension === '.html'
    || extension === '.htm';
}

function buildHtmlCompositionDrafts(args: {
  documentRefId: string;
  now: string;
  extraction: Awaited<ReturnType<typeof extractVendorFormulationHtml>>;
}): Record<string, unknown>[] {
  return args.extraction.variants
    .filter((variant) => variant.ingredients.length > 0)
    .map((variant, index) => {
      const items = variant.ingredients.map((ingredient) => ({
        component_name: ingredient.componentName,
        role: ingredient.role,
        ...(ingredient.concentration ? { concentration: ingredient.concentration } : {}),
        confidence: ingredient.concentration ? 0.95 : 0.75,
        source_page: 1,
        source_text: `${ingredient.componentName} ${ingredient.amountText}`.trim(),
      }));
      const overallConfidence = Number((items.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / items.length).toFixed(2));
      return {
        id: `${draftId(args.documentRefId)}-${index + 1}`,
        source_document_id: args.documentRefId,
        extraction_method: 'html_section_parser',
        status: 'draft',
        overall_confidence: overallConfidence,
        created_at: args.now,
        notes: `Variant: ${variant.label}. Parsed from HTML section "${variant.sourceSection}".`,
        extracted_text_excerpt: excerpt(
          variant.ingredients
            .slice(0, 8)
            .map((ingredient) => `${ingredient.componentName} ${ingredient.amountText}`.trim())
            .join('; ')
        ),
        items,
      };
    });
}

export async function buildVendorDocumentExtraction(upload: VendorDocumentUpload): Promise<VendorDocumentExtractionResult> {
  const now = new Date().toISOString();
  const buffer = upload.contentBase64 ? Buffer.from(upload.contentBase64, 'base64') : null;
  const documentRefId = documentId(upload.fileName);
  const sourceUrl = stringValue(upload.sourceUrl);
  if (isHtmlUpload(upload) && (buffer || sourceUrl)) {
    const extraction = await extractVendorFormulationHtml({
      ...(buffer ? { contentBase64: upload.contentBase64 } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    });
    const drafts = buildHtmlCompositionDrafts({ documentRefId, now, extraction });
    const draft = drafts[0];
    const documentRecord: Record<string, unknown> = {
      id: documentRefId,
      ...(stringValue(upload.title) ? { title: stringValue(upload.title) } : { title: extraction.title }),
      document_kind: upload.documentKind ?? 'formulation_sheet',
      file_ref: {
        file_name: upload.fileName,
        media_type: upload.mediaType,
        ...(stringValue(upload.sourceUrl) ? { source_url: stringValue(upload.sourceUrl) } : {}),
        ...(buffer ? { size_bytes: buffer.byteLength, sha256: sha256(buffer) } : {}),
        page_count: 1,
      },
      provenance: {
        source_type: stringValue(upload.sourceUrl) ? 'vendor_page' : buffer ? 'upload' : 'manual',
        added_at: now,
        ...(stringValue(upload.note) ? { note: stringValue(upload.note) } : {}),
      },
      extraction: {
        method: 'html_section_parser',
        extracted_at: now,
        page_count: 1,
        ocr_attempted: false,
        ocr_available: false,
        text_excerpt: excerpt(extraction.htmlExcerpt),
      },
    };
    return {
      document: documentRecord,
      ...(draft ? { draft } : {}),
      ...(drafts.length > 0 ? { drafts } : {}),
    };
  }
  const extraction = await extractTextPages(upload);
  const combinedText = extraction.pages.map((page) => page.text).join('\n\n');
  const items = buildDraftItems(extraction.pages);
  const documentRecord: Record<string, unknown> = {
    id: documentRefId,
    ...(stringValue(upload.title) ? { title: stringValue(upload.title) } : {}),
    document_kind: upload.documentKind ?? 'other',
    file_ref: {
      file_name: upload.fileName,
      media_type: upload.mediaType,
      ...(stringValue(upload.sourceUrl) ? { source_url: stringValue(upload.sourceUrl) } : {}),
      ...(buffer ? { size_bytes: buffer.byteLength, sha256: sha256(buffer) } : {}),
      ...(extraction.pages.length > 0 ? { page_count: extraction.pages.length } : {}),
    },
    provenance: {
      source_type: buffer ? 'upload' : stringValue(upload.sourceUrl) ? 'url' : 'manual',
      added_at: now,
      ...(stringValue(upload.note) ? { note: stringValue(upload.note) } : {}),
    },
    extraction: {
      method: extraction.method,
      extracted_at: now,
      ...(extraction.pages.length > 0 ? { page_count: extraction.pages.length } : {}),
      ocr_attempted: extraction.ocrAttempted,
      ocr_available: extraction.ocrAvailable,
      ...(combinedText.trim() ? { text_excerpt: excerpt(combinedText) } : {}),
    },
  };
  const draft = items.length > 0 && (extraction.method === 'plain_text' || extraction.method === 'pdf_text' || extraction.method === 'ocr')
    ? {
        id: draftId(documentRefId),
        source_document_id: documentRefId,
        extraction_method: extraction.method,
        status: 'draft',
        overall_confidence: Number((items.reduce((sum, item) => sum + item.confidence, 0) / items.length).toFixed(2)),
        created_at: now,
        extracted_text_excerpt: excerpt(combinedText),
        items: items.map((item) => ({
          component_name: item.component_name,
          role: item.role,
          ...(item.concentration ? { concentration: item.concentration } : {}),
          confidence: item.confidence,
          source_page: item.source_page,
          source_text: item.source_text,
        })),
      }
    : undefined;
  return {
    document: documentRecord,
    ...(draft ? { draft } : {}),
  };
}

export async function attachVendorDocumentExtraction(
  store: RecordStore,
  vendorProductId: string,
  upload: VendorDocumentUpload,
): Promise<VendorDocumentExtractionResult> {
  const existing = await store.get(vendorProductId);
  const payload = existing?.payload && typeof existing.payload === 'object' ? existing.payload as Record<string, unknown> : null;
  if (!existing || !payload || payload.kind !== 'vendor-product') {
    throw new Error(`Vendor product not found: ${vendorProductId}`);
  }
  const extraction = await buildVendorDocumentExtraction(upload);
  const { $schema: _schema, recordId: _recordId, ...persistedPayload } = payload as Record<string, unknown> & {
    $schema?: unknown;
    recordId?: unknown;
  };
  const nextPayload: Record<string, unknown> = {
    ...persistedPayload,
    documents: [
      ...(Array.isArray(payload.documents) ? payload.documents : []),
      extraction.document,
    ],
    ...(extraction.draft
      ? {
          composition_drafts: [
            ...(Array.isArray(payload.composition_drafts) ? payload.composition_drafts : []),
            ...(Array.isArray(extraction.drafts) && extraction.drafts.length > 0
              ? extraction.drafts
              : [extraction.draft]),
          ],
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  const envelope = createEnvelope(
    nextPayload,
    existing.schemaId || SCHEMA_ID,
    {
      ...(existing.meta?.createdAt ? { createdAt: existing.meta.createdAt } : {}),
      updatedAt: nextPayload.updatedAt as string,
    },
  );
  if (!envelope) {
    throw new Error(`Failed to prepare updated vendor product envelope: ${vendorProductId}`);
  }
  const result = await store.update({
    envelope: {
      ...envelope,
      ...(existing.meta ? { meta: existing.meta } : {}),
    },
    message: `Attach vendor document ${String((extraction.document as Record<string, unknown>).id)} to ${vendorProductId}`,
  });
  if (!result.success) {
    const validationDetails = result.validation?.errors ? JSON.stringify(result.validation.errors) : undefined;
    const lintDetails = result.lint?.violations?.map((issue) => issue.message).join('; ');
    throw new Error(validationDetails || lintDetails || result.error || `Failed to update vendor product ${vendorProductId}`);
  }
  return extraction;
}

// ---------------------------------------------------------------------------
// Document-oriented search result shaping for Protocol IDE
// ---------------------------------------------------------------------------

/**
 * Shape a vendor search result item into a Protocol IDE document result.
 * Only curated vendors are accepted; non-curated vendors are silently dropped.
 */
export function shapeDocumentResult(
  vendor: string,
  name: string,
  productUrl?: string,
  description?: string,
): ProtocolIdeDocumentResult | null {
  if (!isCuratedVendor(vendor)) {
    return null;
  }

  const snippet = description ? excerpt(description) : undefined;
  const documentType = inferDocumentType(name, description);

  return {
    vendor,
    title: name,
    pdfUrl: productUrl,
    landingUrl: productUrl ?? '',
    snippet,
    documentType,
    sessionIdHint: `${vendor}::${name}`,
  };
}

/**
 * Infer a document type from the title and description text.
 */
function inferDocumentType(title: string, description?: string): ProtocolIdeDocumentResult['documentType'] {
  const combined = `${title} ${description ?? ''}`.toLowerCase();
  if (/application note|app note|application_note/i.test(combined)) return 'application_note';
  if (/white paper|whitepaper|white_paper/i.test(combined)) return 'white_paper';
  if (/protocol|extraction|assay|workflow|procedure/i.test(combined)) return 'protocol';
  if (/manual|guide|how-to|howto|instruction/i.test(combined)) return 'manual';
  return 'other';
}

/**
 * Filter vendor search results to only include curated vendors and shape
 * them into Protocol IDE document results.
 */
export function filterAndShapeDocumentResults(
  vendor: string,
  name: string,
  productUrl?: string,
  description?: string,
): ProtocolIdeDocumentResult | null {
  return shapeDocumentResult(vendor, name, productUrl, description);
}

/**
 * Return the curated vendor list for Protocol IDE discovery.
 */
export function getCuratedProtocolIdeVendors(): readonly ProtocolIdeVendorId[] {
  return PROTOCOL_IDE_VENDORS;
}
