# Plan: an AI read for oligo vendor PDFs — the deterministic parser stays the compiler, the AI becomes a second producer of the same draft document

Plan file: `.hermes/plans/2026-10-11_133742-oligo-order-ai-read-fallback.md`
Target repo/worktree: a NEW worktree off **`main`** — `/mnt/vast/home/brad/git/wt/OLIGO-AI-READ-<TS>` (see Task 0 for why main, not a lane)
Surface: `/ingestion/oligo-orders` → "Primer / probe order confirmation" (`app/src/sequences/SequenceImport.tsx`, mounted by `app/src/ingestion/IngestionPage.tsx`)
Live stack for verification: backend `:3001`, frontend `:5174` (main). Never restart those — ask Brad, or use a scratch port.

---

## Goal (one sentence)

When the deterministic oligo parser cannot account for every row of a vendor order PDF, offer a one-click **AI read** that emits a validated `oligo-order-draft` document, which the **same deterministic code** lowers into the **same** candidates and the **same** review/import flow, marked honestly as AI-read.

## Current context / assumptions (all verified first-hand at `main` @ 455232cf + uncommitted working tree)

**Where the code lives.** The whole oligo path exists on `main` only. `cl/integration-2` (lane 2) has NO `oligoOrder.ts` and NO `sequenceRoutes.ts` — main's HEAD is not even an ancestor of the lane branch (`git merge-base --is-ancestor main cl/integration-2` → NO; main has 4 commits not in lane 2, lane 2 has 436 not in main). **So this work targets main.** The scientist-intent "shorthand" stack that the AI-chat work uses lives on lane 2 and is NOT available here — see Architecture.

**The deterministic pipeline** (`server/src/sequences/`):
- `POST /sequences/order` (multipart, 10 MB cap) → `ingestOligoOrder(ctx, user, filename, bytes)` (`server/src/sequences/oligoOrder.ts`).
- It extracts text with `extractPdfLayoutText` (`server/src/extract/PdfTextAdapter.ts:248`); if the text is empty and `ocr.enabled`, it rasterizes with `pdftoppm` and OCRs with `tesseract` (config-driven), then pushes the honest diagnostic `LOCAL_OCR_REVIEW`.
- `extractOligoRows(text)` (config-driven: `config/sequence-analysis/oligo-order.yaml` → `formats[]`/`namePattern`/`sequencePattern`/`sequenceNoise`/`modifications`/`metadata`) returns `OligoRow[] = {label, residues, raw, page, modifications[], issues[], metadata}`.
- Rows become ingestion envelopes via `buildIngestionJobEnvelope` / `buildIngestionArtifactEnvelope` / `buildIngestionBundleEnvelope` / `buildIngestionCandidateEnvelope` (`server/src/ingestion/records.ts`), the artifact's `text_extract.excerpt` holds the extracted text, and the response is `{jobId, artifactId, sha256, candidates, text, diagnostics, message?}`. Zero rows ⇒ `message: 'No oligo rows were recognized…'`.
- `GET /sequences/order/:id` re-reads `{jobId, text, candidates}` for the review UI.
- The app (`app/src/sequences/SequenceImport.tsx`) posts the file, renders one review card per candidate, and saves through `POST /sequences/actions` (`save_sequence` / `promote_oligo`) — that end is NOT part of this change.

**An uncommitted hardening of the deterministic parser is IN FLIGHT in main's working tree right now** (`git status` → modified: `config/sequence-analysis/oligo-order.yaml`, `server/src/sequences/oligoOrder.ts`, `server/src/sequences/oligoOrder.test.ts`; +87/−7). It adds multi-format support (`labeled-fields`, `invitrogen-order-summary`, `dye-wrapped-row`), VIC/ABY/QSY modification patterns, `sequenceNoise`, and 4 new tests. Its suite is GREEN today:

```bash
cd server && npx vitest run src/sequences/oligoOrder.test.ts
# → Test Files 1 passed (1) | Tests 6 passed (6)
```
**This plan builds ON that work — do not duplicate or revert it.** Task 0 ports it into the worktree and commits it separately.

**Why Brad's Thermo PDFs still fail — measured, not guessed.** Against the actual text Brad pasted, with the in-flight patterns:

| line | `namePattern` | `sequencePattern` |
|---|---|---|
| `30 Pass Oformi_1784_ABY \|ABY-CAC CGT … GTC A-QSY 28 365570 10137.44 …` | `Oformi_1784_ABY` ✓ | `ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY` ✓ |
| `50 Pass Oformi_1786_ABY \|ABY-CCG TAT … CAC G-QSY 28 …` | `Oformi_1786_ABY` ✓ | ✓ |
| `10 Pass Buulg 934 VIC [VIC-CCC TTC AGA AAG ACC CGA GCA ACT CTG-QSY 27 350050 9764.57 …` | `Buulg` (a misread of the name column) | **null** |

Reproduce that yourself (read-only):
```bash
node -e 'const s=/^\s*\S+\s+Pass\s+\S+\s+\|?([A-Za-z0-9\- ]+?)\s+\d+\s+\d+/i;
console.log(s.exec("10 Pass Buulg 934 VIC  [VIC-CCC TTC AGA AAG ACC CGA GCA ACT CTG-QSY 27 350050 9764.57"))'
# → null
```
The bracket form `[VIC-… -QSY]` is the immediate cause (the capture class excludes `[`/`]`), and the OCR mangles the first column around it. **The dangerous part is not the failure — it is the silence:** this document yields 2 of 3 rows and nothing says a row is missing. A biologist can review and import an incomplete order. Any fallback design must treat *partial* reads as failures, not just empty ones.

