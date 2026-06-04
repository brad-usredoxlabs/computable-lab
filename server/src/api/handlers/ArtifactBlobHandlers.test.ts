/**
 * Tests for the artifact blob endpoint.
 *
 * Coverage:
 *  - 400 on malformed studyId / artifactId
 *  - 404 when no such artifact record exists
 *  - 404 when the record's `meta.kind` isn't `artifact`
 *  - 404 when the artifact has no `file.stored_path`
 *  - 404 when the artifact's studyId disagrees with the URL
 *  - 400 when stored_path tries to escape the workspace root
 *  - 200 on the happy path with content-type from media_type
 *
 * The handler talks to the RecordStore via the interface; we stub it with
 * a tiny in-memory store rather than spinning up the full RecordStoreImpl.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'
import type { RecordStore } from '../../store/types.js'
import { createArtifactBlobHandlers } from './ArtifactBlobHandlers.js'

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

function makeStubStore(envelopes: RecordEnvelope[]): RecordStore {
  const byId = new Map(envelopes.map((e) => [e.recordId, e]))
  return {
    async get(id: string) {
      return byId.get(id) ?? null
    },
    // Methods we don't need for these tests.
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

describe('ArtifactBlobHandlers', () => {
  let workspaceRoot: string

  beforeEach(async () => {
    workspaceRoot = join(tmpdir(), `artifact-blob-${randomUUID()}`)
    await mkdir(workspaceRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('rejects malformed studyId with 400', async () => {
    const handlers = createArtifactBlobHandlers(makeStubStore([]), workspaceRoot)
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: '../passwd', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(400)
  })

  it('rejects malformed artifactId with 400', async () => {
    const handlers = createArtifactBlobHandlers(makeStubStore([]), workspaceRoot)
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'NOT-AN-ART' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(400)
  })

  it('returns 404 when the artifact does not exist', async () => {
    const handlers = createArtifactBlobHandlers(makeStubStore([]), workspaceRoot)
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(404)
  })

  it('returns 404 when the record is not an artifact', async () => {
    const handlers = createArtifactBlobHandlers(
      makeStubStore([
        {
          recordId: 'ART-000001',
          schemaId: 'study',
          payload: { studyId: 'STU-000001' },
          meta: { kind: 'study' },
        },
      ]),
      workspaceRoot,
    )
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(404)
  })

  it('returns 404 when artifact studyId disagrees with URL', async () => {
    const handlers = createArtifactBlobHandlers(
      makeStubStore([
        {
          recordId: 'ART-000001',
          schemaId: 'artifact',
          payload: {
            studyId: 'STU-OTHER',
            artifactKind: 'pdf',
            file: { stored_path: 'whatever.pdf' },
          },
          meta: { kind: 'artifact' },
        },
      ]),
      workspaceRoot,
    )
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(404)
  })

  it('returns 404 when stored_path is missing', async () => {
    const handlers = createArtifactBlobHandlers(
      makeStubStore([
        {
          recordId: 'ART-000001',
          schemaId: 'artifact',
          payload: { studyId: 'STU-000001', artifactKind: 'pdf' },
          meta: { kind: 'artifact' },
        },
      ]),
      workspaceRoot,
    )
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(404)
  })

  it('rejects path-traversal in stored_path with 400', async () => {
    const handlers = createArtifactBlobHandlers(
      makeStubStore([
        {
          recordId: 'ART-000001',
          schemaId: 'artifact',
          payload: {
            studyId: 'STU-000001',
            artifactKind: 'pdf',
            file: { stored_path: '../../../../etc/passwd' },
          },
          meta: { kind: 'artifact' },
        },
      ]),
      workspaceRoot,
    )
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(400)
  })

  it('returns 404 when stored_path file does not exist on disk', async () => {
    const handlers = createArtifactBlobHandlers(
      makeStubStore([
        {
          recordId: 'ART-000001',
          schemaId: 'artifact',
          payload: {
            studyId: 'STU-000001',
            artifactKind: 'pdf',
            file: { stored_path: 'pdfs/missing.pdf' },
          },
          meta: { kind: 'artifact' },
        },
      ]),
      workspaceRoot,
    )
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(404)
  })

  it('happy path: streams the file with correct headers', async () => {
    // Write a fake "PDF" to the workspace, then request it through the handler.
    const pdfPath = join(workspaceRoot, 'artifacts/foundry/pdfs/sample.pdf')
    await mkdir(join(workspaceRoot, 'artifacts/foundry/pdfs'), {
      recursive: true,
    })
    await writeFile(pdfPath, '%PDF-1.5 fake content for test', 'utf-8')

    const handlers = createArtifactBlobHandlers(
      makeStubStore([
        {
          recordId: 'ART-000001',
          schemaId: 'artifact',
          payload: {
            studyId: 'STU-000001',
            artifactKind: 'pdf',
            file: {
              file_name: 'sample.pdf',
              media_type: 'application/pdf',
              stored_path: 'artifacts/foundry/pdfs/sample.pdf',
            },
          },
          meta: { kind: 'artifact' },
        },
      ]),
      workspaceRoot,
    )
    const reply = makeReply()
    await handlers.getArtifactBlob(
      makeRequest({ studyId: 'STU-000001', artifactId: 'ART-000001' }),
      reply.reply,
    )
    expect(reply.statusCode).toBe(200)
    expect(reply.headers['content-type']).toBe('application/pdf')
    // content-length is the byte length of "%PDF-1.5 fake content for test" (30 bytes).
    expect(reply.headers['content-length']).toBe('30')
    expect(reply.headers['content-disposition']).toContain('sample.pdf')
  })

  // Silence stderr from background console.error during the deliberate
  // failure paths.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
