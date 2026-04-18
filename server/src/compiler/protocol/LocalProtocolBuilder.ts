/**
 * LocalProtocolBuilder - Pure function to build a local-protocol record from a ProtocolCompilerResult
 * 
 * This module provides a pure transform function that constructs a local-protocol record
 * from compiler output. It does not persist anything - that is the caller's responsibility.
 */

export interface LocalProtocolSubstitution {
  role: string;
  material_ref: { kind: 'record'; id: string; type: string };
  rationale?: string;
}

export interface LocalProtocolOverrides {
  bindings?: unknown[];
  parameters?: unknown[];
  substitutions?: LocalProtocolSubstitution[];
  timing_policies?: unknown[];
  tip_policies?: unknown[];
}

export interface LocalProtocolPayload {
  protocolLayer: 'lab';
  kind: 'local-protocol';
  recordId: string;
  title: string;
  inherits_from: { kind: 'record'; id: string; type: string };
  lab_state_refs?: Array<{ kind: 'record'; id: string; type: string }>;
  overrides: LocalProtocolOverrides;
  status: 'draft' | 'active' | 'superseded' | 'retracted';
  supersedes?: { kind: 'record'; id: string; type: string };
  notes?: string;
}

export interface BuildLocalProtocolArgs {
  globalProtocolRecordId: string;
  globalProtocolTitle: string;
  compiledSteps: ReadonlyArray<{
    stepId: string;
    equipmentRef?: { kind: 'record'; id: string; type: string };
  }>;
  substitutions?: ReadonlyArray<LocalProtocolSubstitution>;
  labStateRefs?: ReadonlyArray<string>;
  notes?: string;
  status?: LocalProtocolPayload['status'];
}

/**
 * Build a local-protocol record payload from compiler arguments.
 * 
 * @param args - BuildLocalProtocolArgs containing the source protocol info and overrides
 * @returns A LocalProtocolPayload object ready for persistence
 */
export function buildLocalProtocol(args: BuildLocalProtocolArgs): LocalProtocolPayload {
  // Derive recordId: strip PRT- or PRO- prefix if present, lowercase the suffix
  const strippedId = args.globalProtocolRecordId
    .replace(/^PRT-/i, '')
    .replace(/^PRO-/i, '')
    .toLowerCase();
  const recordId = `LPR-${strippedId}-v1`;

  // Build title
  const title = `Local realization of ${args.globalProtocolTitle}`;

  // Build inherits_from reference
  const inherits_from = {
    kind: 'record' as const,
    id: args.globalProtocolRecordId,
    type: 'protocol'
  };

  // Build bindings from compiledSteps - only include steps with equipmentRef
  const bindings: Array<{ stepId: string; equipmentRef: { kind: 'record'; id: string; type: string } }> = [];
  for (const step of args.compiledSteps) {
    if (step.equipmentRef) {
      bindings.push({
        stepId: step.stepId,
        equipmentRef: step.equipmentRef
      });
    }
  }

  // Build overrides object - only include non-empty optional fields
  const overrides: LocalProtocolOverrides = {};
  
  if (bindings.length > 0) {
    overrides.bindings = bindings;
  }
  
  if (args.substitutions && args.substitutions.length > 0) {
    overrides.substitutions = [...args.substitutions];
  }

  // Build lab_state_refs if provided
  let lab_state_refs: Array<{ kind: 'record'; id: string; type: string }> | undefined;
  if (args.labStateRefs && args.labStateRefs.length > 0) {
    lab_state_refs = args.labStateRefs.map(id => ({
      kind: 'record' as const,
      id,
      type: 'lab-state'
    }));
  }

  // Build the base payload with required fields
  const payload: LocalProtocolPayload = {
    protocolLayer: 'lab',
    kind: 'local-protocol',
    recordId,
    title,
    inherits_from,
    overrides,
    status: args.status ?? 'draft'
  };

  // Conditionally add optional fields
  if (lab_state_refs) {
    payload.lab_state_refs = lab_state_refs;
  }

  if (args.notes && args.notes.length > 0) {
    payload.notes = args.notes;
  }

  // Note: supersedes is NOT included in Phase-1 output per spec

  return payload;
}
