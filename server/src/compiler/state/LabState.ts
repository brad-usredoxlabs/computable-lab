/**
 * LabState - Pure functions for lab-state snapshot management.
 *
 * This module defines the canonical LabStateSnapshot shape and provides
 * a pure function (applyEventToLabState) that folds PlateEventPrimitive
 * events into an immutable snapshot.
 *
 * L2-LABSTATE-CONTENTS-1 (the D13-B ruling): the fold is the SINGLE consumer
 * of the SHIPPED expander shape. The expander's canonical wire vocabulary for
 * add_material/transfer is the symbolic top-level `labwareId` (a hint, never a
 * pin) + a string or object `material`. A resolved identity (the raw
 * `labwareInstanceId` / `from`/`to` object path) is the SAME single shape with
 * the labware identity already resolved — it is rung R1 of the resolution
 * ladder, not a second vocabulary. The symbolic hint resolves to a snapshot
 * instance through a DATA-declared, never-guess ladder (the vocabulary's
 * `labwareIdentityResolution` section, threaded at the pass seam — this module
 * stays pure and never imports the vocabulary). A string `material` normalizes
 * to a MaterialRecord WITHOUT inventing ids (verbatim passthrough of the
 * scientist's own word — the mint_materials namingPattern /
 * ProtocolIntentLowering materialId precedent; a MINT would be MAT-N/hash/slug).
 */

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LabwareOrientation = 'landscape' | 'portrait';

export interface DeckSlot {
  slot: string;
  labwareInstanceId?: string;
}

export interface MountedPipette {
  mountSide: 'left' | 'right';
  pipetteType: string;
  maxVolumeUl: number;
}

export interface LabwareInstance {
  instanceId: string;
  labwareType: string;
  slot: string;
  orientation: LabwareOrientation;
  wells: Record<string, MaterialRecord[]>;
  /** L2-LABSTATE-CONTENTS-1 (spec §6, the deck contract): the DECLARED identity
   *  tokens the creating event carried (details.labwareId ?? event.labwareId
   *  ?? details.title ?? details.label), verbatim (no normalization at write
   *  time — normalization lives in the rung evaluators). exactOptionalProperty
   *  types: the key is ABSENT when empty, never undefined; structuredClone-safe
   *  plain strings. Rung R2 (declaredIdentityTokens) reads this; a create with
   *  no label carrier leaves it absent (R2 inert, R3 still applies). Additive
   *  only — the merged wellsetResolver's duck-typed CommittedLabwareEntry keeps
   *  compiling and passing untouched. */
  identityTokens?: string[];
}

export interface MaterialEconomics {
  currency: string;
  amountPerUl: number;
  sourceOfferRef?: Record<string, unknown>;
}

export interface MaterialRecord {
  materialId: string;
  kind?: string;
  volumeUl?: number;
  properties?: Record<string, unknown>;
  economics?: MaterialEconomics;
}

export interface ReservoirContents {
  reservoirInstanceId: string;
  wellContents: Record<string, MaterialRecord[]>;
}

// ---------------------------------------------------------------------------
// L2-LABSTATE-CONTENTS-1 — the DATA-declared labware identity resolution rules.
//
// The rung ladder is DATA (the vocabulary's `labwareIdentityResolution`
// section), never a TS policy: `order` names the rungs in declared order and
// `tokenFields` names the instance fields a rung reads. The fold is a GENERIC
// field-identity evaluator over those declared fields — it never branches on a
// rung id or a field name (the PROTO-AI-3 generic-evaluator doctrine; the B3
// boundary). Absent rules (a 2-arg fold call) => rung R1 ONLY (the raw
// labwareInstanceId path), so every pre-existing byte-stable test is unchanged.
// The rules are threaded at the PASS seam (createLabStatePass loads the
// vocabulary), never imported into this pure module.
// ---------------------------------------------------------------------------

