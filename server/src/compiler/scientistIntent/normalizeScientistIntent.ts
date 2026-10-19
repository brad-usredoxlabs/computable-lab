/**
 * normalizeScientistIntent — fold a scientist-intent wire document into the
 * inputs the deterministic compiler already consumes:
 *
 *   • Geometric macros (serial_dilution, media_swap_duplicate_columns,
 *     source_wells_to_duplicate_target_columns, repeat_rows) become
 *     `ProtocolPatternIntent`s, which the existing
 *     `expand_protocol_intent_patterns` pass unrolls into primitive events.
 *
 *   • Every other action (biology verbs + centrifugation) becomes a
 *     `candidateEvents` entry `{ verb, ...params }` that the existing
 *     `expand_biology_verbs` pass lowers through the ~25 registered verb
 *     expanders (seed, incubate, read, wash, harvest, aliquot, spin, ...).
 *
 *   • Symbolic noun labels (source, target, labware) are carried forward as
 *     SYMBOLS (never resolved IDs / deck slots) so the existing
 *     resolve_labware / resolve_references / assurance loop binds them.
 *
 * The output object is shaped exactly like the `ai_precompile` pass output,
 * so the scientist-intent pipeline can seed `state.outputs['ai_precompile']`
 * and reuse the entire downstream deterministic stack unchanged.
 */
import type { ProtocolIntent, ProtocolPatternIntent } from '../protocolIntent/ProtocolIntent.js';
import type { ScientistIntent, ScientistIntentActionKind, ScientistIntentActionLocation } from './types.js';
import { defaultScientistIntentVocabulary, type ScientistIntentVocabulary } from './vocabulary.js';
// PARAM-FOLD-2 (W28-A5k Q1): the declared-optional-absence fold, consumed at
// the RAW SOURCE. The gaps channel (unresolvedRefs -> gatherGaps ->
// terminalArtifacts.gaps) and protocolIntent.unresolved are legitimate — a
// fact the data cannot settle SHOULD surface as a gap. What was illegitimate
// was feeding them the RAW parsed `intent.unresolved` set, which the pass-side
// fold is ruled to override: one fact, two contradictory verdicts. Folding
// here (the original data site, not a new suppression site) makes every
// downstream consumer — gatherGaps, computeOutcome, the UI surfaces — read
// the same truth the resolve_nouns pass reads. The leaf imports nothing from
// scientistIntent/ values and nothing from the pass module: acyclic.
import { foldDeclaredOptionalAbsentHedges } from '../resolution/declaredOptionalHedgeFold.js';
import { existsSync, readFileSync } from 'node:fs';
import { expandWellTokens } from '../../ai/wellRange.js';
import { parse as parseYaml } from 'yaml';

/** Well-address SHAPE test (not a range parser — expandWellTokens remains the
 *  ONE range parser). Parity-pinned to the canonical compiler WELL_RE
 *  (ChatbotCompilePasses.ts:2798, /^[A-P](1-24)$/): a physical plate-address
 *  fact, not domain policy. Exported so the parity pin test can compare the
 *  two sources of truth byte-for-byte (fix1/D4) — ChatbotCompilePasses.ts is
 *  out of this item's edit scope, so the canonical regex is NOT imported. */
export const WELL_ADDRESS_SHAPE_RE = /^[A-P](?:[1-9]|1[0-9]|2[0-4])$/;

/** Task 17 interim cue home (DATA): config/drafting/mixture-material-cues.yaml.
 *  Loaded PER call (the drafting-config precedent — never process-cached, so a
 *  cue edit needs no stack restart). Absent file/section ⇒ undefined ⇒ the
 *  interim blob bar is OFF — LOUD (fix1/D3: one console.warn naming the data
 *  home, never a silent fallback). Zero cue literals in TypeScript (repo rule
 *  #1): cue tokens, firing rules, shape patterns and thresholds are all DATA. */
const MIXTURE_CUES_PATH = new URL('../../../../config/drafting/mixture-material-cues.yaml', import.meta.url);

/** How one cue token is allowed to fire (declared per cue entry in the YAML).
 *  `substring` — the token itself is mixture shape (the spaced cues).
 *  `ratioAdjacent` — the token fires only when a DATA ratio/quantity pattern
 *  sits adjacent to one of its occurrences (the blob idiom names its ratio).
 *  `flankingComponents` — the token fires only when >= minComponents DATA
 *  component tokens flank that occurrence.
 *  A bare separator with NO declared firing rule is a data error (fix1/D1 is
 *  exactly the bare-substring over-match), so the loader REQUIRES one. */
const CUE_FIRE_MODES = ['substring', 'ratioAdjacent', 'flankingComponents'] as const;
type CueFireMode = (typeof CUE_FIRE_MODES)[number];

interface MixtureCueRule {
  token: string;
  firesOn: readonly CueFireMode[];
}

interface MixtureShapeRules {
  adjacencyWindowChars: number;
  ratioPatterns: readonly RegExp[];
  flanking: {
    minComponents: number;
    minComponentLength: number;
    componentPattern: RegExp;
    stopWords: ReadonlySet<string>;
  };
}

interface MixtureCueConfig {
  cues: readonly MixtureCueRule[];
  shape: MixtureShapeRules;
  /** CUE-EXEMPT-1: DATA-declared catalogued single-reagent labels that are
   *  NEVER mixture evidence (config `exempt:` section). Absent section ⇒ the
   *  property is absent (exactOptionalPropertyTypes: never `undefined`). */
  exemptNames?: readonly string[];
}

/** fix1/D3: the off-state must be LOUD. One warn per (path, reason) pair —
 *  the per-call load stays (spec-mandated), the diagnostic does not spam. */
const offStateWarned = new Set<string>();

