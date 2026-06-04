import { describe, expect, it } from 'vitest';
import type { PromptMention } from '../promptMentions.js';
import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import {
  bindOntologyMentions,
  looksLikeOntologyCurie,
  inferDomainFromNamespace,
} from './bindOntologyMentions.js';
import { SCHEMA_IDS } from '../../api/handlers/MaterialLifecycleHandlers.js';

/** Minimal in-memory RecordStore stub covering just what the binder uses. */
function stubStore(initial: RecordEnvelope[] = []): RecordStore {
  const records = [...initial];
  return {
    list: async (filter) => {
      if (filter?.kind) return records.filter((r) => (r.payload as { kind?: string }).kind === filter.kind);
      return records;
    },
    create: async ({ envelope }) => {
      records.push(envelope);
      return { success: true, envelope };
    },
  } as unknown as RecordStore;
}

function material(id: string, name: string, opts: { classCurie?: string } = {}): RecordEnvelope {
  return {
    recordId: id,
    schemaId: SCHEMA_IDS.material,
    payload: {
      kind: 'material',
      id,
      name,
      domain: 'other',
      ...(opts.classCurie
        ? { class: [{ kind: 'ontology', id: opts.classCurie, namespace: opts.classCurie.split(':')[0], label: name }] }
        : {}),
    },
  } as unknown as RecordEnvelope;
}

const materialMention = (id: string, label: string): PromptMention => ({
  type: 'material',
  entityKind: 'material',
  id,
  label,
});

describe('looksLikeOntologyCurie', () => {
  it('recognizes uppercase prefix CURIEs', () => {
    expect(looksLikeOntologyCurie('CHEBI:5001')).toBe(true);
    expect(looksLikeOntologyCurie('NCBITAXON:9606')).toBe(true);
    expect(looksLikeOntologyCurie('GO:0008150')).toBe(true);
  });
  it('rejects local record-id prefixes', () => {
    expect(looksLikeOntologyCurie('MAT-ABC-XYZ')).toBe(false);
    expect(looksLikeOntologyCurie('LBW-1')).toBe(false);
  });
  it('rejects lowercase / no colon', () => {
    expect(looksLikeOntologyCurie('chebi:5001')).toBe(false);
    expect(looksLikeOntologyCurie('fenofibrate')).toBe(false);
    expect(looksLikeOntologyCurie('')).toBe(false);
  });
});

describe('inferDomainFromNamespace', () => {
  it('maps known namespaces', () => {
    expect(inferDomainFromNamespace('CHEBI')).toBe('chemical');
    expect(inferDomainFromNamespace('CL')).toBe('cell_line');
    expect(inferDomainFromNamespace('NCBITAXON')).toBe('organism');
    expect(inferDomainFromNamespace('PR')).toBe('reagent');
  });
  it('defaults to other for unknown namespaces', () => {
    expect(inferDomainFromNamespace('mesh')).toBe('other');
    expect(inferDomainFromNamespace('XYZ')).toBe('other');
  });
});

