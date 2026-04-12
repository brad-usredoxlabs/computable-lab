import { normalizeChemicalName } from '../normalization/chemSymbolNormalization.js';
import { extractHtmlSections } from '../html/HtmlSectionExtractionService.js';

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
 * Parsed table row
 */
interface TableRow {
  rowNumber: number;
  data: Record<string, string>;
}

/**
 * Transform types supported by the extractor
 */
type TransformType = 'none' | 'trim' | 'lowercase' | 'uppercase' | 'normalize_chemical' | 'parse_concentration' | 'parse_volume' | 'parse_duration';

/**
 * Parse concentration strings like "1 mM", "10 µM"
 */
function parseConcentration(value: string): { value: number; unit: string } | null {
  const match = value.match(/^([\d.]+)\s*([a-zA-Zµμ]+)/);
  if (!match) return null;
  const unit = match[2];
  if (!unit) return null;
  return {
    value: Number.parseFloat(match[1] || '0'),
    unit,
  };
}

/**
 * Parse volume strings like "10 µL", "500 mL"
 */
function parseVolume(value: string): { value: number; unit: string } | null {
  const match = value.match(/^([\d.]+)\s*([a-zA-Zµμ]+)/);
  if (!match) return null;
  const unit = match[2];
  if (!unit) return null;
  return {
    value: Number.parseFloat(match[1] || '0'),
    unit,
  };
}

/**
 * Parse duration strings like "30 min", "2 h", "overnight"
 */
function parseDuration(value: string): { value: number; unit: string } | null {
  const lower = value.toLowerCase().trim();
  if (lower === 'overnight') {
    return { value: 12, unit: 'h' };
  }
  const match = lower.match(/^([\d.]+)\s*([a-z]+)$/);
  if (!match) return null;
  const unit = match[2];
  if (!unit) return null;
  const validUnits = ['s', 'sec', 'second', 'min', 'm', 'h', 'hr', 'hour', 'd', 'day'];
  if (!validUnits.includes(unit)) return null;
  return {
    value: Number.parseFloat(match[1] || '0'),
    unit,
  };
}

/**
 * Apply a transform to a string value
 */
function applyTransform(value: string, transform: TransformType): unknown {
  // Always trim the input first for consistency
  const trimmed = value.trim();
  
  switch (transform) {
    case 'none':
      return trimmed;
    case 'trim':
      return trimmed;
    case 'lowercase':
      return trimmed.toLowerCase();
    case 'uppercase':
      return trimmed.toUpperCase();
    case 'normalize_chemical':
      return normalizeChemicalName(trimmed).normalized;
    case 'parse_concentration': {
      const result = parseConcentration(trimmed);
      if (!result) throw new Error(`Could not parse concentration: ${value}`);
      return result;
    }
    case 'parse_volume': {
      const result = parseVolume(trimmed);
      if (!result) throw new Error(`Could not parse volume: ${value}`);
      return result;
    }
    case 'parse_duration': {
      const result = parseDuration(trimmed);
      if (!result) throw new Error(`Could not parse duration: ${value}`);
      return result;
    }
    default:
      return trimmed;
  }
}

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCSV(content: string): string[][] {
  const lines: string[][] = [];
  const linesRaw = content.split(/\r?\n/);
  
  for (const line of linesRaw) {
    if (line.trim() === '') continue;
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current);
    lines.push(fields);
  }
  
  return lines;
}

/**
 * Parse CSV content into rows with headers
 */
function parseCSVContent(content: string, headerRow: number, skipRows: number): TableRow[] {
  const parsed = parseCSV(content);
  const rows: TableRow[] = [];
  
  // Adjust for skipRows and headerRow
  const actualHeaderIndex = headerRow + skipRows;
  if (actualHeaderIndex >= parsed.length) {
    return [];
  }
  
  const headers = parsed[actualHeaderIndex]!.map(h => h.trim());
  
  for (let i = actualHeaderIndex + 1; i < parsed.length; i++) {
    const row = parsed[i]!;
    const data: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header) {
        data[header] = row[j] ?? '';
      }
    }
    rows.push({ rowNumber: i, data });
  }
  
  return rows;
}

/**
 * Parse XLSX content using the existing Cayman spreadsheet parser
 */
async function parseXLSXContent(_content: Buffer): Promise<TableRow[]> {
  // Import dynamically to avoid circular dependencies
  await import('./caymanPlateMapSpreadsheet.js');
  
  // For now, return empty - the Cayman parser returns structured data, not raw table rows
  // A proper implementation would need to parse the xlsx directly
  return [];
}

/**
 * Parse PDF table content
 */
async function parsePDFContent(content: Buffer): Promise<TableRow[]> {
  const { extractPdfLayoutText } = await import('../pdf/TableExtractionService.js');
  await extractPdfLayoutText(content, 'document.pdf');
  
  // For PDF, we get plain text with layout. We need to parse tables from text.
  // This is a simplified approach - look for tabular patterns
  const rows: TableRow[] = [];
  
  // This is a placeholder - PDF table parsing is complex
  // The actual implementation would need more sophisticated parsing
  return rows;
}

/**
 * Parse HTML table content
 */
