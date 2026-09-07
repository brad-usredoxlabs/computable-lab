import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CredentialStore, hashPassword, verifyPassword } from './CredentialStore.js'

const tmp = resolve(tmpdir(), 'cl-credential-store-test')

beforeEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('CredentialStore', () => {
  it('persists a verifier for a user and retrieves it back', async () => {
    const store = new CredentialStore(join(tmp, 'auth'))
    await store.setVerifier('USR-BRAD', 'hashed-password-not-plaintext')
    const hash = await store.getVerifier('USR-BRAD')
    expect(hash).toBe('hashed-password-not-plaintext')
  })

  it('returns null for a user with no credential', async () => {
    const store = new CredentialStore(join(tmp, 'auth'))
    expect(await store.getVerifier('USR-NOBODY')).toBeNull()
  })

  it('hasCredential reflects presence', async () => {
    const store = new CredentialStore(join(tmp, 'auth'))
    expect(await store.hasCredential('USR-BRAD')).toBe(false)
    await store.setVerifier('USR-BRAD', 'abc')
    expect(await store.hasCredential('USR-BRAD')).toBe(true)
  })

  it('never stores the plaintext password (hashPassword output is what persists)', async () => {
    const store = new CredentialStore(join(tmp, 'auth'))
    const verifier = hashPassword('super-secret-password-xyz')
    await store.setVerifier('USR-BRAD', verifier)
    const raw = readFileSync(resolve(join(tmp, 'auth'), 'credentials.json'), 'utf8')
    expect(raw).toContain('USR-BRAD')
    expect(raw).not.toContain('super-secret-password-xyz')
  })

  it('hashPassword + verifyPassword round-trips a plaintext password', async () => {
    const verifier = hashPassword('hunter2secret')
    expect(verifyPassword('hunter2secret', verifier)).toBe(true)
    expect(verifyPassword('hunter2other', verifier)).toBe(false)
  })

  it('verifyPassword rejects a malformed verifier', async () => {
    expect(verifyPassword('x', 'not-a-hash-colon-salt')).toBe(false)
    expect(verifyPassword('x', 'onlyhash')).toBe(false)
  })

  it('survives a reload (file-backed)', async () => {
    const dir = join(tmp, 'auth')
    const a = new CredentialStore(dir)
    await a.setVerifier('USR-APRIL', 'h1')
    const b = new CredentialStore(dir)
    expect(await b.getVerifier('USR-APRIL')).toBe('h1')
  })
})