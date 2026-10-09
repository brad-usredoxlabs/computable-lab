/**
 * SPINE-6 replayKernel — the ONE assertion home for the scientist-intent
 * goldens (orch ruling OQ1(a)/OQ3(a)). Pure helpers: NO vitest imports (the
 * reproduction script `server/scripts/golden-replay.ts` reuses this from tsx).
 *
 * Harness discipline (spec §4.1, ruling D-EXTRA-1/2, amendment l2t0140):
 * the REAL `createIntentCompileFromPromptHandlers` runs in-process — real Ajv
 * parse, shipped vocabulary singleton, real pipeline YAML, real SPINE-3
 * engine, real store-backed spine via the handler's own
 * `createResolveSpineFromContext`. ONLY the model client and the store are
 * harness-controlled. Mocking parse/normalize/compiler/vocabulary/pipeline/
 * resolution is FORBIDDEN anywhere in goldens/ (spec §11.1).
 * The stubLlm tool-routing idiom is COPIED from the route test (SPINE-5's
 * turf — copy, never edit, spec §11.8).
 *
 * Normalization (spec §4.4, deny-by-default): the ONLY things dropped are
 * incidental ids/timestamps per the task text:
 *   - top-level `durationMs` (pass telemetry),
 *   - any ISO-8601 string under a `*At`/`*Timestamp` key,
 *   - `eventId` values matching the shipped random shape
 *     `evt-<verb>-<8 base36 chars>` — BiologyVerbExpander.ts:74 mints them
 *     with Math.random(), so they are incidental ids in exactly the sense the
 *     task text permits ("only incidental ids/timestamps normalized"). They
 *     carry no identity, provenance, volume, or address content; every
 *     load-bearing sibling (labwareId, labwareHint, volumes, wells, deck
 *     slots, pinned-lookup recordIds) stays asserted. The mutation leg
 *     (spec §4.4) is the vacuity guard against this being too wide.
 *   - SPINE-1 key-absence-vs-undefined cleanup: JSON round-trip drops
 *     undefined-valued keys; absence is asserted via Object.keys in tests
 *     (exactOptionalPropertyTypes convention, never toEqual-with-undefined).
 *
 * The clarification-is-not-success classifier (§5(e), bait §11.11) lives HERE
 * so the replay tests and the live smoke cannot disagree.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createIntentCompileFromPromptHandlers } from '../../../api/handlers/IntentCompileFromPromptHandlers.js';
import { createLabwareLookup } from '../../../ai/compiler/labwareLookup.js';
import { loadScientistIntentVocabulary } from '../vocabulary.js';

// ---------------------------------------------------------------------------
// Store harness: read-only fixture labware table + write spies that THROW
// (zero-write proof: a call is a crash, not a silent pass).
// ---------------------------------------------------------------------------

export interface FixtureRecord {
  recordId: string;
  payload: Record<string, unknown>;
}

export interface RecordingStore {
  store: unknown;
  /** create/update/delete/history attempts — the spies THROW, so a non-zero
   *  count is impossible without the run crashing; the counter is the explicit
   *  zero-write assertion (§5(d)). */
  writeCalls(): number;
  labwareListCalls(): number;
  materialListCalls(): number;
  /**
   * The route builds ONE shared `searchLabwareByHint = createLabwareLookup(store)`
   * (handler :145, no deps seam — ruling D-EXTRA-1), and each lookup issues
   * exactly one `store.list({kind:'labware'})`. Each spine.resolve issues one
   * labware-kind + one material-kind list among its DEFAULT_KINDS, and
   * loadLabInventory issues one of each — so
   *   labwareListCalls − materialListCalls
   * isolates searchLabwareByHint calls (amendment fixture-1 clause 5).
   */
  searchLabwareByHintCalls(): number;
}

export function recordingStore(
  records: readonly FixtureRecord[],
  opts: { throwOnKind?: readonly string[] } = {},
): RecordingStore {
  const calls: string[] = [];
  let writes = 0;
  const store = {
    get: async () => null,
    getRecord: async () => null,
    list: async (filter?: { kind?: string; schemaId?: string }) => {
      if (filter?.kind) {
        calls.push(filter.kind);
        if (opts.throwOnKind?.includes(filter.kind)) {
          throw new Error(`golden store injection: ${filter.kind} index unavailable`);
        }
        return records
          .filter((r) => r.payload['kind'] === filter.kind)
          .map((r) => ({
            recordId: r.recordId,
            schemaId: `x/${filter.kind}.schema.yaml`,
            payload: r.payload,
          }));
      }
      return [];
    },
    create: async () => { writes += 1; throw new Error('golden store must never write'); },
    update: async () => { writes += 1; throw new Error('golden store must never write'); },
    delete: async () => { writes += 1; throw new Error('golden store must never write'); },
    history: async () => { writes += 1; throw new Error('golden store must never read history'); },
  };
  const count = (kind: string) => calls.filter((c) => c === kind).length;
  return {
    store,
    writeCalls: () => writes,
    labwareListCalls: () => count('labware'),
    materialListCalls: () => count('material'),
    searchLabwareByHintCalls: () => count('labware') - count('material'),
  };
}

