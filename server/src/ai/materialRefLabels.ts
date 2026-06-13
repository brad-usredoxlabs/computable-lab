/**
 * Draft-time material-ref labeling + normalization.
 *
 * In forced-tool mode the agent's structured draft goes straight to the
 * client — runChatbotCompile (which used to bind ontology CURIEs to labeled
 * local records) never runs. Grounded materials[] carry bare CURIEs, so
 * without this step the deck's well state renders "CHEBI:17790" where the
 * user expects "methanol", and a model that stuffs several CURIEs into one
 * ref ("CHEBI:1,XCO:2") collapses a mixture onto one well-tooltip line.
 *
 * enrichAddMaterialRefs() repairs both at draft time:
 *  - resolves labels for CURIEs (local records → on-box OAK terms endpoint →
 *    remote OLS4, all best-effort with short timeouts; the CURIE stands in
 *    when every tier misses),
 *  - splits comma-joined CURIE lists and multi-entry materials[] into a
 *    details.composition_snapshot so each component gets its own ledger
 *    line in the well state.
 */

import type { OntologyConfig } from '../config/types.js';
import type { RecordStore } from '../store/types.js';
import type { PromptMention } from './promptMentions.js';
import { resolveOakServiceUrl } from '../resolve/providers/oak.js';

const OLS4_TERMS_BASE = 'https://www.ebi.ac.uk/ols4/api/terms';
const OAK_TIMEOUT_MS = 1500;
const OLS4_TIMEOUT_MS = 2500;

/** CURIE-shaped: prefix, colon, non-space local id ("CHEBI:17790", "local:MAT-x"). */
const CURIE_RE = /^[A-Za-z][\w.-]*:\S+$/;

export function isCurieShaped(value: string): boolean {
  return CURIE_RE.test(value.trim());
}


function canonicalMaterialCurie(value: string): string {
  const curie = value.trim();
  if (!curie.startsWith('local:')) return curie;
  const suffix = curie.slice('local:'.length);
  return isCurieShaped(suffix) ? suffix : curie;
}

/**
 * Split "CHEBI:1, XCO:2" into its parts — but only when EVERY comma-separated
 * part is CURIE-shaped, so chemical names like "1,2-dichloroethane" are never
 * torn apart. Returns null when the value isn't a CURIE list.
 */
export function splitCurieList(value: string): string[] | null {
  if (!value.includes(',')) return null;
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.every((p) => CURIE_RE.test(p)) ? parts : null;
}

export interface MaterialLabelerDeps {
  store?: RecordStore | undefined;
  ontology?: OntologyConfig | undefined;
}

export interface MaterialLabeler {
  /** Best-effort CURIE → human label. Null when no tier knows the term. */
  lookup(curie: string): Promise<string | null>;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a labeler with a per-instance cache (one instance per draft, so a
 * CURIE used by five events costs one lookup).
 */
export function createMaterialLabeler(deps: MaterialLabelerDeps = {}): MaterialLabeler {
  const cache = new Map<string, string | null>();
  const oakBase = resolveOakServiceUrl(deps.ontology);

  async function lookupUncached(curie: string): Promise<string | null> {
    if (curie.startsWith('local:')) {
      const recordId = curie.slice('local:'.length);
      try {
        const record = await deps.store?.get(recordId);
        const payload = record?.payload as Record<string, unknown> | undefined;
        for (const key of ['name', 'title', 'label'] as const) {
          const v = payload?.[key];
          if (typeof v === 'string' && v) return v;
        }
      } catch {
        /* missing record — fall through */
      }
      return null;
    }

    const namespace = curie.split(':')[0] ?? '';
    if (oakBase && namespace) {
      const url = `${oakBase}/ontologies/${encodeURIComponent(namespace.toLowerCase())}/terms/${encodeURIComponent(curie)}`;
      const json = (await fetchJson(url, OAK_TIMEOUT_MS)) as { label?: unknown } | null;
      if (json && typeof json.label === 'string' && json.label) return json.label;
    }

    const ols = (await fetchJson(
      `${OLS4_TERMS_BASE}?obo_id=${encodeURIComponent(curie)}&size=1`,
      OLS4_TIMEOUT_MS,
    )) as { _embedded?: { terms?: Array<{ label?: unknown }> } } | null;
    const label = ols?._embedded?.terms?.[0]?.label;
    return typeof label === 'string' && label ? label : null;
  }

  return {
    async lookup(curie: string): Promise<string | null> {
      const key = curie.trim();
      if (!key) return null;
      if (cache.has(key)) return cache.get(key) ?? null;
      const label = await lookupUncached(key);
      cache.set(key, label);
      return label;
    },
  };
}

type Dict = Record<string, unknown>;

type CompositionRole = 'solute' | 'solvent' | 'buffer_component' | 'additive' | 'activity_source' | 'cells' | 'other';

const COMPOSITION_ROLES = new Set<string>([
  'solute',
  'solvent',
  'buffer_component',
  'additive',
  'activity_source',
  'cells',
  'other',
]);

const RECORD_REF_FIELDS: Record<string, string> = {
  aliquot_ref: 'aliquot',
  material_spec_ref: 'material-spec',
  material_instance_ref: 'material-instance',
  vendor_product_ref: 'vendor-product',
};

/** One grounded component: an existing CURIE or a mint-by-label. */
interface RefPart {
  curie?: string;
  label?: string;
  role?: CompositionRole;
  concentration?: Dict;
  count?: number;
}

export interface EnrichAddMaterialRefsOptions {
  store?: RecordStore | undefined;
  mentions?: PromptMention[] | undefined;
}

function asDict(v: unknown): Dict | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : null;
}

