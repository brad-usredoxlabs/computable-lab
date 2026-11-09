/**
 * GC-13 (leg D, FIX6) — gcEvidenceSources data-table contracts against the
 * REAL shipped YAML (defects 9 + 8).
 *
 * Defect 9: the source-type enum is the form's runtime guard table — it must
 * equal what evidence.schema.yaml ACTUALLY declares. This test reads the real
 * schema file and compares, so a future schema edit that the table misses is
 * detected here (the hardcoded table is a mirror; drift is pinned, not
 * invented).
 *
 * Defect 8: evidence.ui.yaml's per-item hints must live under the
 * loader-honored `items:` key (UISpecLoader validates `field.items` for
 * `widget: array`; the ui-v1 field definition has no `properties` member, so
 * hints under `properties:` are inert config). This test loads the real
 * ui.yaml through the same YAML parse and pins the projection: the item
 * hints are present, their `type` select mirrors the real enum, and the
 * inert `properties` key is gone.
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import yaml from 'yaml'
import {
  EVIDENCE_SCHEMA_ID,
  EVIDENCE_SOURCE_TYPE_BY_RECORD_TYPE,
  EVIDENCE_SOURCE_TYPE_ENUM,
  evidenceSourceTypeFor,
} from './gcEvidenceSources'

const SCHEMA = (name: string) => resolve(process.cwd(), '..', 'schema', 'knowledge', name)

async function loadRealEvidenceEnum(): Promise<string[]> {
  const doc = yaml.parse(await readFile(SCHEMA('evidence.schema.yaml'), 'utf-8')) as {
    $defs: { EvidenceSource: { properties: { type: { enum: unknown } } } }
  }
  return doc.$defs.EvidenceSource.properties.type.enum as string[]
}

describe('gcEvidenceSources vs the REAL evidence.schema.yaml (FIX6 defect 9)', () => {
  it('the hardcoded table equals the schema-declared enum (drift is detected and pinned — the guard is not self-referential)', async () => {
    const real = await loadRealEvidenceEnum()
    expect([...EVIDENCE_SOURCE_TYPE_ENUM]).toEqual(real)
  })

  it('the schema $id is the exact id the form POSTs to (the runtime getSchema key)', async () => {
    const doc = yaml.parse(await readFile(SCHEMA('evidence.schema.yaml'), 'utf-8')) as { $id: string }
    expect(EVIDENCE_SCHEMA_ID).toBe(doc.$id)
  })

  it('every mapped record kind emits a value the real enum carries (the OQ-1 mapping is schema-legal, not invented)', async () => {
    const real = await loadRealEvidenceEnum()
    for (const recordType of Object.keys(EVIDENCE_SOURCE_TYPE_BY_RECORD_TYPE)) {
      const mapped = evidenceSourceTypeFor(recordType, real)
      expect(mapped, `kind '${recordType}' must map into the declared enum`).not.toBeNull()
      expect(real).toContain(mapped)
    }
  })
})

describe('evidence.ui.yaml item hints (FIX6 defect 8: loader-honored `items:` key, not inert `properties:`)', () => {
  async function loadUiDoc(): Promise<Record<string, any>> {
    const doc = yaml.parse(await readFile(SCHEMA('evidence.ui.yaml'), 'utf-8')) as Record<string, any>
    expect(doc.schemaId).toBe(EVIDENCE_SCHEMA_ID)
    return doc
  }

  it('the Sources array field declares its item hints under `items` (the key UISpecLoader validates), not under the inert `properties` key', async () => {
    const doc = await loadUiDoc()
    const sourcesField = doc.form.sections
      .flat()
      .map((s: any) => s.fields ?? [])
      .flat()
      .find((f: any) => f?.path === '$.sources')
    expect(sourcesField, 'the $.sources form field must exist').toBeDefined()
    expect(sourcesField.widget).toBe('array')
    // The inert shape must be gone (the loader does not forward `properties`).
    expect(sourcesField.properties, 'inert `properties:` item hints must not remain').toBeUndefined()
    const items = sourcesField.items
    expect(items, 'item hints must ride the loader-honored `items:` key').toBeDefined()
    // The house item-hint shape (inferFieldHint: object widget over the
    // item's sub-fields; the item's ref is a canonical record ref).
    expect(items.widget).toBe('object')
    const sub = items.fields as Array<Record<string, unknown>>
    const byName = new Map<string, Record<string, unknown>>()
    for (const f of sub) byName.set(String(f.path ?? f.label ?? ''), f)
    const typeHint = byName.get('type')!
    expect(typeHint, 'the item `type` sub-field hint must be present').toBeDefined()
    expect(typeHint.widget).toBe('select')
    const refHint = byName.get('ref')!
    expect(refHint, 'the item `ref` sub-field hint must be present').toBeDefined()
    expect(refHint.widget).toBe('record-ref')
  })

  it('the item `type` select options mirror the REAL schema enum (a drifted option set is caught here, not at create time)', async () => {
    const [doc, realEnum] = await Promise.all([loadUiDoc(), loadRealEvidenceEnum()])
    const sourcesField = doc.form.sections
      .flat()
      .map((s: any) => s.fields ?? [])
      .flat()
      .find((f: any) => f?.path === '$.sources')
    const typeOptions = sourcesField.items.fields.find((f: any) => String(f.path) === 'type').options as Array<{ value: string }>
    expect(typeOptions.map((o) => o.value).sort()).toEqual([...realEnum].sort())
  })

  it('no inert `properties:` item-hint block remains in the file (a file-level grep pin for the dead config)', async () => {
    const text = await readFile(SCHEMA('evidence.ui.yaml'), 'utf-8')
    const sourcesBlock = text.slice(text.indexOf('path: "$.sources"'))
    const nextField = sourcesBlock.indexOf('- path: "$.assessment"')
    const sourcesOnly = nextField !== -1 ? sourcesBlock.slice(0, nextField) : sourcesBlock
    expect(sourcesOnly, 'the Sources field block must carry no `properties:` member').not.toMatch(/^\s*properties:/m)
  })
})
