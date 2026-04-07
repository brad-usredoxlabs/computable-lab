import { extractPdfLayoutText, type PdfPageText } from '../ingestion/pdf/TableExtractionService.js';

export interface ProtocolImportRequest {
  fileName: string;
  mediaType?: string;
  sizeBytes?: number;
  contentBase64: string;
}

export interface ProtocolImportSection {
  id: string;
  title: string;
  body: string;
  confidenceScore?: number;
}

export interface ProtocolImportStep {
  id: string;
  title: string;
  instruction: string;
  duration?: string;
  notes?: string;
  confidenceScore?: number;
}

export interface ProtocolImportDiagnostic {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  target?: { kind: 'document' | 'overview' | 'materials' | 'equipment' | 'section' | 'step'; id?: string };
}

export interface ProtocolImportResponse {
  success: true;
  importId: string;
  state: 'ready' | 'low_confidence' | 'partial';
  source: {
    fileName: string;
    mediaType: string;
    sizeBytes?: number;
  };
  extraction: {
    method: 'pdf_text' | 'ocr';
    statusSummary: string;
    pageCount?: number;
    confidenceScore?: number;
    missingSections: string[];
    reviewNotes: string[];
  };
  document: {
    title: string;
    objective?: string;
    overview?: string;
    policySummary?: string;
    sections: ProtocolImportSection[];
    materials: string[];
    equipment: string[];
    steps: ProtocolImportStep[];
  };
  diagnostics: ProtocolImportDiagnostic[];
}

interface ImportOptions {
  extractPdfText?: typeof extractPdfLayoutText;
}

type ParsedBuckets = {
  overview: string[];
  objective: string[];
  materials: string[];
  equipment: string[];
  safety: string[];
  procedure: string[];
  notes: string[];
};

const SECTION_ALIASES: Array<{ match: RegExp; bucket: keyof ParsedBuckets }> = [
  { match: /^(overview|summary|introduction)\b/i, bucket: 'overview' },
  { match: /^(objective|purpose|goal)\b/i, bucket: 'objective' },
  { match: /^(materials|reagents|consumables)\b/i, bucket: 'materials' },
  { match: /^(equipment|instrumentation|apparatus|instruments)\b/i, bucket: 'equipment' },
  { match: /^(safety|hazards|precautions|warning)\b/i, bucket: 'safety' },
  { match: /^(procedure|protocol|method|steps?)\b/i, bucket: 'procedure' },
  { match: /^(notes?|comments?)\b/i, bucket: 'notes' },
];

function makeId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, '');
}

function cleanLine(line: string): string {
  return line.replace(/\s+/gu, ' ').trim();
}

function isNoise(line: string): boolean {
  return [
    /^page \d+/iu,
    /^vendor protocol/iu,
    /^confidential/iu,
    /^for research use only/iu,
  ].some((pattern) => pattern.test(line));
}

function resolveBucket(line: string): keyof ParsedBuckets | null {
  const normalized = cleanLine(line).replace(/[:\-]+$/u, '');
  for (const entry of SECTION_ALIASES) {
    if (entry.match.test(normalized)) return entry.bucket;
  }
  return null;
}

function buildBuckets(lines: string[]): ParsedBuckets {
  const buckets: ParsedBuckets = {
    overview: [],
    objective: [],
    materials: [],
    equipment: [],
    safety: [],
    procedure: [],
    notes: [],
  };

  let currentBucket: keyof ParsedBuckets = 'overview';
  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line || isNoise(line)) continue;
    const nextBucket = resolveBucket(line);
    if (nextBucket) {
      currentBucket = nextBucket;
      continue;
    }
    buckets[currentBucket].push(line);
  }

  return buckets;
}

function parseList(lines: string[]): string[] {
  const values = lines
    .flatMap((line) => line.split(/[;,]/u))
    .map((entry) => entry.replace(/^[\-\u2022*\d.)\s]+/u, '').trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(values));
}

function parseSteps(lines: string[]): ProtocolImportStep[] {
  const steps: ProtocolImportStep[] = [];
  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    const numbered = cleaned.match(/^(?:step\s*)?(\d+)[\).:\-]?\s+(.+)$/iu);
    const bullet = cleaned.match(/^[\-\u2022*]\s+(.+)$/u);
    const text = numbered?.[2] ?? bullet?.[1] ?? cleaned;
    if (text.length < 8) continue;
    const title = text.length > 48 ? text.slice(0, 48).trimEnd() : text;
    steps.push({
      id: makeId('step', steps.length),
      title,
      instruction: text,
      confidenceScore: numbered || bullet ? 0.82 : 0.66,
    });
  }
  return steps;
}

function deriveTitle(lines: string[], fileName: string): string {
  const candidate = lines.find((line) => {
    const cleaned = cleanLine(line);
    return cleaned.length >= 8 && cleaned.length <= 120 && !resolveBucket(cleaned);
  });
  return candidate ?? stripExtension(fileName);
}

function joinLines(lines: string[], maxLines = lines.length): string {
  return lines.slice(0, maxLines).map(cleanLine).filter(Boolean).join(' ');
}

function createFallbackStep(summary: string): ProtocolImportStep {
  return {
    id: 'step-01',
    title: 'Review vendor instructions',
    instruction: summary || 'Review the source PDF and enter the procedural steps manually.',
    notes: 'Generated because the importer could not recover reliable procedural steps.',
    confidenceScore: 0.34,
  };
}

