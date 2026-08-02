/**
 * RecentItemsStore — durable, cross-session recently-viewed entities.
 * LocalStorage-persisted, independent of open tabs, capped per entity type.
 */
export interface RecentItem {
  recordId: string
  /** Record `kind` (study | run | claim | material | labware | ... ). */
  kind: string
  title: string
  entityType: 'project' | 'run' | 'claim' | 'lab'
  /** Epoch ms. */
  seenAt: number
}

const KEY = 'cl-recent-items'
const LIMIT = 10 // per entityType bucket

export function loadRecentItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentItem)
  } catch {
    return []
  }
}

function isRecentItem(v: unknown): v is RecentItem {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.recordId === 'string' && typeof r.entityType === 'string'
}

export function saveRecentItems(items: RecentItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // localStorage unavailable/full — silently ignore.
  }
}

/** Push a viewed item: dedupe by recordId, newest first, cap per entityType to LIMIT. */
export function recordView(item: Omit<RecentItem, 'seenAt'>): void {
  const items = loadRecentItems()
  const next = [
    { ...item, seenAt: Date.now() },
    ...items.filter((i) => i.recordId !== item.recordId),
  ]
  const counts: Record<string, number> = {}
  const capped: RecentItem[] = []
  for (const it of next) {
    const key = it.entityType
    const c = counts[key] ?? 0
    if (c >= LIMIT) continue
    counts[key] = c + 1
    capped.push(it)
  }
  saveRecentItems(capped)
}

/** Group items by entityType, preserving newest-first order. */
export function groupRecentByType(items: RecentItem[]): Record<string, RecentItem[]> {
  return items.reduce<Record<string, RecentItem[]>>((acc, it) => {
    ;(acc[it.entityType] ??= []).push(it)
    return acc
  }, {})
}
