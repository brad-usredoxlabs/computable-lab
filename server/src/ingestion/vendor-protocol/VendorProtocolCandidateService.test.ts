import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adaptAiChunkCandidateToRecordPayload,
  candidateRecordIdForDocument,
  extractVendorProtocolCandidateFromInput,
  upsertVendorProtocolCandidateRecord,
  VPC_SCHEMA_ID,
} from './VendorProtocolCandidateService.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordStore } from '../../store/types.js';

const SAMPLE_PROTOCOL = `
Example DNA Extraction Protocol

Product Contents
ZymoBIOMICS MagBinding Buffer
ZymoBIOMICS MagWash 1

Protocol
1. Add 100 ul ZymoBIOMICS MagBinding Buffer to the deep-well block.
2. Mix for 5 minutes at room temperature.
3. Place the plate on a magnetic stand for 3 minutes.
`;

describe('VendorProtocolCandidateService', () => {
  it('extracts a protocol candidate from text and persists the candidate artifact', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-candidate-'));
    try {
      const result = await extractVendorProtocolCandidateFromInput({
        workspaceRoot,
        text: SAMPLE_PROTOCOL,
        fileName: 'example-protocol.txt',
        documentId: 'doc-example-protocol',
        vendor: 'Example Vendor',
      });

      expect(result.source.inputKind).toBe('text');
      expect(result.document.sectionCount).toBeGreaterThanOrEqual(2);
      expect(result.candidate.kind).toBe('vendor-protocol-candidate');
      expect(result.candidate.steps.map((step) => step.stepNumber)).toEqual([1, 2, 3]);
      expect(result.candidate.steps[0]?.actions[0]).toMatchObject({
        actionKind: 'add',
        material: 'ZymoBIOMICS MagBinding Buffer',
      });
      expect(result.candidate.steps[2]?.actions[0]).toMatchObject({
        actionKind: 'magnetize',
        equipment: 'magnetic stand',
      });
      expect(result.candidatePath).toBe('artifacts/foundry/protocol-candidates/doc-example-protocol.json');
      await expect(readFile(join(workspaceRoot, result.candidatePath!), 'utf-8')).resolves.toContain('vendor-protocol-candidate');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// VPDF-3 fix run 1 (D2): the concurrent first-mint race in the upsert
// ---------------------------------------------------------------------------

describe('upsertVendorProtocolCandidateRecord: concurrent first-mint race', () => {
  const DOC_ID = 'VPDF-RACE-DOC';

  /** Minimal store mirroring RecordStoreImpl semantics for this leg: create
   *  refuses an existing id with 'Record already exists: <id>' (the exact
   *  store error), list sees the winner, update writes in place.
   *  `blindFirstList` simulates the race window: the FIRST list call returns
   *  empty (the winner's commit is not yet visible), so the upsert proceeds
   *  to create and loses — only then does the fallback re-list see the winner. */
  function raceStore(opts: { blindFirstList?: boolean } = {}) {
    const records = new Map<string, RecordEnvelope>();
    let listCalls = 0;
    const store = {
      get: async (id: string) => structuredClone(records.get(id) ?? null),
      list: async (filter?: { kind?: string }) => {
        listCalls += 1;
        if (opts.blindFirstList && listCalls === 1) return [];
        return [...records.values()]
          .filter((r) => !filter?.kind || (r.payload as Record<string, unknown>).kind === filter.kind)
          .map((r) => structuredClone(r));
      },
      create: async ({ envelope }: { envelope: RecordEnvelope }) =>
        records.has(envelope.recordId)
          ? { success: false, error: `Record already exists: ${envelope.recordId}` }
          : { success: true, envelope: (records.set(envelope.recordId, structuredClone(envelope)), envelope) },
      update: async ({ envelope }: { envelope: RecordEnvelope }) => {
        if (!records.has(envelope.recordId)) return { success: false, error: `Record not found: ${envelope.recordId}` };
        records.set(envelope.recordId, structuredClone(envelope));
        return { success: true, envelope };
      },
    } as unknown as RecordStore;
    return { store, records };
  }

  const summary = (title: string): Parameters<typeof upsertVendorProtocolCandidateRecord>[0]['summary'] => ({
    kind: 'vendor-protocol-candidate',
    title,
    steps: [{ stepNumber: 1, text: 'Lyse the sample.' }],
  });

  const inputFor = (store: RecordStore, title: string) => ({
    store,
    documentId: DOC_ID,
    summary: summary(title),
    sourceMeta: { documentId: DOC_ID, filename: 'race.pdf', pageCount: 1, fallbackTitle: 'Race doc' },
    message: `race upsert ${title}`,
  });

  it('create losing to a concurrent winner re-lists and updates the winner in place (same recordId, updatedExisting)', async () => {
    const { store, records } = raceStore({ blindFirstList: true });
    const recordId = candidateRecordIdForDocument(DOC_ID);

    // The winner minted the deterministic id while this upsert's list missed it.
    const winnerPayload = adaptAiChunkCandidateToRecordPayload(summary('Winner extract'), inputFor(store, 'x').sourceMeta);
    const winner = await store.create({ envelope: { recordId, schemaId: VPC_SCHEMA_ID, payload: winnerPayload }, message: 'winner mint' });
    expect(winner.success, (winner as { error?: string }).error).toBe(true);

    // The loser's create hits 'Record already exists' — the race path.
    const loser = await upsertVendorProtocolCandidateRecord(inputFor(store, 'Loser extract'));
    expect(loser.ok).toBe(true);
    if (!loser.ok) return;
    expect(loser.recordId).toBe(recordId);
    expect(loser.updatedExisting).toBe(true);

    // Exactly ONE candidate, carrying the loser's payload (the update landed).
    expect(records.size).toBe(1);
    const stored = await store.get(recordId);
    expect((stored!.payload as Record<string, unknown>).title).toBe('Loser extract');
  });

  it('a non-exists create failure still fails honestly (no silent fallback)', async () => {
    const failing = {
      get: async () => null,
      list: async () => [],
      create: async () => ({ success: false, error: 'Validation failed' }),
      update: async () => ({ success: false, error: 'should not be reached' }),
    } as unknown as RecordStore;
    const result = await upsertVendorProtocolCandidateRecord(inputFor(failing, 'Broken'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Validation failed');
  });
});
