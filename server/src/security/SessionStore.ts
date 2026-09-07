/**
 * SessionStore — opaque per-user session tokens.
 *
 * A token is a random opaque string mapping to a user id, persisted under
 * `server.dataDir/auth/` so logins survive a server restart. Lives beside the
 * CredentialStore (non-git). resolve() returns null for unknown/revoked.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

interface SessionEntry {
  token: string
  userId: string
  createdAt: string
}

const FILE_NAME = 'sessions.json'

export class SessionStore {
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
      const data = JSON.parse(raw) as SessionEntry[]
      for (const entry of data ?? []) {
        if (entry && typeof entry.token === 'string' && typeof entry.userId === 'string') {
          map.set(entry.token, entry.userId)
        }
      }
    } catch {
      // no file yet
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
        [...this.load().entries()].map(([token, userId]) => ({
          token,
          userId,
          createdAt: new Date().toISOString(),
        })),
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }

  async create(userId: string): Promise<string> {
    const token = `cl-sess-${randomUUID().replace(/-/g, '')}`
    this.load().set(token, userId)
    this.persist()
    return token
  }

  resolve(token: string): Promise<string | null> {
    return Promise.resolve(this.load().get(token) ?? null)
  }

  async revoke(token: string): Promise<void> {
    if (this.load().delete(token)) this.persist()
  }
}