// ---------------------------------------------------------------------------
// Model harness: pinned adapter replaying the fixture's canned
// emit_scientist_intent tool-call verbatim (stubLlm idiom copied from
// IntentCompileFromPromptHandlers.test.ts:122-166).
// ---------------------------------------------------------------------------

export function stubLlm(modelOutput: Record<string, unknown>) {
  return {
    complete: async (req: { tools?: Array<{ function?: { name?: string } }> }) => {
      const tools = Array.isArray(req?.tools) ? req.tools : [];
      const toolName = tools[0]?.function?.name;
      if (toolName === 'emit_branch_questions') {
        return {
          choices: [{
            message: {
              content: null,
              tool_calls: [{ function: { name: 'emit_branch_questions', arguments: JSON.stringify({ axes: [] }) } }],
            },
          }],
        };
      }
      return {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: { name: 'emit_scientist_intent', arguments: JSON.stringify(modelOutput) },
            }],
          },
        }],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Request/reply harness (copied idiom from the route test :97-115).
// ---------------------------------------------------------------------------

export interface ReplyCall { status: number | undefined; payload: unknown }

function mockRequest(body: unknown) {
  return { body, log: { error: () => {} } };
}

function mockReply() {
  const calls: ReplyCall[] = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) { currentStatus = code; return r; },
    send(payload: unknown) { calls.push({ status: currentStatus, payload }); return r; },
  };
  return { r, calls };
}

// ---------------------------------------------------------------------------
// The golden run: fixture -> real handler -> response + spy report.
// ---------------------------------------------------------------------------

export interface GoldenFixture {
  name: string;
  request: { protocolText: string; answers: Record<string, string> };
  store: { records: FixtureRecord[]; throwOnKind?: string[] };
  modelOutput: Record<string, unknown>;
}

export interface GoldenRun {
  status: number;
  payload: Record<string, unknown>;
  normalized: Record<string, unknown>;
  spies: {
    labwareListCalls: number;
    materialListCalls: number;
    searchLabwareByHintCalls: number;
    writeCalls: number;
  };
}

export function loadFixture(path: string): GoldenFixture {
  const doc = parseYaml(readFileSync(resolve(path), 'utf-8')) as GoldenFixture;
  if (!doc?.name || !doc?.request || !doc?.store || !doc?.modelOutput) {
    throw new Error(`golden fixture ${path}: missing name/request/store/modelOutput`);
  }
  return doc;
}

export async function runGolden(fixture: GoldenFixture): Promise<GoldenRun> {
  const recorder = recordingStore(fixture.store.records, {
    ...(fixture.store.throwOnKind ? { throwOnKind: fixture.store.throwOnKind } : {}),
  });
  const ctx = {
    store: recorder.store,
    appConfig: { ai: { inference: { baseUrl: 'http://golden.invalid:1/v1', model: 'golden-stub' } } },
  };
  const handlers = createIntentCompileFromPromptHandlers(
    ctx as never,
    { llmClient: stubLlm(fixture.modelOutput) as never },
  );
  const reply = mockReply();
  await handlers.compileFromPrompt(
    mockRequest({ protocolText: fixture.request.protocolText, answers: fixture.request.answers }) as never,
    reply.r as never,
  );
  if (reply.calls.length !== 1) {
    throw new Error(`golden ${fixture.name}: expected exactly one reply, got ${reply.calls.length}`);
  }
  const call = reply.calls[0]!;
  const payload = (call.payload ?? {}) as Record<string, unknown>;
  return {
    status: call.status ?? 200,
    payload,
    normalized: normalizeReplay(payload) as Record<string, unknown>,
    spies: {
      labwareListCalls: recorder.labwareListCalls(),
      materialListCalls: recorder.materialListCalls(),
      searchLabwareByHintCalls: recorder.searchLabwareByHintCalls(),
      writeCalls: recorder.writeCalls(),
    },
  };
}

