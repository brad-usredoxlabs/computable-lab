import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { normalizeChemicalName } from '../normalization/chemSymbolNormalization.js';
import type { CaymanChemicalMetadata, CaymanPlateEntry, CaymanPlateExtraction } from './caymanPlateMapPdf.js';

const execFileAsync = promisify(execFile);

function decodeXml(text: string): string {
  return text
    .replace(/_x000D_/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripXml(text: string): string {
  return decodeXml(text.replace(/<[^>]+>/g, ''));
}

function normalizeMultiline(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const normalized = decodeXml(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  return normalized || undefined;
}

function splitLines(value: string | undefined): string[] | undefined {
  const normalized = normalizeMultiline(value);
  if (!normalized) return undefined;
  const parts = normalized.split('\n').map((entry) => entry.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sheetColumn(ref: string): string {
  const match = ref.match(/^[A-Z]+/i);
  return match ? match[0].toUpperCase() : '';
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null) {
    const item = match[1] ?? '';
    const textParts = Array.from(item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((entry) => stripXml(entry[1] ?? ''));
    values.push(textParts.join(''));
  }
  return values;
}

function parseSheetRows(xml: string, sharedStrings: string[]): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const cells: Record<string, string> = {};
    const rowXml = rowMatch[1] ?? '';
    const cellPattern = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowXml)) !== null) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? '';
      const body = cellMatch[3] ?? '';
      const refMatch = attrs.match(/\br="([A-Z]+[0-9]+)"/);
      if (!refMatch) continue;
      const column = sheetColumn(refMatch[1] ?? '');
      if (!column) continue;
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch?.[1] ?? '';
      const inlineText = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1];
      const valueText = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's' && valueText) {
        const index = Number.parseInt(valueText, 10);
        value = Number.isFinite(index) ? (sharedStrings[index] ?? '') : '';
      } else if (inlineText) {
        value = stripXml(inlineText);
      } else if (valueText) {
        value = stripXml(valueText);
      } else {
        value = stripXml(body);
      }
      cells[column] = value;
    }
    rows.push(cells);
  }
  return rows;
}

async function readZipEntry(fileName: string, entryName: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', fileName, entryName], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

async function loadWorkbookSheets(fileName: string): Promise<Record<string, string>> {
  const workbookXml = await readZipEntry(fileName, 'xl/workbook.xml');
  const relsXml = await readZipEntry(fileName, 'xl/_rels/workbook.xml.rels');

  const relationshipById = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const id = match[1];
    const target = match[2];
    if (id && target) relationshipById.set(id, target.startsWith('xl/') ? target : `xl/${target}`);
  }

  const sheets: Record<string, string> = {};
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = decodeXml(match[1] ?? '');
    const relId = match[2] ?? '';
    const target = relationshipById.get(relId);
    if (name && target) sheets[name] = target;
  }
  return sheets;
}

function buildMetadata(rows: Array<Record<string, string>>): CaymanChemicalMetadata[] {
  return rows.flatMap((row) => {
    const well = normalizeMultiline(row.C);
    const sourceName = normalizeMultiline(row.E);
    if (!well || !sourceName || /^unused$/i.test(sourceName)) return [];
    const normalization = normalizeChemicalName(sourceName);
    const itemNumber = normalizeMultiline(row.D);
    const definition = normalizeMultiline(row.F);
    const synonyms = splitLines(row.G);
    const molecularWeightValue = parseNumber(row.I);
    const molecularFormula = normalizeMultiline(row.J);
    const casNumber = normalizeMultiline(row.H);
    const solubility = normalizeMultiline(row.M)?.replace(/\n+/g, '; ');
    const metadata: CaymanChemicalMetadata = {
      normalizedName: normalization.normalized,
      sourceName,
      ...(itemNumber && !/^unused$/i.test(itemNumber) ? { itemNumber } : {}),
      ...(definition ? { definition } : {}),
      ...(synonyms ? { synonyms } : {}),
      ...(typeof molecularWeightValue === 'number' ? { molecularWeight: { value: molecularWeightValue, unit: 'g/mol' as const } } : {}),
      ...(casNumber || molecularFormula || solubility
        ? {
            chemicalProperties: {
              ...(molecularFormula ? { molecular_formula: molecularFormula } : {}),
              ...(casNumber ? { cas_number: casNumber } : {}),
              ...(solubility ? { solubility } : {}),
            },
          }
        : {}),
    };
    return [metadata];
  });
}

