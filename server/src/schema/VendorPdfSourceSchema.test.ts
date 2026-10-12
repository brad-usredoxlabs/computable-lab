/**
 * W2-8-FIX2 D2 — vendor-pdf source contract: URL-ingest vs content-upload.
 *
 * A vendor-pdf's `source` records WHERE the document came from. The exa URL
 * ingest path has a url; the upload-by-content path has NO url — its truth is
 * the content-addressed file (file.sha256 + stored_path). The schema must
 * require url for the URL-ingest shape WITHOUT rejecting a content upload
 * that honestly carries no url (the upload handler must never fabricate one).
 *
 * Conditional convention follows the repo's existing if/then usage
 * (schema/core/datatypes/quantity.schema.yaml, provenance-rung-ref.schema.yaml).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSchemaRegistry } from './SchemaRegistry.js'
import { loadSchemasFromContent } from './SchemaLoader.js'
import { createValidator } from '../validation/AjvValidator.js'

const VENDOR_PDF_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-pdf.schema.yaml'

describe('VendorPdf source schema contract (D2)', () => {
  let validator: ReturnType<typeof createValidator>

  beforeEach(async () => {
    const registry = createSchemaRegistry()
    // strict:true mirrors the server runtime (AjvValidator default) so this
    // contract test catches strictTypes issues the server would hit (W2-8-FIX2).
    validator = createValidator({ strict: true })
    const schemaRoot = join(process.cwd(), '..', 'schema')
    const paths = [
      'lab/vendor-pdf.schema.yaml',
      'core/common.schema.yaml',
      'core/datatypes/file-ref.schema.yaml',
      'core/datatypes/ref.schema.yaml',
    ]
    const contents = new Map<string, string>()
    for (const path of paths) contents.set(path, await readFile(join(schemaRoot, path), 'utf8'))
    const result = loadSchemasFromContent(contents)
    expect(result.errors).toEqual([])
    registry.addSchemas(result.entries)
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id)
      if (entry) validator.addSchema(entry.schema, entry.id)
    }
  })

  function basePayload(): Record<string, unknown> {
    return {
      kind: 'vendor-pdf',
      recordId: 'VPDF-CONTRACTTEST01',
      title: 'Contract test vendor pdf',
      state: 'ingested',
      source: {
        engine: 'exa',
        ingestedAt: '2026-10-10T12:00:00.000Z',
      },
      extractedText: [],
    }
  }

  it('accepts a content-upload payload WITHOUT source.url (truth is file.sha256 + stored_path)', () => {
    const payload = {
      ...basePayload(),
      file: {
        file_name: 'w28-gate-said.pdf',
        media_type: 'application/pdf',
        size_bytes: 1234,
        sha256: '5256f3288e3c0000000000000000000000000000000000000000000000000000',
        stored_path: 'artifacts/foundry/pdfs/5256f3288e3c.pdf',
      },
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, JSON.stringify(result.errors)).toBe(true)
  })

  it('still rejects a URL-ingest payload (no file block) without source.url', () => {
    // No file block: the record claims provenance only through the source —
    // without a url there is nothing to trace. This is the shape the schema
    // guarded before and must keep guarding.
    const payload = basePayload()
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, 'a url-less, file-less vendor-pdf must stay invalid').toBe(false)
    expect(JSON.stringify(result.errors)).toContain('url')
  })

  it('accepts the URL-ingest payload WITH source.url (every existing valid record stays valid)', () => {
    const payload = {
      ...basePayload(),
      source: {
        engine: 'exa',
        url: 'https://files.thermofisher.com/manuals/protocol.pdf',
        vendor: 'thermo',
        query: 'zymo biomics protocol',
        ingestedAt: '2026-10-10T12:00:00.000Z',
        pageCount: 8,
      },
      file: {
        file_name: 'protocol.pdf',
        media_type: 'application/pdf',
        source_url: 'https://files.thermofisher.com/manuals/protocol.pdf',
        size_bytes: 4096,
        sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        stored_path: 'artifacts/foundry/pdfs/abc123def456.pdf',
        page_count: 8,
      },
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, JSON.stringify(result.errors)).toBe(true)
  })

  it('rejects a content-upload payload that carries NEITHER file.sha256 NOR source.url (no truth at all)', () => {
    const payload = {
      ...basePayload(),
      file: {
        file_name: 'orphan.pdf',
        media_type: 'application/pdf',
      },
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, 'a file block without content truth and no url must be refused').toBe(false)
  })
})
