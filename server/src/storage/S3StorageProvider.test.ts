import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { StorageError } from './types.js';
import { S3StorageProvider, type S3ClientLike } from './S3StorageProvider.js';

/** A controllable mock S3 client that records calls and returns canned data. */
function mockClient(): S3ClientLike & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    async listObjectsV2(params) {
      calls.push({ op: 'list', params });
      return {
        Contents: [
          { Key: 'prefix/reads/f1.fcs', Size: 42, LastModified: new Date('2026-01-01T00:00:00Z') },
          { Key: 'prefix/reads/f2.fcs', Size: 7, LastModified: new Date('2026-01-01T00:00:00Z') },
        ],
      };
    },
    async headObject(params) {
      calls.push({ op: 'head', params });
      return { ContentLength: 42, ContentType: 'text/csv' };
    },
    async getObject(params) {
      calls.push({ op: 'get', params });
      return { Body: Readable.from(Buffer.from('well,value\nA1,42\n')) };
    },
    async putObject(params) {
      calls.push({ op: 'put', params });
      return {};
    },
    async deleteObject(params) {
      calls.push({ op: 'delete', params });
      return {};
    },
  };
}

describe('S3StorageProvider (injected mock client)', () => {
  afterEach(() => vi.restoreAllMocks());

  const device = {
    id: 'labnas',
    label: 'Lab NAS',
    kind: 's3' as const,
    bucket: 'my-lab-data',
    pathPrefix: 'prefix',
    region: 'us-east-1',
  };

  it('lists entries under pathPrefix+path', async () => {
    const client = mockClient();
    const provider = new S3StorageProvider(device, client);
    const entries = await provider.list('reads');
    expect(entries.map((e) => e.name)).toEqual(['f1.fcs', 'f2.fcs']);
    expect(entries.every((e) => e.isDirectory === false)).toBe(true);
    // keys requested are rooted at the path prefix + relative path
    const listCall = client.calls.find((c) => c.op === 'list');
    expect(listCall?.params).toMatchObject({ Bucket: 'my-lab-data', Prefix: 'prefix/reads/' });
  });

  it('stats a file via headObject', async () => {
    const client = mockClient();
    const provider = new S3StorageProvider(device, client);
    const s = await provider.stat('reads/f1.fcs');
    expect(s.sizeBytes).toBe(42);
    expect(s.contentType).toBe('text/csv');
  });

  it('reads a file as a stream', async () => {
    const client = mockClient();
    const provider = new S3StorageProvider(device, client);
    const stream = await provider.read('reads/f1.fcs');
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString('utf8')).toContain('A1,42');
  });

  it('writes via putObject with the key prefixed', async () => {
    const client = mockClient();
    const provider = new S3StorageProvider(device, client);
    await provider.write('out.csv', Readable.from(Buffer.from('a,b\n1,2\n')));
    const putCall = client.calls.find((c) => c.op === 'put');
    expect(putCall?.params).toMatchObject({ Bucket: 'my-lab-data', Key: 'prefix/out.csv' });
  });

  it('requires a bucket', () => {
    expect(() => new S3StorageProvider({ id: 'x', label: 'X', kind: 's3', bucket: '' }, mockClient())).toThrow(
      StorageError,
    );
  });
});