/**
 * Extractor adapter interface for AI-powered record extraction.
 * 
 * This module defines the contract for extracting structured record candidates
 * from unstructured text, as specified in spec-055.
 */

/**
 * A candidate record extracted from unstructured text.
 */
export interface ExtractionCandidate {
  target_kind: string;           // e.g., "material-spec", "event"
  draft: Record<string, unknown>; // candidate YAML body, unvalidated
  confidence: number;             // 0..1
  ambiguity_spans?: Array<{
    path: string;                 // JSON-path into draft; matches extraction-draft schema (spec-035)
    reason: string;               // e.g., "material name matched 3 records"
  }>;
}

/**
 * Request for extracting candidates from text.
 */
export interface ExtractionRequest {
  text: string;                   // source text chunk
  hint?: {
    target_kinds?: string[];      // restrict candidates to these kinds
    source_ref?: { kind: 'record'; id: string; type: string };
  };
}

/**
 * Diagnostic message from the extraction process.
 */
export interface ExtractionDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Result of an extraction request.
 */
export interface ExtractionResult {
  candidates: ExtractionCandidate[];
  diagnostics: ExtractionDiagnostic[];
}

/**
 * Adapter interface for AI extractors.
 */
export interface ExtractorAdapter {
  extract(req: ExtractionRequest): Promise<ExtractionResult>;
}
