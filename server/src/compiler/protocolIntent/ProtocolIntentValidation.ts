import type { Pass, PassDiagnostic, PassResult } from '../pipeline/types.js';
import type {
  LabwareOrientation,
  ProtocolIntent,
  ProtocolIntentId,
  ProtocolOperationIntent,
  ProtocolPatternIntent,
} from './ProtocolIntent.js';

export interface ProtocolIntentValidationFinding {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  blocksLowering: boolean;
  details?: Record<string, unknown>;
}

export interface ProtocolIntentValidationOutput {
  status: 'ready' | 'blocked';
  findings: ProtocolIntentValidationFinding[];
  blockers: ProtocolIntentValidationFinding[];
}

interface ProtocolIntentIdIndex {
  all: Set<string>;
  labware: Set<string>;
  materials: Set<string>;
  formulations: Set<string>;
  aliquots: Set<string>;
  pipettes: Set<string>;
  tips: Set<string>;
  waste: Set<string>;
  operations: Set<string>;
  patterns: Set<string>;
}

function compact<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function finding(args: {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  blocksLowering?: boolean;
  details?: Record<string, unknown>;
}): ProtocolIntentValidationFinding {
  return compact<ProtocolIntentValidationFinding>({
    severity: args.severity,
    code: args.code,
    message: args.message,
    path: args.path,
    blocksLowering: args.blocksLowering ?? args.severity === 'error',
    details: args.details,
  });
}

function addId(
  ids: ProtocolIntentIdIndex,
  seen: Map<string, string>,
  findings: ProtocolIntentValidationFinding[],
  id: ProtocolIntentId,
  kind: string,
  path: string,
  target: Set<string>,
): void {
  const prior = seen.get(id);
  if (prior) {
    findings.push(finding({
      severity: 'error',
      code: 'duplicate_protocol_intent_id',
      message: `ProtocolIntent id '${id}' is used by both ${prior} and ${kind}.`,
      path,
      details: { id, prior, kind },
    }));
  }
  seen.set(id, kind);
  target.add(id);
  ids.all.add(id);
}

function indexIds(intent: ProtocolIntent, findings: ProtocolIntentValidationFinding[]): ProtocolIntentIdIndex {
  const ids: ProtocolIntentIdIndex = {
    all: new Set(),
    labware: new Set(),
    materials: new Set(),
    formulations: new Set(),
    aliquots: new Set(),
    pipettes: new Set(),
    tips: new Set(),
    waste: new Set(),
    operations: new Set(),
    patterns: new Set(),
  };
  const seen = new Map<string, string>();

  intent.resources.labwareInstances.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'labware', `resources.labwareInstances.${index}.id`, ids.labware);
  });
  intent.resources.materialDefinitions.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'material', `resources.materialDefinitions.${index}.id`, ids.materials);
  });
  intent.resources.materialFormulations.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'formulation', `resources.materialFormulations.${index}.id`, ids.formulations);
  });
  intent.resources.materialAliquots.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'aliquot', `resources.materialAliquots.${index}.id`, ids.aliquots);
  });
  intent.resources.pipettes.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'pipette', `resources.pipettes.${index}.id`, ids.pipettes);
  });
  intent.resources.tips.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'tips', `resources.tips.${index}.id`, ids.tips);
  });
  intent.resources.waste.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'waste', `resources.waste.${index}.id`, ids.waste);
  });
  intent.operations.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'operation', `operations.${index}.id`, ids.operations);
  });
  intent.patterns.forEach((item, index) => {
    addId(ids, seen, findings, item.id, 'pattern', `patterns.${index}.id`, ids.patterns);
  });

  return ids;
}

function orientation(value: unknown): LabwareOrientation | undefined {
  return value === 'landscape' || value === 'portrait' || value === 'unknown'
    ? value
    : undefined;
}

