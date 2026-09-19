/**
 * deriveBranchAxes — lift vendor protocol step `branches[]` into schema-valid
 * `branch_axes` (Task 3, ingestion-side templating of if/then/else).
 *
 * The vendor extractor already captures each step's conditional lettered
 * branches (a./b./c.) as `step.branches: string[]` (VendorProtocolPdf
 * extractBranches) — but today they are dropped at protocol build and only
 * surfaced as a review gap ('zymo_branch_selection_required'). This pure
 * function converts every branchy step (>= 2 distinct branches) into a
 * `BranchAxis` whose conditions reuse the PredicateEvaluator vocabulary, so
 * the branches become executable step selection instead of a label.
 *
 * Semantics (deterministic):
 *   - the CONDITION PHRASE is the option identity (parseBranchOption): the
 *     lettered marker and the "if using …" boilerplate are stripped, and the
 *     phrase before the first top-level comma/semicolon is the subject. The
 *     full sentence is kept as the human-readable `label`;
 *   - steps that ask the SAME question (identical option-key sets) become ONE
 *     axis whose conditions gate every one of those steps — the biologist
 *     answers "which lysis module?" once, not once per step (Phase 3,
 *     plan 2026-09-19_121028). Real case: ZymoBIOMICS 96 kit steps 1 and 4;
 *   - a step whose option set is unique to it keeps a per-step axis
 *     (`branch-axis-<stepId>`), so single-step documents are unchanged;
 *   - the predicate matches the neutral localization choice key
 *     `$.branchSelection` against the option key. The localizer/UI presents
 *     `condition.label` (the real branch text) and binds `branchSelection` to
 *     the corresponding key; BranchResolver evaluates it.
 */

import type { BranchAxisLike } from '../../protocol/BranchResolver.js';

export interface VendorStepBranchesLike {
  stepId?: unknown;
  stepNumber?: unknown;
  branches?: unknown;
}

export interface ParsedBranchOption {
  /** The lettered marker when present ('a' | 'b' | …), else null. */
  letter: string | null;
  /** The CONDITION phrase — what selects this branch. */
  subject: string;
  /** The instruction that follows the condition, when the text has one. */
  action: string | null;
  /** slug(subject) — the localization choice key / predicate value. */
  key: string;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
}

/** Stable slug: 'Bacterial DNA' -> 'bacterial-dna'. Falls back to 'branch'. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'branch';
}

/** 'a.' / 'b)' / 'c:' / 'd -' — a lettered branch marker. */
const LETTER_MARKER = /^\(?([a-zA-Z])\)?\s*[.):\u2013-]\s+/;
/** 'if using' / 'if the' / 'when using' — conditional boilerplate before the subject. */
const CONDITIONAL_PREFIX = /^(?:if|when)\s+(?:using\s+|the\s+|a\s+|an\s+)?/i;

/** First comma/semicolon at parenthesis depth 0, or -1. */
function firstTopLevelSeparator(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if ((ch === ',' || ch === ';') && depth === 0) return i;
  }
  return -1;
}

/**
 * Split one vendor branch sentence into its condition and its action.
 * Pure; the caller keeps the raw sentence for display.
 */
export function parseBranchOption(raw: string): ParsedBranchOption {
  const text = raw.trim();
  const markerMatch = text.match(LETTER_MARKER);
  const letter = markerMatch ? markerMatch[1]!.toLowerCase() : null;
  let rest = markerMatch ? text.slice(markerMatch[0].length) : text;
  rest = rest.replace(CONDITIONAL_PREFIX, '');

  const cut = firstTopLevelSeparator(rest);
  const subjectRaw = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
  const subject = (subjectRaw.length > 0 ? subjectRaw : rest).trim();
  const action = cut >= 0 ? rest.slice(cut + 1).trim() : null;
  return { letter, subject, action, key: slugify(subject) };
}

/** Stable short hash (djb2) so long option sets still yield a readable id. */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * The option's CONCEPT key: the subject slug with parenthesised qualifiers
 * removed ("ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7)" ->
 * "zymobiomics-bashingbead-lysis-rack").
 *
 * Real documents re-state the same option with and without its catalogue
 * number across steps (ZymoBIOMICS 96 kit: step 1 says "(0.1 & 0.5 mm,
 * D6002-96-7)", step 4 says "(0.1 & 0.5 mm)"). Comparing concept keys is what
 * lets the two steps be recognised as ONE question. When a parenthesised
 * qualifier is the ONLY difference between two options in the same step, that
 * step falls back to full keys (see keySetCollides) so the options stay
 * distinct.
 */
