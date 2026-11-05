/**
 * LEG2a — declared-set predicate pins. The declared set is always the
 * argument (never a hardcoded pair); fail-closed on unexpected shapes.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'

type LockApi = typeof import('./lifecycleLock')
const spec = './lifecycleLock' // variable specifier: per-test RED failures, no collection crash
const load = (): Promise<LockApi> => import(spec)

describe('P-a: isContentLocked locks only the PASSED set', () => {
  it('a set that does NOT contain the legacy pair: member true, legacy states false', async () => {
    const { isContentLocked } = await load()
    expect(isContentLocked({ state: 'archived' }, ['archived'])).toBe(true)
    expect(isContentLocked({ state: 'approved' }, ['archived'])).toBe(false) // THE pin
    expect(isContentLocked({ state: 'effective' }, ['archived'])).toBe(false)
  })
})

describe('P-b: isRecordWriteLocked — content OR terminal', () => {
  it('true when state is in terminalStates but not in contentLockedStates', async () => {
    const { isRecordWriteLocked } = await load()
    expect(isRecordWriteLocked({ state: 'closed' }, [], ['closed'])).toBe(true)
    expect(isRecordWriteLocked({ state: 'archived' }, ['archived'], [])).toBe(true)
    expect(isRecordWriteLocked({ state: 'open' }, ['archived'], ['closed'])).toBe(false)
  })
})

describe('P-c: fail-closed — null payload / non-string state / empty set', () => {
  it('false everywhere, no throw', async () => {
    const { isContentLocked, isRecordWriteLocked } = await load()
    expect(isContentLocked(null, ['x'])).toBe(false)
    expect(isContentLocked(undefined, ['x'])).toBe(false)
    expect(isContentLocked({ state: 42 }, ['42'])).toBe(false)
    expect(isContentLocked({ state: { n: 1 } }, ['x'])).toBe(false)
    expect(isContentLocked({}, ['x'])).toBe(false)
    expect(isContentLocked({ state: 'x' }, [])).toBe(false)
    expect(isRecordWriteLocked(null, ['x'], ['y'])).toBe(false)
    expect(isRecordWriteLocked(undefined, ['x'], ['y'])).toBe(false)
    expect(isRecordWriteLocked({ state: 0 }, ['0'], ['0'])).toBe(false)
    expect(isRecordWriteLocked({ state: 'x' }, [], [])).toBe(false)
  })
})

describe('P-d: source pin — no legacy state literals in lifecycleLock.ts', () => {
  let moduleSource: string | null = null
  try {
    moduleSource = readFileSync(resolve(process.cwd(), 'src/shared/records/lifecycleLock.ts'), 'utf8')
  } catch (error) {
    console.warn(`LEG2a P-d LOUD SKIP: lifecycleLock.ts unreadable: ${String(error)}`)
  }

  it.skipIf(moduleSource === null)('contains no approved/effective literal (skipped LOUD when unreadable)', () => {
    expect(moduleSource).not.toMatch(/['"`](approved|effective)['"`]/)
  })
})

describe('P-e: apiClient.getLifecycleContentLockedStates', () => {
  const fetchSpy = vi.fn()
  const jsonResponse = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: '', json: async () => body }) as Response

  beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal('fetch', fetchSpy) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('[] on 404; parsed contentLockedStates from the transitions endpoint otherwise', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: 'Not Found' }))
    expect(await apiClient.getLifecycleContentLockedStates('missing')).toEqual([])
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      transitions: [],
      terminalStates: ['closed'],
      contentLockedStates: ['archived', 'on-hold'],
    }))
    expect(await apiClient.getLifecycleContentLockedStates('lc-1')).toEqual(['archived', 'on-hold'])
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('/lifecycle/lc-1/transitions')
  })
})
