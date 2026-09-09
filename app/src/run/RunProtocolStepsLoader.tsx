/**
 * RunProtocolStepsLoader — eagerly publish a run's protocol step CONCEPTS to
 * the shared ProtocolSelectionContext so the left navigation rail is usable
 * the moment a run loads, without depending on the Protocol tab being open.
 *
 * This is the harness's "extract navigation from ProtocolTabPanel" piece
 * (plan §9): the run → plannedRunRef → protocolRef → steps resolution that
 * ProtocolTabPanel does lazily, hoisted so the nav rail shares one source of
 * truth. ProtocolTabPanel may still re-fetch for its own detail needs; this
 * loader only guarantees the CONCEPT list (stepId/label/ordinal) is present.
 */

import { useEffect } from 'react'
import { apiClient } from '../shared/api/client'
import { useProtocolSelection } from '../event-editor/protocol/ProtocolSelectionContext'
import type { ProtocolStepSummary } from '../event-editor/protocol/ProtocolSelectionContext'

export interface RunProtocolStepsLoaderProps {
  runId: string
}

/** Resolve run → plannedRunRef (PLR) → protocolRef → protocol record. */
async function resolveRunProtocolId(runId: string): Promise<string | null> {
  try {
    const runEnv = await apiClient.getRecord(runId)
    const rp = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
    const plr = rp?.plannedRunRef as { id?: string } | undefined
    if (!plr?.id) return null
    const plrEnv = await apiClient.getRecord(plr.id)
    const pp = (plrEnv?.payload ?? plrEnv) as Record<string, unknown> | null
    const protoRef = (pp?.protocolRef ?? pp?.sourceRef) as { id?: string; kind?: string } | undefined
    if (typeof protoRef?.id !== 'string') return null
    const kind = typeof protoRef.kind === 'string' ? protoRef.kind : (pp?.kind as string | undefined)
    if (kind === 'local-protocol') {
      try {
        const lpEnv = await apiClient.getRecord(protoRef.id)
        const lp = (lpEnv?.payload ?? lpEnv) as Record<string, unknown> | null
        const inh = lp?.inherits_from as { id?: string } | undefined
        if (typeof inh?.id === 'string') return inh.id
      } catch {
        // fall through — return the local id; caller falls back to run id
      }
    }
    return protoRef.id
  } catch {
    return null
  }
}

export function RunProtocolStepsLoader({ runId }: RunProtocolStepsLoaderProps) {
  const sel = useProtocolSelection()

  useEffect(() => {
    let cancelled = false
    const doLoad = async () => {
      const stepsId = (await resolveRunProtocolId(runId)) ?? runId
      if (cancelled) return
      try {
        const res = await fetch(`/api/protocols/${encodeURIComponent(stepsId)}/steps`)
        if (!res.ok) return
        const data = await res.json() as Record<string, unknown>
        if (cancelled) return
        const raw = (data.steps ?? data ?? []) as Array<Record<string, unknown>>
        const steps: ProtocolStepSummary[] = raw
          .map((s, i) => ({
            stepId: (s.stepId as string) ?? `step-${i}`,
            label: (s.label as string) ?? (s.description as string) ?? `Step ${(s.ordinal as number) ?? i + 1}`,
            ordinal: (s.ordinal as number) ?? i + 1,
          }))
          .filter((s) => s)
        // Publish non-empty steps idempotently. We NEVER clear the shared
        // list here, so a racing ProtocolTabPanel that drops it can't blank
        // the rail — this loader is the nav's source of truth on load.
        if (steps.length > 0) {
          sel?.setSteps(steps)
          sel?.setVisibleSteps(steps.map((s) => s.stepId))
        }
      } catch {
        // loader is best-effort — ProtocolTabPanel covers fallbacks
      }
    }
    void doLoad()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  return null
}