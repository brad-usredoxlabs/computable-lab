/**
 * ISEQ-1 RED — biosource proxy passthrough for the new sequence sources
 * (spec §5b/§5d). Net-new file: no BiosourceHandlers test exists at HEAD.
 *
 * Arms:
 *  (1) GET search passthrough: source 'ncbi_nucleotide' reaches the registered
 *      'ncbi_nucleotide_search' tool with {query, canonicalOnly:true}; the
 *      'organism' key is ABSENT (not undefined) when not supplied
 *      (exactOptionalPropertyTypes, §11.6).
 *  (2) organism passthrough when supplied; canonicalOnly only on 'true'.
 *  (3) fetch arm: SOURCE_MAP fetchArgs reach the fake fetch tool as
 *      db:'nucleotide' (data-declared in the map, not hardcoded in the branch).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { createBiosourceHandlers } from './BiosourceHandlers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeReply() {
  const status = vi.fn();
  return { reply: { status } as unknown as FastifyReply, status };
}

function fakeRequest(params: Record<string, string>, query: Record<string, string>) {
  return {
    params,
    query,
    log: { error: vi.fn() },
  } as unknown as FastifyRequest<{ Params: { source: string }; Querystring: Record<string, string> }>;
}

function recordingTool(name: string, seen: Record<string, unknown>[], payload: unknown) {
  const result: CallToolResult = { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  return {
    name,
    description: name,
    inputSchema: {},
    handler: async (args: Record<string, unknown>) => {
      seen.push({ ...args });
      return result;
    },
  };
}

describe('BiosourceHandlers — ncbi_nucleotide / ncbi_protein passthrough', () => {
  it('search: q + canonicalOnly=true reach ncbi_nucleotide_search; organism ABSENT when not supplied', async () => {
    const seen: Record<string, unknown>[] = [];
    const registry = new ToolRegistry();
    registry.register(recordingTool('ncbi_nucleotide_search', seen, { results: [{ accession: 'NR_028961', canonical: true }], total: 1 }));

    const handlers = createBiosourceHandlers(registry);
    const { reply, status } = fakeReply();
    const body = await handlers.search(
      fakeRequest({ source: 'ncbi_nucleotide' }, { q: '16S F prausnitzii', canonicalOnly: 'true' }),
      reply,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ query: '16S F prausnitzii', canonicalOnly: true });
    // exactOptionalPropertyTypes bar: absent, NOT undefined.
    expect('organism' in seen[0]!).toBe(false);
    expect('canonicalOnly' in seen[0]!).toBe(true);
    // Success path: no error status set (Fastify defaults to 200).
    expect(status).not.toHaveBeenCalled();
    expect(body).toMatchObject({ results: [{ accession: 'NR_028961', canonical: true }], total: 1 });
  });

  it('search: organism passes through when supplied; canonicalOnly only on the literal "true"', async () => {
    const seen: Record<string, unknown>[] = [];
    const registry = new ToolRegistry();
    registry.register(recordingTool('ncbi_nucleotide_search', seen, { results: [], total: 0 }));

    const handlers = createBiosourceHandlers(registry);

    const { reply: r1 } = fakeReply();
    await handlers.search(
      fakeRequest({ source: 'ncbi_nucleotide' }, { q: '16S ribosomal', organism: '853' }),
      r1,
    );
    expect(seen[0]).toEqual({ query: '16S ribosomal', organism: '853' });

    const { reply: r2 } = fakeReply();
    await handlers.search(
      fakeRequest({ source: 'ncbi_nucleotide' }, { q: '16S ribosomal', canonicalOnly: 'false' }),
      r2,
    );
    expect('canonicalOnly' in seen[1]!).toBe(false);
    expect('organism' in seen[1]!).toBe(false);

    const { reply: r3 } = fakeReply();
    await handlers.search(
      fakeRequest({ source: 'ncbi_protein' }, { q: 'insulin' }),
      r3,
    );
    // ncbi_protein maps to ncbi_protein_search — not registered here:
    expect(r3.status).toHaveBeenCalledWith(503);
  });

  it('fetch: SOURCE_MAP fetchArgs reach ncbi_sequence_fetch as db:"nucleotide" with the accession', async () => {
    const seen: Record<string, unknown>[] = [];
    const registry = new ToolRegistry();
    registry.register(recordingTool('ncbi_sequence_fetch', seen, { accession: 'NR_028961', db: 'nucleotide', sequence: '>NR_028961\nACGU' }));

    const handlers = createBiosourceHandlers(registry);
    const { reply, status } = fakeReply();
    const body = await handlers.fetch(
      fakeRequest({ source: 'ncbi_nucleotide' }, { id: 'NR_028961' }),
      reply,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ accession: 'NR_028961', db: 'nucleotide' });
    expect(status).not.toHaveBeenCalled();
    expect(body).toMatchObject({ accession: 'NR_028961', db: 'nucleotide' });
  });

  it('fetch: ncbi_protein maps to db:"protein" (fetch vocabulary, not the search db)', async () => {
    const seen: Record<string, unknown>[] = [];
    const registry = new ToolRegistry();
    registry.register(recordingTool('ncbi_sequence_fetch', seen, { accession: 'NP_000123.1', db: 'protein', sequence: '>NP_000123.1\nMKWV' }));

    const handlers = createBiosourceHandlers(registry);
    const { reply } = fakeReply();
    await handlers.fetch(fakeRequest({ source: 'ncbi_protein' }, { id: 'NP_000123.1' }), reply);

    expect(seen[0]).toEqual({ accession: 'NP_000123.1', db: 'protein' });
  });
});
