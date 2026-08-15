/**
 * CorpusClient tests — the anonymizing (prompt → confirmed graph) client.
 *
 * - postCorpusEntry with enabled:false returns {ok:false,error:'corpus.disabled'}
 *   and does NOT hit the network.
 * - anonymizeGraph strips internal computable-lab ids (MSP-/EVG-/MAT-/ALQ-###).
 * - buildCorpusEntry builds a dedupe-friendly, PII-safe body.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  anonymizeGraph,
  buildCorpusEntry,
  eventEditorCorpusEntry,
  postCorpusEntry,
} from './CorpusClient.js';

const MINIMAL_INPUT = {
  source: 'event-editor' as const,
  sourceType: 'app' as const,
  prompt: { user: 'build a ROS assay on a 384 well plate' },
  acceptedGraph: {},
  confirmedBy: 'accepted-EVG' as const,
};

describe('postCorpusEntry', () => {
  it('returns corpus.disabled and never hits the network when disabled', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network must not be called');
    });
    const res = await postCorpusEntry(MINIMAL_INPUT, { enabled: false, serviceBaseUrl: 'http://x' }, fetchFn);
    expect(res).toEqual({ ok: false, error: 'corpus.disabled' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns ok:true with entryId + deduped when enabled and the moat accepts', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ entryId: 'ENT-1', deduped: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await postCorpusEntry(MINIMAL_INPUT, { enabled: true, serviceBaseUrl: 'http://x' }, fetchFn);
    expect(res.ok).toBe(true);
    expect(res.entryId).toBe('ENT-1');
    expect(res.deduped).toBe(false);
    const calledUrl = fetchFn.mock.calls[0]?.[0];
    expect(calledUrl).toBe('http://x/corpus/entries');
  });

  it('returns ok:false http_<code> on a non-2xx response', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 503 }));
    const res = await postCorpusEntry(MINIMAL_INPUT, { enabled: true, serviceBaseUrl: 'http://x' }, fetchFn);
    expect(res).toEqual({ ok: false, error: 'http_503' });
  });

  it('never throws on network failure — returns the error string', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const res = await postCorpusEntry(MINIMAL_INPUT, { enabled: true, serviceBaseUrl: 'http://x' }, fetchFn);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('ECONNREFUSED');
  });
});

describe('anonymizeGraph', () => {
  it('replaces internal MSP/EVG/MAT/ALQ/PRT/PLR ids in nested object values', () => {
    const graph = {
      events: [{ eventGraphId: 'EVG-0002', materialId: 'MAT-7', aliquotId: 'ALQ-99' }],
      labwares: [{ id: 'MSP-0001', printerId: 'PRT-3', plannedRunRef: 'PLR-11' }],
    };
    const out = anonymizeGraph(graph) as typeof graph;
    expect(out.events[0]!.eventGraphId).toBe('EVG-###');
    expect(out.events[0]!.materialId).toBe('MAT-###');
    expect(out.events[0]!.aliquotId).toBe('ALQ-###');
    expect(out.labwares[0]!.id).toBe('MSP-###');
    expect(out.labwares[0]!.printerId).toBe('PRT-###');
    expect(out.labwares[0]!.plannedRunRef).toBe('PLR-###');
  });

  it('replaces a bare 36-char alphanumeric token with ID', () => {
    // exactly 36 chars so the {36} regex consumes the whole run
    const token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(token.length).toBe(36);
    expect((anonymizeGraph({ runId: token }) as { runId: string }).runId).toBe('ID');
  });

  it('leaves anonymous data untouched and is safe on primitives', () => {
    expect(anonymizeGraph({ label: 'no internal ids here' })).toEqual({ label: 'no internal ids here' });
    expect(anonymizeGraph(42)).toBe(42);
    expect(anonymizeGraph(null)).toBeNull();
    expect(anonymizeGraph(undefined)).toBeUndefined();
  });
});

describe('buildCorpusEntry', () => {
  it('anonymizes acceptedGraph and omits empty correction/modelMetadata fields', () => {
    const entry = buildCorpusEntry({
      ...MINIMAL_INPUT,
      acceptedGraph: { events: [{ eventGraphId: 'EVG-0002' }] },
    });
    expect((entry.acceptedGraph as { events: Array<{ eventGraphId: string }> }).events[0]!.eventGraphId).toBe('EVG-###');
    expect(entry.corrections).toEqual([]);
    expect(entry.modelMetadata).toEqual({});
    expect(entry.confirmedBy).toBe('accepted-EVG');
  });
});

describe('eventEditorCorpusEntry', () => {
  it('defaults to confirmedBy accepted-EVG and carries the graph for downstream anonymization', () => {
    const entry = eventEditorCorpusEntry({
      userPrompt: 'build the assay',
      acceptedGraph: { events: [{ eventGraphId: 'EVG-0002' }] },
    });
    expect(entry.source).toBe('event-editor');
    expect(entry.confirmedBy).toBe('accepted-EVG');
    expect(entry.goldModel).toBeUndefined();
    // eventEditorCorpusEntry returns the graph as-is; buildCorpusEntry/postCorpusEntry
    // anonymize it on the wire.
    expect((entry.acceptedGraph as { events: Array<{ eventGraphId: string }> }).events[0]!.eventGraphId).toBe('EVG-0002');
  });
});