**The AI seams that already exist** (reuse these; do not invent a new model client):
- `CompletionRequest` (`server/src/ai/types.ts:49`) supports `tools` + `tool_choice` **and** `response_format: {type:'json_schema', json_schema:{name, schema}}` → a structured, schema-constrained read is directly expressible.
- The precedent for "AI reads an uploaded document and returns a draft": `server/src/api/handlers/AiIngestionHandlers.ts` (`createAiIngestionHandlers(inferenceClient, model, store)`, wired at `server/src/server.ts:1130`; it extracts layout text, truncates to `MAX_AI_CONTEXT_CHARS = 6000`, calls `inferenceClient.complete`, and parses a draft spec).
- `ChatMessage.content` is `string | null` (`server/src/ai/types.ts:16-29`) — **there is no image content part anywhere in `server/src/ai`**, so a vision read of the page images is NOT reachable without new plumbing (Stage B, below). Stage A reads TEXT.
- The configured model comes from `inferenceConfig.model` (the `/settings` choice) — never hardcode a model.

## Architecture / proposed approach

Make the AI a second **producer** of the pipeline's existing input, not a second pipeline: define a declarative draft document (`kind: oligo-order-draft`, Ajv-validated, one entry per ordered oligo with a verbatim `source_quote` and an explicit `unreadable` flag), have the model emit it through a schema-constrained completion, then lower it with a pure function (`oligoRowsFromDraft`) into the **same `OligoRow[]`** the regex extractor produces, so every downstream record, envelope, review card and save path stays byte-identical. The fallback is offered (not silently taken) whenever the deterministic read is empty **or incomplete**, and every AI-read row carries provenance plus the same verify-before-import warning the OCR path already uses.

## Step-by-step tasks

### Task 0 — Worktree off main, port the in-flight hardening, capture baselines (~10 min)

