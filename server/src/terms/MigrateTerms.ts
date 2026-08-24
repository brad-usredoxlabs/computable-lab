/**
 * MigrateTerms — root-anchor migration: concept records → canonical terms.
 *
 * The identity spine migration (Option B). Concept-level records — material,
 * vendor-product, labware-definition, instrument-definition, verb-definition —
 * each get a canonical `term` node that owns their identity:
 *
 *   - preferredLabel ← name / canonical / display_name
 *   - aliases[]       ← synonyms[] + platform_aliases + alternate spellings
 *   - linkouts[]      ← ontology class CURIEs (ontology linkouts), vendor +
 *                       catalog_number (vendor linkouts), EXACT verbs (action)
 *   - domain          ← material domain / instrument_type
 *
 * Role records (material-spec/instance/lot/aliquot, specific labware units)
 * keep their physical identity but re-anchor their root `material_ref`/root ref
 * to the term, so the concept→formulation→instance→aliquot hierarchy is intact
 * while the ROOT namespace becomes TERM-… instead of MAT-/VPR-/LWD-/INSTDEF-.
 *
 * This module is idempotent: running it twice yields the same terms and re-points
 * the same refs. Legacy concept record ids are NOT preserved as separate namespaces
 * (zero backwards compatibility, per owner decision) — the term id becomes the one
 * identity.
 */

import type { RecordStore } from '../store/types.js';
import { TERM_SCHEMA_ID, ensureTermForLabel, type TermKind, type EnsureTermOptions } from './EnsureTerm.js';
import type { RefShape } from '../materials/MaterialGrounding.js';

/** Which existing record types fold into a term, and the term kind they become. */
const CONCEPT_KIND_TO_TERM: Record<string, TermKind> = {
  material: 'material',
  'vendor-product': 'vendor',
  'labware-definition': 'labware',
  labware: 'labware',
  'instrument-definition': 'instrument',
  instrument: 'instrument',
  'verb-definition': 'verb',
};

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

/** First non-empty string among candidate fields. */
function firstString(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function collectAliases(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  };
  const arr = payload.synonyms;
  if (Array.isArray(arr)) arr.forEach(push);
  const paliases = payload.platform_aliases;
  if (Array.isArray(paliases)) {
    for (const a of paliases) {
      const alias = asRecord(a).alias;
      if (typeof alias === 'string' && alias.trim()) out.add(alias.trim());
    }
  }
  const aliases = payload.aliases;
  if (Array.isArray(aliases)) aliases.forEach(push);
  return [...out];
}

/** Pull `kind: ontology` refs (CURIEs) out of class[] / class into linkouts. */
function ontologyLinkouts(payload: Record<string, unknown>): EnsureTermOptions['linkouts'] {
  const out: NonNullable<EnsureTermOptions['linkouts']> = [];
  const classArr = Array.isArray(payload.class) ? payload.class : [];
  for (const entry of classArr) {
    const e = asRecord(entry);
    if (e.kind !== 'ontology') continue;
    const curie = firstString(e, 'id', 'curie');
    if (!curie) continue;
    out.push({
      kind: 'ontology',
      curie,
      namespace: firstString(e, 'namespace') ?? curie.split(':')[0] ?? '',
      ...(typeof e.uri === 'string' && e.uri ? { uri: e.uri } : {}),
      ...(typeof e.label === 'string' && e.label ? { label: e.label } : { label: curie }),
    });
  }
  return out;
}

/** Vendor + catalog_number → a vendor linkout. */
function vendorLinkout(payload: Record<string, unknown>): EnsureTermOptions['linkouts'] {
  const vendor = firstString(payload, 'vendor');
  const catalog = firstString(payload, 'catalog_number', 'catalogNumber');
  if (!vendor && !catalog) return undefined;
  const grade = firstString(payload, 'grade');
  const out: EnsureTermOptions['linkouts'] = [];
  out.push({
    kind: 'vendor',
    ...(vendor ? { vendor } : { vendor: 'unknown' }),
    ...(catalog ? { catalog_number: catalog } : {}),
    ...(grade ? { grade } : {}),
    label: [vendor, catalog, grade].filter(Boolean).join(' '),
  });
  return out;
}

export interface MigrationResult {
  termsMinted: number;
  termsReused: number;
  repointed: number;
  skipped: { recordId: string; reason: string }[];
}

/**
 * Convert every concept-level record to a canonical term and return the
 * oldId → termId mapping so the caller can re-point role-record root refs.
 */
