/**
 * PB-CH-8 — the ledger QUERY path tests (spec §4, rows 4/5/9/10 + the
 * verification-9 honest answers).
 *
 * Contract under test:
 *  - `found` answers carry capturedAt + the "as captured at" disclosure and a
 *    SERVER-BUILT workstate envelope derived from the snapshot bytes (row 9);
 *  - `no-history` answers NEVER carry a workstate proposal and NEVER return
 *    the current session as a stand-in (row 4);
 *  - an unresolved actor is REFUSED (row 5, OQ1 ruling) and user A's reader
 *    sees nothing of user B's seeded journal (row 5);
 *  - the policy-off answer is `reason: 'policy-disabled'` and is re-read PER
 *    call on one host instance (verification 9, no restart);
 *  - a snapshot tab that no longer maps produces a NAMED diagnostic and NO
 *    proposal — the generic compile gate owns the blocked card;
 *  - the module imports ZERO execution/promotion/analysis-run machinery and
 *    performs ZERO record-store writes (row 10 source-pin + tripwire).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SurfacesRegistry } from '../surfaces/surfaces.js';
import { WorkstateJournal, journalPolicyPath } from './WorkstateJournal.js';
import {
  createLedgerQueryHost,
  ledgerAnswerText,
  runLedgerQuery,
  serverWorkstateEnvelopeFromSnapshot,
  type LedgerQueryDeps,
} from './ledgerQuery.js';
import type { ActionCandidate } from '../ai/compileWorkspaceAction.js';
import type { RecordEnvelope } from '../store/types.js';
import type { StoredWorkspaceSession } from './WorkspaceSessionStore.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------- fixtures --

const POLICY_ON = `journalVersion: 1
capture:
  enabled: true
  minIntervalMs: 0
  requireResolvedActor: true
  skipUnchanged: true
linkage:
  windowMs: 900000
  requireSameActor: true
  maxLinks: 32
  idFields: [runId, studyId, recordId]
retention:
  maxEntries: 500
  maxAgeDays: 30
query:
  anchor: latest
  labEventsMax: 8
`;

/** A surfaces document mirroring the SHIPPED registry's run/project bindings
 *  (data, not the live file — the inverse derivation must work off the shape). */
const SURFACES_DOC = {
  version: 1,
  surfaces: [
    { id: 'find', label: 'Find', path: '/find', objectTypes: ['run'], selectableKinds: [] },
    { id: 'run-plan', label: 'Run Plan', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
    { id: 'run-design', label: 'Run Design', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
    { id: 'project', label: 'Project', path: '/project/:studyId', params: { studyId: 'project' }, objectTypes: ['project'], selectableKinds: [] },
    { id: 'knowledge', label: 'Knowledge', path: '/knowledge', objectTypes: ['claim', 'protocol', 'material', 'document'], selectableKinds: [] },
    { id: 'analysis', label: 'Analysis', path: '/analysis', objectTypes: ['project', 'run', 'collection'], selectableKinds: [] },
    { id: 'protocol-review', label: 'Protocol review', path: '/ingestion/vendor-pdf/:recordId', params: { recordId: 'document' }, objectTypes: ['document'], selectableKinds: [] },
  ],
};

function surfacesRegistry(): SurfacesRegistry {
  return new SurfacesRegistry(SURFACES_DOC as never);
}

function auditEnvelope(recordId: string, actor: string, subjectId: string, occurredAt: string, action = 'lifecycle_transition'): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/audit-event.schema.yaml',
    payload: { kind: 'audit-event', recordId, actor, action, subjectType: 'run', subjectId, occurredAt },
    meta: { createdAt: occurredAt, updatedAt: occurredAt, createdBy: actor },
  } as RecordEnvelope;
}

function recordEnvelope(recordId: string, kind: string, name: string): RecordEnvelope {
  return {
    recordId,
    schemaId: 'x',
    payload: { kind, name },
    meta: { createdAt: '', updatedAt: '', createdBy: '' },
  } as unknown as RecordEnvelope;
}

