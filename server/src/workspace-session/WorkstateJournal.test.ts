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
