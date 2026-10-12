/**
 * W2-4-PROVENANCE-LADDER — T3: "locally-validated" COMPUTED, never attested
 * (spec §3 T3, acceptance clause 3).
 *
 * Harness: COPY of GraphQueryEngine.test.ts:23-70 — GraphEdgeIndex.inMemory()
 * + index.build({records, refs, relationshipEdges, eventGraphProjections}) +
 * new GraphQueryEngine({index, store}). The engine and index classes are
 * IMPORTED UNTOUCHED (zero production TS in this item — the composition lives
 * in THIS test file only; the reusable SERVICE home is the OQ2 call, W2-5/W2-7).
 *
 * Clause honesty (spec §8.11): the three query clauses are READ FROM THE YAML
 * (schema/registry/provenance-ladder/rung-vocabulary.yaml derived_queries[0]
 * .query_clauses AS DATA — the test parses the file, snapshot-compares the
 * parsed clause shapes, and builds the GraphQuery ops FROM the parsed clause
 * fields). The engine's dotted-field expansion (GraphQueryEngine.readField:
 * "field '<neighborType>.<prop>' follows refers_to edges to a neighbor of
 * <neighborType> and reads <prop>") is what the vocabulary's `resolves_via`
 * declaration describes; the test names the mapping.
 *
 * The acceptance clause: locally-validated(P) is TRUE only when a
 * realization + completed run + active evidence chain EXISTS, and FALSE when
 * ANY link is removed — three separate mutation arms, each recomputed
 * (non-vacuity is the shape of the clause). No query path mints VENDOR: every
 * op here is find/traverse/exists — read-only by the engine's own contract
 * ("No query in this schema mutates laboratory state").
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { GraphEdgeIndex } from './GraphEdgeIndex.js';
import { GraphQueryEngine, type GraphQueryEngineDeps } from './GraphQueryEngine.js';
import type { GraphQuery } from './types.js';

// ---------------------------------------------------------------------------
// Fixture graph: protocol P + LPR (inherits_from P) + completed run (of the
// LPR) + event-graph (the run's executed surface) + ACTIVE evidence (sources
// -> the event-graph) + an assertion the evidence supports.
// ---------------------------------------------------------------------------

const P = 'PRT-w24-family';
const LPR = 'LPR-w24-realization';
const RUN = 'RUN-w24-completed';
const EVG = 'EVG-w24-executed';
const EVD = 'EVD-w24-support';
const AST = 'AST-w24-conclusion';

interface RecordEnvelope {
  recordId: string;
  schemaId: string;
  payload: Record<string, unknown>;
}

interface Fixture {
  engine: GraphQueryEngine;
  rebuild: (opts?: { dropLpr?: boolean; runStatus?: string; dropEvidence?: boolean; evidenceStatus?: string }) => GraphQueryEngine;
}

function envelopes(): Record<string, RecordEnvelope> {
  return {
    [P]: { recordId: P, schemaId: 'protocol', payload: { kind: 'protocol', recordId: P, title: 'W24 family protocol' } },
    [LPR]: { recordId: LPR, schemaId: 'local-protocol', payload: { kind: 'local-protocol', recordId: LPR, title: 'W24 realization', inherits_from: { kind: 'record', id: P, type: 'protocol' } } },
    [RUN]: { recordId: RUN, schemaId: 'run', payload: { kind: 'run', recordId: RUN, status: 'completed', localProtocolRef: { kind: 'record', id: LPR, type: 'local-protocol' }, executedEventGraphId: EVG } },
    [EVG]: { recordId: EVG, schemaId: 'event-graph', payload: { kind: 'event-graph', recordId: EVG, runId: RUN } },
    [EVD]: { recordId: EVD, schemaId: 'evidence', payload: { kind: 'evidence', recordId: EVD, status: 'active', supports: [{ kind: 'record', id: AST, type: 'assertion' }], sources: [{ type: 'event_graph', ref: { kind: 'record', id: EVG, type: 'event-graph' } }] } },
    [AST]: { recordId: AST, schemaId: 'assertion', payload: { kind: 'assertion', recordId: AST, evidence_refs: [{ kind: 'record', id: EVD, type: 'evidence' }] } },
  };
}

function buildIndex(stores: Record<string, RecordEnvelope>, opts: { dropLpr?: boolean; runStatus?: string; dropEvidence?: boolean; evidenceStatus?: string } = {}): GraphEdgeIndex {
  const index = GraphEdgeIndex.inMemory();

  const records: Array<{ recordId: string; kind: string; label: string }> = [
    { recordId: P, kind: 'protocol', label: 'W24 family protocol' },
    { recordId: RUN, kind: 'run', label: 'W24 completed run' },
    { recordId: EVG, kind: 'event-graph', label: 'W24 executed surface' },
  ];
  if (!opts.dropLpr) records.push({ recordId: LPR, kind: 'local-protocol', label: 'W24 realization' });
  if (!opts.dropEvidence) records.push({ recordId: EVD, kind: 'evidence', label: 'W24 supporting evidence' });

  // Refs (JSON-LD index shape -> refers_to edges): LPR->P (inherits_from),
  // RUN->LPR (localProtocolRef), EVD->EVG (sources[].ref), AST->EVD
  // (evidence_refs).
  const refs = new Map<string, Array<{ recordId: string; kind?: string }>>();
  if (!opts.dropLpr) refs.set(LPR, [{ recordId: P, kind: 'protocol' }]);
  refs.set(RUN, [{ recordId: LPR, kind: 'local-protocol' }]);
  if (!opts.dropEvidence) refs.set(EVD, [{ recordId: EVG, kind: 'event-graph' }]);
  refs.set(AST, [{ recordId: EVD, kind: 'evidence' }]);

  index.build({
    records,
    refs,
    // The run's executed surface as a typed edge (run.executedEventGraphId).
    relationshipEdges: [{ sourceId: RUN, targetId: EVG, verb: 'executed' }],
  });
  return index;
}

function makeEngine(stores: Record<string, RecordEnvelope>, index: GraphEdgeIndex): GraphQueryEngine {
  const deps: GraphQueryEngineDeps = {
    index,
    store: {
      get: async (id) => stores[id] ?? null,
      list: async () => Object.values(stores),
      exists: async (id) => id in stores,
    },
  };
  return new GraphQueryEngine(deps);
}

function fixture(): Fixture {
  const stores = envelopes();
  const engine = makeEngine(stores, buildIndex(stores));
  return {
    engine,
    rebuild: (opts) => {
      const s: Record<string, RecordEnvelope> = envelopes();
      if (opts?.runStatus) s[RUN]!.payload.status = opts.runStatus;
      if (opts?.evidenceStatus) s[EVD]!.payload.status = opts.evidenceStatus;
      if (opts?.dropLpr) delete s[LPR];
      if (opts?.dropEvidence) delete s[EVD];
      return makeEngine(s, buildIndex(s, opts));
    },
  };
}

// ---------------------------------------------------------------------------
// The clauses, READ FROM THE YAML as data (spec §3 T3c: "assert the clause
// shapes came from the YAML").
// ---------------------------------------------------------------------------

const VOCAB_PATH = fileURLToPath(new URL('../../../schema/registry/provenance-ladder/rung-vocabulary.yaml', import.meta.url));
const vocab = parseYaml(readFileSync(VOCAB_PATH, 'utf8')) as Record<string, unknown>;
const derivedQueries = vocab.derived_queries as Array<Record<string, unknown>>;
const lv = derivedQueries.find((q) => q.id === 'locally-validated')!;
const clauses = lv.query_clauses as Array<Record<string, unknown>>;

/** Build the GraphQuery ops FROM the parsed clause data (no hand-authored
 *  query literals: op/type/where come from the YAML clause fields). */
