/**
 * MATRES-REPLAY VERDICT leg V2 — instrumented offline spine replay (harness
 * script; NOT product code, never imported by server).
 *
 * Extends the byte-pinned harvest harness (replay-harvest/scripts/
 * replay_spine.mts — reused, NOT mutated) in exactly three ways:
 *   1. cases = harvest fixtures/cases.json (read-only) + the H-A-authorized
 *      SYNTH turns from replay-verdict/synth/synth-cases.SYNTH.json;
 *   2. TWO engine arms per (noun, verb) (advc-cycle-1 D2: armA is named for
 *      what it actually is — the absence of eligibility data, NOT harvest
 *      parity. It reproduces the pinned harvest fates for 23/25 harvested
 *      nouns; the two T9 nouns are the declared db7de009 drift exception):
 *        armA "eligibility-absent" — deps.eligibility absent;
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

// ---- D12 (advc-cycle-1): scoring constants are READ FROM THE PRODUCT at ----
// run time and asserted; a future scoring change fails the harness loudly ----
// instead of silently leaving REMOTE-CLAMP arithmetic stale. ------------------
const spineSrc = readFileSync(join(ROOT, 'server/src/resolve/ResolveSpine.ts'), 'utf8');
const tierBaseM = spineSrc.match(/const TIER_BASE[^=]*=\s*\{([^}]*)\}/);
const exactBonusM = spineSrc.match(/if \(l === t\) return ([0-9.]+);/);
const levelBonusM = spineSrc.match(/level === wantLevel \? ([0-9.]+) :/);
if (!tierBaseM || !exactBonusM || !levelBonusM) {
  throw new Error('D12 tripwire: could not parse scoring constants from server/src/resolve/ResolveSpine.ts — the product changed shape; re-derive REMOTE-CLAMP arithmetic manually.');
}
const tierBase: Record<number, number> = {};
for (const pair of tierBaseM[1].split(',')) {
  const m = pair.match(/(\d)\s*:\s*([0-9.]+)/);
  if (m) tierBase[Number(m[1])] = Number(m[2]);
}
const exactBonus = Number(exactBonusM[1]);
const levelBonus = Number(levelBonusM[1]);
const EXPECTED_TIER_BASE = { 0: 1.2, 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.4, 5: 0.05 };
for (const [t, v] of Object.entries(EXPECTED_TIER_BASE)) {
  if (tierBase[Number(t)] !== v) {
    throw new Error(`D12 tripwire: ResolveSpine TIER_BASE[${t}] = ${tierBase[Number(t)]} but the verdict harness arithmetic assumed ${v}. Update this harness AND the REMOTE-CLAMP findings together — do not run on stale arithmetic.`);
  }
}
if (exactBonus !== 0.15 || levelBonus !== 0.03) {
  throw new Error(`D12 tripwire: ResolveSpine matchBonus(exact)=${exactBonus} / levelBonus=${levelBonus} differ from the assumed 0.15 / 0.03 — REMOTE-CLAMP arithmetic would be stale.`);
}
const tierMaxConfidence = (t: number) => Math.min(tierBase[t] + exactBonus + levelBonus, 1);
const clampArithmetic = {
  band_declared: band,
  confidenceOf: 'Math.min(Math.max(score,0),1) (resolutionEngine.ts)',
  constants_source: 'parsed live from server/src/resolve/ResolveSpine.ts at run time (D12 tripwire; run aborts on mismatch)',
  per_tier_max_confidence_online: {
    tier0: tierMaxConfidence(0), tier1: tierMaxConfidence(1),
    tier2: tierMaxConfidence(2), tier3: tierMaxConfidence(3),
    tier4: tierMaxConfidence(4),
  },
  // N1 (advc-cycle-2): `band` is the OBJECT {min,max} — comparing a number to it
  // is always false, which silently emptied this field in every fate. The floor
  // is band.min; tiers whose max confidence is below it are genuinely
  // unbindable-by-arithmetic (tier-4 0.58, tier-5 0.23 < 0.7).
  below_band_floor: Object.keys(tierBase).map(Number).filter((t) => tierMaxConfidence(t) < (band as { min: number }).min),
  // D9 correction: tier-2 max is 0.98, NOT 1.0 — only tiers 0-1 saturate to
  // 1.0 after the clamp. And the invisibility claim is scoped: the CLAMPED
  // CONFIDENCE hides tier rank, but armB clarification candidates DO carry
  // `tier` and `referentLevel` as data (fates show them); no attestation-
  // STRENGTH field exists, and rendering of referentLevel is not evidenced.
  note: 'REMOTE-CLAMP arithmetic (constants parsed from the product at run time — D12): tier-4 (vendor) max 0.58 < band.min 0.7 — a vendor hit is structurally unbindable through the engine even online; the structured field below_band_floor in THIS object lists exactly which tiers fall below the band floor (N1: compared against band.min, asserted at run time). After the clamp only tiers 0-1 saturate to 1.0 (tier-2 max is 0.98), so the CLAMPED CONFIDENCE value hides tier rank; armB clarification candidates still carry tier + referentLevel data — what is absent is an attestation-STRENGTH field, and rendering of tier/referentLevel is not evidenced.',
};
// N1 tripwire (advc-cycle-2, same class as D12): the emitted below_band_floor
// must equal the arithmetic's truth — tiers 4 and 5 (0.58 / 0.23 < band.min
// 0.7). If a future band/tier change alters this, the run aborts loudly instead
// of shipping a silently-empty machine-readable field that contradicts the
// report's central REMOTE-CLAMP finding.
{
  const expected = [4, 5];
  const got = clampArithmetic.below_band_floor;
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    throw new Error(`N1 tripwire: below_band_floor = [${got}] but the D12-parsed arithmetic expects [${expected}] (tier max vs band.min ${(band as { min: number }).min}). Fix the comparison OR update the REMOTE-CLAMP findings together — do not ship a field that contradicts the prose.`);
  }
}

// ---- DECLARED CAUSE CLASSES (advc-cycle-1 D4) -------------------------------
// Spec V2 declares four classes (LOCAL-SUPPRESSION / LEVEL-FILTERING / RANKING /
// REMOTE-CLAMP). Five noun-fates in this leg carry shapes that fit NONE of the
// four, so the old artifact output was `instrumented_cause: []` while the prose
// asserted causes. Per the review's fix direction the two missing classes are
// DECLARED HERE, once, as data with machine-checkable rules — not invented per
// case:
//   WRONG-BIND  (two declared rules, both data):
//               (a) a binding whose bound record's own label differs from the
//                   spoken noun (an identity-collapse blob wins the band: the
//                   record bound is NOT what the scientist said);
//               (b) a noun carrying a RATIO/COMPOSITION shape token that binds
//                   a SINGLE local material record — a composition can never BE
//                   one material; the blob record literally named after the
//                   whole ratio sentence is the wrong bind even when its label
//                   happens to equal the noun.
//   NO-GATE     an unknown-noun + mint offer on a noun carrying a declared
//               SHAPE TOKEN that no shipped declared gate (nounShape mintRefuse
//               patterns, catalogShape) matched. A noun with no shape token
//               stays clean-unknown (T1/T2) — no cause is ever invented.
const SHAPE_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: 'vendor-display-suffix', re: /\|\s*[A-Za-z]{2,6}\s*$/ },   // "… - HB-9999 | ATCC"
  { name: 'bottle-lot', re: /\b(bottle|fridge)\b|\blot\b/i },          // "the HepG2 bottle, lot LOT-…"
  { name: 'recipe-composition', re: /^\s*\d+(\.\d+)?\s*%.*\b(in|with)\b/i }, // "10% FBS in DMEM"
];
const COMPOSITION_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: 'ratio-fraction', re: /^\s*\d+\s*\/\s*\d+\b/ },              // "50/50 Trypsin-EDTA/DMEM…"
];

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

      const runArm = async (armName: 'armA eligibility-absent' | 'armB production (eligibility data loaded)') => {
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
        const eligibility = armName.startsWith('armB') ? loadMaterialEligibilityIfPresent() : null;
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

      const armA = await runArm('armA eligibility-absent');
      const armB = await runArm('armB production (eligibility data loaded)');

      // ---- instrumented-cause classification (advc-cycle-1 D3+D4) ----------
      // PER ARM, computed from THAT arm's own stage diff (clarification
      // candidates counted raw AND de-duplicated by label; the mint-offer card
      // is an affordance, never a candidate count). The old code built counts
      // from armB only and de-duped by label across the arm pair, which
      // mis-attributed classes and printed wrong candidate counts.
      const classifyArm = (
        arm: typeof armA,
        other: typeof armA,
      ): string[] => {
        const cls = arm.fate_classification as Record<string, unknown>;
        const oth = other.fate_classification as Record<string, unknown>;
        const causes: string[] = [];
        const levelF = (cls.level_filtered as string[]) ?? [];
        if (levelF.length > 0) causes.push(`LEVEL-FILTERING (${[...new Set(levelF)].join(', ')})`);
        // WRONG-BIND (declared class, D4): rule (a) bound record's own label !=
        // spoken noun; rule (b) composition-shaped noun bound as ONE material.
        let wrongBind = false;
        for (const b of arm.bindings as Array<{ curie?: string; label?: string; resolvedLabel?: string; level?: string }>) {
          if (b.resolvedLabel && b.label && b.resolvedLabel.trim().toLowerCase() !== b.label.trim().toLowerCase()) {
            causes.push(`WRONG-BIND (bound ${b.curie} level=${b.level ?? '?'} label "${b.resolvedLabel}" != spoken noun "${b.label}")`);
            wrongBind = true;
          }
        }
        if (!wrongBind && (arm.bindings as unknown[]).length > 0) {
          const comp = COMPOSITION_TOKENS.filter((s) => s.re.test(noun));
          if (comp.length > 0) {
            const b0 = (arm.bindings as Array<{ curie?: string; level?: string }>)[0];
            causes.push(`WRONG-BIND (composition shape ${comp.map((h) => h.name).join(', ')} in "${noun}" bound as ONE material record ${b0.curie} level=${b0.level ?? '?'} — a composition is never a single material)`);
          }
        }
        const boundSelf = (cls.returned_and_bound as string[]).length;
        const boundOther = (oth.returned_and_bound as string[]).length;
        const reasons = (cls.clarification_reasons as string[]) ?? [];
        if (cls.catalog_scope_gate_fired === true) causes.push('LOCAL-SUPPRESSION (AC-3 catalog-scope gate: shape matched, ALL gathering skipped, zero candidates carried)');
        else if (boundSelf === 0 && boundOther > 0) causes.push('LOCAL-SUPPRESSION (other arm bound; this arm clarified instead — bind verdict not PASS)');
        else if (boundSelf > 0 && boundOther === 0) causes.push('ELIG-UNSUPPRESSION (this arm bound where the other arm clarified — bind PASS on a level the other arm rejected)');
        // RANKING: this arm's OWN ambiguous-noun clarification, counted from
        // this arm's OWN candidates (raw count + de-dup-by-label count).
        for (const c of arm.clarifications as Array<{ reason: string; candidates?: Array<{ label: string; ref?: string }> }>) {
          if (c.reason === 'ambiguous-noun') {
            const cands = c.candidates ?? [];
            const labels = new Set(cands.map((x) => x.label));
            causes.push(`RANKING (ambiguous-noun; ${cands.length} candidates, ${labels.size} distinct labels)`);
          }
        }
        // NO-GATE (declared class, D4): unknown-noun + mint OFFER on a noun that
        // carries a declared SHAPE TOKEN and no shipped gate fired. Nouns without
        // a shape token stay clean-unknown (T1/T2) — no cause is invented.
        const mintOffered = (arm.clarifications as Array<{ reason: string; candidates?: Array<{ label: string }> }>)
          .some((c) => c.reason === 'unknown-noun' && (c.candidates ?? []).length > 0);
        if (reasons.includes('unknown-noun') && mintOffered && cls.catalog_scope_gate_fired !== true) {
          const hit = SHAPE_TOKENS.filter((s) => s.re.test(noun));
          if (hit.length > 0) causes.push(`NO-GATE (shape token(s) ${hit.map((h) => h.name).join(', ')} in "${noun}"; unknown-noun + mint offered, no shipped declared gate matched)`);
        }
        return causes;
      };
      (armA as Record<string, unknown>).instrumented_cause = classifyArm(armA, armB);
      (armB as Record<string, unknown>).instrumented_cause = classifyArm(armB, armA);

      const tieredRanked = ranked as Array<{ tier: number; level: string; curie?: string }>;
      const vprPresent = tieredRanked.some((c) => c.curie?.includes('VPR-'));
      if (vprPresent) engineResults.push({ arm: `${verb}.material`, remote_clamp_context: 'local VPR candidate present; any REAL remote vendor tier (4) could never bind (max 0.58 < 0.7) even online — arithmetic pinned in remote_clamp (constants parsed from product, D12)' });

      engineResults.push(armA, armB);
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
        // N6 (advc-cycle-2): prefix each line with the engine arm (armA/armB) —
        // without it both arms print the identical `${verb}.material` prefix and
        // per-arm causes are unattributable in the summary artifact.
        .map((e) => `${String((e as { engine_arm?: string }).engine_arm ?? '?').split(' ')[0]} ${(e as { arm: string }).arm} => ${((e as { instrumented_cause: string[] }).instrumented_cause).join(' | ') || 'clean'}`),
      bound_A: engineResults.flatMap((e) => Array.isArray((e as { fate_classification?: { returned_and_bound?: string[] } }).fate_classification?.returned_and_bound) && (e as { engine_arm?: string }).engine_arm?.startsWith('armA') ? (e as { fate_classification: { returned_and_bound: string[] } }).fate_classification.returned_and_bound : []),
      bound_B: engineResults.flatMap((e) => Array.isArray((e as { fate_classification?: { returned_and_bound?: string[] } }).fate_classification?.returned_and_bound) && (e as { engine_arm?: string }).engine_arm?.startsWith('armB') ? (e as { fate_classification: { returned_and_bound: string[] } }).fate_classification.returned_and_bound : []),
    });
  }
}

writeFileSync(join(VERDICT, 'fates', '_summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`verdict replay complete: ${summary.length} noun replays (SYNTH nouns: ${summary.filter((s) => s.SYNTH).length}); fetch blocked calls: ${fetchCalls.length}; store records: ${all.length}`);