/** Tripwire store: reads allowed, writes explode AND are counted (row 10). */
function readTripwireStore(rows: RecordEnvelope[]) {
  const writes = { count: 0 };
  const trip = (op: string) => {
    writes.count += 1;
    throw new Error(`ledgerQuery must NEVER write to the record store (${op})`);
  };
  return {
    writes,
    get: async (id: string) => rows.find((r) => r.recordId === id) ?? null,
    list: async (filter?: { kind?: string }) => (filter?.kind ? rows.filter((r) => (r.payload as Record<string, unknown>).kind === filter.kind) : rows),
    create: async () => trip('create'),
    update: async () => trip('update'),
    delete: async () => trip('delete'),
  };
}

function spineWith(candidates: Record<string, readonly ActionCandidate[]>): LedgerQueryDeps['resolveSpine'] {
  return {
    async resolve(term: string) {
      return candidates[term] ?? [];
    },
  };
}

const RUN_CANDIDATE: ActionCandidate = { curie: 'local:RUN-1', label: 'ROS run', tier: 1, source: 'records' };

let root: string;
let policyPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ledger-query-'));
  await mkdir(join(root, 'schema', 'workflow'), { recursive: true });
  policyPath = journalPolicyPath(join(root, 'schema'));
  await writeFile(policyPath, POLICY_ON, 'utf8');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function makeJournal(rows: RecordEnvelope[] = []) {
  return new WorkstateJournal({
    workspaceRoot: root,
    policyPath,
    auditSource: {
      list: async () => rows
        .filter((r) => (r.payload as Record<string, unknown>).kind === 'audit-event')
        .map((r) => {
          const p = r.payload as Record<string, unknown>;
          return { recordId: String(p.recordId), actor: String(p.actor), action: String(p.action), subjectId: String(p.subjectId), occurredAt: String(p.occurredAt) };
        }),
    },
    now: () => '2026-10-07T10:00:00.000Z',
  });
}

function deps(store: ReturnType<typeof readTripwireStore>, actor: string | null): LedgerQueryDeps {
  return {
    resolveSpine: spineWith({ 'ROS run': [RUN_CANDIDATE] }),
    surfaces: surfacesRegistry(),
    store,
    // The SAME rows the journal links against: the store's audit-event
    // envelopes projected onto the ledger's read view.
    auditSource: {
      list: async (filter) => (await store.list(filter))
        .map((r) => {
          const p = r.payload as Record<string, unknown>;
          return { recordId: String(p.recordId), actor: String(p.actor), action: String(p.action), subjectId: String(p.subjectId), occurredAt: String(p.occurredAt) };
        }),
    },
    actor,
    anchor: 'latest',
  };
}

// ------------------------------------------------- row 9: found + server-built --

