/**
 * FAME-3 D3 (test half) + D4 (adv-review cycle-1) — withRecordLock reentrancy.
 *
 * The withRecordLock change (W6) makes the record-edit onAccept hook reentrant:
 * a nested same-(store,id) acquire from the SAME async execution context runs
 * the inner fn directly (the accept applies its single governed store.update
 * inside accept's own lock over the same target — without reentrancy that
 * re-acquire would await the outer call that can only finish after the inner,
 * a self-deadlock with no writes and no error). DISTINCT contexts still
 * serialize through the per-(store,id) promise queue.
 *
 * D3 (orch adoption ruling: the reentrancy change is ADOPTED; the test half
 * stands) pins the three behaviors the reviewer asked for:
 *   (i)   a nested same-key acquire inside a lock COMPLETES (no self-deadlock);
 *   (ii)  two concurrent different-context acquires still SERIALIZED (no
 *         lock-free overlap);
 *   (iii) an inner throw RELEASES the outer lock (the outer completes and a
 *         later acquire succeeds).
 *
 * D4 pins the two keying defects the reviewer found:
 *   (i)    a nested same-id acquire on a DIFFERENT store must NOT short-circuit
 *          that store's queue as reentrant (the queue is (store,id) keyed, so
 *          the reentrancy marker must be too);
 *   (ii)  a continuation spawned inside the lock that OUTLIVES it must not
 *          re-enter the lock-free path (the stale ALS marker is invalidated by
 *          a released flag; the continuation re-acquires the queue instead).
 *
 * withRecordLock uses `store` only as a WeakMap/Map key — it never CALLS it —
 * so distinct plain objects stand in for distinct store instances.
 */
import { describe, it, expect } from 'vitest';
import { withRecordLock } from './RecordRevisionService.js';
import type { RecordStore } from '../store/types.js';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitUntil(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitUntil timed out');
    await delay(5);
  }
}
const store = (): RecordStore => ({}) as unknown as RecordStore;

describe('withRecordLock — reentrancy (FAME-3 D3, OQ-4 adopt ruling)', () => {
  it('(i) a nested same-(store,id) acquire INSIDE a lock completes — the inner runs lock-free during the outer critical section (no self-deadlock)', async () => {
    const s = store();
    const events: string[] = [];
    let releaseInner: () => void = () => {};
    const innerGate = new Promise<void>((r) => { releaseInner = r; });

    const done = withRecordLock(s, 'K', async () => {
      events.push('outer-start');
      const inner = withRecordLock(s, 'K', async () => {
        events.push('inner-start');
        await innerGate; // hold the inner work open INSIDE the outer section
        events.push('inner-end');
        return 'inner';
      });
      releaseInner(); // let the (reentrant, lock-free) inner finish
      expect(await inner).toBe('inner');
      events.push('outer-end');
      return 'outer';
    });

    expect(await done).toBe('outer');
    // The inner started AND finished BEFORE the outer ended — proof it ran
    // lock-free inside the outer (a non-reentrant queue would have deadlocked:
    // the inner would await the outer's queue entry that only resolves after
    // the outer returns, so 'inner-end' would never be reached).
    expect(events).toEqual(['outer-start', 'inner-start', 'inner-end', 'outer-end']);
  }, 15000);

  it('(ii) two concurrent DIFFERENT-context acquires of the same (store,id) still SERIALIZE — never lock-free concurrent', async () => {
    const s = store();
    let active = 0;
    let maxActive = 0;
    const work = () => withRecordLock(s, 'K', async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(30); // widen the window so overlap would be observable
      active -= 1;
      return 'ok';
    });
    const [a, b] = await Promise.all([work(), work()]); // two distinct top-level contexts
    expect([a, b]).toEqual(['ok', 'ok']);
    expect(maxActive).toBe(1); // serialized through the queue, never concurrent
  }, 15000);

  it('(iii) an inner throw RELEASES the outer lock — the outer completes and a later fresh acquire succeeds', async () => {
    const s = store();
    const outer = withRecordLock(s, 'K', async () => {
      const inner = withRecordLock(s, 'K', async () => {
        throw new Error('inner boom');
      });
      let threw = false;
      try { await inner; } catch (e) { threw = (e as Error).message === 'inner boom'; }
      expect(threw).toBe(true); // the inner throw propagated to the inner's await
      return 'outer-completed'; // the outer still completes despite the inner throw
    });
    expect(await outer).toBe('outer-completed');
    // The outer released the lock: a fresh acquire of the same (store,id)
    // succeeds (the queue entry was cleaned; nothing is stuck).
    expect(await withRecordLock(s, 'K', () => Promise.resolve('later'))).toBe('later');
  }, 15000);
});