function warnCueBarOff(path: string, reason: string): void {
  const key = `${path}\u0000${reason}`;
  if (offStateWarned.has(key)) return;
  offStateWarned.add(key);
  console.warn(`[mixture-cue-bar-off] ${reason} — the interim mixture-blob bar is OFF for every material. Cue data home: ${path}`);
}

function isSpacedToken(token: string): boolean {
  return token !== token.trim();
}

function parseCueEntry(entry: unknown, path: string): MixtureCueRule {
  const token = typeof entry === 'string' ? entry : null;
  if (token !== null) {
    if (!token.length) throw new Error(`mixture cue list (${path}): empty cue token`);
    if (!isSpacedToken(token)) {
      throw new Error(
        `mixture cue list (${path}): bare cue token "${token}" must declare a firing rule (firesOn: [ratioAdjacent|flankingComponents]) — a bare separator substring alone is not mixture evidence (fix1/D1)`,
      );
    }
    return { token, firesOn: ['substring'] };
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`mixture cue list (${path}): each cue entry must be a string or an object with \`token\``);
  }
  const rec = entry as Record<string, unknown>;
  if (typeof rec.token !== 'string' || !rec.token.length) {
    throw new Error(`mixture cue list (${path}): every cue object needs a non-empty \`token\``);
  }
  if (rec.firesOn === undefined || rec.firesOn === null) {
    if (!isSpacedToken(rec.token)) {
      throw new Error(
        `mixture cue list (${path}): bare cue token "${rec.token}" must declare firesOn — a bare separator substring alone is not mixture evidence (fix1/D1)`,
      );
    }
    return { token: rec.token, firesOn: ['substring'] };
  }
  if (!Array.isArray(rec.firesOn) || rec.firesOn.length === 0 || !rec.firesOn.every((m) => typeof m === 'string' && (CUE_FIRE_MODES as readonly string[]).includes(m))) {
    throw new Error(`mixture cue list (${path}): \`firesOn\` must be a non-empty list of ${CUE_FIRE_MODES.join(' | ')}`);
  }
  return { token: rec.token, firesOn: rec.firesOn as CueFireMode[] };
}

function parseShapeRules(raw: unknown, path: string): MixtureShapeRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape:\` must be an object (adjacencyWindowChars, ratioPatterns, flanking)`);
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.adjacencyWindowChars !== 'number' || !Number.isInteger(rec.adjacencyWindowChars) || rec.adjacencyWindowChars < 1) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape.adjacencyWindowChars\` must be a positive integer`);
  }
  if (!Array.isArray(rec.ratioPatterns) || rec.ratioPatterns.length === 0 || !rec.ratioPatterns.every((p) => typeof p === 'string' && p.length > 0)) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape.ratioPatterns\` must be a non-empty string list`);
  }
  const ratioPatterns = rec.ratioPatterns.map((p) => new RegExp(String(p), 'u'));
  const flankingRaw = rec.flanking;
  if (!flankingRaw || typeof flankingRaw !== 'object' || Array.isArray(flankingRaw)) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape.flanking\` must be an object (minComponents, minComponentLength, componentPattern, stopWords)`);
  }
  const f = flankingRaw as Record<string, unknown>;
  if (typeof f.minComponents !== 'number' || !Number.isInteger(f.minComponents) || f.minComponents < 1) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape.flanking.minComponents\` must be a positive integer`);
  }
  if (typeof f.minComponentLength !== 'number' || !Number.isInteger(f.minComponentLength) || f.minComponentLength < 1) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape.flanking.minComponentLength\` must be a positive integer`);
  }
  if (typeof f.componentPattern !== 'string' || !f.componentPattern.length) {
    throw new Error(`mixture cue list (${path}): \`mixtureShape.flanking.componentPattern\` must be a non-empty pattern string`);
  }
  const stopWords = new Set<string>(
    Array.isArray(f.stopWords) ? f.stopWords.filter((w): w is string => typeof w === 'string' && w.length > 0) : [],
  );
  return {
    adjacencyWindowChars: rec.adjacencyWindowChars,
    ratioPatterns,
    flanking: {
      minComponents: f.minComponents,
      minComponentLength: f.minComponentLength,
      // WHOLE-WORD test: the DATA pattern must match the entire token, so a
      // catalogue suffix like "F12" is not a component (an unanchored test
      // would match its leading letters and re-open the fix1/D1 over-match).
      componentPattern: new RegExp(`^(?:${String(f.componentPattern)})$`, 'u'),
      stopWords,
    },
  };
}

/** CUE-EXEMPT-1: parse the OPTIONAL `exempt:` section — the DATA-declared
 *  catalogued single-reagent names that are never mixture evidence. Genuinely
 *  absent section (no `exempt:` key / `exempt: null`) or a present-but-null
 *  `names:` ⇒ undefined ⇒ NO exemptions, SILENT (unlike the LOUD cue-off rule:
 *  the bar itself stays ON; only the exemption list is empty). A PRESENT
 *  object-shaped `exempt:` WITHOUT a `names:` key is a data error and throws
 *  naming the data path (adversarial D1: a typo'd key must not silently
 *  re-open the false bar this section exists to kill); every other malformed
 *  shape throws too (parity with the existing loader errors). Zero reagent
 *  literals here — TypeScript knows only "this label equals / whole-word-
 *  contains a DATA-declared exempt name". */
function parseExemptNames(raw: unknown, path: string): readonly string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`mixture cue list (${path}): \`exempt:\` must be an object with a \`names:\` list of catalogued single-reagent labels`);
  }
  const section = raw as Record<string, unknown>;
  if (!('names' in section)) {
    throw new Error(`mixture cue list (${path}): present \`exempt:\` section needs a \`names:\` list`);
  }
  const names = section.names;
  if (names === null) return undefined;
  if (!Array.isArray(names) || !names.every((n) => typeof n === 'string' && n.trim().length > 0)) {
    throw new Error(`mixture cue list (${path}): \`exempt.names\` must be a list of non-empty name strings (entries are names, not regexes)`);
  }
  return names as string[];
}