describe('ledgerQuery — found (row 9, server-built frames)', () => {
  it('a seeded journal answers found with capturedAt disclosure and a SERVER-BUILT envelope whose tabs equal the snapshot ids', async () => {
    // EVT-1 sits inside the capture window (linked at capture); EVT-2 is the
    // LATER server-known event the query anchors on — asOf then returns the
    // snapshot captured at or before it (row 2/9 semantics).
    const audit = [
      auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T09:55:00.000Z'),
      auditEnvelope('EVT-2', 'USR-A', 'RUN-1', '2026-10-07T10:05:00.000Z'),
    ];
    const journal = makeJournal(audit);
    const snapshot: StoredWorkspaceSession = {
      version: 1,
      userId: 'USR-A',
      tabs: [{ kind: 'run', runId: 'RUN-1', title: 'ROS run' }],
      activeTabId: 'run:RUN-1',
      updatedAt: '2026-10-07T10:00:00.000Z',
    };
    const captured = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot });
    expect(captured.captured).toBe(true);

    const store = readTripwireStore([
      ...audit,
      recordEnvelope('RUN-1', 'planned-run', 'ROS run'),
    ]);
    const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));

    expect(result.answer.status).toBe('found');
    expect(result.answer.capturedAt).toBe('2026-10-07T10:00:00.000Z');
    // Disclosure says "as captured at", never "as of" (decision §4.5).
    expect(result.answer.disclosure).toContain('as captured at');
    expect(result.answer.disclosure).not.toMatch(/^as of/);
    expect(result.answer.answerText).toContain('as captured at 2026-10-07T10:00:00.000Z');
    // The EVT link rode in from the capture-time window.
    expect(result.answer.links).toEqual(['EVT-1']);

    // SERVER-BUILT envelope: the inverse of the registry (the runId token
    // resolves to the FIRST registered surface binding it — registry order,
    // never a TS allow-list), target = the snapshot's own recordId.
    expect(result.workstateProposal).toBeDefined();
    expect(result.workstateProposal!.operation).toBe('compose-workstate');
    expect(result.workstateProposal!.tabs).toEqual([{ surface: 'run-plan', target: { recordId: 'RUN-1' } }]);
    expect(result.workstateProposal!.activeTab).toEqual({ index: 0 });
  });

  it('the anchor comes ONLY from server-known audit occurredAt — a model-supplied timestamp in the query is never read', async () => {
    const audit = [auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T10:05:00.000Z')];
    const journal = makeJournal(audit);
    await journal.maybeCapture({
      userId: 'USR-A',
      actor: 'USR-A',
      snapshot: { version: 1, userId: 'USR-A', tabs: [{ kind: 'run', runId: 'RUN-1' }], activeTabId: 'run:RUN-1', updatedAt: '2026-10-07T10:00:00.000Z' },
    });
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    // The model's query carries VERBS AND TERMS ONLY — no timestamp field
    // exists in the query shape, and runLedgerQuery never reads one: the
    // anchor is the server-known audit occurredAt alone.
    const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(result.answer.status).toBe('found');
    expect(result.answer.asOf).toBe('2026-10-07T10:05:00.000Z');
  });

  it('a snapshot tab whose kind no longer maps to a registered surface yields a NAMED diagnostic and NO proposal (no guessed route)', async () => {
    const audit = [auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T10:05:00.000Z')];
    const journal = makeJournal(audit);
    // A tab kind the shipped mapping cannot produce (a kind removed from the
    // tab-kinds YAML): the derivation names it and refuses to invent a surface.
    await journal.maybeCapture({
      userId: 'USR-A',
      actor: 'USR-A',
      snapshot: { version: 1, userId: 'USR-A', tabs: [{ kind: 'retired-kind', runId: 'RUN-1' }], activeTabId: null, updatedAt: '2026-10-07T10:00:00.000Z' },
    });
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(result.answer.status).toBe('found');
    expect(result.workstateProposal).toBeUndefined();
    expect(result.diagnostics?.some((d) => d.code === 'UNMAPPABLE_SNAPSHOT_TAB')).toBe(true);
  });
});

// ------------------------------------------------- row 4: missing history -----

describe('ledgerQuery — no-history honesty (row 4)', () => {
  it('a query before the first capture answers no-history with a reason, NO proposal, and lab events clearly labeled as NOT workstate', async () => {
    const audit = [auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T09:50:00.000Z')];
    const journal = makeJournal(audit); // journal dir never written
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));

    expect(result.answer.status).toBe('no-history');
    expect(result.answer.reason).toBe('journal-empty');
    // ✗-expect: the CURRENT session is never a stand-in — no proposal at all.
    expect(result.workstateProposal).toBeUndefined();
    expect(result.answer.labEvents).toEqual([
      { recordId: 'EVT-1', action: 'lifecycle_transition', occurredAt: '2026-10-07T09:50:00.000Z', subjectId: 'RUN-1' },
    ]);
    expect(ledgerAnswerText(result.answer)).toContain('lab events, not workstate');
  });

  it('an unresolvable term and an invented recordId both answer honestly with no snapshot and no guess', async () => {
    const journal = makeJournal([]);
    const store = readTripwireStore([]);
    const d = deps(store, 'USR-A');

    const unknownTerm = await runLedgerQuery({ term: 'the thing I did last spring' }, journal, d);
    expect(unknownTerm.answer.status).toBe('no-history');
    expect(unknownTerm.answer.reason).toBe('no-anchor');
    expect(unknownTerm.workstateProposal).toBeUndefined();
    expect(unknownTerm.diagnostics?.[0]?.code).toBe('UNRESOLVED_TERM');

    const invented = await runLedgerQuery({ recordId: 'RUN-MADE-UP' }, journal, d);
    expect(invented.answer.status).toBe('no-history');
    expect(invented.diagnostics?.[0]?.code).toBe('UNKNOWN_RECORD');
    expect(invented.workstateProposal).toBeUndefined();
  });

  it('a subject with no server-known audit event gets the no-anchor refusal — the ledger never invents a timestamp', async () => {
    const journal = makeJournal([]);
    const store = readTripwireStore([recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(result.answer.status).toBe('no-history');
    expect(result.answer.reason).toBe('no-anchor');
    expect(result.diagnostics?.[0]?.code).toBe('NO_ANCHOR');
    expect(ledgerAnswerText(result.answer)).toContain('could not place');
  });
});

// ------------------------------------------------- row 5: authorization -------

describe('ledgerQuery — authorization (row 5)', () => {
  it('an unresolved actor (null) and the header-fallback "default" are both REFUSED before any resolution work', async () => {
    const journal = makeJournal([]);
    const store = readTripwireStore([]);
    for (const actor of [null, 'default']) {
      const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, actor));
      expect(result.answer.status).toBe('no-history');
      expect(result.answer.reason).toBe('actor-unresolved');
      expect(result.workstateProposal).toBeUndefined();
    }
  });

  it("user A's query returns nothing even when user B's journal is seeded (per-user path binding, no user parameter)", async () => {
    const audit = [
      auditEnvelope('EVT-1', 'USR-B', 'RUN-1', '2026-10-07T09:50:00.000Z'),
      // A legitimately observed the same run (its own audit row ⇒ A has an
      // anchor), yet A's journal dir was never written: A must see NOTHING of
      // B's snapshots.
      auditEnvelope('EVT-2', 'USR-A', 'RUN-1', '2026-10-07T09:55:00.000Z'),
    ];
    const journal = makeJournal(audit);
    // Seed B's journal only.
    const seeded = await journal.maybeCapture({
      userId: 'USR-B',
      actor: 'USR-B',
      snapshot: { version: 1, userId: 'USR-B', tabs: [{ kind: 'run', runId: 'RUN-1' }], activeTabId: 'run:RUN-1', updatedAt: '2026-10-07T10:00:00.000Z' },
    });
    expect(seeded.captured).toBe(true);

    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    // A resolves the same run but reads only A's own journal dir.
    const asA = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(asA.answer.status).toBe('no-history');
    expect(asA.answer.reason).toBe('journal-empty');
    expect(asA.workstateProposal).toBeUndefined();
  });
});

