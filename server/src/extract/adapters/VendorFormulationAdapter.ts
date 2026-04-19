/**
 * Vendor formulation extraction adapter.
 * 
 * Parses structured vendor formulation inputs (HTML product pages or JSON)
 * and emits material-spec candidates for reagents/components.
 * 
 * Supports two input formats:
 * - JSON: structured formulation table with components
 * - HTML: vendor product pages with composition/formulation sections
 * 
 * Per spec-023: Adapter NEVER throws - all errors surface as diagnostics.
 */

import type { ExtractorAdapter, ExtractionRequest, ExtractionResult, ExtractionCandidate, ExtractionDiagnostic } from '../ExtractorAdapter.js';
import { extractHtmlText } from '../HtmlTextAdapter.js';

/**
 * Diagnostic codes for vendor formulation extraction.
 */
export const VENDOR_FORMULATION_DIAGNOSTIC_CODES = {
  VENDOR_FORMULATION_PARSE_FAILED: 'VENDOR_FORMULATION_PARSE_FAILED',
  VENDOR_FORMULATION_NO_COMPONENTS: 'VENDOR_FORMULATION_NO_COMPONENTS',
} as const;

/**
 * Factory function that creates a vendor formulation adapter.
 * 
 * @returns Promise resolving to an ExtractorAdapter configured for vendor formulation extraction
 */
export async function createVendorFormulationAdapter(): Promise<ExtractorAdapter> {
  return {
    async extract(req: ExtractionRequest): Promise<ExtractionResult> {
      try {
        const sourceKind = req.hint?.sourceKind as string | undefined;
        
        if (sourceKind === 'vendor_formulation_json') {
          return extractFromJson(req.text ?? '');
        } else {
          // Default to HTML parsing
          return await extractFromHtml(req.text ?? '');
        }
      } catch (err) {
        // Adapter MUST NEVER throw - all errors become diagnostics
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return {
          candidates: [],
          diagnostics: [{
            severity: 'error',
            code: 'VENDOR_FORMULATION_EXTRACTION_ERROR',
            message: `Vendor formulation adapter failed: ${errorMessage}`,
          }],
        };
      }
    },
  };
}

/**
 * Extract material-spec candidates from JSON-formatted formulation data.
 * 
 * Handles typical shapes:
 * - Array of components: [{ name, amount, unit, ... }]
 * - Object with components array: { components: [...] }
 * 
 * @param text - JSON string containing formulation data
 * @returns ExtractionResult with candidates and diagnostics
 */