/** CUE-EXEMPT-1 matching rule (documented in the YAML): case-folded and
 *  whitespace-normalized, the label EQUALS an exempt entry, OR the entry holds
 *  inside the label as a WHOLE-WORD RUN — the entry's first/last characters
 *  may not sit inside a longer word (word chars are letters/digits/hyphens,
 *  the same alphabet the flanking arm treats as component words). Entries are
 *  names, not regexes: the entry is escaped before any pattern use.
 *  Adversarial D2 (orchestrator-amended rule): the exemption exists ONLY for
 *  a label that IS one catalogued single reagent. The CONTAINMENT arm applies
 *  only when the label carries NO ratio/quantity evidence anywhere — tested
 *  against the config's OWN `mixtureShape.ratioPatterns` DATA (zero new
 *  literals). A composite ratio blob that merely embeds the exempt phrase
 *  ("… Free Water + … (50:50)") is a blob again; the equality arm is
 *  unchanged. */
function normalizeCueLabel(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function isCueWordChar(char: string): boolean {
  return /[\p{L}\p{N}-]/u.test(char);
}

function isExemptMaterialLabel(
  label: string,
  exemptNames: readonly string[],
  ratioPatterns: readonly RegExp[],
): boolean {
  const normalizedLabel = normalizeCueLabel(label);
  // D2 ratio guard: ANY ratio/quantity match anywhere in the label is
  // ratio evidence — the containment arm then does not apply.
  const hasRatioEvidence = ratioPatterns.some((pattern) => pattern.test(normalizedLabel));
  return exemptNames.some((entry) => {
    const normalizedEntry = normalizeCueLabel(entry);
    if (!normalizedEntry.length) return false;
    if (normalizedLabel === normalizedEntry) return true;
    if (hasRatioEvidence) return false;
    let from = 0;
    for (;;) {
      const at = normalizedLabel.indexOf(normalizedEntry, from);
      if (at < 0) return false;
      const before = at === 0 ? '' : normalizedLabel.charAt(at - 1);
      const after = at + normalizedEntry.length >= normalizedLabel.length ? '' : normalizedLabel.charAt(at + normalizedEntry.length);
      if (!isCueWordChar(before) && !isCueWordChar(after)) return true;
      from = at + 1;
    }
  });
}

/** Load + validate the cue DATA. Absent file / absent-or-empty `cues:` ⇒
 *  undefined (bar OFF) WITH a loud warn naming the path (fix1/D3). A file that
 *  exists but is malformed still throws — malformed DATA is not an off-state.
 *  The `exempt:` section is OPTIONAL (CUE-EXEMPT-1): absent ⇒ no exemptions,
 *  silent; malformed ⇒ throws naming the path. */
export function loadMixtureCues(path: URL | string = MIXTURE_CUES_PATH): MixtureCueConfig | undefined {
  const displayPath = String(path);
  if (!existsSync(path)) {
    warnCueBarOff(displayPath, `cue data home not found (${displayPath})`);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`mixture cue list unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) {
    warnCueBarOff(displayPath, `cue data home (${displayPath}) is empty`);
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('mixture cue list must be an object with a `cues:` list');
  }
  const cues = (raw as Record<string, unknown>).cues;
  if (cues === undefined || cues === null) {
    warnCueBarOff(displayPath, `cue data home (${displayPath}) has no \`cues:\` section`);
    return undefined;
  }
  if (!Array.isArray(cues) || cues.length === 0) {
    warnCueBarOff(displayPath, `cue data home (${displayPath}) has an empty \`cues:\` list`);
    return undefined;
  }
  const shape = parseShapeRules((raw as Record<string, unknown>).mixtureShape, displayPath);
  const exemptNames = parseExemptNames((raw as Record<string, unknown>).exempt, displayPath);
  return {
    cues: cues.map((entry) => parseCueEntry(entry, displayPath)),
    shape,
    // exactOptionalPropertyTypes: the optional field rides by CONDITIONAL
    // SPREAD — an absent `exempt:` leaves the config byte-identical to today.
    ...(exemptNames !== undefined ? { exemptNames } : {}),
  };
}

function cueTokenOccurrences(value: string, token: string): number[] {
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const at = value.indexOf(token, from);
    if (at < 0) break;
    positions.push(at);
    from = at + token.length;
  }
  return positions;
}

/** DATA ratio/quantity adjacent to the cue occurrence (the blob idiom names
 *  its ratio next to its separator: "50:50 Trypsin-EDTA/DMEM",
 *  "Trypsin-EDTA/DMEM (50:50)"). */
function hasAdjacentRatio(value: string, occurrence: number, tokenLength: number, shape: MixtureShapeRules): boolean {
  const lo = Math.max(0, occurrence - shape.adjacencyWindowChars);
  const hi = Math.min(value.length, occurrence + tokenLength + shape.adjacencyWindowChars);
  const window = value.slice(lo, hi);
  return shape.ratioPatterns.some((pattern) => pattern.test(window));
}

/** DATA component tokens flanking the cue occurrence. A component is a whole
 *  word matching the DATA componentPattern, long enough, and not a DATA
 *  connective word — catalogue suffixes (F12, B27) carry digits and so are NOT
 *  components, which is what separates the single reagent "DMEM/F12" from the
 *  blob "Trypsin-EDTA/DMEM". */
function flankingComponentCount(value: string, occurrence: number, tokenLength: number, shape: MixtureShapeRules): number {
  const sides = [value.slice(0, occurrence), value.slice(occurrence + tokenLength)];
  const words = /\b[\p{L}\p{N}][\p{L}\p{N}-]*\b/gu;
  let count = 0;
  for (const side of sides) {
    for (const match of side.matchAll(words)) {
      const word = match[0];
      if (word.length < shape.flanking.minComponentLength) continue;
      if (!shape.flanking.componentPattern.test(word)) continue;
      if (shape.flanking.stopWords.has(word.toLowerCase())) continue;
      count += 1;
    }
  }
  return count;
}

