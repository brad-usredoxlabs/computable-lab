/**
 * MIXFRAC-1 (OQ-2 ruling, MATRES-CHAIN OQ-2(b) shape): the generic
 * composition-fraction evaluator. ZERO domain knowledge: every threshold,
 * total, exclusion, parse pattern, phrase list, reading id, arithmetic
 * strategy key, label and message template is DATA from
 * config/drafting/composition-fraction-convention.yaml (loaded PER call,
 * mirroring the mixture-cue discipline: absent file => check OFF — LOUD, one
 * console.warn naming the path; present-but-malformed => throws naming the
 * path). No reagent noun, no fraction literal, no connector phrase, no
 * "of the mixture" string appears in this file (repo rule #1 / CLAUDE.md
 * "The Hard Boundary"); the reason-code string follows the existing TS
 * `as const` registration precedent (channel contract, not policy).
 *
 * The defect this closes: a composition whose declared fractions do not sum
 * to the declared convention total compiled clean — nothing parsed or summed
 * the declared fraction strings. A fully-declared composition whose
 * non-excluded fractions break the sum now raises ONE clarification
 * (reason composition-fraction-sum) carrying the candidate readings, each
 * with its COMPUTED final fractions. Genuine ambiguity is NEVER resolved by
 * confidence: no ranking, no picking — the clarification carries every
 * reading. One-sided final-volume evidence settles the re-base silently
 * (the re-base makes the composition self-consistent by construction);
 * on-top evidence does NOT resolve silently (the declared fractions still
 * break the total — the bar stands and the sum note rides the reading data,
 * OQ-4).
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/** Stable reason code (TS registration of the clarification channel, per the
 *  UNREALIZED_* / MIXTURE_BLOB_* `as const` precedent in
 *  normalizeScientistIntent.ts). */
export const COMPOSITION_FRACTION_SUM_REASON = 'composition-fraction-sum' as const;
export type CompositionFractionSumReason = typeof COMPOSITION_FRACTION_SUM_REASON;

// ---------------------------------------------------------------------------
// The convention DATA shape (config/drafting/composition-fraction-convention.yaml)
// ---------------------------------------------------------------------------

export interface FractionConventionConfig {
  basis: string;
  total: number;
  tolerance: number;
  displayRoundingFactor: number;
  excludeRoles: readonly string[];
  fractionPatterns: readonly RegExp[];
  malformedFractionBehavior: string;
  attachmentEvidence: {
    supplementConnectors: readonly string[];
    finalVolumePhrases: readonly string[];
    onTopPhrases: readonly string[];
    adjacencyWindowChars: number;
    ratioPatterns: readonly RegExp[];
  };
  convention: {
    readings: readonly string[];
    defaultParse: string;
    defaultParseCondition: string;
    onGenuineAmbiguity: string;
    readingArithmetic: Readonly<Record<string, string>>;
    readingLabels: Readonly<Record<string, string>>;
    silentResolution: { whenEvidence: string; reading: string };
  };
  recipeShapedReadingEvidence: {
    storeKinds: readonly string[];
    formulationKinds: readonly string[];
    phraseMatch: string;
    ratioPatterns: readonly RegExp[];
    /** Optional document-side arm name (e.g. `precedingEntryDeclaresOwnComposition`);
     *  absent ⇒ the store-record arm alone decides. */
    documentSideReading?: string;
  };
  messages: {
    clarification: string;
    sumNote: string;
    malformedNote: string;
    attachmentNote: string;
    fractionFormat: string;
  };
}

/** A store-shaped record offered as recipe-shaped reading evidence (the
 *  §14.3 datum: a formulation-shaped record whose name matches the
 *  preceding-noun phrase AND that declares its own composition). Injected
 *  through NormalizeOptions (the mixtureCuesPath injection precedent) — the
 *  evaluator interprets the match rules generically against it. */
export interface RecipeShapedRecordEvidence {
  name: string;
  kind: string;
  formulationKind?: string;
  composition?: readonly unknown[];
}

// ---------------------------------------------------------------------------
// Loader (per call, never process-cached; LOUD off-state, loud malformed)
// ---------------------------------------------------------------------------

