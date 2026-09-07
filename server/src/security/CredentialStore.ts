/**
 * CredentialStore — password verifiers for local users.
 *
 * Lives in `server.dataDir/auth/` (a durable, NON-git path) — user IDENTITY
 * records (username, displayName, email) stay in the records repo, but the
 * credential is a secret and must NOT propagate to a shared/remote records
 * repo. Keyed by user id (USR-*).
 *
 * We store a scrypt hash (never the plaintext) so a leak of this file does
 * not hand out usable passwords. The verifier is a "hash:salt" string.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface CredentialEntry {
  userId: string
  passwordHash: string
}

const FILE_NAME = 'credentials.json'

export class CredentialStore {
  private readonly file: string
  private cache: Map<string, string> | null = null

  constructor(dataDir: string) {
    this.file = resolve(join(dataDir, FILE_NAME))
  }

  private load(): Map<string, string> {
    if (this.cache) return this.cache
    const map = new Map<string, string>()
    try {
      const raw = readFileSync(this.file, 'utf8')
      const data = JSON.parse(raw) as CredentialEntry[]
      for (const entry of data ?? []) {
        if (entry && typeof entry.userId === 'string' && typeof entry.passwordHash === 'string') {
          map.set(entry.userId, entry.passwordHash)
        }
      }
    } catch {
      // no file yet → empty map
    }
    this.cache = map
    return map
  }

  private persist(): void {
    const dir = dirname(this.file)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      this.file,
      JSON.stringify(
        [...this.load().entries()].map(([userId, passwordHash]) => ({ userId, passwordHash })),
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }

  async setVerifier(userId: string, passwordHash: string): Promise<void> {
    const map = this.load()
    map.set(userId, passwordHash)
    this.persist()
  }

  getVerifier(userId: string): Promise<string | null> {
    return Promise.resolve(this.load().get(userId) ?? null)
  }

  hasCredential(userId: string): Promise<boolean> {
    return Promise.resolve(this.load().has(userId))
  }
}

/** Derive a scrypt verifier string "hash:salt" from a plaintext password. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${hash}:${salt}`
}

/** Constant-time compare of a plaintext password against a stored verifier. */
export function verifyPassword(password: string, stored: string): boolean {
  const [hash, salt] = stored.split(':')
  if (!hash || !salt) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}