export async function migrateConceptToTerms(
  store: RecordStore,
  kinds?: string[],
): Promise<{ mapping: Map<string, { termId: string; kind: TermKind }>; result: MigrationResult }> {
  const targets = (kinds ?? Object.keys(CONCEPT_KIND_TO_TERM)).filter((k) => CONCEPT_KIND_TO_TERM[k]);
  const mapping = new Map<string, { termId: string; kind: TermKind }>();
  const result: MigrationResult = { termsMinted: 0, termsReused: 0, repointed: 0, skipped: [] };

  for (const kind of targets) {
    const records = await store.list({ kind });
    for (const env of records) {
      const payload = asRecord(env.payload);
      const termKind = CONCEPT_KIND_TO_TERM[kind];
      if (termKind === undefined) continue; // mapped kind — defensive

      // Preferred label: the concept record's human name.
      const label =
        firstString(payload, 'name', 'canonical', 'display_name', 'title', 'preferredLabel') ??
        env.recordId;

      // Verb-definition keeps its canonical verb as an action linkout.
      const linkouts = [
        ...(ontologyLinkouts(payload) ?? []),
        ...(vendorLinkout(payload) ?? []),
      ];
      if (termKind === 'verb' && typeof payload.canonical === 'string' && payload.canonical.trim()) {
        linkouts.push({
          kind: 'action',
          verb: payload.canonical.trim(),
          ...((typeof payload.exact === 'string' && payload.exact) ? { exact: payload.exact } : {}),
          label: `verb: ${payload.canonical.trim()}`,
        });
      }

      const domain = firstString(payload, 'domain', 'instrument_type');
      const options: EnsureTermOptions = {
        source: 'import',
        aliases: collectAliases(payload),
        ...(linkouts.length > 0 ? { linkouts } : {}),
        ...(domain ? { domain } : {}),
      };

      try {
        // Count minted vs reused by snapshotting the term set BEFORE the ensure
        // (a term just minted by ensureTermForLabel must not read as "reused").
        const preExisting = await store.list({ schemaId: TERM_SCHEMA_ID });
        const preIds = new Set(preExisting.map((e) => e.recordId));

        const term = await ensureTermForLabel(store, label, termKind, options);
        if (preIds.has(term.recordId)) result.termsReused += 1;
        else result.termsMinted += 1;

        mapping.set(env.recordId, { termId: term.recordId, kind: termKind });
      } catch (err) {
        result.skipped.push({
          recordId: env.recordId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { mapping, result };
}

/**
 * Re-point role records (material-spec/instance/lot/aliquot, labware units)
 * whose root ref points at a migrated concept id → the canonical term id.
 */
export async function repointRoleRefs(
  store: RecordStore,
  mapping: Map<string, { termId: string; kind: TermKind }>,
  roleKinds: string[] = ['material-spec', 'material-instance', 'material-lot', 'aliquot'],
): Promise<number> {
  let repointed = 0;
  for (const roleKind of roleKinds) {
    const records = await store.list({ kind: roleKind });
    for (const env of records) {
      const payload = asRecord(env.payload);
      const materialRef = payload.material_ref;
      if (
        materialRef &&
        typeof materialRef === 'object' &&
        !Array.isArray(materialRef) &&
        typeof (materialRef as Record<string, unknown>).id === 'string' &&
        mapping.has(String((materialRef as Record<string, unknown>).id))
      ) {
        const oldId = String((materialRef as Record<string, unknown>).id);
        const target = mapping.get(oldId)!;
        const ref: RefShape = {
          kind: 'record',
          id: target.termId,
          type: 'term',
          ...(typeof (materialRef as Record<string, unknown>).label === 'string'
            ? { label: String((materialRef as Record<string, unknown>).label) }
            : {}),
        };
        payload.material_ref = ref;
        await store.update({ envelope: env, message: `re-point ${roleKind} root ref to term ${target.termId}` });
        repointed += 1;
      }
    }
  }
  return repointed;
}

/** Single entry point: convert concept records then re-point their role children. */
export async function migrateRootsToTerms(
  store: RecordStore,
  kinds?: string[],
  roleKinds?: string[],
): Promise<{ mapping: Map<string, { termId: string; kind: TermKind }>; result: MigrationResult }> {
  const { mapping, result } = await migrateConceptToTerms(store, kinds);
  result.repointed = await repointRoleRefs(store, mapping, roleKinds);
  return { mapping, result };
}

export { CONCEPT_KIND_TO_TERM };