describe('bindOntologyMentions', () => {
  it('mints a new concept material on first sight of a CURIE', async () => {
    const store = stubStore([]);
    const { mentions, bindings } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store },
    );
    expect(mentions[0]!.id).toMatch(/^MAT-/);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.minted).toBe(true);
    expect(bindings[0]!.via).toBe('class-ref');
    expect(bindings[0]!.curie).toBe('CHEBI:5001');

    // The minted record carries the grounding ref in class[] and enters
    // vocabulary review instead of becoming active lab vocabulary.
    const written = await store.list({ kind: 'material' });
    expect(written).toHaveLength(1);
    const payload = written[0]!.payload as {
      class?: Array<{ id: string }>;
      status?: string;
      lifecycleId?: string;
      provenance?: { sourceCurie?: string; source?: string };
    };
    expect(payload.class?.[0]?.id).toBe('CHEBI:5001');
    expect(payload.status).toBe('proposed');
    expect(payload.lifecycleId).toBe('lab-vocabulary-control');
    expect(payload.provenance?.source).toBe('ai_mention');
    expect(payload.provenance?.sourceCurie).toBe('CHEBI:5001');
    expect(bindings[0]!.state).toBe('proposed');
    expect(bindings[0]!.requiresReview).toBe(true);
  });

  it('reuses an existing material whose class[] already carries the CURIE', async () => {
    const existing = material('MAT-PRE-EXISTING', 'something else', { classCurie: 'CHEBI:5001' });
    const store = stubStore([existing]);
    const { mentions, bindings } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store },
    );
    expect(mentions[0]!.id).toBe('MAT-PRE-EXISTING');
    expect(bindings[0]!.minted).toBe(false);
    expect(bindings[0]!.via).toBe('class-ref');
    // No new write
    expect((await store.list({ kind: 'material' }))).toHaveLength(1);
  });

  it('reuses by name (case-insensitive) when no class-ref match (Phase 1f parity)', async () => {
    const existing = material('MAT-LOCAL-FENO', 'Fenofibrate'); // no class
    const store = stubStore([existing]);
    const { mentions, bindings } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store },
    );
    expect(mentions[0]!.id).toBe('MAT-LOCAL-FENO');
    expect(bindings[0]!.via).toBe('name');
    expect(bindings[0]!.minted).toBe(false);
  });

  it('passes already-local material mentions through untouched', async () => {
    const store = stubStore([]);
    const { mentions, bindings } = await bindOntologyMentions(
      [materialMention('MAT-EXISTING', 'fenofibrate')],
      { store },
    );
    expect(mentions[0]!.id).toBe('MAT-EXISTING');
    expect(bindings).toEqual([]);
  });

  it('passes non-material mentions through untouched', async () => {
    const store = stubStore([]);
    const lwMention: PromptMention = { type: 'labware', id: 'lbw-something', label: 'Plate' };
    const { mentions, bindings } = await bindOntologyMentions([lwMention], { store });
    expect(mentions[0]).toEqual(lwMention);
    expect(bindings).toEqual([]);
  });

  it('is idempotent across a batch (second mention of same CURIE reuses the just-minted record)', async () => {
    const store = stubStore([]);
    const { mentions, bindings } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate'), materialMention('CHEBI:5001', 'fenofibrate')],
      { store },
    );
    expect(mentions[0]!.id).toBe(mentions[1]!.id);
    // Only one mint, plus a cached reuse
    expect(bindings.filter((b) => b.minted)).toHaveLength(1);
    expect((await store.list({ kind: 'material' }))).toHaveLength(1);
  });

  it('rewrites CURIE ids inside the prompt text when a prompt is supplied', async () => {
    const store = stubStore([]);
    const prompt = 'add 100 uL of [[material:CHEBI:5001|fenofibrate]] to well A1';
    const { mentions, prompt: rewritten } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store, prompt },
    );
    const newId = mentions[0]!.id;
    expect(newId).toMatch(/^MAT-/);
    expect(rewritten).toBe(`add 100 uL of [[material:${newId}|fenofibrate]] to well A1`);
  });

  it('echoes the prompt unchanged when no rewrites were needed', async () => {
    const store = stubStore([]);
    const prompt = 'plain prompt with no mentions';
    const { prompt: rewritten } = await bindOntologyMentions([], { store, prompt });
    expect(rewritten).toBe(prompt);
  });

  it('omits prompt from the result when none was provided', async () => {
    const store = stubStore([]);
    const result = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store },
    );
    expect(result.prompt).toBeUndefined();
  });

  it('keeps new CURIE mentions draft-only when persistence is disabled', async () => {
    const store = stubStore([]);
    const prompt = 'add [[material:CHEBI:5001|fenofibrate]]';
    const { mentions, bindings, prompt: rewritten } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store, prompt, persistNew: false },
    );
    expect(mentions[0]!.id).toBe('CHEBI:5001');
    expect(rewritten).toBe(prompt);
    expect(bindings).toEqual([expect.objectContaining({
      curie: 'CHEBI:5001',
      recordId: 'CHEBI:5001',
      draftOnly: true,
    })]);
    expect(await store.list({ kind: 'material' })).toHaveLength(0);
  });

  it('falls back to leaving the CURIE in place when the write fails (no worse than today)', async () => {
    const store: RecordStore = {
      list: async () => [],
      create: async () => ({ success: false }),
    } as unknown as RecordStore;
    const { mentions, bindings } = await bindOntologyMentions(
      [materialMention('CHEBI:5001', 'fenofibrate')],
      { store },
    );
    expect(mentions[0]!.id).toBe('CHEBI:5001'); // unchanged on failure
    expect(bindings).toEqual([]);
  });
});