function stringParam(params: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function numberParam(params: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validateLabwareRef(
  findings: ProtocolIntentValidationFinding[],
  ids: ProtocolIntentIdIndex,
  ref: string | undefined,
  path: string,
  context: string,
  required = true,
): void {
  if (!ref) {
    if (required) {
      findings.push(finding({
        severity: 'error',
        code: 'missing_labware_reference',
        message: `${context} has no labware reference.`,
        path,
      }));
    }
    return;
  }
  if (!ids.labware.has(ref)) {
    findings.push(finding({
      severity: 'error',
      code: 'dangling_labware_reference',
      message: `${context} references unknown labware '${ref}'.`,
      path,
      details: { ref },
    }));
  }
}

function validateMaterialRefs(
  findings: ProtocolIntentValidationFinding[],
  ids: ProtocolIntentIdIndex,
  op: ProtocolOperationIntent,
  path: string,
  context: string,
  required: boolean,
): void {
  if (!op.materialRef && !op.formulation) {
    if (required) {
      findings.push(finding({
        severity: 'error',
        code: 'missing_material_reference',
        message: `${context} has no material or formulation reference.`,
        path,
      }));
    }
    return;
  }
  if (op.materialRef && !ids.materials.has(op.materialRef)) {
    findings.push(finding({
      severity: 'error',
      code: 'dangling_material_reference',
      message: `${context} references unknown material '${op.materialRef}'.`,
      path: `${path}.materialRef`,
      details: { ref: op.materialRef },
    }));
  }
  if (op.formulation && !ids.formulations.has(op.formulation)) {
    findings.push(finding({
      severity: 'error',
      code: 'dangling_formulation_reference',
      message: `${context} references unknown formulation '${op.formulation}'.`,
      path: `${path}.formulation`,
      details: { ref: op.formulation },
    }));
  }
}

function validateOperation(
  findings: ProtocolIntentValidationFinding[],
  ids: ProtocolIntentIdIndex,
  op: ProtocolOperationIntent,
  index: number,
): void {
  const path = `operations.${index}`;
  const targetLabware = op.targetLabware ?? op.labware;
  const sourceLabware = op.sourceLabware ?? op.labware;
  const targetWells = op.targetWells ?? [];

  switch (op.kind) {
    case 'place_labware':
      validateLabwareRef(findings, ids, targetLabware, `${path}.labware`, 'place_labware');
      break;
    case 'load_material':
      validateLabwareRef(findings, ids, targetLabware, `${path}.labware`, 'load_material');
      validateMaterialRefs(findings, ids, op, path, 'load_material', true);
      if (targetWells.length === 0 && !op.sourceWell) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_target_wells',
          message: 'load_material has no target wells.',
          path: `${path}.targetWells`,
        }));
      }
      break;
    case 'reorient_labware': {
      validateLabwareRef(findings, ids, targetLabware ?? stringParam(op.params, ['labware', 'labwareInstanceId']), `${path}.labware`, 'reorient_labware');
      const targetOrientation = orientation(op.params?.orientation) ?? orientation(op.params?.to);
      if (!targetOrientation || targetOrientation === 'unknown') {
        findings.push(finding({
          severity: 'error',
          code: 'missing_orientation',
          message: 'reorient_labware has no concrete orientation.',
          path: `${path}.params.orientation`,
        }));
      }
      break;
    }
    case 'set_active_pipette':
    case 'swap_pipette':
      if (op.pipette && !ids.pipettes.has(op.pipette)) {
        findings.push(finding({
          severity: 'error',
          code: 'dangling_pipette_reference',
          message: `${op.kind} references unknown pipette '${op.pipette}'.`,
          path: `${path}.pipette`,
          details: { ref: op.pipette },
        }));
      }
      if (!op.pipette && !stringParam(op.params, ['pipetteType', 'to'])) {
        findings.push(finding({
          severity: 'warning',
          code: 'implicit_pipette_reference',
          message: `${op.kind} relies on an implicit pipette type.`,
          path,
          blocksLowering: false,
        }));
      }
      break;
    case 'replace_tips':
      if (op.tipResource && !ids.tips.has(op.tipResource)) {
        findings.push(finding({
          severity: 'error',
          code: 'dangling_tip_reference',
          message: `replace_tips references unknown tip resource '${op.tipResource}'.`,
          path: `${path}.tipResource`,
          details: { ref: op.tipResource },
        }));
      }
      break;
    case 'set_tip_spacing':
      if (op.spacingMm === undefined && numberParam(op.params, 'spacingMm') === undefined) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_tip_spacing',
          message: 'set_tip_spacing has no spacingMm.',
          path: `${path}.spacingMm`,
        }));
      }
      break;
    case 'aspirate':
      validateLabwareRef(findings, ids, sourceLabware, `${path}.sourceLabware`, 'aspirate');
      if (!op.sourceWell) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_source_well',
          message: 'aspirate has no source well.',
          path: `${path}.sourceWell`,
        }));
      }
      break;
    case 'dispense':
      validateLabwareRef(findings, ids, targetLabware, `${path}.targetLabware`, 'dispense');
      if (targetWells.length === 0) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_target_wells',
          message: 'dispense has no target wells.',
          path: `${path}.targetWells`,
        }));
      }
      break;
    case 'transfer':
      validateLabwareRef(findings, ids, targetLabware, `${path}.targetLabware`, 'transfer');
      validateLabwareRef(findings, ids, op.sourceLabware, `${path}.sourceLabware`, 'transfer source', false);
      validateMaterialRefs(findings, ids, op, path, 'transfer', false);
      if (targetWells.length === 0) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_target_wells',
          message: 'transfer has no target wells.',
          path: `${path}.targetWells`,
        }));
      }
      break;
    case 'media_swap':
      validateLabwareRef(findings, ids, targetLabware, `${path}.targetLabware`, 'media_swap');
      if (op.waste && !ids.waste.has(op.waste)) {
        findings.push(finding({
          severity: 'error',
          code: 'dangling_waste_reference',
          message: `media_swap references unknown waste '${op.waste}'.`,
          path: `${path}.waste`,
          details: { ref: op.waste },
        }));
      }
      break;
    case 'pipette_mix':
      validateLabwareRef(findings, ids, targetLabware, `${path}.labware`, 'pipette_mix');
      if (targetWells.length === 0 && !op.sourceWell) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_target_wells',
          message: 'pipette_mix has no target wells.',
          path: `${path}.targetWells`,
        }));
      }
      break;
    case 'incubate':
      validateLabwareRef(findings, ids, targetLabware, `${path}.labware`, 'incubate');
      break;
    case 'eject_tips':
    case 'unknown':
      break;
    default:
      break;
  }
}