function clauseQuery(clause: Record<string, unknown>, computed: Map<string, string[]>): GraphQuery {
  const op = clause.op as 'find' | 'traverse';
  if (op === 'traverse') {
    return {
      op: 'traverse',
      start: P,
      relationship: clause.relationship as string,
      direction: clause.direction as 'in' | 'out',
      targetType: clause.targetType as string,
      depth: clause.depth as number,
    };
  }
  const where = (clause.where as Array<Record<string, unknown>>).map((w) => {
    if (w.operator === 'in' && typeof w.values_from === 'string') {
      // Composition (declared in the vocabulary's `composition` note): each
      // clause's `values_from` names the earlier clause whose computed ids
      // feed this clause's `in` values.
      return { field: w.field as string, operator: 'in' as const, value: computed.get(w.values_from) ?? [] };
    }
    return { field: w.field as string, operator: w.operator as '=' | 'in', value: w.value };
  });
  return { op: 'find', type: clause.type as string, where };
}

/** locally-validated(P): all three declared clauses non-empty. */
async function locallyValidated(engine: GraphQueryEngine): Promise<{ realization: number; completedRun: number; evidence: number; validated: boolean }> {
  const [c1, c2, c3] = clauses;
  const computed = new Map<string, string[]>();
  const r1 = await engine.execute(clauseQuery(c1!, computed));
  const realizationIds = r1.objects.map((o) => o.id).filter((id) => id !== P);
  computed.set('realization-exists', realizationIds);
  const r2 = await engine.execute(clauseQuery(c2!, computed));
  computed.set('completed-run-of-realization', r2.objects.map((o) => o.id));
  const r3 = await engine.execute(clauseQuery(c3!, computed));
  return {
    realization: realizationIds.length,
    completedRun: r2.summary.count,
    evidence: r3.summary.count,
    validated: realizationIds.length > 0 && r2.summary.count > 0 && r3.summary.count > 0,
  };
}

