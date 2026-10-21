import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adaptAiChunkCandidateToRecordPayload,
  AI_CHUNK_ANCHORS_APPROXIMATE,
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

// ---------------------------------------------------------------------------
// VPDF-3 fix run 2: real-model diagnostics are BARE STRINGS (live defect).
// The deepseek model emits top-level `diagnostics` as an array of strings;
// mergeChunkResults copies them verbatim and the adapter used to spread them
// straight into the payload — every real-model extraction then failed the
// persist leg with /diagnostics/N "must be object" (Ajv2020 vs
// vendor-protocol-candidate.schema.yaml). The adapter owns candidate-shape
// normalization, so it normalizes every entry into a schema-legal diagnostic
// object. No schema loosening, no kind-branching.
// ---------------------------------------------------------------------------

describe('adaptAiChunkCandidateToRecordPayload: diagnostics normalization (fix2)', () => {
  const DOC_ID = 'VPDF-DIAG-NORM-DOC';
  const meta = {
    documentId: DOC_ID,
    filename: 'purelink.pdf',
    pageCount: 2,
    vendor: 'thermo',
    fallbackTitle: 'Thermo PureLink RNA Mini Kit',
  };

  /** The REAL schema's diagnostics item contract (Ajv2020,
   *  vendor-protocol-candidate.schema.yaml): object with severity enum,
   *  code string, message string; additionalProperties:true. */
  function assertSchemaLegalDiagnostic(d: unknown, label: string): asserts d is { severity: string; code: string; message: string } {
    expect(typeof d, label).toBe('object');
    expect(d, label).not.toBeNull();
    const obj = d as Record<string, unknown>;
    expect(['error', 'warning', 'info'], `${label} severity`).toContain(obj.severity);
    expect(typeof obj.code, `${label} code`).toBe('string');
    expect(obj.code.length, `${label} code non-empty`).toBeGreaterThan(0);
    expect(typeof obj.message, `${label} message`).toBe('string');
    expect(obj.message.length, `${label} message non-empty`).toBeGreaterThan(0);
  }

  it('normalizes bare-string, object, and null diagnostics entries into schema-legal objects', () => {
    const summary = {
      kind: 'vendor-protocol-candidate',
      title: 'PureLink RNA Mini Kit',
      steps: [{ stepNumber: 1, text: 'Lyse the sample.' }],
      // Exactly what the real model emits: bare strings, plus a well-formed
      // object, a partial object, a number, and a null entry.
      diagnostics: [
        'PBS is listed under materials but is not used in the purification procedure.',
        'Incubation equipment for the 55 degrees C step is not specified.',
        { severity: 'error', code: 'MISSING_STEP', message: 'Step 7 has no action verb.' },
        { code: 'PARTIAL_DIAG', message: 'Missing severity — adapter fills warning.' },
        { severity: 'bogus-severity', code: 'BAD_ENUM', message: 'Invalid enum severity.' },
        42,
        null,
      ],
    } as unknown as Parameters<typeof adaptAiChunkCandidateToRecordPayload>[0];

    const payload = adaptAiChunkCandidateToRecordPayload(summary, meta);
    const diagnostics = payload.diagnostics as Array<Record<string, unknown>>;
    expect(Array.isArray(diagnostics)).toBe(true);

    // Every single entry — normalized or passed through — is schema-legal.
    diagnostics.forEach((d, i) => assertSchemaLegalDiagnostic(d, `diagnostics[${i}]`));

    // Bare strings survive VERBATIM as message, with the shape-filler defaults.
    const byMessage = new Map(diagnostics.map((d) => [d.message, d]));
    const first = byMessage.get('PBS is listed under materials but is not used in the purification procedure.');
    expect(first, 'bare string 1 must survive verbatim as message').toBeDefined();
    expect(first!.severity).toBe('warning');
    expect(first!.code).toBe('MODEL_DIAGNOSTIC');
    const second = byMessage.get('Incubation equipment for the 55 degrees C step is not specified.');
    expect(second, 'bare string 2 must survive verbatim as message').toBeDefined();
    expect(second!.severity).toBe('warning');
    expect(second!.code).toBe('MODEL_DIAGNOSTIC');

    // Well-formed object passes through as-is (identity of its three fields).
    const passthrough = byMessage.get('Step 7 has no action verb.');
    expect(passthrough).toBeDefined();
    expect(passthrough!.severity).toBe('error');
    expect(passthrough!.code).toBe('MISSING_STEP');

    // Partial object: missing severity filled with warning, own code kept.
    const partial = byMessage.get('Missing severity — adapter fills warning.');
    expect(partial).toBeDefined();
    expect(partial!.severity).toBe('warning');
    expect(partial!.code).toBe('PARTIAL_DIAG');

    // Invalid enum severity: filled honestly to warning, code/message kept.
    const badEnum = byMessage.get('Invalid enum severity.');
    expect(badEnum).toBeDefined();
    expect(badEnum!.severity).toBe('warning');
    expect(badEnum!.code).toBe('BAD_ENUM');

    // Number primitive: stringified into message with the default code/severity.
    const num = byMessage.get('42');
    expect(num, 'number primitive must stringify into message').toBeDefined();
    expect(num!.severity).toBe('warning');
    expect(num!.code).toBe('MODEL_DIAGNOSTIC');

    // null entry: dropped — no null survives into the payload.
    expect(diagnostics.some((d) => d === null)).toBe(false);

    // The honesty marker is still there (fix1 behavior preserved).
    expect(diagnostics.some((d) => d.code === AI_CHUNK_ANCHORS_APPROXIMATE)).toBe(true);
  });

  it('object entry with no usable message gets an honest non-empty fallback (never fabricated protocol truth)', () => {
    const summary = {
      kind: 'vendor-protocol-candidate',
      title: 'T',
      steps: [{ stepNumber: 1, text: 'Mix.' }],
      diagnostics: [
        { severity: 'info', code: 'CODE_ONLY_DIAG' },
        { severity: 'warning' },
      ],
    } as unknown as Parameters<typeof adaptAiChunkCandidateToRecordPayload>[0];

    const payload = adaptAiChunkCandidateToRecordPayload(summary, meta);
    const diagnostics = payload.diagnostics as Array<Record<string, unknown>>;
    diagnostics.forEach((d, i) => assertSchemaLegalDiagnostic(d, `diagnostics[${i}]`));

    // code-only object: message falls back to a rendering that names its code.
    const codeOnly = diagnostics.find((d) => d.code === 'CODE_ONLY_DIAG');
    expect(codeOnly).toBeDefined();
    expect(codeOnly!.severity).toBe('info');
    expect(String(codeOnly!.message)).toContain('CODE_ONLY_DIAG');

    // No code, no message: fixed honest filler, default code.
    const bare = diagnostics.find((d) => d.code === 'MODEL_DIAGNOSTIC' && d.severity === 'warning' && d.code !== AI_CHUNK_ANCHORS_APPROXIMATE);
    expect(bare, 'code-less object must get the default code').toBeDefined();
    expect(String(bare!.message).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// VPDF-3 fix2 (live-lap finding): the SAME shape defect class hits per-step
// `notes`. The real model emits notes as a BARE STRING (e.g. "Two temperature
// devices are set to 55°C and 70°C.") where the schema requires an array of
// strings — Ajv2020 answered /steps/N notes "must be array" for all 16 real
// steps. Same adapter seam, same normalization principle.
// ---------------------------------------------------------------------------

describe('adaptAiChunkCandidateToRecordPayload: step notes normalization (fix2)', () => {
  const meta = {
    documentId: 'VPDF-NOTES-DOC',
    filename: 'purelink.pdf',
    pageCount: 1,
    fallbackTitle: 'PureLink',
  };

  it('bare-string, empty-string, null, and array notes all become string arrays', () => {
    const summary = {
      kind: 'vendor-protocol-candidate',
      title: 'T',
      steps: [
        { stepNumber: 1, text: 's1', notes: 'Two temperature devices are set to 55 degrees C and 70 degrees C.' },
        { stepNumber: 2, text: 's2', notes: '' },
        { stepNumber: 3, text: 's3', notes: null },
        { stepNumber: 4, text: 's4', notes: ['already an array'] },
        { stepNumber: 5, text: 's5' },
      ],
    } as unknown as Parameters<typeof adaptAiChunkCandidateToRecordPayload>[0];

    const payload = adaptAiChunkCandidateToRecordPayload(summary, meta);
    const steps = payload.steps as Array<Record<string, unknown>>;
    for (const step of steps) {
      expect(Array.isArray(step.notes), `step ${step.stepNumber} notes must be an array`).toBe(true);
      (step.notes as unknown[]).forEach((n) => expect(typeof n).toBe('string'));
    }
    // The model's note survives verbatim as the single array entry.
    expect(steps[0]!.notes).toEqual(['Two temperature devices are set to 55 degrees C and 70 degrees C.']);
    // Empty string / null / missing -> empty array (no fabricated content).
    expect(steps[1]!.notes).toEqual([]);
    expect(steps[2]!.notes).toEqual([]);
    expect(steps[3]!.notes).toEqual(['already an array']);
    expect(steps[4]!.notes).toEqual([]);
  });
});
