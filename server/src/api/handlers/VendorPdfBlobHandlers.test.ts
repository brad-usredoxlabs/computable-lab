/**
 * Tests for the vendor-pdf blob endpoint.
 *
 * Coverage:
 *  - 400 on malformed recordId
 *  - 404 when no such record exists
 *  - 404 when the record has no `file.stored_path`
 *  - 400 when stored_path tries to escape the workspace root
 *  - 404 when stored_path file does not exist on disk
 *  - 200 on the happy path with content-type from media_type
 *
 * The handler talks to the RecordStore via the interface; we stub it with a
 * tiny in-memory store, matching ArtifactBlobHandlers.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'
import type { RecordStore } from '../../store/types.js'
import { createVendorPdfBlobHandlers } from './VendorPdfBlobHandlers.js'

function makeReply() {
  let statusCode = 200
  let body: unknown = undefined
  const headers: Record<string, string> = {}
  const reply = {
    status(code: number) {
      statusCode = code
      return reply
    },
    header(name: string, value: string) {
      headers[name.toLowerCase()] = value
      return reply
    },
    send(payload: unknown) {
      body = payload
      return reply
    },
  } as unknown as FastifyReply
  return {
    reply,
    get statusCode() {
      return statusCode
    },
    get body() {
      return body
    },
    get headers() {
      return headers
    },
  }
}

function makeRequest<P>(params: P): FastifyRequest<{ Params: P }> {
  return { params } as unknown as FastifyRequest<{ Params: P }>
}

function makeVendorPdfEnvelope(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: 'vendor-pdf', payload, meta: { kind: 'vendor-pdf' } }
}

function makeStubStore(envelopes: RecordEnvelope[]): RecordStore {
  const byId = new Map(envelopes.map((e) => [e.recordId, e]))
  return {
    async get(id: string) {
      return byId.get(id) ?? null
    },
    async getByPath() {
      return null
    },
    async getWithValidation() {
      return { success: false }
    },
    async list() {
      return []
    },
    async create() {
      return { success: false }
    },
    async update() {
      return { success: false }
    },
    async delete() {
      return { success: false }
    },
    async validate() {
      return { valid: true, errors: [] }
    },
    async lint() {
      return { valid: true, errors: [] }
    },
    async exists() {
      return false
    },
  } as unknown as RecordStore
}

describe('VendorPdfBlobHandlers', () => {
  let workspaceRoot: string

  beforeEach(async () => {
    workspaceRoot = join(tmpdir(), `vendor-pdf-blob-${randomUUID()}`)
    await mkdir(workspaceRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  function makeHandlers(envelopes: RecordEnvelope[]) {
    return createVendorPdfBlobHandlers({
      recordStore: makeStubStore(envelopes),
      workspaceRoot,
    })
  }

  it('rejects malformed recordId with 400', async () => {
    const handlers = makeHandlers([])
    const reply = makeReply()
    await handlers.getVendorPdfBlob(makeRequest({ recordId: 'not-a-vpdf' }), reply.reply)
    expect(reply.statusCode).toBe(400)
  })

  it('returns 404 when the record does not exist', async () => {
    const handlers = makeHandlers([])
    const reply = makeReply()
    await handlers.getVendorPdfBlob(makeRequest({ recordId: 'VPDF-000000000000' }), reply.reply)
    expect(reply.statusCode).toBe(404)
  })

  it('returns 404 when the record has no stored file', async () => {
    const handlers = makeHandlers([
      makeVendorPdfEnvelope('VPDF-000000000000', { title: 'CellROX' }),
    ])
    const reply = makeReply()
    await handlers.getVendorPdfBlob(makeRequest({ recordId: 'VPDF-000000000000' }), reply.reply)
    expect(reply.statusCode).toBe(404)
  })

  it('rejects path-traversal in stored_path with 400', async () => {
    const handlers = makeHandlers([
      makeVendorPdfEnvelope('VPDF-000000000000', {
        file: { stored_path: '../../../../etc/passwd', media_type: 'application/pdf' },
      }),
    ])
    const reply = makeReply()
    await handlers.getVendorPdfBlob(makeRequest({ recordId: 'VPDF-000000000000' }), reply.reply)
    expect(reply.statusCode).toBe(400)
  })

  it('returns 404 when stored_path file does not exist on disk', async () => {
    const handlers = makeHandlers([
      makeVendorPdfEnvelope('VPDF-000000000000', {
        file: { stored_path: 'pdfs/missing.pdf', media_type: 'application/pdf' },
      }),
    ])
    const reply = makeReply()
    await handlers.getVendorPdfBlob(makeRequest({ recordId: 'VPDF-000000000000' }), reply.reply)
    expect(reply.statusCode).toBe(404)
  })

  it('happy path: streams the file with correct headers', async () => {
    const pdfPath = join(workspaceRoot, 'artifacts/foundry/pdfs/sample.pdf')
    await mkdir(join(workspaceRoot, 'artifacts/foundry/pdfs'), { recursive: true })
    const content = '%PDF-1.5 fake content for test'
    await writeFile(pdfPath, content, 'utf-8')

    const handlers = makeHandlers([
      makeVendorPdfEnvelope('VPDF-000000000000', {
        file: {
          file_name: 'sample.pdf',
          media_type: 'application/pdf',
          stored_path: 'artifacts/foundry/pdfs/sample.pdf',
        },
      }),
    ])
    const reply = makeReply()
    await handlers.getVendorPdfBlob(makeRequest({ recordId: 'VPDF-000000000000' }), reply.reply)
    expect(reply.statusCode).toBe(200)
    expect(reply.headers['content-type']).toBe('application/pdf')
    expect(reply.headers['content-length']).toBe(String(content.length))
    expect(reply.headers['content-disposition']).toContain('sample.pdf')
  })

  // DOCINGEST-B B3 — the page-image route. It serves the record's OWN kept
  // page images from the per-record page dir (vendorPdfPageDir), refuses
  // anything else. The `../..` arm is plan-B3-MANDATED (bait 2).
  describe('getPageImage (GET /vendor-pdfs/:recordId/page/:pageNumber)', () => {
    const sha12 = 'abc123def456'

    async function seedImageRecord(mediaKind: string | undefined, storedPath = `artifacts/foundry/pdfs/${sha12}.png`) {
      // vendorPdfPageDir's shape, asserted here so the test and the writer
      // agree on the ONE convention.
      const pageDir = join(workspaceRoot, 'artifacts', 'foundry', 'pdfs', 'pages', sha12)
      await mkdir(pageDir, { recursive: true })
      await writeFile(join(pageDir, 'page-001.png'), 'fake-png-bytes', 'utf-8')
      return makeHandlers([
        makeVendorPdfEnvelope('VPDF-IMAGING000', {
          source: { engine: 'upload', ingestedAt: '2026-10-13T12:00:00.000Z', ...(mediaKind ? { mediaKind } : {}) },
          file: { file_name: 'photographed-page.png', media_type: 'image/png', stored_path: storedPath },
        }),
      ])
    }

    it('serves the record\u2019s own page PNG with image/png', async () => {
      const handlers = await seedImageRecord('image')
      const reply = makeReply()
      await handlers.getPageImage(makeRequest({ recordId: 'VPDF-IMAGING000', pageNumber: '1' }), reply.reply)
      expect(reply.statusCode).toBe(200)
      expect(reply.headers['content-type']).toBe('image/png')
      expect(reply.body, 'a stream is sent, not a zero-byte auto-reply').toBeTruthy()
    })

    it('pageNumber "../.." (and URL-encoded / non-numeric / huge) -> 404 BEFORE any filesystem contact (plan-B3-mandated)', async () => {
      const handlers = await seedImageRecord('image')
      for (const pageNumber of ['../..', '..%2f..', '1/../..', '/etc/passwd', '0', '999999999999999999999', '1%00', 'abc']) {
        const reply = makeReply()
        await handlers.getPageImage(makeRequest({ recordId: 'VPDF-IMAGING000', pageNumber }), reply.reply)
        expect(reply.statusCode, `pageNumber ${JSON.stringify(pageNumber)} must 404`).toBe(404)
      }
    })

    it('missing page (page 99) -> 404 honest no-page', async () => {
      const handlers = await seedImageRecord('image')
      const reply = makeReply()
      await handlers.getPageImage(makeRequest({ recordId: 'VPDF-IMAGING000', pageNumber: '99' }), reply.reply)
      expect(reply.statusCode).toBe(404)
      expect((reply.body as { error?: string }).error).toBe('PAGE_NOT_FOUND')
    })

    it('non-image record (mediaKind pdf or absent) -> 404: only image-kind records have page images', async () => {
      for (const mediaKind of ['pdf', undefined]) {
        const handlers = await seedImageRecord(mediaKind)
        const reply = makeReply()
        await handlers.getPageImage(makeRequest({ recordId: 'VPDF-IMAGING000', pageNumber: '1' }), reply.reply)
        expect(reply.statusCode, `mediaKind ${String(mediaKind)} has no page images`).toBe(404)
      }
    })

    it('a crafted stored_path cannot move the page dir outside the workspace (resolve+prefix guard)', async () => {
      const handlers = await seedImageRecord('image', '../../../../etc/foundry/pdfs/abc123def456.png')
      const reply = makeReply()
      await handlers.getPageImage(makeRequest({ recordId: 'VPDF-IMAGING000', pageNumber: '1' }), reply.reply)
      expect(reply.statusCode).toBe(400)
      expect((reply.body as { error?: string }).error).toBe('PATH_TRAVERSAL')
    })

    it('unknown record -> 404; malformed recordId -> 400 (mirrors the blob guard shape)', async () => {
      const handlers = makeHandlers([])
      const reply = makeReply()
      await handlers.getPageImage(makeRequest({ recordId: 'VPDF-NOPE000000', pageNumber: '1' }), reply.reply)
      expect(reply.statusCode).toBe(404)
      const bad = makeReply()
      await handlers.getPageImage(makeRequest({ recordId: 'not-a-vpdf', pageNumber: '1' }), bad.reply)
      expect(bad.statusCode).toBe(400)
    })
  })

  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})