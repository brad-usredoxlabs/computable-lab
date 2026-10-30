/**
 * WELLSET-RESOLVER-1 — the server-side CONTENTS-DERIVED wellset resolver.
 *
 * A `kind: wellset` argument (declared in the scientist-intent vocabulary DATA)
 * carries a symbolic wellset TOKEN (a member of the vocabulary's
 * `wellsetValueTokens` list — the contents-derived set), never a well list. This
 * module resolves that token to a concrete well set SERVER-SIDE from the run's
 * contents ledger and returns the set PLUS the labware binding (Q3 fold: a
 * contents-derived wellset resolver must know WHICH labware it inspects).
 *
 * DATA / no-branch doctrine (the item's hard rules):
 * - Token MEMBERSHIP is vocabulary DATA: `vocabulary.wellsetValueTokens()`
 *   decides which argument values are declared tokens. This module never
 *   string-literal-compares a token (the B3 boundary).
 * - WELLSET-ARG membership is vocabulary DATA: `argContracts(verb)` +
 *   `kind === 'wellset'` decides which arguments are wellset carriers. There
 *   is NO `verb === 'mix'` branch and NO per-verb table.
 * - MATERIAL-BEARING event types are vocabulary DATA (FIX RUN 1 / advc D8):
 *   `vocabulary.materialBearingEventTypes()` decides which pending events
 *   contribute contents — the TS carries no hardcoded taxonomy.
 * - No hardcoded well list: the well set is derived from the ledger (the
 *   contents map + the current document's material events); well addresses are
 *   only ever PARSED (row/column), never enumerated by hand.
 *
 * IDENTITY (FIX RUN 1 / advc D1 — the blocker): the pending-draft layer and the
 * committed layer share ONE identity space. A pending event's labwareId is the
 * SYMBOLIC hint the expander emits (simpleVerbs.ts `labwareId =
 * params.labware_id ?? params.labware`); the committed layer keys by instanceId.
 * buildContentsLedger folds a pending hint onto a resolved identity through
 * declared evidence ONLY, in this order:
 *   1. the hint IS a committed instance id (the live create/add sequence keys
 *      both by the same id; the instance's own contents arrive pending);
 *   2. the document RESOLVES the hint — the resolve_nouns slot's authoritative
 *      binding or the resolve_labware slot's recordId for that hint;
 *   3. the hint names the labware TYPE of EXACTLY ONE contents-carrying
 *      committed instance (the mint_materials / lab_state labwareType-match
 *      precedent).
 * An unmappable hint creates NO second labware silently: it stays an UNRESOLVED
 * bucket which the resolver counts toward the never-guess arm (so an answered
 * card can never silently narrow or widen the set), and it NEVER appears as a
 * card candidate (D11 — candidates are resolved records only).
 * A labware id is treated as a scientist PIN ONLY when it is a resolved
 * identity (a committed instance id or a resolve_nouns/resolve_labware record
 * id) — NEVER a symbolic hint.
 *
 * Never-guess: a contents set spanning more than one labware (or touching an
 * unmappable bucket) is AMBIGUOUS — ZERO wells are materialized and the caller
 * raises ONE clarification. ANSWER LEG (FIX RUN 1 / advc D2): the ambiguity
 * fact rides the EXISTING readings mechanism (the READING-CARD-ANSWER-1
 * structural arm) with the resolved records as its option set; the scientist's
 * answer flows back as the §14.2 `scientistAnswers` DATA map (key = the fact's
 * own label = the token, value = the chosen record id) and re-pins the
 * resolution in this module — the recompile converges, it never re-fires.
 *
 * The resolution is pure over its inputs (ledger + events + candidates +
 * vocabulary) so the unit legs (3-6) can drive it over a fixture ledger
 * directly; the pipeline pass is a thin adapter over it.
 */
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { LabStateSnapshot } from '../state/LabState.js';
import { emptyLabState } from '../state/LabState.js';
import type { ScientistIntentVocabulary } from './vocabulary.js';

/** The OQ-3 ruling: the NEW reason-code constant for an AMBIGUOUS contents
 *  set (two or more labware carrying materials). It rides the EXISTING
 *  ScientistIntentUnresolvedFact envelope (the UNREALIZED_WELL_LABEL_REASON
 *  precedent) — no second channel, no new emission type. */
export const AMBIGUOUS_CONTENTS_WELLSET_REASON = 'ambiguous-contents-wellset' as const;

