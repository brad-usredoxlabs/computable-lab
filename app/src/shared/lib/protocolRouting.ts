import { apiClient } from '../api/client'

/**
 * Resolve where a picked protocol should send the user. When the protocol
 * belongs to a project (payload.links.studyId), return the project homepage
 * route so the project's find content (experiments/runs/artifacts) is shown.
 * Otherwise return the provided fallback (the protocol's lab detail route).
 */
export async function resolveProtocolPick(
  recordId: string,
  fallback: string,
): Promise<{ route: string; kind: 'project' | 'lab'; studyId?: string }> {
  try {
    const env = await apiClient.getRecord(recordId)
    const payload = env?.payload as { links?: { studyId?: string } } | undefined
    const studyId = payload?.links?.studyId
    if (studyId) return { route: `/project/${studyId}`, kind: 'project', studyId }
  } catch {
    // fall through to fallback
  }
  return { route: fallback, kind: 'lab' }
}

/** True if a record `kind` is a protocol. */
export function isProtocolKind(kind: string): boolean {
  return kind === 'protocol' || kind === 'local-protocol'
}
