/**
 * Open-studies list — per-user browser-session state for the project tab
 * strip in the topbar.
 *
 * This is intentionally NOT in the per-study `workspace.yaml`. Which
 * studies a *user* has open in their browser is a session concept; if
 * someone else opens the same study they should not have your other tabs
 * appear. Per-study layout (open viewer tabs inside a study, pane widths)
 * IS shared via `workspace.yaml`.
 *
 * Storage key: `cl-open-studies`. Value: a JSON array of:
 *   { studyId: string; title?: string; openedAt: string /* ISO *\/ }
 *
 * Reads tolerate missing/corrupt JSON and fall back to an empty list.
 */

const STORAGE_KEY = 'cl-open-studies'

export interface OpenStudyEntry {
  studyId: string
  /** Cached title for quick render before the study record loads. */
  title?: string
  /** ISO timestamp the study was added — used as a stable tie-break for ordering. */
  openedAt: string
}

function readStorage(): OpenStudyEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: OpenStudyEntry[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      if (typeof e.studyId !== 'string' || typeof e.openedAt !== 'string') continue
      const cleaned: OpenStudyEntry = {
        studyId: e.studyId,
        openedAt: e.openedAt,
      }
      if (typeof e.title === 'string') cleaned.title = e.title
      out.push(cleaned)
    }
    return out
  } catch {
    return []
  }
}

function writeStorage(entries: OpenStudyEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage may be unavailable (private browsing, quota). Tab-strip
    // state is a nice-to-have, not load-bearing — silently degrade.
  }
}

/** Get the current list of open studies, in display order. */
export function listOpenStudies(): OpenStudyEntry[] {
  return readStorage()
}

/**
 * Add a study to the list. Idempotent on `studyId`: re-opening an already
 * open study updates its cached title but does not reorder it (browser-tab
 * UX — open tabs stay where they are).
 */
export function openStudy(studyId: string, title?: string): OpenStudyEntry[] {
  const existing = readStorage()
  const idx = existing.findIndex((e) => e.studyId === studyId)
  if (idx >= 0) {
    if (title && existing[idx].title !== title) {
      const updated = [...existing]
      updated[idx] = { ...updated[idx], title }
      writeStorage(updated)
      return updated
    }
    return existing
  }
  const entry: OpenStudyEntry = {
    studyId,
    openedAt: new Date().toISOString(),
    ...(title ? { title } : {}),
  }
  const next = [...existing, entry]
  writeStorage(next)
  return next
}

/** Remove a study from the open list. */
export function closeStudy(studyId: string): OpenStudyEntry[] {
  const existing = readStorage()
  const next = existing.filter((e) => e.studyId !== studyId)
  if (next.length === existing.length) return existing
  writeStorage(next)
  return next
}

/**
 * Reorder the open studies. Pass the full list in the desired order;
 * entries not present in the new order are dropped (so this can also serve
 * as a "set the open list" primitive). Studies in the new order that are
 * not in storage are ignored — callers should `openStudy` them first.
 */
export function reorderOpenStudies(
  studyIds: string[],
): OpenStudyEntry[] {
  const existing = readStorage()
  const byId = new Map(existing.map((e) => [e.studyId, e]))
  const reordered: OpenStudyEntry[] = []
  for (const id of studyIds) {
    const entry = byId.get(id)
    if (entry) reordered.push(entry)
  }
  writeStorage(reordered)
  return reordered
}

/** Update a study's cached title without changing position. */
export function setOpenStudyTitle(
  studyId: string,
  title: string,
): OpenStudyEntry[] {
  const existing = readStorage()
  const idx = existing.findIndex((e) => e.studyId === studyId)
  if (idx < 0) return existing
  if (existing[idx].title === title) return existing
  const next = [...existing]
  next[idx] = { ...next[idx], title }
  writeStorage(next)
  return next
}

/** Test/QA helper — clear the entire open-studies list. */
export function clearOpenStudies(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Exposed for tests. Production code should not depend on the key name. */
export const OPEN_STUDIES_STORAGE_KEY = STORAGE_KEY
