/**
 * PB-CH-8 — WorkstateJournal core unit tests (spec §1, red-first rows 1/2/7).
 *
 * Row 1  Capture correctness — a PUT passing policy appends EXACTLY one entry
 *        whose recomputed hash matches and whose snapshot round-trips
 *        byte-canonical; failing policy (disabled / interval / unchanged /
 *        'default' actor) appends ZERO.
 * Row 2  asOf reconstruction — query returns the latest capturedAt ≤ t WITH
 *        capturedAt in the result; ties break by seq, never content order.
 * Row 7  Integrity — a mutated entry file yields an `integrity` diagnostic,
 *        the corrupt entry is SKIPPED, never silently replaced.
 *
 * Pure filesystem module test: tmp workspaceRoot, fake auditSource, scratch
 * policy YAML (re-read per call — the policy-off proof depends on it).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { contentHash } from '../revisions/RecordRevisionService.js';
import { WorkstateJournal } from './WorkstateJournal.js';
import type { StoredWorkspaceSession } from './WorkspaceSessionStore.js';

let root: string;
let policyPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'journal-unit-'));
  policyPath = join(root, 'schema', 'workflow', 'workstate-journal.policy.yaml');
  await mkdir(join(root, 'schema', 'workflow'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- fixtures --

async function writePolicy(yaml: string): Promise<void> {
  await writeFile(policyPath, yaml, 'utf8');
}

/** The shipped policy shape with minIntervalMs 0 so unit captures are not debounced. */
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

const snapshot = (overrides: Partial<StoredWorkspaceSession> = {}): StoredWorkspaceSession => ({
  version: 1,
  userId: 'USR-A',
  tabs: [{ kind: 'run', runId: 'RUN-1', title: 'T' }],
  activeTabId: 'run:RUN-1',
  updatedAt: '2026-10-07T10:00:00.000Z',
  ...overrides,
});

/** Controllable server clock (capturedAt is the server clock, same instant as window T). */
function makeClock(start: string) {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current).toISOString(),
    advance: (ms: number) => { current += ms; },
  };
}

function fakeAuditSource(rows: Array<{ recordId: string; actor: string; subjectId: string; occurredAt: string }>) {
  return { list: async () => rows };
}

