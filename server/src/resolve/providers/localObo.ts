/**
 * local-obo — serve the enabled `local-obo` rows of config/ontology-sources.yaml.
 *
 * The registry (O1) declares on-disk OBO snapshots (labware/equipment); this
 * provider makes them answer on the same search surface OLS4 already answers
 * on. Each [Term] becomes one `ProviderHit`: `curie` = the stanza `id:`,
 * `label` = `name:`, `namespace` = the prefix derived FROM the CURIE (never a
 * registry literal), `definition` = `def:`, `uri` derived from the row's
 * namespace_iri. Matching is a case-insensitive substring over label +
 * synonyms, with the definition as a last resort — hits stay in file order and
 * carry no tier/score (ranking belongs to the caller).
 *
 * Every enabled local source reports a load status. A source whose path is
 * missing or unparseable yields a NAMED failure instead of silently
 * contributing zero results, and never sinks the surviving sources.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { ProviderHit, ResolveProvider } from '../types.js';

const DEFAULT_REGISTRY_PATH = fileURLToPath(
  new URL('../../../../config/ontology-sources.yaml', import.meta.url),
);

export interface LocalOboSource {
  id: string;
  prefix: string;
  path: string;
  namespaceIri?: string;
  displayName?: string;
  root?: string;
}

export interface LocalOboSourceStatus {
  id: string;
  path: string;
  ok: boolean;
  termCount: number;
  error?: string;
}

export interface LocalOboSearchReport {
  hits: ProviderHit[];
  sources: LocalOboSourceStatus[];
  /** One named entry per source that could not be loaded. */
  failures: Array<{ source: string; error: string }>;
}

export interface LocalOboSearchOptions {
  /** Registry to read; defaults to the shipped config/ontology-sources.yaml. */
  registryPath?: string;
  /** Restrict to these source ids or prefixes (case-insensitive). */
  ontologies?: string[];
}

interface OboTerm {
  curie: string;
  label: string;
  synonyms: string[];
  definition?: string;
}

/** Parse-once cache keyed by the OBO file path. Successful parses only. */
const termCache = new Map<string, OboTerm[]>();

/** Read the registry and return its enabled `local-obo` rows. */
export function loadLocalOboSources(
  registryPath: string = DEFAULT_REGISTRY_PATH,
): LocalOboSource[] {
  const doc = parseYaml(readFileSync(registryPath, 'utf8')) as {
    sources?: Array<Record<string, unknown>>;
  };
  return (doc.sources ?? [])
    .filter((row) => row.loader === 'local-obo' && row.enabled === true)
    .map((row) => ({
      id: String(row.id),
      prefix: String(row.prefix),
      path: String(row.path),
      ...(typeof row.namespace_iri === 'string' ? { namespaceIri: row.namespace_iri } : {}),
      ...(typeof row.display_name === 'string' ? { displayName: row.display_name } : {}),
      ...(typeof row.root === 'string' ? { root: row.root } : {}),
    }));
}

/** Text inside the first/last double quotes of an OBO value, if any. */
function quoted(value: string): string | undefined {
  const start = value.indexOf('"');
  const end = value.lastIndexOf('"');
  if (start === -1 || end <= start) return undefined;
  const text = value
    .slice(start + 1, end)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .trim();
  return text.length > 0 ? text : undefined;
}

/** Generalisation of the conformance test's id-only OBO reader: labels too. */
export function parseObo(content: string): OboTerm[] {
  interface Draft {
    id?: string;
    label?: string;
    synonyms: string[];
    definition?: string;
  }
  const terms: OboTerm[] = [];
  let current: Draft | undefined;
  const flush = (): void => {
    if (current?.id && current.label) {
      terms.push({
        curie: current.id,
        label: current.label,
        synonyms: current.synonyms,
        ...(current.definition ? { definition: current.definition } : {}),
      });
    }
    current = undefined;
  };
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line === '[Term]') {
      flush();
      current = { synonyms: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      flush();
      continue;
    }
    if (line.startsWith('id: ')) current.id = line.slice(4).trim();
    else if (line.startsWith('name: ')) current.label = line.slice(6).trim();
    else if (line.startsWith('def: ')) {
      const definition = quoted(line.slice(5));
      if (definition) current.definition = definition;
    }
    else if (line.startsWith('synonym: ')) {
      const synonym = quoted(line.slice(9));
      if (synonym) current.synonyms.push(synonym);
    }
  }
  flush();
  return terms;
}