export const FRACTION_CONVENTION_PATH = new URL(
  '../../../../config/drafting/composition-fraction-convention.yaml', import.meta.url,
);

/** fix1/D3 mirror: one warn per (path, reason) pair — the per-call load
 *  stays, the diagnostic does not spam. */
const fractionOffWarned = new Set<string>();

function warnFractionCheckOff(path: string, reason: string): void {
  const key = `${path}\u0000${reason}`;
  if (fractionOffWarned.has(key)) return;
  fractionOffWarned.add(key);
  console.warn(`[composition-fraction-check-off] ${reason} — the composition-fraction sum check is OFF; declared fractions pass through unchanged. Convention data home: ${path}`);
}

function requireSection(raw: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const value = raw[key];
  if (value === undefined || value === null) {
    throw new Error(`composition-fraction convention (${path}): missing required \`${key}:\` section`);
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`composition-fraction convention (${path}): \`${key}\` must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireStringList(value: unknown, label: string, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new Error(`composition-fraction convention (${path}): \`${label}\` must be a non-empty list of strings`);
  }
  return value as string[];
}

function requirePatternList(value: unknown, label: string, path: string): RegExp[] {
  const list = requireStringList(value, label, path);
  try {
    return list.map((pattern) => new RegExp(pattern));
  } catch (error) {
    throw new Error(`composition-fraction convention (${path}): \`${label}\` contains an invalid regex (${error instanceof Error ? error.message : String(error)})`);
  }
}

function requireNumber(value: unknown, label: string, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`composition-fraction convention (${path}): \`${label}\` must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, label: string, path: string): string {
  if (typeof value !== 'string' || !value.length) {
    throw new Error(`composition-fraction convention (${path}): \`${label}\` must be a non-empty string`);
  }
  return value;
}