/** FIX RUN 2 (advc D12): the second NEVER-SILENT reason code on the SAME
 *  ScientistIntentUnresolvedFact envelope (the OQ-3 precedent governs the
 *  channel: existing envelope, no second emission type; the reason string is
 *  carried DATA — clarificationsFromUnresolvedFacts reads it generically).
 *  Raised when the resolver HOLDS a token + a computed contents set but
 *  cannot attribute the token to one emitted event (provenance join failed or
 *  absent) — the token is NEVER dropped silently: silence here is the exact
 *  vacuous-green artifact Acceptance 2 calls an acceptance failure. */
export const UNATTRIBUTED_WELLSET_TOKEN_REASON = 'unattributed-wellset-token' as const;

/** The row letters of a standard 8-row plate (A..H) — used ONLY to test that a
 *  column group is a FULL 8-row column (the 8-channel shape). Well-address
 *  arithmetic, not a hardcoded well list. */
const PLATE_ROW_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Parse a well address into {row, col}. Generic well math — undefined for
 *  anything that is not a row-letter + column-number address. */
export function parseWellAddress(well: string): { row: string; col: number } | undefined {
  const m = /^([A-Za-z]+)(\d+)$/.exec(well.trim());
  if (!m) return undefined;
  const row = m[1]!.toUpperCase();
  const col = parseInt(m[2]!, 10);
  if (!Number.isFinite(col) || col < 1) return undefined;
  return { row, col };
}

/** Group a well set by column and report the column-aligned 8-channel shape.
 *  A column is FULL when every plate row letter (A..H) is present at that
 *  column. The set is COLUMN-ALIGNED 8-CHANNEL when there is at least one
 *  column and EVERY column is full (each column = one 8-channel op). A
 *  single-channel flattening (a 96-well single-well interpretation) is the
 *  non-full case the B8 mirror pins. */
export function columnAlignedGroups(
  wells: readonly string[],
): { full: boolean; columns: string[][] } {
  const byCol = new Map<number, Set<string>>();
  for (const w of wells) {
    const pc = parseWellAddress(w);
    if (!pc) return { full: false, columns: [] };
    if (!byCol.has(pc.col)) byCol.set(pc.col, new Set());
    byCol.get(pc.col)!.add(pc.row);
  }
  if (byCol.size === 0) return { full: false, columns: [] };
  const columns: string[][] = [];
  let full = true;
  for (const [col, rows] of byCol) {
    const sorted = [...rows].sort();
    columns.push(sorted.map((r) => `${r}${col}`));
    if (sorted.length !== PLATE_ROW_LETTERS.length ||
        !PLATE_ROW_LETTERS.every((r) => rows.has(r))) {
      full = false;
    }
  }
  columns.sort((a, b) => {
    const ca = parseWellAddress(a[0] ?? '');
    const cb = parseWellAddress(b[0] ?? '');
    return (ca?.col ?? 0) - (cb?.col ?? 0);
  });
  return { full, columns };
}

/** One resolved labware record in the shared identity space (FIX RUN 1 / D1 +
 *  D11): the ambiguity card's candidates are these records ONLY — never a
 *  symbolic hint. */
export interface LabwareRecordView {
  instanceId: string;
  title: string;
  /** The contents well count on this record (card-option snippet data). */
  wellCount?: number;
}

export interface ContentsLedger {
  /** resolved identity (or unresolved hint) -> the set of wells carrying
   *  material on that labware. A physical plate has ONE bucket — the pending
   *  hint is folded onto the committed identity before keying (see
   *  buildContentsLedger); an unmappable hint keeps its own bucket AND is
   *  listed in `unresolvedHints`. */
  byLabware: Map<string, Set<string>>;
  /** The flat union of all contents-bearing wells. */
  wells: Set<string>;
  /** The pending-draft buckets the ledger could NOT fold onto a resolved
   *  identity. NEVER silently a second labware: the resolver counts these
   *  toward the never-guess arm so a resolved candidate set can never form
   *  while the document's plate identity is still open (D1). */
  unresolvedHints: Set<string>;
  /** The resolved labware RECORDS carrying contents (the candidate-card shape,
   *  D11): every bucket whose key is a resolved identity (committed instance id or a
   *  slot-resolved record id) with its title (the snapshot's title/recordId
   *  when it carries one, else the id) and its contents well count.
   *  Unresolved-hint buckets never land here. */
  recordsById: Map<string, LabwareRecordView>;
}

type CommittedLabwareEntry = {
  wells?: Record<string, unknown>;
  labwareType?: string;
  title?: unknown;
  recordId?: unknown;
};

/** Whether a committed-snapshot instance entry carries a concrete non-empty
 *  per-well contents map. */
function hasContents(labware: CommittedLabwareEntry | undefined): boolean {
  if (!labware?.wells) return false;
  return Object.values(labware.wells).some(
    (materials) => Array.isArray(materials) && materials.length > 0,
  );
}

