/**
 * OligoOrderDraftSchema — the OLIGO-AI-1 draft-document contract test (spec §6.2).
 *
 * Pins the oligo-order-draft document schema with the real Ajv pipeline
 * (loadSchemasFromContent -> registry.addSchemas -> topological addSchema ->
 * createValidator({ strict: false })), mirroring OwnershipPolicySchema.test.ts.
 *
 * The draft is an API-boundary document, never a record: it carries no
 * recordId/title and is never persisted, so it is schema-only (the
 * schema/ingestion/* precedent) and must not $ref common.schema.yaml.
 *
 * REPO_ROOT pattern (not cwd-relative readFileSync): server/schema is a
 * gitignored symlink, so a cwd-relative path is a worktree-portability trap.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const DRAFT_SCHEMA_PATH = 'sequence-analysis/oligo-order-draft.schema.yaml';

// Pinned $id (spec §3): the nested sequence-analysis segment is intentional
// and collision-free in the registry. OLIGO-AI-2 imports this string.
const DRAFT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml';

const REPO_ROOT = resolve(process.cwd(), '..');

describe('oligo-order-draft schema contract', () => {
  let registry: ReturnType<typeof createSchemaRegistry>;
  let validator: ReturnType<typeof createValidator>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const contents = new Map<string, string>();
    contents.set(
      DRAFT_SCHEMA_PATH,
      await readFile(join(REPO_ROOT, 'schema', DRAFT_SCHEMA_PATH), 'utf8'),
    );

    const result = loadSchemasFromContent(contents);
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);

    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema, entry.id);
      }
    }
  });

  it('accepts a readable row carrying a verbatim source quote', () => {
    // Registration under the pinned $id is what makes validation-by-id possible.
    expect(registry.has(DRAFT_SCHEMA_ID)).toBe(true);
    expect(registry.getById(DRAFT_SCHEMA_ID)?.schema.properties?.kind?.const).toBe('oligo-order-draft');

    const draft = {
      kind: 'oligo-order-draft',
      vendor: 'Thermo Fisher',
      orderId: '13421320',
      declaredRowCount: 1,
      rows: [
        {
          name: 'Oformi_1784_ABY',
          sequence: 'ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY',
          modifications: [{ label: 'ABY', role: 'reporter', position: '5-prime' }],
          scale: '100uM',
          purification: 'HPLC',
          yieldPmol: 10137.44,
          mass: 365570,
          concentrationUM: 6000,
          buffer: 'TE',
          page: 1,
          sourceQuote:
            '30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM',
        },
      ],
    };
    const result = validator.validate(draft, DRAFT_SCHEMA_ID);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('accepts an explicitly unreadable row (null bases + unreadable flag)', () => {
    const draft = {
      kind: 'oligo-order-draft',
      rows: [{ name: 'Buulg_934_VIC', sequence: null, unreadable: true, sourceQuote: 'Primer Name: Buulg_934_VIC' }],
    };
    const result = validator.validate(draft, DRAFT_SCHEMA_ID);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it("producer tolerance (OLIGO-AI-3 D1'): a garbled row with name:null + null metadata validates", () => {
    // Fixture source: gate-3 raw-model probe
    // /home/brad/.hermes/cl/receipts/OLIGO-AI-3/20261013T1240/raw-model-probe.txt
    // (rows verbatim from the model's call-1 output on the real Thermo PDF,
    // jobId ING-OTHER-9Z60CH) plus the probe-captured refusal shape
    // {"name": null, "sequence": null, "unreadable": true, "sourceQuote": "…"}.
    // Gate-3 refused 3 of 4 reads at the Ajv layer:
    //   /rows/3/name: Expected type: string
    //   /rows/3/concentrationUM: Expected type: number
    //   /rows/3/buffer: Expected type: string
    // The producer contract must tolerate honest absence/wrong-type metadata
    // (name null-or-omitted; numeric/string metadata null-or-typed) because
    // the consumer already handles empty labels ('No oligo name found…').
    const draft = {
      kind: 'oligo-order-draft',
      vendor: 'Applied Biosystems',
      orderId: '8493629',
      declaredRowCount: 4,
      rows: [
        {
          name: 'Zanumulumwm:Qu',
          sequence: 'Cyanine 5-GGC TAA TGA GAA GCT TGA TGC CGA AGG AC-QSY2',
          yieldPmol: 357350,
          mass: 10422.49,
          purification: 'Pass',
          concentrationUM: 100,
          buffer: '1 x TE Buffer',
          sourceQuote: '10 Pass Zanumulumwm:Qu Cyanine 5-GGC TAA TGA GAA GCT TGA TGC CGA AGG AC-QSY2 29 357350 10422.49 Pass 6000 100ul',
        },
        {
          name: 'Akk_GA4_1617ABY',
          sequence: '6FAM-GTC ACC GCC GAY CAG GAR GAA GG-QSY',
          yieldPmol: 314470,
          mass: 8494.92,
          purification: 'Pass',
          concentrationUM: 100,
          buffer: '1 x TE Buffer',
          sourceQuote: '30 Pass Akk_GA4_1617ABY |6FAM-GTC ACC GCC GAY CAG GAR GAA GG-QSY 23 314470 8494.92 Pass 6000 100ul',
        },
        {
          name: 'Praus_1686_ABY',
          sequence: '6FAM-GGC CCC AAC ATC GGT CTG ATC TCC-QSY',
          yieldPmol: 288510,
          mass: 86365,
          purification: 'Pass',
          concentrationUM: 100,
          buffer: '1. TE Buffer',
          sourceQuote: '50 Pass Praus_1686_ABY |6FAM-GGC CCC AAC ATC GGT CTG ATC TCC-QSY 24 288510 86365 Pass 6000 100y',
        },
        {
          name: null,
          sequence: null,
          unreadable: true,
          concentrationUM: null,
          buffer: null,
          sourceQuote: '70 Pass RtorqGA4_1813_CY5 |Cyanine 5-GCA CAG GCG AAT ACA CCG CTT GAT G-QSY2 25 296620 9082.61 Pass 6000',
        },
      ],
    };
    const result = validator.validate(draft, DRAFT_SCHEMA_ID);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('honesty strictness preserved: empty sourceQuote and non-object rows still fail', () => {
    // An AI row without a verbatim quote is not honest — the quote stays a
    // required non-empty string even while metadata tolerance widens (D1'
    // fix direction: provenance stays strict).
    const emptyQuote = validator.validate(
      { kind: 'oligo-order-draft', rows: [{ name: 'x', sequence: 'ACGT', sourceQuote: '' }] },
      DRAFT_SCHEMA_ID,
    );
    expect(emptyQuote.valid).toBe(false);
    expect(emptyQuote.errors.some((e) => e.keyword === 'minLength'), JSON.stringify(emptyQuote.errors)).toBe(true);

    const missingQuote = validator.validate(
      { kind: 'oligo-order-draft', rows: [{ name: 'x', sequence: 'ACGT' }] },
      DRAFT_SCHEMA_ID,
    );
    expect(missingQuote.valid).toBe(false);
    expect(missingQuote.errors.some((e) => e.keyword === 'required' && (e.params as { missingProperty?: string }).missingProperty === 'sourceQuote'), JSON.stringify(missingQuote.errors)).toBe(true);

    // A row must remain an object.
    const nonObjectRow = validator.validate({ kind: 'oligo-order-draft', rows: ['not a row'] }, DRAFT_SCHEMA_ID);
    expect(nonObjectRow.valid).toBe(false);
    expect(nonObjectRow.errors.some((e) => e.keyword === 'type'), JSON.stringify(nonObjectRow.errors)).toBe(true);
  });

  it('rejects fabricated shapes (additionalProperties: false, declared enums)', () => {
    // A fabricated row key: the AI must never invent a `bases` field.
    const fabricated = validator.validate(
      { kind: 'oligo-order-draft', rows: [{ name: 'x', bases: 'ACGT' }] },
      DRAFT_SCHEMA_ID,
    );
    expect(fabricated.valid).toBe(false);
    expect(fabricated.errors.length).toBeGreaterThan(0);
    expect(fabricated.errors.find((e) => e.keyword === 'additionalProperties'), JSON.stringify(fabricated.errors)).toBeDefined();

    // Modification role/position enums must round-trip into the config's
    // modification rows (reporter|quencher|other / 5-prime|3-prime|internal).
    const badEnum = validator.validate(
      {
        kind: 'oligo-order-draft',
        rows: [{ name: 'x', sequence: 'ACGT', modifications: [{ label: 'ABY', role: 'dye', position: 'left' }] }],
      },
      DRAFT_SCHEMA_ID,
    );
    expect(badEnum.valid).toBe(false);
    expect(badEnum.errors.some((e) => e.keyword === 'enum')).toBe(true);
  });
});
