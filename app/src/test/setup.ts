import '@testing-library/jest-dom/vitest';

/**
 * Storage shim. jsdom only defines `window.localStorage` for a real origin, and
 * Node's own experimental `localStorage` global is `undefined` unless launched
 * with --localstorage-file — one of the two leaves every storage-backed unit
 * test (tab store, recent store, pane sizes) failing with
 * "Cannot read properties of undefined". Install an in-memory Storage when the
 * environment does not provide one.
 */
function installMemoryStorage(): void {
  if (typeof window === 'undefined') return
  let hasStorage = false
  try {
    hasStorage = Boolean(window.localStorage)
  } catch {
    hasStorage = false
  }
  if (hasStorage) return
  const store = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(window, 'localStorage', { value: memory, configurable: true })
  Object.defineProperty(window, 'sessionStorage', { value: memory, configurable: true })
}
installMemoryStorage();

// jsdom doesn't implement elementFromPoint/caretRangeFromPoint, but the
// TipTap @ProseMirror viewport-tracking plugin (used by the Placeholder
// extension under @tiptap/extensions 3.x) calls them during mount. The
// no-op stubs let editor-bearing components mount in tests without
// affecting any real layout behaviour we care about asserting.
if (typeof document !== 'undefined') {
  if (typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = () => null
  }
  if (typeof (document as Document & { caretRangeFromPoint?: unknown }).caretRangeFromPoint !== 'function') {
    (document as Document & { caretRangeFromPoint: () => null }).caretRangeFromPoint = () => null
  }
}