/** Hint -> record id resolution offered by the noun-resolution slots (FIX RUN
 *  1 / D1: the identity space the committed layer uses is the RECORD/instance
 *  space; a pending hint folds there when the DOCUMENT resolves it). */
export interface WellsetIdentitySlots {
  /** resolve_nouns output slot (authoritative bindings: label -> recordId). */
  nounsSlot?: { resolvedByLabel?: Record<string, { recordId?: unknown }> };
  /** resolve_labware output slot (hint -> recordId). */
  labwareSlot?: { resolvedLabwares?: Array<{ hint: string; recordId: string }> };
}

/** Resolve a symbolic hint through the declared slots (exact-label identity,
 *  the resolvePlacementLabware precedent). Undefined when no slot names it. */
function slotResolvedId(hint: string, slots: WellsetIdentitySlots | undefined): string | undefined {
  const binding = slots?.nounsSlot?.resolvedByLabel?.[hint];
  if (typeof binding?.recordId === 'string' && binding.recordId) return binding.recordId;
  const rl = (slots?.labwareSlot?.resolvedLabwares ?? []).find((r) => r.hint === hint);
  if (typeof rl?.recordId === 'string' && rl.recordId) return rl.recordId;
  return undefined;
}

/** Build the contents ledger: the committed layer (priorLabState's contents
 *  map) PLUS the current document's own material events (the pending-draft
 *  layer, matching the page's preview semantics). The material-bearing
 *  taxonomy is vocabulary DATA (FIX RUN 1 / D8) — passed in, never hardcoded.
 *
 *  FIX RUN 1 (advc D1): ONE identity space. The pending buckets fold onto a
 *  resolved identity via `foldPendingKey` (committed instance id -> slot
 *  resolution -> unique contents-carrying type match); an unmappable hint
 *  keeps its own bucket, is listed as UNRESOLVED, and never becomes a
 *  candidate record. */
export function buildContentsLedger(
  priorLabState: LabStateSnapshot | undefined,
  pendingEvents: readonly PlateEventPrimitive[],
  materialBearingEventTypes: readonly string[] = [],
  slots?: WellsetIdentitySlots,
): ContentsLedger {
  const byLabware = new Map<string, Set<string>>();
  const wells = new Set<string>();
  const unresolvedHints = new Set<string>();
  const recordsById = new Map<string, LabwareRecordView>();
  const ensureBucket = (key: string): Set<string> => {
    if (!byLabware.has(key)) byLabware.set(key, new Set());
    return byLabware.get(key)!;
  };

  // Committed layer: the prior lab state's per-well contents map.
  const prior = priorLabState ?? emptyLabState();
  const labwareEntries = Object.entries(prior.labware ?? {}) as Array<[string, CommittedLabwareEntry]>;
  for (const [instanceId, labware] of labwareEntries) {
    if (!hasContents(labware)) continue;
    for (const [well, materials] of Object.entries(labware.wells ?? {})) {
      if (Array.isArray(materials) && materials.length > 0) {
        ensureBucket(instanceId).add(well);
        wells.add(well);
      }
    }
  }
  // Contents-carrying instance types (for the unique-type-match fold, the
  // mint_materials labwareType precedent).
  const typeMatches = (hint: string): string[] =>
    labwareEntries
      .filter(([, lw]) => hasContents(lw) && lw.labwareType === hint)
      .map(([id]) => id);

  // Pending-draft layer: the current document's own material-bearing events.
  const pendingByLabware = new Map<string, Set<string>>();
  for (const ev of pendingEvents) {
    if (!materialBearingEventTypes.includes(ev.event_type)) continue;
    const details = (ev.details ?? {}) as Record<string, unknown>;
    const labwareId =
      (typeof details.labwareInstanceId === 'string' ? details.labwareInstanceId : undefined)
      ?? (typeof details.labwareId === 'string' ? details.labwareId : undefined)
      ?? (typeof ev.labwareId === 'string' ? ev.labwareId : undefined)
      ?? '';
    if (!labwareId) continue;
    const evWells: string[] = [];
    if (Array.isArray(details.wells)) {
      for (const w of details.wells) if (typeof w === 'string') evWells.push(w);
    } else if (typeof details.wells === 'string') {
      evWells.push(details.wells);
    } else if (typeof details.well === 'string') {
      evWells.push(details.well);
    }
    if (!pendingByLabware.has(labwareId)) pendingByLabware.set(labwareId, new Set());
    for (const w of evWells) pendingByLabware.get(labwareId)!.add(w);
  }

  // Fold each pending bucket onto the resolved identity space (D1).
  const foldPendingKey = (hint: string): string => {
    // 1. the hint IS a committed instance id (resolved identity; the live
    //    create/add sequence shares the id; contents may arrive only pending).
    if (labwareEntries.some(([id]) => id === hint)) return hint;
    // 2. the document resolves the hint through the noun-resolution slots.
    const resolved = slotResolvedId(hint, slots);
    if (resolved) return resolved;
    // 3. the hint names the TYPE of exactly ONE contents-carrying committed
    //    instance (unique match only — never a pick).
    const matches = typeMatches(hint);
    if (matches.length === 1) return matches[0]!;
    return hint; // unmappable: stays its own bucket, listed unresolved below.
  };
  for (const [hint, bucket] of pendingByLabware) {
    if (bucket.size === 0) continue;
    const key = foldPendingKey(hint);
    const target = ensureBucket(key);
    for (const w of bucket) {
      target.add(w);
      wells.add(w);
    }
    const resolvedKey =
      key !== hint
      || labwareEntries.some(([id]) => id === key)
      || slotResolvedId(key, slots) !== undefined
      || typeMatches(key).length > 0;
    if (!resolvedKey) unresolvedHints.add(key);
  }

  // The candidate-card RECORDS (D11): resolved-identity buckets only.
  for (const [key, bucket] of byLabware) {
    if (bucket.size === 0 || unresolvedHints.has(key)) continue;
    const entry = prior.labware?.[key] as CommittedLabwareEntry | undefined;
    const title =
      (typeof entry?.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined)
      ?? (typeof entry?.recordId === 'string' && entry.recordId.trim() ? entry.recordId.trim() : undefined)
      ?? key;
    recordsById.set(key, {
      instanceId: key,
      title,
      wellCount: bucket.size,
    });
  }

  return { byLabware, wells, unresolvedHints, recordsById };
}