function loadTerms(path: string): OboTerm[] {
  const cached = termCache.get(path);
  if (cached) return cached;
  const terms = parseObo(readFileSync(path, 'utf8'));
  if (terms.length === 0) throw new Error(`no [Term] stanzas in ${path}`);
  termCache.set(path, terms);
  return terms;
}

/**
 * A definition may only answer queries the lexical surface cannot: the query
 * must be multi-token with every token >= 3 characters. Ordinary single-token
 * nouns ("sample", "water", "plate") and short-token noise ("b" in "Material B")
 * match English prose in definitions everywhere — admitting them made the tier
 * non-additive (D1: 4 junk candidates flipped the seeded drive to
 * needs-clarification). The label/synonym arm above is the additive surface and
 * is UNCHANGED by this gate.
 */
function definitionArmAllowed(tokens: string[]): boolean {
  return tokens.length > 1 && tokens.every((token) => token.length >= 3);
}

function matchesQuery(term: OboTerm, tokens: string[]): boolean {
  const lexical = `${term.label}\n${term.synonyms.join('\n')}`.toLowerCase();
  if (tokens.every((token) => lexical.includes(token))) return true;
  if (!definitionArmAllowed(tokens)) return false;
  const definition = term.definition?.toLowerCase();
  return Boolean(definition) && tokens.every((token) => (definition as string).includes(token));
}

function toHit(term: OboTerm, source: LocalOboSource): ProviderHit {
  const colon = term.curie.indexOf(':');
  const prefix = colon > 0 ? term.curie.slice(0, colon) : source.prefix;
  // OBO IRI convention: <namespace_iri>/<PREFIX>_<local id>.
  const uri = source.namespaceIri
    ? `${source.namespaceIri.replace(/\/+$/, '')}/${term.curie.replace(/:/g, '_')}`
    : undefined;
  return {
    curie: term.curie,
    label: term.label,
    namespace: prefix,
    level: 'concept',
    ...(uri ? { uri } : {}),
    ...(term.definition ? { definition: term.definition } : {}),
  };
}

/** Search every enabled local-obo source; report named failures per source. */
export async function searchLocalObo(
  term: string,
  limit: number,
  options: LocalOboSearchOptions = {},
): Promise<LocalOboSearchReport> {
  const tokens = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sources = loadLocalOboSources(options.registryPath);
  const wanted = (options.ontologies ?? []).map((o) => o.trim().toLowerCase()).filter(Boolean);
  const selected =
    wanted.length === 0
      ? sources
      : sources.filter(
          (s) => wanted.includes(s.id.toLowerCase()) || wanted.includes(s.prefix.toLowerCase()),
        );

  const hits: ProviderHit[] = [];
  const statuses: LocalOboSourceStatus[] = [];
  const failures: Array<{ source: string; error: string }> = [];

  for (const source of selected) {
    try {
      const terms = loadTerms(source.path);
      statuses.push({ id: source.id, path: source.path, ok: true, termCount: terms.length });
      if (tokens.length > 0) {
        for (const t of terms) if (matchesQuery(t, tokens)) hits.push(toHit(t, source));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      statuses.push({ id: source.id, path: source.path, ok: false, termCount: 0, error: message });
      failures.push({ source: source.id, error: message });
    }
  }

  return { hits: hits.slice(0, Math.max(0, limit)), sources: statuses, failures };
}

/**
 * Boot warm: load every enabled local-obo source once and report one named
 * status per source. Synchronous and side-effect-free beyond the parse cache;
 * the caller decides how to surface failures.
 */
export function warmLocalOboSources(
  options: LocalOboSearchOptions = {},
): LocalOboSourceStatus[] {
  return loadLocalOboSources(options.registryPath).map((source) => {
    try {
      const terms = loadTerms(source.path);
      return { id: source.id, path: source.path, ok: true, termCount: terms.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { id: source.id, path: source.path, ok: false, termCount: 0, error: message };
    }
  });
}

/** Spine-facing provider: hits, or a thrown error NAMING every failed source. */
export function createLocalOboProvider(options: LocalOboSearchOptions = {}): ResolveProvider {
  return async (term, limit) => {
    const report = await searchLocalObo(term, limit, options);
    if (report.hits.length > 0) return report.hits;
    if (report.failures.length > 0) {
      throw new Error(
        report.failures.map((f) => `local-obo source "${f.source}": ${f.error}`).join('; '),
      );
    }
    return [];
  };
}
