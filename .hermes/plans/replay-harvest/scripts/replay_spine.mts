/**
 * MATRES-REPLAY harvest leg — H2 instrumented spine replay (harness script;
 * NOT product code, never imported by server).
 *
 * Runs the REAL ResolveSpine (server/src/resolve/ResolveSpine.ts) and the REAL
 * SPINE-3 resolution engine (server/src/compiler/resolution/resolutionEngine.ts)
 * OFFLINE against the read-only harvested copy of the lane2 record store.
 *
 * Network DISABLED five ways (all reported in the fate files):
 *   1. globalThis.fetch replaced with a throwing stub BEFORE any provider is
 *      built — a stray remote call fails visibly, and the spine's provider
 *      isolation records it as an honest empty tier, never a silent hang;
 *   2. CLA_ONTOLOGY_SERVICE_URL deleted from the env — the OAK tier-2 provider
 *      is never built (createOakProvider returns undefined without a URL);
 *   3. direct spine probes run with opts.localOnly:true (P6 semantics —
 *      remote tiers are excluded from the tier list itself);
 *   4. no vendorProvider is passed (tier 4 omitted from the spine at all);
 *   5. the ENGINE's spine adapter hard-codes localOnly:true (adapters.ts:82) —
 *      the compiler path is remote-blind by construction.
 *
 * Instrumentation points (all via public seams — zero product-code edits):
 *   - term/record providers wrapped to capture the RAW provider hits (inputs
 *     to the spine's own hasLexicalSupport/dedupe filters);
 *   - the ranked spine output captured per noun;
 *   - the engine outcome (bindings / clarifications / traces) per (noun, arm);
 *   - fate classification derived by diffing raw-vs-ranked-vs-engine stages.
 *
 * Usage:  node --import tsx --import ./hooks-resolve.mjs replay_spine.ts
 * (cwd must be the worktree root; run via scripts/run-all.sh)
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---- offline enforcement BEFORE any module import below can build providers
const fetchCalls: Array<{ url: string }> = [];
(globalThis as { fetch: unknown }).fetch = async (input: unknown) => {
  const url = typeof input === 'string' ? input : String((input as { url?: unknown })?.url ?? input);
  fetchCalls.push({ url });
  throw new Error(`MATRES-REPLAY offline harness: network disabled (blocked ${url})`);
};
delete process.env.CLA_ONTOLOGY_SERVICE_URL;

type Envelope = { recordId: string; schemaId: string; payload: Record<string, unknown> };

const HARVEST = new URL('..', import.meta.url).pathname; // replay-harvest/
const ROOT = join(HARVEST, '..', '..', '..');             // worktree root (.hermes/plans/replay-harvest -> root)
const RECORDS = join(HARVEST, 'records');

// ---- read-only RecordStore over the harvested YAML copies ------------------
const all: Envelope[] = [];
for (const kindDir of readdirSync(RECORDS)) {
  const dir = join(RECORDS, kindDir);
  let files: string[] = [];
  try { files = readdirSync(dir); } catch { continue; }
  for (const f of files) {
    if (!f.endsWith('.yaml')) continue;
    try {
      const payload = parseYaml(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;
      if (!payload || typeof payload !== 'object' || typeof payload.recordId !== 'string') continue;
      all.push({
        recordId: String(payload.recordId),
        schemaId: String(payload.$schema ?? ''),
        payload,
      });
    } catch { /* a corrupt copy is skipped, noted in the count below */ }
  }
}

const store = {
  get: async (id: string) => all.find((e) => e.recordId === id) ?? null,
  exists: async (id: string) => all.some((e) => e.recordId === id),
  list: async (filter: { kind?: string; schemaId?: string } = {}) => {
    if (filter.schemaId) return all.filter((e) => e.schemaId === filter.schemaId);
    if (filter.kind) return all.filter((e) => String(e.payload.kind ?? '') === filter.kind);
    return all;
  },
} as never; // structural subset — providers only use get/list

