/**
 * Common type definitions for computable-lab.
 * 
 * These types are fundamental building blocks used across the system.
 * They MUST NOT contain schema-specific logic or business rules.
 */

/**
 * Validation error with JSON pointer path.
 */
export interface ValidationError {
  /** JSON pointer path to the error location (e.g., "/title") */
  path: string;
  /** Error message */
  message: string;
  /** Schema keyword that failed (e.g., "required", "type", "enum") */
  keyword: string;
  /** Additional parameters from the validation */
  params?: Record<string, unknown>;
}

/**
 * Result of structural validation via Ajv.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
}

/**
 * Lint severity levels.
 */
export type LintSeverity = 'error' | 'warning' | 'info';

/**
 * Single lint violation.
 */
export interface LintViolation {
  /** Rule ID that triggered the violation */
  ruleId: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: LintSeverity;
  /** JSON path relevant to this violation (optional) */
  path?: string;
}

/**
 * Summary of lint results.
 */
export interface LintSummary {
  /** Total number of rules evaluated */
  total: number;
  /** Number of rules passed */
  passed: number;
  /** Number of rules failed */
  failed: number;
  /** Number of rules skipped */
  skipped: number;
  /** Number of errors */
  errors: number;
  /** Number of warnings */
  warnings: number;
  /** Number of info messages */
  info: number;
}

/**
 * Result of lint evaluation.
 */
export interface LintResult {
  /** Whether all error-severity rules passed */
  valid: boolean;
  /** List of lint violations */
  violations: LintViolation[];
  /** Summary of results */
  summary?: LintSummary;
}

/**
 * Combined validation + lint result.
 */
export interface FullValidationResult {
  /** Structural validation result */
  validation: ValidationResult;
  /** Lint result */
  lint: LintResult;
  /** Overall validity (validation.valid && lint.valid) */
  valid: boolean;
}