function normalizeRole(value: unknown): CompositionRole | undefined {
  if (typeof value !== 'string') return undefined;
  const role = value.trim().toLowerCase();
  const aliases: Record<string, CompositionRole> = {
    vehicle: 'buffer_component',
    medium: 'buffer_component',
    media: 'buffer_component',
    buffer: 'buffer_component',
  };
  return aliases[role] ?? (COMPOSITION_ROLES.has(role) ? role as CompositionRole : undefined);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeConcentrationBasis(value: unknown): string | undefined {
  const basis = stringValue(value);
  if (!basis) return undefined;
  if (/^(?:volume|vol|v\/v|volume_fraction)$/i.test(basis)) return 'volume_fraction';
  if (/^(?:mass|weight|w\/w|mass_fraction)$/i.test(basis)) return 'mass_fraction';
  return basis;
}

function volumeToUL(value: number, unit: string): number | undefined {
  const normalized = unit.trim().toLowerCase();
  if (/^(?:ul|µl|microliter|microliters)$/.test(normalized)) return value;
  if (/^(?:ml|milliliter|milliliters)$/.test(normalized)) return value * 1000;
  if (/^(?:l|liter|liters)$/.test(normalized)) return value * 1_000_000;
  return undefined;
}

function totalVolumeUL(details: Dict): number | undefined {
  const volume = asDict(details.volume);
  if (volume && typeof volume.value === 'number' && Number.isFinite(volume.value)) {
    const unit = stringValue(volume.unit);
    if (unit) return volumeToUL(volume.value, unit);
  }
  return typeof details.volume_uL === 'number' && Number.isFinite(details.volume_uL) ? details.volume_uL : undefined;
}

function concentrationValue(value: unknown, totalVolume?: number): Dict | undefined {
  const record = asDict(value);
  if (!record || typeof record.value !== 'number' || !Number.isFinite(record.value)) return undefined;
  const unit = stringValue(record.unit);
  if (!unit) return undefined;
  const componentVolume = volumeToUL(record.value, unit);
  if (componentVolume !== undefined && totalVolume !== undefined && totalVolume > 0) {
    return { value: (componentVolume / totalVolume) * 100, unit: '% v/v', basis: 'volume_fraction' };
  }
  const basis = normalizeConcentrationBasis(record.basis);
  if (/^(?:percent|percentage|%)$/i.test(unit) || /^%\s*v\/v$/i.test(unit)) {
    return { value: record.value, unit: '% v/v', basis: basis ?? 'volume_fraction' };
  }
  if (/^%\s*w\/v$/i.test(unit)) {
    return { value: record.value, unit: '% w/v', basis: basis ?? 'mass_fraction' };
  }
  return {
    value: record.value,
    unit,
    ...(basis ? { basis } : {}),
  };
}

function countValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 1) ?? [];
}

function acronymFor(label: string): string | undefined {
  const ignored = new Set(['of', 'the', 'and', 'with']);
  const letters = tokenize(label)
    .filter((token) => !ignored.has(token))
    .map((token) => token[0])
    .join('');
  return letters.length >= 2 ? letters : undefined;
}

