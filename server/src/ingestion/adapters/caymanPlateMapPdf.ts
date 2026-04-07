import { normalizeChemicalName } from '../normalization/chemSymbolNormalization.js';
import { extractPdfLayoutText, type PdfPageText } from '../pdf/TableExtractionService.js';

export interface CaymanPlateEntry {
  plateNumber: number;
  well: string;
  rawContents: string;
  normalizedContents: string;
  itemNumber?: string;
  pageNumber: number;
  rowNumber: number;
  unused: boolean;
  normalizationChanges: string[];
}

export interface CaymanChemicalMetadata {
  normalizedName: string;
  sourceName: string;
  itemNumber?: string;
  definition?: string;
  synonyms?: string[];
  molecularWeight?: { value: number; unit: 'g/mol' };
  chemicalProperties?: {
    molecular_formula?: string;
    cas_number?: string;
    solubility?: string;
  };
}

export interface CaymanPlateExtraction {
  title: string;
  pages: PdfPageText[];
  entries: CaymanPlateEntry[];
  uniquePlateNumbers: number[];
  uniqueMaterialCount: number;
  unusedWellCount: number;
  normalizedSymbolChangeCount: number;
  packageSizes: string[];
  defaultConcentration: { value: number; unit: string; basis: string };
  solvent: string;
  warnings: string[];
  sha256: string;
  materialMetadata?: CaymanChemicalMetadata[];
}

const ROW_PATTERN = /^\s*(\d+)\s+([A-H](?:[1-9]|1[0-2]))\s+(.*)$/;
const ITEM_NUMBER_PATTERN = /^(.*?)(?:\s{2,}|\s+)(\d{5,6})\s*$/;

function ignoreLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return [
    /^PRODUCT INFORMATION/,
    /^Plate\s+Well\s+Contents/,
    /^Item No\./,
    /^Panels are routinely/,
    /^Page \d+ of \d+/,
    /^(WARNING|SAFETY DATA|WARRANTY AND LIMITATION OF REMEDY)/,
    /^CAYMAN CHEMICAL/,
    /^ANN ARBOR, MI/,
    /^(PHONE:|FAX:|CUSTSERV@|WWW\.CAYMANCHEM\.COM)/,
    /^Copyright Cayman Chemical Company/,
    /^1180 EAST ELLSWORTH RD/,
    /^THIS PRODUCT IS FOR RESEARCH ONLY/,
  ].some((pattern) => pattern.test(trimmed));
}

function splitTitle(pages: PdfPageText[]): string {
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const title = lines.find((line) => /Screening Library/i.test(line));
    if (title) return title;
  }
  return 'Cayman screening library';
}

function finalizeEntry(current: {
  plateNumber: number;
  well: string;
  itemNumber?: string;
  pageNumber: number;
  rowNumber: number;
  parts: string[];
} | null, into: CaymanPlateEntry[]): void {
  if (!current) return;
  const rawContents = current.parts.join(' ').replace(/\s+/g, ' ').trim();
  const normalization = normalizeChemicalName(rawContents);
  into.push({
    plateNumber: current.plateNumber,
    well: current.well,
    rawContents,
    normalizedContents: normalization.normalized,
    pageNumber: current.pageNumber,
    rowNumber: current.rowNumber,
    unused: /^unused$/i.test(normalization.normalized),
    normalizationChanges: normalization.changed ? normalization.changes : [],
    ...(current.itemNumber ? { itemNumber: current.itemNumber } : {}),
  });
}

function appendContinuation(current: {
  itemNumber?: string;
  parts: string[];
}, line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  const match = trimmed.match(ITEM_NUMBER_PATTERN);
  if (match && !current.itemNumber) {
    current.parts.push((match[1] || '').trim());
    const nextItemNumber = match[2];
    if (nextItemNumber) current.itemNumber = nextItemNumber;
    return;
  }
  current.parts.push(trimmed);
}

export async function extractCaymanPlateMapPdf(input: {
  contentBase64: string;
  fileName?: string;
}): Promise<CaymanPlateExtraction> {
  const buffer = Buffer.from(input.contentBase64, 'base64');
  const pdf = await extractPdfLayoutText(buffer, input.fileName ?? 'cayman.pdf');
  const entries: CaymanPlateEntry[] = [];

  for (const page of pdf.pages) {
    const lines = page.text.split(/\r?\n/);
    let rowNumber = 0;
    let current: {
      plateNumber: number;
      well: string;
      itemNumber?: string;
      pageNumber: number;
      rowNumber: number;
      parts: string[];
    } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        finalizeEntry(current, entries);
        current = null;
        continue;
      }
      if (ignoreLine(line)) continue;
      const match = line.match(ROW_PATTERN);
      if (match) {
        finalizeEntry(current, entries);
        rowNumber += 1;
        const rest = (match[3] || '').trim();
        const itemMatch = rest.match(ITEM_NUMBER_PATTERN);
        current = {
          plateNumber: Number(match[1] || '0'),
          well: match[2] || '',
          pageNumber: page.pageNumber,
          rowNumber,
          parts: [itemMatch ? (itemMatch[1] || '').trim() : rest],
          ...(itemMatch?.[2] ? { itemNumber: itemMatch[2] } : {}),
        };
        continue;
      }
      if (current) appendContinuation(current, line);
    }

    finalizeEntry(current, entries);
  }

  const nonUnused = entries.filter((entry) => !entry.unused);
  const uniquePlateNumbers = Array.from(new Set(entries.map((entry) => entry.plateNumber))).sort((a, b) => a - b);
  return {
    title: splitTitle(pdf.pages),
    pages: pdf.pages,
    entries,
    uniquePlateNumbers,
    uniqueMaterialCount: new Set(nonUnused.map((entry) => entry.normalizedContents.toLowerCase())).size,
    unusedWellCount: entries.filter((entry) => entry.unused).length,
    normalizedSymbolChangeCount: entries.filter((entry) => entry.normalizationChanges.length > 0).length,
    packageSizes: ['25 uL', '50 uL'],
    defaultConcentration: { value: 1, unit: 'mM', basis: 'molar' },
    solvent: 'DMSO',
    warnings: [],
    sha256: pdf.sha256,
    materialMetadata: [],
  };
}
