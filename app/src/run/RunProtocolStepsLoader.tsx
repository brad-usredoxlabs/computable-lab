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

import { useEffect, useState } from 'react'
import { apiClient } from '../shared/api/client'
import { useProtocolSelection } from '../event-editor/protocol/ProtocolSelectionContext'
import type { LabwareBindingMap, ProtocolStepSummary } from '../event-editor/protocol/ProtocolSelectionContext'
import { protocolResourceSummaries } from '../event-editor/right-pane/protocol/protocolStepEditing'

export interface RunProtocolStepsLoaderProps {
  runId: string
}

/** The run's attached protocol: what to name/identify it by, and where its steps live. */
interface ResolvedRunProtocol {
  /** The ATTACHED protocol (LPR when the run is specialized). */
  attachedId: string
  /** Protocol record the STEPS are read from (the inherited universal for an LPR). */
  stepsId: string
  /** Ref label from the PLR — the display fallback until the record lands. */
  label: string | null
  /** Current content sha of the ATTACHED record (protocol_edit staleness anchor). */
  sha?: string
  /** roleId → concrete bound instance from the PLR's `bindings.labware`
   *  (read-only display, PROTO-AI-10). Empty when the run binds nothing. */
  labwareBindings: LabwareBindingMap
}

/** Read a `core/datatypes/ref.schema.yaml` node (or bare id string) into a
 *  minimal `{ id, label? }` — null when it names no concrete instance. */
function refIdentity(value: unknown): { id: string; label?: string } | null {
  if (typeof value === 'string') {
    const id = value.trim()
    return id ? { id } : null
  }
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id.trim()) return null
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : undefined
  return label ? { id: r.id.trim(), label } : { id: r.id.trim() }
}

/**
 * Join the planned-run's `bindings.labware` ($defs/LabwareBinding) into a
 * roleId → { instanceRef, geometryRef? } map. Zero guessing: an entry without
 * a `labwareInstanceRef` binds no concrete instance and publishes nothing;
 * two roles bound to different instances of the same design stay distinct.
 */
function labwareBindingsFromPayload(pp: Record<string, unknown>): LabwareBindingMap {
  const bindings = (pp.bindings as Record<string, unknown> | undefined)?.labware
  if (!Array.isArray(bindings)) return {}
  const map: LabwareBindingMap = {}
  for (const entry of bindings as Array<Record<string, unknown> | null>) {
    if (!entry || typeof entry !== 'object') continue
    const roleId = typeof entry.roleId === 'string' ? entry.roleId.trim() : ''
    if (!roleId) continue
    const instanceRef = refIdentity(entry.labwareInstanceRef)
    if (!instanceRef) continue
    const geometryRef = refIdentity(entry.labwareGeometryRef)
    map[roleId] = geometryRef ? { instanceRef, geometryRef } : { instanceRef }
  }
  return map
}

/** Resolve run → plannedRunRef (PLR) → protocolRef → protocol record. */
async function resolveRunProtocol(runId: string): Promise<ResolvedRunProtocol | null> {
  try {
    const runEnv = await apiClient.getRecord(runId)
    const rp = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
    const plr = rp?.plannedRunRef as { id?: string } | undefined
    if (!plr?.id) return null
    const plrEnv = await apiClient.getRecord(plr.id)
    const pp = (plrEnv?.payload ?? plrEnv) as Record<string, unknown> | null
    // The PLR payload is in hand exactly here — its `bindings.labware` say
    // WHICH concrete plate this run bound to each declared role (PROTO-AI-10).
    const labwareBindings = pp ? labwareBindingsFromPayload(pp) : {}
    const protoRef = (pp?.protocolRef ?? pp?.sourceRef) as { id?: string; kind?: string; label?: string } | undefined
    if (typeof protoRef?.id !== 'string') return null
    const attachedId = protoRef.id
    const label = typeof protoRef.label === 'string' ? protoRef.label : null
    const kind = typeof protoRef.kind === 'string' ? protoRef.kind : (pp?.kind as string | undefined)
    if (kind === 'local-protocol') {
      try {
        const lpEnv = await apiClient.getRecord(attachedId)
        const lp = (lpEnv?.payload ?? lpEnv) as Record<string, unknown> | null
        const inh = lp?.inherits_from as { id?: string } | undefined
        const lpSha = (lpEnv as { meta?: { contentSha?: string; commitSha?: string } } | undefined)?.meta?.contentSha
          ?? (lpEnv as { meta?: { commitSha?: string } } | undefined)?.meta?.commitSha
        if (typeof inh?.id === 'string') {
          return { attachedId, stepsId: inh.id, label, labwareBindings, ...(lpSha ? { sha: lpSha } : {}) }
        }
        return { attachedId, stepsId: attachedId, label, labwareBindings, ...(lpSha ? { sha: lpSha } : {}) }
      } catch {
        // fall through — an LPR without a resolvable parent still shows steps
        // by its own id, and the identity is still the local protocol.
      }
    }
    return { attachedId, stepsId: attachedId, label, labwareBindings }
  } catch {
    return null
  }
}