function inferRole(label: string | undefined, explicit?: unknown): CompositionRole {
  const explicitRole = normalizeRole(explicit);
  if (explicitRole) return explicitRole;
  const lower = (label ?? '').toLowerCase();
  if (/\b(?:cell|cells|hepg2|hep\s*g2)\b/.test(lower)) return 'cells';
  if (/\b(?:serum|fbs|fetal\s+bovine)\b/.test(lower)) return 'additive';
  if (/\b(?:medium|media|dmem|dulbecco)\b/.test(lower)) return 'buffer_component';
  return 'other';
}

function eventSearchText(e: Dict, details: Dict): string {
  return JSON.stringify({
    details,
    notes: e.notes,
    note: details.note,
  }).toLowerCase();
}

function mentionMatchesText(mention: PromptMention, text: string): boolean {
  const id = mention.id?.toLowerCase() ?? '';
  const label = mention.label.toLowerCase();
  if (id && text.includes(id)) return true;
  if (label && text.includes(label)) return true;
  const acronym = acronymFor(mention.label);
  if (acronym && new RegExp(`\\b${acronym.toLowerCase()}\\b`).test(text)) return true;
  const mentionTokens = tokenize(mention.label);
  if (mentionTokens.length === 0) return false;
  const textTokens = new Set(tokenize(text));
  const overlap = mentionTokens.filter((token) => textTokens.has(token)).length;
  return overlap / Math.max(mentionTokens.length, 1) >= 0.5;
}

function curieForMention(mention: PromptMention): string | undefined {
  const id = mention.id?.trim();
  if (!id) return undefined;
  return isCurieShaped(id) ? canonicalMaterialCurie(id) : `local:${id}`;
}

