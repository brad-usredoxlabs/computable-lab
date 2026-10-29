/**
 * threadTabIds — THE SINGLE per-(tab, scope) thread-id mint (L2-THREAD-SCOPED-1,
 * adversarial-review defect 3).
 *
 * Spec §4.1/§4.7: ONE module owns the sessionStorage map `cl.ai-thread-tab-ids`
 * (a JSON map { [scope or ""]: threadId }) and the mint-once rule. The hook
 * (useAiChat) and the transport (aiThreadClient.threadHeaders) BOTH consume
 * these helpers — there is no second read/write/mint implementation anywhere.
 * (The previous shape forked the map logic inside useAiChat because old hook
 * tests' vi.mock factories of aiThreadClient throw on missing exports; with
 * the logic in its own module the hook imports the mint from here instead,
 * so the fork is gone: the hydrated thread id and the wire header id can
 * never disagree, even with no sessionStorage.)
 *
 * Amendment A-1: `crypto.randomUUID()` minted ONCE per map entry; the module
 * NEVER re-mints an existing entry and NEVER falls back to another scope's
 * id. LAZY: storage is read/written only inside the functions — never at
 * module scope (SSR/jsdom-safe). Non-browser contexts (no sessionStorage)
 * fall back to a process-lifetime in-memory map — still mint-once per scope,
 * never a per-call id — so the hook's hydrated id and the transport's wire
 * header id always agree. NEVER throws.
 */

const TAB_ID_STORAGE_KEY = 'cl.ai-thread-tab-ids'

let ephemeralCounter = 0

/**
 * D3: in-memory fallback map for contexts WITHOUT sessionStorage (SSR,
 * storage-blocked, jsdom edge). BOTH consumers (the hook's resolve and the
 * transport's threadHeaders) call getThreadTabId, so with one module-level
 * map the hydrated thread id and the wire header id agree even with no
 * storage — the cycle-1 divergence (per-call ephemeral ids that never
 * matched) is closed.
 */
const memoryMap: Record<string, string> = {}

/**
 * Mint a fresh thread id. Uses `crypto.randomUUID()` when available; falls
 * back to a UUID-shaped string otherwise (jsdom/SSR without randomUUID).
 * NEVER throws.
 */
function mintThreadId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as { randomUUID?: () => string }).randomUUID === 'function') {
      return (crypto as { randomUUID: () => string }).randomUUID()
    }
  } catch {
    /* fall through to the non-crypto mint */
  }
  ephemeralCounter += 1
  return `cl-thread-${Date.now().toString(36)}-${ephemeralCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readTabIdMap(): Record<string, string> {
  try {
    if (typeof sessionStorage === 'undefined') return { ...memoryMap }
    const raw = sessionStorage.getItem(TAB_ID_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length > 0) out[k] = v
      }
      return out
    }
    return {}
  } catch {
    return { ...memoryMap }
  }
}

function writeTabIdMap(map: Record<string, string>): void {
  try {
    if (typeof sessionStorage === 'undefined') {
      // No storage: the module-level map keeps hook + transport converged
      // for the process lifetime (D3 closure; never throws).
      for (const [k, v] of Object.entries(map)) memoryMap[k] = v
      return
    }
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, JSON.stringify(map))
  } catch {
    for (const [k, v] of Object.entries(map)) memoryMap[k] = v
  }
}

/** The map key for a scope: "" for non-instance surfaces (the reserved case). */
function tabIdMapKey(scope: string | undefined): string {
  return scope && scope.length > 0 ? scope : ''
}

/**
 * Get the tab's thread id for a scope, minting it ONCE per (tab, scope).
 * Every subsequent call in the same tab returns the stored value (mint-once
 * — bait #7). Non-browser contexts (no sessionStorage) mint once into the
 * process-lifetime in-memory map and never throw. LAZY: this reads/writes
 * storage only when called — never at module scope (SSR-safe).
 */
export function getThreadTabId(scope?: string): string {
  const key = tabIdMapKey(scope)
  const map = readTabIdMap()
  const existing = map[key]
  if (typeof existing === 'string' && existing.length > 0) return existing
  const id = mintThreadId()
  map[key] = id
  writeTabIdMap(map)
  return id
}

/**
 * Select a specific thread id for the current scope (the picker's "switch to
 * a listed thread"). Persists the selection so a reload keeps it.
 */
export function setThreadTabId(scope: string | undefined, threadId: string): void {
  const map = readTabIdMap()
  map[tabIdMapKey(scope)] = threadId
  writeTabIdMap(map)
}

/**
 * Mint a FRESH thread id for the current scope ("New thread"): drops any
 * stored entry for the scope and returns the new id.
 */
export function newThreadTabId(scope?: string): string {
  const key = tabIdMapKey(scope)
  const map = readTabIdMap()
  const id = mintThreadId()
  map[key] = id
  writeTabIdMap(map)
  return id
}