export function RunProtocolStepsLoader({ runId }: RunProtocolStepsLoaderProps) {
  const sel = useProtocolSelection()
  // Bumped when a protocol is attached to this run (ProtocolSelector dispatches
  // 'cl:records-changed'), so the rail refills instead of staying empty.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const onRecordsChanged = () => setRefreshKey((n) => n + 1)
    window.addEventListener('cl:records-changed', onRecordsChanged)
    return () => window.removeEventListener('cl:records-changed', onRecordsChanged)
  }, [])

  useEffect(() => {
    let cancelled = false
    const doLoad = async () => {
      const resolved = await resolveRunProtocol(runId)
      const stepsId = resolved?.stepsId ?? runId
      if (cancelled) return
      // Publish WHICH protocol this run executes (the nav rail names it on
      // hover with the record's provenance) before the step fetch, so the rail
      // has an identity even if the steps call is slow or fails.
      sel?.setProtocol(
        resolved
          ? {
              recordId: resolved.attachedId,
              ...(resolved.label ? { title: resolved.label } : {}),
              ...(resolved.sha ? { sha: resolved.sha } : {}),
            }
          : null,
      )
      // Publish WHICH concrete instances this run bound (roleId → instance,
      // read-only) exactly when the run re-resolves — an empty map resets
      // stale labels on every runId/protocol switch, regardless of whether
      // the step/resource fetches below succeed (PROTO-AI-10).
      sel?.setLabwareBindings(resolved?.labwareBindings ?? {})
      try {
        // What the assay NEEDS (declared labware / equipment roles) comes from
        // the protocol record, not the steps endpoint — publish it alongside the
        // steps so the rail's resource sections are filled on load too.
        void (async () => {
          try {
            const env = await apiClient.getRecord(stepsId)
            if (cancelled) return
            const payload = ((env as { payload?: unknown })?.payload ?? env) as Record<string, unknown>
            sel?.setResources(protocolResourceSummaries(payload))
            // The attached record's content sha rides in the identity once the
            // record lands (protocol_edit staleness anchor, PROTO-AI-6). Only
            // when the STEPS record IS the attached record (universal attach);
            // the LPR branch captured its own sha in resolveRunProtocol.
            const meta = (env as { meta?: { contentSha?: string; commitSha?: string } })?.meta
            const sha = resolved && stepsId === resolved.attachedId
              ? meta?.contentSha ?? meta?.commitSha
              : undefined
            if (resolved && sha) {
              sel?.setProtocol({
                recordId: resolved.attachedId,
                ...(resolved.label ? { title: resolved.label } : {}),
                sha,
              })
            }
          } catch {
            // best-effort: the rail simply shows no resource sections
          }
        })()

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
            ...(typeof s.description === 'string' && (s.description as string).trim()
              ? { description: s.description as string }
              : {}),
            ...(typeof s.kind === 'string' && s.kind ? { kind: s.kind } : {}),
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
  }, [runId, refreshKey])

  return null
}