export interface WellsetResolution {
  /** The resolved concrete well set (empty when nothing resolves). */
  wells: string[];
  /** The labware binding (the single labware the set sits on) when the set
   *  resolves to exactly one labware; absent when ambiguous/empty. */
  labwareId?: string;
  /** The column-aligned 8-channel shape (present when the set is expressible as
   *  full columns). */
  columnAligned?: { full: boolean; columns: string[][] };
  /** True when the contents set is AMBIGUOUS (two or more labware carry
   *  materials, or a bucket cannot be mapped to a resolved identity) — the
   *  never-guess arm (zero wells + one clarification). */
  ambiguous: boolean;
}

/** Resolve a contents set to {wells, labwareId binding}. Restrict to the PINNED
 *  labware when one is supplied — ONLY resolved identities are ever pinned
 *  (never a symbolic hint, D1): the deck binding, a prior resolution, or the
 *  record an answered wellset card chose. Never-guess: with no pin and more
 *  than one populated bucket (or an unmappable populated bucket), ZERO wells
 *  and ambiguous=true (the caller raises ONE clarification). */
export function resolveContentsWellset(
  ledger: ContentsLedger,
  pinnedLabwareId?: string,
): WellsetResolution {
  const active = pinnedLabwareId && ledger.byLabware.has(pinnedLabwareId)
    ? new Map([[pinnedLabwareId, ledger.byLabware.get(pinnedLabwareId)!]])
    : ledger.byLabware;
  const populated = [...active.entries()].filter(([, s]) => s.size > 0);
  const unresolvedPopulated = [...ledger.unresolvedHints].some(
    (hint) => (active.get(hint)?.size ?? 0) > 0,
  );
  if (populated.length === 0) {
    return { wells: [], ambiguous: false };
  }
  if (populated.length > 1 || unresolvedPopulated) {
    return { wells: [], ambiguous: true };
  }
  const [labwareId, wellSet] = populated[0]!;
  const wells = [...wellSet].sort();
  const { full, columns } = columnAlignedGroups(wells);
  return {
    wells,
    labwareId,
    ...(full ? { columnAligned: { full, columns } } : {}),
    ambiguous: false,
  };
}

