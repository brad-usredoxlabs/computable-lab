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

  // DOCINGEST-A A4 — the source stops assuming exa+pdf. An uploaded lab
  // document has no Exa provenance: engine 'upload' + no url + file.sha256
  // (the D2 conditional already waives url) must validate, and the new
  // source fields (mediaKind, originalFileName) must be DECLARED — `source`
  // is additionalProperties:false, so an undeclared field fails the real
  // envelope at runtime even when unit tests skip createEnvelope.
  it('accepts engine:"upload" with no url (truth is file.sha256) + mediaKind + originalFileName', () => {
    const payload = {
      ...basePayload(),
      source: {
        engine: 'upload',
        ingestedAt: '2026-10-13T12:00:00.000Z',
        pageCount: 1,
        mediaKind: 'text',
        originalFileName: 'lysis.md',
      },
      file: {
        file_name: 'lysis.md',
        media_type: 'text/markdown',
        size_bytes: 42,
        sha256: '5256f3288e3c0000000000000000000000000000000000000000000000000000',
        stored_path: 'artifacts/foundry/pdfs/5256f3288e3c.md',
      },
      extractedText: [{ pageNumber: 1, text: '# Lysis protocol' }],
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, JSON.stringify(result.errors)).toBe(true)
  })

  it('rejects an unknown engine (the enum is the contract, not a free string)', () => {
    const payload = {
      ...basePayload(),
      source: { engine: 'nonsense', ingestedAt: '2026-10-13T12:00:00.000Z' },
      file: {
        file_name: 'x.md',
        media_type: 'text/markdown',
        sha256: '5256f3288e3c0000000000000000000000000000000000000000000000000000',
        stored_path: 'artifacts/foundry/pdfs/5256f3288e3c.md',
      },
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, 'engine must be one of the declared enum values').toBe(false)
    expect(JSON.stringify(result.errors)).toContain('engine')
  })

  it('rejects an unknown source.mediaKind (the enum reserves image for Stage B)', () => {
    const payload = {
      ...basePayload(),
      source: {
        engine: 'upload',
        ingestedAt: '2026-10-13T12:00:00.000Z',
        mediaKind: 'hologram',
      },
      file: {
        file_name: 'x.md',
        media_type: 'text/markdown',
        sha256: '5256f3288e3c0000000000000000000000000000000000000000000000000000',
        stored_path: 'artifacts/foundry/pdfs/5256f3288e3c.md',
      },
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, 'mediaKind must be one of pdf|text|spreadsheet|image').toBe(false)
  })

  it('D2 still bites an upload: removing file.sha256 from an engine:upload payload makes it un-storable', () => {
    // Mutation probe (spec bait 6): the upload path has no url, so dropping
    // the content hash drops ALL traceable provenance.
    const payload = {
      ...basePayload(),
      source: {
        engine: 'upload',
        ingestedAt: '2026-10-13T12:00:00.000Z',
        mediaKind: 'text',
        originalFileName: 'lysis.md',
      },
      file: {
        file_name: 'lysis.md',
        media_type: 'text/markdown',
        stored_path: 'artifacts/foundry/pdfs/lysis.md',
      },
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, 'an upload without file.sha256 and without url has no truth').toBe(false)
  })

  it('accepts extractionDiagnostics on an upload payload (the honest DOCX state must be STORABLE)', () => {
    // S5 honesty: a .docx stored without a reader must carry its diagnostic
    // ON THE RECORD — the review page shows it. If the schema could not hold
    // it, the honest state would be un-storable and the record would render
    // as a blank success.
    const payload = {
      ...basePayload(),
      source: {
        engine: 'upload',
        ingestedAt: '2026-10-13T12:00:00.000Z',
        mediaKind: 'text',
        originalFileName: 'demo-sop.docx',
      },
      file: {
        file_name: 'demo-sop.docx',
        media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sha256: '5256f3288e3c0000000000000000000000000000000000000000000000000000',
        stored_path: 'artifacts/foundry/pdfs/5256f3288e3c.docx',
      },
      extractedText: [{ pageNumber: 1, text: '' }],
      extractionDiagnostics: [
        { severity: 'error', code: 'DOCX_TOOL_MISSING', message: 'The configured DOCX reader "pandoc" is not installed on this host.' },
      ],
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, JSON.stringify(result.errors)).toBe(true)
  })

  it('rejects a malformed extractionDiagnostics entry (severity is a declared enum)', () => {
    const payload = {
      ...basePayload(),
      source: { engine: 'upload', ingestedAt: '2026-10-13T12:00:00.000Z', mediaKind: 'text' },
      file: {
        file_name: 'x.md',
        media_type: 'text/markdown',
        sha256: '5256f3288e3c0000000000000000000000000000000000000000000000000000',
        stored_path: 'artifacts/foundry/pdfs/5256f3288e3c.md',
      },
      extractionDiagnostics: [{ severity: 'fatal', code: 'X', message: 'not a declared severity' }],
    }
    const result = validator.validate(payload, VENDOR_PDF_SCHEMA_ID)
    expect(result.valid, 'severity must be info|warning|error').toBe(false)
  })
})
