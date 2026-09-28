/**
 * Wiring factory for the release path: constructs the ReportReleaser graph
 * (ArtifactClient + EvidenceBuilder + OutboundMinter + OutboundPusher) from
 * explicit config. Construction performs NO network I/O — clients are lazy.
 *
 * Hard boundary (principles §7/§9): every config field is REQUIRED and
 * validated — no baked URL, no baked token, no default policy path. A
 * missing field throws naming the key, never silently defaults.
 */
import type { RecordStore } from '../store/types.js'
import type { RepoAdapter } from '../repo/types.js'
import { ArtifactClient } from './ArtifactClient.js'
import { LabSyncClient } from './LabSyncClient.js'
import { EvidenceBuilder, loadEvidencePolicy } from './evidence/build.js'
import { OutboundMinter } from './outbound/mint.js'
import { OutboundPusher } from './outbound/push.js'
import { ReportReleaser } from './outbound/release.js'

export interface LabSyncReleaseWiring {
  store: RecordStore
  repo: RepoAdapter
}

/**
 * Declared optional at the type level so callers assembling config from
 * env/YAML compile; every field is REQUIRED at runtime (throws on absence).
 */
export interface ReleaseWiringConfig {
  baseUrl?: string
  token?: string
  evidencePolicyPath?: string
}

function requireConfig(value: string | undefined, key: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `lab-sync release wiring: config.${key} is required — no defaults are baked (principles §7/§9)`,
    )
  }
  return value
}

export function createReportReleaser(
  deps: LabSyncReleaseWiring & { config: ReleaseWiringConfig },
): ReportReleaser {
  const { store, repo } = deps
  const baseUrl = requireConfig(deps.config.baseUrl, 'baseUrl')
  const token = requireConfig(deps.config.token, 'token')
  const evidencePolicyPath = requireConfig(deps.config.evidencePolicyPath, 'evidencePolicyPath')

  const now = (): Date => new Date()
  const policy = loadEvidencePolicy(evidencePolicyPath)

  /**
   * Git provenance per record: most kinds live flat under records/{kind}/.
   * On ANY failure return [] — an empty source_revisions beats a failed
   * release (provenance is metadata, not evidence substance).
   */
  const gitLog = async (recordId: string): Promise<string[]> => {
    try {
      const envelope = await store.get(recordId)
      const kind = (envelope?.payload as { kind?: string } | undefined)?.kind
      if (typeof kind !== 'string' || kind.length === 0) return []
      const history = await repo.getHistory({ path: `records/${kind}/${recordId}.yaml` })
      return history.map((commit) => commit.sha)
    } catch {
      return []
    }
  }

  const artifacts = new ArtifactClient({ baseUrl, token })
  const evidence = new EvidenceBuilder({ store, policy, gitLog, now })
  const minter = new OutboundMinter({ store, now })
  const pusher = new OutboundPusher({ store, transport: new LabSyncClient({ baseUrl, token }) })

  return new ReportReleaser({ store, minter, pusher, evidence, artifacts, now })
}
