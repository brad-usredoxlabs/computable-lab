/**
 * MATRES-REPLAY VERDICT leg V2 — instrumented offline spine replay (harness
 * script; NOT product code, never imported by server).
 *
 * Extends the byte-pinned harvest harness (replay-harvest/scripts/
 * replay_spine.mts — reused, NOT mutated) in exactly three ways:
 *   1. cases = harvest fixtures/cases.json (read-only) + the H-A-authorized
 *      SYNTH turns from replay-verdict/synth/synth-cases.SYNTH.json;
 *   2. TWO engine arms per (noun, verb):
 *        armA "pre-ELIG"  — harvest-parity (deps.eligibility absent), so the
 *             fate is directly comparable with the pinned harvest fates;
 *        armB "production" — the shipped resolve_nouns behavior: the
 *             material-eligibility triplet loaded PER call exactly like
 *             resolveNounsPass.ts does (loadMaterialEligibilityIfPresent).
 *             This is where the AC-3 catalog-scope gate, the three-way
 *             display/suppress/bind verdicts, and the custody guard live.
 *   3. an instrumented-cause classification per noun, computed from the stage
 *      diff raw-hits -> spine-ranked -> engine in-band -> bound/clarified:
 *        LEVEL-FILTERING   a candidate carried a level-mismatch trace
 *        LOCAL-SUPPRESSION an in-band local candidate that the PRODUCTION arm
 *                          dropped (suppress verdict / catalog-scope gate /
 *                          bind-not-PASS) while the pre-ELIG arm kept it
 *        RANKING           >=2 band-passing candidates -> ambiguous-noun flood
 *                          (incl. near-duplicate MSP-DRAFT identity floods)
 *        REMOTE-CLAMP      tier-3/4 arithmetic (unchanged from the harvest
 *                          harness: tier4 max 0.58 < band floor 0.7)
 *
 * Network DISABLED identically to the harvest harness (fetch throws, OAK env
 * deleted, localOnly, no vendor provider, engine spine adapter localOnly).
 * Any fetch attempt is recorded in the fate and invalidates it as evidence.
 *
 * Writes ONLY under .hermes/plans/replay-verdict/fates/.
 * Usage (cwd = worktree root): see run-verdict.sh
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---- offline enforcement BEFORE any module import (harvest parity) ---------
const fetchCalls: Array<{ url: string }> = [];
(globalThis as { fetch: unknown }).fetch = async (input: unknown) => {
  const url = typeof input === 'string' ? input : String((input as { url?: unknown })?.url ?? input);
  fetchCalls.push({ url });
  throw new Error(`MATRES-REPLAY offline harness: network disabled (blocked ${url})`);
};
delete process.env.CLA_ONTOLOGY_SERVICE_URL;

type Envelope = { recordId: string; schemaId: string; payload: Record<string, unknown> };

const HARVEST = join('.hermes', 'plans', 'replay-harvest'); // READ-ONLY
const VERDICT = join('.hermes', 'plans', 'replay-verdict');
const ROOT = process.cwd();
const RECORDS = join(HARVEST, 'records');

// ---- read-only RecordStore over the harvested YAML copies (harvest parity) -
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
    } catch { /* skip corrupt copy, same as the harvest harness */ }
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
} as never;

// ---- product modules under test (REAL, unmodified) -------------------------
const { createResolveSpine } = await import(join(ROOT, 'server/src/resolve/ResolveSpine.ts'));
const { createTermProvider } = await import(join(ROOT, 'server/src/resolve/providers/terms.ts'));
const { createRecordProvider } = await import(join(ROOT, 'server/src/resolve/providers/records.ts'));
const { createSpineAdapter } = await import(join(ROOT, 'server/src/compiler/resolution/adapters.ts'));
const { buildStrategyRegistry } = await import(join(ROOT, 'server/src/compiler/resolution/strategies.ts'));
const { resolveScientistIntentNouns } = await import(join(ROOT, 'server/src/compiler/resolution/resolutionEngine.ts'));
const { loadScientistIntentVocabulary } = await import(join(ROOT, 'server/src/compiler/scientistIntent/vocabulary.ts'));
const { loadMaterialEligibilityIfPresent } = await import(join(ROOT, 'server/src/compiler/resolution/eligibility/policy.ts'));

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

// ---- cases: harvest fixtures (read-only) + SYNTH turns (H-A) ---------------
const harvested = JSON.parse(readFileSync(join(HARVEST, 'fixtures/cases.json'), 'utf8')) as {
  turns: Array<{ id: string; utterance: string; nouns: string[]; engine_arms: string[]; source: string }>;
};
const synth = JSON.parse(readFileSync(join(VERDICT, 'synth', 'synth-cases.SYNTH.json'), 'utf8')) as {
  turns: Array<{ id: string; SYNTH: boolean; utterance: string; nouns: string[]; engine_arms: string[]; case: string; source?: string }>;
};
const turns = [
  ...harvested.turns.filter((t) => (t.nouns?.length ?? 0) > 0),
  ...synth.turns.map((t) => ({ ...t, source: `SYNTH (${t.case}) — synthetic utterance, real-store basis; H-A=YES` })),
];

