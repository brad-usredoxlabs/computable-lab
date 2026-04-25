/**
 * ValidationCheck - Registry for pluggable validation checks.
 *
 * This module defines the contract for validation checks that inspect
 * TerminalArtifacts and priorLabState to produce structured findings.
 *
 * Actual checks are registered in specs 035-036.  This spec only
 * provides the registry skeleton.
 */

import type { LabStateSnapshot } from '../state/LabState.js';
import type { TerminalArtifacts } from '../pipeline/CompileContracts.js';
import type { ValidationFinding } from './ValidationReport.js';

// ---------------------------------------------------------------------------
// ValidationContext
// ---------------------------------------------------------------------------

/**
 * Context passed to a validation check at run time.
 */
export interface ValidationContext {
  artifacts: TerminalArtifacts;
  priorLabState: LabStateSnapshot;
}

// ---------------------------------------------------------------------------
// ValidationCheck
// ---------------------------------------------------------------------------

/**
 * A validation check inspects compile artifacts and prior lab state
 * and returns structured findings.
 */
export interface ValidationCheck {
  id: string;
  category: string;
  run(ctx: ValidationContext): ValidationFinding[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const checks = new Map<string, ValidationCheck>();

/**
 * Register a validation check.  Called at module load time by
 * side-effect imports (specs 035-036).
 */
export function registerValidationCheck(check: ValidationCheck): void {
  checks.set(check.id, check);
}

/**
 * Get all registered validation checks.
 */
export function getValidationChecks(): ValidationCheck[] {
  return Array.from(checks.values());
}

/**
 * Clear all registered validation checks.  Test helper only.
 */
export function clearValidationChecks(): void {
  checks.clear();
}