/** The generic, DATA-driven shape test: which cues fire on this label. No
 *  reagent name, cue literal, or ratio literal appears in TypeScript.
 *  CUE-EXEMPT-1: a label matching a DATA-declared exempt name (the optional
 *  `exempt:` section — catalogued single reagents whose names merely contain a
 *  separator) is NOT mixture evidence at all; the exemption is checked BEFORE
 *  any cue fires, so it suppresses every firing arm generically. */
function mixtureCuesFound(value: string, config: MixtureCueConfig): string[] {
  if (config.exemptNames !== undefined && config.exemptNames.length > 0 && isExemptMaterialLabel(value, config.exemptNames, config.shape.ratioPatterns)) {
    return [];
  }
  const found: string[] = [];
  for (const cue of config.cues) {
    const occurrences = cueTokenOccurrences(value, cue.token);
    if (occurrences.length === 0) continue;
    const fired = cue.firesOn.some((mode) => {
      if (mode === 'substring') return true;
      if (mode === 'ratioAdjacent') return occurrences.some((at) => hasAdjacentRatio(value, at, cue.token.length, config.shape));
      return occurrences.some((at) => flankingComponentCount(value, at, cue.token.length, config.shape) >= config.shape.flanking.minComponents);
    });
    if (fired) found.push(cue.token);
  }
  return found;
}

/** SPINE-7 fix1/D1: stable reason code for a schema-valid SCALAR well-label
 *  that the lowering chain has NO consumer for (the source-well family: no
 *  shipped pass maps a source-side label to addresses — the only role consumer
 *  is `details.role` at ChatbotCompilePasses.ts:2391). Dropping it silently is
 *  silent data loss; the producer emits this structured clarification instead
 *  and the compile runner bars atomically (422 needs-clarification arm). */
export const UNREALIZED_WELL_LABEL_REASON = 'unrealized-well-label' as const;

/** COMP-1 Task 16 (Part III D4): stable reason code for a declared
 *  argument VALUE the lowering chain cannot carry to any emitted event (the
 *  proven-lossy shapes: a `volume` that is neither a number nor a
 *  {value, unit} quantity object; a literal-address claim on a verb with no
 *  declared wells contract whose tokens are not well addresses). Same envelope
 *  as the well-label bar: producer clarification → atomic 422 arm, never 500,
 *  never a silent 'complete'.
 *  TODO(COMP-2/general model): full declared-argument reachability
 *  — every vocabulary-declared arg compared against the consumer keys of the
 *  downstream pass that lowers it. Scoped here to the vocabulary's
 *  `kind: quantity` contracts + the undeclared-wells address claim (the two
 *  proven-lossy args, volume + scalar targetWells) per the spec. */
export const UNREALIZED_DECLARED_ARGUMENT_REASON = 'unrealized-declared-argument' as const;

/** COMP-1 Task 17 interim (Part III D1): stable reason code for a
 *  mixture-shaped `material` label (cue-shaped per the DATA cue list in
 *  config/drafting/mixture-material-cues.yaml) with NO declared
 *  components. The shipped rule it bars for (AddMaterialSupport.ts: "A bare
 *  concept in a well is never right. Materialize it: a composition or a
 *  concept+concentration → a formulation (material-spec)") means the blob must
 *  never reach an event where the grounding door
 *  (ensureLocalMaterialForDraft, MaterialGrounding.ts:199, reached via
 *  normalizeCompositionMaterialRefs, AddMaterialSupport.ts:385-390) would mint
 *  it as ONE blob-named material record. Interim until Part I's composition
 *  form decomposes it. */
export const MIXTURE_BLOB_MATERIAL_REASON = 'unrealized-mixture-blob-material' as const;

export type UnrealizedProducerReason =
  | typeof UNREALIZED_WELL_LABEL_REASON
  | typeof UNREALIZED_DECLARED_ARGUMENT_REASON
  | typeof MIXTURE_BLOB_MATERIAL_REASON;

/** One producer clarification (exactOptionalPropertyTypes: `message` is
 *  absent-or-value, built by conditional spread only). */
export interface ProducerClarification {
  label: string;
  reason: UnrealizedProducerReason;
  actionLocation: ScientistIntentActionLocation;
  message?: string;
}

export interface NormalizeOptions {
  /** SPINE-7 fix1/D4: the vocabulary instance the compile threads into
   *  resolve_nouns. Wells-arg detection MUST use the SAME instance the engine
   *  reads — never the default singleton behind an injected vocab. */
  vocabulary?: ScientistIntentVocabulary;
  /** fix1/D3: override for the mixture-cue DATA home (same injection pattern
   *  as `vocabulary` above). Defaults to the shipped
   *  config/drafting/mixture-material-cues.yaml. Lets a deployment point the
   *  bar at another cue file and lets tests pin the LOUD off-state (absent
   *  file ⇒ bar OFF + one console.warn naming the path, never silent). */
  mixtureCuesPath?: URL | string;
}

export interface ScientistIntentNormalized {
  protocolIntent?: ProtocolIntent;
  candidateEvents: Array<{ verb: string; [key: string]: unknown }>;
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>;
  /** SPINE-7 fix1/D1 (additive): structured clarifications the producer emits
   *  when a schema-valid value has no lowering consumer. The compile runner
   *  bars atomically on them (422 arm, never 500). */
  clarifications?: ProducerClarification[];
  /** SH-QA-1 (OQ1 ruling: channel split): producer facts whose firing depends
   *  on whether the resolution engine BINDS their slot — resolve-vs-mint is
   *  NOT known at raise time (normalize runs before the pipeline). The blob
   *  bar rides this gated channel; `createResolveNounsPass` decides its fate
   *  with the engine's boundKeys join. Everything else stays on
   *  `clarifications` byte-identically. Conditional spread only. */
  resolutionGatedClarifications?: ProducerClarification[];
}

