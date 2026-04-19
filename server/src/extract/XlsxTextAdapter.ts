/**
 * XLSX text adapter for extracting flat text from Excel spreadsheets.
 * 
 * This adapter flattens each sheet into a TSV-like block with a sheet-header
 * marker so the LLM can distinguish between sheets. It is designed as a
 * preprocessor for the extraction pipeline.
 */

import type { ExtractionDiagnostic } from './ExtractorAdapter.js';

/**
 * Result of XLSX text extraction.
 */
export interface XlsxExtractionResult {
  text: string;
  sheet_count: number;
  diagnostics: ExtractionDiagnostic[];
}

/**
 * Diagnostic codes for XLSX extraction.
 */
export const XLSX_DIAGNOSTIC_CODES = {
  XLSX_PARSE_FAILED: 'xlsx_parse_failed',
  XLSX_EMPTY_WORKBOOK: 'xlsx_empty_workbook',
} as const;

/**
 * Extract plain text from XLSX/Excel input.
 * 
 * This function reads an Excel workbook and flattens each sheet into
 * TSV-like text with sheet headers. It never throws - all errors are
 * returned as diagnostics.
 * 
 * @param buffer - Excel file as Buffer
 * @returns Promise resolving to extracted text, sheet count, and any diagnostics
 */
export async function extractXlsxText(buffer: Buffer): Promise<XlsxExtractionResult> {
  try {
    // Dynamic import to avoid bundling issues
    const XLSX = await import('xlsx');
    
    // Parse the workbook from buffer
    const wb = XLSX.read(buffer, { type: 'buffer' });
    
    // Check for empty workbook
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return {
        text: '',
        sheet_count: 0,
        diagnostics: [{
          severity: 'warning',
          code: XLSX_DIAGNOSTIC_CODES.XLSX_EMPTY_WORKBOOK,
          message: 'No sheets in workbook'
        }]
      };
    }
    
    const lines: string[] = [];
    
    // Process each sheet
    for (const sheetName of wb.SheetNames) {
      lines.push(`## Sheet: ${sheetName}`);
      
      const sheet = wb.Sheets[sheetName];
      
      // Skip if sheet is undefined (shouldn't happen, but be safe)
      if (!sheet) {
        continue;
      }
      
      // Convert sheet to array of arrays (header: 1 gives raw array format)
      // defval: '' ensures empty cells become empty strings
      const rows = XLSX.utils.sheet_to_json(sheet, { 
        header: 1, 
        defval: '' 
      }) as unknown[][];
      
      // Convert each row to TSV
      for (const row of rows) {
        const tsvRow = row.map(cell => {
          // Empty cells become empty strings, never 'null' or 'undefined'
          if (cell == null) {
            return '';
          }
          return String(cell);
        }).join('\t');
        
        lines.push(tsvRow);
      }
      
      // Add blank line between sheets
      lines.push('');
    }
    
    return {
      text: lines.join('\n'),
      sheet_count: wb.SheetNames.length,
      diagnostics: []
    };
  } catch (err) {
    return {
      text: '',
      sheet_count: 0,
      diagnostics: [{
        severity: 'error',
        code: XLSX_DIAGNOSTIC_CODES.XLSX_PARSE_FAILED,
        message: err instanceof Error ? err.message : String(err)
      }]
    };
  }
}