function validatePattern(
  findings: ProtocolIntentValidationFinding[],
  ids: ProtocolIntentIdIndex,
  pattern: ProtocolPatternIntent,
  index: number,
): void {
  const path = `patterns.${index}`;
  if (pattern.sourceLabware) {
    validateLabwareRef(findings, ids, pattern.sourceLabware, `${path}.sourceLabware`, `${pattern.kind} source`, false);
  }
  if (pattern.targetLabware) {
    validateLabwareRef(findings, ids, pattern.targetLabware, `${path}.targetLabware`, `${pattern.kind} target`, false);
  }

  switch (pattern.kind) {
    case 'source_wells_to_duplicate_target_columns':
    case 'media_swap_duplicate_columns':
      validateLabwareRef(findings, ids, pattern.sourceLabware, `${path}.sourceLabware`, pattern.kind);
      validateLabwareRef(findings, ids, pattern.targetLabware, `${path}.targetLabware`, pattern.kind);
      if (!pattern.sourceWells || pattern.sourceWells.length === 0) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_pattern_source_wells',
          message: `${pattern.kind} has no source wells.`,
          path: `${path}.sourceWells`,
        }));
      }
      if (!pattern.targetColumnPairs || pattern.targetColumnPairs.length === 0) {
        findings.push(finding({
          severity: 'error',
          code: 'missing_pattern_target_columns',
          message: `${pattern.kind} has no target column pairs.`,
          path: `${path}.targetColumnPairs`,
        }));
      }
      break;
    case 'serial_dilution':
      validateLabwareRef(findings, ids, pattern.targetLabware, `${path}.targetLabware`, 'serial_dilution');
      break;
    case 'repeat_rows':
      validateLabwareRef(findings, ids, pattern.sourceLabware, `${path}.sourceLabware`, 'repeat_rows');
      validateLabwareRef(findings, ids, pattern.targetLabware, `${path}.targetLabware`, 'repeat_rows');
      break;
    case 'reservoir_loading_table':
    case 'serial_dilution_setup':
      findings.push(finding({
        severity: 'warning',
        code: 'protocol_intent_pattern_not_event_lowered',
        message: `${pattern.kind} is state/planning metadata and is not directly event-lowered.`,
        path,
        blocksLowering: false,
      }));
      break;
    case 'unknown':
      findings.push(finding({
        severity: 'warning',
        code: 'unknown_protocol_intent_pattern',
        message: 'Unknown ProtocolIntent pattern will not be event-lowered.',
        path,
        blocksLowering: false,
      }));
      break;
    default:
      break;
  }
}