mkdirSync(join(VERDICT, 'fates'), { recursive: true });

const summary: Array<Record<string, unknown>> = [];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

const band = vocab.policies().ambiguity.confidenceAccept;
const clampArithmetic = {
  band_declared: band,
  confidenceOf: 'Math.min(Math.max(score,0),1) (resolutionEngine.ts)',
  per_tier_max_confidence_online: {
    tier0: Math.min(1.2 + 0.15 + 0.03, 1), tier1: Math.min(1.0 + 0.15 + 0.03, 1),
    tier2: Math.min(0.8 + 0.15 + 0.03, 1), tier3: Math.min(0.6 + 0.15 + 0.03, 1),
    tier4: Math.min(0.4 + 0.15 + 0.03, 1),
  },
  below_band_floor: [4],
  note: 'harvest-parity REMOTE-CLAMP arithmetic: tier-4 (vendor) max 0.58 < band.min 0.7 — a vendor hit is structurally unbindable through the engine even online; tiers 0-2 saturate to 1.0 after the clamp, so tier rank is INVISIBLE in the clarification payload.',
};

for (const turn of turns) {
  const isSynth = (turn as { SYNTH?: boolean }).SYNTH === true;
  for (const noun of turn.nouns) {
    // ---------------- direct spine probe (localOnly, harvest parity) --------
    const raw: RawCapture = [];
    const spine = createResolveSpine({
      termProvider: capture(createTermProvider(store as never), 'tier0-canonical-term', raw),
      recordProvider: capture(createRecordProvider(store as never), 'tier1-local-record', raw),
    });
    const ranked = await spine.resolve(noun, { localOnly: true });

    const rankedByCurie = new Map(ranked.filter((c: { curie?: string }) => c.curie).map((c: { curie: string }) => [c.curie, c]));
    const stageFate = raw.map((h) => {
      const kept = rankedByCurie.get(h.curie);
      if (kept) return { ...h, fate: 'returned-and-ranked', score: (kept as { score: number }).score };
      const dup = raw.filter((r) => r.curie === h.curie).length > 1;
      return { ...h, fate: dup ? 'suppressed-at-stage:spine-curie-dedupe' : 'suppressed-at-stage:spine-lexical-filter (hasLexicalSupport)' };
    });

    // ---------------- engine replay per arm x {pre-ELIG, production} --------
    const engineResults: Array<Record<string, unknown>> = [];
    for (const verb of turn.engine_arms) {
      const contracts = vocab.argContracts(verb) as Array<{ name: string; level?: string; kind: string; levels?: string[] }>;
      const materialContract = contracts.find((c) => c.name === 'material');
      if (!materialContract) continue;
      const intent = {
        kind: 'scientist-intent', version: '0.1.0', intentId: `verdict-${turn.id}-${verb}`,
        sourcePrompt: turn.utterance,
        actions: [{ action: verb as never, material: noun }],
        unresolved: [],
      };
      const levelFor = (v: string, arg: string) =>
        (vocab.argContracts(v) as Array<{ name: string; level?: string }>).find((a) => a.name === arg)?.level;
      const termsForSuggestions = async () =>
        (all.filter((e) => e.schemaId.includes('/term.schema.yaml'))
          .map((e) => ({ preferredLabel: String(e.payload.preferredLabel ?? e.payload.name ?? ''), aliases: Array.isArray(e.payload.aliases) ? (e.payload.aliases as string[]) : [] })));

      const runArm = async (armName: 'pre-ELIG (harvest parity)' | 'production (eligibility data loaded)') => {
        const tracker = { failed: false, message: undefined as string | undefined };
        const spineAdapter = createSpineAdapter(spine, tracker);
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
        const eligibility = armName.startsWith('production') ? loadMaterialEligibilityIfPresent() : null;
        const engineDeps = {
          adapters: [spineAdapter, labwareHintAdapter],
          strategies: buildStrategyRegistry(),
          levelFor: levelFor as never,
          ...(eligibility !== null ? { eligibility } : {}),
          termsForSuggestions: termsForSuggestions as never,
        };
        const outcome = await resolveScientistIntentNouns(intent as never, vocab, engineDeps as never);
        return {
          arm: `${verb}.material`,
          engine_arm: armName,
          eligibility_loaded: eligibility !== null,
          declared_level: materialContract.level ?? null,
          declared_levels_allowed_set: materialContract.levels ?? null,
          wantLevel_fires: materialContract.level !== undefined,
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
            catalog_scope_gate_fired: outcome.traces.some((t: string) => t.startsWith('catalog-scope-gate')),
            clarification_reasons: outcome.clarifications.map((c: { reason: string }) => c.reason),
            remote_clamp: clampArithmetic,
          },
        };
      };

      const armA = await runArm('pre-ELIG (harvest parity)');
      const armB = await runArm('production (eligibility data loaded)');

      // ---------- instrumented-cause classification (per arm pair) ----------
      const causes: string[] = [];
      const clsA = armA.fate_classification as Record<string, unknown>;
      const clsB = armB.fate_classification as Record<string, unknown>;
      const levelF = (clsA.level_filtered as string[]) ?? [];
      const levelFb = (clsB.level_filtered as string[]) ?? [];
      if (levelF.length > 0 || levelFb.length > 0) causes.push(`LEVEL-FILTERING (${[...new Set([...levelF, ...levelFb])].join(', ')})`);
      const boundA = (clsA.returned_and_bound as string[]).length;
      const boundB = (clsB.returned_and_bound as string[]).length;
      if (clsB.catalog_scope_gate_fired === true) causes.push('LOCAL-SUPPRESSION (AC-3 catalog-scope gate: shape matched, ALL gathering skipped, zero candidates carried)');
      else if (boundA > 0 && boundB === 0) causes.push('LOCAL-SUPPRESSION (production bind verdict not PASS — pre-ELIG bound, production clarified)');
      else if (boundA === 0 && boundB > 0) causes.push('ELIG-UNSUPPRESSION (production bound where pre-ELIG clarified — bind PASS on a level the older arm rejected)');
      const clarA = (clsA.clarification_reasons as string[]) ?? [];
      const clarB = (clsB.clarification_reasons as string[]) ?? [];
      if (clarA.includes('ambiguous-noun') || clarB.includes('ambiguous-noun')) {
        const cands = new Set((clsB.returned_ranked_in_clarification as string[]) ?? []);
        causes.push(`RANKING (ambiguous-noun; ${cands.size} clarification candidates)`);
      }
      const tieredRanked = ranked as Array<{ tier: number; level: string; curie?: string }>;
      const vprPresent = tieredRanked.some((c) => c.curie?.includes('VPR-'));
      if (vprPresent) causes.push('REMOTE-CLAMP context: local VPR candidate present; any REAL remote vendor tier (4) could never bind (max 0.58 < 0.7) even online — arithmetic pinned in remote_clamp');

      engineResults.push(armA, armB, { arm: `${verb}.material`, instrumented_cause: causes });
    }

    // ---------------- fate JSON (verdict leg — fates only, no panels) -------
    writeFileSync(join(VERDICT, 'fates', `${turn.id}__${slug(noun)}.json`), JSON.stringify({
      turn: turn.id, utterance: turn.utterance, noun, source: turn.source,
      ...(isSynth ? { SYNTH: true } : {}),
      spine_ranked: ranked,
      stage_fate: stageFate,
      engine: engineResults,
      offline: { fetch_blocked: fetchCalls.length, fetch_blocked_note: 'global fetch stubbed to throw; any stray remote call recorded here', localOnly: true, oak: 'not built (no service URL)', vendor: 'not wired' },
    }, null, 2) + '\n');

    summary.push({
      turn: turn.id, SYNTH: isSynth, noun,
      spine_candidates: ranked.filter((c: { curie?: string }) => c.curie).length,
      suppressed: stageFate.filter((f) => String(f.fate).startsWith('suppressed')).length,
      arms: engineResults.filter((e) => (e as { instrumented_cause?: string[] }).instrumented_cause)
        .map((e) => `${(e as { arm: string }).arm} => ${((e as { instrumented_cause: string[] }).instrumented_cause).join(' | ') || 'clean'}`),
      bound_A: engineResults.flatMap((e) => Array.isArray((e as { fate_classification?: { returned_and_bound?: string[] } }).fate_classification?.returned_and_bound) && (e as { engine_arm?: string }).engine_arm?.startsWith('pre') ? (e as { fate_classification: { returned_and_bound: string[] } }).fate_classification.returned_and_bound : []),
      bound_B: engineResults.flatMap((e) => Array.isArray((e as { fate_classification?: { returned_and_bound?: string[] } }).fate_classification?.returned_and_bound) && (e as { engine_arm?: string }).engine_arm?.startsWith('production') ? (e as { fate_classification: { returned_and_bound: string[] } }).fate_classification.returned_and_bound : []),
    });
  }
}

writeFileSync(join(VERDICT, 'fates', '_summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`verdict replay complete: ${summary.length} noun replays (SYNTH nouns: ${summary.filter((s) => s.SYNTH).length}); fetch blocked calls: ${fetchCalls.length}; store records: ${all.length}`);