/** Actions covered by the geometric-macro pattern expanders — DERIVED from the
 *  vocabulary YAML's declared class field (Q3 ruling; no hand-maintained set). */
const PATTERN_ACTIONS: ReadonlySet<string> = defaultScientistIntentVocabulary().patterns();

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

/** Names WHICH key supplied the first present value (SPINE-7 needs the source
 *  key to tell a declared wells argument from a raw candidate param). */
function firstKeyed(record: Record<string, unknown>, keys: string[]): { key: string; value: unknown } | undefined {
  for (const key of keys) {
    if (record[key] !== undefined) return { key, value: record[key] };
  }
  return undefined;
}

/** Vocabulary-derived identity of a verb's declared `kind: wells` argument
 *  names (data, never a verb/field table). SPINE-7 fix2/D1: the candidate
 *  branch AND the pattern branch share this ONE declared-wells-arg detection
 *  so a scalar label is classified identically on either route. */
function declaredWellsArgs(verb: string, vocabulary: ScientistIntentVocabulary): Set<string> {
  return new Set(
    vocabulary
      .argContracts(verb)
      .filter((contract) => contract.kind === 'wells')
      .map((contract) => contract.name),
  );
}

/** SPINE-7 fix2/D1 (adversarial l2t1110 cycle-2 D1): a SCALAR on a declared
 *  kind:wells argument of a PATTERN verb. The pattern lowering path has NO
 *  role consumer — `expand_protocol_intent_patterns` reads pattern wells as
 *  LITERAL addresses (ProtocolIntentPatternExpanders.ts:137/:167), pattern-
 *  expanded events never carry `details.role`, and resolve_roles substitutes
 *  engine addresses only via `details.role` (ChatbotCompilePasses.ts:2391).
 *  Realizing a symbolic label into the pattern's wells would fabricate a
 *  well address the engine never bound (and telling label from address would
 *  need a hardcoded policy — forbidden). So, per the fix-run-1 rule (realize
 *  only where a consumer genuinely exists downstream; clarify otherwise), the
 *  producer emits the SAME structured unrealized-well-label clarification the
 *  candidate branch emits — the compile runner bars atomically on the 422
 *  needs-clarification arm instead of shipping 'complete' with a dropped
 *  label. Array forms pass through untouched (byte-identical pins). */
function unrealizedPatternWellLabels(
  action: Record<string, unknown>,
  verb: string,
  actionIndex: number,
  vocabulary: ScientistIntentVocabulary,
  unrealized: ProducerClarification[],
): void {
  for (const argument of declaredWellsArgs(verb, vocabulary)) {
    const value = action[argument];
    if (Array.isArray(value)) continue;
    if (typeof value === 'string' && value.trim()) {
      unrealized.push({
        label: value.trim(),
        reason: UNREALIZED_WELL_LABEL_REASON,
        actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument },
      });
    }
  }
}

function toPattern(
  action: Record<string, unknown>,
  kind: string,
  index: number,
): ProtocolPatternIntent {
  const id = `pattern-${index}`;
  const params: Record<string, unknown> = {};
  for (const key of ['factor', 'points', 'replicates', 'volumeUl', 'cycles', 'temperatureC', 'rpm'] as const) {
    const v = action[key];
    if (typeof v === 'number') params[key] = v;
  }
  if (typeof action.ratio === 'string') params['ratio'] = action.ratio;
  if (typeof action.volume !== 'undefined') params['volume'] = action.volume;
  if (action.params && typeof action.params === 'object') {
    for (const [k, v] of Object.entries(action.params as Record<string, unknown>)) {
      params[k] = v;
    }
  }
  if (typeof action.targetHint === 'string') params['targetHint'] = action.targetHint;
  if (typeof action.labwareHint === 'string') params['labwareHint'] = action.labwareHint;
  return {
    id,
    kind: kind as ProtocolPatternIntent['kind'],
    ...(firstString(action, ['source', 'sourceHint']) ? { sourceLabware: firstString(action, ['source', 'sourceHint']) } : {}),
    ...(firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) ? { targetLabware: firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) } : {}),
    ...(Array.isArray(action.sourceWells) ? { sourceWells: action.sourceWells as string[] } : {}),
    ...(Array.isArray(action.targetWells) ? { targetWells: action.targetWells as string[] } : {}),
    ...(Object.keys(params).length > 0 ? { params } : {}),
  } as unknown as ProtocolPatternIntent;
}

function serialDilutionPattern(action: Record<string, unknown>, index: number): ProtocolPatternIntent {
  const params: Record<string, unknown> = {};
  if (typeof action.factor === 'number') params['factor'] = action.factor;
  if (typeof action.points === 'number') params['points'] = action.points;
  if (typeof action.replicates === 'number') params['replicates'] = action.replicates;
  if (typeof action.volumeUl === 'number') params['volumeUl'] = action.volumeUl;
  if (typeof action.volume === 'number') params['volumeUl'] = action.volume;
  if (typeof action.ratio === 'string') params['ratio'] = action.ratio;
  if (typeof action.temperatureC === 'number') params['temperatureC'] = action.temperatureC;
  if (typeof action.target === 'string') params['targetHint'] = action.target;
  if (typeof action.source === 'string') params['sourceHint'] = action.source;
  return {
    id: `pattern-${index}`,
    kind: 'serial_dilution',
    ...(firstString(action, ['source', 'sourceHint']) ? { sourceLabware: firstString(action, ['source', 'sourceHint']) } : {}),
    ...(firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) ? { targetLabware: firstString(action, ['target', 'targetHint', 'labware', 'labwareHint']) } : {}),
    ...(Array.isArray(action.targetWells) ? { targetWells: action.targetWells as string[] } : {}),
    params,
  } as ProtocolPatternIntent;
}

