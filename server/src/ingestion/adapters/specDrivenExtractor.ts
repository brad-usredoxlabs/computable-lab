import { normalizeChemicalName } from '../normalization/chemSymbolNormalization.js';
import { extractHtmlSections } from '../html/HtmlSectionExtractionService.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Extraction result for a single target schema
 */
export interface ExtractionResult {
  targetSchema: string;
  recordKind: string;
  idPrefix: string;
  rows: Array<{
    fields: Record<string, unknown>;
    sourceRow?: number;
    rawValues?: Record<string, string>;
  }>;
  issues: Array<{
    severity: 'info' | 'warning' | 'error';
    type: string;
    message: string;
    sourceRow?: number;
  }>;
}

/**
 * Output of the spec-driven extraction
 */
export interface SpecDrivenExtractionOutput {
  results: ExtractionResult[];
  totalRows: number;
  totalIssues: number;
}

/**
 * Parsed table data from any source
 */
interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/**
 * Transform types supported by the extractor
 */
type TransformType = 
  | 'none'
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'normalize_chemical'
  | 'parse_concentration'
  | 'parse_volume'
  | 'parse_duration';

/**
 * Parsed concentration/volume/duration value
 */
interface ParsedNumericValue {
  value: number;
  unit: string;
}

/**
 * Apply a transform to a string value
 */
function applyTransform(value: string, transform: TransformType): unknown {
  switch (transform) {
    case 'none':
      return value;
    case 'trim':
      return value.trim();
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'normalize_chemical':
      return normalizeChemicalName(value).normalized;
    case 'parse_concentration':
    case 'parse_volume':
    case 'parse_duration':
      return parseNumericValue(value, transform);
    default:
      return value;
  }
}

/**
 * Parse numeric values with units (e.g., "1 mM", "10 µL", "30 min")
 */
function parseNumericValue(input: string, transformType: 'parse_concentration' | 'parse_volume' | 'parse_duration'): ParsedNumericValue | string {
  const trimmed = input.trim();
  
  // Handle special case for "overnight"
  if (transformType === 'parse_duration' && /overnight/i.test(trimmed)) {
    return { value: 12, unit: 'hours' }; // Default overnight duration
  }

  // Pattern: number followed by optional space and unit
  // Supports µ (micro) and μ (Greek mu) for microliters/micromolar
  const match = trimmed.match(/^([\d.]+)\s*([a-zA-Zµμ]+)$/);
  if (match) {
    const value = Number.parseFloat(match[1]!);
    const unit = match[2]!;
    
    if (Number.isFinite(value)) {
      return { value, unit };
    }
  }

  // If parsing fails, return the original string
  return input;
}

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCsv(content: string): ParsedTable {
  const lines: string[][] = [];
  const linesRaw = content.split(/\r?\n/);
  
  for (const line of linesRaw) {
    if (line.trim() === '') continue;
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      const nextChar = line[i + 1];
      
      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          fields.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }
    fields.push(current);
    lines.push(fields);
  }
  
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const headers = lines[0]!;
  const rows: Array<Record<string, string>> = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row: Record<string, string> = {};
    const values = lines[i]!;
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? '';
    }
    rows.push(row);
  }
  
  return { headers, rows };
}

/**
 * Direct XLSX parsing using XML extraction
 */