async function journalFiles(userId = 'USR-A'): Promise<string[]> {
  try {
    return (await readdir(join(root, 'var', 'sessions', userId, 'journal'))).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

// ------------------------------------------------------- row 1: capture -----

describe('WorkstateJournal — capture correctness (row 1)', () => {
  it('a capture passing policy appends EXACTLY one entry whose recomputed hash matches and whose snapshot round-trips byte-canonical', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({
      workspaceRoot: root,
      policyPath,
      auditSource: fakeAuditSource([]),
      now: clock.now,
    });

    const result = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() });
    expect(result.captured).toBe(true);

    const files = await journalFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^000001-[0-9a-f-]{36}\.yaml$/);

    const raw = await readFile(join(root, 'var', 'sessions', 'USR-A', 'journal', files[0]!), 'utf8');
    const entry = parse(raw) as Record<string, unknown>;
    expect(entry.journalVersion).toBe(1);
    expect(entry.seq).toBe(1);
    expect(entry.capturedAt).toBe('2026-10-07T10:00:00.000Z');
    expect(entry.actor).toBe('USR-A');
    // exactOptionalPropertyTypes: zero links ⇒ the field is ABSENT, never undefined.
    expect('links' in entry).toBe(false);

    // Snapshot round-trips byte-canonical: YAML round-trip deep-equals the
    // transport doc exactly as put() would write it.
    const snap = entry.snapshot as StoredWorkspaceSession;
    expect(parse(stringify(snap))).toEqual(snap);
    expect(snap).toEqual(snapshot());

    // Recomputed content hash matches the stored one (RecordRevisionService canonical()).
    expect(entry.contentHash).toBe(contentHash(snap));
  });

  it('failing policy appends ZERO: disabled / interval / unchanged / unresolved actor / missing policy file', async () => {
    // disabled
    await writePolicy(POLICY_ON.replace('enabled: true', 'enabled: false'));
    let journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: () => '2026-10-07T10:00:00.000Z' });
    expect((await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() })).captured).toBe(false);
    expect(await journalFiles()).toHaveLength(0);

    // interval (debounce floor): second capture inside minIntervalMs is skipped
    await writePolicy(POLICY_ON.replace('minIntervalMs: 0', 'minIntervalMs: 30000'));
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });
    expect((await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() })).captured).toBe(true);
    clock.advance(1000);
    expect((await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) })).captured).toBe(false);
    expect(await journalFiles()).toHaveLength(1);
    clock.advance(30000);
    expect((await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) })).captured).toBe(true);
    expect(await journalFiles()).toHaveLength(2);

    // unchanged (skipUnchanged + identical content hash)
    await writePolicy(POLICY_ON);
    journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: () => '2026-10-07T11:00:00.000Z' });
    expect((await journal.maybeCapture({ userId: 'USR-B', actor: 'USR-B', snapshot: snapshot({ userId: 'USR-B' }) })).captured).toBe(true);
    expect((await journal.maybeCapture({ userId: 'USR-B', actor: 'USR-B', snapshot: snapshot({ userId: 'USR-B' }) })).captured).toBe(false);
    expect(await journalFiles('USR-B')).toHaveLength(1);

    // 'default' fallback actor never captures (decision §4.3)
    expect((await journal.maybeCapture({ userId: 'default', actor: 'default', snapshot: snapshot({ userId: 'default' }) })).captured).toBe(false);
    expect((await journal.maybeCapture({ userId: 'USR-B', actor: null, snapshot: snapshot() })).captured).toBe(false);
    expect(await journalFiles('default')).toHaveLength(0);

    // missing policy file ⇒ capture DISABLED, never defaulted (decision §4.2)
    await rm(policyPath);
    journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: () => '2026-10-07T12:00:00.000Z' });
    expect((await journal.maybeCapture({ userId: 'USR-C', actor: 'USR-C', snapshot: snapshot({ userId: 'USR-C' }) })).captured).toBe(false);
    expect(await journalFiles('USR-C')).toHaveLength(0);
  });
});

// ------------------------------------------------------ row 2: asOf ---------

describe('WorkstateJournal — asOf reconstruction (row 2)', () => {
  it('returns the latest entry with capturedAt ≤ t, WITH capturedAt in the result', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });

    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: 'run:RUN-1' }) });
    clock.advance(60_000);
    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) });
    clock.advance(60_000);
    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ tabs: [{ kind: 'project', studyId: 'STU-9' }], activeTabId: 'project:STU-9' }) });

    // Query at t2 exactly ⇒ entry 2.
    const at2 = await journal.asOf('USR-A', '2026-10-07T10:01:00.000Z');
    expect(at2.status).toBe('found');
    if (at2.status !== 'found') return;
    expect(at2.capturedAt).toBe('2026-10-07T10:01:00.000Z');
    expect(at2.asOf).toBe('2026-10-07T10:01:00.000Z');
    expect(at2.snapshot.activeTabId).toBe(null);
    expect(at2.integrity).toEqual([]);

    // Query between t2 and t3 ⇒ still entry 2 (nearest at-or-before, never the later one).
    const between = await journal.asOf('USR-A', '2026-10-07T10:01:30.000Z');
    expect(between.status === 'found' && between.capturedAt).toBe('2026-10-07T10:01:00.000Z');

    // Query after t3 ⇒ entry 3.
    const after = await journal.asOf('USR-A', '2026-10-07T11:00:00.000Z');
    expect(after.status === 'found' && after.snapshot.activeTabId).toBe('project:STU-9');

    // Query before the first capture ⇒ honest no-history, never the current session.
    const before = await journal.asOf('USR-A', '2026-10-07T09:00:00.000Z');
    expect(before.status).toBe('no-history');
    if (before.status === 'no-history') expect(before.reason).toBe('predates-first-capture');
  });

  it('ties break by seq, never content order', async () => {
    await writePolicy(POLICY_ON);
    // Same capturedAt for both captures (clock frozen) ⇒ seq decides.
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: () => '2026-10-07T10:00:00.000Z' });
    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: 'run:RUN-1' }) });
    // skipUnchanged must not swallow this: different content, same instant.
    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) });

    const files = await journalFiles();
    expect(files).toHaveLength(2);

    const found = await journal.asOf('USR-A', '2026-10-07T10:00:00.000Z');
    expect(found.status).toBe('found');
    if (found.status !== 'found') return;
    // The seq-2 entry (later seq) wins the tie, not whichever reads first.
    expect(found.snapshot.activeTabId).toBe(null);
  });
});