function createSections(buckets: ParsedBuckets): ProtocolImportSection[] {
  const sections: ProtocolImportSection[] = [];
  if (buckets.safety.length > 0) {
    sections.push({
      id: makeId('section', sections.length),
      title: 'Safety',
      body: joinLines(buckets.safety),
      confidenceScore: 0.78,
    });
  }
  if (buckets.notes.length > 0) {
    sections.push({
      id: makeId('section', sections.length),
      title: 'Imported Notes',
      body: joinLines(buckets.notes),
      confidenceScore: 0.7,
    });
  }
  return sections;
}

function clampScore(value: number): number {
  return Math.max(0.2, Math.min(0.96, Number(value.toFixed(2))));
}

export async function importProtocolPdf(
  input: ProtocolImportRequest,
  options: ImportOptions = {},
): Promise<ProtocolImportResponse> {
  const trimmedFileName = input.fileName?.trim();
  const contentBase64 = input.contentBase64?.trim();
  if (!trimmedFileName || !contentBase64) {
    throw new Error('fileName and contentBase64 are required');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    throw new Error('contentBase64 must be valid base64');
  }

  const diagnostics: ProtocolImportDiagnostic[] = [];
  const extract = options.extractPdfText ?? extractPdfLayoutText;

  let pages: PdfPageText[] = [];
  let extractionMethod: 'pdf_text' | 'ocr' = 'pdf_text';
  try {
    const pdf = await extract(buffer, trimmedFileName);
    pages = pdf.pages;
  } catch (err) {
    extractionMethod = 'ocr';
    diagnostics.push({
      id: 'diag-01',
      severity: 'warning',
      code: 'PDF_TEXT_EXTRACTION_FAILED',
      message: `PDF text extraction failed; generated a draft from fallback heuristics. ${err instanceof Error ? err.message : String(err)}`,
      target: { kind: 'document' },
    });
  }

  const lines = pages
    .flatMap((page) => page.text.split(/\r?\n/gu))
    .map(cleanLine)
    .filter((line) => line.length > 0 && !isNoise(line));

  const buckets = buildBuckets(lines);
  const title = deriveTitle(lines, trimmedFileName);
  const objective = joinLines(buckets.objective, 2) || `Review and adapt ${stripExtension(trimmedFileName)} into a reusable generic protocol.`;
  const overview = joinLines(buckets.overview, 3) || joinLines(lines, 4) || `Imported from ${trimmedFileName}.`;
  const materials = parseList(buckets.materials);
  const equipment = parseList(buckets.equipment);
  const extractedSteps = parseSteps(buckets.procedure);
  const steps = extractedSteps.length > 0 ? extractedSteps : [createFallbackStep(overview)];
  const sections = createSections(buckets);

  const missingSections: string[] = [];
  if (materials.length === 0) missingSections.push('Materials');
  if (equipment.length === 0) missingSections.push('Equipment');
  if (buckets.safety.length === 0) missingSections.push('Safety Handling');
  if (extractedSteps.length === 0) missingSections.push('Procedure Steps');

  if (missingSections.length > 0) {
    diagnostics.push({
      id: `diag-${String(diagnostics.length + 1).padStart(2, '0')}`,
      severity: 'warning',
      code: 'PARTIAL_EXTRACTION',
      message: `Missing or sparse sections: ${missingSections.join(', ')}.`,
      target: { kind: 'document' },
    });
  }

  if (pages.length === 0 || lines.length < 8) {
    diagnostics.push({
      id: `diag-${String(diagnostics.length + 1).padStart(2, '0')}`,
      severity: 'warning',
      code: 'LOW_CONFIDENCE_SOURCE',
      message: 'The PDF contained limited recoverable text; review all imported content before reuse.',
      target: { kind: 'overview' },
    });
  }

  let confidence = 0.92;
  if (extractionMethod === 'ocr') confidence -= 0.24;
  confidence -= missingSections.length * 0.08;
  if (pages.length === 0) confidence -= 0.12;
  if (extractedSteps.length === 0) confidence -= 0.1;
  const confidenceScore = clampScore(confidence);

  const state: ProtocolImportResponse['state'] = missingSections.length > 1
    ? 'partial'
    : confidenceScore < 0.72
      ? 'low_confidence'
      : 'ready';

  const reviewNotes = diagnostics.map((entry) => entry.message);
  if (reviewNotes.length === 0) {
    reviewNotes.push('Verify durations, safety language, and equipment naming before downstream compilation.');
  }

  return {
    success: true,
    importId: `protocol-import-${Date.now()}`,
    state,
    source: {
      fileName: trimmedFileName,
      mediaType: input.mediaType?.trim() || 'application/pdf',
      ...(typeof input.sizeBytes === 'number' ? { sizeBytes: input.sizeBytes } : {}),
    },
    extraction: {
      method: extractionMethod,
      statusSummary: state === 'partial'
        ? 'Imported a partial generic protocol draft with explicit review gaps.'
        : state === 'low_confidence'
          ? 'Imported a draft with low-confidence extraction signals that need review.'
          : 'Imported a generic editable protocol draft from the vendor PDF.',
      pageCount: pages.length,
      confidenceScore,
      missingSections,
      reviewNotes,
    },
    document: {
      title,
      objective,
      overview,
      policySummary: 'Imported protocols remain editable generic drafts until a later persistence or compilation flow confirms them.',
      sections,
      materials,
      equipment,
      steps,
    },
    diagnostics,
  };
}
