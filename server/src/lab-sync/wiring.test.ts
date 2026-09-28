/**
 * wiring.ts factory tests — construction must be pure (no network) and every
 * config field is REQUIRED: missing baseUrl/token/policy path throw naming the
 * missing key. No baked defaults (principles §7/§9 hard boundary).
 */
import { describe, it, expect } from 'vitest'
import type { RecordStore } from '../store/types.js'
import type { RepoAdapter } from '../repo/types.js'
import { ReportReleaser } from './outbound/release.js'
import { createReportReleaser } from './wiring.js'

const POLICY_PATH = new URL('../../../config/lab-sync/evidence.yaml', import.meta.url).pathname

const stubStore = {
  async get() {
    return null
  },
  async list() {
    return []
  },
} as unknown as RecordStore

const stubRepo = {
  async getHistory(): Promise<never[]> {
    throw new Error('network should never be touched at construction time')
  },
} as unknown as RepoAdapter

describe('createReportReleaser', () => {
  it('constructs a ReportReleaser from complete config without touching the network', () => {
    const releaser = createReportReleaser({
      store: stubStore,
      repo: stubRepo,
      config: { baseUrl: 'https://test-your-food.com', token: 'tok-from-config', evidencePolicyPath: POLICY_PATH },
    })
    expect(releaser).toBeInstanceOf(ReportReleaser)
  })

  it('throws naming baseUrl when missing or blank (never a default URL)', () => {
    expect(() =>
      createReportReleaser({
        store: stubStore,
        repo: stubRepo,
        config: { token: 'tok', evidencePolicyPath: POLICY_PATH },
      }),
    ).toThrow(/baseUrl/)
    expect(() =>
      createReportReleaser({
        store: stubStore,
        repo: stubRepo,
        config: { baseUrl: '   ', token: 'tok', evidencePolicyPath: POLICY_PATH },
      }),
    ).toThrow(/baseUrl/)
  })

  it('throws naming token when missing or blank (never a baked token)', () => {
    expect(() =>
      createReportReleaser({
        store: stubStore,
        repo: stubRepo,
        config: { baseUrl: 'https://x.test', evidencePolicyPath: POLICY_PATH },
      }),
    ).toThrow(/token/)
    expect(() =>
      createReportReleaser({
        store: stubStore,
        repo: stubRepo,
        config: { baseUrl: 'https://x.test', token: '', evidencePolicyPath: POLICY_PATH },
      }),
    ).toThrow(/token/)
  })

  it('throws naming evidencePolicyPath when missing (policy is data, not code)', () => {
    expect(() =>
      createReportReleaser({
        store: stubStore,
        repo: stubRepo,
        config: { baseUrl: 'https://x.test', token: 'tok' },
      }),
    ).toThrow(/evidencePolicyPath/)
  })
})