// ---- product modules under test (REAL, unmodified) -------------------------
const { createResolveSpine } = await import(join(ROOT, 'server/src/resolve/ResolveSpine.ts'));
const { createTermProvider } = await import(join(ROOT, 'server/src/resolve/providers/terms.ts'));
const { createRecordProvider } = await import(join(ROOT, 'server/src/resolve/providers/records.ts'));
const { createSpineAdapter } = await import(join(ROOT, 'server/src/compiler/resolution/adapters.ts'));
const { buildStrategyRegistry } = await import(join(ROOT, 'server/src/compiler/resolution/strategies.ts'));
const { resolveScientistIntentNouns } = await import(join(ROOT, 'server/src/compiler/resolution/resolutionEngine.ts'));
const { loadScientistIntentVocabulary } = await import(join(ROOT, 'server/src/compiler/scientistIntent/vocabulary.ts'));

const vocab = loadScientistIntentVocabulary({
  path: join(ROOT, 'schema/scientist-intent/scientist-intent-vocabulary.yaml'),
});

// ---- capture-wrapped providers (public dep seam; product untouched) --------
type RawCapture = { tier: string; term: string; curie: string; label: string; level?: string; termKind?: string }[];
function capture(inner: (term: string, limit: number, signal: AbortSignal) => Promise<unknown[]>, tier: string, sink: RawCapture) {
  return async (term: string, limit: number, signal: AbortSignal) => {
    const hits = (await inner(term, limit, signal)) as Array<Record<string, unknown>>;
    for (const h of hits) {
      sink.push({
        tier, term,
        curie: String(h.curie ?? ''), label: String(h.label ?? ''),
        ...(typeof h.level === 'string' ? { level: h.level } : {}),
        ...(typeof h.termKind === 'string' ? { termKind: h.termKind } : {}),
      });
    }
    return hits as never;
  };
}

const cases = JSON.parse(readFileSync(join(HARVEST, 'fixtures/cases.json'), 'utf8')) as {
  turns: Array<{ id: string; utterance: string; nouns: string[]; engine_arms: string[]; source: string }>;
};

mkdirSync(join(HARVEST, 'fates'), { recursive: true });
mkdirSync(join(HARVEST, 'panels'), { recursive: true });

const summary: Array<Record<string, unknown>> = [];