export interface LabIdentityRules {
  /** Rung ids in declaration order (the DATA `order` list). The ladder walks
   *  them first-hit-wins: the FIRST rung that yields exactly one instance wins;
   *  zero matches advances to the next rung; a TIE (two or more) at any rung is
   *  terminal => unresolved (never-guess: no pick, no fall-through). */
  order: readonly string[];
  /** The instance field each rung reads (the DATA `tokenFields` list,
   *  index-aligned with `order`). instanceIdentity -> `instanceId`,
   *  declaredIdentityTokens -> `identityTokens`, uniqueLabwareType ->
   *  `labwareType`. */
  tokenFields: readonly string[];
}

/** The fold outcome (L2-LABSTATE-CONTENTS-1 §7): the pure fold cannot raise an
 *  honest bar, so the never-guess surface is a NO-OP fold + the pass's
 *  diagnostic. The pass distinguishes a no-op attempt from a successful write
 *  by `changed` (the pass collects a `lab_state_unresolved_labware_reference`
 *  diagnostic for a content-bearing verb that folded to no-op). */
export interface FoldOutcome {
  /** True when the fold wrote contents (or, for transfer, resolved both sides);
   *  false on a no-op attempt (unresolved identity, no material identity, or an
   *  unpairable multi-well shape). */
  changed: boolean;
  /** The no-op reason (L2-LABSTATE-CONTENTS-1 §7 — the pass maps this to the
   *  diagnostic code + details; a `changed: true` outcome never sets it):
   *  'labware_unresolved' (symbolic identity: no instance / a TIE at a rung —
   *  never-guess), 'material_unresolved' (no material identity at all — never
   *  fabricated), 'wells_unpairable' (a well the fold cannot address),
   *  'event_incomplete' (a details the fold needs is absent). */
  reason?: 'labware_unresolved' | 'material_unresolved' | 'wells_unpairable' | 'event_incomplete';
}

/** The fold outcome + snapshot record returned when the rules argument is
 *  supplied (the overload below). */
export interface FoldResult {
  snapshot: LabStateSnapshot;
  outcome: FoldOutcome;
}