export function conceptKey(subject: string): string {
  return slugify(subject.replace(/\s*\([^)]*\)/g, ' '));
}

const MAX_AXIS_ID_CORE = 72;

/**
 * Axis id for a question shared by several steps: derived from the option keys,
 * never from a step id (the question outlives any one step; the id must stay
 * stable when the document re-numbers its steps).
 */
function sharedAxisId(optionKeys: string[]): string {
  const core = slugify(optionKeys.join('-'));
  if (core.length <= MAX_AXIS_ID_CORE) return `branch-axis-${core}`;
  return `branch-axis-${optionKeys[0]!.slice(0, MAX_AXIS_ID_CORE - 10)}-${shortHash(core)}`;
}

function stepIdOf(step: VendorStepBranchesLike, index: number): string {
  if (typeof step.stepId === 'string' && step.stepId.trim().length > 0) return step.stepId.trim();
  if (typeof step.stepNumber === 'number') return `step-${String(step.stepNumber).padStart(3, '0')}`;
  return `step-${String(index + 1).padStart(3, '0')}`;
}

interface BranchyStep {
  stepId: string;
  /** Raw sentences, deduped by option key, in document order. */
  options: Array<{ key: string; label: string }>;
}

/**
 * Convert vendor steps with conditional branches into universal-protocol
 * branch_axes. Returns [] when no step carries >= 2 distinct branches.
 */
export function deriveBranchAxes(steps: VendorStepBranchesLike[]): BranchAxisLike[] {
  // 1. Per-step options (dedupe by option key, keep the first sentence seen).
  const branchy: BranchyStep[] = [];
  for (const [index, step] of steps.entries()) {
    const parsed = asStringArray(step.branches).map((branch) => {
      const option = parseBranchOption(branch);
      return { branch, option, cmp: conceptKey(option.subject) };
    });
    // Collision guard: when two options in the SAME step differ only by a
    // parenthesised qualifier, that qualifier carries the meaning — keep the
    // full keys so the options stay distinct.
    const cmpCollides = new Set(parsed.map((p) => p.cmp)).size !== parsed.length;
    const options: Array<{ key: string; label: string }> = [];
    const seen = new Set<string>();
    for (const p of parsed) {
      const key = cmpCollides ? p.option.key : p.cmp;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ key, label: p.branch });
    }
    if (options.length < 2) continue;
    branchy.push({ stepId: stepIdOf(step, index), options });
  }
  if (branchy.length === 0) return [];

  // 2. Group steps that ask the same question (identical option-key sets),
  //    in first-appearance order so document order drives the output.
  const groups = new Map<string, BranchyStep[]>();
  for (const step of branchy) {
    const groupKey = [...step.options.map((o) => o.key)].sort().join('|');
    const bucket = groups.get(groupKey);
    if (bucket) bucket.push(step);
    else groups.set(groupKey, [step]);
  }

  // 3. One axis per group; conditions gate every step in the group that
  //    carries that option.
  const axes: BranchAxisLike[] = [];
  for (const groupSteps of groups.values()) {
    const optionKeys = groupSteps[0]!.options.map((o) => o.key);
    const isShared = groupSteps.length > 1;
    const label = isShared
      ? `Branch variant on ${groupSteps.map((s) => s.stepId).join(', ')}`
      : `Branch variant on ${groupSteps[0]!.stepId}`;
    const axisId = isShared ? sharedAxisId(optionKeys) : slugify(`branch-axis-${groupSteps[0]!.stepId}`);

    const conditions = optionKeys.map((key, i) => {
      const labelForOption =
        groupSteps[0]!.options.find((o) => o.key === key)?.label ?? key;
      const then_stepIds = groupSteps
        .filter((s) => s.options.some((o) => o.key === key))
        .map((s) => s.stepId)
        .sort();
      return {
        id: `branch-${i + 1}`,
        label: labelForOption,
        predicate: { op: 'equals', path: '$.branchSelection', value: key },
        then_stepIds,
      };
    });

    axes.push({ axisId, label, conditions });
  }
  return axes;
}