function buildEntries(rows: Array<Record<string, string>>): CaymanPlateEntry[] {
  let rowNumber = 0;
  return rows.flatMap((row) => {
    const plateNumber = parseNumber(row.B);
    const well = normalizeMultiline(row.C);
    const rawContents = normalizeMultiline(row.E);
    if (!plateNumber || !well || !rawContents) return [];
    rowNumber += 1;
    const normalization = normalizeChemicalName(rawContents);
    const itemNumber = normalizeMultiline(row.D);
    return [{
      plateNumber,
      well,
      rawContents,
      normalizedContents: normalization.normalized,
      ...(itemNumber && !/^unused$/i.test(itemNumber) ? { itemNumber } : {}),
      pageNumber: 1,
      rowNumber,
      unused: /^unused$/i.test(normalization.normalized),
      normalizationChanges: normalization.changed ? normalization.changes : [],
    }];
  });
}

export async function extractCaymanPlateMapSpreadsheet(input: {
  contentBase64: string;
  fileName?: string;
}): Promise<CaymanPlateExtraction> {
  const fileName = input.fileName ?? 'cayman.xlsx';
  const buffer = Buffer.from(input.contentBase64, 'base64');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const tempPath = `/tmp/${sha256.slice(0, 12)}-${fileName.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
  await writeFile(tempPath, buffer);
  try {
    const sheets = await loadWorkbookSheets(tempPath);
    const sharedStrings = parseSharedStrings(await readZipEntry(tempPath, 'xl/sharedStrings.xml'));
    const wellContentsPath = sheets['Well Contents'];
    if (!wellContentsPath) throw new Error('Well Contents sheet not found in Cayman workbook.');
    const wellContentsRows = parseSheetRows(await readZipEntry(tempPath, wellContentsPath), sharedStrings);

    const title = normalizeMultiline(wellContentsRows[0]?.A) ?? 'Cayman screening library';
    const formulation = normalizeMultiline(wellContentsRows[4]?.D) ?? 'A 1.0 mM solution in DMSO';
    const entries = buildEntries(wellContentsRows.slice(12));
    const materialMetadata = buildMetadata(wellContentsRows.slice(12));
    const nonUnused = entries.filter((entry) => !entry.unused);
    const uniquePlateNumbers = Array.from(new Set(entries.map((entry) => entry.plateNumber))).sort((left, right) => left - right);
    const concentrationMatch = formulation.match(/([\d.]+)\s*([munpf]?M)\s+solution\s+in\s+(.+)/i);
    const concentrationUnit = concentrationMatch?.[2] ?? 'mM';
    const solvent = concentrationMatch?.[3]?.trim() ?? 'DMSO';

    return {
      title,
      pages: [],
      entries,
      uniquePlateNumbers,
      uniqueMaterialCount: new Set(nonUnused.map((entry) => entry.normalizedContents.toLowerCase())).size,
      unusedWellCount: entries.filter((entry) => entry.unused).length,
      normalizedSymbolChangeCount: entries.filter((entry) => entry.normalizationChanges.length > 0).length,
      packageSizes: ['25 uL', '50 uL'],
      defaultConcentration: {
        value: Number.parseFloat(concentrationMatch?.[1] ?? '1'),
        unit: concentrationUnit,
        basis: 'molar',
      },
      solvent,
      warnings: [],
      sha256,
      materialMetadata,
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
