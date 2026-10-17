/**
 * OLIGO-AI-2 — the AI producer contract (spec §10 Commit 1, plan Task 3).
 *
 * Structural RED: server/src/sequences/oligoOrderAiRead.ts is absent.
 * Stub client ONLY — zero model calls, zero network. The arms pin:
 *  (a) a schema-valid draft is lowered by the REAL lowerer (one compiler,
 *      two producers), the model is forwarded verbatim, the response_format
 *      is present, and the system message IS the prompt file (prompt-as-DATA);
 *  (b) prose twice -> exactly TWO calls, never a third, honest refusal;
 *  (c) invalid draft -> the ONE repair re-ask QUOTES the validation diagnostic;
 *  (d) fabricated shape -> refused by Ajv via the pinned $id, the error quotes
 *      the offending path.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CompletionRequest } from '../ai/types.js';
import {
  OLIGO_DRAFT_SCHEMA_ID,
  readOligoOrderWithAi,
  type OligoAiReadClient,
} from './oligoOrderAiRead.js';

// The pinned $id is imported, never re-derived (spec §15.12): a typo'd id
// makes validate(x, id) throw 'Schema not found' in production while a
// hand-built validator still passes.
const DRAFT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml';

// REPO_ROOT pattern (not cwd-relative): server/schema is a gitignored symlink.
const REPO_ROOT = resolve(process.cwd(), '..');

function stubClient(respond: (callIndex: number, req: CompletionRequest) => string) {
  const calls: CompletionRequest[] = [];
  const llmClient: OligoAiReadClient = {
    complete: async (req) => {
      const content = respond(calls.length, req);
      calls.push(req);
      return { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] };
    },
  };
  return { calls, llmClient };
}

const VALID_DRAFT = {
  kind: 'oligo-order-draft',
  vendor: 'Thermo Fisher',
  declaredRowCount: 2,
  rows: [
    {
      name: 'Oformi_1784_ABY',
      sequence: 'ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY',
      modifications: [
        { label: 'ABY', role: 'reporter', position: '5-prime' },
        { label: 'QSY', role: 'quencher', position: '3-prime' },
      ],
      sourceQuote: '30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM',
    },
    { name: 'Buulg_934_VIC', sequence: null, unreadable: true, sourceQuote: '10 Pass Buulg 934 VIC [VIC-…' },
  ],
};

// Gate-3 fixture (OLIGO-AI-3 D1'): the model's REAL call-1 output on the
// Thermo PDF (jobId ING-OTHER-9Z60CH) from
// /home/brad/.hermes/cl/receipts/OLIGO-AI-3/20261013T1240/raw-model-probe.txt,
// with the probe-captured refusal shape on the garbled 4th row
// ({"name": null, "sequence": null, "unreadable": true, …} plus the
// concentrationUM/buffer nulls that produced
// /rows/3/concentrationUM: Expected type: number; /rows/3/buffer: Expected type: string).
const GARBLED_ROW_DRAFT = {
  kind: 'oligo-order-draft',
  vendor: 'Applied Biosystems',
  orderId: '8493629',
  declaredRowCount: 4,
  rows: [
    { name: 'Zanumulumwm:Qu', sequence: 'Cyanine 5-GGC TAA TGA GAA GCT TGA TGC CGA AGG AC-QSY2', yieldPmol: 357350, mass: 10422.49, purification: 'Pass', concentrationUM: 100, buffer: '1 x TE Buffer', sourceQuote: '10 Pass Zanumulumwm:Qu Cyanine 5-GGC TAA TGA GAA GCT TGA TGC CGA AGG AC-QSY2 29 357350 10422.49 Pass 6000 100ul' },
    { name: 'Akk_GA4_1617ABY', sequence: '6FAM-GTC ACC GCC GAY CAG GAR GAA GG-QSY', yieldPmol: 314470, mass: 8494.92, purification: 'Pass', concentrationUM: 100, buffer: '1 x TE Buffer', sourceQuote: '30 Pass Akk_GA4_1617ABY |6FAM-GTC ACC GCC GAY CAG GAR GAA GG-QSY 23 314470 8494.92 Pass 6000 100ul' },
    { name: 'Praus_1686_ABY', sequence: '6FAM-GGC CCC AAC ATC GGT CTG ATC TCC-QSY', yieldPmol: 288510, mass: 86365, purification: 'Pass', concentrationUM: 100, buffer: '1. TE Buffer', sourceQuote: '50 Pass Praus_1686_ABY |6FAM-GGC CCC AAC ATC GGT CTG ATC TCC-QSY 24 288510 86365 Pass 6000 100y' },
    { name: null, sequence: null, unreadable: true, concentrationUM: null, buffer: null, sourceQuote: '70 Pass RtorqGA4_1813_CY5 |Cyanine 5-GCA CAG GCG AAT ACA CCG CTT GAT G-QSY2 25 296620 9082.61 Pass 6000' },
  ],
};

describe('oligo AI read producer (oligoOrderAiRead)', () => {
  it('(a) lowers a schema-valid draft through the REAL lowerer, forwards the model verbatim, and sends the prompt file as the system message', async () => {
    const promptText = readFileSync(join(REPO_ROOT, 'server', 'prompts', 'oligo-order-draft.md'), 'utf8');
    expect(promptText.length).toBeGreaterThan(0);
    expect(promptText).toContain('oligo-order-draft');

    const { calls, llmClient } = stubClient(() => JSON.stringify(VALID_DRAFT));
    const result = await readOligoOrderWithAi('ORDER ID: 8493364\n'.repeat(80), {
      llmClient,
      model: 'test-model',
      maxContextChars: 100,
    });

    expect(result.error, result.error ?? '').toBeUndefined();
    expect(result.draft?.rows).toHaveLength(2);
    // Rows come from oligoRowsFromDraft — the same lowering the regex
    // extractor produces (dye tokens stripped by the config pattern table).
    expect(result.rows.map((r) => r.label)).toEqual(['Oformi_1784_ABY', 'Buulg_934_VIC']);
    expect(result.rows[0]?.residues).toBe('CACCGTATCGCAAGGTTGTCGACAGTCA');
    expect(result.rows[0]?.modifications.map((m) => m.label)).toEqual(['ABY', 'QSY']);
    // The unreadable arm rides the lowerer: visible, honest, never invented bases.
    expect(result.rows[1]?.issues.length).toBeGreaterThan(0);
    expect(result.rows[1]?.residues).toBe('');

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    // Model forwarded verbatim — no default, no hardcoded model id.
    expect(req.model).toBe('test-model');
    // Schema-constrained completion is requested (OQ1: json_object shipped).
    expect(req.response_format).toBeDefined();
    // Prompt-as-DATA: the system message IS the prompt file content.
    expect(req.messages[0]?.role).toBe('system');
    expect(req.messages[0]?.content).toBe(promptText);
    // maxContextChars truncates the document excerpt.
    expect(req.messages[1]!.content!.length).toBeLessThan(300);
  });

  it('(b) prose twice: exactly TWO calls (never a third), rows empty, honest refusal', async () => {
    const { calls, llmClient } = stubClient(() => 'I think the primers are probably ACGT-ish?');
    const result = await readOligoOrderWithAi('some vendor text', { llmClient, model: 'test-model' });
    // Call-count-pinned, not outcome-pinned (spec §15.1: bound 3 or while() must fail here).
    expect(calls).toHaveLength(2);
    expect(result.rows).toEqual([]);
    expect(result.draft).toBeNull();
    expect(result.error).toMatch(/did not produce a valid oligo-order-draft/);
    // The refusal quotes the real parse diagnostic, never a generic 500.
    expect(result.error).toContain('not JSON');
  });

  it('(c) invalid draft once, valid on retry: the ONE repair re-ask quotes the validation diagnostic', async () => {
    // D1' relaxation: `name` is no longer a REQUIRED key, but a PRESENT name
    // must still be a non-empty string — an empty-string name is the
    // placeholder the contract forbids. This row pins that diagnostic.
    const broken = { kind: 'oligo-order-draft', rows: [{ name: '', sequence: 'ACGT', sourceQuote: 'x' }] };
    const { calls, llmClient } = stubClient((i) => (i === 0 ? JSON.stringify(broken) : JSON.stringify(VALID_DRAFT)));
    const result = await readOligoOrderWithAi('text', { llmClient, model: 'test-model' });
    expect(calls).toHaveLength(2);
    // The repair QUOTES the diagnostic — never a silent repair (spec §15.2).
    const repairPrompt = calls[1]!.messages.map((m) => m.content ?? '').join('\n');
    expect(repairPrompt).toContain('rejected');
    expect(repairPrompt).toMatch(/\/rows\/0\/name: Must be at least 1 characters/);
    expect(result.error, result.error ?? '').toBeUndefined();
    expect(result.rows.map((r) => r.label)).toEqual(['Oformi_1784_ABY', 'Buulg_934_VIC']);
  });

  it('(d) fabricated shape: rejected by Ajv via the pinned $id, the error quotes the offending path', async () => {
    // Validation-by-$id: the module's exported id literal must BE the pinned
    // schema $id, or production validation throws 'Schema not found'.
    expect(OLIGO_DRAFT_SCHEMA_ID).toBe(DRAFT_SCHEMA_ID);
    const fabricated = { rows: [{ name: 'x', bases: 'ACGT' }] };
    const { calls, llmClient } = stubClient(() => JSON.stringify(fabricated));
    const result = await readOligoOrderWithAi('text', { llmClient, model: 'test-model' });
    expect(calls).toHaveLength(2);
    expect(result.rows).toEqual([]);
    expect(result.draft).toBeNull();
    // kind const fails at '/' and additionalProperties:false rejects the
    // invented `bases` key — the error quotes both paths.
    expect(result.error).toMatch(/did not produce a valid oligo-order-draft/);
    expect(result.error).toMatch(/\/rows\/0: Unknown property: bases/);
    expect(result.error).toMatch(/Missing required property: kind/);
  });

  it('(e) gate-3 garbled-row draft (name:null + concentrationUM:null + buffer:null) is accepted by the producer and lowered honestly', async () => {
    // RED for D1': gate-3 refused 3 of 4 reads of the real Thermo PDF at the
    // Ajv layer — /rows/3/name: Expected type: string,
    // /rows/3/concentrationUM: Expected type: number,
    // /rows/3/buffer: Expected type: string
    // (fixture: raw-model-probe.txt, jobId ING-OTHER-9Z60CH). The relaxed
    // producer contract must accept honest nulls and lower the row through
    // the REAL lowerer: visible, flagged, never invented bases or a guessed name.
    const { calls, llmClient } = stubClient(() => JSON.stringify(GARBLED_ROW_DRAFT));
    const result = await readOligoOrderWithAi('ORDER ID: 8493629\n'.repeat(40), { llmClient, model: 'test-model' });
    expect(result.error, result.error ?? '').toBeUndefined();
    expect(calls).toHaveLength(1); // no repair retry needed — the draft is contract-valid
    expect(result.draft?.rows).toHaveLength(4);
    expect(result.rows.map((r) => r.label)).toEqual(['Zanumulumwm:Qu', 'Akk_GA4_1617ABY', 'Praus_1686_ABY', '']);
    // The garbled 4th row: unreadable arm, name-missing issue, zero residues.
    expect(result.rows[3]?.residues).toBe('');
    expect(result.rows[3]?.issues.some((i) => i.includes('could not be read'))).toBe(true);
    expect(result.rows[3]?.issues.some((i) => i.includes('No oligo name found'))).toBe(true);
  });

  it('(f) honesty strictness survives the relaxation: a row without a verbatim sourceQuote is still refused after exactly ONE repair retry', async () => {
    // Provenance stays strict: an AI row without a quote is not honest.
    const noQuote = { ...GARBLED_ROW_DRAFT, rows: GARBLED_ROW_DRAFT.rows.map(({ sourceQuote: _q, ...rest }) => rest) };
    const { calls, llmClient } = stubClient(() => JSON.stringify(noQuote));
    const result = await readOligoOrderWithAi('text', { llmClient, model: 'test-model' });
    expect(calls).toHaveLength(2); // the single repair re-ask, never a third call
    const repairPrompt = calls[1]!.messages.map((m) => m.content ?? '').join('\n');
    expect(repairPrompt).toContain('rejected');
    expect(repairPrompt).toMatch(/Missing required property: sourceQuote/);
    expect(result.rows).toEqual([]);
    expect(result.draft).toBeNull();
    expect(result.error).toMatch(/did not produce a valid oligo-order-draft/);
    expect(result.error).toMatch(/Missing required property: sourceQuote/);
  });

  it('(g) a non-object row is still refused (row strictness preserved)', async () => {
    const brokenRow = { kind: 'oligo-order-draft', rows: ['not a row'] };
    const { calls, llmClient } = stubClient(() => JSON.stringify(brokenRow));
    const result = await readOligoOrderWithAi('text', { llmClient, model: 'test-model' });
    expect(calls).toHaveLength(2);
    expect(result.rows).toEqual([]);
    expect(result.draft).toBeNull();
    expect(result.error).toMatch(/did not produce a valid oligo-order-draft/);
    expect(result.error).toMatch(/\/rows\/0: Expected type: object/);
  });
});