// ------------------------------------------------- verification 9: policy-off --

describe('ledgerQuery — policy-off answers honestly per call (verification 9)', () => {
  it('deleting the policy YAML makes the SAME host instance answer no-history reason:policy-disabled, then a restored policy answers again — no restart, no cache', async () => {
    const audit = [auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T10:05:00.000Z')];
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    const journal = makeJournal(audit);
    await journal.maybeCapture({
      userId: 'USR-A',
      actor: 'USR-A',
      snapshot: { version: 1, userId: 'USR-A', tabs: [{ kind: 'run', runId: 'RUN-1' }], activeTabId: 'run:RUN-1', updatedAt: '2026-10-07T10:00:00.000Z' },
    });

    const host = createLedgerQueryHost(() => ({
      workspaceRoot: root,
      policyPath,
      store,
      resolveSpine: spineWith({ 'ROS run': [RUN_CANDIDATE] }),
      surfaces: surfacesRegistry(),
    }));

    const before = await host.run({ term: 'ROS run' }, 'USR-A');
    expect(before.answer.status).toBe('found');

    // Delete the policy file — the very next query on the SAME host answers
    // policy-disabled (per-call re-read; a boot-cached policy would still say
    // "found" here).
    await rm(policyPath);
    const off = await host.run({ term: 'ROS run' }, 'USR-A');
    expect(off.answer.status).toBe('no-history');
    expect(off.answer.reason).toBe('policy-disabled');
    expect(off.workstateProposal).toBeUndefined();

    // Restore — capture/query live again without any restart.
    await writeFile(policyPath, POLICY_ON, 'utf8');
    const after = await host.run({ term: 'ROS run' }, 'USR-A');
    expect(after.answer.status).toBe('found');
  });
});

// ------------------------------------------------- adversarial defect 2 -------

describe('serverWorkstateEnvelopeFromSnapshot — record-edit tabs (adversarial defect 2)', () => {
  it('a record-edit snapshot tab (protocol/analysis chain) does NOT claim the vendor-PDF protocol-review surface — it names UNMAPPABLE_SNAPSHOT_TAB instead (no guessed route)', () => {
    // The shipped workstate-tab-kinds.yaml maps protocol/analysis-revision/
    // analysis-run to tabKind record-edit + idField recordId. The ONLY registry
    // surface binding a `recordId` param is protocol-review (objectTypes
    // [document], params recordId: document) — a surface for reviewing a
    // source DOCUMENT, not a record editor. The old token-name heuristic
    // claimed it for every record-edit tab. The inverse must hold: a surface
    // qualifies only when its declared data (params objectType, or its id)
    // names the mapping's tabKind. record-edit has no such surface ⇒ named
    // diagnostic, no proposal, no guessed route.
    const snapshot: StoredWorkspaceSession = {
      version: 1,
      userId: 'USR-A',
      tabs: [{ kind: 'record-edit', recordId: 'PRT-1', recordKind: 'protocol' }],
      activeTabId: 'record:PRT-1',
      updatedAt: '2026-10-07T10:00:00.000Z',
    };
    const built = serverWorkstateEnvelopeFromSnapshot(snapshot, surfacesRegistry());
    expect('envelope' in built).toBe(false);
    if ('envelope' in built) return;
    expect(built.diagnostics.some((d) => d.code === 'UNMAPPABLE_SNAPSHOT_TAB' && d.message.includes('record-edit'))).toBe(true);
    // The refusal names the registry as the authority — never a silent guess.
    expect(built.diagnostics[0]!.message).toContain('surfaces.yaml');
  });

  it('the registry-qualified inverse still holds for run/project/protocol-review tabs (data equality, not token name)', () => {
    // run-plan declares params {runId: run} — the objectType filling the
    // token EQUALS the mapping's tabKind 'run'. project: {studyId: project}
    // === tabKind 'project'. protocol-review: its surface id EQUALS the
    // mapping's tabKind 'protocol-review'. These are the shipped data joins;
    // the record-edit tab above fails both.
    const snapshot: StoredWorkspaceSession = {
      version: 1,
      userId: 'USR-A',
      tabs: [
        { kind: 'run', runId: 'RUN-1' },
        { kind: 'project', studyId: 'STU-9' },
        { kind: 'protocol-review', recordId: 'DOC-3' },
      ],
      activeTabId: null,
      updatedAt: '2026-10-07T10:00:00.000Z',
    };
    const built = serverWorkstateEnvelopeFromSnapshot(snapshot, surfacesRegistry());
    expect('envelope' in built).toBe(true);
    if (!('envelope' in built)) return;
    expect(built.envelope.tabs).toEqual([
      { surface: 'run-plan', target: { recordId: 'RUN-1' } },
      { surface: 'project', target: { recordId: 'STU-9' } },
      { surface: 'protocol-review', target: { recordId: 'DOC-3' } },
    ]);
  });
});

// ------------------------------------------------- adversarial defect 3 -------

describe('ledgerQuery — lab-events cap is policy data (adversarial defect 3)', () => {
  it('the no-history lab-event lines cap at query.labEventsMax from the policy YAML, and the cap is re-read PER call (flip 8→3 changes the answer, no restart)', async () => {
    // 10 server-known audit events for the subject; the journal is empty ⇒
    // honest no-history with lab events. The shipped cap is policy data.
    const audit = Array.from({ length: 10 }, (_, i) =>
      auditEnvelope(`EVT-${i + 1}`, 'USR-A', 'RUN-1', `2026-10-07T09:${String(i).padStart(2, '0')}:00.000Z`),
    );
    const journal = makeJournal(audit);
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);

    const first = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(first.answer.status).toBe('no-history');
    // The shipped policy declares labEventsMax: 8 → the 10 near events render
    // as the LAST 8 (nearest to t first).
    expect(first.answer.labEvents?.length).toBe(8);
    expect(first.answer.labEvents?.[0]?.recordId).toBe('EVT-3');

    // Flip the cap IN PLACE to 3 — the SAME journal instance answers with 3
    // lines on the very next query (per-call policy re-read; a TS constant
    // could not move).
    await writeFile(policyPath, POLICY_ON.replace('labEventsMax: 8', 'labEventsMax: 3'), 'utf8');
    const second = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(second.answer.labEvents?.length).toBe(3);
    expect(second.answer.labEvents?.[0]?.recordId).toBe('EVT-8');
  });
});

