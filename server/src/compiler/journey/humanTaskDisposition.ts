/**
 * L2-JOURNEY-HUMANTASK-1 (unit htcdispose3): apply a human task's DECLARED
 * `on_cancel` / `on_defer` lifecycle as ONE pure decision. The result is the
 * task's resulting status plus whether the journey continues; the enum is the
 * ONLY source of that boolean, so nothing is ever defaulted.
 *
 * Two dispositions exist and no third does. Both the disposition -> status map
 * and the disposition -> contract key map are `Record<'cancel' | 'defer', ...>`,
 * so declaring a third disposition is a COMPILE error here, not a silent
 * fall-through at the call site. The status vocabulary is exactly
 * `cancelled` / `deferred` — completion is unit 2's (`HumanTaskReceipt`), and
 * this module neither constructs a receipt nor adds a journey-status member.
 *
 * Purity is the proof of "no partial record": no fs, no store, no clock read,
 * no uuid. A committed `receipt` is the anti-partial-record input — an already
 * completed task is REFUSED rather than re-disposed, so a cancel/defer can
 * never straddle a completion.
 *
 * The contract object is narrowed locally as `unknown` (same idiom as unit 2's
 * humanTaskCompletion.ts docstring): the shipped HumanTaskContractStep type is
 * narrower than human-task.schema.yaml.
 */
import type { HumanTaskReceipt } from './humanTaskCompletion.js';

export const RULE_HUMAN_TASK_DISPOSITION_AFTER_COMPLETION = 'journey_human_task_disposition_after_completion';
export const RULE_HUMAN_TASK_DISPOSITION_UNDECLARED = 'journey_human_task_disposition_undeclared';

/** The closed disposition set — unit 1 declares exactly these two lifecycles. */
export const DECLARED_JOURNEY_DISPOSITIONS = ['cancel', 'defer'] as const;
export type HumanTaskDisposition = (typeof DECLARED_JOURNEY_DISPOSITIONS)[number];

/** The declared enum values of on_cancel / on_defer (human-task.schema.yaml). */
const KEEP_ACTIVE = 'keep_journey_active';
const END_JOURNEY = 'end_journey';

/** Exhaustive over the disposition union: a third member breaks this line. */
const STATUS_BY_DISPOSITION: Record<HumanTaskDisposition, 'cancelled' | 'deferred'> = {
  cancel: 'cancelled',
  defer: 'deferred',
};
const KEY_BY_DISPOSITION: Record<HumanTaskDisposition, 'on_cancel' | 'on_defer'> = {
  cancel: 'on_cancel',
  defer: 'on_defer',
};
/** Exhaustive over the declared enum: an undeclared value cannot be mapped. */
const CONTINUES_BY_DECLARED: Record<typeof KEEP_ACTIVE | typeof END_JOURNEY, boolean> = {
  [KEEP_ACTIVE]: true,
  [END_JOURNEY]: false,
};

export interface HumanTaskDispositionDiagnostic {
  rule: string;
  task_id: string;
  message: string;
}
export type HumanTaskDispositionResult =
  | { ok: true; task_status: 'cancelled' | 'deferred'; journey_continues: boolean }
  | { ok: false; diagnostics: HumanTaskDispositionDiagnostic[] };

export interface HumanTaskDispositionInput {
  task_id: string;
  disposition: HumanTaskDisposition;
  /** The unit-1 human_task contract, narrowed locally (see module docstring). */
  contract: unknown;
  /** A committed completion receipt; its presence means the task is already done. */
  receipt?: HumanTaskReceipt;
}

function refuse(rule: string, taskId: string, message: string): HumanTaskDispositionResult {
  return { ok: false, diagnostics: [{ rule, task_id: taskId, message }] };
}

function isDeclaredDisposition(value: unknown): value is HumanTaskDisposition {
  return typeof value === 'string' && (DECLARED_JOURNEY_DISPOSITIONS as readonly string[]).includes(value);
}

/**
 * Decision order (each refusal returns exactly ONE diagnostic):
 * completion receipt present -> undeclared disposition -> undeclared
 * contract lifecycle value -> status + continuation.
 */
export function decideHumanTaskDisposition(input: HumanTaskDispositionInput): HumanTaskDispositionResult {
  if (input.receipt !== undefined) {
    return refuse(
      RULE_HUMAN_TASK_DISPOSITION_AFTER_COMPLETION,
      input.task_id,
      `task ${input.task_id} already carries completion receipt '${input.receipt.record_id}': cancelling or deferring a completed task would leave a partial record`,
    );
  }
  if (!isDeclaredDisposition(input.disposition)) {
    return refuse(
      RULE_HUMAN_TASK_DISPOSITION_UNDECLARED,
      input.task_id,
      `task ${input.task_id} asked for disposition '${String(input.disposition)}', which the contract does not declare; the only declared dispositions are ${DECLARED_JOURNEY_DISPOSITIONS.join(', ')}`,
    );
  }
  const task = input.contract as { on_cancel?: unknown; on_defer?: unknown } | null | undefined;
  const key = KEY_BY_DISPOSITION[input.disposition];
  const declared = task?.[key];
  if (declared !== KEEP_ACTIVE && declared !== END_JOURNEY) {
    return refuse(
      RULE_HUMAN_TASK_DISPOSITION_UNDECLARED,
      input.task_id,
      `task ${input.task_id} declares no usable '${key}' (found '${String(declared)}'): the continuation of the journey must be declared, never defaulted`,
    );
  }
  return {
    ok: true,
    task_status: STATUS_BY_DISPOSITION[input.disposition],
    journey_continues: CONTINUES_BY_DECLARED[declared],
  };
}