function toCandidateEvent(
  action: Record<string, unknown>,
  actionIndex: number,
  vocabulary: ScientistIntentVocabulary,
  unrealized: ProducerClarification[],
  // SH-QA-1: the blob bar's gated channel — the cue MATCH stays here (the cue
  // data is loaded here); only the firing DECISION moves to the resolve_nouns
  // pass, where the engine's bindings are known.
  gated: ProducerClarification[],
  mixtureCues: MixtureCueConfig | undefined,
): { verb: string; [key: string]: unknown } {
  const verb = (action.action as string) ?? 'unknown';
  const event: { verb: string; [key: string]: unknown } = { verb };

  // symbolic labware labels — deterministics resolve these later
  const source = firstString(action, ['source', 'sourceHint']);
  const target = firstString(action, ['target', 'targetHint']);
  const labware = firstString(action, ['labware', 'labwareHint']);
  if (source) event.source_labware = source;
  if (target) {
    event.destination_labware = target;
    event.target_labware_id = target;
  }
  if (labware) {
    event.labware = labware;
    event.labware_id = labware;
  }

  // standardized param keys the verb expanders read
  const mappings: Array<[string, string[]]> = [
    ['material', ['material', 'source_name']],
    ['volume_uL', ['volumeUl']],
    ['volume', ['volume']],
    ['cycles', ['cycles']],
    ['duration', ['duration']],
    ['temperature', ['temperatureC']],
    ['rpm', ['rpm']],
    ['mode', ['mode']],
    ['wavelength', ['wavelength']],
    ['instrument', ['instrument']],
    ['assayId', ['assayId']],
    ['readout', ['readout']],
    ['factor', ['factor']],
    ['points', ['points']],
    ['replicates', ['replicates']],
    ['source_wells', ['sourceWells']],
    ['wells', ['targetWells', 'wells']],
  ];
  // SPINE-7 role-carrying lowering (scientist-intent chain ONLY): which
  // argument names are DECLARED wells contracts comes from the vocabulary
  // (data), never a verb/field table. SPINE-7 fix1/D4: the SAME vocabulary
  // instance the compile threads into resolve_nouns (never the singleton
  // behind an injected vocab). SPINE-7 fix2/D1: the SAME helper the pattern
  // branch uses (declaredWellsArgs).
  const wellsLabelArgs = declaredWellsArgs(verb, vocabulary);
  for (const [eventKey, sciKeys] of mappings) {
    const found = firstKeyed(action, sciKeys);
    if (found === undefined) continue;
    // A SCALAR on a declared kind:wells argument is a symbolic well LABEL, not
    // an address array. The well-position family ('wells') carries the label as
    // candidate `wellRole` — a producer key written ONLY on this chain (the
    // chatbot chain's candidates never carry it, so chatbot lowering stays
    // byte-identical). The transfer/aliquot expanders lower wellRole into event
    // details.role — the exact key the resolve_roles authoritative seam
    // (ChatbotCompilePasses.ts :2391/:2410) looks up in the resolve_nouns
    // slot's resolvedByLabel (keyed by the engine-bound LABEL), so the emitted
    // wells EQUAL the engine binding's addresses. Array forms pass through
    // verbatim.
    if (typeof found.value === 'string' && found.value.trim() && wellsLabelArgs.has(found.key)) {
      if (eventKey === 'wells') {
        event.wellRole = found.value.trim();
        continue;
      }
      // SPINE-7 fix1/D1 (orchestrator fallback (b), chosen because symmetric
      // realization is impossible under this item's constraints): the source
      // family has NO role consumer — the resolve_roles seam resolves exactly
      // ONE role per event (details.role -> details.well, a DESTINATION-side
      // coordinate; ChatbotCompilePasses.ts :2391-2454). Realizing a source-side
      // label would need a new source-role consumer in ChatbotCompilePasses.ts
      // (untouchable per the fix brief) or a new (verb,arg)->role-key TS table
      // (new hardcoded policy — forbidden). Silently dropping a schema-valid
      // scalar the engine already bound is silent data loss, so the producer
      // emits a structured clarification instead: the compile runner bars
      // atomically on it (422 needs-clarification arm, never 500).
      unrealized.push({
        label: found.value.trim(),
        reason: UNREALIZED_WELL_LABEL_REASON,
        // Candidate-chain verbs are non-pattern wire verbs — all members of the
        // schema's 31-verb union (ScientistIntentActionKind); the parse layer
        // already enforced that enum before this point.
        actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument: found.key },
      });
      continue;
    }
    event[eventKey] = found.value;
  }

  // carry open params through (verb expanders may read extra fields)
  if (action.params && typeof action.params === 'object') {
    for (const [k, v] of Object.entries(action.params as Record<string, unknown>)) {
      if (event[k] === undefined) event[k] = v;
    }
  }

  // COMP-4 Stage B: a DECLARED `cardinality: many` argument (DATA:
  // argContracts — membership from the vocabulary, no key literal here) rides
  // onto the candidate event under its declared name. The chatbot chain hands
  // the WHOLE candidate to the verb expander as `params`
  // (ChatbotCompilePasses.ts:1091), so the expander's existing
  // compositionSnapshotFromParams(params.composition, …) consumes the declared
  // action-level form with NO expander-side name knowledge. The params
  // passthrough above wins when both forms are present (Part I byte-honesty).
  for (const contract of vocabulary.argContracts(verb)) {
    if (contract.cardinality !== 'many') continue;
    const value = action[contract.name];
    if (Array.isArray(value) && value.length > 0 && event[contract.name] === undefined) {
      event[contract.name] = value;
    }
  }

  // ── COMP-1 Task 16 (Part III D4): declared-argument reachability ──
  // A declared value the lowering chain CANNOT carry to any emitted event bars
  // with a structured producer clarification (same envelope as the well-label
  // bar) instead of riding silently into a 'complete' compile. Scoped to the
  // two proven-lossy shapes (spec); the general model is the TODO on
  // UNREALIZED_DECLARED_ARGUMENT_REASON.
  //
  // (a) A vocabulary-declared `kind: quantity` argument (DATA: argContracts)
  //     whose value is neither a number (the expander's bare-number arm) nor a
  //     {value: number, unit: string} quantity object (the expander's declared
  //     object arm) reaches no expander consumer — e.g. `volume: 50 uL` (a
  //     string). Today: silently gone.
  for (const contract of vocabulary.argContracts(verb)) {
    if (contract.kind !== 'quantity') continue;
    const value = action[contract.name];
    if (value === undefined) continue;
    const quantityObject =
      value !== null && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).value === 'number'
      && typeof (value as Record<string, unknown>).unit === 'string';
    if (typeof value === 'number' || quantityObject) continue;
    unrealized.push({
      label: typeof value === 'string' ? value.trim() : JSON.stringify(value),
      reason: UNREALIZED_DECLARED_ARGUMENT_REASON,
      actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument: contract.name },
    });
  }

  // (b) A SCALAR well claim on a verb with NO declared kind:wells argument
  //     (add_material — Part III D3): the value is a LITERAL address claim,
  //     not a symbolic label (the symbolic branch above only exists for
  //     declared wells contracts). A compact range / address list is carried
  //     by the expander's ONE parser (expandWellTokens, simpleVerbs Task 15);
  //     anything that is not a well address has no consumer and would ship a
  //     fabricated well — bar it instead.
  if (wellsLabelArgs.size === 0) {
    const wellsClaim = firstKeyed(action, ['targetWells', 'wells']);
    if (wellsClaim && typeof wellsClaim.value === 'string' && wellsClaim.value.trim()) {
      const tokens = expandWellTokens([wellsClaim.value.trim()]);
      if (!tokens.every((token) => WELL_ADDRESS_SHAPE_RE.test(token))) {
        unrealized.push({
          label: wellsClaim.value.trim(),
          reason: UNREALIZED_DECLARED_ARGUMENT_REASON,
          actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument: wellsClaim.key },
        });
      }
    }
  }

  // ── COMP-1 Task 17 interim (Part III D1): the blob bar ──
  // A mixture-shaped `material` label (cue-shaped per the DATA cue list —
  // config/drafting/mixture-material-cues.yaml, zero cue literals
  // here) with NO declared components must never reach an event: the store-
  // write grounding door (ensureLocalMaterialForDraft, MaterialGrounding.ts:199
  // via normalizeCompositionMaterialRefs, AddMaterialSupport.ts:385-390) would
  // mint the blob as ONE recipe-named material record — the inverse of the
  // shipped rule the bar cites. A label WITH declared components
  // (params.composition — Part I's form, schema-valid today) passes untouched.
  if (mixtureCues && mixtureCues.cues.length > 0) {
    const declaresMaterial = vocabulary.argContracts(verb).some((contract) => contract.name === 'material');
    const materialValue = action.material;
    const paramsRecord = action.params && typeof action.params === 'object' && !Array.isArray(action.params)
      ? (action.params as Record<string, unknown>)
      : undefined;
    const declaresComponents =
      (Array.isArray(paramsRecord?.composition) && (paramsRecord!.composition as unknown[]).length > 0)
      // COMP-4 Stage B: the exemption ALSO honors a DECLARED
      // action-level many-arg (vocabulary DATA: cardinality many — the same
      // contract the resolve_nouns door iterates). A label+declared-arg
      // mixture must NOT double-bar.
      || vocabulary.argContracts(verb).some(
        (contract) =>
          contract.cardinality === 'many'
          && Array.isArray(action[contract.name])
          && (action[contract.name] as unknown[]).length > 0,
      );
    if (declaresMaterial && typeof materialValue === 'string' && materialValue.trim() && !declaresComponents) {
      // fix1/D1: the cue list is structured DATA — each token declares how it
      // may fire (substring for the spaced cues; ratio-adjacency and/or
      // flanking-component evidence for the bare separators). A bare separator
      // or a bare "%" is NOT mixture evidence on its own.
      const cuesFound = mixtureCuesFound(materialValue, mixtureCues);
      if (cuesFound.length > 0) {
        // SH-QA-1 (OQ1 ruling): the blob fact rides the GATED channel — the
        // resolve_nouns pass drops it iff the engine BINDS this slot (a
        // catalogued formulation label that merely carries a spaced cue is
        // moot evidence; an unbound cue-bearing label still bars). The cue
        // MATCH above stays 100% DATA; only the fate moved.
        gated.push({
          label: materialValue.trim(),
          reason: MIXTURE_BLOB_MATERIAL_REASON,
          actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument: 'material' },
          message: `The material "${materialValue.trim()}" names a recipe, not a component (mixture cues found: ${cuesFound.map((c) => `"${c}"`).join(', ')}). A bare concept in a well is never right — materialize it: declare the components (params.composition) or name a single material; a composition becomes a formulation (material-spec).`,
        });
      }
    }
  }

  return event;
}