// --------------------------------------------------- row 7: integrity -------

describe('WorkstateJournal — integrity (row 7)', () => {
  it('a mutated entry file surfaces an integrity diagnostic, is SKIPPED, and is never silently replaced', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });
    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: 'run:RUN-1' }) });
    clock.advance(60_000);
    await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) });

    // Mutate the NEWER entry on disk: change a byte inside the snapshot only.
    const dir = join(root, 'var', 'sessions', 'USR-A', 'journal');
    const files = await journalFiles();
    const corruptFile = files[1]!;
    const raw = await readFile(join(dir, corruptFile), 'utf8');
    const mutated = raw.replace('activeTabId: null', 'activeTabId: run:RUN-1');
    expect(mutated).not.toBe(raw);
    await writeFile(join(dir, corruptFile), mutated, 'utf8');

    const found = await journal.asOf('USR-A', '2026-10-07T10:01:00.000Z');
    // The corrupt entry is skipped; the OLDER valid entry answers — and the skip
    // is VISIBLE via the integrity diagnostic, never silent.
    expect(found.status).toBe('found');
    if (found.status !== 'found') return;
    expect(found.capturedAt).toBe('2026-10-07T10:00:00.000Z');
    expect(found.integrity).toHaveLength(1);
    expect(found.integrity[0]!.file).toBe(corruptFile);
    expect(found.integrity[0]!.reason).toContain('contentHash');
    // The corrupt snapshot was NOT returned.
    expect(found.snapshot.activeTabId).toBe('run:RUN-1');

    // If the ONLY entry ≤ t is corrupt, the answer is honest no-history +
    // diagnostic — never a neighbor presented as the answer without disclosure.
    const onlyDir = join(root, 'var', 'sessions', 'USR-D', 'journal');
    await mkdir(onlyDir, { recursive: true });
    await journal.maybeCapture({ userId: 'USR-D', actor: 'USR-D', snapshot: snapshot({ userId: 'USR-D' }) });
    const dFiles = await journalFiles('USR-D');
    const dRaw = await readFile(join(onlyDir, dFiles[0]!), 'utf8');
    await writeFile(join(onlyDir, dFiles[0]!), dRaw.replace('RUN-1', 'RUN-X'), 'utf8');
    const dFound = await journal.asOf('USR-D', '2026-10-07T12:00:00.000Z');
    expect(dFound.status).toBe('no-history');
    if (dFound.status === 'no-history') {
      expect(dFound.integrity.length).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------- row 3: event attribution --

describe('WorkstateJournal — capture-window linkage (row 3)', () => {
  it('links carry ONLY EVT ids whose subjectId is a snapshot idField value, occurredAt is inside the window, and the actor matches', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const audit = fakeAuditSource([
      // MATCH: subjectId = the snapshot's runId, inside the window, same actor.
      { recordId: 'EVT-MATCH-1', actor: 'USR-A', subjectId: 'RUN-1', occurredAt: '2026-10-07T09:55:00.000Z' },
      // REFUSED: plausible-but-unmatched subjectId (a different run).
      { recordId: 'EVT-SUBJECT-MISMATCH', actor: 'USR-A', subjectId: 'RUN-OTHER', occurredAt: '2026-10-07T09:55:00.000Z' },
      // REFUSED: right subject, wrong actor (requireSameActor: true).
      { recordId: 'EVT-ACTOR-MISMATCH', actor: 'USR-B', subjectId: 'RUN-1', occurredAt: '2026-10-07T09:55:00.000Z' },
      // REFUSED: right subject + actor, occurredAt OUTSIDE the window (windowMs 900000 = 15 min).
      { recordId: 'EVT-OUT-OF-WINDOW', actor: 'USR-A', subjectId: 'RUN-1', occurredAt: '2026-10-07T08:00:00.000Z' },
      // REFUSED: in the future relative to T.
      { recordId: 'EVT-FUTURE', actor: 'USR-A', subjectId: 'RUN-1', occurredAt: '2026-10-07T10:30:00.000Z' },
    ]);
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: audit, now: clock.now });
    const result = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() });
    expect(result.captured).toBe(true);
    if (!result.captured) return;
    expect(result.entry.links).toEqual(['EVT-MATCH-1']);

    const files = await journalFiles();
    const entry = parse(await readFile(join(root, 'var', 'sessions', 'USR-A', 'journal', files[0]!), 'utf8')) as Record<string, unknown>;
    expect(entry.links).toEqual(['EVT-MATCH-1']);
  });

  it('a lifecycle-then-PUT capture links with ZERO caller-supplied ids, and a model-supplied `links` field can never reach the entry (no code path)', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const audit = fakeAuditSource([
      { recordId: 'EVT-LIFECYCLE', actor: 'USR-A', subjectId: 'RUN-1', occurredAt: '2026-10-07T09:59:00.000Z' },
      { recordId: 'EVT-LIFECYCLE-2', actor: 'USR-A', subjectId: 'RUN-1', occurredAt: '2026-10-07T10:00:30.000Z' },
    ]);
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: audit, now: clock.now });

    // The snapshot arrives from store.put() — a transport doc with NO links
    // field. The caller supplies nothing; the server derives the link alone.
    const result = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() });
    expect(result.captured).toBe(true);
    if (!result.captured) return;
    expect(result.entry.links).toEqual(['EVT-LIFECYCLE']);

    // A caller that smuggles a `links` field into the snapshot payload cannot
    // inject it: links are computed from the audit source, and the snapshot's
    // own keys are carried verbatim but NEVER read as links.
    const smuggled = { ...snapshot(), links: ['EVT-INVENTED-BY-MODEL'] } as unknown as StoredWorkspaceSession;
    clock.advance(60_000);
    const second = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: smuggled });
    expect(second.captured).toBe(true);
    if (!second.captured) return;
    expect(second.entry.links ?? []).not.toContain('EVT-INVENTED-BY-MODEL');
    // The audit-derived link is still the only one present — and it is the
    // window-resident one (the earlier row sits before prevCapturedAt+1ms).
    expect(second.entry.links).toEqual(['EVT-LIFECYCLE-2']);
  });

  it('links are capped at policy linkage.maxLinks and zero matches ⇒ the links field is ABSENT', async () => {
    await writePolicy(POLICY_ON.replace('maxLinks: 32', 'maxLinks: 2'));
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const rows = Array.from({ length: 5 }, (_, i) => ({
      recordId: `EVT-${i}`,
      actor: 'USR-A',
      subjectId: 'RUN-1',
      occurredAt: new Date(Date.parse('2026-10-07T09:59:00.000Z') - i * 1000).toISOString(),
    }));
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource(rows), now: clock.now });
    const capped = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() });
    expect(capped.captured).toBe(true);
    if (!capped.captured) return;
    expect(capped.entry.links).toHaveLength(2);

    clock.advance(60_000);
    const none = await journal.maybeCapture({
      userId: 'USR-A',
      actor: 'USR-A',
      snapshot: snapshot({ tabs: [{ kind: 'project', studyId: 'STU-NO-EVENTS' }], activeTabId: 'project:STU-NO-EVENTS' }),
    });
    expect(none.captured).toBe(true);
    if (!none.captured) return;
    expect('links' in none.entry).toBe(false);
  });
});