function inferPercentContribution(text: string, label: string | undefined): Dict | undefined {
  if (!label) return undefined;
  const labels = [label, acronymFor(label)].filter((entry): entry is string => Boolean(entry));
  for (const entry of labels) {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:v\\/v\\s*)?(?:[^.;,]{0,40})\\b${escaped}\\b`, 'i');
    const after = new RegExp(`\\b${escaped}\\b(?:[^.;,]{0,40})(\\d+(?:\\.\\d+)?)\\s*%`, 'i');
    const match = text.match(before) ?? text.match(after);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return { value, unit: '% v/v', basis: 'volume_fraction' };
    }
  }
  return undefined;
}

function partFromMention(mention: PromptMention, text: string): RefPart | undefined {
  const curie = curieForMention(mention);
  if (!curie) return undefined;
  const role = inferRole(mention.label);
  const inferredConcentration = role === 'additive' ? inferPercentContribution(text, mention.label) : undefined;
  return {
    curie,
    role,
    ...(inferredConcentration ? { concentration: inferredConcentration } : {}),
  };
}

function dedupeParts(parts: RefPart[]): RefPart[] {
  const seen = new Set<string>();
  const out: RefPart[] = [];
  for (const part of parts) {
    const key = part.curie ?? `mint:${part.label ?? ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/**
 * Pull the component list for an add_material event: grounded materials[] first
 * (the tool-schema contract), then prompt mentions, then degraded details.material_ref.
 */
function collectParts(e: Dict, details: Dict, mentions: PromptMention[] = []): RefPart[] {
  const topLevelMaterials = Array.isArray(e.materials) ? (e.materials as unknown[]) : [];
  const detailMaterials = Array.isArray(details.materials) ? (details.materials as unknown[]) : [];
  const materials = topLevelMaterials.length > 0 ? topLevelMaterials : detailMaterials;
  const eventTotalVolume = totalVolumeUL(details);
  const parts: RefPart[] = [];
  for (const item of materials) {
    const itemRecord = asDict(item);
    const ref = asDict(itemRecord?.ref);
    if (!ref) continue;
    const role = inferRole(undefined, itemRecord?.role ?? itemRecord?.slot);
    const concentration = concentrationValue(itemRecord?.concentration, eventTotalVolume);
    const count = countValue(itemRecord?.count);
    if (typeof ref.curie === 'string' && ref.curie) {
      const curie = canonicalMaterialCurie(ref.curie);
      const split = splitCurieList(curie);
      if (split) {
        for (const c of split) parts.push({ curie: canonicalMaterialCurie(c), role, ...(concentration ? { concentration } : {}), ...(count !== undefined ? { count } : {}) });
      } else {
        parts.push({ curie, role, ...(concentration ? { concentration } : {}), ...(count !== undefined ? { count } : {}) });
      }
    } else {
      const mint = asDict(ref.mint);
      if (mint && typeof mint.label === 'string' && mint.label) {
        parts.push({ label: mint.label, role: inferRole(mint.label, itemRecord?.role ?? itemRecord?.slot), ...(concentration ? { concentration } : {}), ...(count !== undefined ? { count } : {}) });
      }
    }
  }
  if (parts.length > 0) return dedupeParts(parts);

  const text = eventSearchText(e, details);
  const mentionParts = mentions
    .filter((mention) => mention.type === 'material' && mention.entityKind === 'material')
    .filter((mention) => mentionMatchesText(mention, text))
    .flatMap((mention) => {
      const part = partFromMention(mention, text);
      return part ? [part] : [];
    });
  if (mentionParts.length > 0) return dedupeParts(mentionParts);

  const mr = details.material_ref;
  if (typeof mr === 'string' && mr) {
    const split = splitCurieList(mr);
    if (split) return split.map((c) => ({ curie: c, role: 'other' }));
    if (isCurieShaped(mr)) return [{ curie: canonicalMaterialCurie(mr), role: 'other' }];
    return [];
  }
  const obj = asDict(mr);
  if (obj) {
    const id = typeof obj.id === 'string' ? obj.id : '';
    const label = typeof obj.label === 'string' ? obj.label : '';
    const split = (id ? splitCurieList(id) : null) ?? (label ? splitCurieList(label) : null);
    if (split) return split.map((c) => ({ curie: c, role: 'other' }));
    if (id && isCurieShaped(id)) return [{ curie: canonicalMaterialCurie(id), role: inferRole(label) }];
  }
  return [];
}

/**
 * A material_ref the well engine can already render properly: an object with
 * a label that isn't just the CURIE echoed back (and isn't a comma list).
 */
function hasHealthyMaterialRef(details: Dict): boolean {
  const obj = asDict(details.material_ref);
  if (!obj) return false;
  const id = typeof obj.id === 'string' ? obj.id : '';
  const label = typeof obj.label === 'string' ? obj.label : '';
  if (!label || label === id) return false;
  if (splitCurieList(label) || splitCurieList(id)) return false;
  return !isCurieShaped(label);
}

async function toMaterialRef(part: RefPart, labeler: MaterialLabeler): Promise<Dict> {
  if (part.curie) {
    const curie = canonicalMaterialCurie(part.curie);
    const label = (await labeler.lookup(curie)) ?? curie;
    if (curie.startsWith('local:')) {
      return { kind: 'record', id: curie.slice('local:'.length), type: 'material', label };
    }
    return {
      kind: 'ontology',
      id: curie,
      namespace: curie.split(':')[0] ?? '',
      label,
    };
  }
  return { kind: 'draft', id: `mint:${part.label}`, label: part.label ?? '' };
}

async function hasExistingRecordRef(ref: unknown, expectedType: string, store: RecordStore | undefined): Promise<boolean> {
  if (!store) return true;
  const record = asDict(ref);
  const id = stringValue(record?.id) ?? (typeof ref === 'string' ? ref : undefined);
  if (!id) return false;
  const envelope = await store.get(id).catch(() => null);
  if (!envelope) return false;
  const payload = asDict(envelope.payload);
  const kind = stringValue(payload?.kind);
  return !kind || kind === expectedType;
}

async function stripMissingRecordRefs(details: Dict, store: RecordStore | undefined): Promise<{ details: Dict; stripped: boolean }> {
  if (!store) return { details, stripped: false };
  let stripped = false;
  const next: Dict = { ...details };
  for (const [field, expectedType] of Object.entries(RECORD_REF_FIELDS)) {
    if (next[field] === undefined) continue;
    if (await hasExistingRecordRef(next[field], expectedType, store)) continue;
    delete next[field];
    stripped = true;
  }
  return { details: next, stripped };
}

function unresolvedSourceRequirement(materialRef: Dict): Dict {
  return {
    status: 'unresolved',
    material_ref: materialRef,
    reason: 'AI draft referenced a material concept but did not select a verified aliquot, instance, vendor product, or formulation record.',
  };
}

function hasVolume(details: Dict): boolean {
  return details.volume !== undefined || typeof details.volume_uL === 'number';
}

function detailCount(details: Dict, cellsPart: RefPart): number | undefined {
  const detailCountValue = countValue(details.count);
  return detailCountValue ?? cellsPart.count;
}

function materialRefSearchText(ref: Dict | undefined): string {
  if (!ref) return '';
  return JSON.stringify({ id: ref.id, label: ref.label, namespace: ref.namespace }).toLowerCase();
}

function isMediaLike(part: RefPart, ref: Dict | undefined): boolean {
  const text = `${part.curie ?? ''} ${part.label ?? ''} ${materialRefSearchText(ref)}`.toLowerCase();
  return /\b(?:medium|media|dmem|dulbecco)\b/.test(text) || /\bxco:/.test(text);
}

function roleForPart(part: RefPart, ref: Dict | undefined): CompositionRole {
  return part.role ?? inferRole(part.label ?? stringValue(ref?.label));
}

function roleForSnapshot(part: RefPart, ref: Dict | undefined, eventHasCells: boolean): CompositionRole {
  const role = roleForPart(part, ref);
  if (role === 'solvent' && eventHasCells && isMediaLike(part, ref)) return 'buffer_component';
  return role;
}

function eventIdWithSuffix(e: Dict, suffix: string): string | undefined {
  const id = stringValue(e.eventId);
  return id ? `${id}-${suffix}` : undefined;
}

function stripDraftOnlyMaterialFields(details: Dict): Dict {
  const stripped = stripLegacyMaterialScalarFields(details);
  const next = stripped === details ? { ...details } : stripped;
  delete next.composition_snapshot;
  delete next.formulation_kind;
  delete next.material_spec_ref;
  delete next.material_source_requirement;
  delete next.materials;
  return next;
}

function stripLegacyMaterialScalarFields(details: Dict): Dict {
  if (
    details.material_ref_kind === undefined &&
    details.material_ref_id === undefined &&
    details.material_ref_label === undefined
  ) {
    return details;
  }
  const next = { ...details };
  delete next.material_ref_kind;
  delete next.material_ref_id;
  delete next.material_ref_label;
  return next;
}

function withDetailsIfChanged<T>(event: T, originalDetails: Dict, details: Dict): T {
  return details === originalDetails ? event : { ...(event as Dict), details } as T;
}

function withoutGroundedMaterials(e: Dict): Dict {
  const { materials: _materials, ...rest } = e;
  return rest;
}

function makeCompositionEntry(part: RefPart, componentRef: Dict, role: CompositionRole, options: { includeConcentration?: boolean } = {}): Dict {
  return {
    component_ref: componentRef,
    role,
    ...(options.includeConcentration !== false && part.concentration ? { concentration: part.concentration } : {}),
  };
}

function stableKeyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableKeyValue);
  const record = asDict(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableKeyValue(record[key])]),
  );
}

