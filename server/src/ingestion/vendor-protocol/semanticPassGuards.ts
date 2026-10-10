/**
 * W2-6-SEMANTIC-PASS — the three hard invariants as PURE guards (spec §2.2/§3-W2).
 *
 * This is the ONLY place the guard logic lives. It imports the proven axis
 * machinery (deriveBranchAxes / deriveStepVariantAxes) and NOTHING from the
 * legacy filtered drafting route. Every guard is machine-readable-coded:
 *
 *  - SEMANTIC_PASS_ANCHOR_UNRESOLVED: a model-claimed provenance ref that does
 *    not resolve against the SAID candidate is DROPPED (never rewritten onto a
 *    different anchor, never kept); the intent stands unanchored and an
 *    ambiguity_span records the drop. Per the merged StepProvenanceRef shape
 *    (protocol.schema.yaml $defs/StepProvenanceRef, W2-5 widened: required
 *    [kind, type, id, pageStart], additionalProperties:false) the ref field is
 *    `id` = the SAID candidate record's OWN recordId — resolution is
 *    ref.id === candidateRecordId, pageStart in [1, source.pageCount], and a
 *    sectionId must name an existing candidate section id.
 *  - SEMANTIC_PASS_STEP_COVERAGE: every candidate step id must be accounted
 *    for in the draft (present as an intent step OR named in a deterministic
 *    axis's then_stepIds). A silently-partial family is the anti-D4 failure.
 *  - SEMANTIC_PASS_AXES_DISCARDED: any model-emitted top-level key other than
 *    'steps' (branch_axes, questions, step-filter keys — any of them) is
 *    stripped BEFORE validation, deterministically, with the strip recorded
 *    as an ambiguity_span. The family axes come from
 *    deriveBranchAxes(candidate.steps) + deriveStepVariantAxes(candidate.steps,
 *    candidate.sections) bound verbatim — their refusal rules are the family's
 *    rules; the pass adds none and asks nothing.
 */

import { deriveBranchAxes } from './deriveBranchAxes.js';
import { deriveStepVariantAxes } from './deriveStepVariantAxes.js';

export const SEMANTIC_PASS_ANCHOR_UNRESOLVED = 'SEMANTIC_PASS_ANCHOR_UNRESOLVED';
export const SEMANTIC_PASS_STEP_COVERAGE = 'SEMANTIC_PASS_STEP_COVERAGE';
export const SEMANTIC_PASS_AXES_DISCARDED = 'SEMANTIC_PASS_AXES_DISCARDED';

/** The ONLY top-level key a model answer may carry; everything else the model
 *  smuggles in (branch_axes, questions, step-filter keys — any of them) is
 *  stripped generically. Naming the legacy filter concept is not needed to
 *  kill it: the answer contract is `{steps}` and nothing else (D4). */
const ALLOWED_ANSWER_KEYS = new Set(['steps']);

export interface GuardSpan {
  path: string;
  reason: string;
  detail?: string;
}

export interface CandidateShape {
  source: { documentId: string; pageCount: number };
  sections: Array<{ id: string }>;
  steps: Array<{ id: string; branches?: unknown }>;
}

export interface DraftStepShape {
  stepId?: unknown;
  intent?: { provenance?: unknown };
  [key: string]: unknown;
}

export interface DraftShape {
  steps: DraftStepShape[];
  [key: string]: unknown;
}

export interface AnchorResolutionResult {
  /** The draft with unresolvable refs DROPPED (mutated copy, not the input). */
  draft: DraftShape;
  spans: GuardSpan[];
}

export interface CoverageResult {
  ok: boolean;
  missingStepIds: string[];
}