for (const turn of cases.turns) {
  for (const noun of turn.nouns) {
    // ---------------- direct spine probe (localOnly, P6 semantics) ----------
    const raw: RawCapture = [];
    const spine = createResolveSpine({
      termProvider: capture(createTermProvider(store as never), 'tier0-canonical-term', raw),
      recordProvider: capture(createRecordProvider(store as never), 'tier1-local-record', raw),
      // no ontology config -> OAK tier not built; no vendorProvider -> tier 4 absent
    });
    const ranked = await spine.resolve(noun, { localOnly: true });

    // fate diff: raw hit -> final ranked (or absent)
    const rankedByCurie = new Map(ranked.filter((c: { curie?: string }) => c.curie).map((c: { curie: string }) => [c.curie, c]));
    const fate = raw.map((h) => {
      const kept = rankedByCurie.get(h.curie);
      if (kept) return { ...h, fate: 'returned-and-ranked', score: (kept as { score: number }).score };
      const dup = raw.filter((r) => r.curie === h.curie).length > 1;
      return { ...h, fate: dup ? 'suppressed-at-stage:spine-curie-dedupe' : 'suppressed-at-stage:spine-lexical-filter (hasLexicalSupport)' };
    });

    // ---------------- engine replay per declared arm ------------------------
    const engineResults: Array<Record<string, unknown>> = [];
    for (const verb of turn.engine_arms) {
      const contracts = vocab.argContracts(verb) as Array<{ name: string; level?: string; kind: string }>;
      const materialContract = contracts.find((c) => c.name === 'material');
      if (!materialContract) continue;
      const intent = {
        kind: 'scientist-intent', version: '0.1.0', intentId: `replay-${turn.id}-${verb}`,
        sourcePrompt: turn.utterance,
        actions: [{ action: verb as never, material: noun }],
        unresolved: [],
      };
      const tracker = { failed: false, message: undefined as string | undefined };
      const spineAdapter = createSpineAdapter(spine, tracker); // engine passes localOnly:true internally
      const labwareHintAdapter = {
        id: 'labware-hint',
        async gather(label: string) {
          const lw = await (store as unknown as { list: (f: { kind?: string }) => Promise<Envelope[]> }).list({ kind: 'labware' });
          const needle = label.toLowerCase();
          return {
            candidates: lw
              .filter((e) => String(e.payload.title ?? e.payload.name ?? '').toLowerCase().includes(needle))
              .map((e) => ({ curie: String(e.payload.recordId), label: String(e.payload.title ?? e.payload.name), namespace: 'local', tier: 1, level: 'unknown', score: 1.0, source: 'local-record' })),
            failed: false,
          };
        },
      };
      const levelFor = (v: string, arg: string) =>
        (vocab.argContracts(v) as Array<{ name: string; level?: string }>).find((a) => a.name === arg)?.level;
      const engineDeps = {
        adapters: [spineAdapter, labwareHintAdapter],
        strategies: buildStrategyRegistry(),
        levelFor: levelFor as never,
        termsForSuggestions: async () =>
          (all.filter((e) => e.schemaId.includes('/term.schema.yaml'))
            .map((e) => ({ preferredLabel: String(e.payload.preferredLabel ?? e.payload.name ?? ''), aliases: Array.isArray(e.payload.aliases) ? (e.payload.aliases as string[]) : [] }))),
      };
      const outcome = await resolveScientistIntentNouns(intent as never, vocab, engineDeps as never);
      const band = vocab.policies().ambiguity.confidenceAccept;
      // REMOTE-CLAMP ARITHMETIC (deterministic from code + declared data; remote
      // tiers cannot fire in this offline store, so the probe is arithmetic):
      //   resolutionEngine.ts confidenceOf = Math.min(Math.max(score,0),1)
      //   ResolveSpine TIER_BASE {0:1.2,1:1.0,2:0.8,3:0.6,4:0.4} + max
      //   matchBonus 0.15 (+0.03 level bonus). A candidate is engine-visible
      //   ONLY if confidenceOf in [band.min, band.max]. Declared band =
      //   {min:0.7,max:1} (scientist-intent-vocabulary.yaml:844-846).
      //   => tier3 max 0.75 PASSes band but ANY tier-3 hit was already dropped
      //      by the engine's own localOnly gather; tier4 max 0.55+0.03=0.58 is
      //      BELOW band.min => a vendor hit is STRUCTURALLY UNBINDABLE through
      //      the engine even when online — the clamp that suppresses it is the
      //      confidenceOf band floor, not a filter stage.
      const clampArithmetic = {
        band_declared: band,
        confidenceOf: 'Math.min(Math.max(score,0),1) (resolutionEngine.ts:34-36)',
        per_tier_max_confidence_online: {
          tier0: Math.min(1.2 + 0.15 + 0.03, 1), tier1: Math.min(1.0 + 0.15 + 0.03, 1),
          tier2: Math.min(0.8 + 0.15 + 0.03, 1), tier3: Math.min(0.6 + 0.15 + 0.03, 1),
          tier4: Math.min(0.4 + 0.15 + 0.03, 1),
        },
        below_band_floor: [4], // tier 4 max 0.58 < 0.7 => vendor candidates never reach the engine's in-band set
        note: 'tiers 0-2 saturate to 1.0 AFTER clamp — the USER-visible candidate fact (candidateFact.confidence) is identical 1.0 for a tier-0 alias hit and a tier-1 substring hit: tier ranking is INVISIBLE in the clarification payload (the panel-relocates-the-questions failure surface).',
      };
      engineResults.push({
        arm: `${verb}.material`,
        declared_level: materialContract.level ?? null,
        wantLevel_fires: materialContract.level === undefined ? false : true,
        bindings: outcome.bindings,
        clarifications: outcome.clarifications,
        traces: outcome.traces,
        failures: outcome.failures,
        band,
        fate_classification: {
          returned_and_bound: outcome.bindings.map((b: { curie?: string }) => b.curie),
          returned_ranked_in_clarification: outcome.clarifications.flatMap((c: { candidates?: Array<{ label: string; ref?: string }> }) => (c.candidates ?? []).map((x) => x.label)),
          level_filtered: outcome.traces.filter((t: string) => t.startsWith('level-mismatch')).map((t: string) => t.replace(/^level-mismatch: /, '').split(' ')[0]),
          domain_filtered: outcome.traces.filter((t: string) => t.startsWith('domain-mismatch')).map((t: string) => t.replace(/^domain-mismatch: /, '').split(' ')[0]),
          clarification_reasons: outcome.clarifications.map((c: { reason: string }) => c.reason),
          remote_clamp: clampArithmetic,
        },
      });
    }

    // ---------------- H4 static typed panel: level x tier -------------------
    const panel: string[] = [];
    panel.push(`# panel ${turn.id} — noun “${noun}” (static capture format; MINT SUPPRESSED, no selection semantics)`);
    panel.push('');
    const levels = [...new Set(ranked.map((c: { level: string }) => c.level))].sort();
    for (const lvl of levels) {
      panel.push(`level: ${lvl}`);
      const byTier = new Map<number, Array<{ label: string; curie: string; score: number }>>();
      for (const c of ranked as Array<{ level: string; tier: number; label: string; curie: string; score: number; mint?: unknown }>) {
        if (c.level !== lvl) continue;
        if (c.tier === 5) continue; // MINT SUPPRESSED (spec H4)
        if (!byTier.has(c.tier)) byTier.set(c.tier, []);
        byTier.get(c.tier)!.push(c);
      }
      for (const t of [...byTier.keys()].sort()) {
        panel.push(`  tier ${t}:`);
        for (const c of byTier.get(t)!) panel.push(`    ${c.label}  [${c.curie}]  score=${c.score.toFixed(3)}`);
      }
      panel.push('');
    }
    writeFileSync(join(HARVEST, 'panels', `${turn.id}__${slug(noun)}.txt`), panel.join('\n') + '\n');

    writeFileSync(join(HARVEST, 'fates', `${turn.id}__${slug(noun)}.json`), JSON.stringify({
      turn: turn.id, utterance: turn.utterance, noun, source: turn.source,
      spine_ranked: ranked,
      stage_fate: fate,
      engine: engineResults,
      offline: { fetch_blocked: fetchCalls.length, fetch_blocked_note: 'global fetch stubbed to throw; any stray remote call recorded here', localOnly: true, oak: 'not built (no service URL)', vendor: 'not wired' },
    }, null, 2) + '\n');

    summary.push({ turn: turn.id, noun, spine_candidates: ranked.filter((c: { curie?: string }) => c.curie).length, suppressed: fate.filter((f) => f.fate.startsWith('suppressed')).length, arms: engineResults.map((e) => `${e.arm}:${JSON.stringify((e.fate_classification as { returned_and_bound: string[] }).returned_and_bound.length ? 'BOUND' : ((e.fate_classification as { clarification_reasons: string[] }).clarification_reasons[0] ?? 'none?'))}`) });
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

writeFileSync(join(HARVEST, 'fates', '_summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`replay complete: ${summary.length} noun replays; fetch blocked calls: ${fetchCalls.length}; store records: ${all.length}`);