// ------------------------------------------------- adversarial defect 4 -------

describe('createLedgerQueryHost — parts re-evaluated PER query (adversarial defect 4)', () => {
  it('every host.run() re-reads the parts accessor — a boot-captured part can never be memoized across queries', async () => {
    const audit = [auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T10:05:00.000Z')];
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    const journal = makeJournal(audit);
    await journal.maybeCapture({
      userId: 'USR-A',
      actor: 'USR-A',
      snapshot: { version: 1, userId: 'USR-A', tabs: [{ kind: 'run', runId: 'RUN-1' }], activeTabId: 'run:RUN-1', updatedAt: '2026-10-07T10:00:00.000Z' },
    });

    // The production wiring (server.ts) builds the store view, the SPINE, and
    // the surfaces registry INSIDE this accessor so each query gets fresh
    // ones (a post-boot record must resolve, not just store.get). The pin:
    // the accessor is called once per run(), never cached by the host.
    let partsCalls = 0;
    const host = createLedgerQueryHost(() => {
      partsCalls += 1;
      return {
        workspaceRoot: root,
        policyPath,
        store,
        resolveSpine: spineWith({ 'ROS run': [RUN_CANDIDATE] }),
        surfaces: surfacesRegistry(),
      };
    });

    const first = await host.run({ term: 'ROS run' }, 'USR-A');
    const second = await host.run({ term: 'ROS run' }, 'USR-A');
    expect(first.answer.status).toBe('found');
    expect(second.answer.status).toBe('found');
    expect(partsCalls).toBe(2);
  });
});

// ------------------------------------------------- row 10: zero-records pin ----

describe('ledgerQuery — zero record writes (row 10)', () => {
  it('the module source imports NO execution/promotion/analysis-run machinery (source-pin, WorkstateDraftAdapter pattern)', () => {
    const src = readFileSync(join(__dirname, 'ledgerQuery.ts'), 'utf8');
    for (const forbidden of [
      'AnalysisRun', 'executeRun', 'promote', 'Promotion', 'runAnalysis',
      'WorkstateDraftAdapter', 'AnalysisDraftAdapter', 'FormDraftService',
      'lifecycle', 'Lifecycle', 'AuditEventService', 'replaceState',
    ]) {
      expect(src).not.toContain(forbidden);
    }
    // The ledger reads: only get/list reach the store.
    expect(src).toContain("store: Pick<RecordStore, 'get' | 'list'>");
  });

  it('a full found cycle performs ZERO store writes (tripwire create/update/delete never fire)', async () => {
    const audit = [auditEnvelope('EVT-1', 'USR-A', 'RUN-1', '2026-10-07T10:05:00.000Z')];
    const journal = makeJournal(audit);
    await journal.maybeCapture({
      userId: 'USR-A',
      actor: 'USR-A',
      snapshot: { version: 1, userId: 'USR-A', tabs: [{ kind: 'run', runId: 'RUN-1' }], activeTabId: 'run:RUN-1', updatedAt: '2026-10-07T10:00:00.000Z' },
    });
    const store = readTripwireStore([...audit, recordEnvelope('RUN-1', 'planned-run', 'ROS run')]);
    const result = await runLedgerQuery({ term: 'ROS run' }, journal, deps(store, 'USR-A'));
    expect(result.answer.status).toBe('found');
    // The tripwire store throws from create/update/delete; reaching here with
    // a found answer proves the ledger performed ZERO record-store writes.
    expect(store.writes.count).toBe(0);
  });
});

// ------------------------------------------------- envelope derivation unit ----

describe('serverWorkstateEnvelopeFromSnapshot — derivation unit', () => {
  it('derives surfaces for project and protocol-review tabs from the registry inverse and keeps activeTab by idPrefix match', () => {
    const snapshot: StoredWorkspaceSession = {
      version: 1,
      userId: 'USR-A',
      tabs: [
        { kind: 'run', runId: 'RUN-1' },
        { kind: 'project', studyId: 'STU-9' },
        { kind: 'protocol-review', recordId: 'DOC-3' },
      ],
      activeTabId: 'project:STU-9',
      updatedAt: '2026-10-07T10:00:00.000Z',
    };
    const built = serverWorkstateEnvelopeFromSnapshot(snapshot, surfacesRegistry());
    expect('envelope' in built).toBe(true);
    if (!('envelope' in built)) return;
    expect(built.envelope.tabs).toEqual([
      { surface: 'run-plan', target: { recordId: 'RUN-1' } },
      { surface: 'project', target: { recordId: 'STU-9' } },
      { surface: 'protocol-review', target: { recordId: 'DOC-3' } },
    ]);
    expect(built.envelope.activeTab).toEqual({ index: 1 });
  });
});
