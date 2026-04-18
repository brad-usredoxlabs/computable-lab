/**
 * LabStateCascadeWalker
 *
 * Finds records whose lab_state_refs point at a superseded lab-state.
 * This is a pure function - no IO, no persistence, no logging.
 *
 * Matches spec-032: direct-dependents search for Phase-1 lab-state cascade.
 */

/**
 * Diagnostic emitted when a record directly references a superseded lab-state.
 */
export interface CascadeDiagnostic {
  dependentKind: string;
  dependentRecordId: string;
  supersededLabStateRecordId: string;
  reason: string;
}

/**
 * Minimal envelope-like shape the walker needs.
 * Callers pass anything with a `.kind` + `.recordId` + `.lab_state_refs` array.
 */
export interface LabStateCandidate {
  kind: string;
  recordId: string;
  lab_state_refs?: ReadonlyArray<{ id?: string } | string>;
}

/**
 * Pure: given a superseded lab-state recordId and a list of candidate
 * records that might reference it, return a diagnostic per direct-reference
 * dependent. Empty array if none.
 *
 * Matches a reference when the ref object's .id equals the supersededLabStateId,
 * OR when the ref is a string equal to the supersededLabStateId.
 */
export function findDependentsOfLabState(
  supersededLabStateId: string,
  candidates: ReadonlyArray<LabStateCandidate>,
): CascadeDiagnostic[] {
  const diagnostics: CascadeDiagnostic[] = [];

  for (const candidate of candidates) {
    const refs = candidate.lab_state_refs ?? [];
    let matches = false;

    for (const ref of refs) {
      // Ref can be either a string or an object with an .id property
      if (typeof ref === 'string') {
        if (ref === supersededLabStateId) {
          matches = true;
          break;
        }
      } else if (ref.id === supersededLabStateId) {
        matches = true;
        break;
      }
    }

    if (matches) {
      diagnostics.push({
        dependentKind: candidate.kind,
        dependentRecordId: candidate.recordId,
        supersededLabStateRecordId: supersededLabStateId,
        reason: `references superseded lab-state ${supersededLabStateId}`,
      });
    }
  }

  return diagnostics;
}