// ------------------------------------------------- row 5: per-user isolation --

describe('WorkstateJournal — per-user isolation (row 5)', () => {
  it("user A's reader returns ZERO entries even when user B's dir is seeded (no user parameter, path bound to the actor)", async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });

    // Seed B only.
    const seeded = await journal.maybeCapture({ userId: 'USR-B', actor: 'USR-B', snapshot: snapshot({ userId: 'USR-B' }) });
    expect(seeded.captured).toBe(true);
    expect(await journalFiles('USR-B')).toHaveLength(1);

    // A's reader sees nothing of B's — not a filtered view, a different dir.
    const asA = await journal.asOf('USR-A', '2026-10-07T12:00:00.000Z');
    expect(asA.status).toBe('no-history');
    if (asA.status === 'no-history') expect(asA.reason).toBe('journal-empty');
    expect(await journalFiles('USR-A')).toHaveLength(0);
  });

  it("the 'default' fallback actor never captures and never gets a journal dir", async () => {
    await writePolicy(POLICY_ON);
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: () => '2026-10-07T10:00:00.000Z' });
    const skipped = await journal.maybeCapture({ userId: 'default', actor: null, snapshot: snapshot({ userId: 'default' }) });
    expect(skipped.captured).toBe(false);
    if (!skipped.captured) expect(skipped.reason).toBe('actor-unresolved');
    expect(await journalFiles('default')).toHaveLength(0);
  });
});

