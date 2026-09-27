/**
 * Cursor persistence for the lab-sync worker.
 *
 * The cursor is sync machinery state, not lab knowledge — it lives outside
 * the records tree (worktree var/ directory, not git-tracked records).
 * Durability order per spec §2: records written + git committed -> ack the
 * website -> persist cursor locally. A crash between ack and persist means
 * re-pull of already-processed events, which the event_id dedupe absorbs.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface CursorState {
  /** Last cursor durably acked by the website. Poll resumes strictly after it. */
  cursor: number
  /** ISO timestamp of the last successful ack (observability). */
  ackedAt?: string
}

export class CursorStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<CursorState> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<CursorState>
      const cursor = typeof parsed.cursor === 'number' && Number.isInteger(parsed.cursor) && parsed.cursor >= 0
        ? parsed.cursor
        : 0
      return {
        cursor,
        ...(typeof parsed.ackedAt === 'string' ? { ackedAt: parsed.ackedAt } : {}),
      }
    } catch (err) {
      if (isNotFound(err)) return { cursor: 0 }
      throw err
    }
  }

  /**
   * Atomically persist (write temp + rename). Monotonic: a lower cursor is a
   * no-op, mirroring the website's ack semantics.
   */
  async save(cursor: number, ackedAt?: string): Promise<CursorState> {
    const current = await this.load()
    if (cursor <= current.cursor) return current
    const next: CursorState = {
      cursor,
      ...(ackedAt !== undefined ? { ackedAt } : {}),
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
    await rename(tmp, this.filePath)
    return next
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}
