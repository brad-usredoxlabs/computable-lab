/**
 * ValidationReport - Structured validation findings and report.
 *
 * This module defines the canonical shapes for validation findings
 * and the report that aggregates them.  Specs 035-036 add actual
 * check implementations.
 */

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning' | 'info';

// ---------------------------------------------------------------------------
// ValidationFinding
// ---------------------------------------------------------------------------

/**
 * A single validation finding emitted by a ValidationCheck.
 */
export interface ValidationFinding {
  severity: ValidationSeverity;
  category: string;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
  affectedIds?: string[];
}

// ---------------------------------------------------------------------------
// ValidationReport
// ---------------------------------------------------------------------------

/**
 * Aggregated report of all validation findings from a compile run.
 */
export interface ValidationReport {
  findings: ValidationFinding[];
}
