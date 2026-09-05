import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { AppContext } from '../server.js';
import { promoteArtifact } from './artifactPromotion.js';

/** In-memory store + local-mount storage stub. */
function makeCtx(initial: Record<string, { schemaId: string; payload: Record<string, unknown> }> = {}) {
  const records = new Map<string, { schemaId: string; payload: Record<string, unknown> }>(Object.entries(initial));
  const written: Array<{ path: string; bytes: Buffer }> = [];
  let nextDref = 0;
  const ctx = {
    store: {
      async get(id: string) {
        return records.has(id) ? { recordId: id, schemaId: records.get(id)!.schemaId, payload: records.get(id)!.payload } : null;
      },
      async list({ kind }: { kind: string }) {
        return [...records.entries()]
          .filter(([, v]) => (v.payload.kind as string) === kind)
          .map(([id, v]) => ({ recordId: id, schemaId: v.schemaId, payload: v.payload }));
      },
      async create({ envelope }: { envelope: { recordId: string; schemaId: string; payload: Record<string, unknown> } }) {
        if (records.has(envelope.recordId)) return { success: false, error: 'exists' };
        records.set(envelope.recordId, { schemaId: envelope.schemaId, payload: envelope.payload });
        if (/^DREF-/.test(envelope.recordId)) nextDref = Math.max(nextDref, Number(envelope.recordId.slice(5)));
        return { success: true };
      },
      async update({ envelope }: { envelope: { recordId: string; payload: Record<string, unknown> } }) {
        if (!records.has(envelope.recordId)) return { success: false, error: 'missing' };
        records.set(envelope.recordId, { schemaId: records.get(envelope.recordId)!.schemaId, payload: envelope.payload });
        return { success: true, envelope };
      },
    },
    storageService: {
      defaultDeviceId: () => 'usb0',
      getProvider: () => ({
        kind: 'local-mount',
        list: async () => [],
        stat: async () => ({}),
        read: async () => Readable.from(Buffer.alloc(0)),
        write: async (path: string, stream: NodeJS.ReadableStream) => {
          const chunks: Buffer[] = [];
          for await (const c of stream as AsyncIterable<Buffer>) chunks.push(c);
          written.push({ path, bytes: Buffer.concat(chunks) });
          return { sizeBytes: Buffer.concat(chunks).byteLength };
        },
        delete: async () => undefined,
      }),
    },
  } as unknown as AppContext;
  return { ctx, records, written };
}

describe('promoteArtifact', () => {
  it('promotes an inline artifact to a new data-reference', async () => {
    const { ctx, records, written } = makeCtx({
      'AOUT-1': {
        schemaId: 'artifact',
        payload: { kind: 'analysis-output-artifact', id: 'AOUT-1', name: 'preds', dataKind: 'table', inlineValue: [{ x: 1, y: 2 }] },
      },
    });
    const result = await promoteArtifact(ctx, 'AOUT-1');
    expect(result.created).toBe(true);
    expect(result.dataReferenceId).toMatch(/^DREF-/);
    // a data-reference exists + the artifact now carries the ref
    expect(records.get('DREF-000001')?.payload.kind).toBe('data-reference');
    expect((records.get('AOUT-1')!.payload as { dataReferenceRef?: { id?: string } }).dataReferenceRef?.id).toBe('DREF-000001');
    // bytes went to the storage device (not git)
    expect(written.length).toBe(1);
    expect(written[0].path).toContain('analysis-artifacts/promoted/AOUT-1/preds.json');
  });

  it('is idempotent for an already-promoted artifact', async () => {
    const { ctx } = makeCtx({
      'AOUT-2': {
        schemaId: 'artifact',
        payload: {
          kind: 'analysis-output-artifact', id: 'AOUT-2', name: 'model', dataKind: 'model',
          dataReferenceRef: { kind: 'record', id: 'DREF-000001', type: 'data-reference' },
        },
      },
      'DREF-000001': {
        schemaId: 'data-reference',
        payload: { kind: 'data-reference', id: 'DREF-000001', storageDeviceId: 'usb0', path: 'x', contentHash: 'a'.repeat(64), sizeBytes: 1, dataKind: 'model' },
      },
    });
    const result = await promoteArtifact(ctx, 'AOUT-2');
    expect(result.created).toBe(false);
    expect(result.dataReferenceId).toBe('DREF-000001');
  });

  it('rejects an artifact with neither dataReferenceRef nor inlineValue', async () => {
    const { ctx } = makeCtx({
      'AOUT-3': { schemaId: 'artifact', payload: { kind: 'analysis-output-artifact', id: 'AOUT-3', name: 'x', dataKind: 'table' } },
    });
    await expect(promoteArtifact(ctx, 'AOUT-3')).rejects.toThrow(/neither a dataReferenceRef nor an inlineValue/);
  });

  it('404 for a missing artifact', async () => {
    await expect(promoteArtifact(makeCtx().ctx, 'AOUT-NOPE')).rejects.toThrow(/not found/);
  });
});