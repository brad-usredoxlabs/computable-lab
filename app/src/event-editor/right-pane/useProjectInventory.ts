/**
 * useProjectInventory — records to surface in the Find tab beyond the study's
 * artifacts and run tree.
 *
 * Two flavours of section:
 *  - `study` scope: the project's inventory — labware, aliquots, and materials
 *    that have been added to this study (and shared down to its runs as
 *    starting inventory). Filtered server-side by `studyId`.
 *  - `global` scope: reference libraries that aren't owned by a project —
 *    universal protocols and lab-specific protocols.
 *
 * Each row links out to the standalone record editor (see FindTabPanel).
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient, type InventoryUsageAnchor } from '../../shared/api/client'
import type { Labware } from '../../types/labware'
import type { AddMaterialDetails, PlateEvent } from '../../types/events'
import { getAddMaterialRef, parseMaterialLikeRef } from '../../types/events'

export interface InventoryRecord {
  recordId: string
  kind: string
  title: string
  /**
   * False when the row is shown for awareness but has no saved record to open
   * (e.g. a labware placed on the deck straight from the palette, with no
   * backing record yet). Such rows render disabled.
   */
  editable?: boolean
  /**
   * Experiment/run(s) this item is used in across the project. Present on
   * project-level usage items (from `useProjectUsage`); absent on studyId-linked
   * inventory records and live-deck items.
   */
  anchors?: InventoryUsageAnchor[]
}

export interface InventorySection {
  key: string
  label: string
  records: InventoryRecord[]
}

interface SectionDef {
  label: string
  kinds: string[]
  scope: 'study' | 'global'
}

// Order mirrors the user's mental model: project inventory first, then the
// reusable protocol libraries.
const SECTION_DEFS: SectionDef[] = [
  { label: 'Labwares', kinds: ['labware'], scope: 'study' },
  { label: 'Aliquots', kinds: ['aliquot'], scope: 'study' },
  { label: 'Materials', kinds: ['material', 'material-spec'], scope: 'study' },
  // Protocols are scoped to this project too — universal/lab protocols filed to
  // the study via links.studyId. (A global protocol search lives elsewhere.)
  { label: 'Universal protocols', kinds: ['protocol'], scope: 'study' },
  { label: 'Lab protocols', kinds: ['local-protocol'], scope: 'study' },
]

const PAGE = 200

function titleOf(payload: Record<string, unknown>, recordId: string): string {
  const name = typeof payload.name === 'string' ? payload.name : undefined
  const title = typeof payload.title === 'string' ? payload.title : undefined
  const displayName = typeof payload.display_name === 'string' ? payload.display_name : undefined
  return name || title || displayName || recordId
}

interface UseProjectInventoryResult {
  sections: InventorySection[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useProjectInventory(studyId: string): UseProjectInventoryResult {
  const [sections, setSections] = useState<InventorySection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all(
      SECTION_DEFS.map(async (def) => {
        const perKind = await Promise.all(
          def.kinds.map((kind) =>
            apiClient
              .listRecordsByKind(kind, PAGE, 0, def.scope === 'study' ? { studyId } : undefined)
              .then((res) =>
                res.records.map((env): InventoryRecord => {
                  const payload = (env.payload ?? {}) as Record<string, unknown>
                  return {
                    recordId: env.recordId,
                    kind: typeof payload.kind === 'string' ? payload.kind : kind,
                    title: titleOf(payload, env.recordId),
                  }
                }),
              )
              .catch(() => [] as InventoryRecord[]),
          ),
        )
        const records = perKind.flat().sort((a, b) => a.title.localeCompare(b.title))
        return { key: def.label, label: def.label, records }
      }),
    )
      .then((result) => {
        if (!cancelled) setSections(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [studyId])

  useEffect(() => {
    const dispose = load()
    return dispose
  }, [load])

  return { sections, loading, error, refresh: load }
}

/**
 * Labware placed on the live event-graph deck. These often aren't store records
 * filtered by studyId (they're embedded in the graph), so we surface them
 * directly. A labware carries a `sourceRecordId` only when it came from a saved
 * record — without one there's nothing to open, so the row is shown disabled.
 */
export function deckLabwareItems(labwares: Record<string, Labware>): InventoryRecord[] {
  return Object.values(labwares).map((lw) => ({
    recordId: lw.sourceRecordId ?? lw.labwareId,
    kind: 'labware',
    title: lw.name,
    editable: Boolean(lw.sourceRecordId),
  }))
}

/**
 * Materials referenced by add_material events on the live deck. Deduped by ref
 * id. Ontology refs (e.g. a CHEBI term) and record refs both open in the
 * record browser at /browser.
 */
export function deckMaterialItems(events: PlateEvent[]): InventoryRecord[] {
  const seen = new Map<string, InventoryRecord>()
  for (const event of events) {
    if (event.event_type !== 'add_material') continue
    const ref = parseMaterialLikeRef(getAddMaterialRef(event.details as AddMaterialDetails))
    if (!ref?.id || seen.has(ref.id)) continue
    seen.set(ref.id, {
      recordId: ref.id,
      kind: ref.kind === 'record' ? ref.type ?? 'material' : 'material',
      title: ref.label ?? ref.id,
      editable: true,
    })
  }
  return [...seen.values()]
}

/**
 * Merge extra items (project usage, live deck) into a section's records, deduped
 * by recordId. When an item is already present, its anchors are unioned in — so a
 * studyId-linked material that's also used in runs still shows where it's used.
 */
export function mergeInventoryItems(base: InventoryRecord[], extra: InventoryRecord[]): InventoryRecord[] {
  const byId = new Map(base.map((record) => [record.recordId, record]))
  for (const item of extra) {
    const existing = byId.get(item.recordId)
    if (!existing) {
      byId.set(item.recordId, item)
      continue
    }
    if (item.anchors?.length) {
      const merged = [...(existing.anchors ?? [])]
      for (const a of item.anchors) {
        if (!merged.some((m) => m.runId === a.runId)) merged.push(a)
      }
      byId.set(item.recordId, { ...existing, anchors: merged })
    }
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/** Is this ref an openable local record (vs. an ontology CURIE like CHEBI:5001)? */
function isOpenableRecordId(refId: string): boolean {
  return !/^[A-Za-z]+:/.test(refId)
}

interface UseProjectUsageResult {
  materials: InventoryRecord[]
  labwares: InventoryRecord[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Project-level material & labware usage aggregated across the project's runs'
 * event graphs (server-side, `GET /studies/:id/inventory-usage`). Each item
 * carries the experiment/run anchors it's used in. Merged into the Find tab's
 * Materials/Labwares sections so the project view shows run-embedded usage that
 * isn't a studyId-linked record.
 */
export function useProjectUsage(studyId: string): UseProjectUsageResult {
  const [materials, setMaterials] = useState<InventoryRecord[]>([])
  const [labwares, setLabwares] = useState<InventoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiClient
      .getStudyInventoryUsage(studyId)
      .then((res) => {
        if (cancelled) return
        const toRecord = (item: { refId: string; kind: string; title: string; anchors: InventoryUsageAnchor[] }): InventoryRecord => ({
          recordId: item.refId,
          kind: item.kind,
          title: item.title,
          editable: isOpenableRecordId(item.refId),
          anchors: item.anchors,
        })
        setMaterials(res.materials.map(toRecord))
        setLabwares(res.labwares.map(toRecord))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studyId])

  useEffect(() => {
    const dispose = load()
    return dispose
  }, [load])

  return { materials, labwares, loading, error, refresh: load }
}
