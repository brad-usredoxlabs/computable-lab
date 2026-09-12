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

  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})