/**
 * N(hintEligible labeled args): counted from the SHIPPED vocabulary's declared
 * arg contracts (data, not a verb table) against the fixture's canned actions.
 * Amendment fixture-1 clause 5: labwareListCalls − materialListCalls − N == 0
 * proves every bound label took the authoritative arm with no second
 * searchLabwareByHint lookup.
 */
export function countHintEligibleLabeledArgs(modelOutput: Record<string, unknown>): number {
  const vocabulary = loadScientistIntentVocabulary();
  const actions = Array.isArray(modelOutput['actions']) ? modelOutput['actions'] as Array<Record<string, unknown>> : [];
  let n = 0;
  for (const action of actions) {
    const verb = typeof action['action'] === 'string' ? action['action'] : '';
    for (const contract of vocabulary.argContracts(verb)) {
      if (contract.hintEligible === true && typeof action[contract.name] === 'string') n += 1;
    }
  }
  return n;
}

/** The route's own lookup against the fixture store (fixture-1 setup
 *  invariant: title+synonyms-only seeds make createLabwareLookup return [] —
 *  proof the engine binding came from the spine arm, not the hint search). */
export async function lookupAgainstFixtureStore(fixture: GoldenFixture, label: string): Promise<unknown[]> {
  const recorder = recordingStore(fixture.store.records);
  return [...await createLabwareLookup(recorder.store as never)(label)];
}

// ---------------------------------------------------------------------------
// normalizeReplay — the ONE pure normalizer (spec §4.4).
// ---------------------------------------------------------------------------

/** Shipped random-eventId shape: `evt-${verb}-${Math.random().toString(36).slice(2,10)}`
 *  (BiologyVerbExpander.ts:74). 8 base36 chars, verb segment lowercase.
 *  SPINE-7 extension: the resolve_roles expansion regenerates ids as
 *  `${eventId}_r${counter}` (ChatbotCompilePasses.ts resolve_roles: "new
 *  events get regenerated IDs") — the `_rN` suffix is a deterministic counter
 *  carrying no identity/provenance, so the incidental-id drop extends to it.
 *  Event COUNT and every well/address value remain asserted in the tests. */
const INCIDENTAL_EVENT_ID = /^evt-[a-z0-9_]+-[a-z0-9]{8}(_r\d+)?$/;

function isTimestampKey(key: string): boolean {
  return key.endsWith('At') || key.endsWith('Timestamp');
}

function isIso8601(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(value);
}

export function normalizeReplay(obj: unknown, topLevel = true): unknown {
  if (Array.isArray(obj)) return obj.map((item) => normalizeReplay(item, false));
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (topLevel && key === 'durationMs') continue;
      if (key === 'eventId' && typeof value === 'string' && INCIDENTAL_EVENT_ID.test(value)) continue;
      if (isTimestampKey(key) && isIso8601(value)) continue;
      out[key] = normalizeReplay(value, false);
    }
    return out;
  }
  return obj;
}

/** Key-order-stable stringify for deep-equal against the golden records. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// MANIFEST — checked-in pin of fixture/spec/rule versions + reproduction
// (spec §4.3). The golden tests load fixtures/records THROUGH the manifest and
// re-hash every pinned file: rule drift fails LOUD (bait §11.5/§11.9).
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOLDENS_DIR = dirname(fileURLToPath(import.meta.url));
/** goldens/ -> scientistIntent -> compiler -> src -> server -> repo root */
export const REPO_ROOT = resolve(GOLDENS_DIR, '../../../../..');

export interface ManifestEntry {
  name: string;
  path: string;
  sha256: string;
}