export interface WellsetCandidate {
  verb: string;
  /** The declared wellset token value the candidate carries (a member of
   *  vocabulary.wellsetValueTokens). */
  token: string;
  argName: string;
  /** The candidate's position in the model's action list. */
  actionIndex: number;
  /** The candidate's ordinal among ALL candidate events of this verb — the
   *  ORDER key the post-expansion join correlates against (D7: the expander
   *  preserves the candidate order, so the i-th candidate of a verb pairs
   *  with the i-th event of that event_type). */
  verbOrdinal: number;
  /** FIX RUN 2 (advc D12): the candidate's POSITION in the ai_precompile
   *  candidateEvents array — the declared-provenance join key the expand pass
   *  stamps onto emitted events as `details.sourceActionIndex`. Distinct from
   *  `actionIndex` (the model's action list position, kept for fact payloads):
   *  the expander iterates THIS array, so the stamped index is an identity the
   *  emitted events can carry back. */
  candidateIndex: number;
  /** The candidate's symbolic labware label (the hint normalize lowers onto
   *  the candidate — `labware`/`labware_id`), when it carries one. */
  labwareHint?: string;
  /** True when the candidate carries the wellset token as its WELL argument
   *  VERBATIM (the token rode the wire to the join). A wellset token the
   *  lowering chain lowered away (e.g. into a wellRole) yields FALSE — the
   *  join then fails honestly (no set is written) instead of landing the
   *  resolution on the wrong event. */
  tokenIsWellArgValue: boolean;
}

/** Scan the normalized candidate events for declared `kind: wellset`
 *  arguments that carry a DECLARED token (vocabulary DATA membership). No
 *  verb-name branch: membership is argContracts(verb) + kind === 'wellset',
 *  and the token is a member of vocabulary.wellsetValueTokens(). */
export function findWellsetTokenCandidates(
  candidateEvents: readonly Record<string, unknown>[],
  vocabulary: ScientistIntentVocabulary,
): WellsetCandidate[] {
  const out: WellsetCandidate[] = [];
  const tokens = vocabulary.wellsetValueTokens();
  if (tokens.length === 0) return out;
  const verbOrdinal = new Map<string, number>();
  candidateEvents.forEach((cand, index) => {
    const verb = typeof cand.verb === 'string' ? cand.verb : undefined;
    if (!verb) return;
    const ordinal = verbOrdinal.get(verb) ?? 0;
    verbOrdinal.set(verb, ordinal + 1);
    const wellsetArgs = vocabulary.argContracts(verb)
      .filter((c) => c.kind === 'wellset')
      .map((c) => c.name);
    const params = (cand.params ?? {}) as Record<string, unknown>;
    for (const argName of wellsetArgs) {
      const value = (cand[argName] ?? params[argName]) as unknown;
      if (typeof value === 'string' && tokens.includes(value)) {
        const labwareHint =
          (typeof cand.labware === 'string' && cand.labware.trim() ? cand.labware.trim() : undefined)
          ?? (typeof cand.labware_id === 'string' && cand.labware_id.trim() ? cand.labware_id.trim() : undefined);
        out.push({
          verb,
          token: value,
          argName,
          // The candidate's declared action index when it carries one; the
          // positional index otherwise (unknown-typed record — narrow on the
          // actual value, never a blind cast).
          actionIndex:
            typeof cand.actionIndex === 'number' ? cand.actionIndex : index,
          candidateIndex: index,
          verbOrdinal: ordinal,
          ...(labwareHint ? { labwareHint } : {}),
          tokenIsWellArgValue:
            typeof cand.wells === 'string' && cand.wells.trim() === value,
        });
      }
    }
  });
  return out;
}

/** The RESOLVED labware identity the event already carries — its deck/store
 *  binding or a prior resolution written by this resolver. FIX RUN 1 (advc
 *  D1): a labware id counts as a PIN only when it is a RESOLVED identity — a
 *  committed instance id or a resolve_nouns/resolve_labware record id. A
 *  symbolic hint (what the expander emits — simpleVerbs.ts :526/:616) is
 *  NEVER a pin: treating one as a pin silently narrows the ledger to the
 *  pending bucket (the D1 blocker). */
function pinnedLabwareFor(
  event: PlateEventPrimitive,
  resolvedIdentityIds: ReadonlySet<string>,
): string | undefined {
  const details = (event.details ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof details.labwareId === 'string' && details.labwareId)
    || (typeof event.labwareId === 'string' && event.labwareId)
    || undefined;
  if (!candidate) return undefined;
  return resolvedIdentityIds.has(candidate) ? candidate : undefined;
}

export interface ResolveWellsetsInput extends WellsetIdentitySlots {
  /** The post-expansion event list (the resolve_roles output) — the events the
   *  resolution is written onto. */
  events: readonly PlateEventPrimitive[];
  /** The normalized candidate events (the ai_precompile slot) — the carriers of
   *  the wellset token. */
  candidateEvents: readonly Record<string, unknown>[];
  /** The committed contents layer (priorLabState). */
  priorLabState: LabStateSnapshot | undefined;
  /** The vocabulary (token + wellset-arg + material-bearing-event membership
   *  are DATA). */
  vocabulary: ScientistIntentVocabulary;
  /** The §14.2 ANSWER map (FIX RUN 1 / D2): key = an ambiguity fact's own
   *  label (the token), value = the record id the scientist chose (a reading
   *  id = a resolved record identity, the READING-CARD-ANSWER-1 channel).
   *  Threaded VERBATIM from the compile deps; exact-key identity, never a
   *  prefix/containment match. */
  scientistAnswers?: Readonly<Record<string, string>>;
}

