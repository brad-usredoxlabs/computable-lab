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
    const broken = { kind: 'oligo-order-draft', rows: [{ sequence: 'ACGT' }] };
    const { calls, llmClient } = stubClient((i) => (i === 0 ? JSON.stringify(broken) : JSON.stringify(VALID_DRAFT)));
    const result = await readOligoOrderWithAi('text', { llmClient, model: 'test-model' });
    expect(calls).toHaveLength(2);
    // The repair QUOTES the diagnostic — never a silent repair (spec §15.2).
    const repairPrompt = calls[1]!.messages.map((m) => m.content ?? '').join('\n');
    expect(repairPrompt).toContain('rejected');
    expect(repairPrompt).toMatch(/Missing required property: name/);
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
});