describe('W2-4 locally-validated derived query (T3)', () => {
  let f: Fixture;

  beforeEach(() => {
    f = fixture();
  });

  it('clauses come from the YAML as data (snapshot of the parsed clause shapes)', () => {
    // Snapshot-compare the parsed clauses array: shape + ops, straight from
    // rung-vocabulary.yaml — the test authors no query literals.
    expect(clauses.map((c) => ({ id: c.id, op: c.op }))).toEqual([
      { id: 'realization-exists', op: 'traverse' },
      { id: 'completed-run-of-realization', op: 'find' },
      { id: 'active-evidence-into-run-executed-surface', op: 'find' },
    ]);
    expect(lv.rung_effect).toBe('DERIVED');
    const c3fields = (clauses[2]!.where as Array<Record<string, unknown>>).map((w) => w.field);
    expect(c3fields).toEqual(['status', 'event-graph.runId']);
  });

  it('a: full realization+run+evidence chain -> locally-validated TRUE', async () => {
    const r = await locallyValidated(f.engine);
    expect(r.realization).toBe(1);
    expect(r.completedRun).toBe(1);
    expect(r.evidence).toBe(1);
    expect(r.validated).toBe(true);
  });

  it('b(i): drop the realization (no LPR) -> FALSE', async () => {
    const engine = f.rebuild({ dropLpr: true });
    const r = await locallyValidated(engine);
    expect(r.realization).toBe(0);
    expect(r.validated).toBe(false);
  });

  it('b(ii): run status in_progress (no completed run) -> FALSE', async () => {
    const engine = f.rebuild({ runStatus: 'in_progress' });
    const r = await locallyValidated(engine);
    expect(r.completedRun).toBe(0);
    expect(r.validated).toBe(false);
  });

  it('b(iii): drop the evidence -> FALSE', async () => {
    const engine = f.rebuild({ dropEvidence: true });
    const r = await locallyValidated(engine);
    expect(r.evidence).toBe(0);
    expect(r.validated).toBe(false);
  });

  it('b(iii-b): evidence status retracted -> FALSE (retracted excluded from active queries)', async () => {
    const engine = f.rebuild({ evidenceStatus: 'retracted' });
    const r = await locallyValidated(engine);
    expect(r.evidence).toBe(0);
    expect(r.validated).toBe(false);
  });

  it('c: zero production TS — engine/index imported untouched; every op is read-only find/traverse', () => {
    // The clause ops the vocabulary declares are all read-side primitives
    // (graph-query.schema.yaml: "No query in this schema mutates laboratory
    // state"); no op here mints or mutates a VENDOR record.
    const ops = clauses.map((c) => c.op as string);
    expect(ops.every((op) => ['find', 'traverse', 'exists'].includes(op))).toBe(true);
  });
});
