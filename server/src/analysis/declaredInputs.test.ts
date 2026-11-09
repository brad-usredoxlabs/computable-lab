/**
 * declaredInputs (FAME-7) — the generic declared-input validation interpreter.
 *
 * One test per W4 rule + the OQ-3 named skip + the OQ-4 policy failure.
 * Fixtures use GENERIC slot/artifact names (TEST-scoped ids; the domain value
 * strings that appear are fixture VALUES in test files only — R8 keeps TS
 * free of them).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadInputKindsPolicy, validateDeclaredInputs, type RunInputs, type DeclaredInput } from './declaredInputs.js';

/** A minimal store stub: id → payload (null ⇒ unresolvable). `list` returns
 *  the same payloads filtered by kind — the seam D3's data-reference name
 *  gate uses to resolve the producer artifact a DREF links. */
function storeWith(entries: Record<string, Record<string, unknown>> | null): {
  get: (id: string) => Promise<{ recordId: string; schemaId: string; payload: unknown; meta: Record<string, unknown> } | null>;
  list: (filter?: { kind?: string }) => Promise<{ recordId: string; schemaId: string; payload: unknown; meta: Record<string, unknown> }[]>;
} {
  const map = new Map<string, Record<string, unknown>>();
  for (const [id, payload] of Object.entries(entries)) {
    if (payload) map.set(id, payload);
  }
  const env = (id: string) => ({
    recordId: id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/test.schema.yaml',
    payload: map.get(id),
    meta: {},
  });
  return {
    get: async (id: string) => (map.has(id) ? env(id) : null),
    list: async (filter) => {
      const out: ReturnType<typeof env>[] = [];
      for (const [id, payload] of map.entries()) {
        if (filter?.kind && payload.kind !== filter.kind) continue;
        out.push(env(id));
      }
      return out;
    },
  };
}

/** A DREF-shaped input value as it appears in the run-create BODY: a RECORD
 *  REF to a data-reference record ({kind:'record', id, type}) — the ratified
 *  FAME-7 body shape (OQ-3). The resolved record itself is kind
 *  'data-reference'; the ref that binds it is not. */
const DREF = (id: string, _dataKind = 'table') => ({ kind: 'record', id, type: 'data-reference' } as const);
const AOUT_REF = (id: string) => ({ kind: 'record', id, type: 'analysis-output-artifact' } as const);