export interface ResolveWellsetsOutput {
  /** The event list with the resolved wells + binding written onto the matching
   *  events (immutable — the input array is not mutated). */
  events: PlateEventPrimitive[];
  /** The resolutions applied (observability). */
  applied: Array<{ eventId: string; verb: string; resolution: WellsetResolution }>;
  /** NEVER-SILENT facts (never-guess + FIX RUN 2 / advc D12): entries that
   *  must raise a clarification. Each carries the resolved RECORD candidates
   *  (never a symbolic hint — D11) plus the unresolved bucket labels for the
   *  honest prompt. `reason` distinguishes the two honest arms:
   *  - AMBIGUOUS_CONTENTS_WELLSET_REASON: contents span >1 labware / an
   *    unmappable bucket (never-guess).
   *  - UNATTRIBUTED_WELLSET_TOKEN_REASON: the set COMPUTED but the token
   *    could not be attributed to one emitted event (D12) — the token is
   *    never dropped into an empty applied list. */
  ambiguous: Array<{
    verb: string;
    argName: string;
    actionIndex: number;
    token: string;
    reason:
      | typeof AMBIGUOUS_CONTENTS_WELLSET_REASON
      | typeof UNATTRIBUTED_WELLSET_TOKEN_REASON;
    /** The action's symbolic labware noun (the candidate's hint), when it
     *  carries one (FIX RUN 1 / D2): the fact's actionLocation then names the
     *  LABWARE slot so a /l answer splices onto the labware binding (the
     *  spine re-binds it; the ledger folds the bucket onto the chosen record)
     *  instead of writing a labware label into the wellset slot. */
    labwareHint?: string;
    /** The resolved labware RECORDS carrying contents (candidate-card shape). */
    records: LabwareRecordView[];
    /** The pending buckets that could not be mapped to a resolved identity. */
    unresolved: string[];
  }>;
}

/** The core resolver. Pure over its inputs. For each declared wellset token it
 *  (a) builds the contents ledger over ONE identity space (committed + pending,
 *  folded per buildContentsLedger), (b) restricts to a RESOLVED pinned labware
 *  when one is present — the event's deck binding or the record an ANSWERED
 *  wellset card chose via `scientistAnswers` (the D2 answer leg: the chosen
 *  record re-pins the ledger so the recompile CONVERGES, never re-fires),
 *  (c) resolves {wells, labwareId} (or the never-guess ambiguous arm), and
 *  (d) writes the concrete wells + binding onto the matching post-expansion
 *  event.
 *
 * Candidate → event matching (FIX RUN 2 / advc D12) is a DECLARED-PROVENANCE
 * join: expand_biology_verbs stamps every emitted event with
 * `details.sourceActionIndex` — the ai_precompile index of the candidate that
 * emitted it — and the i-th candidate pairs with the events carrying ITS
 * index. Verb-name + per-verb ordinal is NOT an identity: resuspend/dilute/
 * shake/bead_beat expanders EMIT event_type:'mix', so a 'mix' candidate can
 * face two 'mix' events whose counts disagree and the token silently drops
 * (the cycle-1 vacuous-green reproduction). When the event list carries NO
 * provenance at all (hand-built fixtures / callers that predate the stamp) the
 * join falls back to the FIX1 order-identity arm (verb event-type match +
 * per-verb 1:1 count) — never relaxed onto a possibly-wrong event. When the
 * join CANNOT be established (no provenance target, a fan-out emitted several
 * events for one candidate, or the target already carries concrete wells) the
 * token is NEVER dropped into an empty applied list: the resolver raises the
 * UNATTRIBUTED_WELLSET_TOKEN_REASON clarification (never-silent). Verb
 * membership stays DATA (fallback arm only); no `verb === 'mix'` branch.
 */