function parseHTMLContent(content: string): TableRow[] {
  const extraction = extractHtmlSections(content);
  const rows: TableRow[] = [];
  
  for (const section of extraction.sections) {
    for (const table of section.tables) {
      for (const row of table.rows) {
        const data: Record<string, string> = {};
        row.cells.forEach((cell, idx) => {
          data[`col_${idx}`] = cell;
        });
        rows.push({ rowNumber: row.rowIndex, data });
      }
    }
  }
  
  return rows;
}

/**
 * Apply field mappings to a row
 */
function applyFieldMappings(
  row: Record<string, string>,
  mappings: Array<{ targetField: string; source: string; transform?: string }>,
  defaults: Record<string, unknown>,
  issues: Array<{ severity: 'info' | 'warning' | 'error'; type: string; message: string; sourceRow?: number }>,
  sourceRow: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  const missingSources = new Set<string>();
  
  for (const mapping of mappings) {
    const sourceValue = row[mapping.source];
    
    if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
      // Track missing sources for issue generation
      missingSources.add(mapping.source);
      continue;
    }
    
    try {
      const transform = (mapping.transform as TransformType) || 'none';
      const transformed = applyTransform(sourceValue, transform);
      result[mapping.targetField] = transformed;
    } catch (error) {
      issues.push({
        severity: 'warning',
        type: 'transform_failure',
        message: `Failed to apply transform '${mapping.transform}' to value '${sourceValue}': ${error instanceof Error ? error.message : String(error)}`,
        sourceRow,
      });
    }
  }
  
  // Add issues for missing required source columns
  for (const source of missingSources) {
    issues.push({
      severity: 'warning',
      type: 'missing_source_column',
      message: `Source column '${source}' not found in row`,
      sourceRow,
    });
  }
  
  return result;
}

/**
 * Check if a row is empty (all mapped fields are empty)
 */
function isEmptyRow(fields: Record<string, unknown>): boolean {
  return Object.values(fields).every(value => {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'object') {
      return Object.values(value).every(v => v === undefined || v === null || v === '');
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
  const allIssues: Array<{ severity: 'info' | 'warning' | 'error'; type: string; message: string; sourceRow?: number }> = [];
  let totalRows = 0;
  
  // Get table extraction config
  const tableExtraction = (spec as any).tableExtraction || {};
  const method = tableExtraction.method || 'csv';
  const headerRow = tableExtraction.headerRow ?? 0;
  const skipRows = tableExtraction.skipRows ?? 0;
  
  // Extract table data based on method
  let tableRows: TableRow[] = [];
  
  try {
    switch (method) {
      case 'csv': {
        const content = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf8');
        tableRows = parseCSVContent(content, headerRow, skipRows);
        break;
      }
      
      case 'xlsx_sheet': {
        const content = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent, 'base64');
        tableRows = await parseXLSXContent(content);
        break;
      }
      
      case 'pdf_table': {
        const content = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent, 'base64');
        tableRows = await parsePDFContent(content);
        break;
      }
      
      case 'html_table': {
        const content = typeof fileContent === 'string' ? fileContent : fileContent.toString('utf8');
        tableRows = parseHTMLContent(content);
        break;
      }
      
      case 'ai_extract':
        allIssues.push({
          severity: 'error',
          type: 'parser_not_implemented',
          message: 'AI extraction is not yet implemented',
        });
        break;
      
      default:
        allIssues.push({
          severity: 'error',
          type: 'unknown_method',
          message: `Unknown extraction method: ${method}`,
        });
    }
  } catch (error) {
    allIssues.push({
      severity: 'error',
      type: 'extraction_failed',
      message: `Failed to extract table: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  
  // Process each target
  const targets = (spec as any).targets || [];
  
  for (const target of targets) {
    const targetSchema = target.targetSchema as string;
    const recordKind = target.recordKind as string;
    const idPrefix = target.idPrefix as string;
    const fieldMappings = target.fieldMappings || [];
    const defaults = target.defaults || {};
    
    const targetIssues: typeof allIssues = [];
    
    // Propagate extraction-level issues (like parser_not_implemented) to each target
    for (const issue of allIssues) {
      targetIssues.push(issue);
    }
    
    const targetRows: Array<{
      fields: Record<string, unknown>;
      sourceRow: number;
      rawValues: Record<string, string>;
    }> = [];
    
    for (const tableRow of tableRows) {
      const fields = applyFieldMappings(
        tableRow.data,
        fieldMappings,
        defaults as Record<string, unknown>,
        targetIssues,
        tableRow.rowNumber,
      );
      
      // Check for empty rows
      if (isEmptyRow(fields)) {
        targetIssues.push({
          severity: 'info',
          type: 'empty_row',
          message: 'Row has no mapped field values',
          sourceRow: tableRow.rowNumber,
        });
        continue;
      }
      
      targetRows.push({
        fields,
        sourceRow: tableRow.rowNumber,
        rawValues: tableRow.data,
      });
    }
    
    totalRows += targetRows.length;
    
    results.push({
      targetSchema,
      recordKind,
      idPrefix,
      rows: targetRows,
      issues: targetIssues,
    });
  }
  
  return {
    results,
    totalRows,
    totalIssues: allIssues.length,
  };
}

export default runExtractionSpec;
