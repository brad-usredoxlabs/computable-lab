/**
 * L2-JOURNEY-HUMANTASK-1 (unit htcreceipt): decide whether a declared human
 * task is COMPLETE from the committed record alone. A commit is the ONLY
 * completion signal — a surface visit (no candidate) and a staged draft
 * (candidate with no committed record) are DISTINCT named refusals that can
 * never collapse into a receipt. A committed record that is ALSO listed in
 * `staged_draft_ids` is still committed: the commit supersedes the draft.
 *
 * Pure: no I/O, no globals, no clock read — `completed_at` comes from the
 * injected ISO `now`. `selectable_kinds` and `completion.kind` are read from
 * the unit-1 contract object (narrowed locally as `unknown`; the shipped
 * HumanTaskContractStep at humanTaskContract.ts:27-31 is narrower than
 * human-task.schema.yaml, so this narrows rather than widening unit 1's type).
 * This unit decides only the `versioned_selection` half of the two-value
 * completion enum; a governed_write task receives
 * journey_human_task_completion_kind_unsupported, never a selection receipt.
 * The receipt shape is schema/workflow/human-task-receipt.schema.yaml.
 */
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

export const RULE_HUMAN_TASK_NO_SELECTION = 'journey_human_task_no_selection';
export const RULE_HUMAN_TASK_NOT_COMMITTED = 'journey_human_task_not_committed';
export const RULE_HUMAN_TASK_KIND_MISMATCH = 'journey_human_task_kind_mismatch';
export const RULE_HUMAN_TASK_MEMBER_UNVERSIONED = 'journey_human_task_member_unversioned';
export const RULE_HUMAN_TASK_COMPLETION_KIND_UNSUPPORTED = 'journey_human_task_completion_kind_unsupported';
/** The receipt document kind — mirrors the schema's const. */
export const RECEIPT_KIND = 'human-task-receipt';

export interface HumanTaskCompletionDiagnostic {
  rule: string;
  message: string;
  task_id: string;
}
export interface HumanTaskReceiptMemberRef {
  record_id: string;
  revision_id: string;
}
export interface HumanTaskReceipt {
  kind: 'human-task-receipt';
  task_id: string;
  record_id: string;
  member_refs: HumanTaskReceiptMemberRef[];
  completed_at: string;
  schema_id: string;
}
export interface HumanTaskCompletionInput {
  task_id: string;
  /** The unit-1 human_task contract, narrowed locally (see module docstring). */
  contract: unknown;
  /** What the surface believes is selected; ABSENT on a mere visit. */
  candidate?: { record_id: string };
  /** The committed record envelope (shipped RecordEnvelope spelling); absent = nothing committed. */
  committed_record?: RecordEnvelope<unknown>;
  /** Draft ids the surface knows about; a committed id listed here is superseded, not pending. */
  staged_draft_ids: string[];
  /** Injected ISO clock — the module must never read Date.now(). */
  now: string;
}
export type HumanTaskCompletionResult =
  | { ok: true; receipt: HumanTaskReceipt }
  | { ok: false; diagnostics: HumanTaskCompletionDiagnostic[] };

/** Refusal builders keep the one-diagnostic-per-refusal shape obvious. */
function refuse(rule: string, taskId: string, message: string): HumanTaskCompletionResult {
  return { ok: false, diagnostics: [{ rule, task_id: taskId, message }] };
}

/**
 * Fixed decision order (each refusal returns exactly ONE diagnostic):
 * unsupported completion kind -> no candidate -> candidate not committed ->
 * member kind not selectable -> member without a pinned revision -> receipt.
 */
export function decideHumanTaskCompletion(input: HumanTaskCompletionInput): HumanTaskCompletionResult {
  const task = input.contract as {
    selectable_kinds?: unknown;
    completion?: { kind?: unknown };
  } | null | undefined;
  const kind = task?.completion?.kind;
  if (kind !== 'versioned_selection') {
    return refuse(
      RULE_HUMAN_TASK_COMPLETION_KIND_UNSUPPORTED,
      input.task_id,
      `task ${input.task_id} declares completion kind '${String(kind)}'; only 'versioned_selection' has a completion decision here — a governed_write task must not silently receive a selection receipt`,
    );
  }
  if (input.candidate === undefined) {
    return refuse(
      RULE_HUMAN_TASK_NO_SELECTION,
      input.task_id,
      `task ${input.task_id} has no selection at all: visiting the surface is not completing the task`,
    );
  }
  const record = input.committed_record;
  if (record === undefined) {
    // Drafted (input.staged_draft_ids) and/or merely visited — neither is a commit.
    return refuse(
      RULE_HUMAN_TASK_NOT_COMMITTED,
      input.task_id,
      `task ${input.task_id} has candidate '${input.candidate.record_id}' but no committed record: a staged draft is not a completion`,
    );
  }
  const members = (record.payload as { members?: unknown }).members;
  const selectableKinds = (task?.selectable_kinds ?? []) as string[];
  const memberRefs: HumanTaskReceiptMemberRef[] = [];
  for (const member of Array.isArray(members) ? members : []) {
    const m = member as { kind?: unknown; type?: unknown; id?: unknown; revisionRef?: { id?: unknown } };
    if (m.kind === 'record' && typeof m.type === 'string' && !selectableKinds.includes(m.type)) {
      return refuse(
        RULE_HUMAN_TASK_KIND_MISMATCH,
        input.task_id,
        `task ${input.task_id} committed member '${String(m.id)}' has kind '${m.type}', which the contract's selectable_kinds (${selectableKinds.join(', ') || 'none'}) does not offer`,
      );
    }
    const revision = m.revisionRef?.id;
    if (typeof revision !== 'string' || revision.length === 0) {
      return refuse(
        RULE_HUMAN_TASK_MEMBER_UNVERSIONED,
        input.task_id,
        `task ${input.task_id} committed member '${String(m.id)}' carries no pinned revisionRef: an unversioned selection cannot complete a versioned_selection task`,
      );
    }
    memberRefs.push({ record_id: String(m.id), revision_id: revision });
  }
  if (memberRefs.length === 0) {
    return refuse(
      RULE_HUMAN_TASK_MEMBER_UNVERSIONED,
      input.task_id,
      `task ${input.task_id} committed record '${record.recordId}' has no versioned members: a completion needs at least one pinned selection`,
    );
  }
  return {
    ok: true,
    receipt: {
      kind: RECEIPT_KIND as 'human-task-receipt',
      task_id: input.task_id,
      record_id: record.recordId,
      member_refs: memberRefs, // IN MEMBER ORDER — never sorted
      completed_at: input.now,
      schema_id: record.schemaId,
    },
  };
}