export function validateProtocolIntent(intent: ProtocolIntent): ProtocolIntentValidationOutput {
  const findings: ProtocolIntentValidationFinding[] = [];
  const ids = indexIds(intent, findings);

  intent.unresolved.forEach((fact, index) => {
    findings.push(finding({
      severity: fact.blocksLowering ? 'error' : 'warning',
      code: `unresolved_${fact.kind}`,
      message: fact.reason,
      path: `unresolved.${index}`,
      blocksLowering: fact.blocksLowering ?? false,
      details: { id: fact.id, label: fact.label },
    }));
  });

  intent.resources.materialAliquots.forEach((aliquot, index) => {
    validateLabwareRef(findings, ids, aliquot.labware, `resources.materialAliquots.${index}.labware`, 'material aliquot');
    if (aliquot.materialRef && !ids.materials.has(aliquot.materialRef)) {
      findings.push(finding({
        severity: 'error',
        code: 'dangling_material_reference',
        message: `material aliquot references unknown material '${aliquot.materialRef}'.`,
        path: `resources.materialAliquots.${index}.materialRef`,
        details: { ref: aliquot.materialRef },
      }));
    }
    if (aliquot.formulation && !ids.formulations.has(aliquot.formulation)) {
      findings.push(finding({
        severity: 'error',
        code: 'dangling_formulation_reference',
        message: `material aliquot references unknown formulation '${aliquot.formulation}'.`,
        path: `resources.materialAliquots.${index}.formulation`,
        details: { ref: aliquot.formulation },
      }));
    }
    if (!aliquot.materialRef && !aliquot.formulation) {
      findings.push(finding({
        severity: 'error',
        code: 'missing_material_reference',
        message: 'material aliquot has no material or formulation reference.',
        path: `resources.materialAliquots.${index}`,
      }));
    }
    if (!aliquot.well && (!aliquot.wells || aliquot.wells.length === 0)) {
      findings.push(finding({
        severity: 'error',
        code: 'missing_target_wells',
        message: 'material aliquot has no well.',
        path: `resources.materialAliquots.${index}.well`,
      }));
    }
  });

  intent.operations.forEach((op, index) => validateOperation(findings, ids, op, index));
  intent.patterns.forEach((pattern, index) => validatePattern(findings, ids, pattern, index));

  const blockers = findings.filter((item) => item.blocksLowering);
  return {
    status: blockers.length > 0 ? 'blocked' : 'ready',
    findings,
    blockers,
  };
}

export function createValidateProtocolIntentPass(): Pass {
  return {
    id: 'validate_protocol_intent',
    family: 'validate' as const,
    run({ state }): PassResult {
      const intent = (
        state.outputs.get('ai_precompile') as { protocolIntent?: ProtocolIntent } | undefined
      )?.protocolIntent;
      if (!intent) {
        return {
          ok: true,
          output: { status: 'ready', findings: [], blockers: [] } satisfies ProtocolIntentValidationOutput,
        };
      }

      const output = validateProtocolIntent(intent);
      const diagnostics: PassDiagnostic[] = output.findings.map((item) => ({
        severity: item.severity,
        code: item.code,
        message: item.message,
        pass_id: 'validate_protocol_intent',
        details: compact<Record<string, unknown>>({
          path: item.path,
          blocksLowering: item.blocksLowering,
          ...item.details,
        }),
      }));

      return {
        ok: true,
        output,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
        ...(output.status === 'blocked' ? { outcome: 'needs-missing-fact' as const } : {}),
      };
    },
  };
}