function extractFromJson(text: string): ExtractionResult {
  let parsed: unknown;
  
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Invalid JSON';
    return {
      candidates: [],
      diagnostics: [{
        severity: 'error',
        code: VENDOR_FORMULATION_DIAGNOSTIC_CODES.VENDOR_FORMULATION_PARSE_FAILED,
        message: `Failed to parse vendor formulation JSON: ${errorMessage}`,
      }],
    };
  }
  
  const candidates: ExtractionCandidate[] = [];
  let components: unknown[] = [];
  
  // Normalize input to array of components
  if (Array.isArray(parsed)) {
    components = parsed;
  } else if (parsed && typeof parsed === 'object' && 'components' in parsed && Array.isArray((parsed as Record<string, unknown>).components)) {
    components = (parsed as Record<string, unknown>).components as unknown[];
  } else if (parsed && typeof parsed === 'object') {
    // Try to extract components from object keys that look like component data
    const obj = parsed as Record<string, unknown>;
    // Check if this looks like a single component object
    if (obj.name || obj.component || obj.material) {
      components = [obj];
    }
  }
  
  for (const item of components) {
    if (item && typeof item === 'object') {
      const candidate = parseComponentItem(item as Record<string, unknown>);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  
  const diagnostics: ExtractionDiagnostic[] = candidates.length === 0 ? [{
    severity: 'warning',
    code: VENDOR_FORMULATION_DIAGNOSTIC_CODES.VENDOR_FORMULATION_NO_COMPONENTS,
    message: 'Vendor formulation JSON contained no recognizable components',
  }] : [];
  
  return { candidates, diagnostics };
}

/**
 * Parse a single component item from JSON into a material-spec candidate.
 * 
 * @param item - Raw component object from JSON
 * @returns ExtractionCandidate or null if item is unparseable
 */
function parseComponentItem(item: Record<string, unknown>): ExtractionCandidate | null {
  // Extract component name from various possible field names
  const name = (
    item.name ?? 
    item.component ?? 
    item.material ?? 
    item.component_name ?? 
    item.material_name ??
    item['component-name'] ??
    ''
  ) as string;
  
  if (!name || !name.trim()) {
    return null;
  }
  
  // Extract amount and unit
  const amount = (item.amount ?? item.quantity ?? item.concentration ?? item.value ?? '') as string | number;
  const unit = (item.unit ?? item.units ?? item.concentration_unit ?? '') as string;
  
  // Build display string for the material
  let displayName = name.trim();
  if (amount !== '' && amount !== null && amount !== undefined) {
    const amountStr = typeof amount === 'number' ? String(amount) : amount;
    const unitStr = unit ? ` ${unit}` : '';
    displayName = `${name}${amountStr}${unitStr}`.trim();
  }
  
  return {
    target_kind: 'material-spec',
    confidence: 0.85,
    draft: {
      display_name: displayName,
      amount: amount !== '' ? amount : undefined,
      unit: unit || undefined,
      vendor: item.vendor ?? 'Unknown',
    },
    ambiguity_spans: [],
    evidence_span: JSON.stringify(item).slice(0, 140),
    uncertainty: 'low',
  };
}

/**
 * Extract material-spec candidates from HTML-formatted vendor product pages.
 * 
 * Looks for composition/formulation sections and parses list items or
 * table-like rows into components.
 * 
 * @param text - HTML string containing vendor product page
 * @returns ExtractionResult with candidates and diagnostics
 */
async function extractFromHtml(text: string): Promise<ExtractionResult> {
  const { text: plainText, diagnostics: htmlDiagnostics } = await extractHtmlText(text);
  
  const candidates: ExtractionCandidate[] = [];
  
  // Look for composition or formulation sections
  const lines = plainText.split('\n');
  let inSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i];
    if (!lineRaw) continue;
    const line = lineRaw.trim();
    const lowerLine = line.toLowerCase();
    
    // Check for section headers
    if (lowerLine.startsWith('## composition') || 
        lowerLine.startsWith('## formulation') ||
        lowerLine.startsWith('## ingredients') ||
        lowerLine.startsWith('## components')) {
      inSection = true;
      continue;
    }
    
    // If we're in a section, try to parse lines as components
    if (inSection) {
      // Stop at next major heading
      if (line.startsWith('## ')) {
        inSection = false;
        continue;
      }
      
      const candidate = parseComponentLine(line);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  
  // If no section found, try to parse all lines as potential components
  if (candidates.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('##')) {
        const candidate = parseComponentLine(trimmed);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  }
  
  const diagnostics: ExtractionDiagnostic[] = [
    ...htmlDiagnostics,
    candidates.length === 0 ? {
      severity: 'warning',
      code: VENDOR_FORMULATION_DIAGNOSTIC_CODES.VENDOR_FORMULATION_NO_COMPONENTS,
      message: 'Vendor formulation HTML contained no recognizable components',
    } : null,
  ].filter((d): d is ExtractionDiagnostic => d !== null);
  
  return { candidates, diagnostics };
}

/**
 * Parse a single line of text into a material-spec candidate.
 * 
 * Handles formats like:
 * - "Water 50%"
 * - "NaCl 0.9%"
 * - "Glucose, 2 g/L"
 * - "L-Glutamine - 0.3 g/L"
 * 
 * @param line - Text line to parse
 * @returns ExtractionCandidate or null if line is unparseable
 */
function parseComponentLine(line: string): ExtractionCandidate | null {
  if (!line || line.length < 3) {
    return null;
  }
  
  // Try to extract name and amount/unit using various patterns
  let name = '';
  let amount: string | number = '';
  let unit = '';
  
  // Pattern 1: "Name XX%" (e.g., "Water 50%")
  const percentMatch = line.match(/^([A-Za-z\s]+?)\s+([\d.]+)\s*%$/);
  if (percentMatch && percentMatch[1] && percentMatch[2]) {
    name = percentMatch[1].trim();
    amount = parseFloat(percentMatch[2]);
    unit = '%';
  } else {
    // Pattern 2: "Name value unit" (e.g., "Glucose 2 g/L")
    const unitMatch = line.match(/^([A-Za-z\s]+?)\s+([\d.]+)\s+([A-Za-z\/%]+)$/);
    if (unitMatch && unitMatch[1] && unitMatch[2] && unitMatch[3]) {
      name = unitMatch[1].trim();
      amount = parseFloat(unitMatch[2]);
      unit = unitMatch[3].trim();
    } else {
      // Pattern 3: "Name, value unit" (e.g., "Glucose, 2 g/L")
      const commaMatch = line.match(/^([A-Za-z\s]+?),\s*([\d.]+)\s+([A-Za-z\/%]+)$/);
      if (commaMatch && commaMatch[1] && commaMatch[2] && commaMatch[3]) {
        name = commaMatch[1].trim();
        amount = parseFloat(commaMatch[2]);
        unit = commaMatch[3].trim();
      } else {
        // Pattern 4: "Name - value unit" (e.g., "L-Glutamine - 0.3 g/L")
        const dashMatch = line.match(/^([A-Za-z\s\-]+?)\s*-\s*([\d.]+)\s+([A-Za-z\/%]+)$/);
        if (dashMatch && dashMatch[1] && dashMatch[2] && dashMatch[3]) {
          name = dashMatch[1].trim();
          amount = parseFloat(dashMatch[2]);
          unit = dashMatch[3].trim();
        } else {
          // Fallback: treat entire line as name
          name = line;
        }
      }
    }
  }
  
  if (!name || !name.trim()) {
    return null;
  }
  
  // Build display string
  let displayName = name.trim();
  if (amount !== '' && amount !== null) {
    const amountStr = typeof amount === 'number' ? String(amount) : String(amount);
    const unitStr = unit ? ` ${unit}` : '';
    displayName = `${name}${amountStr}${unitStr}`.trim();
  }
  
  return {
    target_kind: 'material-spec',
    confidence: 0.75,
    draft: {
      display_name: displayName,
      amount: amount !== '' ? amount : undefined,
      unit: unit || undefined,
      vendor: 'Unknown',
    },
    ambiguity_spans: [],
    evidence_span: line.slice(0, 140),
    uncertainty: 'medium',
  };
}
