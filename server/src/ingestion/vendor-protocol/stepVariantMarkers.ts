/**
 * Step-variant-marker spine — deterministic branch-fill for vendor protocol
 * steps whose dispatch sentences were transcribed verbatim but left
 * `branches` empty (small literal-model extractors copy
 * "For blood with non-nucleated erythrocytes, follow step 1a; ..." into
 * sourceText without structuring it).
 *
 * Canon honored here: ALL pattern data lives in
 * `schema/registry/intake-patterns/step-variant-markers.yaml`. This module is
 * a dumb interpreter: it compiles the YAML-declared regexes and applies them
 * with fixed, conservative semantics. No domain regexes in TS literals.
 *
 * Semantics (deterministic, conservative):
 *  - dispatch role: a step whose (whitespace-normalized) sourceText yields
 *    >= 2 dispatch matches gets `branches` filled — ONLY if its branches are
 *    empty/missing — with one entry per match, in sentence order, formatted
 *    '<condition> (follow step <variant>)'.
 *  - marker role: a leading lettered marker is corroborating evidence of a
 *    step's variant letter only. It NEVER fills branches on its own.
 *  - conditional role: a lone sentence-leading 'If ...' is a single option —
 *    never an axis, never branches. (This pins the 'K. If necessary...'
 *    footnote case: marker + lone conditional => no branches.)
 *  - A step with a NON-EMPTY branches array is never modified. Nothing is
 *    ever deleted. sectionId is ignored entirely (Phase C does grouping).
 *
 * The module performs NO disk I/O — the caller passes YAML text (or an
 * already-parsed pattern list). `DEFAULT_PATTERNS_PATH` is the
 * relative-to-schemaDir convention as a string const only.
 */
import { parse as parseYaml } from 'yaml';

/** Relative-to-schemaDir path of the pattern registry (string const only —
 *  this module never reads the disk itself). */
export const DEFAULT_PATTERNS_PATH = 'registry/intake-patterns/step-variant-markers.yaml';

export type StepVariantRole = 'dispatch' | 'marker' | 'conditional';

export interface StepVariantPattern {
  id: string;
  description: string;
  regex: string;
  flags: string;
  role: StepVariantRole;
}

const ROLES: readonly string[] = ['dispatch', 'marker', 'conditional'];

/** PDF-extracted text carries embedded newlines and space runs; patterns are
 *  authored against single-spaced prose, so match against normalized text. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parse + validate the YAML pattern registry. Every regex must compile as a
 * JS RegExp (the registry uses (?<name>...) named groups, NOT the PCRE
 * (?P<name>...) form, which JS rejects). Throws on malformed data, naming the
 * offending pattern id.
 */
export function loadStepVariantPatterns(yamlText: string): StepVariantPattern[] {
  const doc = parseYaml(yamlText) as unknown;
  if (typeof doc !== 'object' || doc === null || !Array.isArray((doc as { patterns?: unknown }).patterns)) {
    throw new Error('step-variant-markers registry: expected an object with a "patterns" array');
  }
  const raw = (doc as { patterns: unknown[] }).patterns;
  return raw.map((entry, index) => {
    const p = entry as Partial<StepVariantPattern> | null;
    const id = typeof p?.id === 'string' && p.id.length > 0 ? p.id : `patterns[${index}]`;
    if (typeof p?.regex !== 'string' || p.regex.length === 0) {
      throw new Error(`step-variant-markers registry: pattern "${id}" has no regex`);
    }
    if (typeof p.description !== 'string') {
      throw new Error(`step-variant-markers registry: pattern "${id}" has no description`);
    }
    const flags = typeof p.flags === 'string' ? p.flags : '';
    if (typeof p.role !== 'string' || !ROLES.includes(p.role)) {
      throw new Error(`step-variant-markers registry: pattern "${id}" has unknown role "${String(p?.role)}"`);
    }
    try {
      new RegExp(p.regex, flags);
    } catch (cause) {
      throw new Error(
        `step-variant-markers registry: pattern "${id}" regex does not compile: ${(cause as Error).message}`,
        { cause },
      );
    }
    return { id, description: p.description, regex: p.regex, flags, role: p.role as StepVariantRole };
  });
}

interface MatchedDispatch {
  condition: string;
  variant: string;
}

/** Collect dispatch clauses from normalized text, in sentence order. */
function extractDispatchClauses(normalizedText: string, pattern: StepVariantPattern): MatchedDispatch[] {
  const re = new RegExp(pattern.regex, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const clauses: MatchedDispatch[] = [];
  for (const match of normalizedText.matchAll(re)) {
    const condition = match.groups?.condition;
    const variant = match.groups?.variant;
    if (condition && variant) {
      clauses.push({ condition: normalizeWhitespace(condition), variant });
    }
  }
  return clauses;
}

/**
 * Deterministically annotate steps with variant branches derived from the
 * YAML-declared patterns. Returns a NEW array (input untouched) plus the ids
 * of steps whose branches were filled.
 *
 * Conservative guarantees:
 *  - only dispatch matches with >= 2 clauses fill branches;
 *  - marker-only / conditional-only steps get nothing (single option is not
 *    a question — the 'K. If necessary...' footnote stays branchless);
 *  - non-empty branches arrays are never modified or deleted.
 */
export function annotateStepVariants<T extends { id: string; sourceText: string; branches?: string[] }>(
  steps: T[],
  patterns: StepVariantPattern[],
): { steps: T[]; annotatedStepIds: string[] } {
  const dispatchPatterns = patterns.filter((p) => p.role === 'dispatch');
  const annotatedStepIds: string[] = [];

  const next = steps.map((step) => {
    // Never touch a step that already has branches.
    if (Array.isArray(step.branches) && step.branches.length > 0) return step;

    const normalized = normalizeWhitespace(step.sourceText);
    const clauses = dispatchPatterns.flatMap((p) => extractDispatchClauses(normalized, p));

    // One option is never a question; marker/conditional roles alone never
    // produce branches (see header). Only a >=2-clause dispatch family fills.
    if (clauses.length < 2) return step;

    const branches = clauses.map((c) => `${c.condition} (follow step ${c.variant})`);
    annotatedStepIds.push(step.id);
    return { ...step, branches };
  });

  return { steps: next, annotatedStepIds };
}