export function resolveWellsets(input: ResolveWellsetsInput): ResolveWellsetsOutput {
  const { events, candidateEvents, priorLabState, vocabulary } = input;
  const candidates = findWellsetTokenCandidates(candidateEvents, vocabulary);
  if (candidates.length === 0) {
    // No wellset token anywhere — byte-identical passthrough (the
    // overwhelmingly common case).
    return { events: [...events], applied: [], ambiguous: [] };
  }

  const ledger = buildContentsLedger(
    priorLabState,
    events,
    vocabulary.materialBearingEventTypes(),
    { ...(input.nounsSlot ? { nounsSlot: input.nounsSlot } : {}),
      ...(input.labwareSlot ? { labwareSlot: input.labwareSlot } : {}) },
  );

  // The resolved-identity set for the PIN check (D1): committed instance ids +
  // the resolve_nouns bindings' record ids + the resolve_labware records.
  const resolvedIdentityIds = new Set<string>();
  for (const instanceId of Object.keys(priorLabState?.labware ?? {})) {
    resolvedIdentityIds.add(instanceId);
  }
  for (const binding of Object.values(input.nounsSlot?.resolvedByLabel ?? {})) {
    if (typeof binding?.recordId === 'string' && binding.recordId) resolvedIdentityIds.add(binding.recordId);
  }
  for (const rl of input.labwareSlot?.resolvedLabwares ?? []) {
    if (typeof rl?.recordId === 'string' && rl.recordId) resolvedIdentityIds.add(rl.recordId);
  }

  // Candidate-count per verb across ALL candidates (token-bearing or not) —
  // the join is safe only when the verb's event count equals its candidate
  // count (1:1 order-preserving expansion).
  const candidateCountByVerb = new Map<string, number>();
  for (const cand of candidateEvents) {
    const verb = typeof cand.verb === 'string' ? cand.verb : undefined;
    if (!verb) continue;
    candidateCountByVerb.set(verb, (candidateCountByVerb.get(verb) ?? 0) + 1);
  }
  const eventsByType = new Map<string, PlateEventPrimitive[]>();
  for (const e of events) {
    if (!eventsByType.has(e.event_type)) eventsByType.set(e.event_type, []);
    eventsByType.get(e.event_type)!.push(e);
  }

  const applied: ResolveWellsetsOutput['applied'] = [];
  const ambiguous: ResolveWellsetsOutput['ambiguous'] = [];
  const resolutionsById = new Map<string, WellsetResolution>();

  // FIX RUN 2 (advc D12): the DECLARED-PROVENANCE index — an emitted event's
  // details.sourceActionIndex (stamped by expand_biology_verbs: the
  // ai_precompile index of the candidate that expanded to it). Provenance
  // present on the list => the provenance join is the ONLY join (the
  // per-verb-ordinal fallback would mis-attribute across mix-emitting verbs).
  const provenanceIndex = (e: PlateEventPrimitive): number | undefined => {
    const d = (e.details ?? {}) as Record<string, unknown>;
    return typeof d.sourceActionIndex === 'number' ? d.sourceActionIndex : undefined;
  };
  const provenancePresent = events.some((e) => provenanceIndex(e) !== undefined);

  /** The event this candidate's token belongs to, or undefined when the
   *  attribution cannot be ESTABLISHED (never relaxed): provenance arm =
   *  exactly ONE event stamped with this candidate's index and no concrete
   *  wells yet; fallback arm (unprovenance'd, hand-built lists) = FIX1
   *  order-identity (per-verb 1:1 count + ordinal + event_type). */
  const joinTarget = (cand: WellsetCandidate): PlateEventPrimitive | undefined => {
    if (!cand.tokenIsWellArgValue) return undefined;
    if (provenancePresent) {
      const matches = events.filter((e) => provenanceIndex(e) === cand.candidateIndex);
      if (matches.length !== 1) return undefined; // 0 (dropped/fanned out) or >1 (fan-out): never guess
      return hasConcreteWells(matches[0]!) ? undefined : matches[0];
    }
    const verbEvents = eventsByType.get(cand.verb) ?? [];
    const ordinalEvent = cand.verbOrdinal < verbEvents.length ? verbEvents[cand.verbOrdinal] : undefined;
    if (!ordinalEvent || hasConcreteWells(ordinalEvent)) return undefined;
    return (candidateCountByVerb.get(cand.verb) ?? 0) === verbEvents.length ? ordinalEvent : undefined;
  };

  const pushFact = (
    cand: WellsetCandidate,
    reason:
      | typeof AMBIGUOUS_CONTENTS_WELLSET_REASON
      | typeof UNATTRIBUTED_WELLSET_TOKEN_REASON,
  ): void => {
    ambiguous.push({
      verb: cand.verb,
      argName: cand.argName,
      actionIndex: cand.actionIndex,
      token: cand.token,
      reason,
      ...(cand.labwareHint ? { labwareHint: cand.labwareHint } : {}),
      records: contentsRecords(ledger),
      unresolved: [...ledger.unresolvedHints].filter(
        (h) => (ledger.byLabware.get(h)?.size ?? 0) > 0,
      ),
    });
  };

  for (const cand of candidates) {
    // The answer leg (D2): the §14.2 map re-pins the chosen record (a
    // resolved identity — the reading id IS the record id the card showed).
    const answered = input.scientistAnswers?.[cand.token];
    const answeredPin = answered && ledger.byLabware.has(answered) ? answered : undefined;
    if (answeredPin) {
      // Answering the card RESOLVES the document's plate identity (D1+D2):
      // every UNRESOLVED pending bucket folds onto the chosen record — the
      // scientist just declared which labware the draft's hint names. The
      // fold is applied once per ledger (idempotent after the first answer).
      foldUnresolvedOnto(ledger, answeredPin);
    }

    const target = joinTarget(cand);

    // The PIN (resolved identities only — D1): the event's own resolved
    // binding, else the record the scientist answered (D2 convergence).
    const eventPin = target ? pinnedLabwareFor(target, resolvedIdentityIds) : undefined;
    const pin = answeredPin ?? eventPin;

    const resolution = resolveContentsWellset(ledger, pin);
    let written = false;
    if (target) {
      const priorRes = resolutionsById.get(target.eventId);
      if (!priorRes) resolutionsById.set(target.eventId, resolution);
      applied.push({ eventId: target.eventId, verb: cand.verb, resolution });
      written = !resolution.ambiguous && resolution.wells.length > 0;
    }
    if (resolution.ambiguous) {
      // Never-guess: contents span >1 labware / an unmappable bucket.
      pushFact(cand, AMBIGUOUS_CONTENTS_WELLSET_REASON);
    } else if (!written && resolution.wells.length > 0) {
      // FIX RUN 2 (advc D12): the set COMPUTED but the token could not be
      // attributed to one emitted event (no joinable provenance/ordinal event,
      // a fan-out, or the target already carries concrete wells). The token is
      // NEVER dropped into a silent empty applied list — this is the
      // never-silent arm; the caller raises ONE clarification.
      pushFact(cand, UNATTRIBUTED_WELLSET_TOKEN_REASON);
    }
  }

  // Rebuild the events array with the applied mutations (immutable).
  const outEvents: PlateEventPrimitive[] = events.map((e) => {
    const res = resolutionsById.get(e.eventId);
    if (!res || res.ambiguous || res.wells.length === 0) return e;
    const details: Record<string, unknown> = { ...((e.details ?? {}) as Record<string, unknown>) };
    details.wells = res.wells;
    // The RESOLVED labware binding lands when the event carries no RESOLVED
    // identity already (never clobber a deck/store binding). A symbolic
    // expander label is NOT a resolved binding — it stays on the event top
    // level (the scientist's phrasing) while the RESOLVED record identity
    // rides details.labwareId for the consumers (D1/AC2: the shipped event
    // carries a RECORD binding, not just the hint).
    if (!pinnedLabwareFor(e, resolvedIdentityIds) && res.labwareId) {
      details.labwareId = res.labwareId;
    }
    if (res.columnAligned) {
      details.wellColumns = res.columnAligned.columns;
      details.channels = PLATE_ROW_LETTERS.length;
    }
    return { ...e, details };
  });

  return { events: outEvents, applied, ambiguous };
}