describe('withRecordLock — (store,id) keying (FAME-3 D4)', () => {
  it('(i) a nested same-id acquire on a DIFFERENT store is NOT short-circuited — it serializes behind a concurrent holder of THAT store', async () => {
    const sA = store();
    const sB = store();
    const events: string[] = [];

    // A concurrent holder of (sB, K) in its own context, held open at a gate.
    let releaseB: () => void = () => {};
    const bGate = new Promise<void>((r) => { releaseB = r; });
    const holder = withRecordLock(sB, 'K', async () => {
      events.push('B-holder-start');
      await bGate;
      events.push('B-holder-end');
      return 'B-holder';
    });
    await waitUntil(() => events.includes('B-holder-start'));

    // Open (sA, K) and, NESTED, acquire (sB, K) — same id, DIFFERENT store.
    // D4: the reentrancy marker is (store,id) keyed, so (sB,K) is NOT held
    // (only (sA,K) is) → the nested acquire must go through sB's queue and WAIT
    // for the holder. (Before D4 the marker was keyed by id only, so 'K' in the
    // held set would have short-circuited sB's queue and run lock-free.)
    const nested = withRecordLock(sA, 'K', async () => {
      events.push('A-outer-start');
      const inner = withRecordLock(sB, 'K', async () => {
        events.push('B-nested-start');
        return 'B-nested';
      });
      const pending = inner;
      await delay(0); // yield: the inner must STILL be queued behind the holder
      expect(events).not.toContain('B-nested-start'); // not lock-free; it is waiting
      releaseB(); // release the holder; the nested acquire then proceeds
      expect(await pending).toBe('B-nested');
      expect(events).toContain('B-nested-start');
      return 'A-outer';
    });

    expect(await nested).toBe('A-outer');
    await holder;
    // Ordering: the nested ran AFTER the holder ENDED (it waited for the queue).
    expect(events.indexOf('B-holder-start')).toBeLessThan(events.indexOf('B-nested-start'));
    expect(events.indexOf('B-holder-end')).toBeLessThan(events.indexOf('B-nested-start'));
  }, 15000);

  it('(ii) a continuation spawned inside the lock that OUTLIVES it re-acquires the queue (not lock-free) — it waits behind a new holder', async () => {
    const s = store();
    const events: string[] = [];

    let laterResolve: () => void = () => {};
    const laterGate = new Promise<void>((r) => { laterResolve = r; });
    let later: Promise<string> | null = null;

    // Spawn a continuation in THIS context; it re-acquires (s,K) after the
    // outer critical section has ended (it outlives it).
    const outer = withRecordLock(s, 'K', async () => {
      later = (async () => {
        await laterGate; // outlive the outer critical section
        return withRecordLock(s, 'K', async () => {
          events.push('late-start');
          return 'late';
        });
      })();
      return 'outer-done';
    });
    expect(await outer).toBe('outer-done'); // the outer released (s,K)

    // A FRESH context C now holds (s,K), held open at a gate.
    let releaseC: () => void = () => {};
    const cGate = new Promise<void>((r) => { releaseC = r; });
    const contextC = withRecordLock(s, 'K', async () => {
      events.push('C-start');
      await cGate;
      events.push('C-end');
      return 'C';
    });
    await waitUntil(() => events.includes('C-start'));

    // Let the stale-context continuation re-acquire. D4: the outer's ALS marker
    // for (s,K) was released (entry.released flipped in the outer finally), so
    // the continuation must NOT run lock-free — it re-acquires the queue and
    // WAITS for C. (Before D4 the marker was a stale Set still holding 'K', so
    // the continuation would have run lock-free OVERLAPPING C.)
    laterResolve();
    await delay(20); // let the continuation reach withRecordLock
    expect(events).not.toContain('late-start'); // queued behind C, not lock-free

    releaseC();
    await contextC;
    expect(await later).toBe('late');
    expect(events).toContain('late-start');
    expect(events.indexOf('C-end')).toBeLessThan(events.indexOf('late-start')); // waited for C
  }, 15000);
});
