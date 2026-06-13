/**
 * The resolve() spine.
 *
 * One implementation of term → ranked CURIE candidates, walking the five-tier
 * hierarchy (local record → local OAK → remote OLS4 → vendor → mint-local).
 * Every consumer — the compiler's NounPhraseResolver, the UI slash menu and
 * copilot, and the agent's resolve tool — calls this so they all agree on what
 * a term resolves to. Output is always CURIE-typed; tier 5 is a mint affordance.
 *
 * Ranking: tier dominates (base 1.0 / 0.8 / 0.6 / 0.4 / 0.05), then match
 * quality (exact > prefix > substring). The tier gap (0.2) exceeds the max
 * match bonus (0.15), so a local substring hit always outranks a remote exact
 * hit — "prefer what the lab already has."
 *
 * Local tiers (records, OAK) resolve fast/synchronously; remote tiers (OLS4,
 * vendor) run best-effort under a short timeout and are simply omitted when
 * they fail or the box is offline.
 */

import type { OntologyConfig } from '../config/types.js';
import type { RecordStore } from '../store/types.js';
import type {
  MaterialLevel,
  ProviderHit,
  RankedCandidate,
  ResolveOptions,
  ResolveProvider,
  ResolveSource,
  ResolveTier,
} from './types.js';
import { createOakProvider } from './providers/oak.js';
import { createOls4Provider } from './providers/ols4.js';
import { createRecordProvider } from './providers/records.js';

const TIER_BASE: Record<ResolveTier, number> = { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.4, 5: 0.05 };
const DEFAULT_LOCAL_TIMEOUT_MS = 1500;
const DEFAULT_REMOTE_TIMEOUT_MS = 2500;
const DEFAULT_LIMIT = 20;

export interface ResolveSpineDeps {
  /** Ontology config (drives the OAK tier + OLS4 ontology restriction). */
  ontology?: OntologyConfig;
  /** Tier 1 — existing workspace records (incl. previously-minted local terms). */
  recordProvider?: ResolveProvider;
  /** Tier 4 — vendor/catalog search. */
  vendorProvider?: ResolveProvider;
  /** Override timeouts (testing). */
  localTimeoutMs?: number;
  remoteTimeoutMs?: number;
}

export interface ResolveSpine {
  resolve(term: string, opts?: ResolveOptions): Promise<RankedCandidate[]>;
}

interface TierSpec {
  tier: ResolveTier;
  source: ResolveSource;
  provider: ResolveProvider;
  remote: boolean;
}

function matchBonus(term: string, label: string): number {
  const t = term.trim().toLowerCase();
  const l = label.trim().toLowerCase();
  if (!t || !l) return 0;
  if (l === t) return 0.15;
  if (l.startsWith(t)) return 0.08;
  if (l.includes(t)) return 0.02;
  return 0;
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 1) ?? [];
}

function acronym(value: string): string | undefined {
  const ignored = new Set(['of', 'the', 'and', 'with']);
  const letters = tokens(value)
    .filter((token) => !ignored.has(token))
    .map((token) => token[0])
    .join('');
  return letters.length >= 2 ? letters : undefined;
}

function hasLexicalSupport(term: string, label: string, definition?: string): boolean {
  const t = term.trim().toLowerCase();
  const l = label.trim().toLowerCase();
  if (!t || !l) return false;
  if (l === t || l.startsWith(t) || l.includes(t) || t.includes(l)) return true;

  const labelAcronym = acronym(label);
  if (labelAcronym && labelAcronym === t.replace(/[^a-z0-9]/g, '')) return true;

  const termTokens = tokens(term);
  if (termTokens.length === 0) return false;
  const labelTokens = new Set(tokens(label));
  const overlap = termTokens.filter((token) => labelTokens.has(token)).length;
  if (overlap / Math.max(termTokens.length, 1) >= 0.5) return true;

  if (definition) {
    const definitionTokens = new Set(tokens(definition));
    const definitionOverlap = termTokens.filter((token) => definitionTokens.has(token)).length;
    return definitionOverlap / Math.max(termTokens.length, 1) >= 0.75;
  }
  return false;
}

function namespaceOf(hit: ProviderHit): string {
  if (hit.namespace) return hit.namespace;
  const curie = hit.curie ?? '';
  return curie.includes(':') ? (curie.split(':')[0] ?? '') : '';
}

