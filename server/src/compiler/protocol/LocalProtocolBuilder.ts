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
  /**
   * Plate-setting sections (biologist-facing "what this assay needs"),
   * declared ABOVE the steps. Each row binds a role to a concrete record or
   * ontology term; `ref` absent = pending pick the user completes in the UI.
   */
  labwares?: SetupRowPayload[];
  equipment?: SetupRowPayload[];
  materials?: SetupRowPayload[];
  /**
   * Resolved branch axes from condition-first localization: which branch of
   * each universal branch_axes axis this LPR realizes. Recorded here (instead
   * of only in the single-string `variantRef`) so multi-axis choices + the
   * choices themselves are first-class provenance.
   */
  branch_resolution?: unknown[];
}

/** One plate-setting row: a role plus optional note and concrete binding. */
export interface SetupRowPayload {
  role: string;
  description?: string;
  ref?: { kind: 'record'; id: string; type: string };
}

/**
 * Abstract roles declared by the inherited universal protocol, used to seed
 * the plate-setting sections with pending rows at local-protocol creation.
 */
export interface InheritedRoles {
  materialRoles?: Array<{ roleId: string; description?: string; allowedMaterialIds?: string[] }>;
  labwareRoles?: Array<{ roleId: string; description?: string; expectedLabwareKinds?: string[] }>;
  instrumentRoles?: Array<{ roleId: string; description?: string; allowedInstrumentIds?: string[] }>;
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
  /** Inherited universal-protocol roles — seed the plate-setting sections. */
  inheritedRoles?: InheritedRoles;
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

  // Seed the plate-setting sections from the inherited universal protocol's
  // abstract roles. Each role becomes a pending row (biologist-facing role +
  // description); a role carrying concrete ids gets its first id attached as
  // a record ref so the user can review/confirm rather than start from empty.
  const setupSections = buildSetupSections(args.inheritedRoles);

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

  if (setupSections.labwares) {
    payload.labwares = setupSections.labwares;
  }
  if (setupSections.equipment) {
    payload.equipment = setupSections.equipment;
  }
  if (setupSections.materials) {
    payload.materials = setupSections.materials;
  }

  if (args.notes && args.notes.length > 0) {
    payload.notes = args.notes;
  }

  // Note: supersedes is NOT included in Phase-1 output per spec

  return payload;
}

/**
 * Seed the three plate-setting sections from an inherited universal
 * protocol's abstract roles. Each role becomes a pending row (biologist-
 * facing role + description); a role carrying concrete ids gets its first
 * id attached as a record ref so the user can review/confirm rather than
 * start from empty. Returns only the non-empty sections so callers can
 * spread the result without emitting empty arrays.
 *
 * Exported so the specialize-for-experiment path (which assembles its
 * payload inline rather than via buildLocalProtocol) can share the same
 * seeding logic.
 */
export function buildSetupSections(roles: InheritedRoles | undefined): {
  labwares?: SetupRowPayload[];
  equipment?: SetupRowPayload[];
  materials?: SetupRowPayload[];
} {
  const sections: {
    labwares?: SetupRowPayload[];
    equipment?: SetupRowPayload[];
    materials?: SetupRowPayload[];
  } = {};
  const labwareRows = setupRows(roles?.labwareRoles, 'expectedLabwareKinds', 'labware');
  const equipmentRows = setupRows(roles?.instrumentRoles, 'allowedInstrumentIds', 'equipment');
  const materialRows = setupRows(roles?.materialRoles, 'allowedMaterialIds', 'material');
  if (labwareRows.length > 0) sections.labwares = labwareRows;
  if (equipmentRows.length > 0) sections.equipment = equipmentRows;
  if (materialRows.length > 0) sections.materials = materialRows;
  return sections;
}

/**
 * Map inherited abstract roles to plate-setting rows. `idKey` selects the
 * role field that may carry concrete record ids (only the first is bound);
 * `refType` is the record `type` for any attached ref.
 */
function setupRows(
  roles:
    | Array<{ roleId: string; description?: string; allowedMaterialIds?: string[]; expectedLabwareKinds?: string[]; allowedInstrumentIds?: string[] }>
    | undefined,
  idKey: 'allowedMaterialIds' | 'expectedLabwareKinds' | 'allowedInstrumentIds',
  refType: string
): SetupRowPayload[] {
  if (!roles || roles.length === 0) return [];
  return roles.map((r) => {
    const row: SetupRowPayload = { role: r.roleId };
    if (r.description) row.description = r.description;
    const concrete = r[idKey];
    const id = concrete?.[0];
    if (id) row.ref = { kind: 'record', id, type: refType };
    return row;
  });
}