/** Whether an event already carries a concrete (non-token) well set. */
function hasConcreteWells(event: PlateEventPrimitive): boolean {
  const details = (event.details ?? {}) as Record<string, unknown>;
  const w = details.wells;
  return Array.isArray(w) && w.length > 0 && w.every((x) => typeof x === 'string');
}

/** Fold every UNRESOLVED pending bucket onto the scientist-ANSWERED record
 *  (the answered card resolves the document's plate identity — D1+D2). The
 *  ledger is a fresh object per resolveWellsets call, so the mutation stays
 *  invisible to the committed snapshot. */
function foldUnresolvedOnto(ledger: ContentsLedger, recordId: string): void {
  const bucket = ledger.byLabware.get(recordId);
  if (!bucket) return;
  for (const hint of [...ledger.unresolvedHints]) {
    const pendingBucket = ledger.byLabware.get(hint);
    if (!pendingBucket) continue;
    for (const w of pendingBucket) bucket.add(w);
    ledger.byLabware.delete(hint);
    ledger.unresolvedHints.delete(hint);
  }
  if (!ledger.recordsById.has(recordId)) {
    ledger.recordsById.set(recordId, { instanceId: recordId, title: recordId, wellCount: bucket.size });
  }
}

/** The resolved contents-bearing RECORDS (the card's candidate set — NEVER a
 *  symbolic hint; D11). */
function contentsRecords(ledger: ContentsLedger): LabwareRecordView[] {
  return [...ledger.recordsById.values()].filter(
    (r) => (ledger.byLabware.get(r.instanceId)?.size ?? 0) > 0,
  );
}
