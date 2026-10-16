/**
 * SH-QA-3 — the redundant top-level mixture label detector (pure, data-driven).
 *
 * The honest rule (spec §A, OQ2 ruling ADOPTED — the GENERIC strip): a
 * top-level scalar noun whose label is a description OF a composition riding
 * the same action is not a noun. Strip it from the compile input; the expander
 * already derives the mixture label from the components
 * (simpleVerbs compositionSnapshotFromParams: no declared mixture label ⇒
 * componentLabels.join(' + ')).
 *
 * Fires iff ALL of:
 *  (i) the action carries a component list in EITHER declared form — a
 *      `params:` array whose key names a vocabulary-declared
 *      `cardinality: many` resolvable arg, or the declared action-level
 *      many-arg itself — with >= 2 valid entries (the expander's own floor,
 *      simpleVerbs :368/:396);
 *  (ii) the action carries a top-level string scalar on a `kind: resolvable`
 *      SCALAR arg (found via the declared contract — zero name literals);
 *  (iii) the scalar label is REDUNDANT against the actual component list:
 *      every component is COVERED (at least one of its DATA-shaped content
 *      words appears as a word of the label), and after deleting the covered
 *      component words, every cue token, every ratio/quantity pattern match
 *      (the cue file's own `mixtureShape.ratioPatterns` DATA) and every
 *      connective (cue `stopWords` + the nounShape `connectives` DATA), the
 *      residue is empty or connectives-only.
 *
 * NO length heuristic decides anything (bait B1): the decision is component-
 * list coverage + residue emptiness, both over DATA. A label that does not
 * enumerate every component (residue non-empty / coverage failed) keeps its
 * noun question (T4/T6 pins).
 *
 * The strip is an in-memory COMPILE-INPUT transform (the held chat YAML stays
 * verbatim — B7), idempotent (a stripped doc strips nothing further), and an
 * identity passthrough when nothing qualifies (the overwhelming case: the
 * compile is byte-identical to before).
 */
import type { ScientistIntent } from './types.js';
import type { ScientistIntentVocabulary } from './vocabulary.js';
import { loadMixtureCues } from './normalizeScientistIntent.js';
import { loadNounShape } from '../resolution/nounShape.js';

type CueConfig = NonNullable<ReturnType<typeof loadMixtureCues>>;

export interface StrippedSlot {
  actionIndex: number;
  action: string;
  argument: string;
}

export interface RedundancyStripResult {
  /** The stripped copy (structuredClone), or the SAME intent when nothing fired. */
  intent: ScientistIntent;
  stripped: StrippedSlot[];
}

export interface RedundancyOptions {
  /** Cue DATA override (tests); production reads the shipped cue file. */
  cuesPath?: URL | string;
  /** Noun-shape DATA override (tests); production reads the drafting config. */
  nounShapePath?: URL | string;
}

/** The cue loader's own normalizeCueLabel idiom (normalizeScientistIntent
 *  :214-216): case-fold + whitespace-normalize. */
function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** The cue loader's own component-word alphabet (normalizeScientistIntent
 *  flankingComponentCount :286): whole words of letters/digits/hyphens. */
const WORD_RE = /\b[\p{L}\p{N}][\p{L}\p{N}-]*\b/gu;

function wordsOf(value: string): string[] {
  return [...value.matchAll(WORD_RE)].map((m) => m[0].toLowerCase());
}

/** A DATA component word: long enough (cue `minComponentLength`), matching the
 *  cue `componentPattern`, and not a cue stopWord or a nounShape connective. */
function isContentWord(
  word: string,
  cues: CueConfig,
  connectives: ReadonlySet<string>,
): boolean {
  if (word.length < cues.shape.flanking.minComponentLength) return false;
  if (!cues.shape.flanking.componentPattern.test(word)) return false;
  if (cues.shape.flanking.stopWords.has(word)) return false;
  if (connectives.has(word)) return false;
  return true;
}

/** The component list riding the action, in EITHER declared form. The params
 *  form is recognized through the vocabulary contract whose NAME matches the
 *  params key (zero new name literals — the same contract the door iterates).
 *  Returns the component labels of the >= 2 valid entries, or null. */
function componentLabelsOf(
  action: Record<string, unknown>,
  vocabulary: ScientistIntentVocabulary,
  verb: string,
): string[] | null {
  const validLabels = (raw: unknown, nounField: string): string[] | null => {
    if (!Array.isArray(raw)) return null;
    const labels: string[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const noun = (entry as Record<string, unknown>)[nounField];
      if (typeof noun !== 'string' || noun.trim().length === 0) continue;
      labels.push(noun.trim());
    }
    // The expander's own floor (simpleVerbs :368/:396): fewer than two valid
    // entries is not a composition (B7).
    return labels.length >= 2 ? labels : null;
  };

  for (const contract of vocabulary.argContracts(verb)) {
    if (contract.cardinality !== 'many' || contract.kind !== 'resolvable') continue;
    const nounField = contract.itemNounField;
    if (!nounField) continue;
    // Declared action-level form.
    const declared = validLabels(action[contract.name], nounField);
    if (declared) return declared;
    // The open params slot carrying the SAME declared arg name.
    const params = action.params;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      const carried = validLabels(
        (params as Record<string, unknown>)[contract.name],
        nounField,
      );
      if (carried) return carried;
    }
  }
  return null;
}