export interface AxesBindingResult {
  draft: DraftShape;
  /** The deterministic family axes bound onto the draft. */
  axes: unknown[];
  spans: GuardSpan[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// 1. Anchor resolution (drop-not-rewrite)
// ---------------------------------------------------------------------------

/**
 * Resolve every intent-step provenance ref against the SAID candidate.
 * A ref resolves iff ALL of:
 *   ref.kind === 'record', ref.type === 'vendor-protocol-candidate',
 *   ref.id === the candidate record's own recordId (merged StepProvenanceRef:
 *   the field is `id`, NOT a documentId),
 *   ref.pageStart is an integer in [1, candidate.source.pageCount],
 *   when a sectionId is present it names an existing candidate section id.
 * An unresolvable ref is REMOVED from the array (the ONE allowed mutation of
 * model output — it only ever removes a claim of vendor support, never adds
 * one) and the drop is recorded as an ambiguity_span so the intent stands
 * explicitly unanchored. An emptied provenance array is removed entirely so
 * the payload carries the absence as data.
 */
export function resolveAnchorRefs(
  draft: DraftShape,
  candidate: CandidateShape,
  candidateRecordId: string,
): AnchorResolutionResult {
  const sectionIds = new Set(candidate.sections.map((s) => s.id));
  const pageCount = candidate.source.pageCount;
  const spans: GuardSpan[] = [];
  const out: DraftShape = { ...draft, steps: draft.steps.map((step) => ({ ...step })) };

  out.steps.forEach((step, stepIndex) => {
    const intent = step.intent;
    if (!isRecord(intent)) return;
    const refs = intent.provenance;
    if (!Array.isArray(refs) || refs.length === 0) return;

    const kept: unknown[] = [];
    refs.forEach((ref, refIndex) => {
      const reason = refUnresolvedReason(ref, candidateRecordId, pageCount, sectionIds);
      if (reason === null) {
        kept.push(ref);
        return;
      }
      spans.push({
        path: `steps[${stepIndex}].intent.provenance[${refIndex}]`,
        reason: SEMANTIC_PASS_ANCHOR_UNRESOLVED,
        detail: reason,
      });
    });

    if (kept.length > 0) {
      intent.provenance = kept;
    } else {
      delete intent.provenance;
    }
  });

  return { draft: out, spans };
}

function refUnresolvedReason(
  ref: unknown,
  candidateRecordId: string,
  pageCount: number,
  sectionIds: Set<string>,
): string | null {
  if (!isRecord(ref)) return 'ref is not an object';
  if (ref.kind !== 'record') return `ref.kind must be 'record', got ${JSON.stringify(ref.kind)}`;
  if (ref.type !== 'vendor-protocol-candidate') {
    return `ref.type must be 'vendor-protocol-candidate', got ${JSON.stringify(ref.type)}`;
  }
  if (ref.id !== candidateRecordId) {
    return `ref.id must be the candidate record's own id (${candidateRecordId}), got ${JSON.stringify(ref.id)}`;
  }
  if (typeof ref.pageStart !== 'number' || !Number.isInteger(ref.pageStart) || ref.pageStart < 1 || ref.pageStart > pageCount) {
    return `ref.pageStart must be an integer in [1, ${pageCount}], got ${JSON.stringify(ref.pageStart)}`;
  }
  if (ref.sectionId !== undefined && (typeof ref.sectionId !== 'string' || !sectionIds.has(ref.sectionId))) {
    return `ref.sectionId must name an existing candidate section id, got ${JSON.stringify(ref.sectionId)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Step coverage ('deletes nothing')
// ---------------------------------------------------------------------------

/**
 * Every candidate step id must be accounted for in the draft: present as an
 * intent step's stepId OR named in a deterministic axis's then_stepIds.
 * Returns the missing ids; the caller decides the disposition (OQ2 ruling:
 * refuse the pass with zero writes).
 */
export function assertStepCoverage(
  draft: DraftShape,
  candidate: CandidateShape,
  axes: Array<{ conditions?: Array<{ then_stepIds?: string[] }> }>,
): CoverageResult {
  const accounted = new Set<string>();
  for (const step of draft.steps) {
    if (typeof step.stepId === 'string') accounted.add(step.stepId);
  }
  for (const axis of axes) {
    for (const condition of axis.conditions ?? []) {
      for (const id of condition.then_stepIds ?? []) accounted.add(id);
    }
  }
  const missingStepIds = candidate.steps
    .map((s) => s.id)
    .filter((id) => !accounted.has(id));
  return { ok: missingStepIds.length === 0, missingStepIds };
}

// ---------------------------------------------------------------------------
// 3. Deterministic axis binding (model axes DISCARDED)
// ---------------------------------------------------------------------------

/**
 * Strip any model-emitted top-level key other than 'steps' from the answer
 * (deterministically, BEFORE validation), record each strip as an
 * ambiguity_span, then bind the family axes = deriveBranchAxes(steps) +
 * deriveStepVariantAxes(steps, sections) verbatim. The pass adds no axis rules
 * of its own and asks nothing — questions move downstream (D4).
 */
export function bindFamilyAxes(draft: DraftShape, candidate: CandidateShape): AxesBindingResult {
  const out: DraftShape = { ...draft };
  const spans: GuardSpan[] = [];

  for (const key of Object.keys(out)) {
    if (ALLOWED_ANSWER_KEYS.has(key)) continue;
    delete out[key];
    spans.push({
      path: `$.${key}`,
      reason: SEMANTIC_PASS_AXES_DISCARDED,
      detail: `model-emitted '${key}' stripped; the answer may carry only 'steps' — family axes are derived server-side`,
    });
  }

  const axes = [
    ...deriveBranchAxes(candidate.steps),
    ...deriveStepVariantAxes(candidate.steps, candidate.sections),
  ];
  if (axes.length > 0) out.branch_axes = axes;
  else delete out.branch_axes;

  return { draft: out, axes, spans };
}