export interface GoldenManifest {
  suite: string;
  baseCommit: string;
  treeState: Array<{ path: string; sha256: string }>;
  fixtures: ManifestEntry[];
  records: ManifestEntry[];
  outcomeUnionMember: string;
  routeContract: string;
  reproduce: Array<{ cmd: string; expect: string }>;
  liveSmoke: { cmd: string; gating: string };
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

export function loadManifest(): GoldenManifest {
  const doc = parseYaml(readFileSync(join(GOLDENS_DIR, 'MANIFEST.yaml'), 'utf-8')) as GoldenManifest;
  if (!doc?.suite || !Array.isArray(doc.fixtures) || !Array.isArray(doc.records) || !Array.isArray(doc.treeState)) {
    throw new Error('MANIFEST.yaml malformed: suite/treeState/fixtures/records required');
  }
  return doc;
}

/** Manifest entry for a golden name (fixtures and records share names). */
export function manifestEntry(entries: ManifestEntry[], name: string): ManifestEntry {
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new Error(`MANIFEST.yaml has no entry for golden '${name}'`);
  return entry;
}

/** Fixture path relative to goldens/ (manifest convention). */
export function manifestFixturePath(entry: ManifestEntry): string {
  return join(GOLDENS_DIR, entry.path);
}

/** treeState paths are repo-root relative (schema/** rule files). */
export function manifestTreePath(entry: { path: string }): string {
  return join(REPO_ROOT, entry.path);
}

/** Verify every pinned hash; returns mismatch descriptions (empty = current). */
export function manifestHashMismatches(manifest: GoldenManifest): string[] {
  const mismatches: string[] = [];
  for (const entry of manifest.treeState) {
    const actual = sha256File(manifestTreePath(entry));
    if (actual !== entry.sha256) mismatches.push(`treeState ${entry.path}: manifest ${entry.sha256} actual ${actual}`);
  }
  for (const entry of [...manifest.fixtures, ...manifest.records]) {
    const actual = sha256File(join(GOLDENS_DIR, entry.path));
    if (actual !== entry.sha256) mismatches.push(`${entry.path}: manifest ${entry.sha256} actual ${actual}`);
  }
  return mismatches;
}

export function fixtureFromManifest(manifest: GoldenManifest, name: string): GoldenFixture {
  const entry = manifestEntry(manifest.fixtures, name);
  const actual = sha256File(manifestFixturePath(entry));
  if (actual !== entry.sha256) {
    throw new Error(`fixture ${name} drifted from its blessed manifest hash (${actual} !== ${entry.sha256})`);
  }
  return loadFixture(manifestFixturePath(entry));
}

export function recordFromManifest(manifest: GoldenManifest, name: string): GoldenRecord {
  const entry = manifestEntry(manifest.records, name);
  const path = join(GOLDENS_DIR, entry.path);
  const actual = sha256File(path);
  if (actual !== entry.sha256) {
    throw new Error(`golden record ${entry.path} tampered (${actual} !== ${entry.sha256})`);
  }
  return loadGoldenRecord(path);
}

// ---------------------------------------------------------------------------
// Golden records: { status, body } where body is the POST-normalization replay.
// ---------------------------------------------------------------------------

export interface GoldenRecord {
  status: number;
  body: Record<string, unknown>;
}

export function loadGoldenRecord(path: string): GoldenRecord {
  return JSON.parse(readFileSync(resolve(path), 'utf-8')) as GoldenRecord;
}

export function deepEqualGolden(run: GoldenRun, record: GoldenRecord): { ok: boolean; diff?: string } {
  if (run.status !== record.status) {
    return { ok: false, diff: `status ${run.status} !== blessed ${record.status}` };
  }
  const a = stableStringify(run.normalized);
  const b = stableStringify(record.body);
  if (a === b) return { ok: true };
  return { ok: false, diff: firstDiff(a, b) };
}

function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const at = Math.max(0, i - 60);
  return `blessed vs replay diverge at char ${i}:\n  blessed: …${b.slice(at, i + 120)}\n  replay:  …${a.slice(at, i + 120)}`;
}

// ---------------------------------------------------------------------------
// The shared clarification-is-not-success classifier (§5(e), §6.4, bait §11.11).
// Replay tests AND the live smoke consume this one function.
// ---------------------------------------------------------------------------

export type OutcomeVerdict =
  | 'SUCCESS'
  | 'NOT_SUCCESS_CLARIFICATION'
  | 'EXTRACTION_FAILURE'
  | 'INFRA_FAULT';

export function classifyCompileResponse(status: number, payload: Record<string, unknown>): OutcomeVerdict {
  const outcome = payload['outcome'];
  const error = payload['error'];
  if (error === 'MALFORMED_MODEL_OUTPUT') return 'EXTRACTION_FAILURE';
  if (outcome === 'needs-clarification' || error === 'NEEDS_CLARIFICATION') return 'NOT_SUCCESS_CLARIFICATION';
  if (status === 200 && (outcome === 'complete' || outcome === 'gap')) return 'SUCCESS';
  if (status >= 500) return 'INFRA_FAULT';
  return 'INFRA_FAULT';
}

/** §5(e): the clarification bar is provably NOT success — one assertion home. */
export function assertClarificationIsNotSuccess(verdict: OutcomeVerdict): void {
  if (verdict !== 'NOT_SUCCESS_CLARIFICATION') {
    throw new Error(`clarification bar must classify as NOT_SUCCESS_CLARIFICATION, got ${verdict}`);
  }
}