```bash
TS=$(date +%Y%m%dT%H%M)
cd /mnt/vast/home/brad/git/computable-lab
git status --short                 # confirm the 3 modified oligo files are the only relevant dirt
git diff > /tmp/oligo-hardening-${TS}.patch
git worktree add /mnt/vast/home/brad/git/wt/OLIGO-AI-READ-${TS} -b cl/oligo-ai-read-${TS} main
cd /mnt/vast/home/brad/git/wt/OLIGO-AI-READ-${TS}
git apply --check /tmp/oligo-hardening-${TS}.patch && git apply /tmp/oligo-hardening-${TS}.patch
cd server && npx vitest run src/sequences/oligoOrder.test.ts     # expect 6 passed
cd .. && git add config/sequence-analysis/oligo-order.yaml server/src/sequences/oligoOrder.ts server/src/sequences/oligoOrder.test.ts
git commit -m "chore(oligo): land the in-flight deterministic hardening (multi-format, VIC/ABY/QSY) before the AI read is added"
```
Baselines to paste into your report (zero-NEW is the gate):
```bash
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"
cd ../app && npx tsc --noEmit 2>&1 | grep -c "error TS"
cd ../server && npx vitest run src/sequences/ 2>&1 | tail -4
```
**Never commit in `/mnt/vast/home/brad/git/computable-lab` (Brad's live tree) — that is why the patch is applied in the worktree instead.**

### Task 1 — The draft document schema (RED → GREEN)

Create `schema/sequence-analysis/oligo-order-draft.schema.yaml`:

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml"
title: "OligoOrderDraft"
description: >-
  An AI-read transcription of a vendor oligo order/production document. DATA
  only: it describes WHAT the document says, one entry per ordered oligo, and
  never claims lab record identity. Lowered deterministically into the same
  rows the regex extractor produces (server/src/sequences/oligoOrderDraft.ts).
type: object
additionalProperties: false
required: [ kind, rows ]
properties:
  kind:
    const: "oligo-order-draft"
  vendor:
    type: string
    description: "Vendor as printed (e.g. 'Thermo Fisher', 'Invitrogen'), or omitted when not printed."
  orderId:
    type: string
  declaredRowCount:
    type: integer
    minimum: 0
    description: >-
      How many line items the document itself claims (an 'ITEMS'/'QTY' count or
      the highest line number). Used to detect a PARTIAL read; omit when the
      document states none.
  notes:
    type: string
  rows:
    type: array
    items:
      type: object
      additionalProperties: false
      required: [ name ]
      properties:
        name:
          type: string
          minLength: 1
          description: "The oligo's name exactly as printed (never a guess)."
        sequence:
          type: [string, "null"]
          description: >-
            Bases with 5'→3' orientation, whitespace allowed. NULL when the
            bases are not legible — an unreadable row MUST be null with
            `unreadable: true`; never invent or complete bases.
        unreadable:
          type: boolean
          description: "True when the row was seen but its bases could not be read."
        modifications:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [ label, role, position ]
            properties:
              label: { type: string }
              role: { type: string, enum: [reporter, quencher, other] }
              position: { type: string, enum: ["5-prime", "3-prime", "internal"] }
        scale:
          type: string
        purification:
          type: string
        yieldPmol:
          type: number
        mass:
          type: number
        concentrationUM:
          type: number
        buffer:
          type: string
        page:
          type: integer
          minimum: 1
        sourceQuote:
          type: string
          description: >-
            The verbatim line(s) this row was read from. Required for review:
            a human must be able to check the read against the page.
```

RED test — `server/src/schema/OligoOrderDraftSchema.test.ts` (mirror `server/src/schema/Wave2QuantitySchema.test.ts`'s loader pattern):

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { createValidator } from '../validation/AjvValidator.js';

const ID = 'https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml';
function validator() {
  const v = createValidator({ strict: false });
  v.addSchema(parseYaml(readFileSync('schema/sequence-analysis/oligo-order-draft.schema.yaml', 'utf-8')) as never, ID);
  return v;
}

describe('oligo-order-draft schema', () => {
  it('accepts a readable row with a quote', () => {
    const draft = { kind: 'oligo-order-draft', vendor: 'Thermo Fisher', rows: [
      { name: 'Oformi_1784_ABY', sequence: 'CAC CGT ATC GCA AGG TTG TCG ACA GTC A',
        modifications: [{ label: 'ABY', role: 'reporter', position: '5-prime' }],
        page: 1, sourceQuote: '30 Pass Oformi_1784_ABY |ABY-CAC CGT …' },
    ] };
    expect(validator().validate(draft, ID).valid).toBe(true);
  });

  it('accepts an explicitly unreadable row (null bases + flag)', () => {
    const draft = { kind: 'oligo-order-draft', rows: [{ name: 'Buulg_934_VIC', sequence: null, unreadable: true }] };
    expect(validator().validate(draft, ID).valid).toBe(true);
  });

  it('rejects a fabricated shape', () => {
    expect(validator().validate({ kind: 'oligo-order-draft', rows: [{ name: 'x', bases: 'ACGT' }] }, ID).valid).toBe(false);
  });
});
```
```bash
cd server && npx vitest run src/schema/OligoOrderDraftSchema.test.ts   # first run: FAIL (file missing) → after writing the YAML: 3 passed
```
Commit:
```bash
git -c core.fileMode=false add schema/sequence-analysis/oligo-order-draft.schema.yaml server/src/schema/OligoOrderDraftSchema.test.ts
git -c core.fileMode=false commit -m "feat(oligo): oligo-order-draft schema — a validated AI-read document kind (null bases + unreadable flag, verbatim source quote)"
```

### Task 2 — The lowerer: draft → the SAME `OligoRow[]` (RED → GREEN)

Create `server/src/sequences/oligoOrderDraft.ts`. It must reuse the config's `sequenceNoise` + `modifications` and `normalizeSequence` — the SAME normalization the regex path does — so both producers yield identical downstream rows.

```ts
/**
 * Deterministic lowering of an `oligo-order-draft` (an AI READ of a vendor
 * document) into the pipeline's own OligoRow[] — the exact shape
 * extractOligoRows produces. One compiler, two producers: everything
 * downstream (envelopes, review cards, save actions) is unchanged.
 *
 * Normalization is NOT re-implemented here: the declared sequenceNoise and
 * modification patterns from config/sequence-analysis/oligo-order.yaml are
 * applied with the same helper, and residues go through normalizeSequence, so
 * an AI-read row and a regex-read row are indistinguishable downstream except
 * for provenance.
 */
import { normalizeSequence, type AlphabetSpec } from './sequenceEngine.js';
import { sequenceConfig } from './sequenceRuntime.js';
import type { OligoRow } from './oligoOrder.js';

export interface OligoOrderDraftRow {
  name: string;
  sequence?: string | null;
  unreadable?: boolean;
  modifications?: Array<{ label: string; role: string; position: string }>;
  scale?: string; purification?: string; yieldPmol?: number; mass?: number;
  concentrationUM?: number; buffer?: string; page?: number; sourceQuote?: string;
}
export interface OligoOrderDraft {
  kind: 'oligo-order-draft';
  vendor?: string; orderId?: string; declaredRowCount?: number; notes?: string;
  rows: OligoOrderDraftRow[];
}

export async function oligoRowsFromDraft(draft: OligoOrderDraft): Promise<OligoRow[]> {
  const config = await sequenceConfig('oligo-order');
  const alphabets = await sequenceConfig('alphabets');
  const noise = (config.sequenceNoise as string[] | undefined) ?? [];
  const rows: OligoRow[] = [];
  for (const entry of draft.rows) {
    const metadata: Record<string, string> = {};
    if (draft.vendor) metadata.vendor = draft.vendor;
    if (draft.orderId) metadata.orderId = draft.orderId;
    if (entry.scale) metadata.synthesisScale = entry.scale;
    if (entry.purification) metadata.purification = entry.purification;
    const row: OligoRow = {
      label: entry.name.trim(),
      residues: '',
      raw: entry.sequence ?? '',
      page: entry.page ?? 1,
      modifications: (entry.modifications ?? []).map((m) => ({ label: m.label, role: m.role, position: m.position })),
      issues: [],
      metadata,
    };
    if (entry.unreadable || entry.sequence == null || entry.sequence.trim() === '') {
      row.issues.push('The bases of this row could not be read from the document. Type them in from the page before importing.');
      rows.push(row);
      continue;
    }
    let bases = entry.sequence;
    for (const pattern of noise) bases = bases.replace(new RegExp(pattern, 'i'), '');
    // The same 5'/3' trim the regex path applies.
    bases = bases.replace(/^\s*5\s*['′’]?\s*[-–]?/, '').replace(/[-–]?\s*3\s*['′’]?\s*$/, '');
    for (const mod of config.modifications as Array<{ pattern: string; label: string; role: string; position: string }>) {
      const regex = new RegExp(mod.pattern, 'gi');
      if (regex.test(bases)) { row.modifications.push({ label: mod.label, role: mod.role, position: mod.position }); bases = bases.replace(new RegExp(mod.pattern, 'gi'), ''); }
    }
    try { row.residues = normalizeSequence(bases, alphabets.iupac_dna as AlphabetSpec); }
    catch (err) { row.residues = bases.replace(/\s+/g, ''); row.issues.push((err as Error).message); }
    rows.push(row);
  }
  return rows;
}
```

RED test — `server/src/sequences/oligoOrderDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { oligoRowsFromDraft } from './oligoOrderDraft.js';

describe('oligo-order-draft lowering', () => {
  it('lowers a readable row, stripping the declared dye patterns', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', vendor: 'Thermo Fisher', rows: [
      { name: 'Oformi_1784_ABY', sequence: 'ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY', page: 1 },
    ] });
    expect(rows[0]?.residues).toBe('CACCGTATCGCAAGGTTGTCGACAGTCA');
    expect(rows[0]?.modifications.map((m) => m.label)).toEqual(['ABY', 'QSY']);
    expect(rows[0]?.issues).toEqual([]);
    expect(rows[0]?.metadata.vendor).toBe('Thermo Fisher');
  });

  it('keeps an unreadable row visible with an issue instead of inventing bases', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Buulg_934_VIC', sequence: null, unreadable: true, page: 1 },
    ] });
    expect(rows[0]?.residues).toBe('');
    expect(rows[0]?.issues.join(' ')).toMatch(/could not be read/);
  });

  it('normalizes to the same residues the regex path produces for the same line', async () => {
    const rows = await oligoRowsFromDraft({ kind: 'oligo-order-draft', rows: [
      { name: 'Oformi_1786_ABY', sequence: 'ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY' },
    ] });
    expect(rows[0]?.residues).toBe('CCGTATCGCAAGGTTGTCGACAGTCACG');
  });
});
```
```bash
cd server && npx vitest run src/sequences/oligoOrderDraft.test.ts   # FAIL → implement → 3 passed
```
Commit:
```bash
git -c core.fileMode=false add server/src/sequences/oligoOrderDraft.ts server/src/sequences/oligoOrderDraft.test.ts
git -c core.fileMode=false commit -m "feat(oligo): deterministic lowering of an oligo-order-draft into the pipeline's own OligoRow[] (no second normalizer)"
```

### Task 3 — The AI producer (prompt DATA + schema-constrained completion + one repair retry)

3a. Prompt DATA — create `server/prompts/oligo-order-draft.md`:

```markdown
# Oligo order draft — read a vendor document into DATA

You read the TEXT of a vendor oligo/primer order or production document and
transcribe it into ONE `oligo-order-draft` object. You never invent bases, never
normalize spelling, never decide lab identity.

Rules:
1. ONE row per ordered oligo, in document order. If the document lists N items
   (QTY, ITEMS, or the highest line number), set `declaredRowCount` to N.
2. `name` is the oligo name EXACTLY as printed, including vendor prefixes
   ("Oformi_1784_ABY", "Feligens_869F"). Never translate, never tidy.
3. `sequence` is the bases with 5'→3' orientation, whitespace allowed. Keep any
   dye tokens the document prints around the bases (ABY-, -QSY, [VIC-…]) — the
   deterministic lowerer strips them using the lab's own pattern table.
4. If a row's bases are NOT legible in the text, set `sequence: null` and
   `unreadable: true`. NEVER guess, complete, or reuse another row's bases.
5. `sourceQuote` = the verbatim line(s) you read the row from. A human checks the
   read against the page; without the quote the row is unverifiable.
6. Report what the document says about scale, purification, yield, mass,
   concentration and buffer; omit anything it does not print.
7. If the text is too garbled to read at all, return ONE row per visible line
   item with `sequence: null`, `unreadable: true` and the quote — an empty draft
   is worse than an honest unreadable draft.

Example (a Biosystems/IDT-style table, the text as OCR often delivers it):

    ORDER ID: 8493364
    30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM
    50 Pass Oformi_1786_ABY |ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY 28 362780 10153.44 Pass 6000 100uM

→
kind: oligo-order-draft
vendor: Thermo Fisher
orderId: "8493364"
declaredRowCount: 2
rows:
  - name: Oformi_1784_ABY
    sequence: ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY
    modifications:
      - { label: ABY, role: reporter, position: 5-prime }
      - { label: QSY, role: quencher, position: 3-prime }
    yieldPmol: 365570
    mass: 10137.44
    purification: Pass
    concentrationUM: 100
    sourceQuote: "30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM"
  - name: Oformi_1786_ABY
    sequence: ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY
    sourceQuote: "50 Pass Oformi_1786_ABY |ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY 28 362780 10153.44 Pass 6000 100uM"
```

3b. Producer — create `server/src/sequences/oligoOrderAiRead.ts`:

```ts
/**
 * The AI READ producer for oligo vendor documents (the fallback path).
 *
 * The model is handed the extracted text plus the draft contract and must answer
 * with a schema-constrained `oligo-order-draft` (response_format json_schema —
 * Ajv is still the authority afterwards: a draft that fails validation is
 * re-asked ONCE with the errors quoted, then reported honestly, never repaired
 * silently). The result is lowered by oligoRowsFromDraft — the SAME rows the
 * regex extractor produces.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createValidator } from '../validation/AjvValidator.js';
import { parse as parseYaml } from 'yaml';
import type { CompletionRequest } from '../ai/types.js';
import { oligoRowsFromDraft, type OligoOrderDraft } from './oligoOrderDraft.js';
import type { OligoRow } from './oligoOrder.js';

export const OLIGO_DRAFT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml';

export interface OligoAiReadClient { complete(req: CompletionRequest): Promise<{ choices?: Array<{ message: { content?: string | null; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> }> }

export interface OligoAiReadResult {
  rows: OligoRow[];
  draft: OligoOrderDraft | null;
  error?: string;
}

function validator() {
  const schema = parseYaml(readFileSync('schema/sequence-analysis/oligo-order-draft.schema.yaml', 'utf-8')) as Record<string, unknown>;
  const v = createValidator({ strict: false });
  v.addSchema(schema as never, OLIGO_DRAFT_SCHEMA_ID);
  return v;
}

function promptFile(path = 'prompts/oligo-order-draft.md'): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

/** Ask the configured model to read `text` as an oligo-order-draft. */
export async function readOligoOrderWithAi(
  text: string,
  options: { llmClient: OligoAiReadClient; model: string; maxContextChars?: number; maxTokens?: number },
): Promise<OligoAiReadResult> {
  const budget = options.maxContextChars ?? 12000;
  const excerpt = text.length > budget ? text.slice(0, budget) : text;
  const messages: CompletionRequest['messages'] = [
    { role: 'system', content: promptFile() },
    { role: 'user', content: `VENDOR DOCUMENT TEXT:\n\n${excerpt}\n\nReturn the oligo-order-draft JSON object.` },
  ];
  const ask = (extra: CompletionRequest['messages']) => options.llmClient.complete({
    model: options.model,
    messages: [...messages, ...extra],
    temperature: 0,
    max_tokens: options.maxTokens ?? 4000,
    response_format: { type: 'json_object' },
  });
  let parsed: unknown; let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await ask(attempt === 0 ? [] : [{ role: 'user', content: `Your previous answer was rejected: ${lastError}\nRe-emit the complete oligo-order-draft JSON object.` }]);
    const content = response.choices?.[0]?.message.content ?? '';
    try { parsed = JSON.parse(content); } catch (err) { lastError = `not JSON: ${(err as Error).message}`; continue; }
    const result = validator().validate(parsed, OLIGO_DRAFT_SCHEMA_ID);
    if (result.valid) return { rows: await oligoRowsFromDraft(parsed as OligoOrderDraft), draft: parsed as OligoOrderDraft };
    lastError = result.errors.slice(0, 6).map((e) => `${e.path || '/'}: ${e.message}`).join('; ');
  }
  return { rows: [], draft: null, error: `The AI read did not produce a valid oligo-order-draft: ${lastError}` };
}
```

RED test — `server/src/sequences/oligoOrderAiRead.test.ts` (stub the client; do NOT call a model):

```ts
import { describe, expect, it } from 'vitest';
import { readOligoOrderWithAi } from './oligoOrderAiRead.js';

const draftJson = JSON.stringify({ kind: 'oligo-order-draft', vendor: 'Thermo Fisher', declaredRowCount: 2, rows: [
  { name: 'Oformi_1784_ABY', sequence: 'ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY', sourceQuote: '30 Pass …' },
  { name: 'Buulg_934_VIC', sequence: null, unreadable: true, sourceQuote: '10 Pass Buulg 934 VIC [VIC-…' },
] });

describe('AI oligo read', () => {
  it('loweres a schema-valid draft into rows (one honestly unreadable)', async () => {
    const { rows, error } = await readOligoOrderWithAi('ORDER ID: 8493364', {
      llmClient: { complete: async () => ({ choices: [{ message: { content: draftJson } }] }) },
      model: 'test-model',
    });
    expect(error).toBeUndefined();
    expect(rows.map((r) => r.label)).toEqual(['Oformi_1784_ABY', 'Buulg_934_VIC']);
    expect(rows[1]?.issues.length).toBeGreaterThan(0);
  });

  it('re-asks once when the model answers with prose, then reports honestly', async () => {
    let calls = 0;
    const { rows, error } = await readOligoOrderWithAi('text', {
      llmClient: { complete: async () => { calls += 1; return { choices: [{ message: { content: 'I think the primers are…' } }] }; } },
      model: 'test-model',
    });
    expect(calls).toBe(2);
    expect(rows).toEqual([]);
    expect(error).toMatch(/did not produce a valid oligo-order-draft/);
  });
});
```
```bash
cd server && npx vitest run src/sequences/oligoOrderAiRead.test.ts   # FAIL → implement → 2 passed
```
Commit:
```bash
git -c core.fileMode=false add server/prompts/oligo-order-draft.md server/src/sequences/oligoOrderAiRead.ts server/src/sequences/oligoOrderAiRead.test.ts
git -c core.fileMode=false commit -m "feat(oligo): AI read producer — schema-constrained oligo-order-draft with one repair retry, lowered by the deterministic lowerer"
```

### Task 4 — Config: the fallback's policy is DATA

Append to `config/sequence-analysis/oligo-order.yaml`:

```yaml
# When the deterministic read cannot account for the document, offer the AI read.
# The trigger is DATA — the predicate lives here, not in TypeScript.
aiFallback:
  enabled: true
  # offer the AI read when: no rows at all | every row has an issue | a row's
  # bases are unreadable | the document declares more items than were read
  offerWhen: [ no-rows, any-issue, declared-count-mismatch ]
  # manual = the review UI shows a "Read with AI" action (default);
  # auto    = the server runs the AI read in the same request when the trigger
  #           fires (slower upload, no second click).
  mode: manual
  maxContextChars: 12000
  maxTokens: 4000
```

Test it is read (extend `server/src/sequences/oligoOrder.test.ts`):
```ts
it('declares the AI-read fallback policy', async () => {
  const { sequenceConfig } = await import('./sequenceRuntime.js');
  const config = await sequenceConfig('oligo-order');
  expect((config.aiFallback as { enabled: boolean }).enabled).toBe(true);
});
```
```bash
cd server && npx vitest run src/sequences/oligoOrder.test.ts   # 7 passed
```
Commit:
```bash
git -c core.fileMode=false add config/sequence-analysis/oligo-order.yaml server/src/sequences/oligoOrder.test.ts
git -c core.fileMode=false commit -m "feat(oligo): aiFallback policy as DATA (offerWhen triggers, manual|auto mode, budgets)"
```

### Task 5 — Detect a PARTIAL read (the dangerous case), data-driven

The probe in "Current context" shows 2-of-3 rows with no complaint. Add a declared-count signal: the pipeline already collects `metadata` from `config.metadata` patterns; add a count pattern and compare.

```yaml
metadata:
  vendor: '^(?:Vendor|Supplier)\s*:\s*(.+)$'
  orderId: '^(?:Order\s*(?:Number|No\.?|ID)|Order\s*#)\s*[:#]?\s*(.+)$'
  purification: '^Purification\s*:\s*(.+)$'
  synthesisScale: '^(?:Scale|Synthesis\s+Scale)\s*:\s*(.+)$'
  # How many line items the document itself claims ("ITEMS: 4", "QTY 4", "Total: 4").
  declaredItemCount: '^(?:ITEMS?|QTY|Total(?:\s+Items)?)\s*[:#]?\s*(\d+)\s*$'
```
Then in `ingestOligoOrder`, after `const rows = await extractOligoRows(...)`:
```ts
  const declared = Number(rows[0]?.metadata?.declaredItemCount ?? NaN);
  const partial = Number.isFinite(declared) && rows.length > 0 && rows.length < declared;
  const issues = rows.filter((row) => row.issues.length > 0).length;
  if (partial) extraction.diagnostics.push({
    severity: 'warning',
    code: 'OLIGO_PARTIAL_READ',
    message: `The document declares ${declared} items but only ${rows.length} were recognized. Review the pages before importing, or use the AI read.`,
  });
```
RED test (in `oligoOrder.test.ts`): a text with `ITEMS: 3` and two readable rows ⇒ the response's diagnostics contain `OLIGO_PARTIAL_READ`.
```bash
cd server && npx vitest run src/sequences/oligoOrder.test.ts   # FAIL → implement → passed
```
Commit:
```bash
git -c core.fileMode=false add config/sequence-analysis/oligo-order.yaml server/src/sequences/oligoOrder.ts server/src/sequences/oligoOrder.test.ts
git -c core.fileMode=false commit -m "feat(oligo): a partial read is a declared failure, not silence (OLIGO_PARTIAL_READ diagnostic from the declared item count)"
```

### Task 6 — Wire the AI read into the ingestion job, with provenance

Add to `server/src/sequences/oligoOrder.ts` an exported function the route will call:

```ts
/**
 * Run the AI read for an EXISTING ingestion job and attach its rows as
 * candidates to the SAME job/bundle, so the review UI sees one order no matter
 * which producer read it. Provenance is recorded on the candidate payload and
 * on the artifact's extraction method; the honest warning rides diagnostics.
 */
export async function aiReadOligoOrder(
  ctx: AppContext,
  actor: string,
  jobId: string,
  deps: { llmClient: OligoAiReadClient; model: string },
) {
  const service = new SequenceService(ctx, actor);
  const job = await service.read(jobId);
  const jobPayload = job.payload as Record<string, unknown>;
  if (jobPayload.kind !== 'ingestion-job') throw new SequenceError('Select an ingestion job.');
  const artifactRefs = (jobPayload.artifact_refs as Array<{ id: string }> | undefined) ?? [];
  if (artifactRefs.length === 0) throw new SequenceError('This job has no stored document to read.');
  const artifact = await service.read(artifactRefs[0]!.id);
  const text = String(((artifact.payload as Record<string, unknown>).text_extract as Record<string, unknown> | undefined)?.excerpt ?? '');
  if (!text.trim()) throw new SequenceError('No extracted text is stored for this document — scanned PDFs need the local OCR pass first.');
  const config = await sequenceConfig('oligo-order');
  const fallback = (config.aiFallback as Record<string, unknown> | undefined) ?? {};
  const read = await readOligoOrderWithAi(text, {
    llmClient: deps.llmClient,
    model: deps.model,
    maxContextChars: Number(fallback.maxContextChars ?? 12000),
    maxTokens: Number(fallback.maxTokens ?? 4000),
  });
  if (read.error) throw new SequenceError(read.error);
  const sha256 = String(((artifact.payload as Record<string, unknown>).file_ref as Record<string, unknown> | undefined)?.sha256 ?? '');
  const companion = { extractedBy: 'ai-draft', model: deps.model, readAt: new Date().toISOString() };
  const bundleRefs = (jobPayload.bundle_refs as Array<{ id: string }> | undefined) ?? [];
  const candidates = read.rows.map((row, index) => buildIngestionCandidateEnvelope({
    job: jobPayload as never,
    bundle: { bundleType: 'other' } as never,
    candidateType: 'oligo',
    title: `${jobId} AI row ${index + 1}: ${row.label}`,
    payload: { ...row, sha256, ...companion },
    sourceRefs: [createSourceRef(artifactRefs[0]!.id)],
    proposedRecordKind: 'oligo-spec',
    proposedSchemaId: SEQUENCE_SCHEMA + 'oligo-spec.schema.yaml',
  }));
  for (const env of candidates) await service.save(env.payload as unknown as Record<string, unknown>, env.schemaId);
  return {
    jobId,
    candidates: candidates.map((c) => ({ recordId: c.recordId, ...c.payload.payload })),
    diagnostics: [
      { severity: 'warning', code: 'AI_READ_REVIEW', message: `Read by ${deps.model} from the extracted text. Verify every base, dye and name against the PDF page before importing.` },
      ...(read.draft?.declaredRowCount !== undefined && read.rows.length < read.draft.declaredRowCount
        ? [{ severity: 'warning', code: 'AI_READ_PARTIAL', message: `The document declares ${read.draft.declaredRowCount} items; the AI read returned ${read.rows.length}. Check the remaining pages.` }]
        : []),
    ],
  };
}
```
(Imports: `readOligoOrderWithAi` + `OligoAiReadClient` from `./oligoOrderAiRead.js`; the envelope builders + `createSourceRef` are already imported in that file; `SequenceError` too.)

Test — `server/src/sequences/oligoOrderAiReadJob.test.ts`: build a `MemoryRecordStore`-style fake `ctx` (copy the local class pattern from `server/src/sequences/SequenceService.test.ts`), save an ingestion job + artifact via `ingestOligoOrder('order.txt')`, call `aiReadOligoOrder` with a stubbed client returning the fixture draft, and assert: candidates saved, `payload.extractedBy === 'ai-draft'`, and a diagnostic with code `AI_READ_REVIEW`.
```bash
cd server && npx vitest run src/sequences/   # all green
```
Commit:
```bash
git -c core.fileMode=false add server/src/sequences/oligoOrder.ts server/src/sequences/oligoOrderAiReadJob.test.ts
git -c core.fileMode=false commit -m "feat(oligo): attach an AI read to the existing ingestion job with provenance + verify-before-import diagnostics"
```

### Task 7 — Route + wiring (the model comes from settings)

`server/src/sequences/sequenceRoutes.ts` — add the route beside `POST /sequences/order`:
```ts
 app.post('/sequences/order/:id/ai-read',handle(async request=>{
  const user=await actor(request);
  if(!deps.llmClient)throw new SequenceError('No AI endpoint is configured. Set an AI model in Settings and try again.',503);
  return aiReadOligoOrder(ctx,user,(request.params as {id:string}).id,{llmClient:deps.llmClient,model:deps.model??''});
 }));
```
and widen the signature/decorate `registerSequenceRoutes` with the deps (mirroring `createAiIngestionHandlers(inferenceClient, inferenceConfig.model, ctx.store)` at `server/src/server.ts:1130`):
```ts
export function registerSequenceRoutes(app:FastifyInstance,ctx:AppContext,registry:ToolRegistry,deps:{llmClient?:OligoAiReadClient;model?:string}={}) { … }
```
At the call site (`server/src/server.ts:1416`) pass the model/client through the **existing** holder rather than a new one: `server.ts:917` already declares
```ts
const protocolIdeAiDeps: { current: { extractionService: unknown; llmClient: unknown; model?: string } | undefined } = { current: undefined };
```
and the AI-enabled block fills it (`:1133-1137`, right after `createAiIngestionHandlers(inferenceClient, inferenceConfig.model, ctx.store)`), while the no-AI path leaves it `undefined`. So:
```ts
registerSequenceRoutes(instance, ctx, toolRegistry, {
  getAiDeps: () => {
    const current = protocolIdeAiDeps.current;
    return current ? { llmClient: current.llmClient as OligoAiReadClient, model: current.model ?? '' } : undefined;
  },
});
```
and in the route use `const deps = options.getAiDeps?.() ?? {}` — an unset AI runtime yields the honest 503, never a hardcoded model. (This also keeps the sequence route consistent with how the protocol-ide streaming endpoint already reads the runtime.)

Test — `server/src/api/handlers/`-style route test is unnecessary: cover it in `oligoOrderAiReadJob.test.ts` plus a route-registration assertion (the repo's `routes.ts` smoke pattern). Verify by hand after Task 9.
```bash
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"    # equal to the Task 0 baseline (zero NEW)
```
Commit:
```bash
git -c core.fileMode=false add server/src/sequences/sequenceRoutes.ts server/src/server.ts
git -c core.fileMode=false commit -m "feat(oligo): POST /sequences/order/:id/ai-read wired to the configured model (no hardcoded model, 503 when unset)"
```

### Task 8 — The review UI offers the AI read (and stays honest about it)

`app/src/sequences/SequenceImport.tsx` — add to the state block:
```tsx
 const [aiBusy,setAiBusy]=useState(false);const [aiNotice,setAiNotice]=useState('')
 async function aiRead() {const id=jobId||sessionStorage.getItem('cl-oligo-job');if(!id)return;setAiBusy(true);setError('');setAiNotice('')
  try{const data=await sequenceApi(`/order/${encodeURIComponent(id)}/ai-read`,{});
   setRows(previous=>[...previous.filter(r=>r.extractedBy!=='ai-draft'),...data.candidates.map((r:any)=>({...r,selected:true,alphabet:'iupac_dna',topology:'linear'}))]);
   setDiagnostics((previous:any[])=>[...previous,...(data.diagnostics??[])]);
   setAiNotice(`${data.candidates.length} row(s) read by the AI. Verify every base against the PDF page before importing.`)}
  catch(e){setError((e as Error).message)}finally{setAiBusy(false)}}
```
and render the action in the order-confirmation fieldset (after the `diagnostics.map` line):
```tsx
   {(jobId||sessionStorage.getItem('cl-oligo-job'))&&<button disabled={busy||aiBusy} onClick={()=>void aiRead()}>Read with AI</button>}
   {aiNotice&&<p role="status">{aiNotice}</p>}
```
Also mark AI rows visually in the row cards (they already render `issues`): add `{row.extractedBy==='ai-draft'&&<p className="sequence-warning">AI read — verify against the PDF.</p>}`.

Test — **create** `app/src/sequences/SequenceImport.test.tsx` (it does not exist yet; `app/src/sequences/` has only `SequenceChat.test.tsx` and `SequenceEditor.test.tsx` — mirror their mocking style, stubbing `./api`'s `sequenceApi`): assert the "Read with AI" button appears once a job id exists, that clicking it calls `sequenceApi('/order/<id>/ai-read', {})`, and that returned candidates render with the `AI read — verify against the PDF.` warning.
```bash
cd app && npx vitest run src/sequences/SequenceImport.test.tsx    # green
cd .. && npm run typecheck -w app                                  # baseline count, zero NEW
```
Commit:
```bash
git -c core.fileMode=false add app/src/sequences/SequenceImport.tsx app/src/sequences/SequenceImport.test.tsx
git -c core.fileMode=false commit -m "feat(oligo-ui): Read with AI action on the order review, rows marked ai-draft with a verify warning"
```

### Task 9 — Prove it end to end on a real Thermo PDF (the acceptance gate)

1. Ask Brad to drop one of the three failing Thermo PDFs into a scratch path (they are vendor documents — do NOT commit them).
2. With the stack running (`:3001`/`:5174`), open `http://computable:5174/ingestion/oligo-orders`, upload the PDF, and record the deterministic result.
   Expect: the `OLIGO_PARTIAL_READ` (or zero-row) diagnostic — that is the trigger firing, and it is the evidence the fallback is needed.
3. Click **Read with AI**. Expect: rows in the review cards, each carrying `AI read — verify against the PDF`, the banner from `AI_READ_REVIEW`, and the unreadable rows visibly flagged rather than silently absent.
4. Check the read against the printed page: for each row, `sourceQuote` must be findable verbatim in the PDF's text, and every base must match the page. **Record any mismatch as a defect, not a rounding error** — a wrong base is a wrong experiment.
5. Save one row through the existing actions and confirm the saved `sequence`/`oligo-spec` is what the page says.
6. Screenshot receipt into `~/.hermes/cl/receipts/oligo-ai-read/<timestamp>/` (SOP rule 12: no UI claim without a browser).

### Task 10 — Fixtures and regression pins

Add a TEXT fixture of the failing document class (the extracted text, not the PDF — that is what the producers see): `server/src/sequences/fixtures/thermo-biosystems-scan.txt` with Brad's pasted text verbatim, and two tests:
- the deterministic extractor yields ≥1 row and the `OLIGO_PARTIAL_READ` diagnostic (documents the current limit honestly);
- `oligoRowsFromDraft` on the equivalent draft yields all declared rows with the unreadable one flagged.
```bash
cd server && npx vitest run src/sequences/   # green
```
Commit:
```bash
git -c core.fileMode=false add server/src/sequences/fixtures/thermo-biosystems-scan.txt server/src/sequences/oligoOrder.test.ts
git -c core.fileMode=false commit -m "test(oligo): pin the scanned-Biosystems-table class (partial deterministic read + complete AI draft)"
```

---

## Tests / validation (the gate)

| Check | Command (from the worktree) | Expected |
|---|---|---|
| Schema | `cd server && npx vitest run src/schema/OligoOrderDraftSchema.test.ts` | 3 passed |
| Lowerer | `cd server && npx vitest run src/sequences/oligoOrderDraft.test.ts` | 3 passed; residues identical to the regex path for the same line |
| Producer | `cd server && npx vitest run src/sequences/oligoOrderAiRead.test.ts` | 2 passed (stubbed client; no model call) |
| Job wiring | `cd server && npx vitest run src/sequences/` | all green, incl. the new job test |
| Deterministic suite intact | `cd server && npx vitest run src/sequences/oligoOrder.test.ts` | 7 passed (the ported hardening + the config test) |
| Server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | equal to the Task 0 baseline |
| App unit | `cd app && npx vitest run src/sequences/SequenceImport.test.tsx` | green |
| App types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | equal to the Task 0 baseline |
| Live | Task 9 steps 2-5 | partial-read diagnostic, then AI rows with quotes that match the page; one row saved correctly |
| Browser | Task 9 step 6 receipt | screenshot showing the AI rows + the verify warning |

TDD order per task: write the test → run (paste RED) → implement minimally → run (GREEN) → commit with the exact `git add` paths above. Never `git add -A`. Never commit in Brad's live checkout. Never restart `:3001`/`:5174` without asking.

## Risks, tradeoffs, open questions

- **Text-only in Stage A.** `ChatMessage.content` is `string | null` (`server/src/ai/types.ts:16-29`) — there is no image content part anywhere in `server/src/ai`, so the AI reads the OCR/layout TEXT, not the page pixels. Brad's failure is largely an OCR-quality failure, so the AI may inherit the same garble. **Stage B (separate item):** widen `ChatMessage` to content parts, rasterize pages with the already-configured `ocr.rasterizer` (`pdftoppm`, `config/sequence-analysis/oligo-order.yaml`), and send the PNGs to a configured vision model (the fleet has vision endpoints). That is the real fix for scans; Stage A is the honest, shippable first half.
- **The AI must never invent bases.** Enforced three ways: the prompt rule 4, the schema's `sequence: null` + `unreadable: true` shape, and the lowerer converting an unreadable row into a row with an issue rather than empty residues. No path may silently drop a row.
- **Partial reads are the dangerous class** (measured: 2 of 3 rows, silent). Task 5 makes the declared item count a first-class signal; documents that state no count remain undetectable — the `offerWhen` policy and the UI's ever-present "Read with AI" action are the mitigation.
- **Vendor documents are proprietary.** Do not commit the PDFs; commit extracted TEXT fixtures only (Task 10), and keep the receipt screenshots in the Hermes receipts dir, not the repo.
- **The lab-record authoring rule is unchanged.** The AI read produces `ingestion-candidate` payloads exactly like the deterministic read; canonical `oligo-spec`/`sequence` records are still created only by the user's save actions. Nothing here writes canonical records.
- **Model choice is settings/config** — `inferenceConfig.model`; never hardcode. A small model might return prose: the producer re-asks once, then fails honestly (never repairs).
- **Open question 1:** should `aiFallback.mode` default to `manual` (a button — what Brad asked for) or `auto`? This plan ships `manual`; flipping to `auto` is a one-line config change if Brad wants the upload itself to fall back.
- **Open question 2:** when lane 2's scientist-intent stack eventually merges to main, should the oligo draft become a `scientist-intent` document instead of its own `oligo-order-draft` kind? Recommendation: **no** — the scientist-intent contract is the deck-event vocabulary (31 verbs); an oligo order is a different document kind, and its schema is the thing that keeps the AI honest. Revisit only if a shared "AI-read document" framework emerges.
- **Open question 3:** where does the AI-read result live when the deterministic read was non-empty? This plan ADDs candidates to the same job (so the user sees both reads side by side); an alternative is replacing them. Flag for Brad at review time.
- **Not in scope:** the save/import actions, the `oligo-spec` schema, the OCR config, the Sequences workspace page, and the lane-2 shorthand work.