export function normalizeScientistIntent(
  intent: ScientistIntent,
  options?: NormalizeOptions,
): ScientistIntentNormalized {
  const vocabulary = options?.vocabulary ?? defaultScientistIntentVocabulary();
  const patterns: ProtocolPatternIntent[] = [];
  const candidateEvents: Array<{ verb: string; [key: string]: unknown }> = [];
  const unresolvedRefs: Array<{ kind: string; label: string; reason: string }> = [];
  // SPINE-7 fix1/D1: scalar well-labels the lowering chain cannot realize
  // (see toCandidateEvent) — surfaced as structured clarifications, never
  // silently dropped. COMP-1 Task 16/17 adds the declared-argument
  // and mixture-blob bars on the SAME channel.
  const unrealized: ProducerClarification[] = [];
  // SH-QA-1: the blob bar's gated channel (see ScientistIntentNormalized
  // .resolutionGatedClarifications — the resolve_nouns pass decides).
  const gated: ProducerClarification[] = [];
  // Task 17 interim cue list: DATA from config/drafting/mixture-material-cues.yaml,
  // loaded PER call — the drafting-config precedent (never process-cached, so a
  // cue edit needs no stack restart). Absent file/section ⇒ undefined ⇒ the
  // interim bar is OFF — LOUD (fix1/D3: one console.warn naming the path).
  const mixtureCues = loadMixtureCues(options?.mixtureCuesPath ?? MIXTURE_CUES_PATH);
  // PARAM-FOLD-2 (W28-A5k Q1): ONE fold call over the raw parsed unresolved
  // set, at the top of the unresolved handling. The fold is pure over the
  // parsed intent + the vocabulary (both already in hand — the compile threads
  // the SAME vocabulary instance here it threads into resolve_nouns) and
  // needs no engine output, so early application is lossless. The folded
  // array feeds BOTH raw consumers below (the unresolvedRefs loop and
  // protocolIntent.unresolved). The fold is idempotent: the resolve_nouns pass
  // re-folds the same set later on the compile path and the second
  // application is a no-op by construction.
  const foldedUnresolved = foldDeclaredOptionalAbsentHedges(intent, vocabulary, intent.unresolved);
  // every distinct symbolic noun label becomes a candidate labware resource so
  // ProtocolIntent validation + resolve_labware can bind it downstream.
  const symbolicLabels = new Map<string, string>(); // label -> role hint

  intent.actions.forEach((action, index) => {
    const rec = action as unknown as Record<string, unknown>;
    const verb = String(rec.action ?? '');

    const source = firstString(rec, ['source', 'sourceHint']);
    const target = firstString(rec, ['target', 'targetHint']);
    const labware = firstString(rec, ['labware', 'labwareHint']);

    if (source && !PATTERN_ACTIONS.has(verb)) updateSymbol(symbolicLabels, source, 'source');
    if (target) updateSymbol(symbolicLabels, target, verb === 'harvest' || verb === 'passage' || verb === 'transfer' ? 'target' : 'target');
    if (labware) updateSymbol(symbolicLabels, labware, 'labware');

    if (PATTERN_ACTIONS.has(verb)) {
      // SPINE-7 fix2/D1: a scalar on a declared kind:wells arg of a pattern
      // verb has NO lowering consumer (pattern wells are literal addresses;
      // pattern events never carry details.role) — surface it as the same
      // structured unrealized-well-label clarification instead of dropping it
      // while the compile reports 'complete'.
      unrealizedPatternWellLabels(rec, verb, index, vocabulary, unrealized);
      const pattern = verb === 'serial_dilution'
        ? serialDilutionPattern(rec, index)
        : toPattern(rec, verb, index);
      if (pattern.sourceLabware) updateSymbol(symbolicLabels, pattern.sourceLabware, 'source');
      if (pattern.targetLabware) updateSymbol(symbolicLabels, pattern.targetLabware, 'target');
      patterns.push(pattern);
    } else {
      candidateEvents.push(toCandidateEvent(rec, index, vocabulary, unrealized, gated, mixtureCues));
    }
  });

  const labwareInstances = Array.from(symbolicLabels.entries()).map(([label, role]) => ({
    // id === the symbolic label so pattern/op refs (which carry the raw symbol)
    // resolve against validation's labware id-index. resolve_labware uses the
    // hint to bind a real labware-instance record.
    id: label,
    labwareHint: label,
    ...(role === 'source' ? { role: 'source' as const } : {}),
    ...(role === 'target' || role === 'destination' ? { role: 'target' as const } : {}),
    resolutionStatus: 'candidate' as const,
  }));

  for (const fact of foldedUnresolved) {
    unresolvedRefs.push({
      kind: 'unresolved_symbol',
      label: fact.label,
      reason: fact.reason,
    });
  }

  const protocolIntent: ProtocolIntent | undefined = patterns.length > 0 || labwareInstances.length > 0
    ? {
        kind: 'protocol_intent',
        version: '0.1.0',
        intentId: intent.intentId,
        ...(intent.sourcePrompt ? { sourcePrompt: intent.sourcePrompt } : {}),
        steps: [],
        resources: {
          labwareInstances,
          materialDefinitions: [],
          materialFormulations: [],
          materialAliquots: [],
          pipettes: [],
          tips: [],
          waste: [],
        },
        operations: [],
        patterns,
        assumptions: [],
        unresolved: foldedUnresolved.map((fact) => ({
          id: `unresolved-${fact.label}`,
          kind: 'operation' as const,
          label: fact.label,
          reason: fact.reason,
          blocksLowering: false,
        })),
      }
    : undefined;

  return {
    ...(protocolIntent ? { protocolIntent } : {}),
    candidateEvents,
    unresolvedRefs,
    ...(unrealized.length > 0 ? { clarifications: unrealized } : {}),
    // SH-QA-1: the gated blob facts ride their own channel (conditional
    // spread only — exactOptionalPropertyTypes: absent, never `undefined`).
    ...(gated.length > 0 ? { resolutionGatedClarifications: gated } : {}),
  };
}

function updateSymbol(map: Map<string, string>, label: string, roleHint: string): void {
  const existing = map.get(label);
  map.set(label, existing ?? roleHint);
}