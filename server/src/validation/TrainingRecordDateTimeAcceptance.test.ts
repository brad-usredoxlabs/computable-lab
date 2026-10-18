/**
 * REG-3 FIX1 D1 — server-side acceptance proof for the training-record
 * create leg, against the REAL schema files and the REAL AjvValidator
 * config (Ajv2020 + ajv-formats, the same pipeline RecordHandlers uses).
 *
 * The browser gate proved: POST /api/records -> 422
 *   {path:"/completedAt", message:"Invalid format: expected date-time"}
 * because training-record.ui.yaml declared widget "date" (commits bare
 * "YYYY-MM-DD") while training-record.schema.yaml requires date-time.
 *
 * The fix is declarative (widget: "datetime") PLUS a widget-commit
 * normalization, because the datetime-local control itself commits
 * "YYYY-MM-DDTHH:mm" WITHOUT seconds — which Ajv2020 also rejects.
 *
 * This test pins the server-side half of the contract:
 *   1. training-record.ui.yaml declares datetime widgets for the
 *      date-time-formatted fields (RED at base: they are "date");
 *   2. the value the datetime widget commits ("YYYY-MM-DDTHH:mm:00")
 *      PASSES the real AjvValidator against the real schema;
 *   3. the values the OLD widgets committed ("YYYY-MM-DD" and the raw
 *      datetime-local "YYYY-MM-DDTHH:mm") are REJECTED — proving the
 *      normalization is load-bearing and the schema format was NOT
 *      weakened (the schema file is asserted untouched: format stays
 *      date-time).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from './AjvValidator.js'
import { createUISpecLoader } from '../ui/UISpecLoader.js'

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
)
const UI_PATH = (name: string) => join(SCHEMA_DIR, 'lab', name)

describe('training-record create-leg date-time acceptance (D1)', () => {
  let validator: ReturnType<typeof createValidator>

  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true })
    const registry = createSchemaRegistry()
    registry.addSchemas(loaded.entries)
    validator = createValidator()
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id)
      if (entry) validator.addSchema(entry.schema as never, id)
    }
  })

  const basePayload = {
    kind: 'training-record',
    id: 'TRR-REG3FIX1',
    personRef: { kind: 'record', type: 'person', id: 'PER-REG3FIX1' },
    trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRM-REG3FIX1' },
    status: 'completed',
  }

  it('the schema still requires format: date-time (NOT weakened)', async () => {
    const raw = await readFile(join(SCHEMA_DIR, 'lab', 'training-record.schema.yaml'), 'utf-8')
    expect(raw).toMatch(/completedAt:\s*\n\s*type: string\n\s*format: date-time/)
    expect(raw).toMatch(/expiresAt:\s*\n\s*type: string\n\s*format: date-time/)
  })

  it('the ui spec declares datetime (not date) widgets for completedAt/expiresAt', async () => {
    const loader = createUISpecLoader()
    const content = await readFile(UI_PATH('training-record.ui.yaml'), 'utf-8')
    const res = loader.load(content, UI_PATH('training-record.ui.yaml'))
    expect(res.success).toBe(true)
    expect(res.validationErrors ?? []).toEqual([])
    const fields = res.spec!.form!.sections!.flatMap((s) => s.fields ?? [])
    const byPath = new Map(fields.map((f) => [f.path, f]))
    // RED at base: both are 'date' -> the widget commits a bare "YYYY-MM-DD".
    expect(byPath.get('$.completedAt')!.widget).toBe('datetime')
    expect(byPath.get('$.expiresAt')!.widget).toBe('datetime')
  })

  it('the value the datetime widget commits passes the real AjvValidator', () => {
    // DatetimeWidget commits datetime-local + the widget's own seconds
    // completion: "YYYY-MM-DDTHH:mm" -> "YYYY-MM-DDTHH:mm:00".
    const result = validator.validate(
      { ...basePayload, completedAt: '2026-10-18T14:30:00' },
      SCHEMA_ID('training-record.schema.yaml'),
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('the bare values the OLD date/datetime-local commits produce are rejected (normalization is load-bearing)', () => {
    const bareDate = validator.validate(
      { ...basePayload, completedAt: '2026-10-18' },
      SCHEMA_ID('training-record.schema.yaml'),
    )
    expect(bareDate.valid).toBe(false)
    expect(bareDate.errors?.some((e) => e.keyword === 'format' && e.path === '/completedAt')).toBe(true)

    const bareDateTimeLocal = validator.validate(
      { ...basePayload, completedAt: '2026-10-18T14:30' },
      SCHEMA_ID('training-record.schema.yaml'),
    )
    expect(bareDateTimeLocal.valid).toBe(false)
    expect(
      bareDateTimeLocal.errors?.some((e) => e.keyword === 'format' && e.path === '/completedAt'),
    ).toBe(true)
  })

  it('expiresAt accepts the same widget-committed shape', () => {
    const result = validator.validate(
      { ...basePayload, completedAt: '2026-10-18T14:30:00', expiresAt: '2027-10-18T09:05:00' },
      SCHEMA_ID('training-record.schema.yaml'),
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })
})
