/**
 * Resident context (#1 / #2) — a small, stable preamble that grounds the agent
 * in the shape of the lab before it has to ask anything.
 *
 * Two parts:
 *  - World map: the kinds of records this lab works with (derived from the
 *    schema registry, so it stays accurate) plus a concise narrative of how
 *    they relate.
 *  - Pinned vocabulary: a capped sample of known ontology CURIEs so the model
 *    sees the lab's working noun vocabulary, not just its verbs (which the
 *    per-turn vocab pack already injects).
 *
 * Kept small (~2-3KB). NOTE: the inference client does no API-level prompt-cache
 * control, so this is prefill-cheap at best, not free — when caching lands,
 * order this stable block ahead of volatile per-turn context.
 */

import type { SchemaRegistry } from '../schema/SchemaRegistry.js';
import type { RecordStore } from '../store/types.js';
import { getOntologyTermRegistry } from '../registry/OntologyTermRegistry.js';
import type { LabProfile } from '../labProfile/labProfile.js';

const WORLD_NARRATIVE = [
  'How the lab fits together:',
  '- Materials descend concept → spec/formulation (a recipe like "1 mM fenofibrate in DMSO") → physical instance → aliquot. A material grounds to ontology terms via class[], and may be a composition of many components (e.g. DMEM ≈ 72 compounds).',
  '- Protocols compile through verbs into events on an event graph (verb → event → graph).',
  '- Knowledge about materials and results is expressed as claims, contexts, assertions, and evidence — not embedded in the records themselves.',
  '- Records reference each other by typed refs (recordId); they reference ontology terms by CURIE. Never name an entity in free text — resolve it to a CURIE.',
].join('\n');

/**
 * Build the record-kind node list from the schema registry. A schema is a
 * "record kind" when it pins `properties.kind.const` to a string.
 */
export function buildWorldMap(registry: SchemaRegistry): string {
  const kinds: Array<{ kind: string; title: string; desc: string }> = [];
  for (const entry of registry.getAll()) {
    const schema = entry.schema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown> | undefined;
    const kindProp = props?.kind as Record<string, unknown> | undefined;
    const kindConst = kindProp?.const;
    if (typeof kindConst !== 'string' || kindConst.length === 0) continue;
    const title = typeof schema.title === 'string' ? schema.title : kindConst;
    const desc =
      typeof schema.description === 'string'
        ? schema.description.replace(/\s+/g, ' ').trim().slice(0, 110)
        : '';
    kinds.push({ kind: kindConst, title, desc });
  }
  kinds.sort((a, b) => a.kind.localeCompare(b.kind));

  const lines = kinds.map((k) => `- ${k.kind} (${k.title})${k.desc ? `: ${k.desc}` : ''}`);
  return ['LAB WORLD MAP — the kinds of records this lab works with:', ...lines, '', WORLD_NARRATIVE].join('\n');
}

/**
 * A capped sample of the pinned ontology vocabulary. Honest framing: these are
 * terms the system knows, not necessarily in-use in this workspace (true
 * in-use would scan records — a refinement).
 */
export function buildPinnedVocab(limit = 40): string {
  let terms: Array<{ id: string; label: string }>;
  try {
    terms = getOntologyTermRegistry().list();
  } catch {
    return '';
  }
  if (terms.length === 0) return '';
  const sample = terms.slice(0, limit).map((t) => `- ${t.id} ${t.label}`);
  const more =
    terms.length > limit ? `\n…and ${terms.length - limit} more — use the resolve tool to search the full set.` : '';
  return ['KNOWN ONTOLOGY TERMS (pinned vocabulary — resolve for more):', ...sample].join('\n') + more;
}

/**
 * Ontology CURIEs actually in use in this workspace — scanned from material
 * records' class[] groundings. This is the true #2 ("what does exist here"),
 * naturally small and lab-specific. Returns '' when no material is grounded
 * yet (caller falls back to the pinned vocab).
 */
export async function buildInUseVocab(store: RecordStore, limit = 40): Promise<string> {
  let records: Awaited<ReturnType<RecordStore['list']>>;
  try {
    records = await store.list({ kind: 'material' });
  } catch {
    return '';
  }
  const seen = new Map<string, string>(); // curie -> label
  for (const rec of records) {
    const cls = (rec.payload as Record<string, unknown>).class;
    if (!Array.isArray(cls)) continue;
    for (const ref of cls) {
      const r = ref as Record<string, unknown> | null;
      if (r && r.kind === 'ontology' && typeof r.id === 'string' && r.id.length > 0 && !seen.has(r.id)) {
        seen.set(r.id, typeof r.label === 'string' && r.label ? r.label : r.id);
      }
    }
    if (seen.size >= limit) break;
  }
  if (seen.size === 0) return '';
  const lines = [...seen.entries()].slice(0, limit).map(([id, label]) => `- ${id} ${label}`);
  return ['ONTOLOGY TERMS IN USE IN THIS WORKSPACE:', ...lines].join('\n');
}

/**
 * Build the "THIS LAB" preamble from the declarative lab identity profile.
 * Returns '' when the profile is absent so callers get back-compat (no change).
 * Kept lean (~1.5KB): label, namespace, ontology prefix, and one line each for
 * instruments / protocols / reagents (labels only, refs omitted for space).
 */
export function buildLabPreamble(profile?: LabProfile): string {
  if (!profile) return '';
  const p = profile.profile;
  const lines: string[] = [];
  lines.push(`THIS LAB — ${p.label}`);
  lines.push(`- Namespace: ${p.namespace.prefix} (${p.namespace.baseUri})`);
  if (p.ontologyNamespace) lines.push(`- Ontology CURIEs use local prefix: ${p.ontologyNamespace}:`);
  const maybe = (title: string, entries: Array<{ label: string }>) =>
    entries.length > 0 ? `- ${title}: ${entries.map((e) => e.label).join(', ')}` : '';
  const instruments = maybe('Instruments', p.instruments);
  const protocols = maybe('Protocols', p.protocols);
  const reagents = maybe('Reagents', p.reagents);
  if (instruments || protocols || reagents) {
    const detail = [instruments, protocols, reagents].filter((s) => s.length > 0).join('\n');
    lines.push('Lab inventory:');
    lines.push(detail);
  }
  return lines.join('\n');
}

/**
 * Combine the world map and noun vocab into one resident block, injected into
 * the agent's system message on tool-bearing turns. Prefers the workspace's
 * in-use CURIEs (when a store is given and any material is grounded); otherwise
 * falls back to the pinned vocabulary.
 */
export async function buildResidentContext(
  registry: SchemaRegistry,
  store?: RecordStore,
  labProfile?: LabProfile,
): Promise<string> {
  const preamble = buildLabPreamble(labProfile);
  const inUse = store ? await buildInUseVocab(store) : '';
  const vocab = inUse || buildPinnedVocab();
  const body = [buildWorldMap(registry), vocab].filter((s) => s.length > 0).join('\n\n---\n\n');
  return preamble ? `${preamble}\n\n---\n\n${body}` : body;
}