// ------------------------------------------------- row 6: concurrent writes --

describe('WorkstateJournal — concurrent writes (row 6)', () => {
  it('two raced maybeCapture calls each land as a distinct seq file, no torn files, no leftover tmp', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });

    const [first, second] = await Promise.all([
      journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: 'run:RUN-1' }) }),
      journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) }),
    ]);
    expect(first.captured).toBe(true);
    expect(second.captured).toBe(true);

    const dir = join(root, 'var', 'sessions', 'USR-A', 'journal');
    const all = await readdir(dir);
    const yamlFiles = all.filter((f) => f.endsWith('.yaml'));
    const leftovers = all.filter((f) => !f.endsWith('.yaml'));
    expect(yamlFiles).toHaveLength(2);
    // Atomic rename: no .tmp survivors.
    expect(leftovers).toEqual([]);

    const seqs = yamlFiles.map((f) => Number(f.slice(0, 6))).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2]);
    expect(new Set(yamlFiles).size).toBe(2);

    // Both files are readable and hash-valid (no torn write).
    const found = await journal.asOf('USR-A', '2026-10-07T10:00:00.000Z');
    expect(found.status).toBe('found');
    if (found.status === 'found') expect(found.integrity).toEqual([]);
  });
});

// ---------------------------------------------------- row 8: retention -------