export interface LabStateSnapshot {
  deck: DeckSlot[];
  mountedPipettes: MountedPipette[];
  labware: Record<string, LabwareInstance>;
  reservoirs: Record<string, ReservoirContents>;
  mintCounter: number;
  turnIndex: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function emptyLabState(): LabStateSnapshot {
  return {
    deck: [],
    mountedPipettes: [],
    labware: {},
    reservoirs: {},
    mintCounter: 0,
    turnIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers — deep-clone a snapshot for immutability
// ---------------------------------------------------------------------------

function cloneSnapshot(s: LabStateSnapshot): LabStateSnapshot {
  return structuredClone(s);
}

// ---------------------------------------------------------------------------
// Helpers — build a MaterialRecord without assigning undefined to optional props
// ---------------------------------------------------------------------------

function buildMaterialRecord(
  materialId: string,
  kind: string | undefined,
  volumeUl: number | undefined,
  properties: Record<string, unknown> | undefined,
  economics: MaterialEconomics | undefined,
): MaterialRecord {
  const record: MaterialRecord = { materialId };
  if (kind !== undefined) record.kind = kind;
  if (volumeUl !== undefined) record.volumeUl = volumeUl;
  if (properties !== undefined) record.properties = properties;
  if (economics !== undefined) record.economics = economics;
  return record;
}

// ---------------------------------------------------------------------------
// L2-LABSTATE-CONTENTS-1 — the DATA-declared never-guess resolution ladder
// ---------------------------------------------------------------------------

/** Trim + casefold (the shipped deck-name-match normalization precedent — exact
 *  identity under a declared normalization, NOT fuzzy matching). Used by the
 *  R1/R2 rungs. */
function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

/** Trim + casefold + collapse non-alnum runs (the R3 unique-declared-type
 *  normalization — a hyphenated and a spaced spelling of the SAME type key
 *  normalize to one key, e.g. '96' + 'well' + 'plate' under any separators). */
function normalizeTypeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/** Rung evaluators — GENERIC field-identity evaluators over the field the
 *  DATA's `tokenFields` names. NO substring/token-overlap matching (the legacy
 *  hint-search helper in ChatbotCompilePasses.ts is the anti-pattern — it is
 *  NOT called here), NO second labware, NO pick among ties. Returns the
 *  matching instanceIds (the caller decides zero/unique/tie). */
function rungMatches(
  snapshot: LabStateSnapshot,
  tokenField: string,
  hint: string,
): string[] {
  const out: string[] = [];
  for (const [id, instance] of Object.entries(snapshot.labware)) {
    if (tokenField === 'instanceId') {
      if (normalizeToken(instance.instanceId) === normalizeToken(hint)) out.push(id);
    } else if (tokenField === 'identityTokens') {
      const tokens = instance.identityTokens;
      if (tokens && tokens.some((t) => normalizeToken(t) === normalizeToken(hint))) out.push(id);
    } else if (tokenField === 'labwareType') {
      if (normalizeTypeKey(instance.labwareType) === normalizeTypeKey(hint)) out.push(id);
    }
    // an UNKNOWN tokenField (not declared in the shipped vocabulary) matches
    // nothing — fail-closed, never a guess.
  }
  return out;
}

/** Resolve a symbolic labwareId hint to a UNIQUE snapshot instance via the
 *  DATA-declared ladder (never-guess: first rung with exactly one match wins;
 *  zero advances; a tie is terminal). `rules` absent => rung R1 ONLY (the raw
 *  instanceId path) — the pre-existing behavior, so a 2-arg fold call is
 *  byte-unchanged. Returns the instanceId or undefined (unresolved). */
function resolveLabware(
  snapshot: LabStateSnapshot,
  hint: string | undefined,
  rules: LabIdentityRules | undefined,
): string | undefined {
  if (typeof hint !== 'string' || !hint.trim()) return undefined;
  const order = rules?.order ?? ['instanceIdentity'];
  const tokenFields = rules?.tokenFields ?? ['instanceId'];
  for (let i = 0; i < order.length; i++) {
    const field = tokenFields[i];
    if (field === undefined) continue; // misaligned DATA => that rung inert (fail-closed)
    const matches = rungMatches(snapshot, field, hint);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return undefined; // tie => terminal, never a pick
  }
  return undefined;
}

/** The material-bearing event types the ledger consumes. Content-bearing for
 *  the fold: add_material always; transfer when it carries a source labware.
 *  Used by the lab_state PASS (createLabStatePass) to decide which fold no-ops
 *  are meaningful enough to surface as a `lab_state_unresolved_labware_reference`
 *  diagnostic (§7 — the fold is pure; reporting rides the pass). Exported so
 *  the pass reads it as the one declared consumer; the fold itself needs it not. */
export function isContentBearing(event: PlateEventPrimitive): boolean {
  if (event.event_type !== 'add_material' && event.event_type !== 'transfer') return false;
  if (event.event_type === 'add_material') return true;
  const details = event.details as Record<string, unknown> | undefined;
  const from = details?.from as Record<string, unknown> | undefined;
  return Boolean(
    (typeof details?.source_labware === 'string' && details.source_labware)
    || (from && typeof from.labwareInstanceId === 'string'),
  );
}

// ---------------------------------------------------------------------------
// L2-LABSTATE-CONTENTS-1 — material normalization (NO invented ids)
// ---------------------------------------------------------------------------

/** A {value,unit} Quantity object is NOT a numeric volume (unit honesty — the
 *  same rule simpleVerbs honors: no conversion). */
function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Normalize the event's material carrier to a MaterialRecord WITHOUT inventing
 * ids (spec §5.3 — pinned):
 *  - an OBJECT material with a materialId (the raw path): verbatim, byte-stable.
 *  - a material_ref with a string id (the expander's composition arm emits
 *    { kind: 'draft', id: 'mint:<label>', label } — simpleVerbs.ts:509, the
 *    compiler's EXISTING mint:-draft convention, copied verbatim, never
 *    synthesized): materialId = the id, kind = the label ?? the string.
 *  - a non-empty STRING L (the shipped expander's string material): record =
 *    { materialId: L, kind: L } — VERBATIM identity passthrough of the
 *    scientist's own word. This is NOT an invented id: mint_materials already
 *    mints materialIds from the scientist-declared namingPattern
 *    (ChatbotCompilePasses.ts:1954) and ProtocolIntentLowering.ts:79-83 carries
 *    materialId from the lowered intent's own materialRef. NO minting (no MAT-N,
 *    no hash, no slug, no lowercasing of the materialId VALUE).
 *  - no material identity at all: undefined (the caller no-ops + diagnostics).
 * Volume rides via the existing builder: the OBJECT material's own volumeUl,
 * else the details-level volumeUl (declared numeric only — a {value,unit}
 * volume object is NOT converted).
 */
function normalizeMaterial(
  details: Record<string, unknown>,
): MaterialRecord | undefined {
  const material = details.material;

  if (material && typeof material === 'object' && !Array.isArray(material)) {
    const m = material as Record<string, unknown>;
    const materialId = typeof m.materialId === 'string' && m.materialId ? m.materialId : undefined;
    if (!materialId) return undefined;
    return buildMaterialRecord(
      materialId,
      typeof m.kind === 'string' ? m.kind : undefined,
      asFiniteNumber(m.volumeUl) ?? asFiniteNumber(details.volumeUl),
      (m.properties && typeof m.properties === 'object' ? m.properties : undefined) as Record<string, unknown> | undefined,
      (m.economics && typeof m.economics === 'object' ? m.economics : undefined) as MaterialEconomics | undefined,
    );
  }

  // The composition arm's material_ref (draft-mint convention, verbatim).
  const materialRef = details.material_ref;
  if (materialRef && typeof materialRef === 'object' && !Array.isArray(materialRef)) {
    const ref = materialRef as Record<string, unknown>;
    const refId = typeof ref.id === 'string' && ref.id ? ref.id : undefined;
    if (refId) {
      const refLabel = typeof ref.label === 'string' && ref.label ? ref.label
        : typeof material === 'string' && material.trim() ? material : undefined;
      return buildMaterialRecord(
        refId,
        refLabel,
        asFiniteNumber(material && typeof material === 'object' ? (material as Record<string, unknown>).volumeUl : undefined) ?? asFiniteNumber(details.volumeUl),
        undefined,
        undefined,
      );
    }
  }

  // The shipped expander's string material: VERBATIM passthrough (no invented id).
  if (typeof material === 'string') {
    const label = material.trim();
    if (!label) return undefined;
    return buildMaterialRecord(
      label,
      label,
      asFiniteNumber(details.volumeUl),
      undefined,
      undefined,
    );
  }

  return undefined; // no material identity at all => no-op (NEVER fabricate).
}

/** The well addresses a fold writes to: details.well (single, raw path) OR
 *  details.wells (string[] — the modern branch may carry a range the shorthand
 *  binder expanded; the legacy per-well expand fan-out carries per-well `well`). */
function foldWells(details: Record<string, unknown>): string[] {
  const wells: string[] = [];
  const w = details.wells;
  if (Array.isArray(w)) {
    for (const el of w) if (typeof el === 'string' && el.trim()) wells.push(el);
  } else if (typeof w === 'string' && w.trim()) {
    wells.push(w);
  } else if (typeof details.well === 'string' && details.well.trim()) {
    wells.push(details.well);
  }
  return wells;
}

/** Write one material record into a cloned labware's well (append). */
function appendToWell(labware: LabwareInstance, well: string, record: MaterialRecord): void {
  const existing = labware.wells[well] ? structuredClone(labware.wells[well]) : [];
  existing.push(record);
  labware.wells = { ...labware.wells, [well]: existing };
}

/** One deduction pass over a source well's cloned stack (the EXISTING
 *  top-of-stack semantics, unchanged — only identity acquisition differs for
 *  the symbolic shape): deduct `volume` from the top, tracking the source
 *  material info (materialId/kind/properties/economics) of the record the
 *  destination mirrors. Returns the remaining stack + the moved amount + the
 *  source material info (undefined when nothing moved). */
function deductSourceWell(
  wellMaterials: MaterialRecord[] | undefined,
  volume: number,
): {
  stack: MaterialRecord[];
  transferred: number;
  materialId: string | undefined;
  kind: string | undefined;
  properties: Record<string, unknown> | undefined;
  economics: MaterialEconomics | undefined;
} {
  const stack = wellMaterials ? structuredClone(wellMaterials) : [];
  let transferred = 0;
  let materialId: string | undefined;
  let kind: string | undefined;
  let properties: Record<string, unknown> | undefined;
  let economics: MaterialEconomics | undefined;
  let remaining = volume;
  while (remaining > 0 && stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const available = top.volumeUl ?? 0;
    if (available <= 0) { stack.pop(); continue; }
    const take = Math.min(remaining, available);
    transferred += take;
    remaining -= take;
    top.volumeUl = available - take;
    materialId = top.materialId;
    kind = top.kind;
    properties = top.properties;
    economics = top.economics;
    if (top.volumeUl === 0) stack.pop();
  }
  return { stack, transferred, materialId, kind, properties, economics };
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function applyCreateContainer(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
): LabStateSnapshot {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') {
    return snapshot;
  }

  const slot = details.slot as string | undefined;
  const labwareType = details.labwareType as string | undefined;

  if (!slot || !labwareType) {
    return snapshot;
  }

  // Use explicit instanceId from event details if provided, otherwise auto-generate
  const explicitInstanceId = details.instanceId as string | undefined;
  const instanceId = explicitInstanceId ?? `LWI-${snapshot.mintCounter + 1}`;

  const newSnapshot = cloneSnapshot(snapshot);

  // Update mintCounter (only when auto-generating)
  if (!explicitInstanceId) {
    newSnapshot.mintCounter += 1;
  }

  // L2-LABSTATE-CONTENTS-1 (spec §6): record the DECLARED identity tokens at
  // mint time, verbatim (no normalization at write time — the rung evaluators
  // normalize). The carriers the creating event may carry, in declaration
  // order: details.labwareId ?? event.labwareId ?? details.title ??
  // details.label. A create with NO label carrier => the key is ABSENT (rung R2
  // inert; R3 still applies — the OQ-3 ratified live single-plate winner).
  const carriers: unknown[] = [details.labwareId, event.labwareId, details.title, details.label];
  const identityTokens: string[] = [];
  const seenTokens = new Set<string>();
  for (const c of carriers) {
    if (typeof c === 'string' && c.trim() && !seenTokens.has(c)) {
      seenTokens.add(c);
      identityTokens.push(c);
    }
  }

  // Add labware instance (exactOptionalPropertyTypes: identityTokens spread
  // conditionally — the key is absent when empty, never undefined).
  newSnapshot.labware[instanceId] = {
    instanceId,
    labwareType,
    slot,
    orientation: 'landscape',
    wells: {},
    ...(identityTokens.length > 0 ? { identityTokens } : {}),
  };

  // Update or append deck slot
  const existingSlotIdx = newSnapshot.deck.findIndex((d) => d.slot === slot);
  if (existingSlotIdx >= 0) {
    newSnapshot.deck = newSnapshot.deck.map((d, i) =>
      i === existingSlotIdx
        ? { ...d, labwareInstanceId: instanceId }
        : d,
    );
  } else {
    newSnapshot.deck = [...newSnapshot.deck, { slot, labwareInstanceId: instanceId }];
  }

  return newSnapshot;
}

function applyAddMaterial(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
  rules: LabIdentityRules | undefined,
): FoldResult {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') {
    return { snapshot, outcome: { changed: false, reason: 'event_incomplete' } };
  }

  // TARGET LABWARE (spec §4.1): rung R1 (details.labwareInstanceId, the raw
  // path — exact-identifies the instance, existing behavior preserved) else the
  // symbolic hint (details.labwareId ?? top-level labwareId) through the
  // DATA-declared ladder.
  const rawInstanceId = typeof details.labwareInstanceId === 'string' ? details.labwareInstanceId : undefined;
  const instanceId = rawInstanceId
    ?? resolveLabware(snapshot, typeof details.labwareId === 'string' ? details.labwareId : event.labwareId, rules);
  if (!instanceId || !snapshot.labware[instanceId]) {
    return { snapshot, outcome: { changed: false, reason: rawInstanceId === undefined ? 'labware_unresolved' : 'event_incomplete' } };
  }

  // WELL(s): details.well (single) OR details.wells (string[]). Each address
  // folds its own append (the per-well expand fan-out semantics).
  const wells = foldWells(details);
  if (wells.length === 0) {
    return { snapshot, outcome: { changed: false, reason: 'wells_unpairable' } };
  }

  // MATERIAL: object (raw path, byte-stable) OR string/spread (the shipped
  // expander shape) — normalized without inventing ids.
  const record = normalizeMaterial(details);
  if (!record) {
    return { snapshot, outcome: { changed: false, reason: 'material_unresolved' } };
  }

  const newSnapshot = cloneSnapshot(snapshot);
  const target = newSnapshot.labware[instanceId]!;
  for (const well of wells) {
    appendToWell(target, well, record);
  }
  return { snapshot: newSnapshot, outcome: { changed: true } };
}

function applyTransfer(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
  rules: LabIdentityRules | undefined,
): FoldResult {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') {
    return { snapshot, outcome: { changed: false, reason: 'event_incomplete' } };
  }

  const volumeUl = asFiniteNumber(details.volumeUl);

  // (a) the RAW path: details.from / details.to objects with labwareInstanceId +
  //     well (byte-stable, never reinterpreted).
  const fromObj = (details.from && typeof details.from === 'object' ? details.from : undefined) as Record<string, unknown> | undefined;
  const toObj = (details.to && typeof details.to === 'object' ? details.to : undefined) as Record<string, unknown> | undefined;
  const rawFromId = fromObj && typeof fromObj.labwareInstanceId === 'string' ? fromObj.labwareInstanceId : undefined;
  const rawToId = toObj && typeof toObj.labwareInstanceId === 'string' ? toObj.labwareInstanceId : undefined;

  // (b) the SHIPPED transferExpander shape: symbolic source_labware /
  //     destination_labware hints (each side through the SAME §5.1 ladder) +
  //     source_well / well (or the multi-well carriers source_wells / wells).
  const srcHint = typeof details.source_labware === 'string' ? details.source_labware
    : typeof fromObj?.labwareId === 'string' ? fromObj.labwareId
    : typeof event.labwareId === 'string' ? event.labwareId : undefined;
  const dstHint = typeof details.destination_labware === 'string' ? details.destination_labware
    : typeof toObj?.labwareId === 'string' ? toObj.labwareId
    : typeof event.labwareId === 'string' ? event.labwareId : undefined;

  const fromId = rawFromId ?? (srcHint ? resolveLabware(snapshot, srcHint, rules) : undefined);
  const toId = rawToId ?? (dstHint ? resolveLabware(snapshot, dstHint, rules) : undefined);

  // Both sides must resolve uniquely, else no-op (never-guess; never a pick).
  if (!fromId || !toId || !snapshot.labware[fromId] || !snapshot.labware[toId]) {
    // Either side unresolved (no instance, or a TIE at a rung — never-guess).
    return { snapshot, outcome: { changed: false, reason: 'labware_unresolved' } };
  }

  // Well pairing: single source_well/well (raw + shipped) OR pairwise-by-address
  // for the multi-well carriers (source_wells / wells[] of equal length — the
  // ONLY unambiguous pairing; anything else no-ops, never a best-effort guess).
  let pairs: Array<[string, string]> = [];
  const srcWellsRaw = details.source_wells;
  const dstWellsRaw = details.wells;
  if (Array.isArray(srcWellsRaw) && Array.isArray(dstWellsRaw) && srcWellsRaw.length === dstWellsRaw.length && srcWellsRaw.length > 0) {
    const srcWells = srcWellsRaw.filter((w): w is string => typeof w === 'string');
    const dstWells = dstWellsRaw.filter((w): w is string => typeof w === 'string');
    if (srcWells.length === dstWells.length && srcWells.length > 0) {
      pairs = srcWells.map((s, i) => [s, dstWells[i]!] as [string, string]);
    }
  } else {
    const srcWell = typeof details.source_well === 'string' && details.source_well
      ? details.source_well
      : typeof fromObj?.well === 'string' ? fromObj.well : undefined;
    const dstWell = typeof details.well === 'string' && details.well
      ? details.well
      : typeof toObj?.well === 'string' ? toObj.well : undefined;
    if (srcWell && dstWell) pairs = [[srcWell, dstWell]];
  }
  if (pairs.length === 0) {
    return { snapshot, outcome: { changed: false, reason: 'wells_unpairable' } };
  }

  const newSnapshot = cloneSnapshot(snapshot);
  const srcLabware = newSnapshot.labware[fromId]!;
  const dstLabware = newSnapshot.labware[toId]!;
  let wrote = false;
  for (const [srcWell, dstWell] of pairs) {
    const srcWellMaterials = srcLabware.wells[srcWell];
    if (!srcWellMaterials || srcWellMaterials.length === 0) {
      // A source well with no records: the existing raw path wrote the
      // (unchanged) destination well and returned the clone.
      dstLabware.wells = { ...dstLabware.wells, [dstWell]: dstLabware.wells[dstWell] ? structuredClone(dstLabware.wells[dstWell]) : [] };
      continue;
    }
    // Existing top-of-stack deduction semantics (untouched — only identity
    // acquisition changed): deduct the requested volume from the top, tracking
    // the source material info the destination mirrors.
    const { stack, transferred, materialId, kind, properties, economics } = deductSourceWell(
      srcWellMaterials,
      volumeUl ?? 0,
    );
    srcLabware.wells = { ...srcLabware.wells, [srcWell]: stack };
    const dstStack = dstLabware.wells[dstWell] ? structuredClone(dstLabware.wells[dstWell]) : [];
    if (transferred > 0 && materialId !== undefined) {
      dstStack.push(buildMaterialRecord(materialId, kind, transferred, properties, economics));
      dstLabware.wells = { ...dstLabware.wells, [dstWell]: dstStack };
      wrote = true;
    }
  }
  return { snapshot: newSnapshot, outcome: { changed: wrote } };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyEventToLabState(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
): LabStateSnapshot;
export function applyEventToLabState(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
  rules: LabIdentityRules,
): FoldResult;
export function applyEventToLabState(
  snapshot: LabStateSnapshot,
  event: PlateEventPrimitive,
  rules?: LabIdentityRules,
): LabStateSnapshot | FoldResult {
  let result: FoldResult;
  switch (event.event_type) {
    case 'create_container':
      return rules === undefined
        ? applyCreateContainer(snapshot, event)
        : { snapshot: applyCreateContainer(snapshot, event), outcome: { changed: true } };
    case 'add_material':
      result = applyAddMaterial(snapshot, event, rules);
      break;
    case 'transfer':
      result = applyTransfer(snapshot, event, rules);
      break;
    default:
      // incubate/mix/read/centrifuge have no deck-state effect for now
      return rules === undefined ? snapshot : { snapshot, outcome: { changed: false } };
  }
  return rules === undefined ? result.snapshot : result;
}