async function parseXlsxDirect(content: Buffer, _sheetName?: string): Promise<ParsedTable> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cl-xlsx-'));
  const tempFile = join(tempDir, 'temp.xlsx');
  
  try {
    await writeFile(tempFile, content);
    
    // Read workbook to get sheet names
    const workbookResult = await execFileAsync('unzip', ['-p', tempFile, 'xl/workbook.xml'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const workbookXml = workbookResult.stdout;
    
    // Find first sheet name (not used in this simplified version)
    
    // Get relationships to find sheet XML path
    const relsResult = await execFileAsync('unzip', ['-p', tempFile, 'xl/_rels/workbook.xml.rels'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const relsXml = relsResult.stdout;
    
    // Find the sheet XML path for the target sheet
    let sheetPath = '';
    for (const match of relsXml.matchAll(/<Relationship[^>]*Id="rId(\d+)"[^>]*Target="([^"]+)"/g)) {
      if (match[2]?.includes('worksheets/sheet')) {
        sheetPath = match[2];
        break;
      }
    }
    
    if (!sheetPath) {
      return { headers: [], rows: [] };
    }
    
    // Read shared strings
    let sharedStrings: string[] = [];
    try {
      const sstResult = await execFileAsync('unzip', ['-p', tempFile, 'xl/sharedStrings.xml'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      const sstXml = sstResult.stdout;
      sharedStrings = Array.from(sstXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g))
        .map(m => Array.from((m[1] || '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
          .map(t => (t[1] || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') || '')
          .join('')
        );
    } catch {
      // No shared strings
    }
    
    // Read sheet XML
    const sheetResult = await execFileAsync('unzip', ['-p', tempFile, sheetPath], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const sheetXml = sheetResult.stdout;
    
    // Parse cells
    const columnPattern = /^[A-Z]+/i;
    const rows: Array<Record<string, string>> = [];
    
    for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowXml = rowMatch[1] || '';
      const cells: Record<string, string> = {};
      
      for (const cellMatch of rowXml.matchAll(/<c[^>]*r="([A-Z]+[0-9]+)"[^>]*>([\s\S]*?)<\/c>|<c[^>]*r="([A-Z]+[0-9]+)"[^>]\/>/g)) {
        const ref = (cellMatch[1] || cellMatch[3] || '');
        const cellXml = cellMatch[2] || '';
        const col = ref.match(columnPattern)?.[0]?.toUpperCase() || '';
        
        if (!col) continue;
        
        // Get value
        let value = '';
        const vMatch = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        const tMatch = cellXml.match(/<c[^>]*t="([^"]+)"/);
        
        if (tMatch?.[1] === 's' && vMatch?.[1]) {
          const idx = parseInt(vMatch[1], 10);
          value = sharedStrings[idx] || '';
        } else if (vMatch?.[1]) {
          value = vMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        }
        
        cells[col] = value;
      }
      
      if (Object.keys(cells).length > 0) {
        rows.push(cells);
      }
    }
    
    // Determine headers from first row or use provided sheetName
    const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
    
    return { headers, rows };
  } catch (err) {
    // Fallback: return empty table
    return { headers: [], rows: [] };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Parse XLSX file
 */
async function parseXlsx(content: Buffer, sheetName?: string): Promise<ParsedTable> {
  return parseXlsxDirect(content, sheetName);
}

/**
 * Parse PDF table using TableExtractionService
 */
async function parsePdfTable(content: Buffer): Promise<ParsedTable> {
  const { extractPdfLayoutText } = await import('../pdf/TableExtractionService.js');
  
  const result = await extractPdfLayoutText(content, 'document.pdf');
  
  // Simple heuristic: look for table-like content (rows with consistent column counts)
  const lines = result.pages.flatMap(p => p.text.split('\n'));
  const tableLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Look for lines that might be table rows (multiple columns separated by spaces)
    if (/\s{2,}/.test(trimmed) || /\t/.test(trimmed)) {
      tableLines.push(trimmed);
    }
  }
  
  // Convert to generic format - split by multiple spaces/tabs
  const rows: Array<Record<string, string>> = [];
  let headers: string[] = [];
  
  for (let i = 0; i < tableLines.length; i++) {
    const parts = tableLines[i]!.split(/\s{2,}|\t+/).map(s => s.trim());
    if (i === 0) {
      headers = parts;
    } else {
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]!] = parts[j] || '';
      }
      rows.push(row);
    }
  }
  
  return { headers, rows };
}

/**
 * Parse HTML table using HtmlSectionExtractionService
 */
function parseHtmlTable(content: string): ParsedTable {
  const result = extractHtmlSections(content);
  
  // Find all tables in sections
  const allRows: Array<Record<string, string>> = [];
  let headers: string[] = [];
  
  for (const section of result.sections) {
    for (const table of section.tables) {
      for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i]!;
        const rowObj: Record<string, string> = {};
        
        if (i === 0) {
          // First row is header
          headers = row.cells;
        } else {
          for (let j = 0; j < headers.length; j++) {
            rowObj[headers[j]!] = row.cells[j] || '';
          }
          allRows.push(rowObj);
        }
      }
    }
  }
  
  return { headers, rows: allRows };
}

/**
 * Apply field mappings to a row
 */
function applyFieldMappings(
  row: Record<string, string>,
  mappings: Array<{ targetField: string; source: string; transform?: string }>,
  defaults: Record<string, unknown>,
  issues: Array<{ severity: 'info' | 'warning' | 'error'; type: string; message: string; sourceRow?: number }>,
  sourceRow?: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  
  for (const mapping of mappings) {
    const sourceValue = row[mapping.source];
    
    if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
      // Check if this is a required field (no default)
      if (!(mapping.targetField in defaults)) {
        issues.push({
          severity: 'warning',
          type: 'missing_field',
          message: `Missing value for field '${mapping.targetField}' (source: '${mapping.source}')`,
          ...(sourceRow !== undefined ? { sourceRow } : {}),
        });
      }
      continue;
    }
    
    const transform: TransformType = (mapping.transform as TransformType) || 'none';
    let value: unknown = sourceValue;
    
    try {
      value = applyTransform(String(sourceValue), transform);
    } catch (err) {
      issues.push({
        severity: 'warning',
        type: 'transform_error',
        message: `Transform '${transform}' failed for field '${mapping.targetField}': ${(err as Error).message}`,
        ...(sourceRow !== undefined ? { sourceRow } : {}),
      });
      continue;
    }
    
    result[mapping.targetField] = value;
  }
  
  return result;
}

/**
 * Check if a row is empty (all mapped fields are empty)
 */
function isEmptyRow(fields: Record<string, unknown>): boolean {
  return Object.values(fields).every(v => {
    if (v === null || v === undefined || v === '') return true;
    if (typeof v === 'object') {
      return Object.values(v).every(sv => sv === null || sv === undefined || sv === '');
    }
    return false;
  });
}

/**
 * Main extraction function
 */
export async function runExtractionSpec(
  spec: Record<string, unknown>,
  fileContent: string | Buffer,
  _fileType: string,
): Promise<SpecDrivenExtractionOutput> {
  const results: ExtractionResult[] = [];
  let totalRows = 0;
  let totalIssues = 0;
  
  // Get table extraction config
  const tableExtraction = spec.tableExtraction as 
    | { method: string; sheetName?: string; headerRow?: number; skipRows?: number }
    | undefined;
  
  const method = tableExtraction?.method || 'csv';
  const headerRowIndex = (tableExtraction?.headerRow as number) ?? 0;
  const skipRows = (tableExtraction?.skipRows as number) ?? 0;
  
  // Parse the file based on method
  let parsedTable: ParsedTable;
  
  try {
    switch (method) {
      case 'csv':
        parsedTable = parseCsv(typeof fileContent === 'string' ? fileContent : fileContent.toString('utf8'));
        break;
      
      case 'xlsx_sheet':
        if (Buffer.isBuffer(fileContent)) {
          parsedTable = await parseXlsx(fileContent, tableExtraction?.sheetName as string);
        } else {
          parsedTable = parseCsv(fileContent);
        }
        break;
      
      case 'pdf_table':
        if (Buffer.isBuffer(fileContent)) {
          parsedTable = await parsePdfTable(fileContent);
        } else {
          parsedTable = { headers: [], rows: [] };
        }
        break;
      
      case 'html_table':
        const htmlContent = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf8');
        parsedTable = parseHtmlTable(htmlContent);
        break;
      
      case 'ai_extract':
        // Not implemented - return empty with issue
        results.push({
          targetSchema: 'unknown',
          recordKind: 'unknown',
          idPrefix: 'UNK-',
          rows: [],
          issues: [{
            severity: 'error',
            type: 'parser_not_implemented',
            message: 'AI extraction method is not yet implemented',
          }],
        });
        return { results, totalRows: 0, totalIssues: 1 };
      
      default:
        parsedTable = { headers: [], rows: [] };
    }
  } catch (err) {
    results.push({
      targetSchema: 'unknown',
      recordKind: 'unknown',
      idPrefix: 'ERR-',
      rows: [],
      issues: [{
        severity: 'error',
        type: 'parse_error',
        message: `Failed to parse file: ${(err as Error).message}`,
      }],
    });
    return { results, totalRows: 0, totalIssues: 1 };
  }
  
  // Apply header row and skip rows
  let rows = parsedTable.rows;
  
  if (headerRowIndex > 0) {
    // Skip rows before header
    rows = rows.slice(headerRowIndex);
    if (rows.length > 0) {
      const _headers = Object.keys(rows[0]!);
      rows = rows.slice(1);
    }
  }
  
  if (skipRows > 0) {
    rows = rows.slice(skipRows);
  }
  
  // Get targets from spec
  const targets = spec.targets as Array<{
    targetSchema: string;
    recordKind: string;
    idPrefix: string;
    fieldMappings: Array<{ targetField: string; source: string; transform?: string }>;
    defaults?: Record<string, unknown>;
  }> | undefined;
  
  if (!targets || targets.length === 0) {
    results.push({
      targetSchema: 'unknown',
      recordKind: 'unknown',
      idPrefix: 'UNK-',
      rows: [],
      issues: [{
        severity: 'error',
        type: 'no_targets',
        message: 'No targets defined in extraction spec',
      }],
    });
    return { results, totalRows: 0, totalIssues: 1 };
  }
  
  // Process each target
  for (const target of targets) {
    const targetSchema = target.targetSchema as string;
    const recordKind = target.recordKind as string;
    const idPrefix = target.idPrefix as string;
    const fieldMappings = target.fieldMappings as Array<{ targetField: string; source: string; transform?: string }> || [];
    const defaults = target.defaults as Record<string, unknown> || {};
    
    const targetRows: Array<{ fields: Record<string, unknown>; sourceRow?: number; rawValues?: Record<string, string> }> = [];
    const targetIssues: Array<{ severity: 'info' | 'warning' | 'error'; type: string; message: string; sourceRow?: number }> = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const sourceRow = i + 1; // 1-indexed
      
      const mappedFields = applyFieldMappings(row, fieldMappings, defaults, targetIssues, sourceRow);
      
      // Check for empty row
      if (isEmptyRow(mappedFields)) {
        targetIssues.push({
          severity: 'info',
          type: 'empty_row',
          message: `Row ${sourceRow} has no mapped values`,
          sourceRow,
        });
        continue;
      }
      
      targetRows.push({
        fields: mappedFields,
        sourceRow,
        rawValues: { ...row },
      });
    }
    
    totalRows += targetRows.length;
    totalIssues += targetIssues.length;
    
    results.push({
      targetSchema,
      recordKind,
      idPrefix,
      rows: targetRows,
      issues: targetIssues,
    });
  }
  
  return { results, totalRows, totalIssues };
}

export default runExtractionSpec;