describe('WorkstateJournal — retention (row 8)', () => {
  it('cap exceeded ⇒ WHOLE oldest files pruned; retained files are byte-unchanged; a fully-pruned range answers honestly (row 4), not a partial lie', async () => {
    await writePolicy(POLICY_ON.replace('maxEntries: 500', 'maxEntries: 2'));
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });

    const snapshots = [
      snapshot({ activeTabId: 'run:RUN-1' }),
      snapshot({ activeTabId: null }),
      snapshot({ tabs: [{ kind: 'project', studyId: 'STU-9' }], activeTabId: 'project:STU-9' }),
    ];
    const hashesBefore: string[] = [];
    for (const snap of snapshots) {
      hashesBefore.push(contentHash(snap));
      const r = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snap });
      expect(r.captured).toBe(true);
      clock.advance(60_000);
    }

    // maxEntries 2 ⇒ the OLDEST whole file is gone; two remain.
    const files = await journalFiles();
    expect(files).toHaveLength(2);
    expect(files.map((f) => Number(f.slice(0, 6))).sort((a, b) => a - b)).toEqual([2, 3]);

    // Retained lines are byte-unchanged: recomputed hashes match the originals.
    const dir = join(root, 'var', 'sessions', 'USR-A', 'journal');
    const retainedHashes: string[] = [];
    for (const file of files) {
      const entry = parse(await readFile(join(dir, file), 'utf8')) as Record<string, unknown>;
      retainedHashes.push(entry.contentHash as string);
    }
    expect(retainedHashes).toEqual([hashesBefore[1], hashesBefore[2]]);

    // A query for the pruned moment answers honestly with reason 'pruned'
    // (a seq gap proves history existed), never a partial lie.
    const pruned = await journal.asOf('USR-A', '2026-10-07T10:00:00.000Z');
    expect(pruned.status).toBe('no-history');
    if (pruned.status === 'no-history') expect(pruned.reason).toBe('pruned');

    // Age cap: an entry older than maxAgeDays is removed as a WHOLE file.
    await writePolicy(POLICY_ON.replace('maxAgeDays: 30', 'maxAgeDays: 0'));
    const aged = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: () => '2026-10-07T12:00:00.000Z' });
    await aged.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ tabs: [{ kind: 'project', studyId: 'STU-NEW' }], activeTabId: 'project:STU-NEW' }) });
    const afterAge = await journalFiles();
    // Only the just-appended file survives (never pruned by its own capture).
    expect(afterAge).toHaveLength(1);
    expect(afterAge[0]!.startsWith('000004')).toBe(true);
  });
});

// ------------------------------------- verification 9: per-call policy re-read --

describe('WorkstateJournal — policy re-read PER call (no boot cache)', () => {
  it('deleting the policy YAML between two captures on the SAME instance disables capture immediately (no restart, no cache)', async () => {
    await writePolicy(POLICY_ON);
    const clock = makeClock('2026-10-07T10:00:00.000Z');
    const journal = new WorkstateJournal({ workspaceRoot: root, policyPath, auditSource: fakeAuditSource([]), now: clock.now });

    const first = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot() });
    expect(first.captured).toBe(true);
    expect(await journalFiles()).toHaveLength(1);
    expect(journal.policyDisabled()).toBe(false);

    // Flip the YAML off IN PLACE (enabled: false) — the next call sees it.
    await writePolicy(POLICY_ON.replace('enabled: true', 'enabled: false'));
    clock.advance(60_000);
    const second = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: null }) });
    expect(second.captured).toBe(false);
    if (!second.captured) expect(second.reason).toBe('policy-disabled');
    expect(await journalFiles()).toHaveLength(1);
    expect(journal.policyDisabled()).toBe(true);

    // Delete the file entirely — capture stays DISABLED, never defaulted.
    await rm(policyPath);
    clock.advance(60_000);
    const third = await journal.maybeCapture({ userId: 'USR-A', actor: 'USR-A', snapshot: snapshot({ activeTabId: 'run:RUN-1' }) });
    expect(third.captured).toBe(false);
    expect(await journalFiles()).toHaveLength(1);

    // asOf answers the honest policy-disabled no-history on the SAME instance.
    const answer = await journal.asOf('USR-A', '2026-10-07T12:00:00.000Z');
    expect(answer.status).toBe('no-history');
    if (answer.status === 'no-history') expect(answer.reason).toBe('policy-disabled');
  });
});