function dedupeExactAddMaterialEvents<T>(events: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const event of events) {
    const record = asDict(event);
    if (!record || (record.event_type ?? record.verb) !== 'add_material') {
      out.push(event);
      continue;
    }
    const key = JSON.stringify({
      verb: record.event_type ?? record.verb,
      details: stableKeyValue(record.details),
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function trySplitMixedBiologicalAdd<T>(e: Dict, details: Dict, parts: RefPart[], refs: Dict[], sanitizedStripped: boolean): T[] | null {
  const cellsIndex = parts.findIndex((part, index) => roleForPart(part, refs[index]) === 'cells');
  if (cellsIndex < 0) return null;
  const cellsPart = parts[cellsIndex]!;
  const count = detailCount(details, cellsPart);
  if (count === undefined || !hasVolume(details)) return null;
  const mediumParts = parts
    .map((part, index) => ({ part, ref: refs[index] }))
    .filter((entry): entry is { part: RefPart; ref: Dict } => entry.ref !== undefined && roleForPart(entry.part, entry.ref) !== 'cells');
  if (mediumParts.length === 0) return null;

  const baseIndex = mediumParts.findIndex((entry) => roleForPart(entry.part, entry.ref) !== 'additive');
  const baseEntry = mediumParts[baseIndex >= 0 ? baseIndex : 0]!;
  const orderedMediumParts = [
    baseEntry,
    ...mediumParts.filter((entry) => entry !== baseEntry),
  ];
  const eventBase = withoutGroundedMaterials(e);
  const cellsRef = refs[cellsIndex]!;
  const cellDetails = stripDraftOnlyMaterialFields(details);
  cellDetails.material_ref = cellsRef;
  cellDetails.count = count;
  delete cellDetails.volume;
  delete cellDetails.volume_uL;
  delete cellDetails.material_ref_display;
  if (sanitizedStripped && !cellDetails.material_source_requirement) {
    cellDetails.material_source_requirement = unresolvedSourceRequirement(cellsRef);
  }

  const mediumDetails = stripDraftOnlyMaterialFields(details);
  mediumDetails.material_ref = baseEntry.ref;
  mediumDetails.composition_snapshot = orderedMediumParts.map((entry) => {
    const role = entry === baseEntry ? 'buffer_component' : roleForSnapshot(entry.part, entry.ref, true);
    return makeCompositionEntry(entry.part, entry.ref, role, { includeConcentration: entry !== baseEntry });
  });
  mediumDetails.formulation_kind = 'complex_composition';
  delete mediumDetails.count;
  delete mediumDetails.material_ref_display;
  if (sanitizedStripped && !mediumDetails.material_source_requirement) {
    mediumDetails.material_source_requirement = unresolvedSourceRequirement(baseEntry.ref);
  }

  return [
    { ...eventBase, ...(eventIdWithSuffix(e, 'cells') ? { eventId: eventIdWithSuffix(e, 'cells') } : {}), details: cellDetails } as T,
    { ...eventBase, ...(eventIdWithSuffix(e, 'medium') ? { eventId: eventIdWithSuffix(e, 'medium') } : {}), details: mediumDetails } as T,
  ];
}

/**
 * Normalize material references on drafted add_material events. See module doc.
 * Store-backed sibling refs are preserved only when the referenced record exists.
 * Missing/fabricated ALQ/MSP/MINST/VP refs are stripped and rebuilt from
 * grounded CURIE material parts.
 */
export async function enrichAddMaterialRefs<T>(
  events: T[],
  labeler: MaterialLabeler,
  options: EnrichAddMaterialRefsOptions = {},
): Promise<T[]> {
  const chunks = await Promise.all(
    events.map(async (ev): Promise<T[]> => {
      if (!ev || typeof ev !== 'object') return [ev];
      const e = ev as Dict;
      if ((e.event_type ?? e.verb) !== 'add_material') return [ev];
      const rawDetails = asDict(e.details) ?? {};
      const sanitized = await stripMissingRecordRefs(rawDetails, options.store);
      const details = stripLegacyMaterialScalarFields(sanitized.details);
      const hasSiblingRef = Object.keys(RECORD_REF_FIELDS).some((field) => details[field] !== undefined);
      if (hasSiblingRef && !sanitized.stripped) return [withDetailsIfChanged(ev, rawDetails, details)];

      const parts = collectParts(e, details, options.mentions ?? []);
      if (parts.length === 0) {
        if (!sanitized.stripped && hasHealthyMaterialRef(details)) return [withDetailsIfChanged(ev, rawDetails, details)];
        return sanitized.stripped || details !== rawDetails ? [{ ...e, details } as T] : [ev];
      }

      const refs = await Promise.all(parts.map((p) => toMaterialRef(p, labeler)));
      const splitEvents = trySplitMixedBiologicalAdd<T>(e, details, parts, refs, sanitized.stripped);
      if (splitEvents) return splitEvents;
      if (!sanitized.stripped && hasHealthyMaterialRef(details)) return [withDetailsIfChanged(ev, rawDetails, details)];

      const next: Dict = stripLegacyMaterialScalarFields({ ...details, material_ref: refs[0] });
      delete next.materials;
      const existingSnapshot = Array.isArray(details.composition_snapshot)
        ? (details.composition_snapshot as unknown[])
        : [];
      if (refs.length > 1 && existingSnapshot.length === 0) {
        // One ledger line per component: the well engine renders snapshot
        // entries individually, so a mixture stops collapsing onto one line.
        next.composition_snapshot = refs.map((componentRef, index) => {
          const part = parts[index] ?? {};
          return makeCompositionEntry(part, componentRef, roleForSnapshot(part, componentRef, false));
        });
        if (!next.formulation_kind) next.formulation_kind = 'complex_composition';
      }
      if (sanitized.stripped && !next.material_source_requirement) {
        next.material_source_requirement = unresolvedSourceRequirement(refs[0]!);
      }
      return [{ ...e, details: next } as T];
    }),
  );
  return dedupeExactAddMaterialEvents(chunks.flat());
}
