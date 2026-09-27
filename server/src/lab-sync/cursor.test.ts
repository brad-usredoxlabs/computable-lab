import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CursorStore } from './cursor.js'

describe('CursorStore', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cl-cursor-'))
    file = join(dir, 'lab-sync', 'cursor.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('starts at cursor 0 when the file is absent', async () => {
    const store = new CursorStore(file)
    expect(await store.load()).toEqual({ cursor: 0 })
  })

  it('persists and reloads atomically', async () => {
    const store = new CursorStore(file)
    await store.save(123, '2026-09-26T17:42:31-04:00')
    expect(await store.load()).toEqual({ cursor: 123, ackedAt: '2026-09-26T17:42:31-04:00' })
  })

  it('is monotonic: a lower cursor is a no-op', async () => {
    const store = new CursorStore(file)
    await store.save(18273)
    await store.save(5)
    expect((await store.load()).cursor).toBe(18273)
  })

  it('equal cursor is a no-op (no timestamp churn)', async () => {
    const store = new CursorStore(file)
    await store.save(10, '2026-01-01T00:00:00-04:00')
    await store.save(10, '2026-01-02T00:00:00-04:00')
    expect((await store.load()).ackedAt).toBe('2026-01-01T00:00:00-04:00')
  })

  it('corrupt file surfaces loudly instead of silently resetting to 0', async () => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, 'not json', 'utf8')
    const store = new CursorStore(file)
    await expect(store.load()).rejects.toThrow()
  })

  it('negative or non-integer cursor in file resets to 0', async () => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ cursor: -3 }), 'utf8')
    const store = new CursorStore(file)
    expect(await store.load()).toEqual({ cursor: 0 })
  })
})