export function loadFractionConvention(path: URL | string = FRACTION_CONVENTION_PATH): FractionConventionConfig | undefined {
  const displayPath = String(path);
  if (!existsSync(path)) {
    warnFractionCheckOff(displayPath, `convention data home not found (${displayPath})`);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`composition-fraction convention unreadable (${displayPath}): ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) {
    warnFractionCheckOff(displayPath, `convention data home (${displayPath}) is empty`);
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`composition-fraction convention (${displayPath}): must be an object`);
  }
  const doc = raw as Record<string, unknown>;

  const total = requireNumber(doc.total, 'total', displayPath);
  const tolerance = requireNumber(doc.tolerance, 'tolerance', displayPath);
  const displayRoundingFactor = requireNumber(doc.displayRoundingFactor, 'displayRoundingFactor', displayPath);
  const excludeRoles = requireStringList(doc.excludeRoles, 'excludeRoles', displayPath);
  const fractionPatterns = requirePatternList(doc.fractionPatterns, 'fractionPatterns', displayPath);

  const evidenceRaw = requireSection(doc, 'attachmentEvidence', displayPath);
  const conventionRaw = requireSection(doc, 'convention', displayPath);
  const recipeRaw = requireSection(doc, 'recipeShapedReadingEvidence', displayPath);
  const messagesRaw = requireSection(doc, 'messages', displayPath);

  const readings = requireStringList(conventionRaw.readings, 'convention.readings', displayPath);
  const arithmeticRaw = requireSection(conventionRaw, 'readingArithmetic', displayPath);
  const labelsRaw = requireSection(conventionRaw, 'readingLabels', displayPath);
  const arithmetic: Record<string, string> = {};
  const labels: Record<string, string> = {};
  for (const reading of readings) {
    arithmetic[reading] = requireString(arithmeticRaw[reading], `convention.readingArithmetic.${reading}`, displayPath);
    labels[reading] = requireString(labelsRaw[reading], `convention.readingLabels.${reading}`, displayPath);
  }
  const silentRaw = requireSection(conventionRaw, 'silentResolution', displayPath);

  return {
    basis: requireString(doc.basis, 'basis', displayPath),
    total,
    tolerance,
    displayRoundingFactor,
    excludeRoles,
    fractionPatterns,
    malformedFractionBehavior: requireString(doc.malformedFractionBehavior, 'malformedFractionBehavior', displayPath),
    attachmentEvidence: {
      supplementConnectors: requireStringList(evidenceRaw.supplementConnectors, 'attachmentEvidence.supplementConnectors', displayPath),
      finalVolumePhrases: requireStringList(evidenceRaw.finalVolumePhrases, 'attachmentEvidence.finalVolumePhrases', displayPath),
      onTopPhrases: requireStringList(evidenceRaw.onTopPhrases, 'attachmentEvidence.onTopPhrases', displayPath),
      adjacencyWindowChars: requireNumber(evidenceRaw.adjacencyWindowChars, 'attachmentEvidence.adjacencyWindowChars', displayPath),
      ratioPatterns: requirePatternList(evidenceRaw.ratioPatterns, 'attachmentEvidence.ratioPatterns', displayPath),
    },
    convention: {
      readings,
      defaultParse: requireString(conventionRaw.defaultParse, 'convention.defaultParse', displayPath),
      defaultParseCondition: requireString(conventionRaw.defaultParseCondition, 'convention.defaultParseCondition', displayPath),
      onGenuineAmbiguity: requireString(conventionRaw.onGenuineAmbiguity, 'convention.onGenuineAmbiguity', displayPath),
      readingArithmetic: arithmetic,
      readingLabels: labels,
      silentResolution: {
        whenEvidence: requireString(silentRaw.whenEvidence, 'convention.silentResolution.whenEvidence', displayPath),
        reading: requireString(silentRaw.reading, 'convention.silentResolution.reading', displayPath),
      },
    },
    recipeShapedReadingEvidence: {
      storeKinds: requireStringList(recipeRaw.storeKinds, 'recipeShapedReadingEvidence.storeKinds', displayPath),
      formulationKinds: requireStringList(recipeRaw.formulationKinds, 'recipeShapedReadingEvidence.formulationKinds', displayPath),
      phraseMatch: requireString(recipeRaw.phraseMatch, 'recipeShapedReadingEvidence.phraseMatch', displayPath),
      ratioPatterns: requirePatternList(recipeRaw.ratioPatterns, 'recipeShapedReadingEvidence.ratioPatterns', displayPath),
      // exactOptionalPropertyTypes: the document-side arm is absent-or-value.
      ...(typeof recipeRaw.documentSideReading === 'string' && recipeRaw.documentSideReading.length
        ? { documentSideReading: recipeRaw.documentSideReading }
        : {}),
    },
    messages: {
      clarification: requireString(messagesRaw.clarification, 'messages.clarification', displayPath),
      sumNote: requireString(messagesRaw.sumNote, 'messages.sumNote', displayPath),
      malformedNote: requireString(messagesRaw.malformedNote, 'messages.malformedNote', displayPath),
      attachmentNote: requireString(messagesRaw.attachmentNote, 'messages.attachmentNote', displayPath),
      fractionFormat: requireString(messagesRaw.fractionFormat, 'messages.fractionFormat', displayPath),
    },
  };
}

// ---------------------------------------------------------------------------
// Generic interpretation helpers (no domain knowledge)
// ---------------------------------------------------------------------------

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whole-word containment (the cues `exempt:` arm idiom): `needle` holds
 *  inside `haystack` as a whole-word run — the needle's first/last characters
 *  may not sit inside a longer word. */
function wholeWordContains(haystack: string, needle: string): boolean {
  if (!needle.length) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack.charAt(at - 1);
    const after = at + needle.length >= haystack.length ? '' : haystack.charAt(at + needle.length);
    const wordChar = (ch: string) => /[a-z0-9]/.test(ch);
    if (!wordChar(before) && !wordChar(after)) return true;
    from = at + 1;
  }
}

export function parseFractionValue(value: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(value.trim());
    if (match && match[1] !== undefined) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** Render a computed percent for display / for a rewritten fraction string.
 *  The rounding factor is the DATA `displayRoundingFactor` — the TS carries no
 *  rounding literal. */
export function formatFractionPercent(value: number, roundingFactor: number): string {
  const rounded = Math.round(value * roundingFactor) / roundingFactor;
  return String(rounded);
}

/** Canonical rendering of a parsed fraction when it is rewritten onto a
 *  composition entry / snapshot source (the `messages.fractionFormat` DATA
 *  template — the TS never hardcodes the suffix form). */
export function formatFractionString(value: number, config: FractionConventionConfig): string {
  return interpolate(config.messages.fractionFormat, {
    value: formatFractionPercent(value, config.displayRoundingFactor),
  });
}

interface DeclaredEntry {
  /** Position in the declared composition array (index-aligned rewrite). */
  index: number;
  label: string;
  role: string;
  /** The declared fraction string exactly as the document carries it. */
  declared: string;
  /** Parsed number, or undefined when the declared string parses to none. */
  parsed: number | undefined;
  /** Nested sub-composition entries declared on this entry (the §14.1
   *  expressibility), when present. */
  nested?: readonly unknown[];
  /** The raw declared entry object (rides verbatim fields — count,
   *  counterDensity, concentration — through a settled-reading rewrite). */
  source: Record<string, unknown>;
}

function readComposition(composition: readonly unknown[], config: FractionConventionConfig): DeclaredEntry[] {
  const entries: DeclaredEntry[] = [];
  composition.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const entry = raw as Record<string, unknown>;
    const label = typeof entry.material === 'string' ? entry.material.trim() : '';
    if (!label) return;
    const role = typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : 'other';
    const declared = typeof entry.fraction === 'string' ? entry.fraction.trim() : '';
    entries.push({
      index,
      label,
      role,
      declared,
      parsed: declared ? parseFractionValue(declared, config.fractionPatterns) : undefined,
      ...(Array.isArray(entry.composition) && entry.composition.length > 0 ? { nested: entry.composition as readonly unknown[] } : {}),
      source: entry,
    });
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Reading arithmetic (strategy keys are DATA; TS interprets them generically)
// ---------------------------------------------------------------------------

export interface ComputedFraction {
  label: string;
  percent: number;
}

export interface CompositionReading {
  id: string;
  label: string;
  finalFractions: ComputedFraction[];
  /** §14.2: the preceding entry's OWN declared composition (the nested/recipe
   *  split) for the attach-to-preceding reading. Absent-or-value via
   *  conditional spread only (exactOptionalPropertyTypes). */
  nestedFractions?: ComputedFraction[];
  note?: string;
}

/** A computed fraction that also names the declared entry it rewrites
 *  (index-aligned: the rewrite never keys on a label, which a model could
 *  duplicate). */
export interface ResolvedFraction {
  index: number;
  label: string;
  percent: number;
}

/** Internal strategy output: every computed share keeps its source entry's
 *  declared-array index. A share that came from a DECLARED nested child (the
 *  §14.1 expressibility expanded into the flat derived view) also names the
 *  child's own label/role — the parent line never rides the flat view. */
interface StrategyFraction {
  index: number;
  label: string;
  percent: number;
  nestedChild?: { label: string; role: string };
}

function applyStrategy(
  strategy: string,
  entries: readonly DeclaredEntry[],
  config: FractionConventionConfig,
): StrategyFraction[] {
  const counted = entries.filter((e) => !config.excludeRoles.includes(e.role) && e.parsed !== undefined);
  if (strategy === 'keep-declared') {
    return counted.map((e) => ({ index: e.index, label: e.label, percent: e.parsed as number }));
  }
  if (strategy === 'rebase-to-total') {
    const supplement = counted[counted.length - 1]!;
    const bases = counted.slice(0, -1);
    const baseSum = bases.reduce((sum, e) => sum + (e.parsed as number), 0);
    const supplementShare = supplement.parsed as number;
    const scale = baseSum > 0 ? (config.total - supplementShare) / baseSum : 0;
    return [
      ...bases.map((e) => ({ index: e.index, label: e.label, percent: (e.parsed as number) * scale })),
      { index: supplement.index, label: supplement.label, percent: supplementShare },
    ];
  }
  if (strategy === 'attach-to-preceding') {
    const supplement = counted[counted.length - 1]!;
    const preceding = counted[counted.length - 2];
    const others = counted.slice(0, -2);
    const supplementShare = supplement.parsed as number;
    const out: StrategyFraction[] = others.map((e) => ({ index: e.index, label: e.label, percent: e.parsed as number }));
    if (preceding) {
      const precedingShare = preceding.parsed as number;
      // §14.2: when the preceding entry carries a DECLARED nested composition
      // (the §14.1 expressibility), the flat derived view EXPANDS it: each
      // child takes parentShare x childShare / total and the top-level
      // supplement entry is ABSORBED (it IS the child — the attachment reading
      // says the supplement is part of the recipe, not a separate component).
      const declaredChildren = preceding.nested ? readComposition(preceding.nested, config) : undefined;
      const expandDeclared = declaredChildren !== undefined
        && declaredChildren.length > 0
        && declaredChildren.every((c) => c.parsed !== undefined && !config.excludeRoles.includes(c.role));
      if (expandDeclared && declaredChildren) {
        for (const child of declaredChildren) {
          out.push({
            index: preceding.index,
            label: child.label,
            percent: precedingShare * (child.parsed as number) / config.total,
            nestedChild: { label: child.label, role: child.role },
          });
        }
      } else {
        // The preceding entry's declared share p splits: the preceding noun keeps
        // p*(1 - f/total), the supplement takes p*(f/total) — the flat derived
        // view of the nested recipe (Brad's OQ-1 arithmetic).
        out.push({ index: preceding.index, label: preceding.label, percent: precedingShare * (1 - supplementShare / config.total) });
        out.push({ index: supplement.index, label: supplement.label, percent: precedingShare * (supplementShare / config.total) });
      }
    } else {
      out.push({ index: supplement.index, label: supplement.label, percent: supplementShare });
    }
    return out;
  }
  throw new Error(`composition-fraction convention: readingArithmetic strategy key "${strategy}" is not interpretable`);
}

// ---------------------------------------------------------------------------
// Utterance-shape evidence (firesOn idiom: DATA patterns, zero confidence)
// ---------------------------------------------------------------------------

interface AttachmentEvidenceVerdict {
  finalVolumeHits: number;
  onTopHits: number;
  /** A ratio/quantity match whose span sits within `adjacencyWindowChars` of a
   *  `supplementConnectors` occurrence — the firesOn-idiom attachment evidence
   *  (the cues file's ratioPatterns/adjacency arm). Zero when the utterance
   *  carries no quantity attached to a supplement connector. */
  attachmentHits: number;
}

function scanAttachmentEvidence(utterance: string, config: FractionConventionConfig): AttachmentEvidenceVerdict {
  const haystack = normalizePhrase(utterance);
  const evidence = config.attachmentEvidence;
  const count = (phrases: readonly string[]) =>
    phrases.reduce((hits, phrase) => (haystack.includes(normalizePhrase(phrase)) ? hits + 1 : hits), 0);

  // Adjacency arm (DATA): every connector occurrence, every ratio/quantity
  // match; a match whose span reaches within adjacencyWindowChars of a
  // connector is attachment evidence. No connector or no quantity => zero.
  // Global copies of the DATA patterns drive the scan (the loader's patterns
  // are non-global; exec on a non-global regex never advances).
  const window = evidence.adjacencyWindowChars;
  const globalPatterns = evidence.ratioPatterns.map((p) => new RegExp(p.source, 'g'));
  let attachmentHits = 0;
  for (const connector of evidence.supplementConnectors) {
    const needle = normalizePhrase(connector);
    if (!needle.length) continue;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      const connectorStart = at;
      const connectorEnd = at + needle.length;
      for (const pattern of globalPatterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(haystack)) !== null) {
          const matchStart = match.index;
          const matchEnd = match.index + match[0].length;
          const gap = Math.max(connectorStart - matchEnd, matchStart - connectorEnd);
          if (gap <= window) attachmentHits += 1;
          if (match[0].length === 0) break;
        }
      }
      from = at + needle.length;
    }
  }
  return {
    finalVolumeHits: count(evidence.finalVolumePhrases),
    onTopHits: count(evidence.onTopPhrases),
    attachmentHits,
  };
}

/** §14.3: "recipe-shaped reading exists" = a formulation-shaped store record
 *  (kind ∈ storeKinds, formulationKind ∈ formulationKinds) that declares its
 *  own composition AND whose NAME matches the preceding-noun phrase — the
 *  component name on the LEFT flank of the supplement connector, derived from
 *  the composition entries (never a reagent word written in the file). The
 *  match is the cues whole-word-containment idiom: the phrase holds inside the
 *  record name as a whole-word run. The record IS the datum. */
function recipeShapedReadingExists(
  records: readonly RecipeShapedRecordEvidence[] | undefined,
  entries: readonly DeclaredEntry[],
  config: FractionConventionConfig,
): boolean {
  const counted = entries.filter((e) => !config.excludeRoles.includes(e.role) && e.parsed !== undefined);
  const preceding = counted[counted.length - 2];
  if (!preceding) return false;
  const rules = config.recipeShapedReadingEvidence;

  // Store arm (§14.3): a formulation-shaped STORE record whose name matches
  // the preceding-noun phrase AND that declares its own composition.
  if (records && records.length > 0) {
    const phrase = normalizePhrase(preceding.label);
    if (phrase.length && records.some((record) =>
      rules.storeKinds.includes(record.kind)
      && record.formulationKind !== undefined
      && rules.formulationKinds.includes(record.formulationKind)
      && Array.isArray(record.composition)
      && record.composition.length > 0
      && (rules.phraseMatch !== 'whole-word-containment' || wholeWordContains(normalizePhrase(record.name), phrase)),
    )) return true;
  }

  // Document-side arm (the §14.1 expressibility, named by DATA
  // `documentSideReading`): the composition entry on the LEFT flank of the
  // supplement declares its OWN composition — an in-house formulation stated
  // in the document itself is a recipe-shaped component reading. The declared
  // sub-composition IS the datum; no reagent word is consulted.
  if (rules.documentSideReading === 'precedingEntryDeclaresOwnComposition') {
    return preceding.nested !== undefined && preceding.nested.length > 0;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The evaluation
// ---------------------------------------------------------------------------

export interface FractionCheckClarification {
  label: string;
  reason: typeof COMPOSITION_FRACTION_SUM_REASON;
  message: string;
  readings: CompositionReading[];
}

/** Outcome: either a clarification (genuine ambiguity — the bar stands) or a
 *  resolved fraction rewrite (one-sided final-volume evidence settles the
 *  re-base; the carried composition entries' fraction strings are replaced
 *  index-aligned with these percents), or a settled-reading composition (the
 *  scientist ANSWERED the bar with a declared reading id — §14.2's answer-
 *  driven RECORD leg: the answer settles the parse and the carried
 *  composition becomes that reading's flat derived view). */
export interface FractionCheckOutcome {
  clarification?: FractionCheckClarification;
  resolvedFractions?: ResolvedFraction[];
  settledComposition?: unknown[];
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key]! : whole));
}

function buildReadings(
  entries: readonly DeclaredEntry[],
  config: FractionConventionConfig,
  recipeEvidenceExists: boolean,
  sum: number,
): CompositionReading[] {
  const order = [...config.convention.readings];
  if (
    recipeEvidenceExists
    && config.convention.defaultParseCondition === 'recipeShapedReadingExists'
  ) {
    const at = order.findIndex((id) => id.startsWith(config.convention.defaultParse));
    if (at > 0) {
      const [defaultReading] = order.splice(at, 1);
      order.unshift(defaultReading!);
    }
  }
  return order.map((id) => {
    const strategy = config.convention.readingArithmetic[id]!;
    const fractions = applyStrategy(strategy, entries, config).map(
      (f) => ({ label: f.label, percent: Number(formatFractionPercent(f.percent, config.displayRoundingFactor)) }),
    );
    const note = strategy === 'keep-declared'
      ? interpolate(config.messages.sumNote, { sum: formatFractionPercent(sum, config.displayRoundingFactor), total: formatFractionPercent(config.total, config.displayRoundingFactor) })
      : undefined;
    // §14.2: the ONE encoding of the nested/recipe form. The attach-to-preceding
    // reading carries the preceding entry's OWN declared composition — the
    // declared (total - supplement):(supplement) split the in-house recipe
    // states — as nested fractions, alongside the flat derived view. Both are
    // COMPUTED from the DATA convention; neither is a reagent table.
    const nestedFractions = strategy === 'attach-to-preceding'
      ? nestedSplit(entries, config)
      : undefined;
    return {
      id,
      label: config.convention.readingLabels[id]!,
      finalFractions: fractions,
      ...(nestedFractions !== undefined ? { nestedFractions } : {}),
      ...(note !== undefined ? { note } : {}),
    };
  });
}

/** The preceding entry's own declared sub-composition as fractions of ITSELF:
 *  the supplement's declared share of the total is the recipe's declared
 *  inner share, the rest belongs to the preceding noun (the DATA total minus
 *  the declared supplement share). When the preceding entry carries an explicit
 *  nested composition (the §14.1 expressibility), its declared fractions are
 *  quoted instead of inferred. */
function nestedSplit(entries: readonly DeclaredEntry[], config: FractionConventionConfig): ComputedFraction[] | undefined {
  const counted = entries.filter((e) => !config.excludeRoles.includes(e.role) && e.parsed !== undefined);
  const supplement = counted[counted.length - 1];
  const preceding = counted[counted.length - 2];
  if (!supplement || !preceding) return undefined;
  const declaredNested = preceding.nested;
  if (declaredNested && declaredNested.length > 0) {
    const nested = readComposition(declaredNested, config)
      .filter((e) => e.parsed !== undefined)
      .map((e) => ({ label: e.label, percent: Number(formatFractionPercent(e.parsed as number, config.displayRoundingFactor)) }));
    if (nested.length > 0) return nested;
  }
  const innerSupplement = supplement.parsed as number;
  const innerPreceding = config.total - innerSupplement;
  if (innerPreceding <= 0) return undefined;
  return [
    { label: preceding.label, percent: Number(formatFractionPercent(innerPreceding, config.displayRoundingFactor)) },
    { label: supplement.label, percent: Number(formatFractionPercent(innerSupplement, config.displayRoundingFactor)) },
  ];
}

/**
 * §14.2 RECORD leg (fix1/D3): the scientist ANSWERED a composition-fraction-sum
 * clarification with one of the reading ids the bar itself presented. The answer
 * settles the parse ("settled, do not re-ask" — the same doctrine as the
 * noun-answer channel) and the carried composition becomes that reading's FLAT
 * DERIVED view: every share is written onto the declared entry it came from
 * (index-aligned, never label-keyed), a declared nested composition EXPANDS into
 * its own flat lines (the parent line never rides the flat view, §14.2), an
 * entry the reading ABSORBS (the supplement that IS part of the recipe) drops
 * out, and excluded-role entries (a cells count) ride verbatim.
 *
 * Returns undefined — the bar stands — when the answer names something that is
 * NOT a declared reading id, or when the composition is not fully
 * declared+parseable (an unparseable declared fraction is never rewritten into
 * a guess).
 */
export function settleCompositionFromReading(
  composition: readonly unknown[],
  readingId: string,
  config: FractionConventionConfig,
): unknown[] | undefined {
  if (!config.convention.readings.includes(readingId)) return undefined;
  const strategy = config.convention.readingArithmetic[readingId];
  if (typeof strategy !== 'string') return undefined;

  const entries = readComposition(composition, config);
  const counted = entries.filter((e) => !config.excludeRoles.includes(e.role));
  if (counted.length < 2 || counted.some((e) => e.parsed === undefined)) return undefined;

  const fractions = applyStrategy(strategy, entries, config);
  const sharesByIndex = new Map<number, StrategyFraction[]>();
  for (const f of fractions) {
    const list = sharesByIndex.get(f.index) ?? [];
    list.push(f);
    sharesByIndex.set(f.index, list);
  }

  const settled: unknown[] = [];
  for (const entry of entries) {
    const shares = sharesByIndex.get(entry.index);
    if (shares && shares.length > 0) {
      if (shares.some((s) => s.nestedChild !== undefined)) {
        // The flat derived view of a DECLARED nested composition: one line per
        // declared child with its computed final-of-mixture share.
        for (const share of shares) {
          const child = share.nestedChild ?? { label: share.label, role: entry.role };
          settled.push({
            material: child.label,
            role: child.role,
            fraction: formatFractionString(roundPercent(share.percent, config), config),
          });
        }
      } else {
        settled.push({
          ...entry.source,
          fraction: formatFractionString(roundPercent(shares[0]!.percent, config), config),
        });
      }
      continue;
    }
    // No share for this entry: an excluded-role entry (a count) rides verbatim;
    // a non-excluded entry the reading ABSORBED drops out of the flat view.
    if (config.excludeRoles.includes(entry.role)) {
      settled.push(entry.source);
    }
  }
  return settled;
}

function roundPercent(value: number, config: FractionConventionConfig): number {
  return Number(formatFractionPercent(value, config.displayRoundingFactor));
}

/**
 * Evaluate one declared composition against the convention.
 * Returns undefined when the check does not apply (not fully declared, or the
 * sum holds). Returns a clarification when the sum breaks AND the utterance
 * evidence does not single out the silent-resolution arm. Returns a resolved
 * fraction rewrite when one-sided final-volume evidence settles the parse.
 */
export function evaluateCompositionFractions(
  composition: readonly unknown[],
  utterance: string | undefined,
  config: FractionConventionConfig,
  recipeRecords: readonly RecipeShapedRecordEvidence[] | undefined,
): FractionCheckOutcome | undefined {
  const entries = readComposition(composition, config);
  const counted = entries.filter((e) => !config.excludeRoles.includes(e.role));
  // The check applies only to a FULLY declared composition: every counted
  // entry declares a fraction string (a declared-but-unparseable one counts
  // as declared and is excluded from the sum + named).
  // RATIFIED LIMITATION (adversarial review l2t1855 D4, orchestrator ruling):
  // an entry with NO declared fraction string is OUT OF SCOPE per spec §1 —
  // the goal is "a composition whose DECLARED fractions do not sum to the
  // declared convention total", so a partially-declared composition skips the
  // check entirely (it has no declared-fraction sum to break). This is not an
  // oversight to widen here: extending the check to undeclared-fraction
  // entries would invent policy the spec does not declare.
  if (counted.length < 2 || counted.some((e) => e.declared === '')) return undefined;

  const malformed = counted.filter((e) => e.parsed === undefined);
  const parseable = counted.filter((e) => e.parsed !== undefined);
  if (parseable.length < 2) return undefined;
  const sum = parseable.reduce((total, e) => total + (e.parsed as number), 0);
  if (Math.abs(sum - config.total) <= config.tolerance) return undefined;

  const malformedNote = malformed.length > 0
    ? ` ${malformed.map((e) => interpolate(config.messages.malformedNote, { fraction: e.declared })).join(' ')}`
    : '';

  const evidence = scanAttachmentEvidence(utterance ?? '', config);
  const silent = config.convention.silentResolution;
  const silentArmFires =
    silent.whenEvidence === 'finalVolumePhrases'
    && evidence.finalVolumeHits > 0
    && evidence.onTopHits === 0;
  if (silentArmFires) {
    const strategy = config.convention.readingArithmetic[silent.reading];
    if (strategy === 'rebase-to-total') {
      const resolved: ResolvedFraction[] = applyStrategy(strategy, entries, config).map(
        (f) => ({ index: f.index, label: f.label, percent: Number(formatFractionPercent(f.percent, config.displayRoundingFactor)) }),
      );
      // A silent resolution must produce a self-consistent composition: if the
      // computed fractions still break the total, the bar stands instead.
      const resolvedSum = resolved.reduce((t, f) => t + f.percent, 0);
      if (Math.abs(resolvedSum - config.total) <= config.tolerance) {
        return { resolvedFractions: resolved };
      }
    }
  }

  // Genuine ambiguity (or an unresolvable one-sided claim): clarify with every
  // reading, never pick, never rank.
  const readings = buildReadings(entries, config, recipeShapedReadingExists(recipeRecords, entries, config), sum);
  const label = parseable.map((e) => e.label).join(', ');
  const attachmentNote = evidence.attachmentHits > 0 ? ` ${config.messages.attachmentNote}` : '';
  const message = interpolate(config.messages.clarification, {
    sum: formatFractionPercent(sum, config.displayRoundingFactor),
    total: formatFractionPercent(config.total, config.displayRoundingFactor),
    basis: config.basis,
  }) + attachmentNote + malformedNote;
  return {
    clarification: {
      label,
      reason: COMPOSITION_FRACTION_SUM_REASON,
      message,
      readings,
    },
  };
}
