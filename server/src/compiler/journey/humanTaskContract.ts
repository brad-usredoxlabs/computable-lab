/**
 * L2-JOURNEY-HUMANTASK-1 (unit htcschema): the human-task contract gate.
 * A human_in_the_loop step is DECLARED, not implied: the contract states the
 * decision, the surface, the controls and the receipt (human-task.schema.yaml
 * owns the closed SHAPE; this module owns the AGREEMENT between the contract
 * and the work-surface registry — the registry, never this module, is the
 * authority for what a surface can select). Called by lintJourneyDocument
 * AFTER the schema gate (which proves the contract's shape) and after the
 * capability-membership loop, so it reads only shaped fields — the same trust
 * as every other semantic rule in the pass. Diagnostics name the step id, the
 * surface id and the offending kind verbatim. The completion-receipt path and
 * the role refusal are later humantask units; nothing here consumes a receipt.
 */
import type { SurfacesRegistry } from '../../surfaces/surfaces.js';
export const RULE_HUMAN_TASK_MISSING = 'journey_human_task_missing';
export const RULE_HUMAN_TASK_UNEXPECTED = 'journey_human_task_unexpected';
export const RULE_HUMAN_TASK_SURFACE_UNKNOWN = 'journey_human_task_surface_unknown';
export const RULE_HUMAN_TASK_KIND_NOT_SELECTABLE = 'journey_human_task_kind_not_selectable';
export interface HumanTaskContractDiagnostic {
  rule: string;
  message: string;
  step_id: string;
}
/** The shaped view of a document step once the schema gate has proved it: the
 * optional contract is ABSENT (never undefined), and the schema's required
 * list guarantees surface and selectable_kinds exist when it is present. */
export interface HumanTaskContractStep {
  id: string;
  interaction_mode: 'automatic' | 'human_in_the_loop';
  human_task?: { surface: string; selectable_kinds: string[] };
}
/**
 * One step against the registry. (a) human_in_the_loop without a contract is
 * journey_human_task_missing; (b) automatic WITH a contract is
 * journey_human_task_unexpected; (c) a contract whose surface the registry
 * does not declare is journey_human_task_surface_unknown; (d) any
 * selectable_kinds entry outside that surface's registry selectableKinds is
 * journey_human_task_kind_not_selectable — one diagnostic per offending kind.
 * The first two are mode/contract agreement and return immediately; the
 * latter two need the registry and stop as soon as the surface is unknown.
 */
export function validateHumanTaskContract(step: HumanTaskContractStep, surfaces: SurfacesRegistry): HumanTaskContractDiagnostic[] {
  const diagnostics: HumanTaskContractDiagnostic[] = [];
  const hasContract = step.human_task !== undefined;
  if (step.interaction_mode === 'human_in_the_loop') {
    if (!hasContract) {
      diagnostics.push({
        rule: RULE_HUMAN_TASK_MISSING,
        step_id: step.id,
        message: `step ${step.id} is human_in_the_loop but declares no human_task contract: a human step must declare the decision, the surface and the controls it awaits`,
      });
      return diagnostics;
    }
  } else if (hasContract) {
    diagnostics.push({
      rule: RULE_HUMAN_TASK_UNEXPECTED,
      step_id: step.id,
      message: `step ${step.id} is automatic but declares a human_task contract: automatic steps are completed by the compiler, never by a person`,
    });
    return diagnostics;
  } else {
    return diagnostics; // automatic and contract-free: nothing to gate
  }
  const task = step.human_task!;
  const surface = surfaces.get(task.surface);
  if (surface === null) {
    diagnostics.push({
      rule: RULE_HUMAN_TASK_SURFACE_UNKNOWN,
      step_id: step.id,
      message: `step ${step.id} human_task declares surface '${task.surface}', which the work-surface registry does not declare`,
    });
    return diagnostics; // the kind check needs the surface's selectableKinds
  }
  for (const kind of task.selectable_kinds) {
    if (!surface.selectableKinds.includes(kind)) {
      diagnostics.push({
        rule: RULE_HUMAN_TASK_KIND_NOT_SELECTABLE,
        step_id: step.id,
        message: `step ${step.id} human_task offers selectable kind '${kind}' on surface '${task.surface}', which that surface does not permit (registry selectableKinds: ${surface.selectableKinds.join(', ') || 'none'})`,
      });
    }
  }
  return diagnostics;
}