/** The redundancy test against the ACTUAL component list (never a length
 *  threshold): coverage of every component + empty/connectives-only residue. */
function isRedundantAgainstComponents(
  label: string,
  componentLabels: readonly string[],
  cues: CueConfig,
  nounShape: ReturnType<typeof loadNounShape>,
): boolean {
  const connectives = nounShape?.connectives ?? new Set<string>();
  const normalizedLabel = normalizeLabel(label);
  const labelWords = new Set(wordsOf(normalizedLabel));

  // Coverage: every component must be enumerated by at least one of its
  // content words. A component the sentence never names (T6b's fifth
  // component) fails coverage — the strip does NOT fire.
  const componentWords = new Set<string>();
  for (const component of componentLabels) {
    const allWords = wordsOf(normalizeLabel(component));
    for (const w of allWords) componentWords.add(w);
    const covered = allWords.filter((w) => isContentWord(w, cues, connectives) && labelWords.has(w));
    if (covered.length === 0) return false;
  }

  // Residue: delete the ratio/quantity matches FIRST (the cue file's own
  // ratioPatterns DATA — deleting the cue separators first would shred
  // "50/50" into a bare number and defeat the ratio arm), then the covered
  // component words, then every cue token, then the DATA quantity/unit glue
  // (nounShape.residueIgnorePatterns), then every connective (cue stopWords +
  // nounShape connectives). Redundant iff what remains is empty or
  // connectives-only.
  let residue = normalizedLabel;
  const deletePattern = (pattern: RegExp): void => {
    residue = residue.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), ' ');
  };
  for (const pattern of cues.shape.ratioPatterns) deletePattern(pattern);
  // Delete every word the label shares with a component (the label enumerates
  // the components' own words — including catalogue-shaped ones like "hepg2"
  // that the flanking componentPattern would not call a component).
  for (const word of [...componentWords].sort((a, b) => b.length - a.length)) {
    deletePattern(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'u'));
  }
  for (const cue of cues.cues) {
    deletePattern(new RegExp(cue.token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  for (const pattern of (nounShape?.residueIgnorePatterns ?? [])) deletePattern(pattern);
  for (const word of wordsOf(residue)) {
    if (cues.shape.flanking.stopWords.has(word) || connectives.has(word)) {
      deletePattern(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'u'));
    }
  }
  return residue.trim().length === 0;
}

/** Strip every top-level scalar noun that is a description of the component
 *  list riding the SAME action. Scalar args are found through the declared
 *  contracts (kind: resolvable, not cardinality: many) — zero name literals. */
export function stripRedundantMixtureLabels(
  intent: ScientistIntent,
  vocabulary: ScientistIntentVocabulary,
  options: RedundancyOptions = {},
): RedundancyStripResult {
  const cues = loadMixtureCues(options.cuesPath);
  if (!cues || cues.cues.length === 0) {
    // Cue DATA off ⇒ the redundancy test has no token/ratio DATA to work on.
    return { intent, stripped: [] };
  }
  const nounShape = loadNounShape(options.nounShapePath);

  const stripped: StrippedSlot[] = [];
  let working: ScientistIntent | undefined;

  for (let index = 0; index < intent.actions.length; index++) {
    const action = intent.actions[index] as unknown as Record<string, unknown>;
    const verb = typeof action.action === 'string' ? action.action : '';
    if (!verb) continue;
    const contracts = vocabulary.argContracts(verb);
    if (contracts.length === 0) continue;

    const componentLabels = componentLabelsOf(action, vocabulary, verb);
    if (!componentLabels) continue;

    for (const contract of contracts) {
      if (contract.kind !== 'resolvable') continue;
      if (contract.cardinality === 'many') continue; // the component list itself
      const value = action[contract.name];
      if (typeof value !== 'string' || value.trim().length === 0) continue;
      if (!isRedundantAgainstComponents(value, componentLabels, cues, nounShape)) continue;

      if (!working) working = structuredClone(intent);
      delete (working.actions[index] as unknown as Record<string, unknown>)[contract.name];
      stripped.push({ actionIndex: index, action: verb, argument: contract.name });
    }
  }

  // Identity passthrough when nothing fired: the compile stays byte-identical.
  if (!working || stripped.length === 0) return { intent, stripped: [] };
  return { intent: working as ScientistIntent, stripped };
}