describe('validateDeclaredInputs — OQ-3 named skip + W4 rejection set', () => {
  it('skips validation for a revision with no inputs declaration (the OQ-3 named, documented, unit-tested skip)', async () => {
    // ABSENT `inputs` key ⇒ no contract ⇒ any body passes exactly as before
    // the gate existed (legacy flow byte-identical; no new rejection token).
    const store = storeWith({});
    await expect(validateDeclaredInputs(store, { kind: 'analysis-revision', id: 'ANREV-LEGACY' }, {
      anything: DREF('DREF-TEST-1'),
    })).resolves.toBeUndefined();
  });

  it('an EMPTY inputs array means "no inputs" — any body input is INPUT_UNDECLARED (absent vs empty-array is semantic, NOT collapsed)', async () => {
    const store = storeWith({});
    // `inputs` PRESENT as an EMPTY array ⇒ the contract IS "no inputs" (OQ-3):
    // any body input is undeclared. (Distinct from the ABSENT-key skip above.)
    const payload = { kind: 'analysis-revision', id: 'ANREV-EMPTY', inputs: [] };
    await expect(validateDeclaredInputs(store, payload, {
      anything: DREF('DREF-TEST-1'),
    })).rejects.toMatchObject({ code: 'INPUT_UNDECLARED' });
    // but an empty body passes (the contract IS no inputs).
    await expect(validateDeclaredInputs(store, payload, {})).resolves.toBeUndefined();
  });

  it('a LEGACY revision with a NON-EMPTY inputs array (no FAME-7 keys) is validated FULLY (OQ-3: presence of the key, not the new keys, is the contract marker)', async () => {
    const store = storeWith({});
    // Legacy slot shape: name + dataKind + required ONLY (no acceptsKinds /
    // no acceptedArtifactNames) — exactly the ANREV-000017/000018 shape.
    const legacy = {
      kind: 'analysis-revision', id: 'ANREV-LEGACY-SLOTS',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, description: 'a legacy declared slot' }],
    };
    // (a) an UNDECLARED body key is rejected — the pre-FAME-7 broadened skip
    //     (the defect 4 behavior) is gone.
    await expect(validateDeclaredInputs(store, legacy, {
      not_declared: DREF('DREF-TEST-1'),
    })).rejects.toMatchObject({ code: 'INPUT_UNDECLARED', message: expect.stringContaining('left_table') });
    // (b) an omitted REQUIRED slot is rejected.
    await expect(validateDeclaredInputs(store, legacy, {})).rejects.toMatchObject({ code: 'INPUT_REQUIRED_MISSING' });
    // (c) the declared slot itself, bound by a resolvable DREF, PASSES
    //     (legacy slots without acceptsKinds fall back to the CONFIG gate —
    //     data-reference is admitted by the shipped inputKinds).
    const store2 = storeWith({ 'DREF-TEST-1': { kind: 'data-reference', id: 'DREF-TEST-1', dataKind: 'table' } });
    await expect(validateDeclaredInputs(store2, legacy, {
      left_table: DREF('DREF-TEST-1'),
    })).resolves.toBeUndefined();
  });

  it('a data-reference ref is NAME-GATED via its linked producer artifact (D3: a wrong-producer DREF is INPUT_ARTIFACT_NAME_MISMATCH, not a silent pass)', async () => {
    // DREF-TEST-2 links AOUT-TEST-2 (producer name 'some_other_summary') —
    // the DREF record itself carries no name, so the gate must resolve the
    // linked artifact to name the violation.
    const store = storeWith({
      'DREF-TEST-2': { kind: 'data-reference', id: 'DREF-TEST-2', dataKind: 'table' },
      'AOUT-TEST-2': { kind: 'analysis-output-artifact', id: 'AOUT-TEST-2', name: 'some_other_summary', dataKind: 'table', dataReferenceRef: { kind: 'record', id: 'DREF-TEST-2', type: 'data-reference' } },
    });
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-TEST-2'),
    })).rejects.toMatchObject({ code: 'INPUT_ARTIFACT_NAME_MISMATCH', message: expect.stringContaining('right_summary') });
  });

  it('a data-reference ref whose producer artifact MATCHES the accepted names passes the name gate (D3: the fix gates, it does not reject the ratified channel)', async () => {
    const store = storeWith({
      'DREF-TEST-3': { kind: 'data-reference', id: 'DREF-TEST-3', dataKind: 'table' },
      'AOUT-TEST-3': { kind: 'analysis-output-artifact', id: 'AOUT-TEST-3', name: 'right_summary', dataKind: 'table', dataReferenceRef: { kind: 'record', id: 'DREF-TEST-3', type: 'data-reference' } },
    });
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-TEST-3'),
    })).resolves.toBeUndefined();
  });

  it('a data-reference ref into a name-gated slot that RESOLVES but NO artifact links it is INPUT_LINK_UNPROVABLE (D15 fix run 2: the record resolves — it is the LINK that is unprovable; INPUT_UNRESOLVABLE is reserved for a ref id that does not resolve)', async () => {
    // The DREF resolves (get finds it) but no listed artifact links it. The
    // pre-fix code reported this as INPUT_UNRESOLVABLE (404) — misleading, a
    // 404 for a record that DOES resolve. The fix names the distinct failure:
    // the producer artifact NAME cannot be proven via the dataReferenceRef
    // link (INPUT_LINK_UNPROVABLE, 404 — ratified by orch ruling R4 / the
    // module comment; the pinned test is the second leg).
    const store = storeWith({
      'DREF-TEST-4': { kind: 'data-reference', id: 'DREF-TEST-4', dataKind: 'table' },
    });
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] }],
    };
    const err = await validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-TEST-4'),
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INPUT_LINK_UNPROVABLE', statusCode: 404 });
  });

  it('a name-gated slot bound by an UNRESOLVABLE ref id is INPUT_UNRESOLVABLE, NOT INPUT_LINK_UNPROVABLE (D15: the strict boundary — the ref itself must not resolve for that token)', async () => {
    // The id does not resolve at all (store.get null) — the (v) leg fires
    // before the name gate can be reached: INPUT_UNRESOLVABLE (404). This
    // pins that the D15 rename did not bleed into the genuinely-missing case.
    const store = storeWith({});
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] }],
    };
    const err = await validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-BOGUS-404'),
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INPUT_UNRESOLVABLE', statusCode: 404 });
  });

  it('declares INPUT_CONTRACT_MALFORMED (500) when `inputs` is present but not an array (the ratified named 500 — D10)', async () => {
    const store = storeWith({});
    const err = await validateDeclaredInputs(store, {
      kind: 'analysis-revision', id: 'ANREV-TEST-MALFORMED', inputs: { not: 'an array' },
    }, {}).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INPUT_CONTRACT_MALFORMED', statusCode: 500 });
  });

  it('rejects an undeclared input name (INPUT_UNDECLARED) naming the declared names', async () => {
    const store = storeWith({});
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] }] satisfies DeclaredInput[],
    };
    await expect(validateDeclaredInputs(store, payload, {
      not_declared: DREF('DREF-TEST-1'),
    })).rejects.toMatchObject({ code: 'INPUT_UNDECLARED', message: expect.stringContaining('left_table') });
  });

  it('declares INPUT_REQUIRED_MISSING when a required slot is absent from the body', async () => {
    const store = storeWith({});
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {})).rejects.toMatchObject({ code: 'INPUT_REQUIRED_MISSING' });
  });

  it('declares INPUT_NOT_RECORD_REF when the ref is not a record ref', async () => {
    const store = storeWith({});
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: { kind: 'inline', id: 'x', type: 'data-reference' } as unknown as RunInputs[string],
    })).rejects.toMatchObject({ code: 'INPUT_NOT_RECORD_REF' });
  });

  it('declares INPUT_KIND_NOT_ACCEPTED when the slot declares its own acceptsKinds (OQ-4 precedence — no intersection)', async () => {
    const store = storeWith({});
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: AOUT_REF('AOUT-TEST-1'),
    })).rejects.toMatchObject({ code: 'INPUT_KIND_NOT_ACCEPTED', message: expect.stringContaining('data-reference') });
  });

  it('falls back to the CONFIG inputKinds gate when a slot declares no acceptsKinds (OQ-4 per-call read)', async () => {
    const store = storeWith({});
    // The slot declares a FAME-7 key (acceptedArtifactNames) so the revision is
    // VALIDATED (not the named legacy skip), but declares NO acceptsKinds — so
    // the kind gate falls back to the per-call CONFIG inputKinds read. The
    // bound ref is a non-artifact record type, so the name gate never fires
    // (artifact-typed refs only); the test isolates the config kind fallback.
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptedArtifactNames: ['some_summary'] }],
    };
    // The shipped config set is [data-reference, analysis-output-artifact] —
    // an unrelated record type is rejected and the message NAMES the source.
    await expect(validateDeclaredInputs(store, payload, {
      left_table: { kind: 'record', id: 'DREF-TEST-1', type: 'analysis-run' },
    })).rejects.toMatchObject({
      code: 'INPUT_KIND_NOT_ACCEPTED',
      message: expect.stringContaining('config/drafting/analysis-composition.yaml inputKinds'),
    });
  });

  it('declares INPUT_UNRESOLVABLE (404) when the ref id does not resolve', async () => {
    const store = storeWith({});
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] }],
    };
    const err = await validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-BOGUS-999'),
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INPUT_UNRESOLVABLE', statusCode: 404 });
  });

  it('declares INPUT_ARTIFACT_NAME_MISMATCH when the resolved artifact name is not accepted (acceptedArtifactNames gate)', async () => {
    const store = storeWith({
      'AOUT-TEST-1': { kind: 'analysis-output-artifact', id: 'AOUT-TEST-1', name: 'some_other_summary', dataKind: 'table' },
    });
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: AOUT_REF('AOUT-TEST-1'),
    })).rejects.toMatchObject({ code: 'INPUT_ARTIFACT_NAME_MISMATCH', message: expect.stringContaining('right_summary') });
  });

  it('declares INPUT_DATAKIND_INCOMPATIBLE when the resolved dataKind conflicts with the declared one', async () => {
    const store = storeWith({
      'DREF-TEST-SIG': { kind: 'data-reference', id: 'DREF-TEST-SIG', dataKind: 'signal' },
    });
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [{ name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] }],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-TEST-SIG'),
    })).rejects.toMatchObject({ code: 'INPUT_DATAKIND_INCOMPATIBLE' });
  });

  it('passes a fully satisfied body (the declared contract is met end-to-end)', async () => {
    const store = storeWith({
      'DREF-TEST-1': { kind: 'data-reference', id: 'DREF-TEST-1', dataKind: 'table' },
      'AOUT-TEST-9': { kind: 'analysis-output-artifact', id: 'AOUT-TEST-9', name: 'right_summary', dataKind: 'table' },
    });
    const payload = {
      kind: 'analysis-revision', id: 'ANREV-TEST-D',
      inputs: [
        { name: 'left_table', dataKind: 'table', required: true, acceptsKinds: ['data-reference'] },
        { name: 'right_table', dataKind: 'table', required: true, acceptedArtifactNames: ['right_summary'] },
      ],
    };
    await expect(validateDeclaredInputs(store, payload, {
      left_table: DREF('DREF-TEST-1'),
      right_table: AOUT_REF('AOUT-TEST-9'),
    })).resolves.toBeUndefined();
  });
});

describe('loadInputKindsPolicy — OQ-4 named 500 on a missing policy', () => {
  it('reads the config set per call (no process cache)', () => {
    expect(loadInputKindsPolicy()).toEqual(['data-reference', 'analysis-output-artifact']);
    expect(loadInputKindsPolicy()).toEqual(['data-reference', 'analysis-output-artifact']);
  });

  it('declares INPUT_POLICY_UNDECLARED (500) when the file is missing — never a silent empty-set default', () => {
    const missing = new URL('file:///nonexistent-fame7-test/analysis-composition.yaml');
    expect(() => loadInputKindsPolicy(missing)).toThrowError(
      expect.objectContaining({ code: 'INPUT_POLICY_UNDECLARED', statusCode: 500 }),
    );
  });

  it('declares INPUT_POLICY_UNDECLARED (500) when the file exists but declares no inputKinds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fame7-policy-'));
    const path = join(dir, 'analysis-composition.yaml');
    writeFileSync(path, 'revisionKinds: [analysis-revision]\nrunKinds: [analysis-run]\n');
    try {
      expect(() => loadInputKindsPolicy(new URL(`file://${path}`))).toThrowError(
        expect.objectContaining({ code: 'INPUT_POLICY_UNDECLARED', statusCode: 500 }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