/** Run a provider under a timeout, isolating failures to an empty result. */
async function runProvider(
  provider: ResolveProvider,
  term: string,
  limit: number,
  timeoutMs: number,
): Promise<ProviderHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider(term, limit, controller.signal);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function createResolveSpine(deps: ResolveSpineDeps = {}): ResolveSpine {
  const localTimeout = deps.localTimeoutMs ?? DEFAULT_LOCAL_TIMEOUT_MS;
  const remoteTimeout = deps.remoteTimeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;

  const tiers: TierSpec[] = [];
  if (deps.recordProvider) {
    tiers.push({ tier: 1, source: 'local-record', provider: deps.recordProvider, remote: false });
  }
  const oak = createOakProvider(deps.ontology);
  if (oak) {
    tiers.push({ tier: 2, source: 'oak', provider: oak, remote: false });
  }
  tiers.push({
    tier: 3,
    source: 'ols4',
    provider: createOls4Provider(deps.ontology?.localOntologies),
    remote: true,
  });
  if (deps.vendorProvider) {
    tiers.push({ tier: 4, source: 'vendor', provider: deps.vendorProvider, remote: true });
  }

  async function resolve(term: string, opts: ResolveOptions = {}): Promise<RankedCandidate[]> {
    const trimmed = (term ?? '').trim();
    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 100);
    const mint = mintAffordance(trimmed, opts.level);

    if (trimmed.length < 1) return [mint];

    const perTier = Math.max(limit, 5);
    const activeTiers = opts.localOnly ? tiers.filter((spec) => !spec.remote) : tiers;
    const results = await Promise.all(
      activeTiers.map(async (spec) => {
        const hits = await runProvider(
          spec.provider,
          trimmed,
          perTier,
          spec.remote ? remoteTimeout : localTimeout,
        );
        return hits
          .filter((hit) => hasLexicalSupport(trimmed, hit.label, hit.definition))
          .map((hit) => toCandidate(hit, spec, trimmed, opts.level));
      }),
    );

    // Dedupe by CURIE, keeping the highest-scoring instance.
    const byCurie = new Map<string, RankedCandidate>();
    for (const candidate of results.flat()) {
      if (!candidate.curie) continue;
      const existing = byCurie.get(candidate.curie);
      if (!existing || candidate.score > existing.score) {
        byCurie.set(candidate.curie, candidate);
      }
    }

    const ranked = [...byCurie.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    ranked.push(mint);
    return ranked;
  }

  return { resolve };
}

function toCandidate(
  hit: ProviderHit,
  spec: TierSpec,
  term: string,
  wantLevel?: MaterialLevel,
): RankedCandidate {
  const level = hit.level ?? 'unknown';
  const levelBonus = wantLevel && level === wantLevel ? 0.03 : 0;
  return {
    curie: hit.curie,
    label: hit.label,
    namespace: namespaceOf(hit),
    tier: spec.tier,
    level,
    score: TIER_BASE[spec.tier] + matchBonus(term, hit.label) + levelBonus,
    source: spec.source,
    ...(hit.uri ? { uri: hit.uri } : {}),
    ...(hit.definition ? { definition: hit.definition } : {}),
  };
}

/**
 * Build the spine from the server's AppContext (typed structurally to avoid a
 * cycle). All three consumers — HTTP handler, MCP tool, compiler — call this so
 * they share one tier configuration and therefore agree on every resolution.
 */
export function createResolveSpineFromContext(ctx: {
  store: RecordStore;
  appConfig?: { ontology?: OntologyConfig } | undefined;
}): ResolveSpine {
  const deps: ResolveSpineDeps = { recordProvider: createRecordProvider(ctx.store) };
  if (ctx.appConfig?.ontology) deps.ontology = ctx.appConfig.ontology;
  return createResolveSpine(deps);
}

function mintAffordance(term: string, level?: MaterialLevel): RankedCandidate {
  return {
    curie: '',
    label: term ? `Create local term “${term}”` : 'Create local term',
    namespace: 'local',
    tier: 5,
    level: level ?? 'concept',
    score: TIER_BASE[5],
    source: 'mint',
    mint: { label: term },
  };
}
