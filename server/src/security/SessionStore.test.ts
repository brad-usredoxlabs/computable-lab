import { rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionStore } from './SessionStore.js'

const tmp = resolve(tmpdir(), 'cl-session-store-test')

beforeEach(() => rmSync(tmp, { recursive: true, force: true }))
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('SessionStore', () => {
  it('creates a token that resolves back to the user', async () => {
    const store = new SessionStore(join(tmp, 'auth'))
    const token = await store.create('USR-BRAD')
    expect(token).toMatch(/^cl-sess-[a-z0-9]+$/)
    expect(await store.resolve(token)).toBe('USR-BRAD')
  })

  it('resolves null for an unknown token', async () => {
    const store = new SessionStore(join(tmp, 'auth'))
    expect(await store.resolve('cl-sess-nope')).toBeNull()
  })

  it('resolves null after revoke', async () => {
    const store = new SessionStore(join(tmp, 'auth'))
    const token = await store.create('USR-BRAD')
    await store.revoke(token)
    expect(await store.resolve(token)).toBeNull()
  })

  it('creates distinct tokens per session (no collision)', async () => {
    const store = new SessionStore(join(tmp, 'auth'))
    const a = await store.create('USR-BRAD')
    const b = await store.create('USR-BRAD')
    expect(a).not.toBe(b)
  })
})